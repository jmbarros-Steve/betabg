/**
 * POST /api/competitor/generate-scorecard
 *
 * Orquesta Opus 4.7 para generar:
 *   1. Scorecard ejecutivo cliente vs N competidores (1-5).
 *   2. Plan de acción 30/60/90 (opcional).
 *
 * Cruza:
 *   - Datos del cliente (campaign_metrics, platform_metrics paid+revenue,
 *     email_campaigns, buyer_personas, client_financial_config, user_subscriptions).
 *   - Datos de cada competidor (competitor_paid_ads / seo_keywords / seo_backlinks /
 *     seo_pages / social_metrics / catalog / reviews / email_marketing).
 *   - Knowledge inyectado vía steve_knowledge (categorías: competencia, estrategia,
 *     marketing-digital).
 *
 * Persiste:
 *   - 1 row en competitor_scorecards (versión incremental por client_id).
 *   - N rows en competitor_action_plans (1 por action item, periodo 30d/60d/90d).
 *
 * Owner: Tomás W7 (AI / Cerebro). Cross-reviewer pendiente: Isidora W6 + Javiera W12.
 */

import type { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';
import {
  safeQuerySingle,
  safeQuerySingleOrDefault,
  safeQueryOrDefault,
} from '../../lib/safe-supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';
import {
  buildScorecardPrompt,
  buildActionPlanPrompt,
  type ScorecardCompetitorInput,
} from '../../lib/competitor/prompts.js';
import type {
  ActionCategory,
  ActionItem,
  ActionPlan,
  ClientContext,
  CompetitorScorecard,
  CostTracking,
  GenerateScorecardRequest,
  GenerateScorecardResponse,
  ScorecardInsight,
  ScorecardRow,
} from '../../lib/competitor/types.js';

// ============================================================
// Constants
// ============================================================

const MAX_COMPETITORS = 5;
const MIN_COMPETITORS = 1;

const OPUS_MODEL = 'claude-opus-4-6';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_TIMEOUT_MS = 120_000; // 2 min

const OPUS_INPUT_USD_PER_M = 15;
const OPUS_OUTPUT_USD_PER_M = 75;

const ALLOWED_ACTION_CATEGORIES: ActionCategory[] = [
  'paid_meta',
  'paid_google',
  'paid_tiktok',
  'seo',
  'email',
  'social_organic',
  'catalog',
  'ux',
  'pricing',
  'reviews',
  'brand',
];

// ============================================================
// Types (locals)
// ============================================================

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

interface OpusCallResult<T> {
  parsed: T;
  inputTokens: number;
  outputTokens: number;
  rawText: string;
}

interface IntelligenceFullRecord {
  intelligence_id: string;
  competitor_name: string;
  competitor_url: string;
  ig_handle?: string;
  industry?: string;
  notes?: string;
  paid_ads: any[];
  seo_keywords: any[];
  seo_backlinks: any[];
  seo_pages: any[];
  social_metrics: any[];
  catalog_sample: any[];
  reviews: any[];
  email_marketing: any | null;
}

// ============================================================
// Helpers
// ============================================================

function clipString(value: any, max = 500): any {
  if (typeof value !== 'string') return value;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function deriveResources(
  budgetMonthlyClp: number | null | undefined,
  teamSize: number | null | undefined,
): 'low' | 'medium' | 'high' {
  // Use whichever signal is available. If both, prefer the more conservative.
  let byBudget: 'low' | 'medium' | 'high' | null = null;
  let byTeam: 'low' | 'medium' | 'high' | null = null;

  if (typeof budgetMonthlyClp === 'number' && budgetMonthlyClp > 0) {
    if (budgetMonthlyClp < 500_000) byBudget = 'low';
    else if (budgetMonthlyClp <= 2_000_000) byBudget = 'medium';
    else byBudget = 'high';
  }

  if (typeof teamSize === 'number' && teamSize > 0) {
    if (teamSize <= 1) byTeam = 'low';
    else if (teamSize <= 3) byTeam = 'medium';
    else byTeam = 'high';
  }

  // No signals → safe default 'medium'.
  if (!byBudget && !byTeam) return 'medium';
  if (byBudget && !byTeam) return byBudget;
  if (byTeam && !byBudget) return byTeam;

  // Both: take the more conservative (low < medium < high).
  const order: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 1, high: 2 };
  return order[byBudget!] < order[byTeam!] ? byBudget! : byTeam!;
}

function calcOpusCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * OPUS_INPUT_USD_PER_M + outputTokens * OPUS_OUTPUT_USD_PER_M) / 1_000_000;
}

