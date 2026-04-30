/**
 * POST /api/competitor/web-crawl
 *
 * Multi-page crawl of a competitor's website with Firecrawl + UX/copy/brand
 * analysis using Sonnet 4.6 vision.
 *
 * Pipeline:
 *   1. Sitemap discovery (Firecrawl `mapSite` → fallback a crawl directo)
 *   2. Smart page selection by path classification (homepage, product,
 *      collection, about, blog, contact, checkout) capped at `max_pages`
 *   3. Parallel scrape (Promise.allSettled) con `screenshot=true` y waitFor=3000
 *   4. Tech stack detection desde la homepage (shared lib `tech-stack-detector`)
 *   5. Análisis Sonnet vision por página (paralelo, max 5 concurrentes) usando
 *      `buildWebUxAnalysisPrompt`. Si parse falla → PageUxAnalysis minimal.
 *   6. Persist screenshots a Supabase Storage bucket `competitor-screenshots`
 *      (si el bucket existe), update `competitor_intelligence` last_analyzed_at
 *
 * El output `WebIntelligence` se persiste downstream dentro del scorecard final
 * — esta ruta NO crea tabla nueva.
 *
 * Owner: Sofía W14 (Integraciones)
 * Cross-reviewer pendiente: Isidora W6 (logic) + Javiera W12 (security/SSRF)
 */

