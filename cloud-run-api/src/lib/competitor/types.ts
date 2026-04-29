/**
 * Competitor Intelligence — single source of truth for cross-endpoint contracts.
 *
 * All endpoints in cloud-run-api/src/routes/competitor/* and the frontend
 * (CompetitorIntelligenceView.tsx) consume these types.
 *
 * Owner: Ignacio W17.
 * Cross-reviewed by: Isidora W6 (logic), Javiera W12 (security/types-on-API-boundary).
 */

// ============================================================
// Shared primitives
// ============================================================

export type Iso8601 = string;
export type Uuid = string;

export type DataSourceQuality = 'hard' | 'estimated' | 'inferred';
// hard       = first-party (cliente: Meta API, GA4, Shopify) o source de verdad (Meta Ad Library)
// estimated  = third-party con modelo (DataForSEO traffic, SimilarWeb)
// inferred   = derivado por LLM o regex sobre HTML

export interface Money {
  amount_cents: number;
  currency: string; // ISO 4217 — default 'CLP'
}

export interface CostTracking {
  api_calls: Array<{
    provider: 'apify' | 'dataforseo' | 'firecrawl' | 'anthropic';
    endpoint: string;
    cost_usd: number;
    duration_ms: number;
  }>;
  total_cost_usd: number;
}

export interface JobStatus {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  started_at: Iso8601;
  finished_at?: Iso8601;
  progress_pct?: number;
  current_step?: string;
  error?: string;
}

// ============================================================
// 1. Paid intelligence (competitor_paid_ads)
// ============================================================

export type PaidPlatform = 'meta' | 'google' | 'tiktok' | 'linkedin';
export type CreativeType = 'image' | 'video' | 'carousel' | 'collection' | 'reel';

export interface PaidAd {
  ad_id: string;
  platform: PaidPlatform;
  ad_url?: string;
  creative_url?: string;
  creative_thumbnail_url?: string;
  creative_type: CreativeType;
  copy_text?: string;
  cta?: string;
  days_running: number;
  first_seen_at: Iso8601;
  last_seen_at: Iso8601;
  countries: string[];
  formats: string[];
  landing_url?: string;
  raw_data: Record<string, unknown>;
}

export interface PaidIntelligence {
  total_ads_active: number;
  total_ads_inactive_90d: number;
  /** Velocity: ads activos hoy vs 30 días atrás. Positivo = está acelerando. */
  velocity_30d: number;
  /** Mediana de days_running entre ads activos — proxy de winners. */
  median_age_days: number;
  /** Estimación de inversión mensual: ad_count_active × industry_cpm × audience_proxy. */
  estimated_monthly_spend?: Money;
  ads_by_format: Record<CreativeType, number>;
  top_landing_pages: Array<{ url: string; ad_count: number }>;
  ads: PaidAd[]; // sample (top 50 por antigüedad o relevancia)
  source_quality: DataSourceQuality;
}

// ============================================================
// 2. SEO intelligence (competitor_seo_*)
// ============================================================

export interface SeoKeyword {
  keyword: string;
  position: number;
  search_volume?: number;
  keyword_difficulty?: number;
  traffic_estimate?: number;
  url_ranking?: string;
  serp_features: string[];
  is_new: boolean;
  is_lost: boolean;
}

export interface SeoBacklink {
  source_url: string;
  source_domain: string;
  domain_rank?: number;
  anchor_text?: string;
  link_type: string;
  first_seen?: string; // ISO date
  is_lost: boolean;
}

export interface SeoPage {
  url: string;
  traffic_estimate: number;
  keywords_count: number;
  top_keyword?: string;
}

export interface SeoIntelligence {
  organic_traffic_monthly: number;
  organic_traffic_trend_pct: number; // vs 3 meses atrás
  total_keywords_ranking: number;
  total_backlinks: number;
  referring_domains: number;
  domain_rank: number;
  top_keywords: SeoKeyword[]; // top 100
  top_backlinks: SeoBacklink[]; // top 50 por authority
  top_pages: SeoPage[]; // top 20 por traffic
  keywords_won_30d: SeoKeyword[];
  keywords_lost_30d: SeoKeyword[];
  /** Keywords donde competidor rankea TOP 10 y client_id NO rankea (cross-reference). */
  content_gap_keywords?: SeoKeyword[];
  source_quality: DataSourceQuality;
}

