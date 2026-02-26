import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const KLAVIYO_REVISION = '2024-10-15';
const KLAVIYO_BASE = 'https://a.klaviyo.com/api';

const METRIC_NAMES: Record<string, string> = {
  ordered: 'Ordered Product',
  viewed: 'Viewed Product',
};

const TIMEFRAME_DAYS: Record<string, number> = {
  '7d': 7, '30d': 30, '60d': 60, '90d': 90,
};

function klaviyoHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'Content-Type': 'application/vnd.api+json',
    'revision': KLAVIYO_REVISION,
    'Accept': 'application/vnd.api+json',
  };
}

async function decryptApiKey(serviceSupabase: any, connectionId: string, platform: string): Promise<string> {
  const column = platform === 'klaviyo' ? 'api_key_encrypted' : 'access_token_encrypted';
  const { data: connection, error } = await serviceSupabase
    .from('platform_connections')
    .select(`${column}, store_url`)
    .eq('id', connectionId)
    .eq('platform', platform)
    .single();

  if (error || !connection?.[column]) {
    throw new Error(`${platform} connection not found or missing credentials`);
  }

  const { data: decrypted, error: decryptError } = await serviceSupabase
    .rpc('decrypt_platform_token', { encrypted_token: connection[column] });

  if (decryptError || !decrypted) {
    throw new Error(`Failed to decrypt ${platform} token`);
  }

  return decrypted;
}

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

    const { connectionId, metric, timeframe, limit: productLimit } = await req.json();
    if (!connectionId || !metric) {
      return new Response(JSON.stringify({ error: 'connectionId and metric are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metricName = METRIC_NAMES[metric];
    if (!metricName) {
      return new Response(JSON.stringify({ error: 'metric must be "ordered" or "viewed"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const days = TIMEFRAME_DAYS[timeframe] || 30;
    const maxProducts = productLimit || 10;

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Decrypt Klaviyo API key
    const apiKey = await decryptApiKey(serviceSupabase, connectionId, 'klaviyo');

    // Get the Klaviyo connection to find client_id for Shopify lookup
    const { data: klaviyoConn } = await serviceSupabase
      .from('platform_connections')
      .select('client_id')
      .eq('id', connectionId)
      .single();

    // Calculate date range
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceIso = sinceDate.toISOString();

    // Fetch events from Klaviyo using the Events API with metric name filter
    const productCounts = new Map<string, number>();
    let nextUrl: string | null = `${KLAVIYO_BASE}/events/?filter=and(equals(metric.name,"${encodeURIComponent(metricName)}"),greater-or-equal(datetime,${sinceIso}))&page[size]=100`;

    // Paginate through events (cap at 5 pages to avoid timeout)
    let pageCount = 0;
    while (nextUrl && pageCount < 5) {
      const res = await fetch(nextUrl, { headers: klaviyoHeaders(apiKey) });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`Klaviyo Events API error [${res.status}]:`, errText);
        throw new Error(`Klaviyo Events API error ${res.status}`);
      }
      const data = await res.json();

      for (const event of data.data || []) {
        const props = event.attributes?.event_properties || {};
        const productName = props.ProductName || props.product_name || props.Title || props.title || props.Name || props.name;
        if (productName) {
          productCounts.set(productName, (productCounts.get(productName) || 0) + 1);
        }
      }

      nextUrl = data.links?.next || null;
      pageCount++;
    }

    // Sort by count descending and take top N
    const sorted = [...productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxProducts);

    // Try to enrich with Shopify product data
    let shopifyToken: string | null = null;
    let shopifyDomain: string | null = null;

    if (klaviyoConn?.client_id) {
      const { data: shopifyConn } = await serviceSupabase
        .from('platform_connections')
        .select('id, store_url, access_token_encrypted')
        .eq('client_id', klaviyoConn.client_id)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (shopifyConn?.access_token_encrypted && shopifyConn?.store_url) {
        const { data: decrypted } = await serviceSupabase
          .rpc('decrypt_platform_token', { encrypted_token: shopifyConn.access_token_encrypted });
        if (decrypted) {
          shopifyToken = decrypted;
          shopifyDomain = shopifyConn.store_url.replace(/^https?:\/\//, '');
        }
      }
    }

    // Build product list, optionally enriching with Shopify data
    const products = [];
    for (const [title, count] of sorted) {
      let image_url = '';
      let price = '';
      let handle = '';
      let url = '';

      if (shopifyToken && shopifyDomain) {
        try {
          const searchUrl = `https://${shopifyDomain}/admin/api/2024-01/products.json?title=${encodeURIComponent(title)}&limit=1&fields=id,title,handle,images,variants`;
          const shopRes = await fetch(searchUrl, {
            headers: { 'X-Shopify-Access-Token': shopifyToken, 'Content-Type': 'application/json' },
          });
          if (shopRes.ok) {
            const { products: shopProducts } = await shopRes.json();
            if (shopProducts?.length > 0) {
              const sp = shopProducts[0];
              image_url = sp.images?.[0]?.src || '';
              price = sp.variants?.[0]?.price || '';
              handle = sp.handle || '';
              url = `https://${shopifyDomain}/products/${handle}`;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch Shopify data for "${title}":`, err);
        }
      }

      products.push({ title, image_url, price, handle, url, count });
    }

    return new Response(JSON.stringify({ products }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in fetch-klaviyo-top-products:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
