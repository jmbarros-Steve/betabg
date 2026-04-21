import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { googleAdsQuery } from '../../lib/google-ads-api.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';

/**
 * Cron: search-terms-review (cada 3 días)
 *
 * Analiza search_term_view de cada connection Google activa y genera sugerencias
 * en search_terms_suggestions según reglas:
 *
 *   - clicks >= 3 AND conversions = 0
 *     → add_negative_adgroup (EXACT) — el user pagó sin retorno
 *
 *   - impressions >= 100 AND ctr < 0.5%
 *     → add_negative_campaign (EXACT) — no es relevante, desperdicia cuota
 *
 *   - conversions >= 2 AND status NOT 'ADDED'
 *     → add_keyword (EXACT) — el search_term convierte, agregarlo explícito
 *       para control de bid
 *
 * UNIQUE index (client_id, campaign_id, search_term, suggestion_type) WHERE
 * status='pending' evita duplicados entre runs del cron.
 */
export async function searchTermsReview(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) return c.json({ error: 'GOOGLE_ADS_DEVELOPER_TOKEN not configured' }, 500);

  let totalConnections = 0;
  let totalSuggestionsInserted = 0;
  let totalErrors = 0;
  const errors: string[] = [];

  try {
    // 1) Fetch connections Google activas
    const { data: connections, error: connErr } = await supabase
      .from('platform_connections')
      .select('id, client_id, account_id, access_token_encrypted, refresh_token_encrypted, connection_type')
      .eq('platform', 'google')
      .eq('status', 'active');

    if (connErr) return c.json({ error: 'Failed to fetch connections', details: connErr.message }, 500);
    if (!connections || connections.length === 0) return c.json({ success: true, message: 'No Google connections active' });

    for (const conn of connections) {
      totalConnections++;
      try {
        const tokenInfo = await getGoogleTokenForConnection(supabase, conn as any);
        if (!tokenInfo) {
          errors.push(`conn ${conn.id}: token not available`);
          totalErrors++;
          continue;
        }
        const { accessToken, mccCustomerId } = tokenInfo;
        const customerId = String(conn.account_id || '').replace(/[^0-9]/g, '');
        // loginCustomerId: usa MCC si existe (Leadsie flow) — sino cae al propio customer
        const loginCustomerId = mccCustomerId || customerId;
        if (!customerId) {
          errors.push(`conn ${conn.id}: invalid customer_id`);
          totalErrors++;
          continue;
        }

        // 2) Query search_term_view últimos 7 días
        const query = `
          SELECT
            search_term_view.search_term,
            search_term_view.status,
            ad_group_criterion.keyword.text,
            ad_group_criterion.keyword.match_type,
            campaign.id, campaign.name,
            ad_group.id, ad_group.name,
            metrics.impressions, metrics.clicks, metrics.conversions,
            metrics.cost_micros, metrics.ctr
          FROM search_term_view
          WHERE campaign.advertising_channel_type = 'SEARCH'
            AND campaign.status != 'REMOVED'
            AND ad_group.status != 'REMOVED'
            AND segments.date DURING LAST_7_DAYS
        `;

        const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
        if (!result.ok) {
          errors.push(`conn ${conn.id}: GAQL failed (${result.error})`);
          totalErrors++;
          continue;
        }

        // 3) Agregar por search_term + campaign + ad_group (GAQL con segments.date
        //    devuelve 1 row por día, hay que sumarizar)
        const aggMap = new Map<string, any>();
        for (const row of result.data || []) {
          const st = row.searchTermView?.searchTerm;
          const campaignId = row.campaign?.id;
          const adGroupId = row.adGroup?.id;
          if (!st || !campaignId || !adGroupId) continue;
          const key = `${campaignId}|${adGroupId}|${st}`;
          if (!aggMap.has(key)) {
            aggMap.set(key, {
              search_term: st,
              status: row.searchTermView?.status,
              matched_keyword: row.adGroupCriterion?.keyword?.text || null,
              matched_keyword_match_type: row.adGroupCriterion?.keyword?.matchType || null,
              campaign_id: String(campaignId),
              campaign_name: row.campaign?.name,
              ad_group_id: String(adGroupId),
              ad_group_name: row.adGroup?.name,
              impressions: 0, clicks: 0, conversions: 0, cost_micros: 0,
            });
          }
          const agg = aggMap.get(key)!;
          agg.impressions += Number(row.metrics?.impressions || 0);
          agg.clicks += Number(row.metrics?.clicks || 0);
          agg.conversions += Number(row.metrics?.conversions || 0);
          agg.cost_micros += Number(row.metrics?.costMicros || 0);
        }

        // 4) Aplicar reglas → generar sugerencias
        const suggestions: any[] = [];
        for (const agg of aggMap.values()) {
          const ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions) * 100 : 0;
          const isAlreadyAdded = agg.status === 'ADDED' || agg.status === 'EXCLUDED';

          // Regla 1: convierte → agregar como keyword exact (si no está ADDED ya)
          if (agg.conversions >= 2 && !isAlreadyAdded) {
            suggestions.push({
              client_id: conn.client_id,
              connection_id: conn.id,
              campaign_id: agg.campaign_id,
              campaign_name: agg.campaign_name,
              ad_group_id: agg.ad_group_id,
              ad_group_name: agg.ad_group_name,
              search_term: agg.search_term,
              matched_keyword: agg.matched_keyword,
              matched_keyword_match_type: agg.matched_keyword_match_type,
              impressions: agg.impressions,
              clicks: agg.clicks,
              conversions: agg.conversions,
              cost_micros: agg.cost_micros,
              ctr: Math.round(ctr * 100) / 100,
              suggestion_type: 'add_keyword',
              suggested_match_type: 'EXACT',
              suggestion_reason: `${agg.conversions} conversiones en últimos 7 días — agregar como keyword EXACT para control de bid`,
            });
            continue;
          }

          // Regla 2: clicks >= 3 sin conversions → negative ad_group
          if (agg.clicks >= 3 && agg.conversions === 0 && !isAlreadyAdded) {
            suggestions.push({
              client_id: conn.client_id,
              connection_id: conn.id,
              campaign_id: agg.campaign_id,
              campaign_name: agg.campaign_name,
              ad_group_id: agg.ad_group_id,
              ad_group_name: agg.ad_group_name,
              search_term: agg.search_term,
              matched_keyword: agg.matched_keyword,
              matched_keyword_match_type: agg.matched_keyword_match_type,
              impressions: agg.impressions,
              clicks: agg.clicks,
              conversions: agg.conversions,
              cost_micros: agg.cost_micros,
              ctr: Math.round(ctr * 100) / 100,
              suggestion_type: 'add_negative_adgroup',
              suggested_match_type: 'EXACT',
              suggestion_reason: `${agg.clicks} clicks sin conversiones — gastó ${Math.round(agg.cost_micros / 1_000_000)} sin retorno`,
            });
            continue;
          }

          // Regla 3: impressions >= 100 AND ctr < 0.5% → negative campaign
          if (agg.impressions >= 100 && ctr < 0.5 && !isAlreadyAdded) {
            suggestions.push({
              client_id: conn.client_id,
              connection_id: conn.id,
              campaign_id: agg.campaign_id,
              campaign_name: agg.campaign_name,
              ad_group_id: agg.ad_group_id,
              ad_group_name: agg.ad_group_name,
              search_term: agg.search_term,
              matched_keyword: agg.matched_keyword,
              matched_keyword_match_type: agg.matched_keyword_match_type,
              impressions: agg.impressions,
              clicks: agg.clicks,
              conversions: agg.conversions,
              cost_micros: agg.cost_micros,
              ctr: Math.round(ctr * 100) / 100,
              suggestion_type: 'add_negative_campaign',
              suggested_match_type: 'EXACT',
              suggestion_reason: `${agg.impressions} impresiones con CTR ${Math.round(ctr * 100) / 100}% — no relevante, desperdicia cuota`,
            });
          }
        }

        // 5) Insert bulk (UNIQUE constraint en (client, campaign, term, type) WHERE status=pending
        //    evita duplicados de runs previos). Usamos upsert con ignoreDuplicates para no pisar pending existentes.
        if (suggestions.length > 0) {
          const { error: insErr, count } = await supabase
            .from('search_terms_suggestions')
            .upsert(suggestions, {
              onConflict: 'client_id,campaign_id,search_term,suggestion_type',
              ignoreDuplicates: true,
              count: 'exact',
            });
          if (insErr) {
            errors.push(`conn ${conn.id}: insert failed (${insErr.message})`);
            totalErrors++;
          } else {
            totalSuggestionsInserted += count || 0;
          }
        }
      } catch (err: any) {
        errors.push(`conn ${conn.id}: ${err.message}`);
        totalErrors++;
      }
    }

    return c.json({
      success: true,
      connections_processed: totalConnections,
      suggestions_inserted: totalSuggestionsInserted,
      errors_count: totalErrors,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error('[searchTermsReview] fatal:', err);
    return c.json({ error: 'Internal error', details: err.message }, 500);
  }
}
