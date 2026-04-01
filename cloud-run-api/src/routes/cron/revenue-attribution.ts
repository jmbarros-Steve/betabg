import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function revenueAttribution(c: Context) {
  const supabase = getSupabaseAdmin();

  try {
    // Find recommendations from 7-14 days ago
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recommendations } = await supabase
      .from('campaign_recommendations')
      .select('campaign_id, connection_id, platform, recommendation_type, recommendation_text, created_at')
      .gte('created_at', fourteenDaysAgo)
      .lte('created_at', sevenDaysAgo);

    if (!recommendations || recommendations.length === 0) {
      return c.json({ success: true, message: 'No recommendations to evaluate' });
    }

    const results: Array<{ campaign_id: string; recommendation: string; roas_before: number; roas_after: number; impact: string }> = [];

    // Group by campaign
    const byCampaign = new Map<string, typeof recommendations>();
    for (const rec of recommendations) {
      if (!byCampaign.has(rec.campaign_id)) byCampaign.set(rec.campaign_id, []);
      byCampaign.get(rec.campaign_id)!.push(rec);
    }

    for (const [campaignId, recs] of byCampaign) {
      const recDate = new Date(recs[0].created_at);
      const beforeStart = new Date(recDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const beforeEnd = recDate.toISOString().split('T')[0];
      const afterStart = beforeEnd;
      const afterEnd = new Date(recDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get before metrics
      const { data: beforeMetrics } = await supabase
        .from('campaign_metrics')
        .select('spend, conversion_value')
        .eq('campaign_id', campaignId)
        .gte('metric_date', beforeStart)
        .lt('metric_date', beforeEnd);

      // Get after metrics
      const { data: afterMetrics } = await supabase
        .from('campaign_metrics')
        .select('spend, conversion_value')
        .eq('campaign_id', campaignId)
        .gte('metric_date', afterStart)
        .lt('metric_date', afterEnd);

      if (!beforeMetrics?.length || !afterMetrics?.length) continue;

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
