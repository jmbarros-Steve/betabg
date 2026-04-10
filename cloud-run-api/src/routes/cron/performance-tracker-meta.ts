import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault, safeQueryOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * D.1 — Performance Tracker Meta
 *
 * Measures Meta campaigns 48-72hrs after creation.
 * Fetches CTR, CPA, ROAS, spend, impressions, clicks, conversions
 * from Graph API, calculates a performance score, and compares
 * against the merchant's historical average.
 *
 * Cron: 0 8 * * * (daily 8am)
 * Auth: X-Cron-Secret header
 */

const META_API_VERSION = 'v21.0';

interface MetricInsight {
  impressions?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

function calculatePerformanceScore(
  ctr: number,
  roas: number | null,
  cpa: number | null
): { score: number; verdict: string } {
  let score = 50; // base neutro

  // CTR scoring
  if (ctr > 2.0) score += 20;
  else if (ctr > 1.0) score += 10;
  else if (ctr < 0.5) score -= 20;

  // ROAS scoring
  if (roas !== null) {
    if (roas > 3.0) score += 20;
    else if (roas > 1.5) score += 10;
    else if (roas < 1.0) score -= 20;
  }

  // CPA scoring (CLP)
  if (cpa !== null) {
    if (cpa < 5000) score += 10;
    else if (cpa > 15000) score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const verdict = score >= 65 ? 'bueno' : score >= 40 ? 'neutro' : 'malo';

  return { score, verdict };
}

export async function performanceTrackerMeta(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();

  // Find creatives published 48-72hrs ago with no metrics yet
  const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 72 * 3600000).toISOString();

  const { data: unmeasured, error: fetchError } = await supabase
    .from('creative_history')
    .select('id, client_id, shop_id, meta_campaign_id, channel')
    .eq('channel', 'meta')
    .is('measured_at', null)
    .gte('created_at', threeDaysAgo)
    .lte('created_at', twoDaysAgo);

  if (fetchError) {
    console.error('[perf-tracker-meta] Fetch error:', fetchError);
    return c.json({ error: fetchError.message }, 500);
  }

  if (!unmeasured || unmeasured.length === 0) {
    return c.json({ success: true, message: 'No campaigns to measure', measured: 0 });
  }

  console.log(`[perf-tracker-meta] Found ${unmeasured.length} campaigns to measure`);

  let measured = 0;
  let errors = 0;

  for (const creative of unmeasured) {
    try {
      if (!creative.meta_campaign_id) {
        console.warn(`[perf-tracker-meta] Creative ${creative.id} has no meta_campaign_id, skipping`);
        continue;
      }

      // Get Meta token for this client (handles SUAT for bm_partner/leadsie + OAuth)
      const clientId = creative.client_id || creative.shop_id;
      const connection = await safeQuerySingleOrDefault<{
        id: string;
        access_token_encrypted: string | null;
        connection_type: string | null;
      }>(
        supabase
          .from('platform_connections')
          .select('id, access_token_encrypted, connection_type')
          .eq('client_id', clientId)
          .eq('platform', 'meta')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle() as any,
        null,
        'performanceTrackerMeta.fetchActiveMetaConnection',
      );

      if (!connection) {
        console.warn(`[perf-tracker-meta] No active Meta connection for client ${clientId}`);
        continue;
      }

      const token = await getTokenForConnection(supabase, {
        id: connection.id,
        connection_type: connection.connection_type ?? undefined,
        access_token_encrypted: connection.access_token_encrypted,
      });
      if (!token) {
        console.warn(`[perf-tracker-meta] Failed to resolve token for client ${clientId}`);
        continue;
      }

      // Fetch insights from Meta Graph API (token in header, not URL)
      const insightsUrl =
        `https://graph.facebook.com/${META_API_VERSION}/${creative.meta_campaign_id}/insights?` +
        `fields=impressions,clicks,spend,actions,action_values,cost_per_action_type,ctr`;

      const response = await fetch(insightsUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        console.error(`[perf-tracker-meta] Meta API ${response.status} for campaign ${creative.meta_campaign_id}`);
        errors++;
        continue;
      }

      let metricsJson: { data?: MetricInsight[] };
      try {
        metricsJson = await response.json() as { data?: MetricInsight[] };
      } catch {
        console.error(`[perf-tracker-meta] Non-JSON response for campaign ${creative.meta_campaign_id}`);
        errors++;
        continue;
      }
      if (!metricsJson.data || metricsJson.data.length === 0) {
        console.log(`[perf-tracker-meta] No insight data for campaign ${creative.meta_campaign_id}`);
        continue;
      }

      const d = metricsJson.data[0];
      const impressions = parseInt(d.impressions || '0');
      const clicks = parseInt(d.clicks || '0');
      const spend = parseFloat(d.spend || '0');
      const ctr = parseFloat(d.ctr || '0');

      // Find purchase conversions
      const purchaseAction = (d.actions || []).find(
        (a) => a.action_type === 'purchase'
      );
      const conversions = purchaseAction ? (parseInt(purchaseAction.value, 10) || 0) : 0;
      const cpa = conversions > 0 ? spend / conversions : null;

      // ROAS from real revenue (action_values purchase), fallback to null
      const purchaseValue = (d.action_values || []).find(
        (a: any) => a.action_type === 'purchase'
      );
      const revenue = purchaseValue ? parseFloat(purchaseValue.value) : 0;
      const roas = spend > 0 && revenue > 0 ? revenue / spend : null;

      // Calculate performance score
      const { score, verdict } = calculatePerformanceScore(ctr, roas, cpa);

      // Compare against merchant's historical average (last 10 measured campaigns)
      const avgData = await safeQueryOrDefault<{
        meta_ctr: number | null;
        meta_cpa: number | null;
        meta_roas: number | null;
      }>(
        supabase
          .from('creative_history')
          .select('meta_ctr, meta_cpa, meta_roas')
          .eq('client_id', creative.client_id)
          .eq('channel', 'meta')
          .not('meta_ctr', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10),
        [],
        'performanceTrackerMeta.fetchHistoricalAvg',
      );

      let benchmarkComparison: Record<string, any> = {};
      if (avgData.length > 0) {
        const avgCTR = avgData.reduce((s, r) => s + (Number(r.meta_ctr) || 0), 0) / avgData.length;
        const avgROAS = avgData.reduce((s, r) => s + (Number(r.meta_roas) || 0), 0) / avgData.length;

        benchmarkComparison = {
          merchant_avg_ctr: Math.round(avgCTR * 100) / 100,
          merchant_avg_roas: Math.round(avgROAS * 100) / 100,
          vs_avg_ctr: avgCTR > 0 ? `${(((ctr - avgCTR) / avgCTR) * 100).toFixed(1)}%` : null,
          vs_avg_roas: avgROAS > 0 && roas ? `${(((roas - avgROAS) / avgROAS) * 100).toFixed(1)}%` : null,
          sample_size: avgData.length,
        };
      }

      // Update creative_history with metrics
      const { error: updateErr } = await supabase
        .from('creative_history')
        .update({
          meta_ctr: ctr,
          meta_cpa: cpa,
          meta_roas: roas,
          meta_spend: spend,
          meta_impressions: impressions,
          meta_clicks: clicks,
          meta_conversions: conversions,
          performance_score: score,
          performance_verdict: verdict,
          benchmark_comparison: benchmarkComparison,
          measured_at: new Date().toISOString(),
        })
        .eq('id', creative.id);

      if (updateErr) {
        console.error(`[perf-tracker-meta] Failed to update creative_history ${creative.id}:`, updateErr);
        continue;
      }

      console.log(
        `[perf-tracker-meta] ${creative.meta_campaign_id}: CTR=${ctr}%, ROAS=${roas?.toFixed(2) ?? 'N/A'}, score=${score} (${verdict})`
      );

      measured++;
    } catch (err: any) {
      console.error(`[perf-tracker-meta] Error measuring creative ${creative.id}:`, err.message);
      errors++;
    }
  }

  return c.json({
    success: true,
    measured_at: new Date().toISOString(),
    total_candidates: unmeasured.length,
    measured,
    errors,
  });
}