async function logBugRaw(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  context: string,
  rawText: string,
  errorMessage: string,
) {
  try {
    await supabase.from('steve_bugs').insert({
      titulo: `[generate-scorecard] ${context}`,
      descripcion: `${errorMessage}\n\nRAW (first 4KB):\n${rawText.slice(0, 4000)}`,
      severity: 'high',
      categoria: 'analisis',
      activo: true,
    });
  } catch (err) {
    console.error('[generate-scorecard] logBugRaw failed:', (err as Error).message);
  }
}

async function callOpus<T>(
  apiKey: string,
  system: string,
  user: string,
  maxTokens: number,
  context: string,
): Promise<OpusCallResult<T>> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: OPUS_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`[${context}] Anthropic ${resp.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await resp.json()) as AnthropicResponse;
  const rawText = (data.content || [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');

  const cleanText = stripJsonFences(rawText);
  let parsed: T;
  try {
    parsed = JSON.parse(cleanText) as T;
  } catch (err) {
    throw new Error(
      `[${context}] JSON parse failed: ${(err as Error).message}. Raw head: ${cleanText.slice(0, 300)}`,
    );
  }

  return {
    parsed,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    rawText,
  };
}

async function callOpusWithRetry<T>(
  apiKey: string,
  system: string,
  user: string,
  context: string,
): Promise<OpusCallResult<T>> {
  try {
    return await callOpus<T>(apiKey, system, user, 4096, context);
  } catch (err1) {
    const msg1 = (err1 as Error).message;
    console.warn(`[generate-scorecard] ${context} attempt 1 failed: ${msg1}. Retrying with 8192 max_tokens...`);
    try {
      return await callOpus<T>(apiKey, system, user, 8192, context);
    } catch (err2) {
      throw new Error(`${msg1} | retry: ${(err2 as Error).message}`);
    }
  }
}

// ============================================================
// Data loaders
// ============================================================

interface ClientLoadedData {
  client: { id: string; name: string; user_id: string | null; client_user_id: string | null; website_url: string | null };
  buyerPersona: any | null;
  financialConfig: any | null;
  subscription: { tier: 'free' | 'starter' | 'pro' | 'enterprise' } | null;
  paidMetrics: any[];
  shopifyMetrics: any[];
  emailCampaigns: any[];
  previousPlans: any[];
}

async function loadClientData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clientId: string,
): Promise<ClientLoadedData | null> {
  const client = await safeQuerySingleOrDefault<{
    id: string;
    name: string;
    user_id: string | null;
    client_user_id: string | null;
    website_url: string | null;
  }>(
    supabase
      .from('clients')
      .select('id, name, user_id, client_user_id, website_url')
      .eq('id', clientId)
      .single(),
    null,
    'generateScorecard.loadClient',
  );

  if (!client) return null;

  // Resolve owning user_id for subscription lookup. Prefer client_user_id, fallback to user_id.
  const ownerUserId = client.client_user_id || client.user_id;

  const [buyerPersona, financialConfig, paidMetrics, shopifyMetrics, emailCampaigns, previousPlans, subscriptionRow] =
    await Promise.all([
      safeQuerySingleOrDefault<any>(
        supabase
          .from('buyer_personas')
          .select('persona_data, is_complete')
          .eq('client_id', clientId)
          .maybeSingle(),
        null,
        'generateScorecard.buyerPersona',
      ),
      safeQuerySingleOrDefault<any>(
        supabase
          .from('client_financial_config')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle(),
        null,
        'generateScorecard.financialConfig',
      ),
      // Last 90 days paid metrics across all platform_connections of the client.
      safeQueryOrDefault<any>(
        supabase
          .from('campaign_metrics')
          .select(
            'campaign_id, campaign_name, platform, metric_date, impressions, clicks, spend, conversions, conversion_value, ctr, cpc, cpm, roas, currency, platform_connections!inner(client_id)',
          )
          .eq('platform_connections.client_id', clientId)
          .gte('metric_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
          .order('metric_date', { ascending: false })
          .limit(500),
        [],
        'generateScorecard.campaignMetrics',
      ),
      // Shopify revenue/orders/sessions etc.
      safeQueryOrDefault<any>(
        supabase
          .from('platform_metrics')
          .select(
            'metric_date, metric_type, metric_value, currency, platform_connections!inner(client_id, platform)',
          )
          .eq('platform_connections.client_id', clientId)
          .gte('metric_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
          .order('metric_date', { ascending: false })
          .limit(500),
        [],
        'generateScorecard.platformMetrics',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('email_campaigns')
          .select('id, name, subject, status, sent_at, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(50),
        [],
        'generateScorecard.emailCampaigns',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_action_plans')
          .select('id, period, status, scorecard_id, competitor_scorecards!inner(client_id)')
          .eq('competitor_scorecards.client_id', clientId)
          .limit(500),
        [],
        'generateScorecard.previousPlans',
      ),
      ownerUserId
        ? safeQuerySingleOrDefault<any>(
            supabase
              .from('user_subscriptions')
              .select('id, status, plan_id, subscription_plans(slug)')
              .eq('user_id', ownerUserId)
              .maybeSingle(),
            null,
            'generateScorecard.subscription',
          )
        : Promise.resolve(null),
    ]);

  const subscriptionSlug = subscriptionRow?.subscription_plans?.slug;
  const tier: 'free' | 'starter' | 'pro' | 'enterprise' =
    subscriptionSlug && ['free', 'starter', 'pro', 'enterprise'].includes(subscriptionSlug)
      ? subscriptionSlug
      : 'starter';

  return {
    client,
    buyerPersona,
    financialConfig,
    subscription: { tier },
    paidMetrics,
    shopifyMetrics,
    emailCampaigns,
    previousPlans,
  };
}

async function loadCompetitorRecord(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  intelligenceId: string,
  expectedClientId: string,
): Promise<IntelligenceFullRecord | null> {
  const intel = await safeQuerySingleOrDefault<{
    id: string;
    client_id: string;
    competitor_name: string;
    competitor_url: string;
    ig_handle: string | null;
    industry: string | null;
    notes: string | null;
  }>(
    supabase
      .from('competitor_intelligence')
      .select('id, client_id, competitor_name, competitor_url, ig_handle, industry, notes')
      .eq('id', intelligenceId)
      .single(),
    null,
    `generateScorecard.intel.${intelligenceId}`,
  );

  if (!intel) return null;
  if (intel.client_id !== expectedClientId) return null; // ownership mismatch

  const [paidAds, seoKeywords, seoBacklinks, seoPages, socialMetrics, catalog, reviews, emailMarketing] =
    await Promise.all([
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_paid_ads')
          .select(
            'platform, ad_id, ad_url, creative_url, creative_type, copy_text, cta, days_running, first_seen_at, last_seen_at, countries, formats, landing_url',
          )
          .eq('intelligence_id', intelligenceId),
        [],
        'gen.paidAds',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_seo_keywords')
          .select('keyword, position, search_volume, keyword_difficulty, traffic_estimate, url_ranking, is_new, is_lost')
          .eq('intelligence_id', intelligenceId)
          .order('traffic_estimate', { ascending: false, nullsFirst: false })
          .limit(100),
        [],
        'gen.seoKeywords',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_seo_backlinks')
          .select('source_url, source_domain, domain_rank, anchor_text, link_type, first_seen, is_lost')
          .eq('intelligence_id', intelligenceId)
          .order('domain_rank', { ascending: false, nullsFirst: false })
          .limit(50),
        [],
        'gen.seoBacklinks',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_seo_pages')
          .select('url, traffic_estimate, keywords_count, top_keyword')
          .eq('intelligence_id', intelligenceId)
          .order('traffic_estimate', { ascending: false, nullsFirst: false })
          .limit(20),
        [],
        'gen.seoPages',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_social_metrics')
          .select(
            'platform, handle, followers, following, posts_count, avg_engagement_rate, posts_per_month, top_hashtags, bio',
          )
          .eq('intelligence_id', intelligenceId),
        [],
        'gen.social',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_catalog')
          .select(
            'product_name, product_url, price_cents, compare_price_cents, currency, in_stock, is_bestseller, tags, variants_count',
          )
          .eq('intelligence_id', intelligenceId)
          .limit(100),
        [],
        'gen.catalog',
      ),
      safeQueryOrDefault<any>(
        supabase
          .from('competitor_reviews')
          .select(
            'source, total_reviews, avg_rating, distribution, top_positive_words, top_negative_words, recurring_complaints',
          )
          .eq('intelligence_id', intelligenceId),
        [],
        'gen.reviews',
      ),
      safeQuerySingleOrDefault<any>(
        supabase
          .from('competitor_email_marketing')
          .select('*')
          .eq('intelligence_id', intelligenceId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        'gen.emailMkt',
      ),
    ]);

  return {
    intelligence_id: intel.id,
    competitor_name: intel.competitor_name,
    competitor_url: intel.competitor_url,
    ig_handle: intel.ig_handle ?? undefined,
    industry: intel.industry ?? undefined,
    notes: intel.notes ?? undefined,
    paid_ads: paidAds,
    seo_keywords: seoKeywords,
    seo_backlinks: seoBacklinks,
    seo_pages: seoPages,
    social_metrics: socialMetrics,
    catalog_sample: catalog,
    reviews,
    email_marketing: emailMarketing,
  };
}

// ============================================================
// ClientContext builder
// ============================================================

function buildClientContext(
  data: ClientLoadedData,
  computedFlags: { honorsPreviousPlanCompletion: boolean },
): ClientContext {
  const personaData = (data.buyerPersona?.persona_data ?? {}) as Record<string, any>;

  const positioningRaw = (personaData.positioning ?? personaData.tier ?? '').toString().toLowerCase();
  const positioning: ClientContext['positioning'] | undefined =
    positioningRaw === 'premium' ||
    positioningRaw === 'mid' ||
    positioningRaw === 'budget' ||
    positioningRaw === 'luxe'
      ? (positioningRaw as ClientContext['positioning'])
      : undefined;

  const industry =
    typeof personaData.industry === 'string' && personaData.industry.trim().length > 0
      ? personaData.industry
      : 'unknown';

  // Aggregate own paid metrics into a Partial<PaidIntelligence>.
  let totalSpend = 0;
  let totalConv = 0;
  let totalConvValue = 0;
  let totalImpr = 0;
  let totalClicks = 0;
  for (const m of data.paidMetrics) {
    totalSpend += Number(m.spend ?? 0);
    totalConv += Number(m.conversions ?? 0);
    totalConvValue += Number(m.conversion_value ?? 0);
    totalImpr += Number(m.impressions ?? 0);
    totalClicks += Number(m.clicks ?? 0);
  }

  // Aggregate Shopify revenue from platform_metrics.
  let shopifyRevenue = 0;
  let shopifyOrders = 0;
  let shopifySessions = 0;
  for (const m of data.shopifyMetrics) {
    if (m.metric_type === 'revenue') shopifyRevenue += Number(m.metric_value ?? 0);
    else if (m.metric_type === 'orders') shopifyOrders += Number(m.metric_value ?? 0);
    else if (m.metric_type === 'sessions') shopifySessions += Number(m.metric_value ?? 0);
  }

  const completionRatePct = (() => {
    if (data.previousPlans.length === 0) return null;
    const incomplete = data.previousPlans.filter((p) => p.status === 'pending' || p.status === 'in_progress').length;
    return Math.round((incomplete / data.previousPlans.length) * 100);
  })();

  console.log(
    `[generate-scorecard] previous plan completion rate (incomplete pct): ${
      completionRatePct === null ? 'n/a (no previous plans)' : `${completionRatePct}%`
    }`,
  );

  // Surface budget if available — Steve Ads doesn't have a single "budget_monthly_clp"
  // in client_financial_config; the closest signal is total monthly platform spend
  // from campaign_metrics (last 30 days extrapolated). Conservative heuristic.
  const last30dSpend = data.paidMetrics
    .filter((m) => {
      const dt = new Date(m.metric_date);
      return Date.now() - dt.getTime() <= 30 * 24 * 60 * 60 * 1000;
    })
    .reduce((acc, m) => acc + Number(m.spend ?? 0), 0);

  // If currency is USD on most rows, leave as-is; the caller field is named
  // `budget_monthly_clp` but Opus only reads the magnitude — we add a hint via
  // own_metrics.paid.estimated_monthly_spend.
  const budgetMonthlyClp =
    typeof personaData.budget_monthly_clp === 'number' && personaData.budget_monthly_clp > 0
      ? personaData.budget_monthly_clp
      : last30dSpend > 0
        ? Math.round(last30dSpend)
        : undefined;

  const teamSize =
    typeof personaData.team_size_marketing === 'number' && personaData.team_size_marketing > 0
      ? personaData.team_size_marketing
      : undefined;

  const ctx: ClientContext = {
    client_id: data.client.id,
    name: data.client.name,
    url: data.client.website_url ?? '',
    industry,
    positioning,
    resources: deriveResources(budgetMonthlyClp, teamSize),
    budget_monthly_clp: budgetMonthlyClp,
    team_size_marketing: teamSize,
    tier_subscription: data.subscription?.tier ?? 'starter',
    own_metrics: {
      paid: {
        total_ads_active: 0, // unknown without Meta Library scraping for the client
        total_ads_inactive_90d: 0,
        velocity_30d: 0,
        median_age_days: 0,
        ads: [],
        ads_by_format: { image: 0, video: 0, carousel: 0, collection: 0, reel: 0 },
        top_landing_pages: [],
        source_quality: 'hard',
        estimated_monthly_spend:
          last30dSpend > 0
            ? { amount_cents: Math.round(last30dSpend * 100), currency: 'USD' }
            : undefined,
      },
      catalog: shopifyRevenue > 0 ? { total_products: 0, source_quality: 'hard' } : undefined,
      email_marketing:
        data.emailCampaigns.length > 0
          ? {
              subscribed_email: 'self',
              subscribed_at: new Date().toISOString(),
              campaign_emails: [],
              welcome_series: [],
              campaign_frequency_per_week:
                data.emailCampaigns.filter((c) => c.status === 'sent').length / 12, // rough proxy
              avg_subject_length: 0,
              top_hooks: [],
              source_quality: 'hard',
            }
          : undefined,
    },
  };

  // Surface flag inside ctx via metric to inform Opus (for honors_previous_plan_completion).
  // Opus reads the JSON dump verbatim — we just stash it under own_metrics inline.
  (ctx as any).previous_plan_completion_pct = completionRatePct;
  (ctx as any).honors_previous_plan_completion = computedFlags.honorsPreviousPlanCompletion;
  (ctx as any).shopify_summary_90d = {
    revenue: shopifyRevenue,
    orders: shopifyOrders,
    sessions: shopifySessions,
  };
  (ctx as any).paid_summary_90d = {
    spend: totalSpend,
    conversions: totalConv,
    conversion_value: totalConvValue,
    impressions: totalImpr,
    clicks: totalClicks,
  };

  return ctx;
}

function buildScorecardCompetitorInputs(records: IntelligenceFullRecord[]): ScorecardCompetitorInput[] {
  return records.map((r) => {
    const aggregatedSeo = {
      keywords_count: r.seo_keywords.length,
      backlinks_count: r.seo_backlinks.length,
      pages_count: r.seo_pages.length,
      top_keywords: r.seo_keywords.slice(0, 50).map((k) => ({
        keyword: clipString(k.keyword, 200),
        position: k.position,
        search_volume: k.search_volume,
        traffic_estimate: k.traffic_estimate,
        url_ranking: clipString(k.url_ranking, 300),
      })),
      top_backlinks: r.seo_backlinks.slice(0, 25).map((b) => ({
        source_domain: clipString(b.source_domain, 200),
        domain_rank: b.domain_rank,
        anchor_text: clipString(b.anchor_text, 200),
        link_type: b.link_type,
      })),
      top_pages: r.seo_pages.slice(0, 15).map((p) => ({
        url: clipString(p.url, 300),
        traffic_estimate: p.traffic_estimate,
        keywords_count: p.keywords_count,
        top_keyword: clipString(p.top_keyword, 200),
      })),
    };

    return {
      name: r.competitor_name,
      url: r.competitor_url,
      paid_ads: r.paid_ads.slice(0, 50).map((a) => ({
        platform: a.platform,
        ad_id: a.ad_id,
        creative_type: a.creative_type,
        copy_text: clipString(a.copy_text, 800),
        cta: clipString(a.cta, 80),
        days_running: a.days_running,
        first_seen_at: a.first_seen_at,
        last_seen_at: a.last_seen_at,
        countries: a.countries,
        formats: a.formats,
        landing_url: clipString(a.landing_url, 300),
      })),
      seo: aggregatedSeo,
      social: r.social_metrics.map((s) => ({
        platform: s.platform,
        handle: s.handle,
        followers: s.followers,
        posts_count: s.posts_count,
        avg_engagement_rate: s.avg_engagement_rate,
        posts_per_month: s.posts_per_month,
        top_hashtags: s.top_hashtags,
        bio: clipString(s.bio, 500),
      })),
      catalog: {
        sample_size: r.catalog_sample.length,
        sample: r.catalog_sample.slice(0, 50).map((c) => ({
          product_name: clipString(c.product_name, 200),
          price_cents: c.price_cents,
          compare_price_cents: c.compare_price_cents,
          currency: c.currency,
          in_stock: c.in_stock,
          is_bestseller: c.is_bestseller,
          tags: c.tags,
          variants_count: c.variants_count,
        })),
      },
      reviews: r.reviews.map((rv) => ({
        source: rv.source,
        total_reviews: rv.total_reviews,
        avg_rating: rv.avg_rating,
        distribution: rv.distribution,
        top_positive_words: rv.top_positive_words,
        top_negative_words: rv.top_negative_words,
        recurring_complaints: rv.recurring_complaints,
      })),
      web_analysis: null, // not used in this orchestrator (vision lives in scrape-web step)
      email_marketing: r.email_marketing
        ? {
            subscribed_email: r.email_marketing.subscribed_email,
            subscribed_at: r.email_marketing.subscribed_at,
            campaign_frequency_per_week: r.email_marketing.campaign_frequency_per_week,
            captured_emails_count: r.email_marketing.captured_emails_count,
            avg_subject_length: r.email_marketing.avg_subject_length,
            top_hooks: r.email_marketing.top_hooks,
            last_email_received_at: r.email_marketing.last_email_received_at,
          }
        : null,
    };
  });
}

// ============================================================
// Main handler
// ============================================================

export async function generateScorecard(c: Context) {
  const startedAt = Date.now();
  const supabase = getSupabaseAdmin();

  // STEP 1 — Auth & input validation
  const user = c.get('user');
  if (!user) return c.json({ error: 'Missing authorization' }, 401);

  let body: GenerateScorecardRequest;
  try {
    body = (await c.req.json()) as GenerateScorecardRequest;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { client_id, intelligence_ids, include_action_plan } = body || ({} as GenerateScorecardRequest);

  if (!client_id || typeof client_id !== 'string') {
    return c.json({ error: 'client_id required' }, 400);
  }
  if (!Array.isArray(intelligence_ids) || intelligence_ids.length < MIN_COMPETITORS) {
    return c.json({ error: `intelligence_ids must contain at least ${MIN_COMPETITORS} competitor` }, 400);
  }
  if (intelligence_ids.length > MAX_COMPETITORS) {
    return c.json({ error: `intelligence_ids exceeds max of ${MAX_COMPETITORS} competitors` }, 400);
  }
  // Deduplicate input intelligence_ids defensively.
  const uniqueIntelIds = Array.from(new Set(intelligence_ids));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  // STEP 2 — Load client + ownership check.
  // Internal callers (cron / service-key) bypassan via X-Internal-Key (c.get('isInternal'));
  // super_admins (jmbarros) bypassan via user_roles.is_super_admin.
  const clientData = await loadClientData(supabase, client_id);
  if (!clientData) return c.json({ error: 'Client not found' }, 404);
  const isInternal = c.get('isInternal') === true;
  if (!isInternal) {
    if (!user.id) return c.json({ error: 'Unauthorized for this client' }, 403);
    const { isSuperAdmin } = await getUserClientIds(supabase, user.id);
    if (
      !isSuperAdmin &&
      clientData.client.user_id !== user.id &&
      clientData.client.client_user_id !== user.id
    ) {
      return c.json({ error: 'Unauthorized for this client' }, 403);
    }
  }

  // STEP 3 — Load competitor records (and re-verify ownership per intel)
  const records: IntelligenceFullRecord[] = [];
  const skipped: string[] = [];
  for (const intelId of uniqueIntelIds) {
    const rec = await loadCompetitorRecord(supabase, intelId, client_id);
    if (rec) records.push(rec);
    else skipped.push(intelId);
  }
  if (records.length === 0) {
    return c.json(
      {
        error: 'No competitor data available, run scrape endpoints first',
        skipped_intelligence_ids: skipped,
      },
      400,
    );
  }
  if (skipped.length > 0) {
    console.warn(`[generate-scorecard] skipped intel_ids (mismatched/missing): ${skipped.join(', ')}`);
  }

  // STEP 3b — Determine `honors_previous_plan_completion`
  // If client has prior plans where >50% are still pending/in_progress, the new plan
  // honors that fact (i.e., we acknowledge unfinished work and avoid piling on).
  const previousPlanIncompletePct = (() => {
    if (clientData.previousPlans.length === 0) return 0;
    const incomplete = clientData.previousPlans.filter(
      (p) => p.status === 'pending' || p.status === 'in_progress',
    ).length;
    return (incomplete / clientData.previousPlans.length) * 100;
  })();
  const honorsPreviousPlanCompletion =
    clientData.previousPlans.length > 0 && previousPlanIncompletePct > 50;

  // STEP 4 — Knowledge load
  const { knowledgeBlock } = await loadKnowledge(
    ['competencia', 'estrategia', 'marketing-digital'],
    {
      limit: 15,
      label: 'PATRONES ESTRATÉGICOS APRENDIDOS',
      audit: { source: 'generate-scorecard' },
    },
  );

  // STEP 5 — Build prompts and call Opus for scorecard
  const clientContext = buildClientContext(clientData, { honorsPreviousPlanCompletion });
  const competitorInputs = buildScorecardCompetitorInputs(records);

  const { system: scoreSys, user: scoreUser } = buildScorecardPrompt({
    client: {
      name: clientContext.name,
      url: clientContext.url,
      industry: clientContext.industry,
      metrics: clientContext, // serialized as JSON inside the prompt builder
    },
    competitors: competitorInputs,
    knowledgeBlock,
  });

  let scorecardResult: OpusCallResult<any>;
  try {
    scorecardResult = await callOpusWithRetry<any>(apiKey, scoreSys, scoreUser, 'scorecard');
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[generate-scorecard] scorecard call failed:', msg);
    await logBugRaw(supabase, 'scorecard parse/call', '', msg);
    return c.json({ error: 'Failed to generate scorecard', details: msg }, 502);
  }

  const parsedScorecard = scorecardResult.parsed as {
    executive_summary?: string;
    scorecard_table?: Array<any>;
    top_10_insights?: Array<any>;
    competitor_strengths?: Record<string, string[]>;
    competitor_weaknesses?: Record<string, string[]>;
    what_they_know_that_you_dont?: string;
  };

  if (!parsedScorecard || typeof parsedScorecard !== 'object' || !Array.isArray(parsedScorecard.scorecard_table)) {
    await logBugRaw(supabase, 'scorecard shape invalid', scorecardResult.rawText, 'scorecard_table missing');
    return c.json({ error: 'Scorecard JSON shape invalid' }, 500);
  }

  // STEP 6 — (Optional) Action plan
  let actionPlanResult: OpusCallResult<any> | null = null;
  let parsedActionPlan: ActionPlan | undefined;

  if (include_action_plan) {
    const { system: planSys, user: planUser } = buildActionPlanPrompt({
      scorecard: parsedScorecard,
      client: {
        name: clientContext.name,
        industry: clientContext.industry,
        resources: clientContext.resources ?? 'medium',
      },
      knowledgeBlock,
    });

    try {
      actionPlanResult = await callOpusWithRetry<any>(apiKey, planSys, planUser, 'action_plan');
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[generate-scorecard] action_plan call failed (non-fatal):', msg);
      await logBugRaw(supabase, 'action_plan parse/call', '', msg);
      // Non-fatal: we still return scorecard.
    }
  }

  // STEP 7 — Determine version (incremental per client_id)
  const previousVersionRow = await safeQuerySingleOrDefault<{ version: number }>(
    supabase
      .from('competitor_scorecards')
      .select('version')
      .eq('client_id', client_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    null,
    'generateScorecard.versionLookup',
  );
  const nextVersion = (previousVersionRow?.version ?? 0) + 1;

  // STEP 7b — Persist scorecard
  const generatedAt = new Date().toISOString();
  const scorecardForDb = {
    executive_summary: parsedScorecard.executive_summary ?? '',
    table: parsedScorecard.scorecard_table ?? [],
    top_10_insights: parsedScorecard.top_10_insights ?? [],
    competitor_strengths: parsedScorecard.competitor_strengths ?? {},
    competitor_weaknesses: parsedScorecard.competitor_weaknesses ?? {},
    what_they_know_that_you_dont: parsedScorecard.what_they_know_that_you_dont ?? '',
    honors_previous_plan_completion: honorsPreviousPlanCompletion,
    intelligence_ids_used: records.map((r) => r.intelligence_id),
  };

  const insertedScorecard = await safeQuerySingle<{ id: string }>(
    supabase
      .from('competitor_scorecards')
      .insert({
        client_id,
        generated_at: generatedAt,
        scorecard_data: scorecardForDb,
        insights: parsedScorecard.top_10_insights ?? [],
        version: nextVersion,
      })
      .select('id')
      .single(),
    'generateScorecard.insertScorecard',
  );

  if (!insertedScorecard) {
    return c.json({ error: 'Failed to persist scorecard' }, 500);
  }
  const scorecardId = insertedScorecard.id;

  // STEP 7c — Persist action plan items (if any)
  if (actionPlanResult) {
    const ap = actionPlanResult.parsed as {
      '30_days'?: any[];
      '60_days'?: any[];
      '90_days'?: any[];
      biggest_bet?: any;
    };

    const items30 = Array.isArray(ap['30_days']) ? ap['30_days'] : [];
    const items60 = Array.isArray(ap['60_days']) ? ap['60_days'] : [];
    const items90 = Array.isArray(ap['90_days']) ? ap['90_days'] : [];

    const sanitizeCategory = (raw: any): ActionCategory => {
      const c2 = String(raw ?? '').toLowerCase();
      return (ALLOWED_ACTION_CATEGORIES as string[]).includes(c2) ? (c2 as ActionCategory) : 'brand';
    };

    const rows: Array<{
      scorecard_id: string;
      period: '30d' | '60d' | '90d';
      action_title: string;
      action_description: string | null;
      priority: number | null;
      category: string;
      status: 'pending';
    }> = [];

    const pushItems = (period: '30d' | '60d' | '90d', items: any[]) => {
      for (const it of items) {
        if (!it || typeof it !== 'object' || !it.action_title) continue;
        rows.push({
          scorecard_id: scorecardId,
          period,
          action_title: clipString(it.action_title, 240),
          action_description: clipString(it.description ?? '', 4000),
          priority: typeof it.priority === 'number' ? it.priority : null,
          category: sanitizeCategory(it.category),
          status: 'pending',
        });
      }
    };

    pushItems('30d', items30);
    pushItems('60d', items60);
    pushItems('90d', items90);

    if (rows.length > 0) {
      const { error: insertActionsErr } = await supabase
        .from('competitor_action_plans')
        .insert(rows);
      if (insertActionsErr) {
        console.error('[generate-scorecard] insert action_plans failed:', insertActionsErr.message);
      }
    }

    // Build the typed ActionPlan return object.
    const mapItems = (items: any[]): ActionItem[] =>
      items
        .filter((it) => it && it.action_title)
        .map((it) => ({
          action_title: it.action_title,
          description: it.description ?? '',
          category: sanitizeCategory(it.category),
          priority: typeof it.priority === 'number' ? it.priority : 5,
          estimated_impact:
            it.estimated_impact === 'alto' || it.estimated_impact === 'medio' || it.estimated_impact === 'bajo'
              ? it.estimated_impact
              : 'medio',
          effort:
            it.effort === 'alto' || it.effort === 'medio' || it.effort === 'bajo' ? it.effort : 'medio',
          dependencies: Array.isArray(it.dependencies) ? it.dependencies : [],
        }));

    parsedActionPlan = {
      scorecard_id: scorecardId,
      '30_days': mapItems(items30),
      '60_days': mapItems(items60),
      '90_days': mapItems(items90),
      biggest_bet: {
        title: ap.biggest_bet?.title ?? '',
        rationale: ap.biggest_bet?.rationale ?? '',
        first_step: ap.biggest_bet?.first_step ?? '',
      },
    };
  }

  // STEP 8 — Cost tracking
  const apiCalls: CostTracking['api_calls'] = [];
  const scorecardCost = calcOpusCost(scorecardResult.inputTokens, scorecardResult.outputTokens);
  apiCalls.push({
    provider: 'anthropic',
    endpoint: `messages:${OPUS_MODEL}:scorecard`,
    cost_usd: scorecardCost,
    duration_ms: 0,
  });
  let totalCost = scorecardCost;

  if (actionPlanResult) {
    const planCost = calcOpusCost(actionPlanResult.inputTokens, actionPlanResult.outputTokens);
    apiCalls.push({
      provider: 'anthropic',
      endpoint: `messages:${OPUS_MODEL}:action_plan`,
      cost_usd: planCost,
      duration_ms: 0,
    });
    totalCost += planCost;
  }

  const cost_tracking: CostTracking = {
    api_calls: apiCalls,
    total_cost_usd: totalCost,
  };

  // STEP 9 — Build response
  const scorecardResponse: CompetitorScorecard = {
    scorecard_id: scorecardId,
    client_id,
    generated_at: generatedAt,
    executive_summary: parsedScorecard.executive_summary ?? '',
    table: (parsedScorecard.scorecard_table ?? []) as ScorecardRow[],
    top_10_insights: (parsedScorecard.top_10_insights ?? []) as ScorecardInsight[],
    competitor_strengths: parsedScorecard.competitor_strengths ?? {},
    competitor_weaknesses: parsedScorecard.competitor_weaknesses ?? {},
    what_they_know_that_you_dont: parsedScorecard.what_they_know_that_you_dont ?? '',
    honors_previous_plan_completion: honorsPreviousPlanCompletion,
    version: nextVersion,
  };

  const data: GenerateScorecardResponse = {
    scorecard: scorecardResponse,
    action_plan: parsedActionPlan,
    cost_tracking,
  };

  console.log(
    `[generate-scorecard] done in ${Date.now() - startedAt}ms — competitors=${records.length} ` +
      `version=${nextVersion} cost=$${totalCost.toFixed(4)}`,
  );

  return c.json({ success: true, data });
}
