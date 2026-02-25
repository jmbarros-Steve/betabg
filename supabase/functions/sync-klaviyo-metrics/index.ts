import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const KLAVIYO_REVISION = '2024-10-15';

function makeHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'revision': KLAVIYO_REVISION,
  };
}

function makePostHeaders(apiKey: string) {
  return {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/json',
    'revision': '2025-01-15',
  };
}

// Find "Placed Order" metric ID
async function findConversionMetricId(apiKey: string): Promise<string | null> {
  const res = await fetch('https://a.klaviyo.com/api/metrics/', { headers: makeHeaders(apiKey) });
  if (!res.ok) return null;
  const data = await res.json();
  const metrics = data.data || [];
  const placed = metrics.find((m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order');
  if (placed) return placed.id;
  const fallback = metrics.find((m: any) => {
    const name = (m.attributes?.name || '').toLowerCase();
    return name.includes('order') || name.includes('purchase');
  });
  return fallback?.id || null;
}

// Fetch flows
async function fetchFlows(apiKey: string) {
  const res = await fetch('https://a.klaviyo.com/api/flows/', { headers: makeHeaders(apiKey) });
  if (!res.ok) return [];
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

// Fetch campaigns
async function fetchCampaigns(apiKey: string) {
  console.log('[klaviyo] Fetching campaigns...');
  const url = `https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")&sort=-updated_at&page[size]=50`;
  const res = await fetch(url, { headers: makeHeaders(apiKey) });
  console.log('[klaviyo] Campaigns status:', res.status);
  if (!res.ok) {
    const errText = await res.text();
    console.error('[klaviyo] Campaigns error:', errText);
    return [];
  }
  const data = await res.json();
  console.log('[klaviyo] Campaigns count:', (data.data || []).length);
  return (data.data || []).map((c: any) => ({
    id: c.id,
    name: c.attributes?.name || 'Sin nombre',
    status: c.attributes?.status || 'draft',
    send_time: c.attributes?.send_time || null,
    created_at: c.attributes?.created_at,
    updated_at: c.attributes?.updated_at,
  }));
}

// Fetch lists and segments with profile_count
async function fetchListsAndSegments(apiKey: string): Promise<{ lists: any[]; segments: any[] }> {
  const headers = makeHeaders(apiKey);
  let lists: any[] = [];
  let segments: any[] = [];

  try {
    console.log('[klaviyo] Fetching lists...');
    const listsRes = await fetch(
      'https://a.klaviyo.com/api/lists/?additional-fields[list]=profile_count&page[size]=50',
      { headers }
    );
    console.log('[klaviyo] Lists status:', listsRes.status);
    if (listsRes.ok) {
      const listsData = await listsRes.json();
      console.log('[klaviyo] Lists count:', (listsData.data || []).length);
      lists = (listsData.data || []).map((l: any) => ({
        id: l.id,
        name: l.attributes?.name || 'Sin nombre',
        profile_count: l.attributes?.profile_count || 0,
        created: l.attributes?.created || null,
        updated: l.attributes?.updated || null,
      }));
    } else {
      const errText = await listsRes.text();
      console.error('[klaviyo] Lists error:', errText);
    }

    // Small delay to avoid rate limit
    await new Promise(r => setTimeout(r, 1000));

    console.log('[klaviyo] Fetching segments...');
    const segsRes = await fetch(
      'https://a.klaviyo.com/api/segments/?additional-fields[segment]=profile_count&page[size]=50',
      { headers }
    );
    console.log('[klaviyo] Segments status:', segsRes.status);
    if (segsRes.ok) {
      const segsData = await segsRes.json();
      console.log('[klaviyo] Segments count:', (segsData.data || []).length);
      segments = (segsData.data || []).map((s: any) => ({
        id: s.id,
        name: s.attributes?.name || 'Sin nombre',
        profile_count: s.attributes?.profile_count || 0,
        created: s.attributes?.created || null,
        updated: s.attributes?.updated || null,
      }));
    } else {
      const errText = await segsRes.text();
      console.error('[klaviyo] Segments error:', errText);
    }
  } catch (e: any) {
    console.error('[klaviyo] Lists/segments error:', e.message);
  }

  return { lists, segments };
}

// Get total profile count
async function fetchProfilesCount(apiKey: string): Promise<number> {
  const headers = makeHeaders(apiKey);
  try {
    let count = 0;
    let url: string | null = 'https://a.klaviyo.com/api/profiles/?page[size]=100';
    let pages = 0;
    let hasMore = false;
    while (url && pages < 3) {
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const data = await res.json();
      count += (data.data || []).length;
      url = data.links?.next || null;
      hasMore = !!url;
      pages++;
    }
    return hasMore && pages >= 3 ? 10000 : count;
  } catch (e: any) {
    console.warn('[klaviyo] Profile count error:', e.message);
    return 0;
  }
}

// Flow values report
async function fetchFlowReport(apiKey: string, conversionMetricId: string, timeframe: string) {
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        statistics: ['opens', 'clicks', 'delivered', 'recipients', 'open_rate', 'click_rate', 'conversion_value', 'unsubscribes', 'conversion_rate', 'conversion_uniques'],
        timeframe: { key: timeframe },
        conversion_metric_id: conversionMetricId,
      },
    },
  };
  const res = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
    method: 'POST', headers: makePostHeaders(apiKey), body: JSON.stringify(body),
  });
  if (!res.ok) return {};
  const data = await res.json();
  const metrics: Record<string, any> = {};
  for (const r of (data.data?.attributes?.results || [])) {
    const flowId = r.groupings?.flow_id;
    if (!flowId) continue;
    const s = r.statistics || {};
    metrics[flowId] = {
      delivered: s.delivered || 0, opens: s.opens || 0, clicks: s.clicks || 0,
      revenue: s.conversion_value || 0, unsubscribes: s.unsubscribes || 0,
      recipients: s.recipients || 0, open_rate: s.open_rate || 0,
      click_rate: s.click_rate || 0, conversion_rate: s.conversion_rate || 0,
      conversions: s.conversion_uniques || 0,
    };
  }
  return metrics;
}