import type { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';
import { validateUrlForSSRF } from '../../lib/url-validator.js';
import { scrapePage, mapSite, crawlSite } from '../../lib/competitor/firecrawl-client.js';
import {
  buildWebUxAnalysisPrompt,
  type WebUxPageType,
} from '../../lib/competitor/prompts.js';
import { buildTechStack, enrichTechStackFromGtm } from '../../lib/competitor/tech-stack-detector.js';
import type {
  WebCrawlRequest,
  WebIntelligence,
  PageScrape,
  PageUxAnalysis,
  PageType,
  TechStack,
  CostTracking,
} from '../../lib/competitor/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_PAGES = 10;
const SCRAPE_WAIT_FOR_MS = 3000;
const PER_SCRAPE_TIMEOUT_MS = 90_000;
const SONNET_MAX_CONCURRENCY = 5;
const SONNET_MODEL = 'claude-sonnet-4-6'; // alineado al resto de endpoints AI
const SONNET_MAX_TOKENS = 2048;
const ANTHROPIC_TIMEOUT_MS = 60_000;

// Pricing per 1M tokens (Sonnet 4.6 vision)
const SONNET_INPUT_PER_1M_USD = 3;
const SONNET_OUTPUT_PER_1M_USD = 15;

const SCREENSHOTS_BUCKET = 'competitor-screenshots';

// Caps por categoría — total cap = max_pages
const CAP_HOMEPAGE = 1;
const CAP_PRODUCT = 3;
const CAP_COLLECTION = 2;
const CAP_ABOUT = 1;
const CAP_BLOG = 1;
const CAP_CONTACT = 1;
const CAP_CHECKOUT = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugifyForStorage(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'page';
}

/**
 * Classify a URL path into one of the PageType buckets so we can pick a
 * representative sample (1 home + N products + ...).
 */
export function classifyPageType(url: string, rootUrl: string): PageType {
  let path = '/';
  try {
    const u = new URL(url);
    path = (u.pathname || '/').toLowerCase();
  } catch {
    // ignore — treated as 'other'
  }

  // Homepage: trailing slash o vacío, o coincide con la URL raíz
  if (path === '/' || path === '' || path === '/index' || path === '/home') return 'homepage';
  try {
    const root = new URL(rootUrl);
    if (root.pathname.replace(/\/+$/, '') === path.replace(/\/+$/, '')) return 'homepage';
  } catch {
    // ignore
  }

  if (/\/(products?|p|producto|productos|item|sku)\//.test(path)) return 'product';
  if (/\/(collections?|categoria|categorias|category|c|coleccion|colecciones)\//.test(path)) return 'collection';
  if (/\/(about|sobre-nosotros|quienes-somos|nosotros|nuestra-historia|empresa)(\/|$)/.test(path)) return 'about';
  if (/\/blog(\/|$)/.test(path) || /\/articulo(s)?\//.test(path) || /\/noticia(s)?\//.test(path)) return 'blog';
  if (/\/(contact|contacto|contactanos|contactenos)(\/|$)/.test(path)) return 'contact';
  if (/\/(checkout|cart|carrito|carro|pago|pagar)(\/|$)/.test(path)) return 'checkout';

  return 'other';
}

/**
 * The vision prompt builder uses a slightly narrower union (no 'contact').
 * Map our PageType → WebUxPageType for the prompt input.
 */
function toUxPageType(pt: PageType): WebUxPageType {
  if (pt === 'contact') return 'other';
  return pt;
}

/**
 * Same-origin filter so we don't accidentally crawl an off-site link.
 */
function isSameOrigin(url: string, rootUrl: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(rootUrl);
    return a.hostname === b.hostname || a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

/**
 * Pick up to `maxPages` URLs from the discovered link list, biased toward the
 * page-type quotas defined above.
 */
export function selectUrlsByQuota(
  candidateUrls: string[],
  rootUrl: string,
  maxPages: number,
): Array<{ url: string; pageType: PageType }> {
  const seen = new Set<string>();
  const buckets: Record<PageType, string[]> = {
    homepage: [],
    product: [],
    collection: [],
    about: [],
    blog: [],
    contact: [],
    checkout: [],
    other: [],
  };

  // Always include the root URL as homepage candidate (Firecrawl mapSite a veces
  // no lista la home explícitamente).
  const allCandidates = [rootUrl, ...candidateUrls];

  for (const u of allCandidates) {
    if (!u || typeof u !== 'string') continue;
    const norm = u.split('#')[0].replace(/\/+$/, '/');
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (!isSameOrigin(u, rootUrl)) continue;
    const pt = classifyPageType(u, rootUrl);
    buckets[pt].push(u);
  }

  const caps: Record<PageType, number> = {
    homepage: CAP_HOMEPAGE,
    product: CAP_PRODUCT,
    collection: CAP_COLLECTION,
    about: CAP_ABOUT,
    blog: CAP_BLOG,
    contact: CAP_CONTACT,
    checkout: CAP_CHECKOUT,
    other: 0, // by default no aleatorios
  };

  const picked: Array<{ url: string; pageType: PageType }> = [];
  const order: PageType[] = ['homepage', 'product', 'collection', 'about', 'blog', 'contact', 'checkout'];

  for (const pt of order) {
    const cap = caps[pt];
    const urls = buckets[pt].slice(0, cap);
    for (const url of urls) {
      if (picked.length >= maxPages) break;
      picked.push({ url, pageType: pt });
    }
    if (picked.length >= maxPages) break;
  }

  // Si nos sobra cupo, rellenamos con "other" (pero priorizando rutas cortas)
  if (picked.length < maxPages) {
    const others = buckets.other
      .filter((u) => !picked.find((p) => p.url === u))
      .sort((a, b) => a.length - b.length);
    for (const url of others) {
      if (picked.length >= maxPages) break;
      picked.push({ url, pageType: 'other' });
    }
  }

  return picked;
}

/**
 * If Firecrawl returns the screenshot as an https URL, fetch it and return
 * base64. If it's already base64 (data URI or pure), strip the prefix.
 *
 * NOTA: SSRF check ya se aplicó al URL del competidor; el screenshot lo aloja
 * Firecrawl (api.firecrawl.dev) → es una host-known fija. Aún así validamos
 * el protocolo HTTPS antes de fetchear.
 */
async function fetchScreenshotAsBase64(screenshot: string): Promise<{ base64: string | null; mediaType: 'image/png' | 'image/jpeg'; error: string | null }> {
  if (!screenshot) return { base64: null, mediaType: 'image/png', error: 'empty' };
  // Data URI — strip prefix
  const dataUriMatch = screenshot.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (dataUriMatch) {
    const mt = dataUriMatch[1].toLowerCase() === 'jpg' ? 'image/jpeg' : (`image/${dataUriMatch[1].toLowerCase()}` as 'image/png' | 'image/jpeg');
    return { base64: dataUriMatch[2], mediaType: mt, error: null };
  }
  // Pure base64 (no prefix, very long, no slashes from URLs)
  if (!/^https?:\/\//i.test(screenshot) && screenshot.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(screenshot)) {
    return { base64: screenshot.replace(/\s+/g, ''), mediaType: 'image/png', error: null };
  }
  // HTTP(S) URL — fetch and convert
  if (/^https?:\/\//i.test(screenshot)) {
    if (!/^https:\/\//i.test(screenshot)) {
      return { base64: null, mediaType: 'image/png', error: 'screenshot URL must be HTTPS' };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const resp = await fetch(screenshot, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
        return { base64: null, mediaType: 'image/png', error: `screenshot fetch HTTP ${resp.status}` };
      }
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      const mediaType: 'image/png' | 'image/jpeg' = ct.includes('jpeg') || ct.includes('jpg') ? 'image/jpeg' : 'image/png';
      const buf = await resp.arrayBuffer();
      // Convert to base64 (Node 18+ has Buffer)
      const b64 = Buffer.from(buf).toString('base64');
      return { base64: b64, mediaType, error: null };
    } catch (err) {
      return { base64: null, mediaType: 'image/png', error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { base64: null, mediaType: 'image/png', error: 'unrecognized screenshot format' };
}

// ---------------------------------------------------------------------------
// Sonnet vision call
// ---------------------------------------------------------------------------

interface SonnetCallResult {
  analysis: PageUxAnalysis;
  cost_usd: number;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
}

interface AnthropicResponseBody {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/**
 * Build a graceful fallback PageUxAnalysis when the AI call fails or returns
 * unparseable JSON. Keeps the WebIntelligence shape valid so downstream
 * scorecard generation doesn't crash.
 */
function buildFallbackAnalysis(url: string, pageType: PageType, reason: string): PageUxAnalysis {
  return {
    url,
    page_type: pageType,
    popups_detected: [],
    ctas: [],
    trust_signals: [],
    funnel_friction: [],
    ux_score: 0, // 0 sentinel (UI puede mostrar "sin datos"); type pide number, no null
    ux_score_reason: `AI analysis failed: ${reason}`,
    weaknesses_to_exploit: [],
    things_to_steal: [],
  };
}

/**
 * Map the Sonnet JSON output → PageUxAnalysis shape (canonical from types.ts).
 */
function mapSonnetJsonToAnalysis(
  url: string,
  pageType: PageType,
  raw: Record<string, unknown>,
): PageUxAnalysis {
  // Hero analysis: prompt devuelve { headline, subheadline, strength_score, strength_reason, weakness }.
  // Type espera { copy, strength_score, recommendation }.
  let hero_analysis: PageUxAnalysis['hero_analysis'];
  const heroIn = raw.hero_analysis as Record<string, unknown> | undefined;
  if (heroIn && typeof heroIn === 'object') {
    const headline = typeof heroIn.headline === 'string' ? heroIn.headline : '';
    const subheadline = typeof heroIn.subheadline === 'string' ? heroIn.subheadline : '';
    const strength_score = typeof heroIn.strength_score === 'number' ? heroIn.strength_score : 0;
    const recommendation =
      (typeof heroIn.weakness === 'string' && heroIn.weakness) ||
      (typeof heroIn.strength_reason === 'string' && heroIn.strength_reason) ||
      '';
    hero_analysis = {
      copy: subheadline ? `${headline}\n${subheadline}` : headline,
      strength_score,
      recommendation: String(recommendation),
    };
  }

  // popups_detected: prompt devuelve { type, trigger, offer }.
  // Type espera { type, discount_pct?, copy? }.
  const popupsIn = Array.isArray(raw.popups_detected) ? (raw.popups_detected as Array<Record<string, unknown>>) : [];
  const popups_detected: PageUxAnalysis['popups_detected'] = popupsIn
    .map((p) => {
      const rawType = typeof p.type === 'string' ? p.type.toLowerCase() : 'other';
      const allowed = new Set(['newsletter', 'discount', 'exit_intent', 'cookie', 'chat', 'other']);
      const type = (allowed.has(rawType) ? rawType : 'other') as
        | 'newsletter'
        | 'discount'
        | 'exit_intent'
        | 'cookie'
        | 'chat'
        | 'other';
      const offer = typeof p.offer === 'string' ? p.offer : undefined;
      let discount_pct: number | undefined;
      if (offer) {
        const m = offer.match(/(\d{1,3})\s*%/);
        if (m) discount_pct = Math.min(100, Math.max(0, parseInt(m[1], 10)));
      }
      const trigger = typeof p.trigger === 'string' ? p.trigger : undefined;
      const copy = offer || trigger;
      return { type, discount_pct, copy };
    })
    .filter(Boolean);

  // ctas: prompt position = above_fold|below_fold|sticky|footer|nav, prominence numeric.
  // Type espera position = header|hero|inline|footer|sticky, prominence = primary|secondary|tertiary.
  const ctasIn = Array.isArray(raw.ctas) ? (raw.ctas as Array<Record<string, unknown>>) : [];
  const ctas: PageUxAnalysis['ctas'] = ctasIn.map((c) => {
    const text = typeof c.text === 'string' ? c.text : '';
    const rawPos = typeof c.position === 'string' ? c.position : '';
    const position: 'header' | 'hero' | 'inline' | 'footer' | 'sticky' =
      rawPos === 'sticky'
        ? 'sticky'
        : rawPos === 'footer'
          ? 'footer'
          : rawPos === 'nav' || rawPos === 'header'
            ? 'header'
            : rawPos === 'above_fold'
              ? 'hero'
              : 'inline';
    const promRaw = typeof c.prominence === 'number' ? c.prominence : 0;
    const prominence: 'primary' | 'secondary' | 'tertiary' =
      promRaw >= 8 ? 'primary' : promRaw >= 5 ? 'secondary' : 'tertiary';
    return { text, position, prominence };
  });

  const trust_signals = Array.isArray(raw.trust_signals)
    ? (raw.trust_signals as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const allowedPricing = new Set(['premium', 'mid', 'popular', 'luxe', 'discount']);
  const pricingRaw = typeof raw.pricing_positioning === 'string' ? raw.pricing_positioning.toLowerCase() : null;
  const pricing_positioning = pricingRaw && allowedPricing.has(pricingRaw)
    ? (pricingRaw as 'premium' | 'mid' | 'popular' | 'luxe' | 'discount')
    : undefined;

  const funnel_friction = Array.isArray(raw.funnel_friction)
    ? (raw.funnel_friction as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const ux_score =
    typeof raw.ux_score === 'number' ? Math.max(1, Math.min(10, Math.round(raw.ux_score))) : 0;
  const ux_score_reason = typeof raw.ux_score_reason === 'string' ? raw.ux_score_reason : undefined;

  const allowedTone = new Set(['formal', 'casual', 'divertido', 'tecnico', 'aspiracional']);
  const toneRaw = typeof raw.copy_tone === 'string' ? raw.copy_tone.toLowerCase() : null;
  const copy_tone = toneRaw && allowedTone.has(toneRaw)
    ? (toneRaw as 'formal' | 'casual' | 'divertido' | 'tecnico' | 'aspiracional')
    : undefined;

  let brand_identity: PageUxAnalysis['brand_identity'];
  const biIn = raw.brand_identity as Record<string, unknown> | null | undefined;
  if (biIn && typeof biIn === 'object') {
    const colors = Array.isArray(biIn.dominant_colors)
      ? (biIn.dominant_colors as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const typography_vibe = typeof biIn.typography_vibe === 'string' ? biIn.typography_vibe : '';
    const photography_style = typeof biIn.photography_style === 'string' ? biIn.photography_style : '';
    if (colors.length > 0 || typography_vibe || photography_style) {
      brand_identity = {
        dominant_colors: colors,
        typography_vibe,
        photography_style,
      };
    }
  }

  const weaknesses_to_exploit = Array.isArray(raw.weaknesses_to_exploit)
    ? (raw.weaknesses_to_exploit as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const things_to_steal = Array.isArray(raw.things_to_steal)
    ? (raw.things_to_steal as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const value_proposition = typeof raw.value_proposition === 'string' ? raw.value_proposition : undefined;

  return {
    url,
    page_type: pageType,
    value_proposition,
    hero_analysis,
    popups_detected,
    ctas,
    trust_signals,
    pricing_positioning,
    funnel_friction,
    ux_score,
    ux_score_reason,
    copy_tone,
    brand_identity,
    weaknesses_to_exploit,
    things_to_steal,
  };
}

async function callSonnetForPage(
  scrape: PageScrape,
  screenshotBase64: string | null,
  screenshotMediaType: 'image/png' | 'image/jpeg',
): Promise<SonnetCallResult> {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      analysis: buildFallbackAnalysis(scrape.url, scrape.page_type, 'ANTHROPIC_API_KEY missing'),
      cost_usd: 0,
      duration_ms: Date.now() - t0,
      input_tokens: 0,
      output_tokens: 0,
      error: 'ANTHROPIC_API_KEY missing',
    };
  }

  const prompt = buildWebUxAnalysisPrompt({
    url: scrape.url,
    pageType: toUxPageType(scrape.page_type),
    markdown: scrape.markdown,
    screenshotBase64: screenshotBase64 ?? undefined,
    screenshotMediaType,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: SONNET_MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.userMessages }],
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = (await resp.json().catch(() => null)) as AnthropicResponseBody | null;
      const msg = errBody?.error?.message ?? `HTTP ${resp.status}`;
      console.log(`[web-crawl] sonnet HTTP ${resp.status} for ${scrape.url}: ${msg}`);
      return {
        analysis: buildFallbackAnalysis(scrape.url, scrape.page_type, `HTTP ${resp.status}`),
        cost_usd: 0,
        duration_ms: Date.now() - t0,
        input_tokens: 0,
        output_tokens: 0,
        error: msg,
      };
    }

    const data = (await resp.json()) as AnthropicResponseBody;
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const cost = (inputTokens * SONNET_INPUT_PER_1M_USD + outputTokens * SONNET_OUTPUT_PER_1M_USD) / 1_000_000;

    const rawText = data.content?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.log(`[web-crawl] sonnet JSON parse failed for ${scrape.url}: ${(parseErr as Error).message}`);
      return {
        analysis: buildFallbackAnalysis(scrape.url, scrape.page_type, 'JSON parse error'),
        cost_usd: cost,
        duration_ms: Date.now() - t0,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        error: 'JSON parse error',
      };
    }

    return {
      analysis: mapSonnetJsonToAnalysis(scrape.url, scrape.page_type, parsed),
      cost_usd: cost,
      duration_ms: Date.now() - t0,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[web-crawl] sonnet network error for ${scrape.url}: ${msg}`);
    return {
      analysis: buildFallbackAnalysis(scrape.url, scrape.page_type, msg),
      cost_usd: 0,
      duration_ms: Date.now() - t0,
      input_tokens: 0,
      output_tokens: 0,
      error: msg,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run an array of async tasks with bounded concurrency.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(limit, items.length);
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= items.length) return;
          results[idx] = await fn(items[idx], idx);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

/**
 * Try to upload a screenshot to the storage bucket. Non-fatal: if the bucket
 * doesn't exist or the upload fails, return null and the orchestrator drops
 * the screenshot_url from the output. We never throw here.
 */
async function uploadScreenshot(
  intelligenceId: string,
  url: string,
  base64: string,
  mediaType: 'image/png' | 'image/jpeg',
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const ext = mediaType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `${intelligenceId}/${slugifyForStorage(url)}.${ext}`;
  try {
    const buf = Buffer.from(base64, 'base64');
    const { error } = await supabase.storage
      .from(SCREENSHOTS_BUCKET)
      .upload(path, buf, {
        contentType: mediaType,
        upsert: true,
      });
    if (error) {
      // Bucket missing → "Bucket not found" string (Supabase). We log y devolvemos null.
      console.log(`[web-crawl] storage upload failed for ${path}: ${error.message}`);
      return null;
    }
    const { data: pub } = supabase.storage.from(SCREENSHOTS_BUCKET).getPublicUrl(path);
    return pub?.publicUrl ?? null;
  } catch (err) {
    console.log(`[web-crawl] storage upload threw for ${path}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface IntelligenceRow {
  id: string;
  client_id: string;
  competitor_url: string;
  clients: { user_id: string | null; client_user_id: string | null } | null;
}

export async function webCrawl(c: Context) {
  const t0 = Date.now();
  const supabase = getSupabaseAdmin();

  // Auth
  const user = c.get('user') as { id: string } | undefined;
  if (!user?.id) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const isInternal = c.get('isInternal') === true;

  // Parse body
  let body: WebCrawlRequest;
  try {
    body = (await c.req.json()) as WebCrawlRequest;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { intelligence_id, url } = body;
  const max_pages = Math.max(1, Math.min(25, body.max_pages ?? DEFAULT_MAX_PAGES));
  const include_paths = Array.isArray(body.include_paths) ? body.include_paths : undefined;
  const exclude_paths = Array.isArray(body.exclude_paths) ? body.exclude_paths : undefined;

  if (!intelligence_id || !url) {
    return c.json({ error: 'intelligence_id and url required' }, 400);
  }

  // SSRF check on the root URL
  const ssrf = validateUrlForSSRF(url);
  if (!ssrf.safe) {
    return c.json({ error: `Invalid URL: ${ssrf.reason}` }, 400);
  }

  // Ownership check
  const { data: intel, error: intelErr } = await supabase
    .from('competitor_intelligence')
    .select('id, client_id, competitor_url, clients(user_id, client_user_id)')
    .eq('id', intelligence_id)
    .maybeSingle<IntelligenceRow>();

  if (intelErr || !intel) {
    console.log('[web-crawl] intelligence not found', intelligence_id, intelErr?.message);
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

  console.log(`[web-crawl] start intelligence=${intelligence_id} url=${url} max_pages=${max_pages}`);

  // Aggregate cost tracking
  const apiCalls: CostTracking['api_calls'] = [];
  const addCost = (
    provider: 'firecrawl' | 'anthropic' | 'apify' | 'dataforseo',
    endpoint: string,
    cost_usd: number,
    duration_ms: number,
  ) => {
    apiCalls.push({ provider, endpoint, cost_usd, duration_ms });
  };

  // ---------------------------------------------------------------------
  // STEP 1 — Sitemap discovery
  // ---------------------------------------------------------------------
  const stepMapStart = Date.now();
  const mapResp = await mapSite(url);
  addCost('firecrawl', '/v1/map', mapResp.cost, Date.now() - stepMapStart);
  let candidateUrls: string[] = mapResp.data?.links ?? [];
  if (mapResp.error) {
    console.log(`[web-crawl] mapSite error: ${mapResp.error} — fallback a crawl directo`);
  }

  // Filtra include/exclude paths si vienen
  if (include_paths && include_paths.length > 0) {
    candidateUrls = candidateUrls.filter((u) => {
      try {
        const path = new URL(u).pathname;
        return include_paths.some((p) => path.startsWith(p));
      } catch {
        return false;
      }
    });
  }
  if (exclude_paths && exclude_paths.length > 0) {
    candidateUrls = candidateUrls.filter((u) => {
      try {
        const path = new URL(u).pathname;
        return !exclude_paths.some((p) => path.startsWith(p));
      } catch {
        return true;
      }
    });
  }

  // Si mapSite no devolvió nada, fallback a crawl directo (limit pequeño)
  if (candidateUrls.length === 0) {
    console.log('[web-crawl] mapSite empty — fallback a crawlSite limit=25');
    const stepCrawlStart = Date.now();
    const crawlResp = await crawlSite(url, {
      maxPages: 25,
      includePaths: include_paths,
      excludePaths: exclude_paths,
    });
    addCost(
      'firecrawl',
      '/v1/crawl',
      crawlResp.cost,
      Date.now() - stepCrawlStart,
    );
    if (crawlResp.data?.data && crawlResp.data.data.length > 0) {
      candidateUrls = crawlResp.data.data
        .map((p) => p.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
    }
  }

  console.log(`[web-crawl] discovered ${candidateUrls.length} candidate URLs`);

  // ---------------------------------------------------------------------
  // STEP 2 — Smart selection
  // ---------------------------------------------------------------------
  const selected = selectUrlsByQuota(candidateUrls, url, max_pages);
  console.log(
    `[web-crawl] selected ${selected.length} URLs:`,
    selected.map((s) => `${s.pageType}:${s.url}`).join(' | '),
  );

  if (selected.length === 0) {
    return c.json({ error: 'No URLs selected for crawling' }, 502);
  }

  // ---------------------------------------------------------------------
  // STEP 3 — Parallel scrape
  // ---------------------------------------------------------------------
  const scrapeT0 = Date.now();
  const settled = await Promise.allSettled(
    selected.map(async (item) => {
      const indivT0 = Date.now();
      const wrapper = await Promise.race([
        scrapePage(item.url, {
          screenshot: true,
          waitFor: SCRAPE_WAIT_FOR_MS,
          onlyMainContent: false,
        }),
        new Promise<{ data: null; cost: 0; error: string }>((resolve) =>
          setTimeout(
            () => resolve({ data: null, cost: 0, error: 'per-page timeout' }),
            PER_SCRAPE_TIMEOUT_MS,
          ),
        ),
      ]);
      return { item, wrapper, duration_ms: Date.now() - indivT0 };
    }),
  );
  console.log(`[web-crawl] scrape phase done in ${Date.now() - scrapeT0}ms`);

  // Gather successful PageScrapes + per-call costs
  const pageScrapes: PageScrape[] = [];
  const screenshotsBuffer: Array<{ url: string; base64: string; mediaType: 'image/png' | 'image/jpeg' } | null> = [];

  for (const r of settled) {
    if (r.status !== 'fulfilled') {
      console.log(`[web-crawl] scrape rejected:`, r.reason);
      continue;
    }
    const { item, wrapper, duration_ms } = r.value;
    addCost('firecrawl', '/v1/scrape', wrapper.cost ?? 0, duration_ms);
    if (!wrapper.data || wrapper.error) {
      console.log(`[web-crawl] scrape failed for ${item.url}: ${wrapper.error}`);
      continue;
    }
    const md = (wrapper.data.markdown as string | undefined) ?? '';
    const html = (wrapper.data.html as string | undefined) ?? '';
    const meta = (wrapper.data.metadata as Record<string, unknown> | undefined) ?? {};
    const title =
      (typeof meta.title === 'string' && meta.title) ||
      (typeof meta.ogTitle === 'string' && meta.ogTitle) ||
      undefined;
    const description =
      (typeof meta.description === 'string' && meta.description) ||
      (typeof meta.ogDescription === 'string' && meta.ogDescription) ||
      undefined;
    const status_code =
      typeof meta.statusCode === 'number'
        ? meta.statusCode
        : typeof meta.statusCode === 'string'
          ? parseInt(meta.statusCode, 10) || 200
          : 200;

    const ps: PageScrape = {
      url: item.url,
      page_type: item.pageType,
      status_code,
      title: title ? String(title) : undefined,
      description: description ? String(description) : undefined,
      markdown: md,
      html,
      screenshot_url: undefined, // se completa post-upload
    };
    pageScrapes.push(ps);

    // Buffer screenshot for later upload + Sonnet
    const screenshot = wrapper.data.screenshot as string | undefined;
    if (screenshot) {
      const conv = await fetchScreenshotAsBase64(screenshot);
      if (conv.base64) {
        screenshotsBuffer.push({ url: item.url, base64: conv.base64, mediaType: conv.mediaType });
      } else {
        screenshotsBuffer.push(null);
      }
    } else {
      screenshotsBuffer.push(null);
    }
  }

  console.log(`[web-crawl] scraped ${pageScrapes.length}/${selected.length} pages successfully`);

  // Graceful: 0 pages → 502
  if (pageScrapes.length === 0) {
    await supabase
      .from('competitor_intelligence')
      .update({
        analysis_status: 'failed',
        last_analyzed_at: new Date().toISOString(),
      })
      .eq('id', intelligence_id);

    const total_cost_usd = apiCalls.reduce((s, a) => s + a.cost_usd, 0);
    return c.json(
      {
        error: 'Firecrawl returned 0 pages',
        cost_tracking: { api_calls: apiCalls, total_cost_usd },
      },
      502,
    );
  }

  const partial = pageScrapes.length < selected.length;

  // ---------------------------------------------------------------------
  // STEP 4 — Tech stack detection (homepage preferred)
  // ---------------------------------------------------------------------
  const homepage = pageScrapes.find((p) => p.page_type === 'homepage') ?? pageScrapes[0];
  const homepageHtml = homepage.html ?? '';
  const homepageMd = homepage.markdown ?? '';
  const techStackBuilt = buildTechStack(homepageHtml, homepageMd);
  // GTM enrichment: when a container ID was detected, fetch its public JS to
  // recover dynamically-injected pixels (Meta, GA4, TikTok, Google Ads). Only
  // adds latency (~1s) when GTM is present; skipped silently otherwise.
  const techStackEnriched = await enrichTechStackFromGtm(techStackBuilt);
  const techStack: TechStack = {
    ecommerce_platform: techStackEnriched.ecommerce_platform,
    cms: techStackEnriched.cms,
    cdn: techStackEnriched.cdn,
    reviews_provider: techStackEnriched.reviews_provider,
    email_provider: techStackEnriched.email_provider,
    chat_tool: techStackEnriched.chat_tool,
    ab_testing_tool: techStackEnriched.ab_testing_tool,
    personalization_tool: techStackEnriched.personalization_tool,
    analytics_stack: techStackEnriched.analytics_stack,
    tracking_pixels: techStackEnriched.tracking_pixels,
    marketing_sophistication: techStackEnriched.marketing_sophistication,
    evidence: techStackEnriched.evidence,
  };
  console.log(
    `[web-crawl] tech_stack platform=${techStack.ecommerce_platform ?? 'unknown'} sophistication=${techStack.marketing_sophistication} pixels=meta=${techStack.tracking_pixels.meta_pixel}/ga=${techStack.tracking_pixels.google_analytics}/tiktok=${techStack.tracking_pixels.tiktok_pixel}`,
  );

  // ---------------------------------------------------------------------
  // STEP 5 — Sonnet vision por página (max 5 concurrentes)
  // ---------------------------------------------------------------------
  const sonnetT0 = Date.now();
  const analyses = await runWithConcurrency(
    pageScrapes,
    SONNET_MAX_CONCURRENCY,
    async (scrape, idx) => {
      const screenshot = screenshotsBuffer[idx] ?? null;
      const result = await callSonnetForPage(
        scrape,
        screenshot?.base64 ?? null,
        screenshot?.mediaType ?? 'image/png',
      );
      addCost(
        'anthropic',
        `messages:${SONNET_MODEL}`,
        result.cost_usd,
        result.duration_ms,
      );
      return result;
    },
  );
  console.log(`[web-crawl] sonnet phase done in ${Date.now() - sonnetT0}ms`);

  const successfulAnalyses = analyses.filter((a) => !a.error);
  if (successfulAnalyses.length === 0) {
    console.log('[web-crawl] WARN: all Sonnet vision calls failed — devolviendo ux_analyses=[]');
  }
  const uxAnalyses: PageUxAnalysis[] = successfulAnalyses.map((r) => r.analysis);

  // ---------------------------------------------------------------------
  // STEP 6 — Upload screenshots (best-effort)
  // ---------------------------------------------------------------------
  for (let i = 0; i < pageScrapes.length; i++) {
    const buffer = screenshotsBuffer[i];
    if (!buffer) continue;
    const publicUrl = await uploadScreenshot(
      intelligence_id,
      buffer.url,
      buffer.base64,
      buffer.mediaType,
    );
    if (publicUrl) {
      pageScrapes[i].screenshot_url = publicUrl;
    }
  }

  // Persist intelligence row update.
  // El CHECK del schema solo permite ('pending','running','completed','failed').
  // Spec del agente pide 'partial' — el constraint NO lo permite. Marcamos
  // 'completed' y dejamos el flag `partial` en el cuerpo de la respuesta.
  // TODO(Diego W8): proponer migration para agregar 'partial' al CHECK.
  const updateStatus = 'completed';
  const { error: updErr } = await supabase
    .from('competitor_intelligence')
    .update({
      analysis_status: updateStatus,
      last_analyzed_at: new Date().toISOString(),
    })
    .eq('id', intelligence_id);
  if (updErr) {
    console.log('[web-crawl] update intelligence failed', updErr.message);
  }

  // ---------------------------------------------------------------------
  // Build response
  // ---------------------------------------------------------------------
  const data: WebIntelligence = {
    pages_analyzed: pageScrapes,
    ux_analyses: uxAnalyses,
    tech_stack: techStack,
    source_quality: 'inferred',
  };

  const total_cost_usd = apiCalls.reduce((s, a) => s + a.cost_usd, 0);
  const cost_tracking: CostTracking = {
    api_calls: apiCalls,
    total_cost_usd,
  };

  console.log(
    `[web-crawl] done ${Date.now() - t0}ms pages=${pageScrapes.length} ux=${uxAnalyses.length} cost=$${total_cost_usd.toFixed(4)}`,
  );

  return c.json({
    success: true,
    partial,
    warning:
      successfulAnalyses.length === 0
        ? 'AI vision analysis failed for all pages — ux_analyses is empty'
        : undefined,
    data,
    cost_tracking,
  });
}
