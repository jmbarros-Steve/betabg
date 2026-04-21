import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { convertToCLP } from '../../lib/currency.js';

/**
 * Calculate revenue per Shopify collection
 * POST /api/collection-revenue
 * Body: { connectionId }
 */
export async function collectionRevenue(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Auth
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connectionId } = await c.req.json();

    if (!connectionId) {
      return c.json({ error: 'connectionId required' }, 400);
    }

    // Get connection with ownership check
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    const roleRow = await safeQuerySingleOrDefault<{ is_super_admin: boolean }>(
      supabase
        .from('user_roles')
        .select('is_super_admin')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle(),
      null,
      'collectionRevenue.getRoleRow',
    );
    const isSuperAdmin = roleRow?.is_super_admin === true;

    if (!isSuperAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return c.json({ error: 'Missing store credentials' }, 400);
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    const shopifyHeaders = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    const SHOPIFY_API_VERSION = '2026-04';

    // Paginated fetch helper
    async function fetchAllPages<T>(initialUrl: string, key: string): Promise<T[]> {
      const results: T[] = [];
      let url: string | null = initialUrl;
      while (url) {
        const res = await fetch(url, { headers: shopifyHeaders });
        if (!res.ok) break;
        const json: any = await res.json();
        results.push(...(json[key] || []));
        const linkHeader = res.headers.get('Link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;
      }
      return results;
    }

    // Fetch collections (custom + smart)
    const [customCollections, smartCollections] = await Promise.all([
      fetchAllPages<any>(`https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/custom_collections.json?limit=250`, 'custom_collections'),
      fetchAllPages<any>(`https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/smart_collections.json?limit=250`, 'smart_collections'),
    ]);

    const allCollections = [...customCollections, ...smartCollections];

    // Fetch recent orders (last 30 days)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const orders = await fetchAllPages<any>(
      `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${since.toISOString()}&limit=250&fields=id,line_items,total_price,currency,financial_status`,
      'orders'
    );

    // Build product → revenue map from orders
    const productRevenue = new Map<number, { revenue: number; orders: Set<number> }>();
    for (const order of orders) {
      const fs = order.financial_status || '';
      if (fs === 'refunded' || fs === 'voided' || fs === 'cancelled') continue;

      const orderCurrency = order.currency || 'CLP';
      for (const li of (order.line_items || [])) {
        if (!li.product_id) continue;
        const existing = productRevenue.get(li.product_id) || { revenue: 0, orders: new Set() };
        existing.revenue += await convertToCLP(parseFloat(li.price || '0') * (li.quantity || 0), orderCurrency);
        existing.orders.add(order.id);
        productRevenue.set(li.product_id, existing);
      }
    }

    // For each collection, get its products and sum revenue
    const collectionResults: Array<{
      id: number;
      title: string;
      image: string | null;
      revenue: number;
      orders: number;
      avgMargin: number;
      productCount: number;
    }> = [];

    // Fetch products for each collection (limit to first 20 collections to avoid API rate limits)
    for (const col of allCollections.slice(0, 20)) {
      const collects = await fetchAllPages<any>(
        `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/products.json?collection_id=${col.id}&limit=250&fields=id`,
        'products'
      );

      let collectionRev = 0;
      const orderIds = new Set<number>();

      for (const product of collects) {
        const data = productRevenue.get(product.id);
        if (data) {
          collectionRev += data.revenue;
          data.orders.forEach(oid => orderIds.add(oid));
        }
      }

      collectionResults.push({
        id: col.id,
        title: col.title,
        image: col.image?.src || null,
        revenue: Math.round(collectionRev),
        orders: orderIds.size,
        avgMargin: 0, // Would need cost data to calculate
        productCount: collects.length,
      });
    }

    // Sort by revenue descending
    collectionResults.sort((a, b) => b.revenue - a.revenue);

    console.log(`[collection-revenue] ${collectionResults.length} collections, ${orders.length} orders analyzed`);

    return c.json({ collections: collectionResults });
  } catch (error: any) {
    console.error('[collection-revenue] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
