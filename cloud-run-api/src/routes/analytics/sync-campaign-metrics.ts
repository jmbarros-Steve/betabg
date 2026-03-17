import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

// Currency conversion utilities
const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';
const FALLBACK_RATES: Record<string, number> = {
  CLP: 950,
  MXN: 17.5,
  EUR: 0.92,
  GBP: 0.79,
};

let cachedRates: Record<string, number> = {};

async function getExchangeRates(): Promise<Record<string, number>> {
  if (Object.keys(cachedRates).length > 0) return cachedRates;

  try {
    const response = await fetch(EXCHANGE_RATE_API_URL);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data: any = await response.json();
    console.log(`Exchange rates fetched: 1 USD = ${data.rates?.CLP} CLP`);
    cachedRates = data.rates || FALLBACK_RATES;
    return cachedRates;
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback:', error);
    return FALLBACK_RATES;
  }
}

async function convertToCLP(amount: number, fromCurrency: string): Promise<number> {
  const currency = fromCurrency.toUpperCase();
  if (currency === 'CLP') return amount;

  const rates = await getExchangeRates();

  if (currency === 'USD') {
    return amount * (rates['CLP'] || FALLBACK_RATES['CLP']);
  } else {
    // Convert FROM -> USD -> CLP
    const fromRate = rates[currency] || 1;
    const clpRate = rates['CLP'] || FALLBACK_RATES['CLP'];
    return (amount / fromRate) * clpRate;
  }
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  insights?: {
    data: Array<{
      date_start: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      cpm?: string;
      cpc?: string;
      ctr?: string;
      actions?: Array<{ action_type: string; value: string }>;
      action_values?: Array<{ action_type: string; value: string }>;
      purchase_roas?: Array<{ action_type: string; value: string }>;
    }>;
  };
}

interface GoogleCampaign {
  campaign: {
    id: string;
    name: string;
    status: string;
  };
  metrics: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number;
    conversionsValue?: number;
    ctr?: number;
    averageCpc?: string;
  };
  segments: {
    date: string;
  };
}

