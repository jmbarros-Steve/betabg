import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KLAVIYO_REVISION = '2024-10-15';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Validate user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { connectionId } = await req.json();
    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get connection and verify ownership
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decrypt API key
    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const klaviyoHeaders = {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'Content-Type': 'application/json',
      'revision': KLAVIYO_REVISION,
    };

    // Fetch the "Placed Order" metric ID for conversion tracking
    let conversionMetricId: string | null = null;
    try {
      // Klaviyo filter syntax requires single quotes, not double quotes
      const metricsListRes = await fetch("https://a.klaviyo.com/api/metrics/?filter=equals(name,'Placed Order')", { headers: klaviyoHeaders });
      if (metricsListRes.ok) {
        const metricsData = await metricsListRes.json();
        conversionMetricId = metricsData.data?.[0]?.id || null;
        console.log(`[sync-klaviyo-metrics] Conversion metric ID: ${conversionMetricId}`);
      } else {
        const errText = await metricsListRes.text();
        console.warn('[sync-klaviyo-metrics] Could not fetch metrics list:', metricsListRes.status, errText);
      }
    } catch (e) {
      console.warn('[sync-klaviyo-metrics] Error fetching metrics:', e);
    }

    // Fetch flows, campaigns, lists (for profile count), in parallel
    const [flowsRes, campaignsRes, listsRes] = await Promise.all([
      fetch('https://a.klaviyo.com/api/flows/?page[size]=50', { headers: klaviyoHeaders }),
      // Klaviyo REQUIRES a channel filter for campaigns endpoint
      fetch("https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')&page[size]=50&sort=-updated_at", { headers: klaviyoHeaders }),
      fetch('https://a.klaviyo.com/api/lists/?page[size]=50', { headers: klaviyoHeaders }),
    ]);

    // Parse flows
    let flows: any[] = [];
    if (flowsRes.ok) {
      const flowsData = await flowsRes.json();
      flows = (flowsData.data || []).map((f: any) => ({
        id: f.id,
        name: f.attributes?.name || 'Sin nombre',
        status: f.attributes?.status || 'manual',
        created: f.attributes?.created,
        updated: f.attributes?.updated,
        trigger_type: f.attributes?.trigger_type || null,
      }));
    } else {
      console.warn('[sync-klaviyo-metrics] Flows fetch failed:', flowsRes.status);
      await flowsRes.text();
    }

    // Parse campaigns
    let campaigns: any[] = [];
    if (campaignsRes.ok) {
      const campaignsData = await campaignsRes.json();
      campaigns = (campaignsData.data || []).map((c: any) => ({
        id: c.id,
        name: c.attributes?.name || 'Sin nombre',
        status: c.attributes?.status || 'draft',
        send_time: c.attributes?.send_time || null,
        created_at: c.attributes?.created_at,
        updated_at: c.attributes?.updated_at,
      }));
    } else {
      console.warn('[sync-klaviyo-metrics] Campaigns fetch failed:', campaignsRes.status);
      await campaignsRes.text();
    }

    // Get profiles count from lists (sum all list profile counts)
    let totalProfiles = 0;
    let listsData: any[] = [];
    if (listsRes.ok) {
      const listsJson = await listsRes.json();
      listsData = listsJson.data || [];
      // Use the largest list's profile_count as an estimate (main list)
      // Or fetch profile count for each list
      console.log(`[sync-klaviyo-metrics] Found ${listsData.length} lists`);
    } else {
      const errText = await listsRes.text();
      console.warn('[sync-klaviyo-metrics] Lists fetch failed:', listsRes.status, errText);
    }

    // Fetch profiles count via a simple query
    try {
      const profilesCountRes = await fetch('https://a.klaviyo.com/api/profiles/?page[size]=1', { headers: klaviyoHeaders });
      if (profilesCountRes.ok) {
        const profilesData = await profilesCountRes.json();
        // Try to get total from pagination info
        totalProfiles = profilesData.data?.length || 0;
        if (profilesData.links?.next || profilesData.meta?.page_info?.count) {
          totalProfiles = profilesData.meta?.page_info?.count || listsData.length * 100; // estimate
        }
      } else {
        await profilesCountRes.text();
      }
    } catch (e) {
      console.warn('[sync-klaviyo-metrics] Profiles count error:', e);
    }

    // Fetch flow metrics (values report) for the last 90 days
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    
    let flowMetrics: Record<string, any> = {};
    if (flows.length > 0 && conversionMetricId) {
      try {
        const flowValuesRes = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
          method: 'POST',
          headers: klaviyoHeaders,
          body: JSON.stringify({
            data: {
              type: 'flow-values-report',
              attributes: {
                timeframe: {
                  start: ninetyDaysAgo.toISOString(),
                  end: now.toISOString(),
                },
                conversion_metric_id: conversionMetricId,
                statistics: [
                  'recipients', 'opens', 'clicks',
                  'conversions', 'conversion_value',
                ],
              },
            },
          }),
        });

        if (flowValuesRes.ok) {
          const valuesData = await flowValuesRes.json();
          const results = valuesData.data?.attributes?.results || [];
          for (const result of results) {
            const flowId = result.groupings?.flow_id;
            if (flowId) {
              if (!flowMetrics[flowId]) {
                flowMetrics[flowId] = { recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0 };
              }
              const stats = result.statistics || {};
              flowMetrics[flowId].recipients += (stats.recipients || 0);
              flowMetrics[flowId].opens += (stats.opens || 0);
              flowMetrics[flowId].clicks += (stats.clicks || 0);
              flowMetrics[flowId].conversions += (stats.conversions || 0);
              flowMetrics[flowId].revenue += (stats.conversion_value || 0);
            }
          }
        } else {
          const errText = await flowValuesRes.text();
          console.warn('[sync-klaviyo-metrics] Flow values report failed:', flowValuesRes.status, errText);
        }
      } catch (e) {
        console.warn('[sync-klaviyo-metrics] Flow values report error:', e);
      }
    } else if (flows.length > 0) {
      console.warn('[sync-klaviyo-metrics] No conversion metric found, skipping flow metrics');
    }

    // Fetch campaign metrics
    let campaignMetrics: Record<string, any> = {};
    const sentCampaignIds = campaigns.filter(c => c.status === 'Sent' || c.send_time).map(c => c.id);
    
    if (sentCampaignIds.length > 0 && conversionMetricId) {
      try {
        const campaignValuesRes = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
          method: 'POST',
          headers: klaviyoHeaders,
          body: JSON.stringify({
            data: {
              type: 'campaign-values-report',
              attributes: {
                timeframe: {
                  start: ninetyDaysAgo.toISOString(),
                  end: now.toISOString(),
                },
                conversion_metric_id: conversionMetricId,
                statistics: [
                  'recipients', 'opens', 'clicks',
                  'conversions', 'conversion_value', 'unsubscribes', 'bounces',
                ],
                filter: `in(campaign_id,[${sentCampaignIds.map(id => `"${id}"`).join(',')}])`,
              },
            },
          }),
        });

        if (campaignValuesRes.ok) {
          const valuesData = await campaignValuesRes.json();
          const results = valuesData.data?.attributes?.results || [];
          for (const result of results) {
            const campaignId = result.groupings?.campaign_id;
            if (campaignId) {
              if (!campaignMetrics[campaignId]) {
                campaignMetrics[campaignId] = { recipients: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0, unsubscribes: 0, bounces: 0 };
              }
              const stats = result.statistics || {};
              campaignMetrics[campaignId].recipients += (stats.recipients || 0);
              campaignMetrics[campaignId].opens += (stats.opens || 0);
              campaignMetrics[campaignId].clicks += (stats.clicks || 0);
              campaignMetrics[campaignId].conversions += (stats.conversions || 0);
              campaignMetrics[campaignId].revenue += (stats.conversion_value || 0);
              campaignMetrics[campaignId].unsubscribes += (stats.unsubscribes || 0);
              campaignMetrics[campaignId].bounces += (stats.bounces || 0);
            }
          }
        } else {
          const errText = await campaignValuesRes.text();
          console.warn('[sync-klaviyo-metrics] Campaign values report failed:', campaignValuesRes.status, errText);
        }
      } catch (e) {
        console.warn('[sync-klaviyo-metrics] Campaign values report error:', e);
      }
    }

    // Merge metrics into flows and campaigns
    const enrichedFlows = flows.map(f => ({
      ...f,
      metrics: flowMetrics[f.id] || null,
    }));

    const enrichedCampaigns = campaigns.map(c => ({
      ...c,
      metrics: campaignMetrics[c.id] || null,
    }));

    // Calculate global stats
    const totalFlowRevenue = Object.values(flowMetrics).reduce((sum: number, m: any) => sum + (m.revenue || 0), 0);
    const totalCampaignRevenue = Object.values(campaignMetrics).reduce((sum: number, m: any) => sum + (m.revenue || 0), 0);
    const totalFlowConversions = Object.values(flowMetrics).reduce((sum: number, m: any) => sum + (m.conversions || 0), 0);
    const totalCampaignConversions = Object.values(campaignMetrics).reduce((sum: number, m: any) => sum + (m.conversions || 0), 0);

    const globalStats = {
      totalProfiles,
      totalFlows: flows.length,
      activeFlows: flows.filter(f => f.status === 'live').length,
      totalCampaigns: campaigns.length,
      sentCampaigns: sentCampaignIds.length,
      totalRevenue: totalFlowRevenue + totalCampaignRevenue,
      totalFlowRevenue,
      totalCampaignRevenue,
      totalConversions: totalFlowConversions + totalCampaignConversions,
    };

    console.log(`[sync-klaviyo-metrics] Done: ${flows.length} flows, ${campaigns.length} campaigns`);

    return new Response(
      JSON.stringify({
        flows: enrichedFlows,
        campaigns: enrichedCampaigns,
        globalStats,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[sync-klaviyo-metrics] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
