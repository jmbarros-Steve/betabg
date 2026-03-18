import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Fetch Shopify Customers — Task #100
 * POST /api/fetch-shopify-customers
 * Body: { connectionId, action?: 'list' | 'orders', customerId?: number }
 *
 * action=list (default): returns customers sorted by last_order_date DESC
 * action=orders: returns orders for a specific customer
 */
export async function fetchShopifyCustomers(c: Context) {
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

    const body = await c.req.json();
    const { connectionId, action = 'list', customerId } = body;

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

    // Super admin check
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
    const headers = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    // === ACTION: customer orders ===
    if (action === 'orders' && customerId) {
      const ordersUrl = `https://${cleanStoreUrl}/admin/api/2024-01/customers/${customerId}/orders.json?limit=50&status=any`;
      const ordersRes = await fetch(ordersUrl, { headers });

      if (!ordersRes.ok) {
        return c.json({ error: `Shopify API error: ${ordersRes.status}` }, 500);
      }

      const { orders } = await ordersRes.json() as { orders: any[] };
      return c.json({
        orders: (orders || []).map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          created_at: o.created_at,
          total_price: o.total_price,
          currency: o.currency,
          financial_status: o.financial_status,
          fulfillment_status: o.fulfillment_status,
          line_items: (o.line_items || []).map((li: any) => ({
            title: li.title,
            quantity: li.quantity,
            price: li.price,
          })),
        })),
      });
    }

    // === ACTION: list customers ===
    const customersUrl = `https://${cleanStoreUrl}/admin/api/2024-01/customers.json?limit=250&order=last_order_date+DESC`;
    const customersRes = await fetch(customersUrl, { headers });

    if (!customersRes.ok) {
      const errorText = await customersRes.text();
      console.error('[fetch-shopify-customers] Shopify API error:', customersRes.status, errorText);
      return c.json({ error: `Shopify API error: ${customersRes.status}` }, 500);
    }

    const { customers } = await customersRes.json() as { customers: any[] };

    const mapped = (customers || []).map((c: any) => ({
      id: c.id,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      email: c.email || '',
      total_spent: c.total_spent ? parseFloat(c.total_spent) : 0,
      orders_count: c.orders_count || 0,
      last_order_date: c.last_order_id ? c.last_order_name : null,
      created_at: c.created_at,
      currency: c.currency || 'CLP',
      tags: c.tags || '',
      verified_email: c.verified_email,
    }));

    console.log(`[fetch-shopify-customers] Fetched ${mapped.length} customers`);
    return c.json({ customers: mapped });
  } catch (error: any) {
    console.error('[fetch-shopify-customers] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