export async function syncCampaignMetrics(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User is already verified by authMiddleware
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Missing authorization' }, 401);
    }

    const { connection_id, platform, purge_stale, sync_adsets } = await c.req.json();

    if (!connection_id || !platform) {
      return c.json({ error: 'Missing connection_id or platform' }, 400);
    }

    console.log(`Syncing ${platform} campaign metrics for connection: ${connection_id}`);

    // Fetch connection details
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        account_id,
        access_token_encrypted,
        refresh_token_encrypted,
        client_id,
        clients!inner(user_id, client_user_id, shop_domain)
      `)
      .eq('id', connection_id)
      .eq('platform', platform)
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null; shop_domain: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Decrypt access token
    if (!connection.access_token_encrypted) {
      console.error('[sync-campaign-metrics] No encrypted token for connection:', connection.id);
      return c.json({ error: 'No encrypted token found for this connection' }, 500);
    }
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('[sync-campaign-metrics] decrypt_platform_token failed:', decryptError?.message, decryptError?.code);
      return c.json({ error: 'Failed to decrypt token' }, 500);
    }

    // Date range: last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    let campaignMetrics: Array<{
      connection_id: string;
      campaign_id: string;
      campaign_name: string;
      platform: string;
      metric_date: string;
      impressions: number;
      reach?: number;
      clicks: number;
      spend: number;
      conversions: number;
      conversion_value: number;
      ctr: number;
      cpc: number;
      cpm: number;
      roas: number;
      currency: string;
      shop_domain: string | null;
    }> = [];

    const shopDomain = clientData.shop_domain;

    if (platform === 'meta') {
      campaignMetrics = await syncMetaCampaigns(
        connection.account_id!,
        decryptedToken,
        connection_id,
        startDate,
        endDate,
        shopDomain
      );
    } else if (platform === 'google') {
      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

      if (!developerToken || !googleClientId || !googleClientSecret) {
        return c.json({ error: 'Google Ads configuration missing' }, 500);
      }

      // Refresh token if needed
      let accessToken = decryptedToken;
      if (connection.refresh_token_encrypted) {
        const { data: refreshToken } = await supabase
          .rpc('decrypt_platform_token', { encrypted_token: connection.refresh_token_encrypted });

        if (refreshToken) {
          try {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: googleClientId,
                client_secret: googleClientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
              }),
            });
            const refreshData: any = await refreshResponse.json();
            if (refreshData.access_token) {
              accessToken = refreshData.access_token;
            }
          } catch (e) {
            console.log('Token refresh failed:', e);
          }
        }
      }

      campaignMetrics = await syncGoogleCampaigns(
        connection.account_id!,
        accessToken,
        developerToken,
        connection_id,
        startDate,
        endDate,
        shopDomain
      );
    }

    console.log(`Upserting ${campaignMetrics.length} campaign metric records (all in CLP)`);

    if (campaignMetrics.length > 0) {
      // Upsert in batches of 100
      for (let i = 0; i < campaignMetrics.length; i += 100) {
        const batch = campaignMetrics.slice(i, i + 100);
        const { error: upsertError } = await supabase
          .from('campaign_metrics')
          .upsert(batch, {
            onConflict: 'connection_id,campaign_id,metric_date',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error('Upsert error:', upsertError);
        }
      }
    }

    // Sync adset-level metrics if requested (for 3:2:2 analysis)
    let adsetsSynced = 0;
    if (sync_adsets && platform === 'meta') {
      console.log('[sync-campaign-metrics] Syncing adset-level metrics...');
      const adsetMetrics = await syncMetaAdsetMetrics(
        connection.account_id!,
        decryptedToken,
        connection_id,
        startDate,
        endDate,
        shopDomain,
        campaignMetrics
      );

      if (adsetMetrics.length > 0) {
        // Purge old adset metrics for this connection
        await supabase.from('adset_metrics').delete().eq('connection_id', connection_id);

        for (let i = 0; i < adsetMetrics.length; i += 100) {
          const batch = adsetMetrics.slice(i, i + 100);
          const { error: adsetUpsertError } = await supabase
            .from('adset_metrics')
            .upsert(batch, {
              onConflict: 'connection_id,campaign_id,adset_id,metric_date',
              ignoreDuplicates: false,
            });
          if (adsetUpsertError) {
            console.error('Adset upsert error:', adsetUpsertError);
          }
        }
        adsetsSynced = new Set(adsetMetrics.map(m => m.adset_id)).size;
        console.log(`[sync-campaign-metrics] Synced ${adsetsSynced} ad sets, ${adsetMetrics.length} records`);
      }
    }

    // Clean up stale campaign metrics (e.g. from a previously connected ad account)
    // Done AFTER upsert so the dashboard never shows /bin/bash during sync
    const currentCampaignIds = [...new Set(campaignMetrics.map(m => m.campaign_id))];
    if (currentCampaignIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from('campaign_metrics')
        .delete()
        .eq('connection_id', connection_id)
        .not('campaign_id', 'in', `(${currentCampaignIds.join(',')})`);
      if (cleanupError) {
        console.error('Stale metric cleanup error:', cleanupError);
      }
    }

    // Update last_sync_at
    await supabase
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection_id);

    return c.json({
      success: true,
      campaigns_synced: new Set(campaignMetrics.map(m => m.campaign_id)).size,
      records_synced: campaignMetrics.length,
      adsets_synced: adsetsSynced,
      currency: 'CLP'
    }, 200);

  } catch (error) {
    console.error('Sync error:', error);
    return c.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown'
    }, 500);
  }
}

async function syncMetaCampaigns(
  accountId: string,
  accessToken: string,
  connectionId: string,
  startDate: Date,
  endDate: Date,
  shopDomain: string | null
): Promise<Array<any>> {
  const metrics: Array<any> = [];
  const adAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // Get account currency first
  // Token via Authorization header
  let accountCurrency = 'CLP'; // Default CLP (no conversion) to avoid 950x error
  try {
    const accountRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}?fields=currency`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (accountRes.ok) {
      const accountData: any = await accountRes.json();
      accountCurrency = accountData.currency || 'CLP';
    }
  } catch (e) {
    console.warn('Could not fetch account currency — defaulting to CLP (no conversion)');
  }
  console.log(`Meta account currency: ${accountCurrency}`);

  // Fetch campaigns with insights
  const campaignsUrl = new URL(`https://graph.facebook.com/v21.0/${adAccountId}/campaigns`);
  
  campaignsUrl.searchParams.set('fields', 'id,name,status');
  campaignsUrl.searchParams.set('limit', '100');

  const campaignsRes = await fetch(campaignsUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!campaignsRes.ok) {
    console.error('Meta campaigns fetch error:', await campaignsRes.text());
    return metrics;
  }

  const campaignsData: any = await campaignsRes.json();
  const campaigns: MetaCampaign[] = campaignsData.data || [];

  console.log(`Found ${campaigns.length} Meta campaigns`);

  // Fetch insights for each campaign
  for (const campaign of campaigns) {
    const insightsUrl = new URL(`https://graph.facebook.com/v21.0/${campaign.id}/insights`);
    
    insightsUrl.searchParams.set('fields', 'spend,impressions,reach,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas');
    insightsUrl.searchParams.set('time_range', JSON.stringify({
      since: formatDate(startDate),
      until: formatDate(endDate)
    }));
    insightsUrl.searchParams.set('time_increment', '1');

    try {
      const insightsRes = await fetch(insightsUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!insightsRes.ok) continue;

      const insightsData: any = await insightsRes.json();

      for (const day of insightsData.data || []) {
        const purchases = day.actions?.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'omni_purchase'
        );
        const purchaseValue = day.action_values?.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'omni_purchase'
        );
        const roas = day.purchase_roas?.find((a: any) =>
          a.action_type === 'purchase' || a.action_type === 'omni_purchase'
        );

        // Convert all monetary values to CLP
        const spendCLP = await convertToCLP(parseFloat(day.spend || '0'), accountCurrency);
        const cpcCLP = await convertToCLP(parseFloat(day.cpc || '0'), accountCurrency);
        const cpmCLP = await convertToCLP(parseFloat(day.cpm || '0'), accountCurrency);
        const conversionValueCLP = await convertToCLP(parseFloat(purchaseValue?.value || '0'), accountCurrency);

        metrics.push({
          connection_id: connectionId,
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          campaign_status: campaign.status,
          platform: 'meta',
          metric_date: day.date_start,
          impressions: parseFloat(day.impressions || '0'),
          reach: parseFloat(day.reach || '0'),
          clicks: parseFloat(day.clicks || '0'),
          spend: Math.round(spendCLP),
          conversions: parseFloat(purchases?.value || '0'),
          conversion_value: Math.round(conversionValueCLP),
          ctr: parseFloat(day.ctr || '0'),
          cpc: Math.round(cpcCLP),
          cpm: Math.round(cpmCLP),
          roas: parseFloat(roas?.value || '0'),
          currency: 'CLP',
          shop_domain: shopDomain
        });
      }
    } catch (e) {
      console.error(`Error fetching insights for campaign ${campaign.id}:`, e);
    }
  }

  return metrics;
}

