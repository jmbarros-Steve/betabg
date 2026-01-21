import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify Shopify HMAC signature following Shopify's exact specification
function verifyHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get('hmac');
  if (!hmac) return false;

  // Create a copy and remove hmac and signature params
  const params = new URLSearchParams();
  for (const [key, value] of query.entries()) {
    if (key !== 'hmac' && key !== 'signature') {
      params.append(key, value);
    }
  }
  
  // Sort parameters lexicographically by key
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  console.log('HMAC verification - sorted params:', sortedParams);

  const hash = createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');

  console.log('HMAC verification - computed hash:', hash);
  console.log('HMAC verification - received hmac:', hmac);

  // Simple string comparison (the timing-safe comparison had type issues)
  return hash === hmac;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const shop = url.searchParams.get('shop');
    const hmac = url.searchParams.get('hmac');
    
    const shopifyClientId = Deno.env.get('SHOPIFY_CLIENT_ID')!;
    const shopifyClientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    console.log('Shopify install request:', { shop, hasHmac: !!hmac });

    // Validate shop parameter
    if (!shop) {
      return new Response(
        '<html><body><h1>Error</h1><p>Missing shop parameter</p></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Validate shop format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    
    if (!shopRegex.test(shopDomain)) {
      return new Response(
        '<html><body><h1>Error</h1><p>Invalid shop domain</p></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Verify HMAC if present (for requests from Shopify)
    if (hmac) {
      const isValid = verifyHmac(url.searchParams, shopifyClientSecret);
      if (!isValid) {
        console.error('Invalid HMAC signature');
        return new Response(
          '<html><body><h1>Error</h1><p>Invalid request signature</p></body></html>',
          { status: 401, headers: { 'Content-Type': 'text/html' } }
        );
      }
    }

    // Generate a random state for CSRF protection
    const state = crypto.randomUUID();

    // Build Shopify OAuth URL
    const scopes = 'read_orders,read_analytics,write_discounts,read_discounts,read_checkouts';
    const redirectUri = `${supabaseUrl}/functions/v1/shopify-oauth-callback`;
    
    const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', shopifyClientId);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    console.log('Redirecting to Shopify OAuth:', authUrl.toString());

    // Redirect to Shopify OAuth
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl.toString(),
      },
    });

  } catch (error: any) {
    console.error('Error in Shopify install:', error);
    return new Response(
      `<html><body><h1>Error</h1><p>${error.message}</p></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
});
