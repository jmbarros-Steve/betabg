import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthPayload {
  code: string;
  client_id: string;
  redirect_uri: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: OAuthPayload = await req.json();
    const { code, client_id, redirect_uri } = payload;

    if (!code || !client_id || !redirect_uri) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client.client_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange code for access token
    const metaAppId = Deno.env.get('META_APP_ID');
    const metaAppSecret = Deno.env.get('META_APP_SECRET');

    if (!metaAppId || !metaAppSecret) {
      console.error('Meta credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Meta configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange code for token (POST body — keeps secret out of URL/logs)
    console.log('Exchanging code for token...');
    const tokenResponse = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: metaAppId,
        client_secret: metaAppSecret,
        redirect_uri: redirect_uri,
        code: code,
      }),
    });
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Meta token error:', tokenData.error);
      return new Response(
        JSON.stringify({ error: tokenData.error.message || 'Failed to get access token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = tokenData.access_token;
    console.log('Access token obtained');

    // Exchange for long-lived token (POST body — keeps secret out of URL/logs)
    const longLivedResponse = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: metaAppId,
        client_secret: metaAppSecret,
        fb_exchange_token: accessToken,
      }),
    });
    const longLivedData = await longLivedResponse.json();

    const finalToken = longLivedData.access_token || accessToken;
    const tokenExpiresIn = longLivedData.expires_in || 5184000;
    const tokenExpiresAt = new Date(Date.now() + tokenExpiresIn * 1000).toISOString();
    console.log(`Long-lived token obtained, expires in ${tokenExpiresIn}s`);

    // Fetch businesses and ad accounts to verify access (Authorization header)
    const [accountsResponse, businessesResponse] = await Promise.all([
      fetch('https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id,account_status', {
        headers: { Authorization: `Bearer ${finalToken}` },
      }),
      fetch('https://graph.facebook.com/v21.0/me/businesses?fields=id,name', {
        headers: { Authorization: `Bearer ${finalToken}` },
      }),
    ]);

    const accountsData = await accountsResponse.json();
    const businessesData = await businessesResponse.json();

    const adAccounts = accountsData.data || [];
    const businesses = businessesData.data || [];
    console.log(`Found ${adAccounts.length} ad accounts, ${businesses.length} businesses`);

    if (adAccounts.length === 0 && businesses.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No ad accounts or businesses found for this user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NO auto-selection: account_id starts as null
    const accountId: string | null = null;
    const accountName: string | null = businesses.length > 0 ? businesses[0].name : null;

    // Encrypt the token
    const { data: encryptedToken, error: encryptError } = await supabase
      .rpc('encrypt_platform_token', { raw_token: finalToken });

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to secure token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if connection already exists
    const { data: existingConnection } = await supabase
      .from('platform_connections')
      .select('id, account_id, store_name')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .maybeSingle();

    let connectionResult;
    if (existingConnection) {
      connectionResult = await supabase
        .from('platform_connections')
        .update({
          access_token_encrypted: encryptedToken,
          token_expires_at: tokenExpiresAt,
          account_id: existingConnection.account_id || accountId,
          store_name: existingConnection.store_name || accountName,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select()
        .single();
    } else {
      connectionResult = await supabase
        .from('platform_connections')
        .insert({
          client_id: client_id,
          platform: 'meta',
          access_token_encrypted: encryptedToken,
          token_expires_at: tokenExpiresAt,
          account_id: accountId,
          store_name: accountName,
          is_active: true,
        })
        .select()
        .single();
    }

    if (connectionResult.error) {
      console.error('Connection save error:', connectionResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to save connection' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Connection saved successfully');

    const allAccounts = adAccounts.map((a: any) => ({
      id: a.id.replace('act_', ''),
      name: a.name,
      account_status: a.account_status,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        account_name: connectionResult.data?.store_name || accountName,
        account_id: connectionResult.data?.account_id || accountId,
        connection_id: connectionResult.data?.id,
        all_accounts: allAccounts,
        businesses: businesses.map((b: any) => ({ id: b.id, name: b.name })),
        needs_portfolio_selection: !connectionResult.data?.account_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
