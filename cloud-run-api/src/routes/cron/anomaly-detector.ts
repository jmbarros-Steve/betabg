import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

export async function anomalyDetector(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  let anomaliesDetected = 0;

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();

    // Get today's metrics per connection
    const todayMetrics = await safeQuery<{ connection_id: string; spend: number | string; conversion_value: number | string; impressions: number; clicks: number }>(
      supabase
        .from('campaign_metrics')
        .select('connection_id, spend, conversion_value, impressions, clicks')
        .eq('metric_date', todayStr),
      'anomalyDetector.fetchTodayMetrics',
    );

    if (todayMetrics.length === 0) {
      return c.json({ success: true, anomaliesDetected: 0 });
    }

    // Get historical metrics for same day of week (last 8 weeks)
    const historicalDates: string[] = [];
    for (let w = 1; w <= 8; w++) {
      const d = new Date(today.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      historicalDates.push(d.toISOString().split('T')[0]);
    }

    const historicalMetrics = await safeQuery<{ connection_id: string; metric_date: string; spend: number | string; conversion_value: number | string; impressions: number }>(
      supabase
        .from('campaign_metrics')
        .select('connection_id, metric_date, spend, conversion_value, impressions')
        .in('metric_date', historicalDates),
      'anomalyDetector.fetchHistoricalMetrics',
    );

    if (historicalMetrics.length === 0) {
      return c.json({ success: true, anomaliesDetected: 0 });
    }

    // Group by connection
    const todayByConn: Record<string, { revenue: number; spend: number }> = {};
    for (const m of todayMetrics) {
      if (!todayByConn[m.connection_id]) todayByConn[m.connection_id] = { revenue: 0, spend: 0 };
      const revVal = Number(m.conversion_value);
      todayByConn[m.connection_id].revenue += isNaN(revVal) ? 0 : revVal;
      const spendVal = Number(m.spend);
      todayByConn[m.connection_id].spend += isNaN(spendVal) ? 0 : spendVal;
    }

    const histByConn: Record<string, number[]> = {};
    for (const m of historicalMetrics) {
      if (!histByConn[m.connection_id]) histByConn[m.connection_id] = [];
      const histVal = Number(m.conversion_value);
      histByConn[m.connection_id].push(isNaN(histVal) ? 0 : histVal);
    }

    // Get connection details
    const connectionIds = Object.keys(todayByConn);
    const connections = await safeQuery<{ id: string; client_id: string; platform: string; clients: { name: string } | { name: string }[] }>(
      supabase
        .from('platform_connections')
        .select('id, client_id, platform, clients!inner(name)')
        .in('id', connectionIds),
      'anomalyDetector.fetchConnections',
    );

    const connMap = new Map(connections.map(c => [c.id, c]));

    for (const [connId, todayData] of Object.entries(todayByConn)) {
      const historical = histByConn[connId];
      if (!historical || historical.length < 3) continue;

      const avgHistorical = historical.reduce((a, b) => a + b, 0) / historical.length;
      if (avgHistorical < 50) continue; // Skip low-revenue connections

      const deviation = (todayData.revenue - avgHistorical) / avgHistorical;

      const deviationThreshold = parseFloat(process.env.ANOMALY_DEVIATION_THRESHOLD || '0.40');
      if (Math.abs(deviation) < deviationThreshold) continue;

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
