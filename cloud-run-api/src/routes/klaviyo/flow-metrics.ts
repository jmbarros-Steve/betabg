import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import {
  KLAVIYO_BASE, KLAVIYO_REVISION,
  makeKlaviyoGetHeaders, makeKlaviyoPostHeaders,
  findConversionMetricId,
} from './_helpers.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * GET /api/klaviyo/flow-metrics?connection_id=xxx&flow_id=yyy&timeframe=last_90_days
 * Returns metrics for a specific Klaviyo flow.
 */
export async function klaviyoFlowMetrics(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isInternal = c.get('isInternal') === true;

    let userId: string | null = null;
    if (!isInternal) {
      const user = c.get('user');
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
      userId = user.id;
    }

    const connectionId = c.req.query('connection_id');
    const flowId = c.req.query('flow_id');
    const timeframe = c.req.query('timeframe') || 'last_90_days';

    if (!connectionId || !flowId) {
      return c.json({ error: 'connection_id and flow_id are required' }, 400);
    }

    // Verify connection + ownership
    const conn = await safeQuerySingleOrDefault<any>(
      supabase
        .from('platform_connections')
        .select('api_key_encrypted, clients!inner(user_id, client_user_id)')
        .eq('id', connectionId)
        .eq('platform', 'klaviyo')
        .single(),
      null,
      'klaviyoFlowMetrics.getConnection',
    );

    if (!conn?.api_key_encrypted) {
      return c.json({ error: 'Klaviyo connection not found' }, 404);
    }

    if (!isInternal) {
      const client = (conn as any).clients as { user_id: string; client_user_id: string | null };
      if (client.user_id !== userId && client.client_user_id !== userId) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const { data: apiKey } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: conn.api_key_encrypted,
    });
    if (!apiKey) return c.json({ error: 'Failed to decrypt API key' }, 500);

    // Find conversion metric (Placed Order) — shared helper
    const conversionMetricId = await findConversionMetricId(apiKey);

    if (!conversionMetricId) {
      return c.json({ error: 'No conversion metric found in Klaviyo account' }, 404);
    }

    // Fetch flow details
    const flowRes = await fetch(`${KLAVIYO_BASE}/flows/${flowId}/`, {
      headers: makeKlaviyoGetHeaders(apiKey),
    });

    let flowName = 'Unknown';
    let flowStatus = 'unknown';
    if (flowRes.ok) {
      const flowData = await flowRes.json() as any;
      flowName = flowData.data?.attributes?.name || 'Unknown';
      flowStatus = flowData.data?.attributes?.status || 'unknown';
    }

    // Fetch flow values report
    const reportRes = await fetch(`${KLAVIYO_BASE}/flow-values-reports/`, {
      method: 'POST',
      headers: makeKlaviyoPostHeaders(apiKey),
      body: JSON.stringify({
        data: {
          type: 'flow-values-report',
          attributes: {
            statistics: [
              'opens', 'clicks', 'delivered', 'recipients',
              'open_rate', 'click_rate', 'conversion_value',
              'unsubscribes', 'conversion_rate', 'conversion_uniques',
            ],
            timeframe: { key: timeframe },
            conversion_metric_id: conversionMetricId,
            filter: `equals(flow_id,"${flowId}")`,
          },
        },
      }),
    });

    if (!reportRes.ok) {
      const err = await reportRes.text();
      return c.json({ error: 'Failed to fetch flow report', detail: err }, 500);
    }

    const reportData = await reportRes.json() as any;
    const results = reportData.data?.attributes?.results || [];

    // Aggregate across all messages in this flow
    const agg = {
      delivered: 0, opens: 0, clicks: 0, revenue: 0,
      unsubscribes: 0, recipients: 0, conversions: 0,
    };

    for (const r of results) {
      if (r.groupings?.flow_id !== flowId) continue;
      const s = r.statistics || {};
      agg.delivered += s.delivered || 0;
      agg.opens += s.opens || 0;
      agg.clicks += s.clicks || 0;
      agg.revenue += s.conversion_value || 0;
      agg.unsubscribes += s.unsubscribes || 0;
      agg.recipients += s.recipients || 0;
      agg.conversions += s.conversion_uniques || 0;
    }

    return c.json({
      flow_id: flowId,
      flow_name: flowName,
      flow_status: flowStatus,
      timeframe,
      metrics: {
        ...agg,
        open_rate: agg.delivered > 0 ? agg.opens / agg.delivered : 0,
        click_rate: agg.delivered > 0 ? agg.clicks / agg.delivered : 0,
        conversion_rate: agg.delivered > 0 ? agg.conversions / agg.delivered : 0,
      },
    });
  } catch (error: any) {
    console.error('[klaviyo/flow-metrics] Error:', error);
    return c.json({ error: error.message }, 500);
  }
}
