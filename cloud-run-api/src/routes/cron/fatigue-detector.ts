import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { metaApiJson } from '../../lib/meta-fetch.js';
import { sendAlertEmail } from '../../lib/send-alert-email.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Fatigue Detector — Paso D.5
 * Detects creative fatigue on active Meta campaigns:
 * - CTR drop >20% from peak in last 7 days (using last 3 days avg)
 * - Frequency >3 (audience seeing ad too many times)
 *
 * When fatigue is detected:
 * - Creates a task to rotate the creative
 * - Suggests best-performing angle from creative_history
 * - Logs to qa_log
 *
 * Cron: 0 11 * * * (daily 11am)
 * Auth: X-Cron-Secret header
 */

interface MetaConnection {
  id: string;
  client_id: string;
  connection_type: string | null;
  account_id: string | null;
  clients: { id: string; name: string }[] | { id: string; name: string } | null;
}

interface InsightDay {
  ctr: string;
  cpm: string;
  frequency: string;
  date_start: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

export async function fatigueDetector(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const fatigueAlerts: Array<{
    client_name: string;
    campaign_name: string;
    ctr_drop_pct: number;
    frequency: number;
    suggested_angle: string;
  }> = [];

  // Get all active Meta connections
  const { data: connections, error: connError } = await supabase
    .from('platform_connections')
    .select('id, client_id, connection_type, account_id, clients(id, name)')
    .eq('platform', 'meta')
    .eq('is_active', true);

  if (connError || !connections) {
    console.error('[fatigue-detector] Failed to fetch connections:', connError);
    return c.json({ error: 'Failed to fetch connections' }, 500);
  }

  for (const conn of connections as MetaConnection[]) {
    const token = await getTokenForConnection(supabase, {
      id: conn.id,
      connection_type: conn.connection_type ?? undefined,
    });
    if (!token) continue;

    const adAccountId = conn.account_id;
    if (!adAccountId) continue;

    // Fetch active campaigns
    const campaignsResult = await metaApiJson<{ data: Campaign[] }>(
      `/act_${adAccountId}/campaigns`,
      token,
      {
        params: {
          fields: 'id,name,status',
          effective_status: '["ACTIVE"]',
          limit: '50',
        },
      }
    );

    if (!campaignsResult.ok) {
      console.warn(`[fatigue-detector] Failed to fetch campaigns for ${adAccountId}`);
      continue;
    }

    const campaigns = campaignsResult.data?.data || [];

    for (const campaign of campaigns) {
      // Get daily insights for last 7 days
      const insightsResult = await metaApiJson<{ data: InsightDay[] }>(
        `/${campaign.id}/insights`,
        token,
        {
          params: {
            fields: 'ctr,cpm,frequency',
            time_increment: '1',
            date_preset: 'last_7d',
          },
        }
      );

      if (!insightsResult.ok) continue;

      const days = insightsResult.data?.data || [];
      if (days.length < 4) continue; // Need enough data points

      // Calculate CTR metrics
      const allCTRs = days.map((d) => parseFloat(d.ctr || '0'));
      const peakCTR = Math.max(...allCTRs);
      if (peakCTR === 0) continue;

      // Average CTR of last 3 days
      const recentCTRs = allCTRs.slice(-3);
      const avgRecentCTR = recentCTRs.reduce((a, b) => a + b, 0) / recentCTRs.length;

      // Last day's frequency
      const lastFrequency = parseFloat(days[days.length - 1].frequency || '0');

      // Detect fatigue: CTR dropped >20% from peak AND frequency >3
      const ctrDrop = (peakCTR - avgRecentCTR) / peakCTR;

      if (ctrDrop > 0.20 && lastFrequency > 3) {
        const ctrDropPct = Math.round(ctrDrop * 100);

        // Resolve client from join (may be array or object)
        const client = Array.isArray(conn.clients) ? conn.clients[0] : conn.clients;
        if (!client?.id) continue;
        const shopId = client.id;

        let suggestedAngle = 'testimonio o beneficio';
        let suggestionDetail = 'mejor score histórico';
        if (shopId) {
          // Query all good-performing angles for this client
          const goodAngles = await safeQueryOrDefault<{
            angle: string;
            performance_score: number | null;
            measured_at: string | null;
          }>(
            supabase
              .from('creative_history')
              .select('angle, performance_score, measured_at')
              .eq('client_id', conn.client_id)
              .eq('channel', 'meta')
              .eq('performance_verdict', 'bueno')
              .not('angle', 'is', null),
            [],
            'fatigueDetector.fetchGoodAngles',
          );

          if (goodAngles.length > 0) {
            // Find angles used in the last 30 days (to filter out)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
            const recentAngles = new Set(
              goodAngles
                .filter((a: any) => a.measured_at && a.measured_at >= thirtyDaysAgo)
                .map((a: any) => a.angle)
            );

            // Group by angle and calculate avg score
            const angleScores: Record<string, { total: number; count: number }> = {};
            for (const a of goodAngles) {
              if (!angleScores[a.angle]) angleScores[a.angle] = { total: 0, count: 0 };
              angleScores[a.angle].total += a.performance_score || 0;
              angleScores[a.angle].count++;
            }

            // Rank angles not used recently, by avg score
            const freshAngles = Object.entries(angleScores)
              .filter(([angle]) => !recentAngles.has(angle))
              .map(([angle, data]) => ({
                angle,
                avg_score: Math.round(data.total / data.count),
                count: data.count,
              }))
              .sort((a, b) => b.avg_score - a.avg_score);

            if (freshAngles.length > 0) {
              suggestedAngle = freshAngles[0].angle;
              suggestionDetail = `avg score ${freshAngles[0].avg_score}/100, ${freshAngles[0].count} mediciones, no usado en 30 días`;
            } else {
              // All good angles were used recently — fall back to the best one overall
              const allRanked = Object.entries(angleScores)
                .map(([angle, data]) => ({
                  angle,
                  avg_score: Math.round(data.total / data.count),
                }))
                .sort((a, b) => b.avg_score - a.avg_score);

              if (allRanked.length > 0) {
                suggestedAngle = allRanked[0].angle;
                suggestionDetail = `avg score ${allRanked[0].avg_score}/100 (todos los buenos fueron usados recientemente)`;
              }
            }
          }
        }

        const clientName = client?.name || adAccountId;

        // Create rotation task with smart suggestion
        if (shopId) {
          await supabase.from('tasks').insert({
            title: `Fatiga creativa: ${campaign.name}`,
            description:
              `CTR bajó ${ctrDropPct}% en últimos 3 días (peak: ${peakCTR.toFixed(2)}%, actual: ${avgRecentCTR.toFixed(2)}%). ` +
              `Frequency: ${lastFrequency.toFixed(1)}.\n` +
              `Cliente: ${clientName}\n` +
              `Sugerencia: rotar creative con ángulo "${suggestedAngle}" (${suggestionDetail}).`,
            priority: 'alta',
            type: 'mejora',
            source: 'ojos',
            status: 'pending',
          });
        }

        // Email alert to merchant
        if (shopId) {
          await sendAlertEmail(
            shopId,
            `⚠️ Fatiga de creative: ${campaign.name}`,
            `<h2>Fatiga de creative detectada</h2>
<p>La campaña <strong>${campaign.name}</strong> muestra señales de fatiga:</p>
<ul>
  <li>CTR bajó <strong>${ctrDropPct}%</strong> en los últimos 3 días</li>
  <li>Frequency: <strong>${lastFrequency.toFixed(1)}</strong> (tu audiencia ve el mismo anuncio demasiadas veces)</li>
</ul>
<p><strong>Sugerencia:</strong> Rotar el creative con ángulo "${suggestedAngle}" que ha tenido mejor rendimiento histórico.</p>
<p>— Steve Ads</p>`
          );
        }

        // Log to qa_log
        await supabase.from('qa_log').insert({
          check_type: 'creative_fatigue',
          status: 'warn',
          details: {
            client_name: clientName,
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            peak_ctr: peakCTR,
            recent_avg_ctr: avgRecentCTR,
            ctr_drop_pct: ctrDropPct,
            frequency: lastFrequency,
            suggested_angle: suggestedAngle,
          },
        });

        fatigueAlerts.push({
          client_name: clientName,
          campaign_name: campaign.name,
          ctr_drop_pct: ctrDropPct,
          frequency: lastFrequency,
          suggested_angle: suggestedAngle,
        });

        console.warn(
          `[fatigue-detector] ⚠️ ${clientName} — "${campaign.name}": CTR -${ctrDropPct}%, freq ${lastFrequency.toFixed(1)} → rotate to "${suggestedAngle}"`
        );
      }
    }
  }

  if (fatigueAlerts.length === 0) {
    console.log('[fatigue-detector] No creative fatigue detected across all campaigns');
  } else {
    console.log(`[fatigue-detector] ${fatigueAlerts.length} fatigue alert(s) created`);
  }

  return c.json({
    success: true,
    checked_at: new Date().toISOString(),
    connections_checked: connections.length,
    fatigue_alerts: fatigueAlerts.length,
    alerts: fatigueAlerts,
  });
}
