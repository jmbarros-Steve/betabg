import { Context } from 'hono';
import { createHmac } from 'node:crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { checkRateLimit } from '../../lib/rate-limiter.js';

/**
 * Verify Shopify session token JWT signature using HMAC-SHA256.
 * Returns the decoded payload if valid, null if invalid.
 */
function verifyShopifySessionToken(token: string): { payload: any; shopDomain: string } | null {
  const apiSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const apiKey = process.env.SHOPIFY_CLIENT_ID;

  if (!apiSecret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payloadB64, signature] = parts;

  // Verify HMAC-SHA256 signature
  const signatureInput = `${header}.${payloadB64}`;
  const expectedSignature = createHmac('sha256', apiSecret)
    .update(signatureInput)
    .digest('base64url');

  // Constant-time comparison
  if (signature.length !== expectedSignature.length) return null;
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  if (result !== 0) return null;

  // Decode payload
  try {
    let base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const payload = JSON.parse(atob(base64));

    // Validate expiration
    const now = Math.floor(Date.now() / 1000);
    const clockSkew = 60;
    if (payload.exp && payload.exp < (now - clockSkew)) {
      console.error('[fetch-shopify-products] Shopify session token expired');
      return null;
    }

    // Validate audience if API key is configured
    if (apiKey && payload.aud && payload.aud !== apiKey) {
      console.error('[fetch-shopify-products] Shopify session token audience mismatch');
      return null;
    }

    const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
    if (!shopDomain) return null;

    return { payload, shopDomain };
  } catch {
    return null;
  }
}

export async function fetchShopifyProducts(c: Context) {
  console.log('[fetch-shopify-products] Request received:', c.req.method);

  try {
    const supabaseService = getSupabaseAdmin();

    // Auth: Shopify Session Token (verified) or Supabase JWT
    const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
    const authHeader = c.req.header('Authorization');
    let userId: string | null = null;

    if (shopifySessionToken) {
      // Attempt to verify the Shopify JWT signature
      const verified = verifyShopifySessionToken(shopifySessionToken);

      if (!verified) {
        // If we can't verify the JWT (no SHOPIFY_CLIENT_SECRET or bad signature),
        // require normal auth middleware authentication
        const user = c.get('user');
        if (!user) {
          console.error('[fetch-shopify-products] Shopify JWT verification failed and no authenticated user');
          return c.json({ error: 'Authentication required — Shopify session token could not be verified' }, 401);
        }
        userId = user.id;
        console.log('[fetch-shopify-products] Falling back to authenticated user:', userId);
      } else {
        const client = await safeQuerySingleOrDefault<{ client_user_id: string | null; user_id: string | null }>(
          supabaseService.from('clients').select('client_user_id, user_id').eq('shop_domain', verified.shopDomain).single(),
          null,
          'fetchShopifyProducts.getClientByShop',
        );
        if (!client) {
          return c.json({ error: 'Shop not found' }, 401);
        }
        userId = client.client_user_id || client.user_id;
        console.log('[fetch-shopify-products] Verified Shopify session for shop:', verified.shopDomain);
      }
    } else if (authHeader?.startsWith('Bearer ')) {
      // Use service role to validate the user token
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseService.auth.getUser(token);
      if (authError || !user) {
        console.error('[fetch-shopify-products] Auth failed:', authError?.message);
        return c.json({ error: 'Unauthorized', details: authError?.message }, 401);
      }
      userId = user.id;
      console.log('[fetch-shopify-products] Authenticated user:', userId);
    } else {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connectionId } = await c.req.json();
    if (!connectionId) {
      return c.json({ error: 'connectionId required' }, 400);
    }

    // Get connection with ownership check
    const { data: connection, error: connError } = await supabaseService
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Rate limit: 10 requests/minute per connection
    const rl = checkRateLimit(connectionId, 'fetch-shopify-products');
    if (!rl.allowed) {
      return c.json({ error: `Rate limited. Retry in ${rl.retryAfter} seconds.` }, 429);
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };

    // Check super admin access
    const roleRow = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabaseService
        .from('user_roles')
        .select('is_super_admin')
        .eq('user_id', userId!)
        .eq('role', 'admin')
        .maybeSingle(),
      null,
      'fetchShopifyProducts.getRoleRow',
    );
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== userId && clientData.client_user_id !== userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Missing store credentials' }, 400);
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await supabaseService
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');

    // Fetch products from Shopify (including body_html for SEO analysis)
    const shopifyUrl = `https://${cleanStoreUrl}/admin/api/2024-01/products.json?limit=250&fields=id,title,handle,status,variants,images,product_type,body_html`;

    console.log('[fetch-shopify-products] Fetching from:', cleanStoreUrl);

    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 30_000);
    const shopifyResponse = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': decryptedToken,
        'Content-Type': 'application/json',
      },
      signal: fetchController.signal,
    });
    clearTimeout(fetchTimeout);

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify API error:', shopifyResponse.status, errorText);
      return c.json({ error: `Shopify API error: ${shopifyResponse.status}` }, 500);
    }

    const { products }: any = await shopifyResponse.json();
    console.log(`[fetch-shopify-products] Fetched ${products?.length || 0} products`);

    // Collect all inventory_item_ids from variants to fetch costs
    const allVariants = (products || []).flatMap((p: any) => p.variants || []);
    const inventoryItemIds = allVariants
      .map((v: any) => v.inventory_item_id)
      .filter(Boolean);

    // Fetch inventory items in batches of 100 to get cost data
    const costMap = new Map<number, number | null>();

    if (inventoryItemIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
        const batchIds = inventoryItemIds.slice(i, i + batchSize).join(',');
        if (!batchIds) continue;
        const invUrl = `https://${cleanStoreUrl}/admin/api/2024-01/inventory_items.json?ids=${batchIds}`;

        const invController = new AbortController();
        const invTimeout = setTimeout(() => invController.abort(), 30_000);
        const invResponse = await fetch(invUrl, {
          headers: {
            'X-Shopify-Access-Token': decryptedToken,
            'Content-Type': 'application/json',
          },
          signal: invController.signal,
        });
        clearTimeout(invTimeout);

        if (invResponse.ok) {
          const { inventory_items }: any = await invResponse.json();
          for (const item of (inventory_items || [])) {
            costMap.set(item.id, item.cost ? parseFloat(item.cost) : null);
          }
        } else {
          console.warn('[fetch-shopify-products] Inventory items fetch failed:', invResponse.status);
        }
      }
      console.log(`[fetch-shopify-products] Fetched costs for ${costMap.size} inventory items`);
    }

    // Map to a clean response with price and cost per variant
    const mappedProducts = (products || []).map((product: any) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      product_type: product.product_type || '',
      body_html: product.body_html || '',
      image: product.images?.[0]?.src || null,
      image_count: (product.images || []).length,
      images_without_alt: (product.images || []).filter((img: any) => !img.alt || img.alt.trim() === '').length,
      images: (product.images || []).map((img: any) => ({ id: img.id, src: img.src, alt: img.alt || '' })),
      variants: (product.variants || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        sku: v.sku || '',
        price: parseFloat(v.price) || 0,
        cost: costMap.get(v.inventory_item_id) ?? null,
        inventory_quantity: v.inventory_quantity ?? null,
        inventory_item_id: v.inventory_item_id ?? null,
      })),
    }));

    return c.json({ products: mappedProducts, count: mappedProducts.length });

  } catch (error: any) {
    console.error('Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
