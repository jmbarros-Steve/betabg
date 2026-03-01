import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const data = await response.json();
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { connection_id, platform, purge_stale } = await req.json();
    
    if (!connection_id || !platform) {
      return new Response(
        JSON.stringify({ error: 'Missing connection_id or platform' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null; shop_domain: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const googleClientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
      const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');

      if (!developerToken || !googleClientId || !googleClientSecret) {
        return new Response(
          JSON.stringify({ error: 'Google Ads configuration missing' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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
            const refreshData = await refreshResponse.json();
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

    // Always purge old campaign metrics for this connection before upserting.
    // This ensures data integrity when the ad account was changed —
    // old campaigns have different IDs and won't be overwritten by upsert.
    console.log(`Purging old campaign_metrics for connection ${connection_id}`);
    const { error: purgeError } = await supabase
      .from('campaign_metrics')
      .delete()
      .eq('connection_id', connection_id);
    if (purgeError) {
      console.error('Purge error:', purgeError);
    }

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

    // Update last_sync_at
    await supabase
      .from('platform_connections')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', connection_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        campaigns_synced: new Set(campaignMetrics.map(m => m.campaign_id)).size,
        records_synced: campaignMetrics.length,
        currency: 'CLP'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
  const accountInfoUrl = `https://graph.facebook.com/v18.0/${adAccountId}?fields=currency&access_token=${accessToken}`;
  let accountCurrency = 'USD';
  try {
    const accountRes = await fetch(accountInfoUrl);
    if (accountRes.ok) {
      const accountData = await accountRes.json();
      accountCurrency = accountData.currency || 'USD';
    }
  } catch (e) {
    console.log('Could not fetch account currency, defaulting to USD');
  }
  console.log(`Meta account currency: ${accountCurrency}`);

  // Fetch campaigns with insights
  const campaignsUrl = new URL(`https://graph.facebook.com/v18.0/${adAccountId}/campaigns`);
  campaignsUrl.searchParams.set('access_token', accessToken);
  campaignsUrl.searchParams.set('fields', 'id,name,status');
  campaignsUrl.searchParams.set('limit', '100');

  const campaignsRes = await fetch(campaignsUrl.toString());
  if (!campaignsRes.ok) {
    console.error('Meta campaigns fetch error:', await campaignsRes.text());
    return metrics;
  }

  const campaignsData = await campaignsRes.json();
  const campaigns: MetaCampaign[] = campaignsData.data || [];

  console.log(`Found ${campaigns.length} Meta campaigns`);

  // Fetch insights for each campaign
  for (const campaign of campaigns) {
    const insightsUrl = new URL(`https://graph.facebook.com/v18.0/${campaign.id}/insights`);
    insightsUrl.searchParams.set('access_token', accessToken);
    insightsUrl.searchParams.set('fields', 'spend,impressions,clicks,cpm,cpc,ctr,actions,action_values,purchase_roas');
    insightsUrl.searchParams.set('time_range', JSON.stringify({
      since: formatDate(startDate),
      until: formatDate(endDate)
    }));
    insightsUrl.searchParams.set('time_increment', '1');

    try {
      const insightsRes = await fetch(insightsUrl.toString());
      if (!insightsRes.ok) continue;

      const insightsData = await insightsRes.json();
      
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
      const jsonResponse = JSON.parse(responseText);
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
