/**
 * POST /api/competitor/scrape-seo
 *
 * Pulls SEO intelligence for a competitor via DataForSEO:
 *   - organic traffic overview
 *   - top ranked keywords (1000)
 *   - backlinks summary + top backlinks (100)
 *   - top pages by traffic
 *   - content gap vs the client's own ranked keywords
 *
 * Persists into competitor_seo_keywords / competitor_seo_backlinks /
 * competitor_seo_pages and updates competitor_intelligence.analysis_status.
 *
 * Owner: Ignacio W17 (Métricas & Analytics)
 */

import type { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';
import {
  getOrganicTrafficOverview,
  getRankedKeywords,
  getBacklinksSummary,
  getBacklinksTop,
  getDomainPages,
  resetCost,
  getAccumulatedCost,
} from '../../lib/competitor/dataforseo-client.js';
import type {
  ScrapeSeoRequest,
  SeoIntelligence,
  SeoKeyword,
  SeoBacklink,
  SeoPage,
  CostTracking,
} from '../../lib/competitor/types.js';

const CHILE_LOCATION_CODE = 2152;
const DEFAULT_LANGUAGE = 'es';
const MAX_KEYWORDS = 1000;
const MAX_BACKLINKS = 100;
const MAX_PAGES = 50;
const CONTENT_GAP_TOP_N = 50; // competitor must be in top N to count
const CLIENT_NOT_RANKING_THRESHOLD = 50; // client must NOT be in top N to count as gap

interface IntelligenceWithClient {
  id: string;
  client_id: string;
  competitor_url: string;
  clients: {
    id: string;
    user_id: string | null;
    client_user_id: string | null;
    website?: string | null;
  } | null;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function mapKeyword(item: any, isNew = false, isLost = false): SeoKeyword {
  return {
    keyword: item.keyword_data?.keyword ?? item.keyword ?? '',
    position: item.ranked_serp_element?.serp_item?.rank_absolute ?? item.rank_absolute ?? 0,
    search_volume: item.keyword_data?.keyword_info?.search_volume ?? item.search_volume,
    keyword_difficulty:
      item.keyword_data?.keyword_properties?.keyword_difficulty ??
      item.keyword_difficulty,
    traffic_estimate: item.ranked_serp_element?.serp_item?.estimated_paid_traffic_cost ??
      item.etv ?? item.estimated_traffic,
    url_ranking: item.ranked_serp_element?.serp_item?.url ?? item.url,
    serp_features: item.ranked_serp_element?.serp_item?.serp_item_types ?? [],
    is_new: isNew,
    is_lost: isLost,
  };
}

function mapBacklink(item: any): SeoBacklink {
  return {
    source_url: item.url_from ?? '',
    source_domain: item.domain_from ?? '',
    domain_rank: item.domain_from_rank ?? item.rank,
    anchor_text: item.anchor,
    link_type: item.semantic_location ?? item.item_type ?? 'unknown',
    first_seen: item.first_seen,
    is_lost: item.is_lost ?? false,
  };
}

function mapPage(item: any): SeoPage {
  return {
    url: item.page_address ?? item.url ?? '',
    traffic_estimate: item.metrics?.organic?.etv ?? item.etv ?? 0,
    keywords_count: item.metrics?.organic?.count ?? item.count ?? 0,
    top_keyword: item.top_keyword?.keyword,
  };
}

export async function scrapeSeo(c: Context) {
  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();
  resetCost();

  // Auth
  const user = c.get('user');
  if (!user) return c.json({ error: 'Missing authorization' }, 401);

  // Parse + validate input
  let body: ScrapeSeoRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const { intelligence_id, domain: providedDomain, location_code, language_code } = body;
  if (!intelligence_id) {
    return c.json({ error: 'intelligence_id required' }, 400);
  }

  // Ownership check
  const intel = await safeQuerySingleOrDefault<IntelligenceWithClient>(
    supabase
      .from('competitor_intelligence')
      .select('id, client_id, competitor_url, clients(id, user_id, client_user_id, website)')
      .eq('id', intelligence_id)
      .single(),
    null,
    'scrapeSeo.getIntelligence',
  );

  if (!intel) return c.json({ error: 'Intelligence record not found' }, 404);
  const client = intel.clients;
  if (!client) return c.json({ error: 'Unauthorized' }, 403);
  const { isSuperAdmin } = await getUserClientIds(supabase, user.id);
  if (
    !isSuperAdmin &&
    client.user_id !== user.id &&
    client.client_user_id !== user.id
  ) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const competitorDomain = extractDomain(providedDomain || intel.competitor_url);
  const clientDomain = client.website ? extractDomain(client.website) : null;
  const locationCode = location_code ?? CHILE_LOCATION_CODE;
  const languageCode = language_code ?? DEFAULT_LANGUAGE;

  console.log(
    `[scrape-seo] intelligence=${intelligence_id} competitor=${competitorDomain} client=${clientDomain ?? 'none'} loc=${locationCode}`,
  );

  // Mark running
  await supabase
    .from('competitor_intelligence')
    .update({ analysis_status: 'running' })
    .eq('id', intelligence_id);

  // Parallel calls — Promise.allSettled so partial data still flows
  const apiCalls: CostTracking['api_calls'] = [];
  const callStart = Date.now();

  const [overviewRes, keywordsRes, backlinksSummaryRes, backlinksTopRes, pagesRes, clientKeywordsRes] =
    await Promise.allSettled([
      getOrganicTrafficOverview(competitorDomain, String(locationCode)),
      getRankedKeywords(competitorDomain, String(locationCode), MAX_KEYWORDS),
      getBacklinksSummary(competitorDomain),
      getBacklinksTop(competitorDomain, MAX_BACKLINKS),
      getDomainPages(competitorDomain, String(locationCode), MAX_PAGES),
      clientDomain
        ? getRankedKeywords(clientDomain, String(locationCode), MAX_KEYWORDS)
        : Promise.resolve({ data: null, cost: 0, error: 'no client domain' }),
    ]);

  const trackCall = (name: string, res: PromiseSettledResult<any>) => {
    const cost = res.status === 'fulfilled' ? (res.value?.cost ?? 0) : 0;
    apiCalls.push({
      provider: 'dataforseo',
      endpoint: name,
      cost_usd: cost,
      duration_ms: Date.now() - callStart,
    });
  };

  trackCall('organic_overview', overviewRes);
  trackCall('ranked_keywords', keywordsRes);
  trackCall('backlinks_summary', backlinksSummaryRes);
  trackCall('backlinks_top', backlinksTopRes);
  trackCall('domain_pages', pagesRes);
  if (clientDomain) trackCall('client_ranked_keywords', clientKeywordsRes);

  // Extract data with graceful fallback. DataForSEO responses are deeply
  // nested and untyped; we cast to `any` for the JSON path digging below.
  const overview: any = overviewRes.status === 'fulfilled' ? overviewRes.value.data : null;
  const keywordsData: any = keywordsRes.status === 'fulfilled' ? keywordsRes.value.data : null;
  const backlinksSummary: any =
    backlinksSummaryRes.status === 'fulfilled' ? backlinksSummaryRes.value.data : null;
  const backlinksTop: any =
    backlinksTopRes.status === 'fulfilled' ? backlinksTopRes.value.data : null;
  const pagesData: any = pagesRes.status === 'fulfilled' ? pagesRes.value.data : null;
  const clientKeywordsData: any =
    clientKeywordsRes.status === 'fulfilled' ? clientKeywordsRes.value.data : null;

  // Detect "DataForSEO not configured" — all calls returned null with config error
  const allFailed = apiCalls.every((c2) => c2.cost_usd === 0) && !overview && !keywordsData;
  const configMissing =
    overviewRes.status === 'fulfilled' &&
    overviewRes.value.error?.toLowerCase().includes('not configured');

  if (configMissing) {
    return c.json(
      {
        error: 'DataForSEO not configured',
        details: 'Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to Cloud Run secrets',
      },
      503,
    );
  }

  // Map keywords (top by traffic)
  const keywordItems = Array.isArray(keywordsData?.tasks?.[0]?.result?.[0]?.items)
    ? keywordsData.tasks[0].result[0].items
    : Array.isArray(keywordsData?.items)
      ? keywordsData.items
      : [];
  const competitorKeywords: SeoKeyword[] = keywordItems.map((it: any) => mapKeyword(it));

  // Build client keyword set for content gap
  const clientKwItems = Array.isArray(clientKeywordsData?.tasks?.[0]?.result?.[0]?.items)
    ? clientKeywordsData.tasks[0].result[0].items
    : Array.isArray(clientKeywordsData?.items)
      ? clientKeywordsData.items
      : [];
  const clientKeywordPositions = new Map<string, number>();
  for (const it of clientKwItems) {
    const kw = (it.keyword_data?.keyword ?? it.keyword ?? '').toLowerCase().trim();
    const pos = it.ranked_serp_element?.serp_item?.rank_absolute ?? it.rank_absolute ?? 999;
    if (kw) clientKeywordPositions.set(kw, pos);
  }

  // Content gap: competitor in top N AND (client not ranking OR client > threshold)
  const contentGap: SeoKeyword[] = competitorKeywords.filter((kw) => {
    if (kw.position > CONTENT_GAP_TOP_N) return false;
    const clientPos = clientKeywordPositions.get(kw.keyword.toLowerCase().trim());
    return clientPos === undefined || clientPos > CLIENT_NOT_RANKING_THRESHOLD;
  });

  // Map backlinks
  const backlinkItems = Array.isArray(backlinksTop?.tasks?.[0]?.result?.[0]?.items)
    ? backlinksTop.tasks[0].result[0].items
    : Array.isArray(backlinksTop?.items)
      ? backlinksTop.items
      : [];
  const topBacklinks: SeoBacklink[] = backlinkItems.map(mapBacklink);

  // Map pages
  const pageItems = Array.isArray(pagesData?.tasks?.[0]?.result?.[0]?.items)
    ? pagesData.tasks[0].result[0].items
    : Array.isArray(pagesData?.items)
      ? pagesData.items
      : [];
  const topPages: SeoPage[] = pageItems
    .map(mapPage)
    .sort((a: SeoPage, b: SeoPage) => b.traffic_estimate - a.traffic_estimate)
    .slice(0, 20);

  // Aggregate metrics
  const overviewItem = overview?.tasks?.[0]?.result?.[0] ?? overview?.metrics ?? null;
  const backlinksItem = backlinksSummary?.tasks?.[0]?.result?.[0] ?? backlinksSummary ?? null;

  const seoIntel: SeoIntelligence = {
    organic_traffic_monthly: overviewItem?.metrics?.organic?.etv ?? 0,
    organic_traffic_trend_pct: 0, // requires history — populated on later runs
    total_keywords_ranking: overviewItem?.metrics?.organic?.count ?? competitorKeywords.length,
    total_backlinks: backlinksItem?.backlinks ?? 0,
    referring_domains: backlinksItem?.referring_domains ?? 0,
    domain_rank: backlinksItem?.rank ?? 0,
    top_keywords: competitorKeywords.slice(0, 100),
    top_backlinks: topBacklinks.slice(0, 50),
    top_pages: topPages,
    keywords_won_30d: [],
    keywords_lost_30d: [],
    content_gap_keywords: contentGap.slice(0, 100),
    source_quality: 'estimated',
  };

  // Persist — bulk insert with upsert. We delete prior snapshot to keep schema simple.
  const persistErrors: string[] = [];
  await supabase
    .from('competitor_seo_keywords')
    .delete()
    .eq('intelligence_id', intelligence_id);
  if (competitorKeywords.length > 0) {
    const rows = competitorKeywords.slice(0, MAX_KEYWORDS).map((kw) => ({
      intelligence_id,
      keyword: kw.keyword,
      position: kw.position,
      search_volume: kw.search_volume,
      keyword_difficulty: kw.keyword_difficulty,
      traffic_estimate: kw.traffic_estimate,
      url_ranking: kw.url_ranking,
      serp_features: kw.serp_features,
      is_new: kw.is_new,
      is_lost: kw.is_lost,
      captured_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('competitor_seo_keywords').insert(rows);
    if (error) persistErrors.push(`keywords: ${error.message}`);
  }

  await supabase
    .from('competitor_seo_backlinks')
    .delete()
    .eq('intelligence_id', intelligence_id);
  if (topBacklinks.length > 0) {
    const rows = topBacklinks.map((bl) => ({
      intelligence_id,
      source_url: bl.source_url,
      source_domain: bl.source_domain,
      domain_rank: bl.domain_rank,
      anchor_text: bl.anchor_text,
      link_type: bl.link_type,
      first_seen: bl.first_seen,
      is_lost: bl.is_lost,
      captured_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('competitor_seo_backlinks').insert(rows);
    if (error) persistErrors.push(`backlinks: ${error.message}`);
  }

  await supabase
    .from('competitor_seo_pages')
    .delete()
    .eq('intelligence_id', intelligence_id);
  if (topPages.length > 0) {
    const rows = topPages.map((p) => ({
      intelligence_id,
      url: p.url,
      traffic_estimate: p.traffic_estimate,
      keywords_count: p.keywords_count,
      top_keyword: p.top_keyword,
      captured_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('competitor_seo_pages').insert(rows);
    if (error) persistErrors.push(`pages: ${error.message}`);
  }

  // Update master record. CHECK constraint allows pending/running/completed/failed only;
  // a SEO-only run is "completed" from this endpoint's perspective even if other
  // modules (paid-ads, web-crawl) haven't run yet — partial-state semantics live in
  // each module's own row, not in the master status. Persist errors are surfaced in
  // the response payload but don't fail the master row.
  await supabase
    .from('competitor_intelligence')
    .update({
      analysis_status: 'completed',
      last_analyzed_at: new Date().toISOString(),
    })
    .eq('id', intelligence_id);

  const totalCost = getAccumulatedCost();
  const cost_tracking: CostTracking = {
    api_calls: apiCalls,
    total_cost_usd: totalCost,
  };

  console.log(
    `[scrape-seo] done in ${Date.now() - startedAt}ms — ${competitorKeywords.length} keywords, ${topBacklinks.length} backlinks, ${topPages.length} pages, ${contentGap.length} gap, $${totalCost.toFixed(4)}`,
  );

  if (allFailed) {
    return c.json(
      { error: 'All DataForSEO calls failed', details: persistErrors, cost_tracking },
      502,
    );
  }

  const partial =
    persistErrors.length > 0 ||
    [overviewRes, keywordsRes, backlinksSummaryRes, backlinksTopRes, pagesRes].some(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error),
    );

  return c.json({
    success: true,
    partial,
    data: seoIntel,
    cost_tracking,
    persist_errors: persistErrors.length > 0 ? persistErrors : undefined,
  });
}
