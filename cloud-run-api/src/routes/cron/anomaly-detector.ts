import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function anomalyDetector(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  let anomaliesDetected = 0;

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();

    // Get today's metrics per connection
    const { data: todayMetrics } = await supabase
      .from('campaign_metrics')
      .select('connection_id, spend, conversion_value, impressions, clicks')
      .eq('metric_date', todayStr);

    if (!todayMetrics || todayMetrics.length === 0) {
      return c.json({ success: true, anomaliesDetected: 0 });
    }

    // Get historical metrics for same day of week (last 8 weeks)
    const historicalDates: string[] = [];
    for (let w = 1; w <= 8; w++) {
      const d = new Date(today.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      historicalDates.push(d.toISOString().split('T')[0]);
    }

    const { data: historicalMetrics } = await supabase
      .from('campaign_metrics')
      .select('connection_id, metric_date, spend, conversion_value, impressions')
      .in('metric_date', historicalDates);

    if (!historicalMetrics || historicalMetrics.length === 0) {
      return c.json({ success: true, anomaliesDetected: 0 });
    }

    // Group by connection
    const todayByConn: Record<string, { revenue: number; spend: number }> = {};
    for (const m of todayMetrics) {
      if (!todayByConn[m.connection_id]) todayByConn[m.connection_id] = { revenue: 0, spend: 0 };
      todayByConn[m.connection_id].revenue += Number(m.conversion_value) || 0;
      todayByConn[m.connection_id].spend += Number(m.spend) || 0;
    }

    const histByConn: Record<string, number[]> = {};
    for (const m of historicalMetrics) {
      if (!histByConn[m.connection_id]) histByConn[m.connection_id] = [];
      histByConn[m.connection_id].push(Number(m.conversion_value) || 0);
    }

    // Get connection details
    const connectionIds = Object.keys(todayByConn);
    const { data: connections } = await supabase
      .from('platform_connections')
      .select('id, client_id, platform, clients!inner(name)')
      .in('id', connectionIds);

    const connMap = new Map((connections || []).map(c => [c.id, c]));

    for (const [connId, todayData] of Object.entries(todayByConn)) {
      const historical = histByConn[connId];
      if (!historical || historical.length < 3) continue;

      const avgHistorical = historical.reduce((a, b) => a + b, 0) / historical.length;
      if (avgHistorical < 50) continue; // Skip low-revenue connections

      const deviation = (todayData.revenue - avgHistorical) / avgHistorical;

      if (Math.abs(deviation) < 0.40) continue; // Only flag >40% deviation

      const conn = connMap.get(connId);
      const direction = deviation > 0 ? 'subió' : 'bajó';
      const pct = Math.abs(deviation * 100).toFixed(0);

      const anomaly = {
        client_id: conn?.client_id,
        client_name: (conn?.clients as any)?.name,
        platform: conn?.platform,
        today_revenue: todayData.revenue.toFixed(2),
        avg_revenue: avgHistorical.toFixed(2),
        deviation_pct: `${direction} ${pct}%`,
      };

      await supabase.from('qa_log').insert({
        check_type: 'revenue_anomaly',
        status: deviation < -0.40 ? 'fail' : 'pass',
        details: JSON.stringify(anomaly),
        detected_by: 'anomaly-detector',
      });

      anomaliesDetected++;
    }

    return c.json({ success: true, anomaliesDetected });
  } catch (err: any) {
    console.error('[anomaly-detector]', err);
    return c.json({ error: err.message }, 500);
  }
}
