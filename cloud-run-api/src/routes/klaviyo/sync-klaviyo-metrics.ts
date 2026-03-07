import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

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

async function klaviyoGet(url: string, apiKey: string): Promise<any> {
  const res = await fetch(url, { headers: makeHeaders(apiKey) });
  if (!res.ok) return null;
  return res.json();
}

// Find "Placed Order" metric ID
async function findConversionMetricId(apiKey: string): Promise<string | null> {
  const data: any = await klaviyoGet('https://a.klaviyo.com/api/metrics/', apiKey);
  if (!data) return null;
  const metrics = data.data || [];
  const placed = metrics.find((m: any) => (m.attributes?.name || '').toLowerCase() === 'placed order');
  if (placed) return placed.id;
  const fallback = metrics.find((m: any) => {
    const name = (m.attributes?.name || '').toLowerCase();
    return name.includes('order') || name.includes('purchase');
  });
  return fallback?.id || null;
}

// Fetch flows (single page)
async function fetchFlows(apiKey: string) {
  const data: any = await klaviyoGet('https://a.klaviyo.com/api/flows/', apiKey);
  if (!data) return [];
  return (data.data || []).map((f: any) => ({
    id: f.id,
    name: f.attributes?.name || 'Sin nombre',
    status: f.attributes?.status || 'manual',
    created: f.attributes?.created,
    updated: f.attributes?.updated,
    trigger_type: f.attributes?.trigger_type || null,
  }));
}

// Fetch campaigns (single page, most recent)
async function fetchCampaigns(apiKey: string) {
  const data: any = await klaviyoGet(
    'https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,"email")&sort=-updated_at',
    apiKey
  );
  if (!data) return [];
  return (data.data || []).map((c: any) => ({
    id: c.id,
    name: c.attributes?.name || 'Sin nombre',
    status: c.attributes?.status || 'draft',
    send_time: c.attributes?.send_time || null,
    created_at: c.attributes?.created_at,
    updated_at: c.attributes?.updated_at,
  }));
}

// Fetch lists (first page only -- fast)
async function fetchLists(apiKey: string): Promise<any[]> {
  const data: any = await klaviyoGet('https://a.klaviyo.com/api/lists/', apiKey);
  if (!data) return [];
  return (data.data || []).map((l: any) => ({
    id: l.id,
    name: l.attributes?.name || 'Sin nombre',
    created: l.attributes?.created || null,
    updated: l.attributes?.updated || null,
  }));
}

// Fetch segments (first page only -- fast)
async function fetchSegments(apiKey: string): Promise<any[]> {
  const data: any = await klaviyoGet('https://a.klaviyo.com/api/segments/', apiKey);
  if (!data) return [];
  return (data.data || []).map((s: any) => ({
    id: s.id,
    name: s.attributes?.name || 'Sin nombre',
    created: s.attributes?.created || null,
    updated: s.attributes?.updated || null,
  }));
}

// Count profiles for a single list/segment (1 API call, page[size]=1)
async function countProfiles(apiKey: string, entityType: string, entityId: string): Promise<{ count: number; hasMore: boolean }> {
  try {
    const data: any = await klaviyoGet(
      `https://a.klaviyo.com/api/${entityType}s/${entityId}/profiles/?page[size]=100&fields[profile]=email`,
      apiKey
    );
    if (!data) return { count: 0, hasMore: false };
    const count = (data.data || []).length;
    const hasMore = !!data.links?.next;
    return { count, hasMore };
  } catch {
    return { count: 0, hasMore: false };
  }
}

// Quick total profiles estimate (1 API call)
async function estimateTotalProfiles(apiKey: string): Promise<number | string> {
  const data: any = await klaviyoGet(
    'https://a.klaviyo.com/api/profiles/?page[size]=100&fields[profile]=email',
    apiKey
  );
  if (!data) return 0;
  const count = (data.data || []).length;
  const hasMore = !!data.links?.next;
  return hasMore ? `${count}+` : count;
}

