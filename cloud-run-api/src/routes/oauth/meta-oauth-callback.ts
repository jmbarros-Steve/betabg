import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface OAuthPayload {
  code: string;
  client_id: string;
  redirect_uri: string;
}

export async function metaOauthCallback(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User already verified by authMiddleware
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload: OAuthPayload = await c.req.json();
    const { code, client_id, redirect_uri } = payload;

    if (!code || !client_id || !redirect_uri) {
      return c.json({ error: 'Missing required parameters' }, 400);
    }

    // Verify user owns this client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    if (client.client_user_id !== user.id) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Exchange code for access token
    const metaAppId = process.env.META_APP_ID;
    const metaAppSecret = process.env.META_APP_SECRET;

    if (!metaAppId || !metaAppSecret) {
      console.error('Meta credentials not configured');
      return c.json({ error: 'Meta configuration error' }, 500);
    }

    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirect_uri)}&client_secret=${metaAppSecret}&code=${code}`;

    console.log('Exchanging code for token...');
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      console.error('Meta token error:', tokenData.error);
      return c.json({ error: tokenData.error.message || 'Failed to get access token' }, 400);
    }

    const accessToken = tokenData.access_token;
    console.log('Access token obtained');

    // Get long-lived access token
    const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${accessToken}`;

    const longLivedResponse = await fetch(longLivedUrl);
    const longLivedData = await longLivedResponse.json() as any;

    const finalToken = longLivedData.access_token || accessToken;
    console.log('Long-lived token obtained');

    // Fetch businesses and ad accounts to verify access
    // We do NOT auto-select an account — the user will choose from the portfolio selector
    const [accountsResponse, businessesResponse] = await Promise.all([
      fetch(`https://graph.facebook.com/v18.0/me/adaccounts?access_token=${finalToken}&fields=name,account_id,account_status`),
      fetch(`https://graph.facebook.com/v18.0/me/businesses?access_token=${finalToken}&fields=id,name`),
    ]);

    const accountsData = await accountsResponse.json() as any;
    const businessesData = await businessesResponse.json() as any;

    const adAccounts = accountsData.data || [];
    const businesses = businessesData.data || [];
    console.log(`Found ${adAccounts.length} ad accounts, ${businesses.length} businesses`);

    if (adAccounts.length === 0 && businesses.length === 0) {
      return c.json({ error: 'No ad accounts or businesses found for this user' }, 400);
    }

    // NO auto-selection: account_id starts as null
    // User must select a portfolio/negocio from the Business Manager hierarchy
    const accountId: string | null = null;
    const accountName: string | null = businesses.length > 0 ? businesses[0].name : null;

    // Encrypt the token
    const { data: encryptedToken, error: encryptError } = await supabase
      .rpc('encrypt_platform_token', { raw_token: finalToken });

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      return c.json({ error: 'Failed to secure token' }, 500);
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
      // Update existing connection — preserve existing account_id if user already selected one
      connectionResult = await supabase
        .from('platform_connections')
        .update({
          access_token_encrypted: encryptedToken,
          account_id: existingConnection.account_id || accountId,
          store_name: existingConnection.store_name || accountName,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingConnection.id)
        .select()
        .single();
    } else {
      // Create new connection — account_id is null until user picks a portfolio
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
      return c.json({ error: 'Failed to save connection' }, 500);
    }

    console.log('Connection saved successfully');

    // Return all available accounts and businesses so frontend can build hierarchy
    const allAccounts = adAccounts.map((a: any) => ({
      id: a.id.replace('act_', ''),
      name: a.name,
      account_status: a.account_status,
    }));

    return c.json({
      success: true,
      account_name: connectionResult.data?.store_name || accountName,
      account_id: connectionResult.data?.account_id || accountId,
      connection_id: connectionResult.data?.id,
      all_accounts: allAccounts,
      businesses: businesses.map((b: any) => ({ id: b.id, name: b.name })),
      needs_portfolio_selection: !connectionResult.data?.account_id,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
