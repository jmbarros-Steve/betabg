import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

const SHOPIFY_API_VERSION = '2026-04';
const PAGE_SIZE = 250;
const MAX_PAGES_PER_SHOP = 40;
const FETCH_TIMEOUT_MS = 30_000;
const PAGE_SLEEP_MS = 500;
const UPSERT_CHUNK_SIZE = 200;
const LOCK_TTL_MINUTES = 30;
const FIRST_RUN_LOOKBACK_DAYS = 365; // backfill 1 año en primera corrida

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ShopifyOrderRaw {
  id: number;
  order_number?: number;
  name?: string;
  email?: string;
  customer?: {
    id?: number;
    email?: string;
    first_name?: string;
    last_name?: string;
  } | null;
  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  shipping_lines?: Array<{ price?: string }>;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  source_name?: string;
  referring_site?: string;
  landing_site?: string;
  note_attributes?: Array<{ name: string; value: string }>;
  shipping_address?: {
    country?: string;
    country_code?: string;
    city?: string;
    province?: string;
    [k: string]: unknown;
  } | null;
  billing_address?: Record<string, unknown> | null;
  line_items?: Array<{
    id?: number;
    product_id?: number;
    variant_id?: number;
    sku?: string;
    name?: string;
    title?: string;
    quantity?: number;
    price?: string;
    total_discount?: string;
  }>;
  tags?: string;
  created_at?: string;
  updated_at?: string;
  processed_at?: string;
}

interface OrderRow {
  client_id: string;
  connection_id: string;
  shop_domain: string;
  shopify_order_id: string;
  order_number: number | null;
  order_name: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  total_price: number;
  subtotal_price: number;
  total_tax: number;
  total_discounts: number;
  shipping_price: number;
  currency: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  source_name: string | null;
  referring_site: string | null;
  landing_site: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  shipping_country: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_address: unknown;
  billing_address: unknown;
  line_items: unknown;
  tags: string[];
  created_at_shop: string;
  updated_at_shop: string | null;
  processed_at_shop: string | null;
  synced_at: string;
}

function n(s: string | undefined | null): number {
  if (!s) return 0;
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function extractUtm(landingSite: string | undefined, noteAttrs: Array<{ name: string; value: string }> | undefined) {
  const utm = { source: null as string | null, medium: null as string | null, campaign: null as string | null, term: null as string | null, content: null as string | null };
  if (landingSite) {
    try {
      const url = new URL(landingSite, 'https://placeholder.local');
      const sp = url.searchParams;
      utm.source = sp.get('utm_source') || null;
      utm.medium = sp.get('utm_medium') || null;
      utm.campaign = sp.get('utm_campaign') || null;
      utm.term = sp.get('utm_term') || null;
      utm.content = sp.get('utm_content') || null;
    } catch { /* invalid url, skip */ }
  }
  for (const attr of noteAttrs || []) {
    const k = (attr.name || '').toLowerCase();
    if (k === 'utm_source' && !utm.source) utm.source = attr.value;
    if (k === 'utm_medium' && !utm.medium) utm.medium = attr.value;
    if (k === 'utm_campaign' && !utm.campaign) utm.campaign = attr.value;
    if (k === 'utm_term' && !utm.term) utm.term = attr.value;
    if (k === 'utm_content' && !utm.content) utm.content = attr.value;
  }
  return utm;
}

function mapOrder(o: ShopifyOrderRaw, clientId: string, connectionId: string, shopDomain: string): OrderRow {
  const utm = extractUtm(o.landing_site, o.note_attributes);
  const shippingPrice = n(o.total_shipping_price_set?.shop_money?.amount) || (o.shipping_lines || []).reduce((s, l) => s + n(l.price), 0);
  const tags = (o.tags || '').split(',').map((t) => t.trim()).filter(Boolean);

  return {
    client_id: clientId,
    connection_id: connectionId,
    shop_domain: shopDomain,
    shopify_order_id: String(o.id),
    order_number: o.order_number ?? null,
    order_name: o.name ?? null,
    customer_id: o.customer?.id ? String(o.customer.id) : null,
    customer_email: o.customer?.email || o.email || null,
    customer_first_name: o.customer?.first_name || null,
    customer_last_name: o.customer?.last_name || null,
    total_price: n(o.total_price),
    subtotal_price: n(o.subtotal_price),
    total_tax: n(o.total_tax),
    total_discounts: n(o.total_discounts),
    shipping_price: shippingPrice,
    currency: o.currency || null,
    financial_status: o.financial_status || null,
    fulfillment_status: o.fulfillment_status || null,
    cancelled_at: o.cancelled_at || null,
    cancel_reason: o.cancel_reason || null,
    source_name: o.source_name || null,
    referring_site: o.referring_site || null,
    landing_site: o.landing_site || null,
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_term: utm.term,
    utm_content: utm.content,
    shipping_country: o.shipping_address?.country_code || o.shipping_address?.country || null,
    shipping_city: o.shipping_address?.city || null,
    shipping_province: o.shipping_address?.province || null,
    shipping_address: o.shipping_address ?? null,
    billing_address: o.billing_address ?? null,
    line_items: o.line_items ?? [],
    tags,
    created_at_shop: o.created_at || new Date().toISOString(),
    updated_at_shop: o.updated_at || null,
    processed_at_shop: o.processed_at || null,
    synced_at: new Date().toISOString(),
  };
}

async function fetchPage(url: string, token: string): Promise<{ orders: ShopifyOrderRaw[]; nextUrl: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
    }
    const { orders } = (await res.json()) as { orders: ShopifyOrderRaw[] };
    const linkHeader = res.headers.get('link') || res.headers.get('Link');
    let nextUrl: string | null = null;
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) nextUrl = match[1];
    }
    return { orders: orders || [], nextUrl };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cron: sync Shopify orders incremental para todas las conexiones activas.
 * Auth: X-Cron-Secret. Schedule recomendado: cada 6 horas.
 * Incremental via shopify_orders_sync_state.last_synced_updated_at + Shopify
 * `updated_at_min` query param, así solo trae nuevas/modificadas.
 */
