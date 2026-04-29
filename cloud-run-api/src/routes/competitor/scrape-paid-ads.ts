/**
 * POST /api/competitor/scrape-paid-ads
 *
 * Discover ALL paid ads of a competitor across Meta, Google, and TikTok in a
 * single Apify-fanout. Normaliza outputs heterogéneos a `PaidAd[]`, calcula
 * agregados (volumen, velocidad, mediana, spend estimado, formatos, top
 * landings), persiste en `competitor_paid_ads` y devuelve el `PaidIntelligence`
 * completo + cost tracking.
 *
 * Diseño: usamos `Promise.allSettled` para que la falla de un scraper no mate
 * los otros (Meta puede caer pero Google sigue). Si TODOS fallan, devolvemos
 * 502; si 1-2 funcionan, devolvemos `partial: true` con lo que tenemos.
 *
 * Owner: Felipe W2 (Meta Ads & Instagram).
 * Cross-reviewer pendiente: Isidora W6 + Javiera W12.
 */

import type { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';
import {
  ACTORS,
  runActorSync,
  runActorAsync,
  waitForRun,
  getRunDataset,
  type ApifyResponse,
} from '../../lib/competitor/apify-client.js';
import {
  resolveFacebookPageId,
  buildAdLibraryUrlByPageId,
  type PageIdResolution,
} from '../../lib/competitor/resolve-page-id.js';
import type {
  CostTracking,
  CreativeType,
  Money,
  PaidAd,
  PaidIntelligence,
  PaidPlatform,
  ScrapePaidAdsRequest,
} from '../../lib/competitor/types.js';

// ---------------------------------------------------------------------------
// Constants — MVP heuristics. Ignacio W17 puede afinar con benchmarks reales.
// ---------------------------------------------------------------------------

const INDUSTRY_CPM_USD = 8;
const AUDIENCE_PROXY_USD = 50;
/** Spend mensual estimado por ad activo: industry_cpm × audience_proxy × 30 / 8. */
const SPEND_PER_ACTIVE_AD_USD_MONTHLY = INDUSTRY_CPM_USD * AUDIENCE_PROXY_USD * 30 / 8 / 30; // ~$50/ad/mes baseline

const DEFAULT_COUNTRIES = ['CL'];
const META_MAX_ADS = 200;
const GOOGLE_MAX_ADS = 100;
const TIKTOK_MAX_ADS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the apex domain from a URL ("https://www.foo.cl/x" → "foo.cl").
 * Si no es URL válida, lo devuelve trimmed/lowercased como fallback.
 */
function extractDomain(input: string): string {
  try {
    let raw = input.trim();
    if (!raw.startsWith('http')) raw = 'https://' + raw;
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return input.trim().toLowerCase().replace(/^@/, '');
  }
}

/**
 * Toma cualquier URL/handle/dominio y devuelve un slug limpio para queries
 * de TikTok/Google donde no aplica resolución por page_id (Meta sí).
 */
function sanitizeMetaQuery(input: string): string {
  let q = input.trim().toLowerCase();
  if (q.startsWith('@')) q = q.slice(1);
  q = q.replace(/^https?:\/\//, '').replace(/^www\./, '');
  q = q.replace(/\/.*$/, ''); // strip path
  q = q.replace(/\.(cl|com|co|mx|es|net|org|ar|pe|br|ec|uy|py|bo|ve|us)(\.[a-z]{2})?$/i, '');
  q = q.replace(/[-_.]+/g, ' ').trim();
  return q;
}

/**
 * Determine creative_type compatible con CHECK constraint del DB.
 * El tipo TS también soporta 'collection' y 'reel' — los normalizamos al tipo
 * más cercano permitido en DB ('image' / 'video' / 'carousel').
 */
function normalizeCreativeType(raw: string | undefined | null): CreativeType {
  if (!raw) return 'image';
  const v = String(raw).toLowerCase();
  if (v.includes('video')) return 'video';
  if (v.includes('reel')) return 'video'; // DB no permite 'reel', usar 'video'
  if (v.includes('carousel') || v.includes('dco')) return 'carousel';
  if (v.includes('collection')) return 'carousel'; // DB no permite 'collection'
  return 'image';
}

/** ms entre dos fechas → días enteros (mín 0). */
function daysBetween(later: number, earlier: number): number {
  return Math.max(0, Math.floor((later - earlier) / (1000 * 60 * 60 * 24)));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---------------------------------------------------------------------------
// Mappers — un ad heterogéneo de Apify → PaidAd canónico
// ---------------------------------------------------------------------------

interface AnyRecord { [k: string]: unknown }

function s(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const t = String(v).trim();
  return t.length > 0 ? t : undefined;
}

function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Mapea un item del Apify Meta Ads Library scraper. */
function mapMetaAd(raw: AnyRecord, fallbackCountry: string): PaidAd | null {
  const adId = s(raw.adArchiveID) || s(raw.adArchiveId) || s(raw.id) || s(raw.ad_id);
  if (!adId) return null;

  const snapshot = (raw.snapshot ?? {}) as AnyRecord;
  const startMs =
    typeof raw.startDate === 'number' ? raw.startDate * (raw.startDate < 1e12 ? 1000 : 1) :
    s(raw.startDateFormatted) ? new Date(s(raw.startDateFormatted) as string).getTime() :
    s(raw.ad_delivery_start_time) ? new Date(s(raw.ad_delivery_start_time) as string).getTime() :
    Date.now();
  const endMs =
    typeof raw.endDate === 'number' ? raw.endDate * (raw.endDate < 1e12 ? 1000 : 1) :
    s(raw.endDateFormatted) ? new Date(s(raw.endDateFormatted) as string).getTime() :
    s(raw.ad_delivery_stop_time) ? new Date(s(raw.ad_delivery_stop_time) as string).getTime() :
    Date.now();

  const isActive = raw.isActive === true || (raw.isActive === undefined && endMs >= Date.now() - 24 * 60 * 60 * 1000);
  const lastSeen = isActive ? Date.now() : endMs;

  // copy text — body.text | body.markup.__html | cards[0].body
  let copy: string | undefined;
  const body = snapshot.body as AnyRecord | undefined;
  if (body) {
    copy = s(body.text);
    if (!copy) {
      const markup = body.markup as AnyRecord | undefined;
      const html = s(markup?.__html);
      if (html) copy = html.replace(/<[^>]*>/g, '').trim();
    }
  }
  if (!copy) {
    const cards = arr<AnyRecord>(snapshot.cards);
    copy = s(cards[0]?.body);
  }
  if (!copy) copy = s(raw.ad_creative_bodies && arr<string>(raw.ad_creative_bodies)[0]);

  // creative type
  const displayFmt = s(snapshot.displayFormat);
  const hasVideos = arr(snapshot.videos).length > 0;
  const collation = typeof raw.collationCount === 'number' ? raw.collationCount : 0;
  let creativeRaw = displayFmt;
  if (hasVideos) creativeRaw = 'video';
  else if (collation > 1) creativeRaw = 'carousel';
  const creative_type = normalizeCreativeType(creativeRaw);

  // creative URL (image or video)
  let creativeUrl: string | undefined;
  let thumbUrl: string | undefined;
  const videos = arr<AnyRecord>(snapshot.videos);
  if (videos.length > 0) {
    creativeUrl = s(videos[0].videoHdUrl) || s(videos[0].videoSdUrl);
    thumbUrl = s(videos[0].videoPreviewImageUrl) || s(videos[0].video_preview_image_url);
  }
  const images = arr<AnyRecord>(snapshot.images);
  if (!creativeUrl && images.length > 0) {
    creativeUrl = s(images[0].originalImageUrl) || s(images[0].original_image_url) ||
                  s(images[0].resizedImageUrl) || s(images[0].resized_image_url);
  }
  if (!thumbUrl && images.length > 0) {
    thumbUrl = s(images[0].resizedImageUrl) || s(images[0].resized_image_url) || creativeUrl;
  }

  const cards = arr<AnyRecord>(snapshot.cards);
  const cta = s(snapshot.ctaText) || s(snapshot.cta_text) || s(cards[0]?.ctaText) || s(cards[0]?.cta_text);

  const landingUrl = s(snapshot.linkUrl) || s(snapshot.link_url) ||
                     s(cards[0]?.linkUrl) || s(cards[0]?.link_url);

  const formats = arr<string>(raw.publisherPlatform).length > 0
    ? (raw.publisherPlatform as string[])
    : arr<string>(raw.publisher_platforms);

  const countries = arr<string>(raw.reachedCountries).length > 0
    ? (raw.reachedCountries as string[])
    : [fallbackCountry];

  return {
    ad_id: adId,
    platform: 'meta' as PaidPlatform,
    ad_url: s(raw.url) || (adId ? `https://www.facebook.com/ads/library/?id=${adId}` : undefined),
    creative_url: creativeUrl,
    creative_thumbnail_url: thumbUrl,
    creative_type,
    copy_text: copy,
    cta,
    days_running: daysBetween(lastSeen, startMs),
    first_seen_at: new Date(startMs).toISOString(),
    last_seen_at: new Date(lastSeen).toISOString(),
    countries,
    formats,
    landing_url: landingUrl,
    raw_data: raw as Record<string, unknown>,
  };
}

/** Mapea un item del Apify Google Ads Transparency scraper. */
function mapGoogleAd(raw: AnyRecord, fallbackCountry: string): PaidAd | null {
  const adId = s(raw.creativeId) || s(raw.adId) || s(raw.ad_id) || s(raw.id);
  if (!adId) return null;

  const firstShown = s(raw.firstShown) || s(raw.firstSeen) || s(raw.first_shown_date);
  const lastShown = s(raw.lastShown) || s(raw.lastSeen) || s(raw.last_shown_date);
  const startMs = firstShown ? new Date(firstShown).getTime() : Date.now();
  const lastMs = lastShown ? new Date(lastShown).getTime() : Date.now();

  const formatRaw = s(raw.format) || s(raw.adFormat) || s(raw.creativeFormat);
  const creative_type = normalizeCreativeType(formatRaw);

  const creativeUrl = s(raw.imageUrl) || s(raw.videoUrl) || s(raw.creativeUrl) ||
                      s((raw.creative as AnyRecord | undefined)?.url);
  const thumbUrl = s(raw.thumbnailUrl) || s(raw.previewUrl) || creativeUrl;
  const landingUrl = s(raw.destinationUrl) || s(raw.landingUrl) || s(raw.finalUrl) || s(raw.url);

  const region = s(raw.region) || s(raw.country) || fallbackCountry;
  const platforms = arr<string>(raw.platforms);

  return {
    ad_id: adId,
    platform: 'google' as PaidPlatform,
    ad_url: s(raw.adUrl) || s(raw.transparencyUrl) || s(raw.url),
    creative_url: creativeUrl,
    creative_thumbnail_url: thumbUrl,
    creative_type,
    copy_text: s(raw.headline) || s(raw.text) || s(raw.description),
    cta: s(raw.cta) || s(raw.callToAction),
    days_running: daysBetween(lastMs, startMs),
    first_seen_at: new Date(startMs).toISOString(),
    last_seen_at: new Date(lastMs).toISOString(),
    countries: [region],
    formats: platforms,
    landing_url: landingUrl,
    raw_data: raw as Record<string, unknown>,
  };
}

/** Mapea un item del Apify TikTok Ads Creative Center scraper. */
function mapTikTokAd(raw: AnyRecord, fallbackCountry: string): PaidAd | null {
  const adId = s(raw.id) || s(raw.adId) || s(raw.ad_id) || s(raw.creativeId);
  if (!adId) return null;

  const firstShown = s(raw.firstShown) || s(raw.startDate) || s(raw.first_seen);
  const lastShown = s(raw.lastShown) || s(raw.endDate) || s(raw.last_seen);
  const startMs = firstShown ? new Date(firstShown).getTime() : Date.now();
  const lastMs = lastShown ? new Date(lastShown).getTime() : Date.now();

  // TikTok Ads Center es mayormente video
  const creative_type: CreativeType = normalizeCreativeType(s(raw.format) || 'video');

  const creativeUrl = s(raw.videoUrl) || s(raw.video_url) || s(raw.imageUrl);
  const thumbUrl = s(raw.coverUrl) || s(raw.cover_url) || s(raw.thumbnailUrl);
  const landingUrl = s(raw.landingUrl) || s(raw.destinationUrl) || s(raw.url);
  const country = s(raw.country) || s(raw.region) || fallbackCountry;

  return {
    ad_id: adId,
    platform: 'tiktok' as PaidPlatform,
    ad_url: s(raw.adUrl) || s(raw.url),
    creative_url: creativeUrl,
    creative_thumbnail_url: thumbUrl,
    creative_type,
    copy_text: s(raw.adTitle) || s(raw.title) || s(raw.description),
    cta: s(raw.cta) || s(raw.callToAction),
    days_running: daysBetween(lastMs, startMs),
    first_seen_at: new Date(startMs).toISOString(),
    last_seen_at: new Date(lastMs).toISOString(),
    countries: [country],
    formats: ['tiktok'],
    landing_url: landingUrl,
    raw_data: raw as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Apify orchestration — async runs porque Meta puede pasar de 60s
// ---------------------------------------------------------------------------

interface ScraperResult {
  platform: PaidPlatform;
  ads: PaidAd[];
  cost: number;
  duration_ms: number;
  error: string | null;
  actor_id: string;
}

/**
 * Run actor async + wait + fetch dataset, normalizando el shape.
 * Si el actor termina rápido (<60s) podríamos usar runActorSync, pero el meta
 * scraper en práctica corre 1-3 min. Mejor el async pattern uniformemente.
 */
async function runAndCollect(
  actorId: string,
  input: unknown,
  timeoutMs: number,
): Promise<{ items: AnyRecord[]; cost: number; duration_ms: number; error: string | null }> {
  const t0 = Date.now();

  const start = await runActorAsync(actorId, input);
  if (start.error || !start.data) {
    return { items: [], cost: 0, duration_ms: Date.now() - t0, error: start.error || 'no run started' };
  }

  const wait = await waitForRun(start.data.id, { timeoutMs });
  if (wait.error || !wait.data) {
    return { items: [], cost: wait.cost, duration_ms: Date.now() - t0, error: wait.error || 'wait failed' };
  }

  const dataset = await getRunDataset<AnyRecord>(start.data.id);
  if (dataset.error || !dataset.data) {
    return { items: [], cost: wait.cost, duration_ms: Date.now() - t0, error: dataset.error || 'no dataset' };
  }

  return { items: dataset.data, cost: wait.cost, duration_ms: Date.now() - t0, error: null };
}

async function scrapeMeta(adLibraryUrl: string, country: string, label: string): Promise<ScraperResult> {
  const actorId = ACTORS.META_ADS_LIBRARY;
  const input = {
    urls: [{ url: adLibraryUrl }],
    startUrls: [{ url: adLibraryUrl }], // some forks usan startUrls
    country,
    activeStatus: 'all',
    maxItems: META_MAX_ADS,
  };
  console.log(`[scrape-paid-ads] Meta: actor=${actorId} ${label} country=${country} url=${adLibraryUrl}`);

  const result = await runAndCollect(actorId, input, 5 * 60_000);
  if (result.error) {
    return { platform: 'meta', ads: [], cost: result.cost, duration_ms: result.duration_ms, error: result.error, actor_id: actorId };
  }
  const ads = result.items
    .map((it) => mapMetaAd(it, country))
    .filter((a): a is PaidAd => a !== null);
  console.log(`[scrape-paid-ads] Meta: ${result.items.length} items → ${ads.length} ads (cost=$${result.cost.toFixed(4)})`);
  return { platform: 'meta', ads, cost: result.cost, duration_ms: result.duration_ms, error: null, actor_id: actorId };
}

async function scrapeGoogle(domain: string, country: string): Promise<ScraperResult> {
  const actorId = ACTORS.GOOGLE_ADS_TRANSPARENCY;
  const input = {
    advertiserDomains: [domain],
    domains: [domain],
    country,
    region: country,
    maxItems: GOOGLE_MAX_ADS,
  };
  console.log(`[scrape-paid-ads] Google: actor=${actorId} domain="${domain}" country=${country}`);

  const result = await runAndCollect(actorId, input, 5 * 60_000);
  if (result.error) {
    return { platform: 'google', ads: [], cost: result.cost, duration_ms: result.duration_ms, error: result.error, actor_id: actorId };
  }
  const ads = result.items
    .map((it) => mapGoogleAd(it, country))
    .filter((a): a is PaidAd => a !== null);
  console.log(`[scrape-paid-ads] Google: ${result.items.length} items → ${ads.length} ads (cost=$${result.cost.toFixed(4)})`);
  return { platform: 'google', ads, cost: result.cost, duration_ms: result.duration_ms, error: null, actor_id: actorId };
}

async function scrapeTikTok(query: string, country: string): Promise<ScraperResult> {
  const actorId = ACTORS.TIKTOK_ADS_CENTER;
  const input = {
    keywords: [query],
    country,
    region: country,
    maxItems: TIKTOK_MAX_ADS,
  };
  console.log(`[scrape-paid-ads] TikTok: actor=${actorId} query="${query}" country=${country}`);

  const result = await runAndCollect(actorId, input, 4 * 60_000);
  if (result.error) {
    return { platform: 'tiktok', ads: [], cost: result.cost, duration_ms: result.duration_ms, error: result.error, actor_id: actorId };
  }
  const ads = result.items
    .map((it) => mapTikTokAd(it, country))
    .filter((a): a is PaidAd => a !== null);
  console.log(`[scrape-paid-ads] TikTok: ${result.items.length} items → ${ads.length} ads (cost=$${result.cost.toFixed(4)})`);
  return { platform: 'tiktok', ads, cost: result.cost, duration_ms: result.duration_ms, error: null, actor_id: actorId };
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

function buildAdsByFormat(ads: PaidAd[]): Record<CreativeType, number> {
  const base: Record<CreativeType, number> = {
    image: 0, video: 0, carousel: 0, collection: 0, reel: 0,
  };
  for (const ad of ads) {
    base[ad.creative_type] = (base[ad.creative_type] || 0) + 1;
  }
  return base;
}

function buildTopLandingPages(ads: PaidAd[], topN: number = 10): Array<{ url: string; ad_count: number }> {
  const counts = new Map<string, number>();
  for (const ad of ads) {
    if (!ad.landing_url) continue;
    counts.set(ad.landing_url, (counts.get(ad.landing_url) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([url, ad_count]) => ({ url, ad_count }))
    .sort((a, b) => b.ad_count - a.ad_count)
    .slice(0, topN);
}

function computeAggregates(ads: PaidAd[]): Pick<
  PaidIntelligence,
  'total_ads_active' | 'total_ads_inactive_90d' | 'velocity_30d' | 'median_age_days' | 'estimated_monthly_spend' | 'ads_by_format' | 'top_landing_pages'
> {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

  const active = ads.filter((a) => new Date(a.last_seen_at).getTime() >= oneDayAgo);
  const inactive90d = ads.filter((a) => {
    const last = new Date(a.last_seen_at).getTime();
    return last >= ninetyDaysAgo && last < oneDayAgo;
  });

  const total_ads_active = active.length;
  const total_ads_inactive_90d = inactive90d.length;

  // Velocity: necesitamos history para comparar contra "30d ago". Sin history,
  // devolvemos 0 y dejamos que el frontend marque como "primera corrida".
  const velocity_30d = 0;

  const median_age_days = median(active.map((a) => a.days_running));

  // Estimated monthly spend: hard-coded MVP, Ignacio W17 lo afina con benchmarks.
  // Fórmula: total_ads_active × industry_cpm × audience_proxy = total_ads_active × $50/mes.
  // TODO(Ignacio W17): industry-specific CPM lookup table + audience-size factor real.
  const spendUsdMonthly = total_ads_active * INDUSTRY_CPM_USD * AUDIENCE_PROXY_USD * 30 / (30 * 8);
  const estimated_monthly_spend: Money = {
    amount_cents: Math.round(spendUsdMonthly * 100),
    currency: 'USD',
  };

  return {
    total_ads_active,
    total_ads_inactive_90d,
    velocity_30d,
    median_age_days,
    estimated_monthly_spend,
    ads_by_format: buildAdsByFormat(ads),
    top_landing_pages: buildTopLandingPages(ads),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface PaidAdRow {
  intelligence_id: string;
  platform: string;
  ad_id: string;
  ad_url: string | null;
  creative_url: string | null;
  creative_type: string;
  copy_text: string | null;
  cta: string | null;
  days_running: number;
  first_seen_at: string;
  last_seen_at: string;
  countries: string[];
  formats: string[];
  landing_url: string | null;
  raw_data: Record<string, unknown>;
}

function adToRow(ad: PaidAd, intelligenceId: string): PaidAdRow {
  return {
    intelligence_id: intelligenceId,
    platform: ad.platform,
    ad_id: ad.ad_id,
    ad_url: ad.ad_url ?? null,
    creative_url: ad.creative_url ?? null,
    creative_type: ad.creative_type,
    copy_text: ad.copy_text ?? null,
    cta: ad.cta ?? null,
    days_running: ad.days_running,
    first_seen_at: ad.first_seen_at,
    last_seen_at: ad.last_seen_at,
    countries: ad.countries,
    formats: ad.formats,
    landing_url: ad.landing_url ?? null,
    raw_data: ad.raw_data,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface IntelligenceRow {
  id: string;
  client_id: string;
  competitor_url: string;
  ig_handle: string | null;
  clients: { user_id: string | null; client_user_id: string | null } | null;
}

export async function scrapePaidAds(c: Context) {
  const t0 = Date.now();
  const supabase = getSupabaseAdmin();

  // Auth
  const user = c.get('user') as { id: string } | undefined;
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: ScrapePaidAdsRequest;
  try {
    body = (await c.req.json()) as ScrapePaidAdsRequest;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { intelligence_id, competitor_url, ig_handle } = body;
  const countries = body.countries && body.countries.length > 0 ? body.countries : DEFAULT_COUNTRIES;

  if (!intelligence_id) {
    return c.json({ error: 'intelligence_id required' }, 400);
  }

  // Ownership check — internal calls (service key) bypassan
  const isInternal = c.get('isInternal') === true;
  const { data: intel, error: intelErr } = await supabase
    .from('competitor_intelligence')
    .select('id, client_id, competitor_url, ig_handle, clients(user_id, client_user_id)')
    .eq('id', intelligence_id)
    .maybeSingle<IntelligenceRow>();

  if (intelErr || !intel) {
    console.log('[scrape-paid-ads] intelligence not found', intelligence_id, intelErr?.message);
    return c.json({ error: 'Intelligence record not found' }, 404);
  }

  if (!isInternal) {
    const { isSuperAdmin } = await getUserClientIds(supabase, user.id);
    const ownerOk =
      isSuperAdmin ||
      (intel.clients &&
        (intel.clients.user_id === user.id || intel.clients.client_user_id === user.id));
    if (!ownerOk) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  // Resolver query/handle/dominio. Si el caller no pasó nada nuevo, leemos la fila.
  const effectiveUrl = competitor_url || intel.competitor_url;
  const effectiveHandle = ig_handle || intel.ig_handle || undefined;

  if (!effectiveUrl && !effectiveHandle) {
    return c.json({ error: 'No competitor_url ni ig_handle utilizable para detectar la página' }, 400);
  }

  const country = countries[0] ?? 'CL';
  const googleDomain = effectiveUrl ? extractDomain(effectiveUrl) : sanitizeMetaQuery(effectiveHandle || '');
  const tiktokQuery = sanitizeMetaQuery(effectiveHandle || effectiveUrl);

  // ----- Meta: resolver page_id ANTES de scrapear el Ad Library -----
  // Sin page_id, Apify hace keyword-match sobre toda la lib y trae ruido o nada.
  // Con page_id la URL queda `view_all_page_id={id}` y trae sólo los ads de
  // esa Page. Cascada: web→Firecrawl→link FB→Apify pages, FB url→Apify pages,
  // IG handle→Apify ig profile→FB url→Apify pages.
  console.log(`[scrape-paid-ads] start intelligence=${intelligence_id} country=${country} input_url="${effectiveUrl}" ig_handle="${effectiveHandle}"`);
  const pageIdResolution: PageIdResolution = await resolveFacebookPageId({
    competitor_url: effectiveUrl,
    ig_handle: effectiveHandle,
  });
  console.log(`[scrape-paid-ads] page_id resolution: source=${pageIdResolution.source} page_id=${pageIdResolution.page_id} cost=$${pageIdResolution.cost.toFixed(4)} trace=${pageIdResolution.trace.join(' > ')}`);

  const metaPromise: Promise<ScraperResult> = pageIdResolution.page_id
    ? scrapeMeta(
        buildAdLibraryUrlByPageId(pageIdResolution.page_id, country),
        country,
        `page_id=${pageIdResolution.page_id} (source=${pageIdResolution.source})`
      )
    : Promise.resolve<ScraperResult>({
        platform: 'meta',
        ads: [],
        cost: 0,
        duration_ms: 0,
        error: `page_id no resuelto (${pageIdResolution.error || 'unknown'}). Pegale el link directo de Facebook (facebook.com/marca) para que detectemos los anuncios.`,
        actor_id: ACTORS.META_ADS_LIBRARY,
      });

  // Fanout — Promise.allSettled para que un fallo no mate los otros
  const settled = await Promise.allSettled<ScraperResult>([
    metaPromise,
    googleDomain ? scrapeGoogle(googleDomain, country) : Promise.resolve<ScraperResult>({
      platform: 'google', ads: [], cost: 0, duration_ms: 0, error: 'no domain', actor_id: ACTORS.GOOGLE_ADS_TRANSPARENCY,
    }),
    tiktokQuery ? scrapeTikTok(tiktokQuery, country) : Promise.resolve<ScraperResult>({
      platform: 'tiktok', ads: [], cost: 0, duration_ms: 0, error: 'no query', actor_id: ACTORS.TIKTOK_ADS_CENTER,
    }),
  ]);

  const results: ScraperResult[] = settled.map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    const platform: PaidPlatform = idx === 0 ? 'meta' : idx === 1 ? 'google' : 'tiktok';
    const actorMap = [ACTORS.META_ADS_LIBRARY, ACTORS.GOOGLE_ADS_TRANSPARENCY, ACTORS.TIKTOK_ADS_CENTER];
    return {
      platform,
      ads: [],
      cost: 0,
      duration_ms: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      actor_id: actorMap[idx],
    };
  });

  const failed = results.filter((r) => r.error);
  const succeeded = results.filter((r) => !r.error);

  if (succeeded.length === 0) {
    console.log('[scrape-paid-ads] all sources failed', failed.map((f) => `${f.platform}:${f.error}`));
    return c.json({
      error: 'All paid ad sources failed',
      details: failed.map((f) => ({ platform: f.platform, error: f.error })),
    }, 502);
  }

  // Combine ads
  const allAds: PaidAd[] = results.flatMap((r) => r.ads);
  console.log(`[scrape-paid-ads] total ads collected: ${allAds.length} (meta=${results[0].ads.length}, google=${results[1].ads.length}, tiktok=${results[2].ads.length})`);

  // Persist — DELETE existing for this intelligence_id then INSERT (no unique
  // constraint on (intelligence_id, ad_id) so UPSERT no aplica). Esto es el
  // patrón estándar para snapshots; cada corrida es una foto fresca.
  if (allAds.length > 0) {
    const { error: delErr } = await supabase
      .from('competitor_paid_ads')
      .delete()
      .eq('intelligence_id', intelligence_id);
    if (delErr) {
      console.log('[scrape-paid-ads] delete failed', delErr.message);
    }

    // Dedupe por (platform, ad_id) por si dos pages devolvieron lo mismo
    const seen = new Set<string>();
    const rows: PaidAdRow[] = [];
    for (const ad of allAds) {
      const key = `${ad.platform}::${ad.ad_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(adToRow(ad, intelligence_id));
    }

    // Insert en batches de 500 para evitar payload limit de PostgREST
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const { error: insErr } = await supabase.from('competitor_paid_ads').insert(slice);
      if (insErr) {
        console.log(`[scrape-paid-ads] insert batch ${i}-${i + slice.length} failed`, insErr.message);
      }
    }
  }

  // Update intelligence master row.
  // NOTA: el CHECK constraint del DB solo permite ('pending','running','completed','failed').
  // El tipo TS incluye 'partial' pero el schema NO lo permite — usamos 'completed'
  // si todo OK y 'failed' si parcial (con flag separado en la respuesta).
  // TODO(Ignacio W17): pedir migration para agregar 'partial' al CHECK constraint
  // o un campo `is_partial BOOLEAN` separado. Por ahora dejamos 'completed' siempre
  // que al menos UNA fuente respondió, para no marcar el record como 'failed'.
  const newStatus = failed.length === 0 ? 'completed' : 'completed';
  await supabase
    .from('competitor_intelligence')
    .update({
      last_analyzed_at: new Date().toISOString(),
      analysis_status: newStatus,
    })
    .eq('id', intelligence_id);

  // Build PaidIntelligence response
  const aggregates = computeAggregates(allAds);

  // Sample top 50 ads por antigüedad/relevancia (ordenamos por days_running desc
  // que aproxima "winners")
  const sampleAds = [...allAds]
    .sort((a, b) => b.days_running - a.days_running)
    .slice(0, 50);

  const paid: PaidIntelligence = {
    ...aggregates,
    ads: sampleAds,
    source_quality: 'hard', // Meta Ad Library + Google Transparency son source de verdad pública
  };

  // Cost tracking — incluye el resolver de page_id (Apify pages + Firecrawl + IG)
  const apiCalls: CostTracking['api_calls'] = results.map((r) => ({
    provider: 'apify' as const,
    endpoint: r.actor_id,
    cost_usd: r.cost,
    duration_ms: r.duration_ms,
  }));
  if (pageIdResolution.cost > 0) {
    apiCalls.push({
      provider: 'apify',
      endpoint: `resolve-page-id:${pageIdResolution.source}`,
      cost_usd: pageIdResolution.cost,
      duration_ms: pageIdResolution.duration_ms,
    });
  }
  const total_cost_usd = apiCalls.reduce((sum, c) => sum + c.cost_usd, 0);

  const cost_tracking: CostTracking = {
    api_calls: apiCalls,
    total_cost_usd,
  };

  console.log(`[scrape-paid-ads] done ${Date.now() - t0}ms succeeded=${succeeded.length}/3 ads=${allAds.length} cost=$${total_cost_usd.toFixed(4)}`);

  return c.json({
    success: true,
    partial: failed.length > 0,
    failed_sources: failed.map((f) => ({ platform: f.platform, error: f.error })),
    page_id_resolution: {
      page_id: pageIdResolution.page_id,
      page_name: pageIdResolution.page_name,
      facebook_url: pageIdResolution.facebook_url,
      source: pageIdResolution.source,
      error: pageIdResolution.error,
      trace: pageIdResolution.trace,
    },
    data: paid,
    cost_tracking,
  });
}

// Re-export para tests / type-checking — sí, sé que no lo uso aquí, pero el
// build esquemita lo agradece.
export type { ScraperResult };

// Suppress "unused export" hint sobre runActorSync — se mantiene importado
// porque podríamos cambiar a sync si Apify acelera.
void runActorSync;
void (null as unknown as ApifyResponse<unknown>);
