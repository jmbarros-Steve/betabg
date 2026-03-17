import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';
import { metaApiJson } from '../../lib/meta-fetch.js';

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
  encrypted_token: string | null;
  meta_ad_account_id: string | null;
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
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
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
    .select('id, client_id, encrypted_token, meta_ad_account_id, clients(id, name)')
    .eq('platform', 'meta')
    .eq('is_active', true);

  if (connError || !connections) {
    console.error('[fatigue-detector] Failed to fetch connections:', connError);
    return c.json({ error: 'Failed to fetch connections' }, 500);
  }

  for (const conn of connections as MetaConnection[]) {
    const token = await decryptPlatformToken(supabase, conn.encrypted_token);
    if (!token) continue;

    const adAccountId = conn.meta_ad_account_id;
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
        const shopId = client?.id;

        let suggestedAngle = 'testimonio o beneficio';
        if (shopId) {
          const { data: bestAngle } = await supabase
            .from('creative_history')
            .select('angle')
            .eq('shop_id', shopId)
            .eq('channel', 'meta')
            .eq('performance_verdict', 'bueno')
            .not('angle', 'is', null)
            .order('performance_score', { ascending: false })
            .limit(1);

          if (bestAngle && bestAngle.length > 0 && bestAngle[0].angle) {
            suggestedAngle = bestAngle[0].angle;
          }
        }

        const clientName = client?.name || adAccountId;

        // Create rotation task
        if (shopId) {
          await supabase.from('tasks').insert({
            title: `Fatiga creativa: ${campaign.name}`,
            description:
              `CTR bajó ${ctrDropPct}% en últimos 3 días (peak: ${peakCTR.toFixed(2)}%, actual: ${avgRecentCTR.toFixed(2)}%). ` +
              `Frequency: ${lastFrequency.toFixed(1)}.\n` +
              `Cliente: ${clientName}\n` +
              `Sugerencia: rotar creative con ángulo "${suggestedAngle}" (mejor score histórico).`,
            priority: 'alta',
            type: 'mejora',
            source: 'ojos',
            status: 'pending',
          });
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