// Campaign values report
async function fetchCampaignReport(apiKey: string, conversionMetricId: string, timeframe: string) {
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        statistics: ['opens', 'clicks', 'delivered', 'recipients', 'open_rate', 'click_rate', 'conversion_value', 'unsubscribes', 'bounce_rate', 'conversion_rate', 'conversion_uniques'],
        timeframe: { key: timeframe },
        conversion_metric_id: conversionMetricId,
      },
    },
  };
  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST', headers: makePostHeaders(apiKey), body: JSON.stringify(body),
  });
  if (!res.ok) return {};
  const data = await res.json();
  const metrics: Record<string, any> = {};
  for (const r of (data.data?.attributes?.results || [])) {
    const campaignId = r.groupings?.campaign_id;
    if (!campaignId) continue;
    const s = r.statistics || {};
    metrics[campaignId] = {
      delivered: s.delivered || 0, opens: s.opens || 0, clicks: s.clicks || 0,
      revenue: s.conversion_value || 0, unsubscribes: s.unsubscribes || 0,
      bounce_rate: s.bounce_rate || 0, recipients: s.recipients || 0,
      open_rate: s.open_rate || 0, click_rate: s.click_rate || 0,
      conversion_rate: s.conversion_rate || 0, conversions: s.conversion_uniques || 0,
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

    const body = await req.json();
    const { connectionId, timeframe = 'last_90_days', action, entityType, entityId } = body;
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

    // Handle list-profiles action
    if (action === 'list-profiles' && entityType && entityId) {
      const endpoint = entityType === 'list'
        ? `https://a.klaviyo.com/api/lists/${entityId}/profiles/?page[size]=10`
        : `https://a.klaviyo.com/api/segments/${entityId}/profiles/?page[size]=10`;
      const res = await fetch(endpoint, { headers: makeHeaders(apiKey) });
      if (!res.ok) {
        return new Response(JSON.stringify({ profiles: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const data = await res.json();
      const profiles = (data.data || []).map((p: any) => ({
        email: p.attributes?.email || '—',
        name: [p.attributes?.first_name, p.attributes?.last_name].filter(Boolean).join(' ') || '',
        created: p.attributes?.created || null,
      }));
      return new Response(JSON.stringify({ profiles }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STEP 1: Discover conversion metric
    const conversionMetricId = await findConversionMetricId(apiKey);

    // STEP 2: Parallel fetches — flows, campaigns, profiles in parallel
    // Lists/segments fetched separately with delay to avoid rate limits
    const [flows, campaigns, totalProfiles] = await Promise.all([
      fetchFlows(apiKey),
      fetchCampaigns(apiKey),
      fetchProfilesCount(apiKey),
    ]);

    // Small delay before lists/segments to avoid rate limit
    await new Promise(r => setTimeout(r, 1500));
    const { lists: klaviyoLists, segments: klaviyoSegments } = await fetchListsAndSegments(apiKey);

    // STEP 3: Reports in parallel
    let flowMetrics: Record<string, any> = {};
    let campaignMetrics: Record<string, any> = {};

    if (conversionMetricId) {
      [flowMetrics, campaignMetrics] = await Promise.all([
        fetchFlowReport(apiKey, conversionMetricId, timeframe),
        fetchCampaignReport(apiKey, conversionMetricId, timeframe),
      ]);
    }

    // Enrich
    const enrichedFlows = flows.map((f: any) => ({ ...f, metrics: flowMetrics[f.id] || null }));
    const enrichedCampaigns = campaigns.map((c: any) => ({ ...c, metrics: campaignMetrics[c.id] || null }));

    // Global stats
    const allFlowMetrics = Object.values(flowMetrics) as any[];
    const allCampMetrics = Object.values(campaignMetrics) as any[];
    const allMetrics = [...allFlowMetrics, ...allCampMetrics];

    const totalFlowRevenue = allFlowMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
    const totalCampaignRevenue = allCampMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
    const totalConversions = allMetrics.reduce((s, m) => s + (m.conversions || 0), 0);
    const totalDelivered = allMetrics.reduce((s, m) => s + (m.delivered || 0), 0);
    const avgOpenRate = totalDelivered > 0
      ? allMetrics.reduce((s, m) => s + (m.open_rate || 0) * (m.delivered || 0), 0) / totalDelivered : 0;
    const avgClickRate = totalDelivered > 0
      ? allMetrics.reduce((s, m) => s + (m.click_rate || 0) * (m.delivered || 0), 0) / totalDelivered : 0;

    const globalStats = {
      totalProfiles,
      newProfiles: 0,
      totalFlows: flows.length,
      activeFlows: flows.filter((f: any) => f.status === 'live').length,
      totalCampaigns: campaigns.length,
      sentCampaigns: campaigns.filter((c: any) => c.send_time).length,
      totalRevenue: totalFlowRevenue + totalCampaignRevenue,
      totalFlowRevenue, totalCampaignRevenue,
      avgOpenRate, avgClickRate, totalConversions,
      conversionMetricId: conversionMetricId || null,
    };

    console.log(`[klaviyo] DONE: ${flows.length} flows, ${campaigns.length} campaigns, ${klaviyoLists.length} lists, ${klaviyoSegments.length} segments, profiles: ${totalProfiles}, revenue: $${globalStats.totalRevenue.toFixed(2)}`);

    return new Response(
      JSON.stringify({ flows: enrichedFlows, campaigns: enrichedCampaigns, globalStats, lists: klaviyoLists, segments: klaviyoSegments }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[klaviyo] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
