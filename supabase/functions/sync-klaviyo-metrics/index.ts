import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KLAVIYO_REVISION = '2024-10-15';

function makeKlaviyoHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'revision': KLAVIYO_REVISION,
  };
}

async function fetchFlows(headers: Record<string, string>) {
  const res = await fetch('https://a.klaviyo.com/api/flows/', {
    headers,
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[klaviyo] Flows fetch failed:', res.status, err);
    return [];
  }
  const data = await res.json();
  return (data.data || []).map((f: any) => ({
    id: f.id,
    name: f.attributes?.name || 'Sin nombre',
    status: f.attributes?.status || 'manual',
    created: f.attributes?.created,
    updated: f.attributes?.updated,
    trigger_type: f.attributes?.trigger_type || null,
  }));
}

async function fetchCampaigns(headers: Record<string, string>) {
  // Klaviyo requires channel filter for campaigns
  const filter = "equals(messages.channel,'email')";
  const url = `https://a.klaviyo.com/api/campaigns/?filter=${encodeURIComponent(filter)}&sort=-updated_at`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[klaviyo] Campaigns fetch failed:', res.status, err);
    return [];
  }
  const data = await res.json();
  return (data.data || []).map((c: any) => ({
    id: c.id,
    name: c.attributes?.name || 'Sin nombre',
    status: c.attributes?.status || 'draft',
    send_time: c.attributes?.send_time || null,
    created_at: c.attributes?.created_at,
    updated_at: c.attributes?.updated_at,
  }));
}

async function fetchProfilesCount(headers: Record<string, string>) {
  const res = await fetch('https://a.klaviyo.com/api/profiles/', { headers });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[klaviyo] Profiles fetch failed:', res.status, err);
    return 0;
  }
  const data = await res.json();
  // Klaviyo returns total in meta.page_info.count
  if (data.meta?.page_info?.count) return data.meta.page_info.count;
  if (data.meta?.total) return data.meta.total;
  return data.data?.length || 0;
}

async function fetchFlowValuesReport(headers: Record<string, string>) {
  const res = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        type: 'flow-values-report',
        attributes: {
          statistics: [
            'opens', 'clicks', 'revenue',
            'unsubscribes', 'open_rate', 'click_rate',
            'conversion_rate', 'delivered',
          ],
          timeframe: { key: 'last_30_days' },
        },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[klaviyo] Flow values report failed:', res.status, err);
    return {};
  }
  const data = await res.json();
  const results = data.data?.attributes?.results || [];
  const metrics: Record<string, any> = {};
  for (const r of results) {
    const flowId = r.groupings?.flow_id;
    if (!flowId) continue;
    const s = r.statistics || {};
    metrics[flowId] = {
      delivered: s.delivered || 0,
      opens: s.opens || 0,
      clicks: s.clicks || 0,
      revenue: s.revenue || 0,
      unsubscribes: s.unsubscribes || 0,
      open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0,
      conversion_rate: s.conversion_rate || 0,
    };
  }
  return metrics;
}

async function fetchCampaignValuesReport(headers: Record<string, string>) {
  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          statistics: [
            'opens', 'clicks', 'revenue',
            'unsubscribes', 'bounces', 'open_rate',
            'click_rate', 'conversion_rate', 'delivered',
          ],
          timeframe: { key: 'last_30_days' },
        },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.warn('[klaviyo] Campaign values report failed:', res.status, err);
    return {};
  }
  const data = await res.json();
  const results = data.data?.attributes?.results || [];
  const metrics: Record<string, any> = {};
  for (const r of results) {
    const campaignId = r.groupings?.campaign_id;
    if (!campaignId) continue;
    const s = r.statistics || {};
    metrics[campaignId] = {
      delivered: s.delivered || 0,
      opens: s.opens || 0,
      clicks: s.clicks || 0,
      revenue: s.revenue || 0,
      unsubscribes: s.unsubscribes || 0,
      bounces: s.bounces || 0,
      open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0,
      conversion_rate: s.conversion_rate || 0,
    };
  }
  return metrics;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { connectionId } = await req.json();
    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'connectionId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get connection and verify ownership
    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt API key
    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = makeKlaviyoHeaders(apiKey);

    // Fetch everything in parallel
    const [flows, campaigns, totalProfiles, flowMetrics, campaignMetrics] = await Promise.all([
      fetchFlows(headers),
      fetchCampaigns(headers),
      fetchProfilesCount(headers),
      fetchFlowValuesReport(headers),
      fetchCampaignValuesReport(headers),
    ]);

    // Enrich with metrics
    const enrichedFlows = flows.map((f: any) => ({
      ...f,
      metrics: flowMetrics[f.id] || null,
    }));

    const enrichedCampaigns = campaigns.map((c: any) => ({
      ...c,
      metrics: campaignMetrics[c.id] || null,
    }));

    // Global stats
    const allFlowMetrics = Object.values(flowMetrics) as any[];
    const allCampMetrics = Object.values(campaignMetrics) as any[];

    const totalFlowRevenue = allFlowMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
    const totalCampaignRevenue = allCampMetrics.reduce((s, m) => s + (m.revenue || 0), 0);

    const avgOpenRate = [...allFlowMetrics, ...allCampMetrics].length > 0
      ? [...allFlowMetrics, ...allCampMetrics].reduce((s, m) => s + (m.open_rate || 0), 0) / [...allFlowMetrics, ...allCampMetrics].length
      : 0;
    const avgClickRate = [...allFlowMetrics, ...allCampMetrics].length > 0
      ? [...allFlowMetrics, ...allCampMetrics].reduce((s, m) => s + (m.click_rate || 0), 0) / [...allFlowMetrics, ...allCampMetrics].length
      : 0;

    const globalStats = {
      totalProfiles,
      totalFlows: flows.length,
      activeFlows: flows.filter((f: any) => f.status === 'live').length,
      totalCampaigns: campaigns.length,
      sentCampaigns: campaigns.filter((c: any) => c.status === 'Sent' || c.send_time).length,
      totalRevenue: totalFlowRevenue + totalCampaignRevenue,
      totalFlowRevenue,
      totalCampaignRevenue,
      avgOpenRate,
      avgClickRate,
      totalConversions: [...allFlowMetrics, ...allCampMetrics].reduce((s, m) => s + (m.conversion_rate || 0), 0),
    };

    console.log(`[klaviyo] Done: ${flows.length} flows, ${campaigns.length} campaigns, flowMetrics: ${Object.keys(flowMetrics).length}, campMetrics: ${Object.keys(campaignMetrics).length}`);

    return new Response(
      JSON.stringify({ flows: enrichedFlows, campaigns: enrichedCampaigns, globalStats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[klaviyo] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
