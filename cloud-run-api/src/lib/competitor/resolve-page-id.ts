/**
 * URL → Facebook Page ID resolver para Meta Ad Library scraping.
 *
 * Recibe cualquier input que el cliente nos pase (sitio web, URL de Facebook,
 * handle de Instagram) y devuelve el page_id numérico de Facebook. Sin page_id
 * el scraper de Apify Ad Library tiene que hacer keyword-search ruidoso; con
 * page_id arma `view_all_page_id={id}` y trae los anuncios reales de la marca.
 *
 * Estrategia (en cascada, primero el más barato):
 *   A) Sitio web (cocacola.cl) → Firecrawl → regex link facebook.com → caso B
 *   B) URL Facebook (facebook.com/cocacolachile) → Apify facebook-pages-scraper
 *   C) IG handle (@cocacolachile) → Apify instagram-profile-scraper → fb page
 *
 * Owner: Sofía W14 (Integraciones).
 * Cross-reviewer pendiente: Isidora W6.
 */
import { ACTORS, runActorAsync, waitForRun, getRunDataset } from './apify-client.js';
import { scrapePage } from './firecrawl-client.js';

export type PageIdSource = 'website' | 'facebook_url' | 'instagram_handle' | 'unresolved';

export interface PageIdResolution {
  page_id: string | null;
  page_name?: string;
  facebook_url?: string;
  source: PageIdSource;
  cost: number;
  duration_ms: number;
  error: string | null;
  /** Pasos que intentó la cascada — útil para debug en logs/UI. */
  trace: string[];
}

interface ResolveInput {
  competitor_url?: string | null;
  ig_handle?: string | null;
}

// ---------------------------------------------------------------------------
// Detección de tipo de input
// ---------------------------------------------------------------------------

type InputKind =
  | { kind: 'facebook_url'; url: string }
  | { kind: 'instagram_handle'; handle: string }
  | { kind: 'website'; url: string }
  | { kind: 'empty' };

