import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';

interface AdSetInsight {
  id: string;
  name: string;
  status: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  conversions?: number;
  conversion_value?: number;
  roas?: number;
}

export async function fetchCampaignAdsets(c: Context) {
  const supabase = getSupabaseAdmin();

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  const { connection_id, campaign_id, platform } = await c.req.json();

  if (!connection_id || !campaign_id || !platform) {
    return c.json({ error: 'Missing required parameters' }, 400);
  }

  console.log(`Fetching ad sets for campaign ${campaign_id} on ${platform}`);

  // Fetch connection details
  const { data: connection, error: connError } = await supabase
    .from('platform_connections')
    .select(`
      id,
      platform,
      account_id,
      access_token_encrypted,
      connection_type,
      client_id,
      clients!inner(user_id, client_user_id)
    `)
    .eq('id', connection_id)
    .eq('platform', platform)
    .single();

  if (connError || !connection) {
    return c.json({ error: 'Connection not found' }, 404);
  }

  // Verify ownership
  const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
  if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const decryptedToken = await getTokenForConnection(supabase, connection);
  if (!decryptedToken) {
    console.error('[fetch-campaign-adsets] Token resolution failed for connection:', connection.id);
    return c.json({ error: 'Failed to resolve token' }, 500);
  }

  // Date range: last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  let adSets: AdSetInsight[] = [];

  // Detect ad account currency
  let accountCurrency = 'CLP' // Default CLP to avoid 950x error;

  if (platform === 'meta') {
    // Fetch account currency from Meta
    try {
      const accountId = connection.account_id;
      if (accountId) {
        const acctUrl = new URL(`https://graph.facebook.com/v23.0/act_${accountId.replace('act_', '')}`);
        
        acctUrl.searchParams.set('fields', 'currency');
        const acctRes = await fetch(acctUrl.toString(), { headers: { Authorization: `Bearer ${decryptedToken}` } });
        if (acctRes.ok) {
          const acctData: any = await acctRes.json();
          accountCurrency = acctData.currency || 'CLP';
          console.log(`Meta account currency: ${accountCurrency}`);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch account currency, defaulting to CLP');
    }

    // Fetch ad sets for this campaign with insights
    const adsetsUrl = new URL(`https://graph.facebook.com/v23.0/${campaign_id}/adsets`);
    adsetsUrl.searchParams.set('fields', 'id,name,status');
    adsetsUrl.searchParams.set('limit', '100');

    const adsetsRes = await fetch(adsetsUrl.toString(), { headers: { Authorization: `Bearer ${decryptedToken}` } });
    if (!adsetsRes.ok) {
      const errorText = await adsetsRes.text();
      console.error('Meta adsets fetch error:', errorText);
      return c.json({ error: 'Failed to fetch ad sets', details: errorText }, 502);
    }

    const adsetsData: any = await adsetsRes.json();
    const rawAdsets = adsetsData.data || [];

    console.log(`Found ${rawAdsets.length} ad sets for campaign ${campaign_id}`);

    // Fetch insights for each adset
    for (const adset of rawAdsets) {
      const insightsUrl = new URL(`https://graph.facebook.com/v23.0/${adset.id}/insights`);
      insightsUrl.searchParams.set('fields', 'spend,impressions,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas');
      insightsUrl.searchParams.set('time_range', JSON.stringify({
        since: formatDate(startDate),
        until: formatDate(endDate)
      }));

      try {
        const insightsRes = await fetch(insightsUrl.toString(), { headers: { Authorization: `Bearer ${decryptedToken}` } });
        if (!insightsRes.ok) continue;

        const insightsData: any = await insightsRes.json();
        const insights = insightsData.data?.[0] || {};

        const purchases = insights.actions?.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'omni_purchase'
        );
        const purchaseValue = insights.action_values?.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'omni_purchase'
        );
        const roas = insights.purchase_roas?.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'omni_purchase'
        );

        adSets.push({
          id: adset.id,
          name: adset.name,
          status: adset.status,
          spend: insights.spend || '0',
          impressions: insights.impressions || '0',
          clicks: insights.clicks || '0',
          cpm: insights.cpm || '0',
          cpc: insights.cpc || '0',
          ctr: insights.ctr || '0',
          conversions: parseFloat(purchases?.value || '0'),
          conversion_value: parseFloat(purchaseValue?.value || '0'),
          roas: parseFloat(roas?.value || '0'),
        });
      } catch (e) {
        console.error(`Error fetching insights for adset ${adset.id}:`, e);
      }
    }
  } else if (platform === 'google') {
    // Google Ads doesn't have the exact same structure, but we can fetch ad groups
    // For now, return empty array for Google
    adSets = [];
  }

  return c.json({
    success: true,
    ad_sets: adSets,
    campaign_id,
    platform,
    account_currency: accountCurrency,
  });
}
