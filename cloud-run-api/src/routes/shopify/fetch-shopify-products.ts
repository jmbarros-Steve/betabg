import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { checkRateLimit } from '../../lib/rate-limiter.js';

export async function fetchShopifyProducts(c: Context) {
  console.log('[fetch-shopify-products] Request received:', c.req.method);

  try {
    const supabaseService = getSupabaseAdmin();

    // Auth: Shopify Session Token or Supabase JWT
    const shopifySessionToken = c.req.header('X-Shopify-Session-Token');
    const authHeader = c.req.header('Authorization');
    let userId: string | null = null;

    if (shopifySessionToken) {
      const [, payloadB64] = shopifySessionToken.split('.');
      if (!payloadB64) {
        return c.json({ error: 'Invalid token' }, 401);
      }
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
      const { data: client } = await supabaseService.from('clients').select('client_user_id, user_id').eq('shop_domain', shopDomain).single();
      if (!client) {
        return c.json({ error: 'Shop not found' }, 401);
      }
      userId = client.client_user_id || client.user_id;
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
    const { data: roleRow } = await supabaseService
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', userId!)
      .eq('role', 'admin')
      .maybeSingle();
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

    const shopifyResponse = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': decryptedToken,
        'Content-Type': 'application/json',
      },
    });

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
        const invUrl = `https://${cleanStoreUrl}/admin/api/2024-01/inventory_items.json?ids=${batchIds}`;

        const invResponse = await fetch(invUrl, {
          headers: {
            'X-Shopify-Access-Token': decryptedToken,
            'Content-Type': 'application/json',
          },
        });

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
