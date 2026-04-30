/**
 * Direct fetch + Wayback fallbacks for competitor scraping.
 *
 * Cascade strategy (cheapest → most expensive):
 *   1. directFetch()        — plain fetch with real Chrome UA. Free, ~500ms.
 *                             Works for ~80% of mid-tier sites (CF basic mode,
 *                             WordPress, Shopify, VTEX, Tiendanube, Wix).
 *   2. (Firecrawl)          — caller falls back to Firecrawl when this fails.
 *   3. waybackFetch()       — pulls latest archived snapshot. Free, no rate
 *                             limit on us, but data may be 1-30d old.
 *
 * Plus a niche helper:
 *   - gtmContainerLookup()  — fetches a GTM container's public JS to enumerate
 *                             every pixel/tag configured (Meta, GA4, TikTok,
 *                             Pinterest, etc.) WITHOUT scraping the merchant
 *                             site. The container ID is public information.
 *
 * Owner: Ignacio W17. SSRF protection enforced before every external call.
 */
import { validateUrlForSSRF } from '../url-validator.js';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_USEFUL_HTML_BYTES = 2_000; // CF block pages and `Unavailable Shop`
                                     // responses come in well under this.

export interface DirectFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  bytes: number;
  source: 'direct' | 'wayback' | 'none';
  /** Reason a fetch is considered NOT useful even if HTTP is 200. */
  notUsefulReason?: string;
  error?: string;
  durationMs: number;
}

const cleanResult = (
  override: Partial<DirectFetchResult> = {},
): DirectFetchResult => ({
  ok: false,
  status: 0,
  finalUrl: '',
  html: '',
  bytes: 0,
  source: 'none',
  durationMs: 0,
  ...override,
});

/**
 * Detect Cloudflare block / interstitial pages that return HTTP 200 with
 * minimal "you are blocked" HTML. We treat these as failures so the caller
 * cascades to Firecrawl/Wayback.
 */
function isCloudflareBlockPage(html: string): boolean {
  if (!html) return false;
  const lower = html.toLowerCase();
  return (
    (lower.includes('cf-error-details') ||
      lower.includes('cf-wrapper') ||
      lower.includes('cloudflare ray id')) &&
    (lower.includes('you have been blocked') ||
      lower.includes('attention required') ||
      lower.includes('please enable cookies'))
  );
}

/**
 * Detect Shopify "shop unavailable" / suspended responses (HTTP 402 or 503
 * with the standard Shopify error JSON).
 */
function isShopifyUnavailable(html: string, status: number): boolean {
  if (status === 402 || status === 503) {
    const lower = html.toLowerCase();
    if (lower.includes('unavailable shop') || lower.includes('shop is currently unavailable')) {
      return true;
    }
  }
  return false;
}

/**
 * Direct HTTP fetch with a real Chrome User-Agent and Accept-Language headers
 * that mirror a Chilean desktop browser. Follows redirects.
 */