// Flow values report
async function fetchFlowReport(apiKey: string, conversionMetricId: string, timeframe: string) {
  const res = await fetch('https://a.klaviyo.com/api/flow-values-reports/', {
    method: 'POST',
    headers: makePostHeaders(apiKey),
    body: JSON.stringify({
      data: {
        type: 'flow-values-report',
        attributes: {
          statistics: ['opens', 'clicks', 'delivered', 'recipients', 'open_rate', 'click_rate', 'conversion_value', 'unsubscribes', 'conversion_rate', 'conversion_uniques'],
          timeframe: { key: timeframe },
          conversion_metric_id: conversionMetricId,
        },
      },
    }),
  });
  if (!res.ok) return {};
  const data: any = await res.json();
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
  const res = await fetch('https://a.klaviyo.com/api/campaign-values-reports/', {
    method: 'POST',
    headers: makePostHeaders(apiKey),
    body: JSON.stringify({
      data: {
        type: 'campaign-values-report',
        attributes: {
          statistics: ['opens', 'clicks', 'delivered', 'recipients', 'open_rate', 'click_rate', 'conversion_value', 'unsubscribes', 'bounce_rate', 'conversion_rate', 'conversion_uniques'],
          timeframe: { key: timeframe },
          conversion_metric_id: conversionMetricId,
        },
      },
    }),
  });
  if (!res.ok) return {};
  const data: any = await res.json();
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

export async function syncKlaviyoMetrics(c: Context) {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const serviceClient = getSupabaseAdmin();

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const { connectionId, timeframe = 'last_90_days', action } = body;
    if (!connectionId) {
      return c.json({ error: 'connectionId required' }, 400);
    }

    const { data: connection, error: connError } = await serviceClient
      .from('platform_connections')
      .select('*, clients!inner(user_id, client_user_id)')
      .eq('id', connectionId)
      .eq('platform', 'klaviyo')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const { data: apiKey, error: decryptError } = await serviceClient
      .rpc('decrypt_platform_token', { encrypted_token: connection.api_key_encrypted });

    if (decryptError || !apiKey) {
      return c.json({ error: 'Token decryption failed' }, 500);
    }

    // Handle count-profiles action
    if (action === 'count-profiles' && body.entities) {
      const entities = body.entities as { type: string; id: string }[];
      const results: Record<string, { count: number; display: string; hasMore: boolean }> = {};
      await Promise.all(entities.map(async (ent) => {
        const { count, hasMore } = await countProfiles(apiKey, ent.type, ent.id);
        const display = (count >= 100 && hasMore) ? '100+' : count.toLocaleString();
        results[ent.id] = { count, display, hasMore };
      }));
      return c.json({ results });
    }

    // === ALL DATA IN PARALLEL ===
    console.log('[klaviyo] Starting parallel fetch...');
    const t0 = Date.now();

    const [conversionMetricId, flows, campaigns, klaviyoLists, klaviyoSegments, totalProfiles] = await Promise.all([
      findConversionMetricId(apiKey),
      fetchFlows(apiKey),
      fetchCampaigns(apiKey),
      fetchLists(apiKey),
      fetchSegments(apiKey),
      estimateTotalProfiles(apiKey),
    ]);

    console.log(`[klaviyo] Phase 1 done in ${Date.now() - t0}ms: ${flows.length} flows, ${campaigns.length} campaigns, ${klaviyoLists.length} lists, ${klaviyoSegments.length} segments`);

    // === REPORTS + PROFILE COUNTS IN PARALLEL ===
    const t1 = Date.now();

    const [flowMetrics, campaignMetrics, ...allCounts] = await Promise.all([
      conversionMetricId ? fetchFlowReport(apiKey, conversionMetricId, timeframe) : Promise.resolve({}),
      conversionMetricId ? fetchCampaignReport(apiKey, conversionMetricId, timeframe) : Promise.resolve({}),
      ...klaviyoLists.map((l: any) => countProfiles(apiKey, 'list', l.id).then(r => ({ id: l.id, ...r, entityType: 'list' }))),
      ...klaviyoSegments.map((s: any) => countProfiles(apiKey, 'segment', s.id).then(r => ({ id: s.id, ...r, entityType: 'segment' }))),
    ]);

    console.log(`[klaviyo] Phase 2 done in ${Date.now() - t1}ms`);

    const listCounts = allCounts.filter((c: any) => c.entityType === 'list');
    const segCounts = allCounts.filter((c: any) => c.entityType === 'segment');

    // Enrich
    const enrichedFlows = flows.map((f: any) => ({ ...f, metrics: (flowMetrics as any)[f.id] || null }));
    const enrichedCampaigns = campaigns.map((camp: any) => ({ ...camp, metrics: (campaignMetrics as any)[camp.id] || null }));

    const listsWithCounts = klaviyoLists.map((l: any) => {
      const cnt = listCounts.find((lc: any) => lc.id === l.id);
      const count = cnt?.count ?? 0;
      const hasMore = cnt?.hasMore ?? false;
      return { ...l, profile_count: (count >= 100 && hasMore) ? '100+' : count, profile_count_raw: count, has_more: hasMore };
    });

    const segmentsWithCounts = klaviyoSegments.map((s: any) => {
      const cnt = segCounts.find((sc: any) => sc.id === s.id);
      const count = cnt?.count ?? 0;
      const hasMore = cnt?.hasMore ?? false;
      return { ...s, profile_count: (count >= 100 && hasMore) ? '100+' : count, profile_count_raw: count, has_more: hasMore };
    });

    // Global stats
    const allFlowMetrics = Object.values(flowMetrics as Record<string, any>);
    const allCampMetrics = Object.values(campaignMetrics as Record<string, any>);
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
      sentCampaigns: campaigns.filter((camp: any) => camp.send_time).length,
      totalRevenue: totalFlowRevenue + totalCampaignRevenue,
      totalFlowRevenue, totalCampaignRevenue,
      avgOpenRate, avgClickRate, totalConversions,
      conversionMetricId: conversionMetricId || null,
    };

    console.log(`[klaviyo] DONE in ${Date.now() - t0}ms total`);

    return c.json({ flows: enrichedFlows, campaigns: enrichedCampaigns, globalStats, lists: listsWithCounts, segments: segmentsWithCounts });

  } catch (error: any) {
    console.error('[klaviyo] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
