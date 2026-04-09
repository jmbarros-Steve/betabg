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

    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await c.req.json() as OAuthPayload & { state?: string };
    const { code, client_id, redirect_uri, state } = payload;

    if (!code || !client_id || !redirect_uri) {
      return c.json({ error: 'Missing required parameters' }, 400);
    }

    // Backend CSRF state validation (supplements frontend check in OAuthMetaCallback.tsx)
    if (state) {
      const { data: stateCheck } = await supabase
        .from('oauth_states')
        .select('id')
        .eq('state', state)
        .maybeSingle();
      if (!stateCheck) {
        console.warn('[meta-oauth] Invalid state parameter — possible CSRF');
        return c.json({ error: 'Invalid state parameter — possible CSRF attack' }, 403);
      }
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    // Allow both client_user_id and admin (user_id) to connect Meta
    if (client.client_user_id !== user.id) {
      // Check if user is admin/owner of the client
      const { data: fullClient } = await supabase.from('clients').select('user_id').eq('id', client_id).single();
      const { data: profile } = await supabase.from('user_roles').select('is_super_admin').eq('user_id', user.id).maybeSingle();
      const isOwner = fullClient?.user_id === user.id;
      const isAdmin = profile?.is_super_admin === true;
      if (!isOwner && !isAdmin) {
        return c.json({ error: 'Access denied' }, 403);
      }
    }

    const metaAppId = process.env.META_APP_ID;
    const metaAppSecret = process.env.META_APP_SECRET;

    if (!metaAppId || !metaAppSecret) {
      console.error('Meta credentials not configured');
      return c.json({ error: 'Meta configuration error' }, 500);
    }

    // Exchange code for short-lived token (POST body keeps secret out of URL/logs)
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
    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
      console.error('Meta token error:', tokenData.error);
      return c.json({ error: tokenData.error.message || 'Failed to get access token' }, 400);
    }

    const accessToken = tokenData.access_token;

    // Exchange for long-lived token (POST body keeps secret out of URL/logs)
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
    const longLivedData = await longLivedResponse.json() as any;

    const finalToken = longLivedData.access_token || accessToken;
    // Meta returns expires_in (seconds) for long-lived tokens (~60 days)
    const tokenExpiresIn = longLivedData.expires_in || 5184000;
    const tokenExpiresAt = new Date(Date.now() + tokenExpiresIn * 1000).toISOString();
    console.log(`Long-lived token obtained, expires in ${tokenExpiresIn}s (${tokenExpiresAt})`);

    // Fetch businesses and ad accounts (Authorization header, not URL params)
    const [accountsResponse, businessesResponse] = await Promise.all([
      fetch('https://graph.facebook.com/v21.0/me/adaccounts?fields=name,account_id,account_status', {
        headers: { Authorization: `Bearer ${finalToken}` },
      }),
      fetch('https://graph.facebook.com/v21.0/me/businesses?fields=id,name', {
        headers: { Authorization: `Bearer ${finalToken}` },
      }),
    ]);

    const accountsData = await accountsResponse.json() as any;
    const businessesData = await businessesResponse.json() as any;

    const adAccounts = accountsData.data || [];
    const businesses = businessesData.data || [];
    console.log(`Found ${adAccounts.length} ad accounts, ${businesses.length} businesses`);

    if (adAccounts.length === 0 && businesses.length === 0) {
      return c.json({ error: 'No ad accounts or businesses found for this user' }, 400);
    }

    const accountId: string | null = adAccounts.length > 0
      ? (adAccounts[0].account_id || adAccounts[0].id?.replace('act_', '') || null)
      : null;
    const accountName: string | null = businesses.length > 0 ? businesses[0].name : null;

    const { data: encryptedToken, error: encryptError } = await supabase
      .rpc('encrypt_platform_token', { raw_token: finalToken });

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      return c.json({ error: 'Failed to secure token' }, 500);
    }

    if (!encryptedToken) {
      console.error('[meta-oauth] encrypt_platform_token returned null');
      return c.json({ error: 'Failed to encrypt token' }, 500);
    }

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
      return c.json({ error: 'Failed to save connection' }, 500);
    }

    console.log('Connection saved successfully');

    // Trigger immediate metrics sync for this connection
    const selfUrl = process.env.SELF_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (selfUrl && cronSecret && connectionResult.data?.id) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      if (!serviceKey) {
        console.warn('[meta-oauth] Missing SUPABASE_SERVICE_ROLE_KEY — auto-sync skipped');
      }
      fetch(`${selfUrl}/api/sync-meta-metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Internal-Key': serviceKey,
          'X-Cron-Secret': cronSecret,
        },
        body: JSON.stringify({ connection_id: connectionResult.data.id }),
      }).then(res => {
        if (!res.ok) {
          console.warn(`[meta-oauth] Auto-sync returned non-OK status: ${res.status}`);
        } else {
          console.log(`[meta-oauth] Auto-sync triggered: ${res.status}`);
        }
      }).catch(err => {
        console.warn('[meta-oauth] Auto-sync failed (non-blocking):', err.message);
      });
    }

    // Complete onboarding step (fire & forget)
    if (client_id) {
      Promise.resolve(
        getSupabaseAdmin()
          .from('merchant_onboarding')
          .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('client_id', client_id)
          .eq('step', 'meta_connected')
          .eq('status', 'pending')
      ).then(() => console.log(`[meta-oauth] Onboarding step meta_connected completed for client ${client_id}`))
        .catch(() => {});
    }

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
