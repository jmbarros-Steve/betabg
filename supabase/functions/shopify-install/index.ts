import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify Shopify HMAC signature following Shopify's exact specification
function verifyHmacFromRawUrl(url: URL, secret: string): boolean {
  // IMPORTANT: Shopify's HMAC is computed over the *raw, encoded* query string.
  // Using URLSearchParams can change encoding (e.g., %2F -> /, + -> space), causing mismatches.
  const rawQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  const secretKey = secret.trim();

  const parts = rawQuery
    .split('&')
    .map((p) => p.trim())
    .filter(Boolean);

  let receivedHmac: string | null = null;
  const pairs: Array<[string, string]> = [];

  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    const key = eqIdx === -1 ? part : part.slice(0, eqIdx);
    const value = eqIdx === -1 ? '' : part.slice(eqIdx + 1);

    if (key === 'hmac') {
      receivedHmac = value;
      continue;
    }
    if (key === 'signature') continue;
    pairs.push([key, value]);
  }

  if (!receivedHmac) return false;

  // Sort parameters lexicographically by key
  const message = pairs
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  console.log('HMAC verification - rawQuery:', rawQuery);
  console.log('HMAC verification - message:', message);

  const computed = createHmac('sha256', secretKey).update(message).digest('hex');

  console.log('HMAC verification - computed hash:', computed);
  console.log('HMAC verification - received hmac:', receivedHmac);

  return computed === receivedHmac;
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
      const isValid = verifyHmacFromRawUrl(url, shopifyClientSecret);
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
