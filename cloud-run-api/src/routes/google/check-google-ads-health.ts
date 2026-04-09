import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';

export async function checkGoogleAdsHealth(c: Context) {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Missing authorization' }, 401);

    const { connection_id } = await c.req.json();
    if (!connection_id) return c.json({ error: 'Missing connection_id' }, 400);

    const supabase = getSupabaseAdmin();

    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('id, platform, account_id, connection_type, access_token_encrypted, refresh_token_encrypted, client_id, clients!inner(user_id, client_user_id)')
      .eq('id', connection_id)
      .eq('platform', 'google')
      .single();

    if (connError || !connection) {
      return c.json({ healthy: false, error: 'Connection not found' });
    }

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) {
      return c.json({ healthy: false, error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' });
    }

    const googleToken = await getGoogleTokenForConnection(supabase, connection);
    const customerId = connection.account_id;
    if (!customerId) {
      return c.json({ healthy: false, error: 'No account_id on connection' });
    }

    const loginCustomerId = googleToken.mccCustomerId || customerId;

    const query = `SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1`;
    const response = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken.accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('[check-google-ads-health] API error:', text);
      return c.json({ healthy: false, error: `Google Ads API error: ${response.status}` });
    }

    const responseText = await response.text();
    const json = JSON.parse(responseText);
    const results = Array.isArray(json) ? json[0]?.results : json?.results;
    const customer = results?.[0]?.customer;

    return c.json({
      healthy: true,
      name: customer?.descriptiveName || customerId,
      currency: customer?.currencyCode || 'USD',
    });
  } catch (error) {
    console.error('[check-google-ads-health] Error:', error);
    return c.json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
