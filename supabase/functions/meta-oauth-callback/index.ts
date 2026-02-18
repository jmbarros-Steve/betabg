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

    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${metaAppSecret}&code=${code}`;

    console.log('Exchanging code for token...');
    const tokenResponse = await fetch(tokenUrl);
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

    // Get long-lived access token
    const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${accessToken}`;
    
    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json();

    const finalToken = longLivedData.access_token || accessToken;
    console.log('Long-lived token obtained');

    // Get ad accounts for this user
    const accountsUrl = `https://graph.facebook.com/v18.0/me/adaccounts?access_token=${finalToken}&fields=name,account_id`;
    const accountsResponse = await fetch(accountsUrl);
    const accountsData = await accountsResponse.json();

    if (accountsData.error) {
      console.error('Error fetching ad accounts:', accountsData.error);
      return new Response(
        JSON.stringify({ error: 'Could not fetch ad accounts' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adAccounts = accountsData.data || [];
    console.log(`Found ${adAccounts.length} ad accounts`);

    if (adAccounts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No ad accounts found for this user' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use first ad account (or could let user choose)
    const primaryAccount = adAccounts[0];
    const accountId = primaryAccount.id.replace('act_', '');
    const accountName = primaryAccount.name;

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
      .select('id')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .maybeSingle();

    let connectionResult;
    if (existingConnection) {
      // Update existing connection
      connectionResult = await supabase
        .from('platform_connections')
        .update({
          access_token_encrypted: encryptedToken,
          account_id: accountId,
          store_name: accountName,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select()
        .single();
    } else {
      // Create new connection
      connectionResult = await supabase
        .from('platform_connections')
        .insert({
          client_id: client_id,
          platform: 'meta',
          access_token_encrypted: encryptedToken,
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

    return new Response(
      JSON.stringify({
        success: true,
        account_name: accountName,
        account_id: accountId,
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
