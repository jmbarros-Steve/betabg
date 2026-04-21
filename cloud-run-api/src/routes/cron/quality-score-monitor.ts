import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { googleAdsQuery } from '../../lib/google-ads-api.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';

/**
 * Cron: quality-score-monitor (diario)
 *
 * Para cada connection Google activa:
 *   1. GAQL: keyword_view con quality_info.quality_score (hoy)
 *   2. Snapshot en keyword_quality_score_history (upsert por criterion + date)
 *   3. Compara con snapshot de HACE 7 DÍAS del mismo criterion:
 *      - Si bajó ≥2 puntos → registra en qa_log como warning
 *      - Si QS < 4 → warning crítico
 *
 * Por ahora solo registra en logs; el componente QS insights del frontend
 * lee directo de keyword_quality_score_history para mostrar trend chart.
 */
export async function qualityScoreMonitor(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) return c.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' }, 500);

  let totalConnections = 0;
  let totalKeywordsSnapshotted = 0;
  let totalDrops = 0;
  let totalLowQs = 0;
  const errors: string[] = [];

  try {
    const { data: connections, error: connErr } = await supabase
      .from('platform_connections')
      .select('id, client_id, account_id, access_token_encrypted, refresh_token_encrypted, connection_type')
      .eq('platform', 'google')
      .eq('status', 'active');

    if (connErr) return c.json({ error: 'Failed to fetch connections', details: connErr.message }, 500);
    if (!connections || connections.length === 0) return c.json({ success: true, message: 'No Google connections' });

    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const conn of connections) {
      totalConnections++;
      try {
        const tokenInfo = await getGoogleTokenForConnection(supabase, conn as any);
        if (!tokenInfo) { errors.push(`conn ${conn.id}: token not available`); continue; }
        const { accessToken, mccCustomerId } = tokenInfo;
        const customerId = String(conn.account_id || '').replace(/[^0-9]/g, '');
        if (!customerId) { errors.push(`conn ${conn.id}: invalid customer_id`); continue; }
        const loginCustomerId = mccCustomerId || customerId;

        // 1) Fetch QS actual (keywords activas con QS disponible)
        const query = `
          SELECT
            ad_group_criterion.criterion_id,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            ad_group_criterion.quality_info.quality_score,
            ad_group_criterion.quality_info.creative_quality_score,
            ad_group_criterion.quality_info.post_click_quality_score,
            ad_group_criterion.quality_info.search_predicted_ctr,
            campaign.id, ad_group.id
          FROM keyword_view
          WHERE campaign.advertising_channel_type = 'SEARCH'
            AND campaign.status != 'REMOVED'
            AND ad_group.status != 'REMOVED'
            AND ad_group_criterion.status = 'ENABLED'
            AND ad_group_criterion.negative = FALSE
        `;
        const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
        if (!result.ok) { errors.push(`conn ${conn.id}: GAQL failed`); continue; }

        // 2) Upsert snapshot
        const snapshots: any[] = [];
        for (const row of result.data || []) {
          const qs = row.adGroupCriterion?.qualityInfo?.qualityScore;
          if (qs == null) continue; // Google solo devuelve QS si hay suficiente tráfico
          snapshots.push({
            client_id: conn.client_id,
            connection_id: conn.id,
            campaign_id: String(row.campaign?.id),
            ad_group_id: String(row.adGroup?.id),
            criterion_id: String(row.adGroupCriterion?.criterionId),
            keyword_text: row.adGroupCriterion?.keyword?.text,
            match_type: row.adGroupCriterion?.keyword?.matchType,
            quality_score: Number(qs),
            expected_ctr: row.adGroupCriterion?.qualityInfo?.searchPredictedCtr || null,
            ad_relevance: row.adGroupCriterion?.qualityInfo?.creativeQualityScore || null,
            landing_page_experience: row.adGroupCriterion?.qualityInfo?.postClickQualityScore || null,
            snapshot_date: today,
          });
        }

        if (snapshots.length > 0) {
          // Upsert con onConflict (client, criterion, snapshot_date) → 1 snapshot/día
          const { error: insErr } = await supabase
            .from('keyword_quality_score_history')
            .upsert(snapshots, {
              onConflict: 'client_id,criterion_id,snapshot_date',
              ignoreDuplicates: false,
            });
          if (insErr) errors.push(`conn ${conn.id}: insert failed ${insErr.message}`);
          else totalKeywordsSnapshotted += snapshots.length;
        }

        // 3) Detectar caídas vs hace 7 días + escribir qa_log para alerts (B2)
        const criterionIds = snapshots.map(s => s.criterion_id);
        const alerts: any[] = [];
        if (criterionIds.length > 0) {
          const { data: oldSnapshots } = await supabase
            .from('keyword_quality_score_history')
            .select('criterion_id, quality_score, keyword_text')
            .eq('client_id', conn.client_id)
            .eq('snapshot_date', sevenDaysAgo)
            .in('criterion_id', criterionIds);

          const oldMap = new Map<string, { qs: number; text: string }>();
          (oldSnapshots || []).forEach((o: any) => {
            oldMap.set(o.criterion_id, { qs: o.quality_score, text: o.keyword_text });
          });

          for (const snap of snapshots) {
            const old = oldMap.get(snap.criterion_id);
            const drop = old ? old.qs - snap.quality_score : 0;
            const dropDetected = drop >= 2;
            const lowQs = snap.quality_score < 4;

            if (dropDetected) totalDrops++;
            if (lowQs) totalLowQs++;

            // B2: alert qa_log — schema real: {check_type, status, details, detected_by, shop_id}
            // (Isidora W6 review: corregido shape match con anomaly-detector.ts + predictive-alerts.ts)
            if (dropDetected || lowQs) {
              const status = snap.quality_score < 3 || drop >= 4 ? 'fail' : 'warn';
              const summary = lowQs
                ? `QS bajo (${snap.quality_score}/10) en keyword "${snap.keyword_text}"`
                : `QS bajó ${drop}pt en keyword "${snap.keyword_text}" (${old!.qs} → ${snap.quality_score})`;
              alerts.push({
                check_type: 'quality_score_drop',
                status,
                detected_by: 'quality-score-monitor',
                shop_id: conn.client_id,
                details: JSON.stringify({
                  summary,
                  campaign_id: snap.campaign_id,
                  ad_group_id: snap.ad_group_id,
                  criterion_id: snap.criterion_id,
                  keyword: snap.keyword_text,
                  current_qs: snap.quality_score,
                  previous_qs: old?.qs || null,
                  drop_pts: drop,
                  expected_ctr: snap.expected_ctr,
                  ad_relevance: snap.ad_relevance,
                  landing_page_experience: snap.landing_page_experience,
                }),
              });
            }
          }

          // Bulk insert en qa_log si hay alerts
          if (alerts.length > 0) {
            const { error: logErr } = await supabase.from('qa_log').insert(alerts);
            if (logErr) {
              errors.push(`conn ${conn.id}: qa_log insert failed (${logErr.message})`);
            }
          }
        }
      } catch (err: any) {
        errors.push(`conn ${conn.id}: ${err.message}`);
      }
    }

    return c.json({
      success: true,
      connections_processed: totalConnections,
      keywords_snapshotted: totalKeywordsSnapshotted,
      drops_detected: totalDrops,
      low_qs_count: totalLowQs,
      errors_count: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error('[qualityScoreMonitor] fatal:', err);
    return c.json({ error: 'Internal error', details: err.message }, 500);
  }
}
