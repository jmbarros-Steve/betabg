import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthPayload {
  code: string;
  shop: string;
  client_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const shopifyClientId = Deno.env.get('SHOPIFY_CLIENT_ID')!;
    const shopifyClientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')!;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token for auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate the JWT and get user claims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('Invalid JWT:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log('Authenticated user:', userId);

    // Parse request body
    const payload: OAuthPayload = await req.json();
    const { code, shop, client_id: clientId } = payload;

    console.log('Received OAuth callback:', { shop, clientId, hasCode: !!code });

    // Validate required fields
    if (!code || !shop || !clientId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: code, shop, client_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate shop format
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    console.log('Shop domain:', shopDomain);

    // Use service role for database operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user owns the client
    const { data: client, error: clientError } = await supabaseService
      .from('clients')
      .select('user_id, name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      console.error('Client not found:', clientError);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client.user_id !== userId) {
      console.error('User does not own this client');
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange authorization code for access token
    console.log('Exchanging code for access token...');
    const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: shopifyClientId,
        client_secret: shopifyClientSecret,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Shopify token exchange failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to exchange authorization code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Successfully obtained access token');

    // Get shop info
    const shopInfoResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
    });

    let storeName = shopDomain.replace('.myshopify.com', '');
    if (shopInfoResponse.ok) {
      const shopInfo = await shopInfoResponse.json();
      storeName = shopInfo.shop?.name || storeName;
      console.log('Shop name:', storeName);
    }

    // Encrypt the access token
    const { data: encryptedToken, error: encryptError } = await supabaseService
      .rpc('encrypt_platform_token', { raw_token: accessToken });

    if (encryptError) {
      console.error('Error encrypting token:', encryptError);
      return new Response(
        JSON.stringify({ error: 'Error encrypting token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing connection
    const { data: existingConnection } = await supabaseService
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .single();

    let connection;
    if (existingConnection) {
      // Update existing connection
      const { data: updated, error: updateError } = await supabaseService
        .from('platform_connections')
        .update({
          store_name: storeName,
          store_url: `https://${shopDomain}`,
          access_token_encrypted: encryptedToken,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select('id, platform, store_name, store_url, is_active')
        .single();

      if (updateError) {
        console.error('Error updating connection:', updateError);
        return new Response(
          JSON.stringify({ error: 'Error updating connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      connection = updated;
      console.log('Updated existing connection:', connection.id);
    } else {
      // Insert new connection
      const { data: inserted, error: insertError } = await supabaseService
        .from('platform_connections')
        .insert({
          client_id: clientId,
          platform: 'shopify',
          store_name: storeName,
          store_url: `https://${shopDomain}`,
          access_token_encrypted: encryptedToken,
          is_active: true,
        })
        .select('id, platform, store_name, store_url, is_active')
        .single();

      if (insertError) {
        console.error('Error inserting connection:', insertError);
        return new Response(
          JSON.stringify({ error: 'Error creating connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      connection = inserted;
      console.log('Created new connection:', connection.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        store_name: storeName,
        connection: connection,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in Shopify OAuth callback:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
