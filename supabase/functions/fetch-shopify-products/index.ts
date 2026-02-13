import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-session-token, x-shopify-host, x-shopify-shop',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: Shopify Session Token or Supabase JWT
    const shopifySessionToken = req.headers.get('X-Shopify-Session-Token');
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    if (shopifySessionToken) {
      const [, payloadB64] = shopifySessionToken.split('.');
      if (!payloadB64) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
      const shopDomain = payload.dest?.replace('https://', '').replace('http://', '');
      const { data: client } = await supabaseService.from('clients').select('client_user_id, user_id').eq('shop_domain', shopDomain).single();
      if (!client) {
        return new Response(JSON.stringify({ error: 'Shop not found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = client.client_user_id || client.user_id;
    } else if (authHeader?.startsWith('Bearer ')) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const token = authHeader.replace('Bearer ', '');
      const { data, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !data?.claims?.sub) {
        console.error('[fetch-shopify-products] Auth failed:', claimsError);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = data.claims.sub;
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { connectionId } = await req.json();
    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get connection with ownership check
    const { data: connection, error: connError } = await supabaseService
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
    const { data: decryptedToken, error: decryptError } = await supabaseService
      .rpc('decrypt_platform_token', { encrypted_token: access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cleanStoreUrl = store_url.replace(/^https?:\/\//, '');

    // Fetch products from Shopify (with variants for cost info)
    const shopifyUrl = `https://${cleanStoreUrl}/admin/api/2024-01/products.json?limit=250&fields=id,title,handle,status,variants,images,product_type`;
    
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
      return new Response(JSON.stringify({ error: `Shopify API error: ${shopifyResponse.status}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { products } = await shopifyResponse.json();
    console.log(`[fetch-shopify-products] Fetched ${products?.length || 0} products`);

    // Map to a clean response with price and cost per variant
    const mappedProducts = (products || []).map((product: any) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      product_type: product.product_type || '',
      image: product.images?.[0]?.src || null,
      variants: (product.variants || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        sku: v.sku || '',
        price: parseFloat(v.price) || 0,
        cost: v.cost ? parseFloat(v.cost) : null,
        inventory_quantity: v.inventory_quantity ?? null,
      })),
    }));

    return new Response(
      JSON.stringify({ products: mappedProducts, count: mappedProducts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