export async function directFetch(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<DirectFetchResult> {
  const started = Date.now();
  const ssrf = validateUrlForSSRF(url);
  if (!ssrf.safe) {
    return cleanResult({
      error: `SSRF blocked: ${ssrf.reason}`,
      durationMs: Date.now() - started,
    });
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': CHROME_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    clearTimeout(timer);

    const html = await res.text();
    const bytes = html.length;
    const finalUrl = res.url;

    if (!res.ok) {
      const shopifyDown = isShopifyUnavailable(html, res.status);
      return cleanResult({
        status: res.status,
        finalUrl,
        html,
        bytes,
        source: 'direct',
        notUsefulReason: shopifyDown ? 'shopify-unavailable' : `http-${res.status}`,
        durationMs: Date.now() - started,
      });
    }

    if (bytes < MIN_USEFUL_HTML_BYTES) {
      return cleanResult({
        status: res.status,
        finalUrl,
        html,
        bytes,
        source: 'direct',
        notUsefulReason: 'html-too-small',
        durationMs: Date.now() - started,
      });
    }

    if (isCloudflareBlockPage(html)) {
      return cleanResult({
        status: res.status,
        finalUrl,
        html,
        bytes,
        source: 'direct',
        notUsefulReason: 'cloudflare-block',
        durationMs: Date.now() - started,
      });
    }

    return {
      ok: true,
      status: res.status,
      finalUrl,
      html,
      bytes,
      source: 'direct',
      durationMs: Date.now() - started,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    return cleanResult({
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
  }
}

/**
 * Wayback Machine fallback. Asks the Internet Archive for the latest snapshot
 * of `url` and fetches its raw HTML. Snapshots can be days/weeks old, but data
 * is good enough for tech-stack detection and structured-data extraction.
 *
 * Free API, no auth required. We hit `archive.org/wayback/available?url=...`
 * which returns the closest snapshot URL.
 */
export async function waybackFetch(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<DirectFetchResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const lookup = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': CHROME_UA },
      },
    );
    if (!lookup.ok) {
      return cleanResult({
        error: `wayback lookup failed HTTP ${lookup.status}`,
        durationMs: Date.now() - started,
      });
    }
    const meta = (await lookup.json()) as {
      archived_snapshots?: { closest?: { url?: string; available?: boolean } };
    };
    const snapshotUrl = meta.archived_snapshots?.closest?.url;
    if (!snapshotUrl || !meta.archived_snapshots?.closest?.available) {
      return cleanResult({
        error: 'no wayback snapshot',
        durationMs: Date.now() - started,
      });
    }

    // Use `id_` flag (raw, no Wayback toolbar) for clean HTML.
    const rawSnapshot = snapshotUrl.replace(/\/(\d{14})\//, '/$1id_/');
    const res = await fetch(rawSnapshot, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': CHROME_UA },
    });
    const html = await res.text();
    if (!res.ok || html.length < MIN_USEFUL_HTML_BYTES) {
      return cleanResult({
        status: res.status,
        finalUrl: rawSnapshot,
        html,
        bytes: html.length,
        source: 'wayback',
        notUsefulReason: 'snapshot-empty',
        error: `wayback snapshot HTTP ${res.status}`,
        durationMs: Date.now() - started,
      });
    }
    return {
      ok: true,
      status: res.status,
      finalUrl: rawSnapshot,
      html,
      bytes: html.length,
      source: 'wayback',
      durationMs: Date.now() - started,
    };
  } catch (err: unknown) {
    return cleanResult({
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
  }
}

/**
 * Fetches a GTM container's public JS payload to enumerate the tags configured
 * inside it. Returns the raw JS body (caller runs regex extraction).
 *
 * GTM container IDs (e.g. `GTM-ABC123`) are public — they're shipped on every
 * page load. Hitting `googletagmanager.com/gtm.js?id={id}` is safe and free.
 *
 * Use case: when `directFetch()` only finds the GTM loader on a competitor's
 * site, calling this expands what we know about which pixels are wired up
 * (Meta Pixel ID, GA4 Measurement ID, conversion events, etc.).
 */
export async function gtmContainerLookup(
  gtmId: string,
  options: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; body: string; bytes: number; error?: string }> {
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(gtmId.trim())) {
    return { ok: false, body: '', bytes: 0, error: 'invalid gtm id' };
  }
  const url = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId.trim())}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/javascript,*/*;q=0.8' },
    });
    if (!res.ok) {
      return { ok: false, body: '', bytes: 0, error: `HTTP ${res.status}` };
    }
    const body = await res.text();
    return { ok: true, body, bytes: body.length };
  } catch (err: unknown) {
    return {
      ok: false,
      body: '',
      bytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Extracts identifiers of pixels / analytics tools from a GTM container body.
 *
 * Looks for the most common patterns Google Tag Manager bakes in:
 *   - GA4: `G-XXXXXXX`
 *   - GA Universal: `UA-XXXXXX-X` (legacy but still around)
 *   - Meta/Facebook Pixel ID: 15-16 digit numeric strings near `fbq`
 *   - TikTok Pixel: `TT-` or 20-char alphanumeric near tiktok pixel snippet
 *   - Google Ads conversion: `AW-XXXXXXXXX`
 */
export function extractPixelsFromGtm(body: string): {
  ga4: string[];
  ga_universal: string[];
  meta_pixel: string[];
  tiktok_pixel: string[];
  google_ads: string[];
} {
  const dedupe = (arr: string[]) => Array.from(new Set(arr));
  const ga4 = body.match(/G-[A-Z0-9]{6,12}/g) ?? [];
  const gaU = body.match(/UA-\d{4,10}-\d{1,3}/g) ?? [];
  const ads = body.match(/AW-\d{8,12}/g) ?? [];

  // Meta Pixel IDs are 15-16 digits and usually appear after `fbq('init',` in
  // GTM-injected snippets. Be conservative — require the `fbq` neighbourhood.
  const metaMatches: string[] = [];
  const metaRe = /fbq\(\s*["']init["']\s*,\s*["'](\d{14,17})["']/g;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(body)) !== null) metaMatches.push(m[1]);

  // TikTok pixel IDs are 20-char alphanumeric and appear after `ttq.load`.
  const ttMatches: string[] = [];
  const ttRe = /ttq\.load\(\s*["']([A-Z0-9]{16,24})["']/g;
  while ((m = ttRe.exec(body)) !== null) ttMatches.push(m[1]);

  return {
    ga4: dedupe(ga4),
    ga_universal: dedupe(gaU),
    meta_pixel: dedupe(metaMatches),
    tiktok_pixel: dedupe(ttMatches),
    google_ads: dedupe(ads),
  };
}