// ============================================================
// 3. Web intelligence (Firecrawl + Sonnet vision)
// ============================================================

export type PageType =
  | 'homepage'
  | 'product'
  | 'collection'
  | 'checkout'
  | 'about'
  | 'blog'
  | 'contact'
  | 'other';

export interface PageScrape {
  url: string;
  page_type: PageType;
  status_code: number;
  title?: string;
  description?: string;
  markdown: string;
  html?: string;
  screenshot_url?: string; // stored in supabase storage after capture
}

export interface PageUxAnalysis {
  url: string;
  page_type: PageType;
  value_proposition?: string;
  hero_analysis?: {
    copy: string;
    strength_score: number; // 1-10
    recommendation: string;
  };
  popups_detected: Array<{
    type: 'newsletter' | 'discount' | 'exit_intent' | 'cookie' | 'chat' | 'other';
    discount_pct?: number;
    copy?: string;
  }>;
  ctas: Array<{
    text: string;
    position: 'header' | 'hero' | 'inline' | 'footer' | 'sticky';
    prominence: 'primary' | 'secondary' | 'tertiary';
  }>;
  trust_signals: string[];
  pricing_positioning?: 'premium' | 'mid' | 'popular' | 'luxe' | 'discount';
  funnel_friction: string[];
  ux_score: number; // 1-10
  ux_score_reason?: string;
  copy_tone?: 'formal' | 'casual' | 'divertido' | 'tecnico' | 'aspiracional';
  brand_identity?: {
    dominant_colors: string[]; // hex
    typography_vibe: string;
    photography_style: string;
  };
  weaknesses_to_exploit: string[];
  things_to_steal: string[];
}

export interface TechStack {
  ecommerce_platform?: string;
  cms?: string;
  cdn?: string;
  reviews_provider?: string;
  email_provider?: string;
  chat_tool?: string;
  ab_testing_tool?: string;
  personalization_tool?: string;
  analytics_stack: string[];
  tracking_pixels: {
    meta_pixel: boolean;
    google_tag_manager: boolean;
    google_analytics: boolean;
    google_analytics_id?: string;
    tiktok_pixel: boolean;
    klaviyo: boolean;
    hotjar: boolean;
    other: string[];
  };
  marketing_sophistication: 'basic' | 'intermediate' | 'advanced';
  evidence: Record<string, string>; // tool → evidence string
}

export interface WebIntelligence {
  pages_analyzed: PageScrape[];
  ux_analyses: PageUxAnalysis[];
  tech_stack: TechStack;
  source_quality: DataSourceQuality;
}

// ============================================================
// 4. Catalog intelligence
// ============================================================

export interface CatalogProduct {
  product_name: string;
  product_url?: string;
  price: Money;
  compare_price?: Money;
  image_url?: string;
  variants_count: number;
  in_stock: boolean;
  is_bestseller: boolean;
  tags: string[];
  raw_data?: Record<string, unknown>;
}

export interface CatalogIntelligence {
  total_products: number;
  price_range: { min: Money; max: Money; avg: Money; median: Money };
  bestsellers: CatalogProduct[]; // top 20 si detectable
  recent_launches: CatalogProduct[]; // últimos 30 días si detectable
  on_sale_count: number;
  avg_discount_pct: number;
  bundles_count: number;
  products: CatalogProduct[]; // sample (200 max)
  source_quality: DataSourceQuality;
}

// ============================================================
// 5. Social intelligence (competitor_social_metrics)
// ============================================================

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'linkedin'
  | 'twitter';

export interface SocialMetrics {
  platform: SocialPlatform;
  handle: string;
  url?: string;
  followers: number;
  following?: number;
  posts_count: number;
  avg_engagement_rate?: number; // 0-1
  posts_per_month: number;
  top_posts: Array<{
    url: string;
    type: string;
    caption?: string;
    engagement: number;
    posted_at: Iso8601;
  }>;
  top_hashtags: string[];
  bio?: string;
}

export interface SocialIntelligence {
  metrics_by_platform: SocialMetrics[];
  source_quality: DataSourceQuality;
}