async function syncGoogleCampaigns(
  customerId: string,
  accessToken: string,
  developerToken: string,
  connectionId: string,
  startDate: Date,
  endDate: Date,
  shopDomain: string | null
): Promise<Array<any>> {
  const metrics: Array<any> = [];
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // Google Ads uses USD by default, we convert to CLP
  const sourceCurrency = 'USD';

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${formatDate(startDate)}' AND '${formatDate(endDate)}'
    ORDER BY segments.date DESC
  `;

  try {
    const response = await fetch(
      `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': customerId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      console.error('Google Ads API error:', await response.text());
      return metrics;
    }

    const responseText = await response.text();
    let allResults: GoogleCampaign[] = [];

    try {
      const jsonResponse: any = JSON.parse(responseText);
      if (Array.isArray(jsonResponse)) {
        for (const batch of jsonResponse) {
          if (batch.results) {
            allResults = allResults.concat(batch.results);
          }
        }
      } else if (jsonResponse.results) {
        allResults = jsonResponse.results;
      }
    } catch (e) {
      console.error('Parse error:', e);
    }

    console.log(`Found ${allResults.length} Google campaign day records`);

    for (const row of allResults) {
      const spendUSD = row.metrics?.costMicros ? parseInt(row.metrics.costMicros, 10) / 1000000 : 0;
      const impressions = row.metrics?.impressions ? parseInt(row.metrics.impressions, 10) : 0;
      const clicks = row.metrics?.clicks ? parseInt(row.metrics.clicks, 10) : 0;
      const cpmUSD = impressions > 0 ? (spendUSD / impressions) * 1000 : 0;
      const cpcUSD = row.metrics?.averageCpc ? parseInt(row.metrics.averageCpc, 10) / 1000000 : 0;
      const conversionValueUSD = row.metrics?.conversionsValue || 0;
      const roas = spendUSD > 0 ? conversionValueUSD / spendUSD : 0;

      // Convert all monetary values to CLP
      const spendCLP = await convertToCLP(spendUSD, sourceCurrency);
      const cpcCLP = await convertToCLP(cpcUSD, sourceCurrency);
      const cpmCLP = await convertToCLP(cpmUSD, sourceCurrency);
      const conversionValueCLP = await convertToCLP(conversionValueUSD, sourceCurrency);

      metrics.push({
        connection_id: connectionId,
        campaign_id: row.campaign.id,
        campaign_name: row.campaign.name,
        campaign_status: row.campaign.status,
        platform: 'google',
        metric_date: row.segments.date,
        impressions,
        clicks,
        spend: Math.round(spendCLP),
        conversions: row.metrics?.conversions || 0,
        conversion_value: Math.round(conversionValueCLP),
        ctr: row.metrics?.ctr || 0,
        cpc: Math.round(cpcCLP),
        cpm: Math.round(cpmCLP),
        roas,
        currency: 'CLP',
        shop_domain: shopDomain
      });
    }
  } catch (e) {
    console.error('Google sync error:', e);
  }

  return metrics;
}

