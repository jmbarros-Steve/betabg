import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';

export async function predictiveAlerts(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  let alertsSent = 0;

  try {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get recent metrics
    const recentMetrics = await safeQuery<{
      connection_id: string;
      campaign_name: string;
      spend: number | string | null;
      impressions: number | string | null;
      clicks: number | string | null;
      conversions: number | string | null;
      conversion_value: number | string | null;
      metric_date: string;
    }>(
      supabase
        .from('campaign_metrics')
        .select('connection_id, campaign_name, spend, impressions, clicks, conversions, conversion_value, metric_date')
        .gte('metric_date', fourteenDaysAgo),
      'predictiveAlerts.fetchRecentMetrics',
    );

    if (recentMetrics.length === 0) {
      return c.json({ success: true, alertsSent: 0 });
    }

    // Get connection→client mapping with WhatsApp phone
    const connectionIds = [...new Set(recentMetrics.map(m => m.connection_id))];
    const connections = await safeQuery<{ id: string; client_id: string; clients: any }>(
      supabase
        .from('platform_connections')
        .select('id, client_id, clients!inner(name, whatsapp_phone)')
        .in('id', connectionIds),
      'predictiveAlerts.fetchConnectionsWithClient',
    );

    if (connections.length === 0) return c.json({ success: true, alertsSent: 0 });

    const connMap = new Map(connections.map(c => [c.id, c]));

    // Group by connection
    const byConnection: Record<string, typeof recentMetrics> = {};
    for (const m of recentMetrics) {
      if (!byConnection[m.connection_id]) byConnection[m.connection_id] = [];
      byConnection[m.connection_id].push(m);
    }

    for (const [connId, metrics] of Object.entries(byConnection)) {
      const conn = connMap.get(connId);
      if (!conn) continue;
      const client = conn.clients as any;
      if (!client?.whatsapp_phone) continue;

      // Split into recent (3d) and baseline (14d)
      const recent = metrics.filter(m => m.metric_date >= threeDaysAgo);
      const baseline = metrics.filter(m => m.metric_date < threeDaysAgo);

      if (recent.length === 0 || baseline.length === 0) continue;

      const sum = (arr: typeof metrics, key: string) => arr.reduce((a, m) => a + (Number((m as any)[key]) || 0), 0);
      const avg = (total: number, days: number) => days > 0 ? total / days : 0;

      const recentDays = new Set(recent.map(m => m.metric_date)).size;
      const baselineDays = new Set(baseline.map(m => m.metric_date)).size;

      const recentCPM = sum(recent, 'impressions') > 0
        ? (sum(recent, 'spend') / sum(recent, 'impressions')) * 1000 : 0;
      const baselineCPM = sum(baseline, 'impressions') > 0
        ? (sum(baseline, 'spend') / sum(baseline, 'impressions')) * 1000 : 0;

      const recentCTR = sum(recent, 'impressions') > 0
        ? (sum(recent, 'clicks') / sum(recent, 'impressions')) * 100 : 0;
      const baselineCTR = sum(baseline, 'impressions') > 0
        ? (sum(baseline, 'clicks') / sum(baseline, 'impressions')) * 100 : 0;

      const recentROAS = sum(recent, 'spend') > 0
        ? sum(recent, 'conversion_value') / sum(recent, 'spend') : 0;
      const baselineROAS = sum(baseline, 'spend') > 0
        ? sum(baseline, 'conversion_value') / sum(baseline, 'spend') : 0;

      const alerts: string[] = [];

      if (baselineCPM > 0 && Math.abs(recentCPM - baselineCPM) / baselineCPM > 0.25) {
        const direction = recentCPM > baselineCPM ? 'subió' : 'bajó';
        const pct = Math.abs((recentCPM - baselineCPM) / baselineCPM * 100).toFixed(0);
        alerts.push(`CPM ${direction} ${pct}% ($${recentCPM.toFixed(2)} vs $${baselineCPM.toFixed(2)})`);
      }

      if (baselineCTR > 0 && (baselineCTR - recentCTR) / baselineCTR > 0.25) {
        const pct = ((baselineCTR - recentCTR) / baselineCTR * 100).toFixed(0);
        alerts.push(`CTR bajó ${pct}% (${recentCTR.toFixed(2)}% vs ${baselineCTR.toFixed(2)}%)`);
      }

      if (baselineROAS > 0 && (baselineROAS - recentROAS) / baselineROAS > 0.30) {
        const pct = ((baselineROAS - recentROAS) / baselineROAS * 100).toFixed(0);
        alerts.push(`ROAS bajó ${pct}% (${recentROAS.toFixed(2)}x vs ${baselineROAS.toFixed(2)}x)`);
      }

      if (alerts.length === 0) continue;

      const alertText = `⚠️ Alerta para ${client.name}:\n${alerts.join('\n')}\n\nEstos cambios llevan 3 días. Revisa tus campañas.`;

      // Log alert (don't send WA to avoid spam - just log for now)
      await supabase.from('qa_log').insert({
        check_type: 'predictive_alert',
        status: 'warn',
        details: JSON.stringify({
          client_id: conn.client_id,
          client_name: client.name,
          alerts,
          recent: { cpm: recentCPM, ctr: recentCTR, roas: recentROAS },
          baseline: { cpm: baselineCPM, ctr: baselineCTR, roas: baselineROAS },
        }),
        detected_by: 'predictive-alerts',
      });

      alertsSent++;
    }

    return c.json({ success: true, alertsSent });
  } catch (err: any) {
    console.error('[predictive-alerts]', err);
    return c.json({ error: err.message }, 500);
  }
}