// ============================================================
// 6. Reviews & reputation
// ============================================================

export type ReviewSource = 'trustpilot' | 'google' | 'app_store' | 'play_store' | 'site';

export interface ReviewsByPlatform {
  source: ReviewSource;
  total_reviews: number;
  avg_rating: number; // 1-5
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  top_positive_words: string[];
  top_negative_words: string[];
  recurring_complaints: string[];
  recent_reviews_sample: Array<{
    author?: string;
    rating: number;
    text: string;
    posted_at: Iso8601;
  }>;
}

export interface ReviewsIntelligence {
  by_platform: ReviewsByPlatform[];
  weighted_avg_rating: number;
  total_reviews_all: number;
  source_quality: DataSourceQuality;
}

// ============================================================
// 7. Email marketing intelligence
// ============================================================

export interface CapturedEmail {
  received_at: Iso8601;
  subject: string;
  preheader?: string;
  from_name?: string;
  from_email?: string;
  html_snapshot?: string;
  plain_text?: string;
  hooks_detected: string[];
  cta_count: number;
  has_discount: boolean;
  discount_pct?: number;
}

export interface EmailMarketingIntelligence {
  subscribed_email: string;
  subscribed_at: Iso8601;
  popup_capture_offered_pct?: number;
  welcome_series: CapturedEmail[];
  campaign_emails: CapturedEmail[]; // posteriores al welcome
  campaign_frequency_per_week: number;
  avg_subject_length: number;
  top_hooks: string[];
  design_analysis?: {
    template_consistency: 'high' | 'medium' | 'low';
    typography_quality: 'high' | 'medium' | 'low';
    image_to_text_ratio: number;
    notes: string;
  };
  last_email_received_at?: Iso8601;
  source_quality: DataSourceQuality;
}

// ============================================================
// 8. Aggregated competitor record
// ============================================================

export interface CompetitorIntelligenceRecord {
  intelligence_id: Uuid;
  client_id: Uuid;
  competitor_name: string;
  competitor_url: string;
  ig_handle?: string;
  industry?: string;
  notes?: string;
  is_active: boolean;
  last_analyzed_at?: Iso8601;
  analysis_status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';

  paid?: PaidIntelligence;
  seo?: SeoIntelligence;
  web?: WebIntelligence;
  catalog?: CatalogIntelligence;
  social?: SocialIntelligence;
  reviews?: ReviewsIntelligence;
  email_marketing?: EmailMarketingIntelligence;

  generated_at: Iso8601;
  cost_tracking: CostTracking;
}

// ============================================================
// 9. Client context (for scorecard generation)
// ============================================================

export interface ClientContext {
  client_id: Uuid;
  name: string;
  url: string;
  industry: string;
  /** Posicionamiento declarado en el brief (Bastián W24). Determina qué tácticas son coherentes. */
  positioning?: 'premium' | 'mid' | 'budget' | 'luxe';
  /** Capacidad de ejecución: presupuesto + equipo. */
  resources?: 'low' | 'medium' | 'high';
  budget_monthly_clp?: number;
  team_size_marketing?: number;
  /** Plan Steve Ads — Gonzalo W22 lo determina. Limita features que recomendamos. */
  tier_subscription?: 'free' | 'starter' | 'pro' | 'enterprise';
  /** Métricas propias del cliente para comparar (campaign_metrics, shopify, klaviyo). */
  own_metrics: {
    paid?: Partial<PaidIntelligence>;
    seo?: Partial<SeoIntelligence>;
    catalog?: Partial<CatalogIntelligence>;
    social?: Partial<SocialIntelligence>;
    reviews?: Partial<ReviewsIntelligence>;
    email_marketing?: Partial<EmailMarketingIntelligence>;
  };
}

// ============================================================
// 10. Scorecard & action plan (Opus output)
// ============================================================

export interface ScorecardRow {
  metric: string;
  metric_unit?: string; // 'visits/mes', '%', 'count', 'days'
  client_value: number | string | null;
  competitors: Array<{ name: string; value: number | string | null }>;
  gap?: number;
  winner?: string; // 'client' | competitor_name | 'tie'
  trend?: 'client_falling' | 'client_gaining' | 'stable' | 'unknown';
  is_estimate: boolean;
  source: string;
}