// --- Adset-level metrics for 3:2:2 analysis ---

async function syncMetaAdsetMetrics(
  accountId: string,
  accessToken: string,
  connectionId: string,
  startDate: Date,
  endDate: Date,
  shopDomain: string | null,
  campaignMetrics: Array<any>
): Promise<Array<any>> {
  const metrics: Array<any> = [];
  const adAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // Get account currency for conversion
  let accountCurrency = 'CLP'; // Default CLP (no conversion) to avoid 950x error
  try {
    const accountRes = await fetch(
      `https://graph.facebook.com/v21.0/${adAccountId}?fields=currency`, { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (accountRes.ok) {
      const accountData: any = await accountRes.json();
      accountCurrency = accountData.currency || 'CLP';
    }
  } catch (e) {
    console.warn('Could not fetch account currency for adset sync — defaulting to CLP');
  }

  // Get unique campaign IDs from already-synced campaign metrics
  const campaignIds = [...new Set(campaignMetrics.map(m => m.campaign_id))];
  console.log(`[syncMetaAdsetMetrics] Syncing adsets for ${campaignIds.length} campaigns`);

  for (const campaignId of campaignIds) {
    const campaignName = campaignMetrics.find(m => m.campaign_id === campaignId)?.campaign_name || '';

    // Fetch adsets for this campaign
    const adsetsUrl = new URL(`https://graph.facebook.com/v21.0/${campaignId}/adsets`);
    
    adsetsUrl.searchParams.set('fields', 'id,name');
    adsetsUrl.searchParams.set('limit', '100');

    try {
      const adsetsRes = await fetch(adsetsUrl.toString());
      if (!adsetsRes.ok) continue;
      const adsetsData: any = await adsetsRes.json();
      const adsets = adsetsData.data || [];

      for (const adset of adsets) {
        const insightsUrl = new URL(`https://graph.facebook.com/v21.0/${adset.id}/insights`);
        
        insightsUrl.searchParams.set('fields', 'spend,impressions,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas');
        insightsUrl.searchParams.set('time_range', JSON.stringify({
          since: formatDate(startDate),
          until: formatDate(endDate),
        }));
        insightsUrl.searchParams.set('time_increment', '1');

        try {
          const insightsRes = await fetch(insightsUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!insightsRes.ok) continue;
          const insightsData: any = await insightsRes.json();

          for (const day of insightsData.data || []) {
            const purchases = day.actions?.find((a: any) =>
              a.action_type === 'purchase' || a.action_type === 'omni_purchase'
            );
            const purchaseValue = day.action_values?.find((a: any) =>
              a.action_type === 'purchase' || a.action_type === 'omni_purchase'
            );
            const roas = day.purchase_roas?.find((a: any) =>
              a.action_type === 'purchase' || a.action_type === 'omni_purchase'
            );

            const spendCLP = await convertToCLP(parseFloat(day.spend || '0'), accountCurrency);
            const cpcCLP = await convertToCLP(parseFloat(day.cpc || '0'), accountCurrency);
            const cpmCLP = await convertToCLP(parseFloat(day.cpm || '0'), accountCurrency);
            const conversionValueCLP = await convertToCLP(parseFloat(purchaseValue?.value || '0'), accountCurrency);

            metrics.push({
              connection_id: connectionId,
              campaign_id: campaignId,
              campaign_name: campaignName,
              adset_id: adset.id,
              adset_name: adset.name,
              platform: 'meta',
              metric_date: day.date_start,
              impressions: parseFloat(day.impressions || '0'),
              clicks: parseFloat(day.clicks || '0'),
              spend: Math.round(spendCLP),
              conversions: parseFloat(purchases?.value || '0'),
              conversion_value: Math.round(conversionValueCLP),
              ctr: parseFloat(day.ctr || '0'),
              cpc: Math.round(cpcCLP),
              cpm: Math.round(cpmCLP),
              roas: parseFloat(roas?.value || '0'),
              currency: 'CLP',
              shop_domain: shopDomain,
            });
          }
        } catch (e) {
          console.error(`Error fetching adset ${adset.id} insights:`, e);
        }
      }
    } catch (e) {
      console.error(`Error fetching adsets for campaign ${campaignId}:`, e);
    }
  }

  return metrics;
}
