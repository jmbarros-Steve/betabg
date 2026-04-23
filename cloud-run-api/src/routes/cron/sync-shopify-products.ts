import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

const SHOPIFY_API_VERSION = '2026-04';
const PAGE_SIZE = 250;
const MAX_PAGES_PER_SHOP = 20;
const FETCH_TIMEOUT_MS = 30_000;
const PAGE_SLEEP_MS = 500; // Shopify rate limit: 2 req/s default
const UPSERT_CHUNK_SIZE = 500;
const LOCK_TTL_MINUTES = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ShopifyProductRaw {
  id: number;
  title: string;
  handle: string;
  status: string;
  vendor?: string;
  product_type?: string;
  body_html?: string;
  tags?: string;
  variants?: Array<{
    id: number;
    title: string;
    sku: string;
    price: string;
    inventory_quantity: number | null;
    inventory_item_id: number | null;
  }>;
  images?: Array<{ id: number; src: string; alt?: string }>;
  created_at?: string;
  updated_at?: string;
}

interface SyncRow {
  client_id: string;
  shop_domain: string;
  shopify_product_id: string;
  title: string;
  description: string;
  vendor: string;
  product_type: string;
  handle: string;
  status: string;
  tags: string[];
  image_url: string | null;
  images: unknown;
  variants: unknown;
  price_min: number;
  price_max: number;
  inventory_total: number;
  synced_at: string;
}

async function fetchNextLink(url: string, token: string): Promise<{ products: ShopifyProductRaw[]; nextUrl: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
    }

    const { products }: { products: ShopifyProductRaw[] } = await res.json();

    // Shopify paginación via Link header: <url>; rel="next"
    const linkHeader = res.headers.get('link') || res.headers.get('Link');
    let nextUrl: string | null = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) nextUrl = match[1];
    }

    return { products: products || [], nextUrl };
  } finally {
    clearTimeout(t);
  }
}

function mapProduct(p: ShopifyProductRaw, clientId: string, shopDomain: string): SyncRow {
  const variants = p.variants || [];
  const prices = variants
    .map((v) => parseFloat(v.price))
    .filter((n) => !isNaN(n) && n >= 0);
  const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
  const priceMax = prices.length > 0 ? Math.max(...prices) : 0;
  const inventoryTotal = variants.reduce(
    (sum, v) => sum + (typeof v.inventory_quantity === 'number' ? v.inventory_quantity : 0),
    0,
  );

  const tags = (p.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    client_id: clientId,
    shop_domain: shopDomain,
    shopify_product_id: String(p.id),
    title: p.title || '',
    description: p.body_html || '',
    vendor: p.vendor || '',
    product_type: p.product_type || '',
    handle: p.handle || '',
    status: p.status || '',
    tags,
    image_url: p.images?.[0]?.src || null,
    images: p.images || [],
    variants,
    price_min: priceMin,
    price_max: priceMax,
    inventory_total: inventoryTotal,
    synced_at: new Date().toISOString(),
  };
}

/**
 * Cron: sync Shopify products for all active connections.
 * Schedule: every 6 hours. Auth: X-Cron-Secret header.
 * Tolerates per-client failures; returns aggregate counts + per-client status.
 */