export interface ScorecardInsight {
  title: string;
  evidence: string;
  implication: string;
  priority: 'high' | 'medium' | 'low';
}

export interface CompetitorScorecard {
  scorecard_id: Uuid;
  client_id: Uuid;
  generated_at: Iso8601;
  executive_summary: string;
  table: ScorecardRow[];
  top_10_insights: ScorecardInsight[];
  competitor_strengths: Record<string, string[]>;
  competitor_weaknesses: Record<string, string[]>;
  what_they_know_that_you_dont: string;
  /** Tomado en cuenta: planes anteriores del cliente y su completion rate. */
  honors_previous_plan_completion: boolean;
  version: number;
}

export type ActionCategory =
  | 'paid_meta'
  | 'paid_google'
  | 'paid_tiktok'
  | 'seo'
  | 'email'
  | 'social_organic'
  | 'catalog'
  | 'ux'
  | 'pricing'
  | 'reviews'
  | 'brand';

export interface ActionItem {
  action_title: string;
  description: string;
  category: ActionCategory;
  priority: number; // 1-10
  estimated_impact: 'alto' | 'medio' | 'bajo';
  effort: 'alto' | 'medio' | 'bajo';
  dependencies: string[];
  /** Si Sonnet/Opus detecta que requiere un feature pro y el cliente está en free, lo señala. */
  requires_tier?: 'free' | 'starter' | 'pro' | 'enterprise';
}

export interface ActionPlan {
  scorecard_id: Uuid;
  '30_days': ActionItem[];
  '60_days': ActionItem[];
  '90_days': ActionItem[];
  biggest_bet: {
    title: string;
    rationale: string;
    first_step: string;
  };
}

// ============================================================
// 11. Endpoint contracts
// ============================================================

export interface FullDeepDiveRequest {
  client_id: Uuid;
  competitor_intelligence_id?: Uuid; // si actualizamos un existente
  competitor_url: string;
  ig_handle?: string;
  competitor_name?: string;
  /** Qué módulos correr. Default: todos. */
  modules?: Array<'paid' | 'seo' | 'web' | 'catalog' | 'social' | 'reviews' | 'email'>;
  /** Si true, fuerza re-scrape ignorando cache. */
  force_refresh?: boolean;
}

export interface FullDeepDiveResponse {
  intelligence_id: Uuid;
  job_id: Uuid; // para polling
  status: JobStatus;
  partial_data?: Partial<CompetitorIntelligenceRecord>;
}

export interface ScrapePaidAdsRequest {
  intelligence_id: Uuid;
  competitor_url: string;
  ig_handle?: string;
  countries?: string[]; // default ['CL']
}

export interface ScrapeSeoRequest {
  intelligence_id: Uuid;
  domain: string;
  location_code?: number; // DataForSEO: default 2152 (Chile)
  language_code?: string; // default 'es'
}

export interface WebCrawlRequest {
  intelligence_id: Uuid;
  url: string;
  max_pages?: number; // default 10
  include_paths?: string[];
  exclude_paths?: string[];
}

export interface ScrapeSocialRequest {
  intelligence_id: Uuid;
  ig_handle?: string;
  tiktok_handle?: string;
  facebook_page?: string;
  youtube_channel?: string;
  twitter_handle?: string;
  linkedin_company?: string;
}

export interface ScrapeCatalogRequest {
  intelligence_id: Uuid;
  url: string;
  detected_platform?: string;
}

export interface ScrapeReviewsRequest {
  intelligence_id: Uuid;
  competitor_name: string;
  competitor_url: string;
}

export interface EmailSpyRequest {
  intelligence_id: Uuid;
  competitor_url: string;
  /** Email temporal a usar. Si null, el endpoint genera uno con Mailgun routes. */
  temp_email?: string;
}

export interface GenerateScorecardRequest {
  client_id: Uuid;
  intelligence_ids: Uuid[]; // 1-5 competidores
  /** Si true, también genera plan de acción. */
  include_action_plan?: boolean;
}

export interface GenerateScorecardResponse {
  scorecard: CompetitorScorecard;
  action_plan?: ActionPlan;
  cost_tracking: CostTracking;
}
