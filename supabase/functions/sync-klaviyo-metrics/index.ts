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

// Fetch campaigns — NO page[size] (Klaviyo rejects it)
async function fetchCampaigns(apiKey: string) {
  console.log('[klaviyo] Fetching campaigns...');
  const url = `https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")&sort=-updated_at`;
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

// Fetch ALL lists with pagination
async function fetchLists(apiKey: string): Promise<any[]> {
  console.log('[klaviyo] Fetching all lists...');
  let allLists: any[] = [];
  let listsUrl: string | null = 'https://a.klaviyo.com/api/lists/';
  while (listsUrl) {
    const res = await fetch(listsUrl, { headers: makeHeaders(apiKey) });
    if (!res.ok) { const e = await res.text(); console.error('[klaviyo] Lists error:', e); break; }
    const data = await res.json();
    const page = (data.data || []).map((l: any) => ({
      id: l.id,
      name: l.attributes?.name || 'Sin nombre',
      created: l.attributes?.created || null,
      updated: l.attributes?.updated || null,
    }));
    allLists = [...allLists, ...page];
    listsUrl = data.links?.next || null;
    if (listsUrl) await new Promise(r => setTimeout(r, 500));
  }
  console.log('[klaviyo] Total lists:', allLists.length);
  return allLists;
}

// Fetch ALL segments with pagination
async function fetchSegments(apiKey: string): Promise<any[]> {
  console.log('[klaviyo] Fetching all segments...');
  let allSegments: any[] = [];
  let segsUrl: string | null = 'https://a.klaviyo.com/api/segments/';
  while (segsUrl) {
    const res = await fetch(segsUrl, { headers: makeHeaders(apiKey) });
    if (!res.ok) { const e = await res.text(); console.error('[klaviyo] Segments error:', e); break; }
    const data = await res.json();
    const page = (data.data || []).map((s: any) => ({
      id: s.id,
      name: s.attributes?.name || 'Sin nombre',
      created: s.attributes?.created || null,
      updated: s.attributes?.updated || null,
    }));
    allSegments = [...allSegments, ...page];
    segsUrl = data.links?.next || null;
    if (segsUrl) await new Promise(r => setTimeout(r, 500));
  }
  console.log('[klaviyo] Total segments:', allSegments.length);
  return allSegments;
}

// Profile KPI estimate: 1 call, page[size]=1000
async function estimateTotalProfiles(apiKey: string): Promise<number> {
  const res = await fetch('https://a.klaviyo.com/api/profiles/?page[size]=1000&fields[profile]=email', { headers: makeHeaders(apiKey) });
  if (!res.ok) return 0;
  const data = await res.json();
  const firstPage = (data.data || []).length;
  const hasNext = !!data.links?.next;
  return hasNext ? 10000 : firstPage;
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

    // Handle count-profiles action (batch count for multiple entities)
    if (action === 'count-profiles' && body.entities) {
      const entities = body.entities as { type: string; id: string }[];
      const results: Record<string, { count: number; display: string; hasMore: boolean }> = {};

      // All in parallel — each requests max 1000 profiles
      const promises = entities.map(async (ent) => {
        try {
          const url = `https://a.klaviyo.com/api/${ent.type}s/${ent.id}/profiles/?page[size]=100&fields[profile]=email`;
          const res = await fetch(url, { headers: makeHeaders(apiKey) });
          if (!res.ok) {
            results[ent.id] = { count: 0, display: '0', hasMore: false };
            return;
          }
          const data = await res.json();
          const count = (data.data || []).length;
          const hasMore = !!data.links?.next;
          const display = (count >= 100 && hasMore) ? '100+' : count.toLocaleString();
          results[ent.id] = { count, display, hasMore };
        } catch {
          results[ent.id] = { count: 0, display: '0', hasMore: false };
        }
      });

      await Promise.all(promises);
      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STEP 1: Discover conversion metric
    const conversionMetricId = await findConversionMetricId(apiKey);
    await new Promise(r => setTimeout(r, 500));

    // STEP 2: Flows + Campaigns + Lists + Segments (sequential with small delays)
    const flows = await fetchFlows(apiKey);
    await new Promise(r => setTimeout(r, 500));
    const campaigns = await fetchCampaigns(apiKey);
    await new Promise(r => setTimeout(r, 500));
    const klaviyoLists = await fetchLists(apiKey);
    await new Promise(r => setTimeout(r, 500));
    const klaviyoSegments = await fetchSegments(apiKey);
    await new Promise(r => setTimeout(r, 500));

    // STEP 3: Count profiles for each list in parallel
    console.log('[klaviyo] Counting profiles for lists and segments...');
    const listCounts = await Promise.all(
      klaviyoLists.map(async (list: any) => {
        try {
          console.log(`[klaviyo] Counting profiles for list ${list.id} "${list.name}"...`);
          const r = await fetch(
            `https://a.klaviyo.com/api/lists/${list.id}/profiles/?page[size]=100&fields[profile]=email`,
            { headers: makeHeaders(apiKey) }
          );
          console.log(`[klaviyo] List ${list.id} response status: ${r.status}`);
          if (!r.ok) {
            const errText = await r.text();
            console.error(`[klaviyo] List ${list.id} error body:`, errText);
            return { id: list.id, count: 0, hasMore: false };
          }
          const d = await r.json();
          const count = (d.data || []).length;
          const hasMore = !!d.links?.next;
          console.log(`[klaviyo] List "${list.name}": ${count} profiles, hasMore: ${hasMore}`);
          return { id: list.id, count, hasMore };
        } catch (e: any) {
          console.error(`[klaviyo] List ${list.id} exception:`, e.message);
          return { id: list.id, count: 0, hasMore: false };
        }
      })
    );

    // STEP 4: Count profiles for each segment in parallel
    const segCounts = await Promise.all(
      klaviyoSegments.map(async (seg: any) => {
        try {
          console.log(`[klaviyo] Counting profiles for segment ${seg.id} "${seg.name}"...`);
          const r = await fetch(
            `https://a.klaviyo.com/api/segments/${seg.id}/profiles/?page[size]=100&fields[profile]=email`,
            { headers: makeHeaders(apiKey) }
          );
          console.log(`[klaviyo] Segment ${seg.id} response status: ${r.status}`);
          if (!r.ok) {
            const errText = await r.text();
            console.error(`[klaviyo] Segment ${seg.id} error body:`, errText);
            return { id: seg.id, count: 0, hasMore: false };
          }
          const d = await r.json();
          const count = (d.data || []).length;
          const hasMore = !!d.links?.next;
          console.log(`[klaviyo] Segment "${seg.name}": ${count} profiles, hasMore: ${hasMore}`);
          return { id: seg.id, count, hasMore };
        } catch (e: any) {
          console.error(`[klaviyo] Segment ${seg.id} exception:`, e.message);
          return { id: seg.id, count: 0, hasMore: false };
        }
      })
    );

    // STEP 5: Total profiles KPI — paginate up to 10 pages of 100
    let totalProfileCount = 0;
    let profilesNextUrl: string | null = 'https://a.klaviyo.com/api/profiles/?page[size]=100&fields[profile]=email';
    let profilePages = 0;
    while (profilesNextUrl && profilePages < 10) {
      const profilesResp = await fetch(profilesNextUrl, { headers: makeHeaders(apiKey) });
      if (!profilesResp.ok) break;
      const profilesData = await profilesResp.json();
      totalProfileCount += (profilesData.data || []).length;
      profilesNextUrl = profilesData.links?.next || null;
      profilePages++;
      if (profilesNextUrl) await new Promise(r => setTimeout(r, 300));
    }
    const hasMoreProfiles = !!profilesNextUrl;
    const totalProfiles: number | string = hasMoreProfiles ? `${totalProfileCount.toLocaleString()}+` : totalProfileCount;
    console.log(`[klaviyo] Total profiles: ${totalProfiles} (${profilePages} pages scanned)`);

    // STEP 6: Reports
    let flowMetrics: Record<string, any> = {};
    let campaignMetrics: Record<string, any> = {};

    if (conversionMetricId) {
      flowMetrics = await fetchFlowReport(apiKey, conversionMetricId, timeframe);
      await new Promise(r => setTimeout(r, 1000));
      campaignMetrics = await fetchCampaignReport(apiKey, conversionMetricId, timeframe);
    }

    // Enrich flows and campaigns
    const enrichedFlows = flows.map((f: any) => ({ ...f, metrics: flowMetrics[f.id] || null }));
    const enrichedCampaigns = campaigns.map((c: any) => ({ ...c, metrics: campaignMetrics[c.id] || null }));

    // Lists with profile counts baked in
    const listsWithCounts = klaviyoLists.map((l: any) => {
      const c = listCounts.find(lc => lc.id === l.id);
      const count = c?.count ?? 0;
      const hasMore = c?.hasMore ?? false;
      return {
        ...l,
        profile_count: (count >= 100 && hasMore) ? '100+' : count,
        profile_count_raw: count,
        has_more: hasMore,
      };
    });

    // Segments with profile counts baked in
    const segmentsWithCounts = klaviyoSegments.map((s: any) => {
      const c = segCounts.find(sc => sc.id === s.id);
      const count = c?.count ?? 0;
      const hasMore = c?.hasMore ?? false;
      return {
        ...s,
        profile_count: (count >= 100 && hasMore) ? '100+' : count,
        profile_count_raw: count,
        has_more: hasMore,
      };
    });

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

    console.log('=== LIST COUNTS ===');
    listsWithCounts.forEach((l: any) => console.log(`"${l.name}": ${l.profile_count}`));
    console.log('=== SEGMENT COUNTS ===');
    segmentsWithCounts.forEach((s: any) => console.log(`"${s.name}": ${s.profile_count}`));
    console.log(`[klaviyo] DONE: ${flows.length} flows, ${campaigns.length} campaigns, ${listsWithCounts.length} lists, ${segmentsWithCounts.length} segments, profiles: ${totalProfiles}, revenue: $${globalStats.totalRevenue.toFixed(2)}`);

    return new Response(
      JSON.stringify({ flows: enrichedFlows, campaigns: enrichedCampaigns, globalStats, lists: listsWithCounts, segments: segmentsWithCounts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[klaviyo] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