export async function syncShopifyProducts(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();

  // Mutex via steve_knowledge (mismo patrón que sync-all-metrics)
  const lockKey = 'cron_lock_sync_shopify_products';
  const { data: lockRow } = await supabase
    .from('steve_knowledge')
    .select('id, contenido')
    .eq('categoria', 'system')
    .eq('titulo', lockKey)
    .maybeSingle();

  const now = new Date();
  if (lockRow) {
    const lockedAt = new Date(lockRow.contenido || '');
    const ageMin = (now.getTime() - lockedAt.getTime()) / 60000;
    if (ageMin < LOCK_TTL_MINUTES) {
      console.log(`[cron] sync-shopify-products locked ${Math.round(ageMin)}min ago, skipping`);
      return c.json({ skipped: true, reason: 'Another run in progress' });
    }
  }

  const { error: lockErr } = await supabase.from('steve_knowledge').upsert(
    { categoria: 'system', titulo: lockKey, contenido: now.toISOString(), activo: true, orden: 0 },
    { onConflict: 'categoria,titulo' },
  );
  if (lockErr) {
    console.error('[cron] failed to acquire shopify products lock:', lockErr);
    return c.json({ error: 'Failed to acquire lock' }, 500);
  }

  try {
    const { data: connections, error: connErr } = await supabase
      .from('platform_connections')
      .select('id, client_id, shop_domain, store_url, access_token_encrypted')
      .eq('platform', 'shopify')
      .eq('is_active', true);

    if (connErr) {
      console.error('[cron] failed to fetch shopify connections:', connErr);
      return c.json({ error: 'Failed to fetch connections' }, 500);
    }

    const results: Array<{ client_id: string; shop_domain: string; status: 'success' | 'error' | 'skipped'; synced?: number; error?: string }> = [];
    let totalSyncedProducts = 0;

    for (const conn of connections || []) {
      const shopDomain = conn.shop_domain || (conn.store_url ? conn.store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '');

      if (!conn.access_token_encrypted || !shopDomain) {
        results.push({ client_id: conn.client_id, shop_domain: shopDomain, status: 'skipped', error: 'missing token or shop_domain' });
        continue;
      }

      try {
        const { data: decryptedToken, error: decErr } = await supabase.rpc('decrypt_platform_token', {
          encrypted_token: conn.access_token_encrypted,
        });

        if (decErr || !decryptedToken) {
          results.push({ client_id: conn.client_id, shop_domain: shopDomain, status: 'error', error: 'token decrypt failed' });
          continue;
        }

        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const fields = 'id,title,handle,status,vendor,product_type,body_html,tags,variants,images,created_at,updated_at';
        let nextUrl: string | null = `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${PAGE_SIZE}&fields=${fields}`;

        const allProducts: ShopifyProductRaw[] = [];
        let pageCount = 0;
        while (nextUrl && pageCount < MAX_PAGES_PER_SHOP) {
          if (pageCount > 0) await sleep(PAGE_SLEEP_MS);
          const { products, nextUrl: nu } = await fetchNextLink(nextUrl, decryptedToken);
          allProducts.push(...products);
          nextUrl = nu;
          pageCount += 1;
        }

        if (pageCount === MAX_PAGES_PER_SHOP && nextUrl) {
          console.warn(`[cron] ${cleanDomain} hit MAX_PAGES_PER_SHOP=${MAX_PAGES_PER_SHOP}, truncated`);
        }

        if (allProducts.length === 0) {
          results.push({ client_id: conn.client_id, shop_domain: cleanDomain, status: 'success', synced: 0 });
          continue;
        }

        const rows = allProducts.map((p) => mapProduct(p, conn.client_id, cleanDomain));

        // Chunk upserts to avoid PostgREST payload/timeout limits on large shops
        let upsertFailed = false;
        let upsertErrorMsg = '';
        for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
          const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
          const { error: upsertErr } = await supabase
            .from('shopify_products')
            .upsert(chunk, { onConflict: 'client_id,shopify_product_id' });
          if (upsertErr) {
            console.error(`[cron] upsert chunk ${i}-${i + chunk.length} failed for ${cleanDomain}:`, upsertErr);
            upsertFailed = true;
            upsertErrorMsg = upsertErr.message;
            break;
          }
        }

        if (upsertFailed) {
          results.push({ client_id: conn.client_id, shop_domain: cleanDomain, status: 'error', error: `upsert: ${upsertErrorMsg}` });
          continue;
        }

        totalSyncedProducts += rows.length;
        results.push({ client_id: conn.client_id, shop_domain: cleanDomain, status: 'success', synced: rows.length });
        console.log(`[cron] ${cleanDomain}: synced ${rows.length} products`);
      } catch (err: any) {
        console.error(`[cron] ${shopDomain} failed:`, err.message);
        results.push({ client_id: conn.client_id, shop_domain: shopDomain, status: 'error', error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    console.log(`[cron] sync-shopify-products done: ${succeeded} ok, ${failed} err, ${skipped} skip, ${totalSyncedProducts} products`);

    const allFailed = (connections?.length || 0) > 0 && succeeded === 0 && failed > 0;
    return c.json(
      {
        synced_clients: succeeded,
        synced_products: totalSyncedProducts,
        errors: failed,
        skipped,
        total_connections: connections?.length || 0,
        results,
      },
      allFailed ? 500 : 200,
    );
  } finally {
    await supabase.from('steve_knowledge').delete().eq('categoria', 'system').eq('titulo', lockKey);
  }
}
