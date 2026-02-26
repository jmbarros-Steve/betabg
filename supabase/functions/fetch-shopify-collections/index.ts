import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { connectionId, collectionId } = await req.json();
    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch and decrypt Shopify connection
    const { data: connection, error: connError } = await serviceSupabase
      .from('platform_connections')
      .select('store_url, access_token_encrypted')
      .eq('id', connectionId)
      .eq('platform', 'shopify')
      .single();

    if (connError || !connection?.access_token_encrypted || !connection?.store_url) {
      return new Response(JSON.stringify({ error: 'Shopify connection not found or missing credentials' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: decryptedToken, error: decryptError } = await serviceSupabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return new Response(JSON.stringify({ error: 'Failed to decrypt Shopify token' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopDomain = connection.store_url.replace(/^https?:\/\//, '');
    const shopifyHeaders = {
      'X-Shopify-Access-Token': decryptedToken,
      'Content-Type': 'application/json',
    };

    // If collectionId provided, fetch products in that collection
    if (collectionId) {
      const productsUrl = `https://${shopDomain}/admin/api/2024-01/collections/${collectionId}/products.json?limit=250&fields=id,title,handle,images,variants`;
      const res = await fetch(productsUrl, { headers: shopifyHeaders });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Shopify collection products error:', res.status, errText);
        return new Response(JSON.stringify({ error: `Shopify API error: ${res.status}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { products } = await res.json();
      const mapped = (products || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        image_url: p.images?.[0]?.src || '',
        price: p.variants?.[0]?.price || '',
        url: `https://${shopDomain}/products/${p.handle}`,
      }));

      return new Response(JSON.stringify({ products: mapped }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, list all collections (custom + smart)
    const [customRes, smartRes] = await Promise.all([
      fetch(`https://${shopDomain}/admin/api/2024-01/custom_collections.json?limit=250&fields=id,title,handle,image,products_count`, { headers: shopifyHeaders }),
      fetch(`https://${shopDomain}/admin/api/2024-01/smart_collections.json?limit=250&fields=id,title,handle,image,products_count`, { headers: shopifyHeaders }),
    ]);

    const customData = customRes.ok ? await customRes.json() : { custom_collections: [] };
    const smartData = smartRes.ok ? await smartRes.json() : { smart_collections: [] };

    const collections = [
      ...(customData.custom_collections || []).map((c: any) => ({
        id: c.id, title: c.title, handle: c.handle,
        image: c.image?.src || '', products_count: c.products_count || 0, type: 'custom',
      })),
      ...(smartData.smart_collections || []).map((c: any) => ({
        id: c.id, title: c.title, handle: c.handle,
        image: c.image?.src || '', products_count: c.products_count || 0, type: 'smart',
      })),
    ];

    return new Response(JSON.stringify({ collections }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in fetch-shopify-collections:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
