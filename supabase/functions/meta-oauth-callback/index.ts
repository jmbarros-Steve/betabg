import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { code, client_id, redirect_uri } = await req.json();
    if (!code || !client_id || !redirect_uri) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients').select('id, client_user_id').eq('id', client_id).single();
    if (clientError || !client) {
      return new Response(JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (client.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const metaAppId = Deno.env.get('META_APP_ID');
    const metaAppSecret = Deno.env.get('META_APP_SECRET');
    if (!metaAppId || !metaAppSecret) {
      return new Response(JSON.stringify({ error: 'Meta configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Exchange code for token (POST body keeps secret out of URL)
    const tokenResponse = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: metaAppId, client_secret: metaAppSecret, redirect_uri, code }),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      return new Response(JSON.stringify({ error: tokenData.error.message || 'Failed to get access token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Exchange for long-lived token (POST body)
    const longLivedResponse = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'fb_exchange_token', client_id: metaAppId,
        client_secret: metaAppSecret, fb_exchange_token: tokenData.access_token,
      }),
    });
    const longLivedData = await longLivedResponse.json();

    const finalToken = longLivedData.access_token || tokenData.access_token;
    const tokenExpiresIn = longLivedData.expires_in || 5184000;
    const tokenExpiresAt = new Date(Date.now() + tokenExpiresIn * 1000).toISOString();

    // Fetch accounts (Authorization header)
    const [accountsResponse, businessesResponse] = await Promise.all([
      fetch('https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id,account_status', {
        headers: { Authorization: `Bearer ${finalToken}` },
      }),
      fetch('https://graph.facebook.com/v21.0/me/businesses?fields=id,name', {
        headers: { Authorization: `Bearer ${finalToken}` },
      }),
    ]);

    const adAccounts = ((await accountsResponse.json()) as any).data || [];
    const businesses = ((await businessesResponse.json()) as any).data || [];

    if (adAccounts.length === 0 && businesses.length === 0) {
      return new Response(JSON.stringify({ error: 'No ad accounts or businesses found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accountName = businesses.length > 0 ? businesses[0].name : null;

    const { data: encryptedToken, error: encryptError } = await supabase
      .rpc('encrypt_platform_token', { raw_token: finalToken });
    if (encryptError) {
      return new Response(JSON.stringify({ error: 'Failed to secure token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: existingConnection } = await supabase
      .from('platform_connections')
      .select('id, account_id, store_name')
      .eq('client_id', client_id).eq('platform', 'meta').maybeSingle();

    let connectionResult;
    if (existingConnection) {
      connectionResult = await supabase.from('platform_connections').update({
        access_token_encrypted: encryptedToken, token_expires_at: tokenExpiresAt,
        account_id: existingConnection.account_id || null,
        store_name: existingConnection.store_name || accountName,
        is_active: true, updated_at: new Date().toISOString(),
      }).eq('id', existingConnection.id).select().single();
    } else {
      connectionResult = await supabase.from('platform_connections').insert({
        client_id, platform: 'meta', access_token_encrypted: encryptedToken,
        token_expires_at: tokenExpiresAt, account_id: null,
        store_name: accountName, is_active: true,
      }).select().single();
    }

    if (connectionResult.error) {
      return new Response(JSON.stringify({ error: 'Failed to save connection' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      account_name: connectionResult.data?.store_name || accountName,
      account_id: connectionResult.data?.account_id || null,
      connection_id: connectionResult.data?.id,
      all_accounts: adAccounts.map((a: any) => ({
        id: a.id.replace('act_', ''), name: a.name, account_status: a.account_status,
      })),
      businesses: businesses.map((b: any) => ({ id: b.id, name: b.name })),
      needs_portfolio_selection: !connectionResult.data?.account_id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