export async function syncShopifyOrders(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();

  const lockKey = 'cron_lock_sync_shopify_orders';
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
      return c.json({ skipped: true, reason: 'Another run in progress' });
    }
  }

  const { error: lockErr } = await supabase.from('steve_knowledge').upsert(
    { categoria: 'system', titulo: lockKey, contenido: now.toISOString(), activo: true, orden: 0 },
    { onConflict: 'categoria,titulo' },
  );
  if (lockErr) {
    return c.json({ error: 'Failed to acquire lock' }, 500);
  }

  try {
    const { data: connections } = await supabase
      .from('platform_connections')
      .select('id, client_id, shop_domain, store_url, access_token_encrypted')
      .eq('platform', 'shopify')
      .eq('is_active', true);

    const results: Array<{ client_id: string; shop_domain: string; status: 'success' | 'error' | 'skipped'; synced?: number; error?: string }> = [];
    let totalSyncedOrders = 0;

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

        // Resolver punto de inicio: last_synced_updated_at o backfill 1 año
        const { data: syncState } = await supabase
          .from('shopify_orders_sync_state')
          .select('last_synced_updated_at')
          .eq('connection_id', conn.id)
          .maybeSingle();

        let updatedAtMin: string;
        if (syncState?.last_synced_updated_at) {
          updatedAtMin = syncState.last_synced_updated_at;
        } else {
          const d = new Date();
          d.setDate(d.getDate() - FIRST_RUN_LOOKBACK_DAYS);
          updatedAtMin = d.toISOString();
        }

        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const fields = 'id,order_number,name,email,customer,total_price,subtotal_price,total_tax,total_discounts,total_shipping_price_set,shipping_lines,currency,financial_status,fulfillment_status,cancelled_at,cancel_reason,source_name,referring_site,landing_site,note_attributes,shipping_address,billing_address,line_items,tags,created_at,updated_at,processed_at';
        let nextUrl: string | null = `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=${PAGE_SIZE}&updated_at_min=${encodeURIComponent(updatedAtMin)}&fields=${fields}`;

        const allOrders: ShopifyOrderRaw[] = [];
        let pageCount = 0;
        while (nextUrl && pageCount < MAX_PAGES_PER_SHOP) {
          if (pageCount > 0) await sleep(PAGE_SLEEP_MS);
          const { orders, nextUrl: nu } = await fetchPage(nextUrl, decryptedToken);
          allOrders.push(...orders);
          nextUrl = nu;
          pageCount += 1;
        }

        if (allOrders.length === 0) {
          // Aún así actualizar last_run_at para tener visibilidad
          await supabase.from('shopify_orders_sync_state').upsert(
            { connection_id: conn.id, last_run_at: new Date().toISOString(), last_synced_updated_at: updatedAtMin, total_synced: 0, last_error: null },
            { onConflict: 'connection_id' },
          );
          results.push({ client_id: conn.client_id, shop_domain: cleanDomain, status: 'success', synced: 0 });
          continue;
        }

        const rows = allOrders.map((o) => mapOrder(o, conn.client_id, conn.id, cleanDomain));

        let upsertFailed = false;
        let upsertErrorMsg = '';
        for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
          const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
          const { error: upsertErr } = await supabase
            .from('shopify_orders')
            .upsert(chunk, { onConflict: 'client_id,shopify_order_id' });
          if (upsertErr) {
            upsertFailed = true;
            upsertErrorMsg = upsertErr.message;
            break;
          }
        }

        if (upsertFailed) {
          await supabase.from('shopify_orders_sync_state').upsert(
            { connection_id: conn.id, last_run_at: new Date().toISOString(), last_error: upsertErrorMsg.slice(0, 500) },
            { onConflict: 'connection_id' },
          );
          results.push({ client_id: conn.client_id, shop_domain: cleanDomain, status: 'error', error: `upsert: ${upsertErrorMsg}` });
          continue;
        }

        // Actualizar punto de corte: max updated_at de las orders sincronizadas
        const maxUpdatedAt = rows.reduce((max, r) => (r.updated_at_shop && r.updated_at_shop > max ? r.updated_at_shop : max), updatedAtMin);

        await supabase.from('shopify_orders_sync_state').upsert(
          {
            connection_id: conn.id,
            last_synced_updated_at: maxUpdatedAt,
            last_run_at: new Date().toISOString(),
            total_synced: rows.length,
            last_error: null,
          },
          { onConflict: 'connection_id' },
        );

        totalSyncedOrders += rows.length;
        results.push({ client_id: conn.client_id, shop_domain: cleanDomain, status: 'success', synced: rows.length });
        console.log(`[cron] sync-shopify-orders ${cleanDomain}: ${rows.length} orders (since ${updatedAtMin})`);
      } catch (err) {
        const msg = (err as Error).message;
        await supabase.from('shopify_orders_sync_state').upsert(
          { connection_id: conn.id, last_run_at: new Date().toISOString(), last_error: msg.slice(0, 500) },
          { onConflict: 'connection_id' },
        );
        results.push({ client_id: conn.client_id, shop_domain: shopDomain, status: 'error', error: msg });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const allFailed = (connections?.length || 0) > 0 && succeeded === 0 && failed > 0;

    return c.json(
      {
        synced_clients: succeeded,
        synced_orders: totalSyncedOrders,
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
