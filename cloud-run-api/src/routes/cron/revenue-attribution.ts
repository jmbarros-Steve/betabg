import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

export async function revenueAttribution(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();

  try {
    // Find recommendations from 7-14 days ago
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const recommendations = await safeQuery<{ campaign_id: string; connection_id: string; platform: string; recommendation_type: string; recommendation_text: string; created_at: string }>(
      supabase
        .from('campaign_recommendations')
        .select('campaign_id, connection_id, platform, recommendation_type, recommendation_text, created_at')
        .gte('created_at', fourteenDaysAgo)
        .lte('created_at', sevenDaysAgo),
      'revenueAttribution.fetchRecommendations',
    );

    if (recommendations.length === 0) {
      return c.json({ success: true, message: 'No recommendations to evaluate' });
    }

    const results: Array<{ campaign_id: string; recommendation: string; roas_before: number; roas_after: number; impact: string }> = [];

    // Group by campaign
    const byCampaign = new Map<string, typeof recommendations>();
    for (const rec of recommendations) {
      if (!byCampaign.has(rec.campaign_id)) byCampaign.set(rec.campaign_id, []);
      byCampaign.get(rec.campaign_id)!.push(rec);
    }

    // Batch-fetch ALL campaign_metrics for all campaigns in one query to avoid N+1
    const allCampaignIds = [...byCampaign.keys()];

    // Compute the widest possible date range across all campaigns
    let globalMinDate = Infinity;
    let globalMaxDate = -Infinity;
    for (const [, recs] of byCampaign) {
      const recTime = new Date(recs[0].created_at).getTime();
      const before = recTime - 7 * 24 * 60 * 60 * 1000;
      const after = recTime + 7 * 24 * 60 * 60 * 1000;
      if (before < globalMinDate) globalMinDate = before;
      if (after > globalMaxDate) globalMaxDate = after;
    }
    const globalStart = new Date(globalMinDate).toISOString().split('T')[0];
    const globalEnd = new Date(globalMaxDate).toISOString().split('T')[0];

    const allMetrics = await safeQuery<{ campaign_id: string; metric_date: string; spend: number | string; conversion_value: number | string }>(
      supabase
        .from('campaign_metrics')
        .select('campaign_id, metric_date, spend, conversion_value')
        .in('campaign_id', allCampaignIds)
        .gte('metric_date', globalStart)
        .lt('metric_date', globalEnd),
      'revenueAttribution.fetchAllMetrics',
    );

    // Index metrics by campaign_id for fast lookup
    const metricsByCampaign = new Map<string, typeof allMetrics>();
    for (const m of allMetrics) {
      if (!metricsByCampaign.has(m.campaign_id)) metricsByCampaign.set(m.campaign_id, []);
      metricsByCampaign.get(m.campaign_id)!.push(m);
    }

    for (const [campaignId, recs] of byCampaign) {
      const recDate = new Date(recs[0].created_at);
      const beforeStart = new Date(recDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const beforeEnd = recDate.toISOString().split('T')[0];
      const afterStart = beforeEnd;
      const afterEnd = new Date(recDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Filter from pre-fetched metrics in memory
      const campaignMetrics = metricsByCampaign.get(campaignId) || [];
      const beforeMetrics = campaignMetrics.filter(m => m.metric_date >= beforeStart && m.metric_date < beforeEnd);
      const afterMetrics = campaignMetrics.filter(m => m.metric_date >= afterStart && m.metric_date < afterEnd);

      if (!beforeMetrics.length || !afterMetrics.length) continue;

      const beforeSpend = beforeMetrics.reduce((a, m) => a + (Number(m.spend) || 0), 0);
      const beforeRevenue = beforeMetrics.reduce((a, m) => a + (Number(m.conversion_value) || 0), 0);
      const afterSpend = afterMetrics.reduce((a, m) => a + (Number(m.spend) || 0), 0);
      const afterRevenue = afterMetrics.reduce((a, m) => a + (Number(m.conversion_value) || 0), 0);

      const roasBefore = beforeSpend > 0 ? beforeRevenue / beforeSpend : 0;
      const roasAfter = afterSpend > 0 ? afterRevenue / afterSpend : 0;

      if (roasBefore === 0) continue;

      const change = ((roasAfter - roasBefore) / roasBefore * 100);
      const impact = change > 0 ? `+${change.toFixed(0)}%` : `${change.toFixed(0)}%`;

      results.push({
        campaign_id: campaignId,
        recommendation: recs[0].recommendation_text.slice(0, 100),
        roas_before: roasBefore,
        roas_after: roasAfter,
        impact,
      });
    }

    // Log attribution results
    if (results.length > 0) {
      await supabase.from('qa_log').insert({
        check_type: 'revenue_attribution',
        status: 'pass',
        details: JSON.stringify({
          campaigns_evaluated: results.length,
          positive_impact: results.filter(r => r.roas_after > r.roas_before).length,
          negative_impact: results.filter(r => r.roas_after < r.roas_before).length,
          results,
        }),
        detected_by: 'revenue-attribution',
      });
    }

    return c.json({ success: true, results });
  } catch (err: any) {
    console.error('[revenue-attribution]', err);
    return c.json({ error: err.message }, 500);
  }
}
