import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { metaApiFetch, metaApiJson } from '../../lib/meta-fetch.js';
import { convertToCLP, fetchGoogleAccountCurrency } from '../../lib/currency.js';

// Cache Meta account currency by accountId (TTL: 1 hour)
const currencyCache = new Map<string, { currency: string; fetchedAt: number }>();
const CURRENCY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getAccountCurrency(adAccountId: string, accessToken: string): Promise<string> {
  const cached = currencyCache.get(adAccountId);
  if (cached && Date.now() - cached.fetchedAt < CURRENCY_CACHE_TTL_MS) {
    return cached.currency;
  }

  try {
    const result = await metaApiJson<{ currency?: string }>(
      `/${adAccountId}`,
      accessToken,
      { params: { fields: 'currency' } }
    );
    const currency = result.ok ? (result.data.currency || 'CLP') : 'CLP';
    currencyCache.set(adAccountId, { currency, fetchedAt: Date.now() });
    console.log(`Meta account currency for ${adAccountId}: ${currency}`);
    return currency;
  } catch (e) {
    console.warn(`Could not fetch account currency for ${adAccountId} — defaulting to CLP`);
    return 'CLP';
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

    // Accept either authMiddleware user OR cron secret (for sync-all-metrics)
    const isCron = c.req.header('X-Cron-Secret') === (process.env.CRON_SECRET || 'steve-cron-secret-2024');
    const user = c.get('user');
    if (!user && !isCron) {
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
        connection_type,
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

    // Verify ownership (skip for internal/cron calls)
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null; shop_domain: string | null };
    const isInternal = c.get('isInternal') || isCron;
    if (!isInternal && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
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
    let metaAccessToken: string | null = null;

    if (platform === 'meta') {
      metaAccessToken = await getTokenForConnection(supabase, connection);
      if (!metaAccessToken) {
        console.error('[sync-campaign-metrics] Meta token resolution failed for connection:', connection.id);
        return c.json({ error: 'Failed to resolve Meta token' }, 500);
      }

      campaignMetrics = await syncMetaCampaigns(
        connection.account_id!,
        metaAccessToken,
        connection_id,
        startDate,
        endDate,
        shopDomain
      );
    } else if (platform === 'google') {
      const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      if (!developerToken) {
        return c.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' }, 500);
      }

      const googleToken = await getGoogleTokenForConnection(supabase, connection);

      campaignMetrics = await syncGoogleCampaigns(
        connection.account_id!,
        googleToken.accessToken,
        developerToken,
        connection_id,
        startDate,
        endDate,
        shopDomain,
        googleToken.mccCustomerId || undefined
      );
    }

    console.log(`Upserting ${campaignMetrics.length} campaign metric records (all in CLP)`);

    let recordsSynced = 0;
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
        } else {
          recordsSynced += batch.length;
        }
      }
    }

    // Sync adset-level metrics if requested (for 3:2:2 analysis)
    let adsetsSynced = 0;
    if (sync_adsets && platform === 'meta') {
      console.log('[sync-campaign-metrics] Syncing adset-level metrics...');
      const adsetMetrics = await syncMetaAdsetMetrics(
        connection.account_id!,
        metaAccessToken!,
        connection_id,
        startDate,
        endDate,
        shopDomain,
        campaignMetrics
      );

      if (adsetMetrics.length > 0) {
        // Purge old adset metrics for this connection
        const { error: delErr } = await supabase.from('adset_metrics').delete().eq('connection_id', connection_id);
        if (delErr) {
          console.error('[sync-campaign-metrics] adset_metrics delete error:', delErr);
        }

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
      records_synced: recordsSynced,
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

  // Get account currency (cached)
  const accountCurrency = await getAccountCurrency(adAccountId, accessToken);

  // Fetch campaigns via metaApiJson (goes through circuit breaker + retry)
  const campaignsResult = await metaApiJson<{ data: MetaCampaign[] }>(
    `/${adAccountId}/campaigns`,
    accessToken,
    {
      params: {
        fields: 'id,name,status',
        limit: '100',
      },
    }
  );

  if (!campaignsResult.ok) {
    console.error('Meta campaigns fetch error:', campaignsResult.error);
    return metrics;
  }

  const campaigns: MetaCampaign[] = campaignsResult.data?.data || [];
  console.log(`Found ${campaigns.length} Meta campaigns`);

  // Fetch insights for each campaign with delay
  for (const campaign of campaigns) {
    try {
      const insightsResult = await metaApiJson<{ data: Array<any> }>(
        `/${campaign.id}/insights`,
        accessToken,
        {
          params: {
            fields: 'spend,impressions,reach,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas',
            time_range: JSON.stringify({
              since: formatDate(startDate),
              until: formatDate(endDate),
            }),
            time_increment: '1',
          },
        }
      );

      if (!insightsResult.ok) continue;

      for (const day of insightsResult.data?.data || []) {
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
  shopDomain: string | null,
  loginCustomerId?: string
): Promise<Array<any>> {
  const metrics: Array<any> = [];
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // Detect real account currency (cached in currency.ts)
  const effectiveLoginId = loginCustomerId || customerId;
  const sourceCurrency = await fetchGoogleAccountCurrency(customerId, accessToken, developerToken, effectiveLoginId);
  console.log(`[syncGoogleCampaigns] Account ${customerId} currency: ${sourceCurrency}`);

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
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
  `;

  try {
    const makeRequest = async (loginId: string) => fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    let response = await makeRequest(effectiveLoginId);

    // Fallback: if MCC login-customer-id fails with 403, retry with customer's own ID
    if (response.status === 403 && effectiveLoginId !== customerId) {
      console.warn(`[sync-campaign-metrics] MCC ${effectiveLoginId} denied, retrying with ${customerId}`);
      response = await makeRequest(customerId);
    }

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
      const spendRaw = row.metrics?.costMicros ? parseInt(row.metrics.costMicros, 10) / 1000000 : 0;
      const impressions = row.metrics?.impressions ? parseInt(row.metrics.impressions, 10) : 0;
      const clicks = row.metrics?.clicks ? parseInt(row.metrics.clicks, 10) : 0;
      const cpmRaw = impressions > 0 ? (spendRaw / impressions) * 1000 : 0;
      const cpcRaw = row.metrics?.averageCpc ? parseInt(row.metrics.averageCpc, 10) / 1000000 : 0;
      const conversionValueRaw = row.metrics?.conversionsValue || 0;
      const roas = spendRaw > 0 ? conversionValueRaw / spendRaw : 0;

      // Convert all monetary values to CLP
      const spendCLP = await convertToCLP(spendRaw, sourceCurrency);
      const cpcCLP = await convertToCLP(cpcRaw, sourceCurrency);
      const cpmCLP = await convertToCLP(cpmRaw, sourceCurrency);
      const conversionValueCLP = await convertToCLP(conversionValueRaw, sourceCurrency);

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

  // Get account currency (cached — no duplicate call)
  const accountCurrency = await getAccountCurrency(adAccountId, accessToken);

  // Get unique campaign IDs from already-synced campaign metrics
  const campaignIds = [...new Set(campaignMetrics.map(m => m.campaign_id))];
  console.log(`[syncMetaAdsetMetrics] Syncing adsets for ${campaignIds.length} campaigns`);

  for (const campaignId of campaignIds) {
    const campaignName = campaignMetrics.find(m => m.campaign_id === campaignId)?.campaign_name || '';

    // Fetch adsets for this campaign via metaApiJson (circuit breaker + retry + delay)
    try {
      const adsetsResult = await metaApiJson<{ data: Array<{ id: string; name: string }> }>(
        `/${campaignId}/adsets`,
        accessToken,
        {
          params: {
            fields: 'id,name',
            limit: '100',
          },
        }
      );

      if (!adsetsResult.ok) continue;
      const adsets = adsetsResult.data?.data || [];

      for (const adset of adsets) {
        try {
          const insightsResult = await metaApiJson<{ data: Array<any> }>(
            `/${adset.id}/insights`,
            accessToken,
            {
              params: {
                fields: 'spend,impressions,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas',
                time_range: JSON.stringify({
                  since: formatDate(startDate),
                  until: formatDate(endDate),
                }),
                time_increment: '1',
              },
            }
          );

          if (!insightsResult.ok) continue;

          for (const day of insightsResult.data?.data || []) {
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
