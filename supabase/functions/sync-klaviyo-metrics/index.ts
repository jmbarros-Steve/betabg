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

// Reporting endpoints need application/vnd.api+json
function makeReportingHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'Content-Type': 'application/vnd.api+json',
    'Accept': 'application/vnd.api+json',
    'revision': KLAVIYO_REVISION,
  };
}

// Discover the "Placed Order" metric ID for conversion tracking
async function findPlacedOrderMetricId(headers: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch('https://a.klaviyo.com/api/metrics/?page[size]=200', { headers });
    if (!res.ok) {
      console.warn('[klaviyo] Metrics list failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const metrics = data.data || [];
    // Look for "Placed Order" metric (Shopify/ecommerce standard)
    const placed = metrics.find((m: any) =>
      m.attributes?.name === 'Placed Order' ||
      m.attributes?.name === 'placed_order'
    );
    if (placed) {
      console.log(`[klaviyo] Found "Placed Order" metric: ${placed.id}`);
      return placed.id;
    }
    // Fallback: look for any order/revenue metric
    const fallback = metrics.find((m: any) =>
      m.attributes?.name?.toLowerCase().includes('order') ||
      m.attributes?.name?.toLowerCase().includes('revenue')
    );
    if (fallback) {
      console.log(`[klaviyo] Using fallback metric: ${fallback.attributes.name} (${fallback.id})`);
      return fallback.id;
    }
    console.warn('[klaviyo] No conversion metric found. Available:', metrics.map((m: any) => m.attributes?.name).join(', '));
    return null;
  } catch (e) {
    console.warn('[klaviyo] Error finding metric:', e);
    return null;
  }
}

async function fetchFlows(headers: Record<string, string>) {
  const res = await fetch('https://a.klaviyo.com/api/flows/?page[size]=50', { headers });
  if (!res.ok) {
    console.warn('[klaviyo] Flows fetch failed:', res.status, await res.text());
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

async function fetchAllCampaigns(headers: Record<string, string>) {
  const allCampaigns: any[] = [];
  const filter = encodeURIComponent("equals(messages.channel,'email')");
  let url: string | null = `https://a.klaviyo.com/api/campaigns/?filter=${filter}&page[size]=50&sort=-updated_at`;

  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn('[klaviyo] Campaigns fetch failed:', res.status, await res.text());
      break;
    }
    const data = await res.json();
    const campaigns = (data.data || []).map((c: any) => ({
      id: c.id,
      name: c.attributes?.name || 'Sin nombre',
      status: c.attributes?.status || 'draft',
      send_time: c.attributes?.send_time || null,
      created_at: c.attributes?.created_at,
      updated_at: c.attributes?.updated_at,
    }));
    allCampaigns.push(...campaigns);
    url = data.links?.next || null;
    // Safety: max 500 campaigns
    if (allCampaigns.length >= 500) break;
  }
  return allCampaigns;
}

async function fetchProfilesCount(headers: Record<string, string>) {
  // Use page[size]=1 to minimize data, just get the total from meta
  const res = await fetch('https://a.klaviyo.com/api/profiles/?page[size]=1', { headers });
  if (!res.ok) {
    console.warn('[klaviyo] Profiles fetch failed:', res.status, await res.text());
    return 0;
  }
  const data = await res.json();
  // Klaviyo returns total count in meta.page_info.count
  const count = data.meta?.page_info?.count ?? data.meta?.total ?? 0;
  console.log(`[klaviyo] Profiles total: ${count}`);
  return count;
}

async function fetchFlowValuesReport(reportingHeaders: Record<string, string>, conversionMetricId: string | null) {
  const body: any = {
    data: {
      type: 'flow-values-report',
      attributes: {
        statistics: [
          'opens', 'clicks', 'conversion_value',
          'unsubscribes', 'open_rate', 'click_rate',
          'delivered', 'recipients',
        ],
        timeframe: { key: 'last_90_days' },
      },
    },
  };
  // conversion_metric_id is REQUIRED
  if (conversionMetricId) {
    body.data.attributes.conversion_metric_id = conversionMetricId;
  } else {
    // Without it, skip the report
    console.warn('[klaviyo] Skipping flow report: no conversion_metric_id');
    return {};
  }

  const res = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
    method: 'POST',
    headers: reportingHeaders,
    body: JSON.stringify(body),
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
      revenue: s.conversion_value || 0,
      unsubscribes: s.unsubscribes || 0,
      recipients: s.recipients || 0,
      open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0,
    };
  }
  console.log(`[klaviyo] Flow metrics fetched for ${Object.keys(metrics).length} flows`);
  return metrics;
}

async function fetchCampaignValuesReport(reportingHeaders: Record<string, string>, conversionMetricId: string | null) {
  const body: any = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        statistics: [
          'opens', 'clicks', 'conversion_value',
          'unsubscribes', 'bounce_rate', 'open_rate',
          'click_rate', 'delivered', 'recipients',
        ],
        timeframe: { key: 'last_90_days' },
      },
    },
  };
  if (conversionMetricId) {
    body.data.attributes.conversion_metric_id = conversionMetricId;
  } else {
    console.warn('[klaviyo] Skipping campaign report: no conversion_metric_id');
    return {};
  }

  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST',
    headers: reportingHeaders,
    body: JSON.stringify(body),
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
      revenue: s.conversion_value || 0,
      unsubscribes: s.unsubscribes || 0,
      bounce_rate: s.bounce_rate || 0,
      recipients: s.recipients || 0,
      open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0,
    };
  }
  console.log(`[klaviyo] Campaign metrics fetched for ${Object.keys(metrics).length} campaigns`);
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

    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return new Response(JSON.stringify({ error: 'Token decryption failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = makeKlaviyoHeaders(apiKey);
    const reportingHeaders = makeReportingHeaders(apiKey);

    // Step 1: Discover the conversion metric ID (required for reporting)
    const conversionMetricId = await findPlacedOrderMetricId(headers);

    // Step 2: Fetch everything in parallel
    const [flows, campaigns, totalProfiles, flowMetrics, campaignMetrics] = await Promise.all([
      fetchFlows(headers),
      fetchAllCampaigns(headers),
      fetchProfilesCount(headers),
      fetchFlowValuesReport(reportingHeaders, conversionMetricId),
      fetchCampaignValuesReport(reportingHeaders, conversionMetricId),
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
    const allMetrics = [...allFlowMetrics, ...allCampMetrics];

    const totalFlowRevenue = allFlowMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
    const totalCampaignRevenue = allCampMetrics.reduce((s, m) => s + (m.revenue || 0), 0);

    const avgOpenRate = allMetrics.length > 0
      ? allMetrics.reduce((s, m) => s + (m.open_rate || 0), 0) / allMetrics.length
      : 0;
    const avgClickRate = allMetrics.length > 0
      ? allMetrics.reduce((s, m) => s + (m.click_rate || 0), 0) / allMetrics.length
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
      totalConversions: allMetrics.reduce((s, m) => s + (m.recipients || 0), 0),
    };

    console.log(`[klaviyo] Done: ${flows.length} flows, ${campaigns.length} campaigns, flowMetrics: ${Object.keys(flowMetrics).length}, campMetrics: ${Object.keys(campaignMetrics).length}, profiles: ${totalProfiles}`);

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
