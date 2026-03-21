import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Compute cross-sell co-occurrence from order data
 * POST /api/compute-cross-sell
 * Body: { connectionId }
 */
export async function computeCrossSell(c: Context) {
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
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
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

    const SHOPIFY_API_VERSION = '2025-01';

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

    // Fetch last 90 days of orders
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const ordersUrl = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${since.toISOString()}&limit=250&fields=id,line_items`;
    const orders = await fetchAllPages<any>(ordersUrl, 'orders');

    // Build co-occurrence map: productId → Map<productId, count>
    const coOccurrence = new Map<number, Map<number, number>>();
    const productNames = new Map<number, string>();

    for (const order of orders) {
      const productIds = new Set<number>();
      for (const li of (order.line_items || [])) {
        if (li.product_id) {
          productIds.add(li.product_id);
          if (!productNames.has(li.product_id)) {
            productNames.set(li.product_id, li.title || `Product ${li.product_id}`);
          }
        }
      }

      const idArray = Array.from(productIds);
      for (let i = 0; i < idArray.length; i++) {
        for (let j = i + 1; j < idArray.length; j++) {
          const a = idArray[i];
          const b = idArray[j];

          if (!coOccurrence.has(a)) coOccurrence.set(a, new Map());
          if (!coOccurrence.has(b)) coOccurrence.set(b, new Map());

          coOccurrence.get(a)!.set(b, (coOccurrence.get(a)!.get(b) || 0) + 1);
          coOccurrence.get(b)!.set(a, (coOccurrence.get(b)!.get(a) || 0) + 1);
        }
      }
    }

    // Count orders per product for percentage calculation
    const productOrderCount = new Map<number, number>();
    for (const order of orders) {
      const seen = new Set<number>();
      for (const li of (order.line_items || [])) {
        if (li.product_id && !seen.has(li.product_id)) {
          seen.add(li.product_id);
          productOrderCount.set(li.product_id, (productOrderCount.get(li.product_id) || 0) + 1);
        }
      }
    }

    // Build result: top 3 co-buys per product
    const crossSell: Record<number, Array<{ productId: number; name: string; count: number; percentage: number }>> = {};

    for (const [productId, pairs] of coOccurrence) {
      const totalOrders = productOrderCount.get(productId) || 1;
      const sorted = Array.from(pairs.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([pairId, count]) => ({
          productId: pairId,
          name: productNames.get(pairId) || `Product ${pairId}`,
          count,
          percentage: Math.round((count / totalOrders) * 100),
        }));

      if (sorted.length > 0) {
        crossSell[productId] = sorted;
      }
    }

    console.log(`[compute-cross-sell] Analyzed ${orders.length} orders, ${coOccurrence.size} products with cross-sell data`);

    return c.json({ crossSell, ordersAnalyzed: orders.length });
  } catch (error: any) {
    console.error('[compute-cross-sell] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