function classifyInput(input: ResolveInput): InputKind {
  const raw = (input.competitor_url || '').trim();
  const handle = (input.ig_handle || '').trim().replace(/^@/, '');

  if (raw) {
    const lower = raw.toLowerCase();
    if (lower.includes('facebook.com/') || lower.includes('fb.com/')) {
      return { kind: 'facebook_url', url: ensureHttps(raw) };
    }
    if (lower.includes('instagram.com/')) {
      const m = raw.match(/instagram\.com\/([^/?#\s]+)/i);
      if (m && m[1]) return { kind: 'instagram_handle', handle: m[1] };
    }
    if (looksLikeDomain(raw)) {
      return { kind: 'website', url: ensureHttps(raw) };
    }
  }

  if (handle) {
    return { kind: 'instagram_handle', handle };
  }

  return { kind: 'empty' };
}

function ensureHttps(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function looksLikeDomain(value: string): boolean {
  return /\.[a-z]{2,}(?:\/|$|\?|#)/i.test(value);
}

// ---------------------------------------------------------------------------
// Caso A — sitio web → buscar link a Facebook
// ---------------------------------------------------------------------------

/** Slugs que NO son páginas oficiales de marcas (sharer, plugins, helpers, ads). */
const FB_BLACKLIST = new Set([
  'sharer', 'sharer.php', 'tr', 'tr.php', 'plugins', 'dialog', 'login',
  'help', 'policies', 'policy', 'business', 'pages', 'profile.php',
  'home.php', 'login.php', 'signup', 'recover', 'ads', 'people',
  'permalink.php', 'photo.php', 'video.php', 'watch', 'events',
  'groups', 'gaming', 'marketplace', 'messages', 'notifications',
  'settings', 'l', 'lm', 'reg', 'rsrc.php',
]);

/**
 * Extrae el slug más probable de la página oficial desde el HTML del sitio web.
 * Cuenta ocurrencias de cada slug — el oficial suele aparecer en header + footer.
 */
function extractFacebookSlug(html: string): string | null {
  if (!html) return null;
  const counts = new Map<string, number>();
  const re = /facebook\.com\/([a-zA-Z0-9.\-_]+)(?=[/?#"'\s>])/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const slug = match[1];
    if (!slug || slug.length < 2) continue;
    if (FB_BLACKLIST.has(slug.toLowerCase())) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// Caso B — URL Facebook → page_id vía Apify
// ---------------------------------------------------------------------------

interface FacebookPageItem {
  pageId?: string | number;
  pageID?: string | number;
  page_id?: string | number;
  id?: string | number;
  name?: string;
  title?: string;
  url?: string;
  pageUrl?: string;
  page_url?: string;
}

function pickPageId(item: FacebookPageItem | undefined): string | null {
  if (!item) return null;
  const id = item.pageId ?? item.pageID ?? item.page_id ?? item.id;
  if (id === undefined || id === null) return null;
  const str = String(id).trim();
  return /^\d+$/.test(str) ? str : null;
}

async function resolveFromFacebookUrl(
  facebookUrl: string,
  trace: string[]
): Promise<{ page_id: string | null; page_name?: string; facebook_url?: string; cost: number; error: string | null }> {
  trace.push(`apify:facebook-pages-scraper url=${facebookUrl}`);

  const start = await runActorAsync(ACTORS.FACEBOOK_PAGE, {
    startUrls: [{ url: facebookUrl }],
    maxRequestRetries: 2,
    maxConcurrency: 1,
  });
  if (start.error || !start.data) {
    return { page_id: null, cost: 0, error: start.error || 'pages-scraper start failed' };
  }

  const wait = await waitForRun(start.data.id, { timeoutMs: 3 * 60_000 });
  if (wait.error || !wait.data) {
    return { page_id: null, cost: wait.cost, error: wait.error || 'pages-scraper wait failed' };
  }

  const dataset = await getRunDataset<FacebookPageItem>(start.data.id);
  if (dataset.error || !dataset.data) {
    return { page_id: null, cost: wait.cost, error: dataset.error || 'pages-scraper no dataset' };
  }

  const item = dataset.data[0];
  const pageId = pickPageId(item);
  if (!pageId) {
    return { page_id: null, cost: wait.cost, error: 'pageId not in dataset' };
  }

  return {
    page_id: pageId,
    page_name: item?.name || item?.title,
    facebook_url: item?.url || item?.pageUrl || item?.page_url || facebookUrl,
    cost: wait.cost,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Caso C — IG handle → buscar Facebook Page conectada
// ---------------------------------------------------------------------------

interface InstagramProfileItem {
  username?: string;
  fullName?: string;
  full_name?: string;
  externalUrl?: string;
  external_url?: string;
  facebookPage?: string;
  connectedFbPage?: string;
  connected_fb_page?: string;
  businessConnectedFbPage?: string;
  business_connected_fb_page?: string;
  fbid?: string | number;
  fbId?: string | number;
}

function pickInstagramFbHint(item: InstagramProfileItem | undefined): {
  facebookUrl?: string;
  externalUrl?: string;
} {
  if (!item) return {};
  const fbCandidate =
    item.facebookPage ||
    item.connectedFbPage ||
    item.connected_fb_page ||
    item.businessConnectedFbPage ||
    item.business_connected_fb_page ||
    undefined;
  const externalUrl = item.externalUrl || item.external_url || undefined;
  return {
    facebookUrl: fbCandidate ? ensureHttps(fbCandidate) : undefined,
    externalUrl: externalUrl ? ensureHttps(externalUrl) : undefined,
  };
}

async function resolveFromInstagramHandle(
  handle: string,
  trace: string[]
): Promise<{
  facebookUrl?: string;
  externalUrl?: string;
  cost: number;
  error: string | null;
}> {
  trace.push(`apify:instagram-profile-scraper handle=${handle}`);

  const start = await runActorAsync(ACTORS.INSTAGRAM_PROFILE, {
    usernames: [handle],
    resultsLimit: 1,
  });
  if (start.error || !start.data) {
    return { cost: 0, error: start.error || 'ig-profile start failed' };
  }

  const wait = await waitForRun(start.data.id, { timeoutMs: 3 * 60_000 });
  if (wait.error || !wait.data) {
    return { cost: wait.cost, error: wait.error || 'ig-profile wait failed' };
  }

  const dataset = await getRunDataset<InstagramProfileItem>(start.data.id);
  if (dataset.error || !dataset.data) {
    return { cost: wait.cost, error: dataset.error || 'ig-profile no dataset' };
  }

  const hint = pickInstagramFbHint(dataset.data[0]);
  if (!hint.facebookUrl && !hint.externalUrl) {
    return { cost: wait.cost, error: 'no fb/external hint in IG profile' };
  }
  return { ...hint, cost: wait.cost, error: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resuelve `page_id` de Facebook a partir de cualquier input de competidor.
 * Intenta cascada barata→cara y devuelve trace para debug. Nunca lanza.
 */
export async function resolveFacebookPageId(input: ResolveInput): Promise<PageIdResolution> {
  const t0 = Date.now();
  const trace: string[] = [];
  let totalCost = 0;

  const classified = classifyInput(input);
  trace.push(`classified:${classified.kind}`);

  if (classified.kind === 'empty') {
    return {
      page_id: null,
      source: 'unresolved',
      cost: 0,
      duration_ms: Date.now() - t0,
      error: 'No competitor_url ni ig_handle',
      trace,
    };
  }

  // ---------- Caso B directo: ya nos pasaron URL de Facebook ----------
  if (classified.kind === 'facebook_url') {
    const r = await resolveFromFacebookUrl(classified.url, trace);
    totalCost += r.cost;
    if (r.page_id) {
      return {
        page_id: r.page_id,
        page_name: r.page_name,
        facebook_url: r.facebook_url,
        source: 'facebook_url',
        cost: totalCost,
        duration_ms: Date.now() - t0,
        error: null,
        trace,
      };
    }
    return {
      page_id: null,
      source: 'unresolved',
      cost: totalCost,
      duration_ms: Date.now() - t0,
      error: r.error || 'fb_url unresolved',
      trace,
    };
  }

  // ---------- Caso A: sitio web → buscar link FB → caso B ----------
  if (classified.kind === 'website') {
    trace.push(`firecrawl:scrape ${classified.url}`);
    const scrape = await scrapePage(classified.url, { onlyMainContent: false });
    totalCost += scrape.cost;
    if (scrape.error || !scrape.data) {
      return {
        page_id: null,
        source: 'unresolved',
        cost: totalCost,
        duration_ms: Date.now() - t0,
        error: scrape.error || 'website scrape failed',
        trace,
      };
    }
    const haystack = (scrape.data.html || '') + '\n' + (scrape.data.markdown || '');
    const slug = extractFacebookSlug(haystack);
    if (!slug) {
      return {
        page_id: null,
        source: 'unresolved',
        cost: totalCost,
        duration_ms: Date.now() - t0,
        error: 'no facebook link in website',
        trace,
      };
    }
    trace.push(`fb_slug:${slug}`);
    const fbUrl = `https://www.facebook.com/${slug}`;
    const r = await resolveFromFacebookUrl(fbUrl, trace);
    totalCost += r.cost;
    if (r.page_id) {
      return {
        page_id: r.page_id,
        page_name: r.page_name,
        facebook_url: r.facebook_url,
        source: 'website',
        cost: totalCost,
        duration_ms: Date.now() - t0,
        error: null,
        trace,
      };
    }
    return {
      page_id: null,
      source: 'unresolved',
      cost: totalCost,
      duration_ms: Date.now() - t0,
      error: r.error || 'fb scrape after website failed',
      trace,
    };
  }

  // ---------- Caso C: IG handle → IG profile → FB url → caso B ----------
  if (classified.kind === 'instagram_handle') {
    const ig = await resolveFromInstagramHandle(classified.handle, trace);
    totalCost += ig.cost;
    if (ig.error && !ig.facebookUrl && !ig.externalUrl) {
      return {
        page_id: null,
        source: 'unresolved',
        cost: totalCost,
        duration_ms: Date.now() - t0,
        error: ig.error,
        trace,
      };
    }

    // Intento 1: si Apify devolvió FB page directo
    if (ig.facebookUrl) {
      const r = await resolveFromFacebookUrl(ig.facebookUrl, trace);
      totalCost += r.cost;
      if (r.page_id) {
        return {
          page_id: r.page_id,
          page_name: r.page_name,
          facebook_url: r.facebook_url,
          source: 'instagram_handle',
          cost: totalCost,
          duration_ms: Date.now() - t0,
          error: null,
          trace,
        };
      }
    }

    // Intento 2: external URL del perfil → caso A
    if (ig.externalUrl) {
      trace.push(`firecrawl:scrape (from IG external) ${ig.externalUrl}`);
      const scrape = await scrapePage(ig.externalUrl, { onlyMainContent: false });
      totalCost += scrape.cost;
      const haystack = (scrape.data?.html || '') + '\n' + (scrape.data?.markdown || '');
      const slug = extractFacebookSlug(haystack);
      if (slug) {
        trace.push(`fb_slug:${slug}`);
        const fbUrl = `https://www.facebook.com/${slug}`;
        const r = await resolveFromFacebookUrl(fbUrl, trace);
        totalCost += r.cost;
        if (r.page_id) {
          return {
            page_id: r.page_id,
            page_name: r.page_name,
            facebook_url: r.facebook_url,
            source: 'instagram_handle',
            cost: totalCost,
            duration_ms: Date.now() - t0,
            error: null,
            trace,
          };
        }
      }
    }

    return {
      page_id: null,
      source: 'unresolved',
      cost: totalCost,
      duration_ms: Date.now() - t0,
      error: 'IG handle did not yield a Facebook page',
      trace,
    };
  }

  return {
    page_id: null,
    source: 'unresolved',
    cost: totalCost,
    duration_ms: Date.now() - t0,
    error: 'unhandled input kind',
    trace,
  };
}

/**
 * Construye URL del Meta Ad Library filtrada por una Page específica.
 * Esto reemplaza el `?q=keyword_unordered` ruidoso con el filtro oficial
 * `view_all_page_id` que Meta usa cuando el usuario clickea "Ver biblioteca de
 * anuncios" en el perfil de la marca.
 */
export function buildAdLibraryUrlByPageId(pageId: string, country: string): string {
  return (
    `https://www.facebook.com/ads/library/?` +
    `active_status=all&ad_type=all&` +
    `country=${encodeURIComponent(country)}&` +
    `view_all_page_id=${encodeURIComponent(pageId)}`
  );
}
