import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-session-token',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    const shopifySessionToken = req.headers.get('X-Shopify-Session-Token');
    let userId: string | null = null;

    if (shopifySessionToken) {
      const [, payloadB64] = shopifySessionToken.split('.');
      if (!payloadB64) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
      const { data: client } = await serviceClient.from('clients').select('client_user_id, user_id').eq('shop_domain', shopDomain).single();
      if (!client) {
        return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = client.client_user_id || client.user_id;
    } else if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { connectionId, daysBack = 30 } = await req.json();
    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get connection with ownership check
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== userId && clientData.client_user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { store_url, access_token_encrypted } = connection;
    if (!store_url || !access_token_encrypted) {
      return new Response(JSON.stringify({ error: 'Missing store credentials' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');
    const shopifyHeaders = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    // Fetch orders (with line_items) and abandoned checkouts in parallel
    const ordersUrl = `https://${cleanStoreUrl}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceDate.toISOString()}&limit=250&fields=id,line_items,created_at,currency`;
    const checkoutsUrl = `https://${cleanStoreUrl}/admin/api/2024-01/checkouts.json?limit=250&created_at_min=${sinceDate.toISOString()}`;

    console.log('[fetch-shopify-analytics] Fetching orders and checkouts from:', cleanStoreUrl);

    const [ordersRes, checkoutsRes] = await Promise.all([
      fetch(ordersUrl, { headers: shopifyHeaders }),
      fetch(checkoutsUrl, { headers: shopifyHeaders }),
    ]);

    // --- TOP SKUs ---
    const skuMap = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();

    if (ordersRes.ok) {
      const { orders } = await ordersRes.json();
      console.log(`[fetch-shopify-analytics] Fetched ${orders?.length || 0} orders`);

      for (const order of (orders || [])) {
        for (const item of (order.line_items || [])) {
          const sku = item.sku || item.variant_title || `ID-${item.variant_id || item.product_id}`;
          const existing = skuMap.get(sku) || { sku, name: item.title || item.name || sku, quantity: 0, revenue: 0 };
          existing.quantity += item.quantity || 0;
          existing.revenue += parseFloat(item.price || '0') * (item.quantity || 0);
          skuMap.set(sku, existing);
        }
      }
    } else {
      const errText = await ordersRes.text();
      console.warn('[fetch-shopify-analytics] Orders fetch failed:', ordersRes.status, errText);
    }

    const topSkus = Array.from(skuMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // --- ABANDONED CHECKOUTS ---
    let abandonedCarts: any[] = [];

    if (checkoutsRes.ok) {
      const { checkouts } = await checkoutsRes.json();
      console.log(`[fetch-shopify-analytics] Fetched ${checkouts?.length || 0} abandoned checkouts`);

      abandonedCarts = (checkouts || []).map((c: any) => ({
        id: String(c.id),
        customerEmail: c.email || c.customer?.email || '',
        customerName: c.customer
          ? `${c.customer.first_name || ''} ${c.customer.last_name || ''}`.trim()
          : (c.email || 'Sin nombre'),
        totalValue: parseFloat(c.total_price || '0'),
        itemCount: (c.line_items || []).reduce((sum: number, li: any) => sum + (li.quantity || 0), 0),
        abandonedAt: c.created_at,
        contacted: false, // Shopify doesn't expose this; default to false
      }));
    } else {
      const errText = await checkoutsRes.text();
      console.warn('[fetch-shopify-analytics] Checkouts fetch failed:', checkoutsRes.status, errText);
    }

    console.log(`[fetch-shopify-analytics] Done: ${topSkus.length} SKUs, ${abandonedCarts.length} carts`);

    return new Response(
      JSON.stringify({ topSkus, abandonedCarts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[fetch-shopify-analytics] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
