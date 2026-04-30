import { Context } from 'hono';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Download an image from Facebook CDN and persist it to Supabase Storage.
 * Returns the public Supabase URL, or the original URL as fallback on any error.
 */
async function persistImage(
  supabase: SupabaseClient,
  imageUrl: string,
  clientId: string,
  adLibraryId: string,
  index: number,
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const resp = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) return imageUrl;

    const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim() || '';
    const ext = MIME_TO_EXT[contentType];
    if (!ext) return imageUrl; // not a supported image type

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength < 100 || buffer.byteLength > 10 * 1024 * 1024) return imageUrl;

    const path = `competitors/${clientId}/${adLibraryId}_${index}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('ad-references')
      .upload(path, buffer, {
        contentType,
        cacheControl: '31536000',
        upsert: true,
      });

    if (uploadError) {
      console.warn(`[persistImage] Upload failed for ${path}:`, uploadError.message);
      return imageUrl;
    }

    const { data: urlData } = supabase.storage
      .from('ad-references')
      .getPublicUrl(path);

    return urlData.publicUrl;
  } catch (err: any) {
    console.warn(`[persistImage] Failed for ${imageUrl}:`, err.message);
    return imageUrl;
  }
}

interface AdLibraryAd {
  id: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  page_id?: string;
  page_name?: string;
  publisher_platforms?: string[];
  estimated_audience_size?: { lower_bound?: number; upper_bound?: number };
  impressions?: { lower_bound?: number; upper_bound?: number };
  spend?: { lower_bound?: number; upper_bound?: number };
  bylines?: string;
  collation_count?: number;
  collation_id?: string;
  currency?: string;
  languages?: string[];
}

/** Response shape from apify~facebook-ads-scraper (build 0.0.263+) */
interface ApifyScraperAd {
  adArchiveID?: string;
  adArchiveId?: string;
  pageId?: string;
  pageID?: string;
  pageName?: string;
  isActive?: boolean;
  collationCount?: number;
  startDate?: number; // unix ms
  endDate?: number; // unix ms
  startDateFormatted?: string; // ISO string
  endDateFormatted?: string; // ISO string
  publisherPlatform?: string[];
  currency?: string;
  impressionsWithIndex?: {
    impressionsText?: string;
    impressions_text?: string;
    impressionsIndex?: number;
    [key: string]: any;
  };
  spend?: {
    lower_bound?: string;
    upper_bound?: string;
  };
  reachEstimate?: {
    lower_bound?: number;
    upper_bound?: number;
  };
  snapshot?: {
    pageName?: string;
    pageId?: string;
    // Body can be either { text: string } or { markup: { __html: string } }
    body?: { text?: string; markup?: { __html: string } };
    // Apify returns camelCase for some fields, snake_case for others
    ctaText?: string;
    cta_text?: string;
    ctaType?: string;
    cta_type?: string;
    linkUrl?: string;
    link_url?: string;
    caption?: string;
    displayFormat?: string;
    title?: string;
    cards?: Array<{
      body?: string;
      title?: string;
      linkUrl?: string;
      link_url?: string;
      ctaText?: string;
      cta_text?: string;
      ctaType?: string;
      cta_type?: string;
      videoPreviewImageUrl?: string;
      video_preview_image_url?: string;
      resizedImageUrl?: string;
      resized_image_url?: string;
      originalImageUrl?: string;
      original_image_url?: string;
    }>;
    images?: Array<{
      resizedImageUrl?: string;
      resized_image_url?: string;
      originalImageUrl?: string;
      original_image_url?: string;
    }>;
    videos?: Array<{
      videoPreviewImageUrl?: string;
      video_preview_image_url?: string;
      videoSdUrl?: string;
      videoHdUrl?: string;
    }>;
  };
}

/**
 * Extract Facebook page ID from a FB page URL.
 * Supports: facebook.com/PAGENAME, facebook.com/profile.php?id=123, facebook.com/pages/xxx/123
 */
function extractPageIdOrSlug(fbUrl: string): string | null {
  try {
    let url = fbUrl.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');

    // facebook.com/profile.php?id=123456
    if (path.includes('profile.php')) {
      return parsed.searchParams.get('id');
    }
    // facebook.com/pages/Name/123456
    const pagesMatch = path.match(/\/pages\/[^/]+\/(\d+)/);
    if (pagesMatch) return pagesMatch[1];

    // facebook.com/PAGENAME or facebook.com/p/PAGENAME
    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'p' && segments[1]) return segments[1];
    if (segments[0]) return segments[0];
  } catch {
    // Not a valid URL — treat as raw slug
    return fbUrl.trim().replace(/^\//, '');
  }
  return null;
}

/**
 * Check if input looks like a Facebook URL (not just a random word)
 */
function isFacebookUrl(input: string): boolean {
  const lower = input.toLowerCase().trim();
  return lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.me');
}

/**
 * Build Ad Library URL for Apify scraper input
 */
function buildAdLibraryUrl(fbPageUrl: string): string {
  // If already an Ad Library URL, use as-is
  if (fbPageUrl.includes('ads/library')) return fbPageUrl;

  // Base params that Apify needs to return results
  const base = 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&is_targeted_country=false&media_type=all&search_type=keyword_unordered';

  // If it's a proper Facebook URL, extract the page slug/id
  if (isFacebookUrl(fbPageUrl)) {
    const slug = extractPageIdOrSlug(fbPageUrl);
    if (slug) {
      // Use the slug as search query — Apify resolves it on the Ad Library page
      return `${base}&q=${encodeURIComponent(slug)}`;
    }
  }

  // Fallback: use as search query
  return `${base}&q=${encodeURIComponent(fbPageUrl.trim())}`;
}

/**
 * Build Ad Library URL using a resolved page_id (view_all_page_id param).
 * This gives exact results for a specific page — better than keyword search.
 */
function buildAdLibraryUrlWithPageId(pageId: string): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&is_targeted_country=false&media_type=all&search_type=keyword_unordered&view_all_page_id=${pageId}`;
}

/**
 * Sanitize a competitor query for Ad Library keyword search.
 * Strips TLDs (.cl, .com, .co, .mx, .es, .net, .org), dashes, dots, and
 * @ prefix. "manosdelalma.cl" → "manos del alma" / "@good_gres" → "good gres".
 * Apify scrapeará Ad Library con esa query.
 */
function sanitizeForSearch(query: string): string {
  let q = query.trim().toLowerCase();
  if (q.startsWith('@')) q = q.slice(1);
  // Strip common TLDs
  q = q.replace(/\.(cl|com|co|mx|es|net|org|ar|pe|br|ec|uy|py|bo|ve|us)(\.[a-z]{2})?$/i, '');
  // Replace dashes/underscores/dots with spaces
  q = q.replace(/[-_.]+/g, ' ');
  // Collapse multiple spaces
  q = q.replace(/\s+/g, ' ').trim();
  return q;
}

/**
 * Build Ad Library URL with a keyword search query. Apify scraper acepta esta
 * URL y devuelve los ads activos que matcheen. Usado cuando NO tenemos page_id
 * resuelto (ej. el cliente ingresó dominio o nombre crudo).
 */
function buildAdLibrarySearchUrl(query: string): string {
  const sanitized = sanitizeForSearch(query);
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=CL&is_targeted_country=false&media_type=all&search_type=keyword_unordered&q=${encodeURIComponent(sanitized)}`;
}

/**
 * Resolver dominio → Facebook Page URL haciendo fetch del sitio del competidor
 * y extrayendo links a facebook.com con regex. La mayoría de los e-commerce
 * tiene el link de FB en el footer o header.
 *
 * Filtra:
 *   - facebook.com/sharer / tr / plugins / dialog (botones de share, no la page)
 *   - facebook.com/profile.php?id=X (perfiles personales, no business pages)
 *
 * Acepta:
 *   - https://www.facebook.com/<slug>
 *   - https://facebook.com/<slug>
 *   - facebook.com/pages/<name>/<id>
 *
 * Returns null si no encuentra link o el sitio no responde.
 */
async function findFacebookFromWebsite(domain: string): Promise<string | null> {
  let url = domain.trim().toLowerCase();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SteveAdsBot/1.0; +https://steve.ads/bot)',
      },
    });
    if (!res.ok) {
      console.warn(`[findFacebookFromWebsite] ${url} → HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();

    // Buscar URLs de Facebook Page en el HTML. Prioriza www.facebook.com sobre
    // m.facebook.com. Excluye sharer, tr, plugins, dialog (mecánicas de share).
    const fbPatterns = [
      // facebook.com/<slug>?ref=... o /posts/...
      /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|tr\?|tr\.|plugins|dialog|profile\.php|share\.php|share\/p\/)([a-zA-Z0-9._-]+)/gi,
    ];

    const found = new Set<string>();
    for (const pattern of fbPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const slug = match[1];
        if (slug && slug.length >= 3 && slug.length <= 80) {
          found.add(`https://www.facebook.com/${slug}`);
        }
      }
    }

    if (found.size === 0) {
      console.log(`[findFacebookFromWebsite] ${url}: no FB link found`);
      return null;
    }

    // Devolver el primero (suele ser el del header/footer principal).
    // En sitios con múltiples FB links elegir el de mayor frecuencia sería
    // mejor pero el primero suele acertar.
    const fbUrl = Array.from(found)[0];
    console.log(`[findFacebookFromWebsite] ${url} → ${fbUrl}`);
    return fbUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[findFacebookFromWebsite] ${url} failed: ${msg}`);
    return null;
  }
}

/**
 * Detectar si un input parece dominio (manosdelalma.cl, https://shop.com,
 * www.brand.com.ar). Distinto de isFacebookUrl().
 */
function isDomainLike(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.startsWith('@')) return false;
  if (isFacebookUrl(trimmed)) return false;
  // Match TLD + optional country (.cl, .com, .com.ar, etc.)
  return /\b[a-z0-9-]+\.(cl|com|co|mx|es|net|org|ar|pe|br|ec|uy|py|bo|ve|us|io)(\.[a-z]{2})?(\/|$|\?)/i.test(trimmed);
}

/**
 * Classify input type: 'fb_url' | 'ig_handle' | 'name'
 */
function classifyInput(input: string): 'fb_url' | 'ig_handle' | 'name' {
  const trimmed = input.trim();
  if (isFacebookUrl(trimmed)) return 'fb_url';
  if (trimmed.startsWith('@')) return 'ig_handle';
  return 'name';
}

/**
 * Normalize input to a handle-like key for competitor_tracking upsert.
 * FB URLs → page slug, @handles → handle, names → lowercased name.
 */
function normalizeToHandle(input: string): string {
  const trimmed = input.trim();
  const type = classifyInput(trimmed);
  if (type === 'fb_url') {
    const slug = extractPageIdOrSlug(trimmed);
    return slug?.toLowerCase() || trimmed.toLowerCase();
  }
  if (type === 'ig_handle') {
    return trimmed.replace(/^@/, '').toLowerCase();
  }
  // Name: lowercase, collapse spaces
  return trimmed.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Fetch ads via apify~facebook-ads-scraper (official actor)
 * Uses async pattern: start run → poll status → fetch dataset items
 */
async function fetchAdsViaApify(
  fbPageUrl: string,
  maxAds: number = 50,
): Promise<{ ads: ApifyScraperAd[]; error?: string }> {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return { ads: [], error: 'APIFY_TOKEN not configured' };
  }

  const adLibraryUrl = buildAdLibraryUrl(fbPageUrl);
  console.log(`[sync-competitor-ads] Apify scraper URL: ${adLibraryUrl}`);

  try {
    // Step 1: Start the actor run (returns immediately)
    const startResp = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs?token=${encodeURIComponent(apifyToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: adLibraryUrl }],
          maxAds,
        }),
      },
    );

    if (!startResp.ok) {
      const text = await startResp.text();
      return { ads: [], error: `apify_start_error: ${startResp.status} — ${text.substring(0, 200)}` };
    }

    const startData: any = await startResp.json();
    const runId = startData?.data?.id;
    const datasetId = startData?.data?.defaultDatasetId;
    if (!runId || !datasetId) {
      return { ads: [], error: 'apify_error: No run ID returned' };
    }

    console.log(`[sync-competitor-ads] Apify run started: ${runId}, dataset: ${datasetId}`);

    // Step 2: Poll for completion (every 10s, max 5min)
    const maxWaitMs = 300_000;
    const pollIntervalMs = 10_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      const statusResp = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${encodeURIComponent(apifyToken)}`,
      );
      const statusData: any = await statusResp.json();
      const status = statusData?.data?.status;

      if (status === 'SUCCEEDED') {
        console.log(`[sync-competitor-ads] Apify run ${runId} completed in ${Math.round((Date.now() - startTime) / 1000)}s`);
        break;
      }
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return { ads: [], error: `apify_run_${status.toLowerCase()}: Run ${runId} finished with status ${status}` };
      }
      // READY, RUNNING — keep polling
      console.log(`[sync-competitor-ads] Apify run ${runId}: ${status} (${Math.round((Date.now() - startTime) / 1000)}s)`);
    }

    // Step 3: Fetch dataset items
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${encodeURIComponent(apifyToken)}&format=json&limit=${maxAds}`,
    );

    if (!itemsResp.ok) {
      const text = await itemsResp.text();
      return { ads: [], error: `apify_dataset_error: ${itemsResp.status} — ${text.substring(0, 200)}` };
    }

    const items = (await itemsResp.json()) as any[];
    // Filter valid items (exclude error items like {url, error, errorDescription})
    const validAds = (items || []).filter(
      (item: any) => !item.error && (item.adArchiveID || item.adArchiveId || item.pageId || item.pageID),
    ) as ApifyScraperAd[];

    console.log(`[sync-competitor-ads] Apify returned ${validAds.length} valid ads from ${items?.length || 0} items`);
    return { ads: validAds };
  } catch (err: any) {
    return { ads: [], error: `apify_error: ${err.message}` };
  }
}

/**
 * Map an Apify ad to the competitor_ads row format (with new metric columns)
 */
function mapApifyAdToRow(
  ad: ApifyScraperAd,
  trackingId: string,
  clientId: string,
): Record<string, any> {
  const archiveId = ad.adArchiveID || ad.adArchiveId || '';

  // Start/end dates — prefer formatted ISO strings, fallback to unix ms
  const startStr = ad.startDateFormatted || (ad.startDate ? new Date(ad.startDate).toISOString() : null);
  const endStr = ad.endDateFormatted || (ad.endDate ? new Date(ad.endDate).toISOString() : null);
  const startDate = startStr ? new Date(startStr) : null;
  const endDate = endStr ? new Date(endStr) : null;
  const isActive = ad.isActive !== undefined ? ad.isActive : (!endDate || endDate > new Date());
  const daysRunning = startDate
    ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Ad text — body can be { text: "..." } or { markup: { __html: "..." } }
  let adText = '';
  if (ad.snapshot?.body?.text) {
    adText = ad.snapshot.body.text.trim();
  } else if (ad.snapshot?.body?.markup?.__html) {
    adText = (ad.snapshot.body.markup.__html || '').replace(/<[^>]*>/g, '').trim();
  }
  if (!adText && ad.snapshot?.cards?.[0]?.body) {
    adText = ad.snapshot.cards[0].body;
  }
  // Truncate very long ad texts (some can be thousands of chars)
  if (adText.length > 1000) adText = adText.substring(0, 1000);

  // Headline — from snapshot title or first card title
  const adHeadline = ad.snapshot?.title || ad.snapshot?.cards?.[0]?.title || null;

  // Ad type — use displayFormat if available, fallback to heuristics
  let adType = 'image';
  const displayFmt = (ad.snapshot?.displayFormat || '').toUpperCase();
  if (displayFmt === 'VIDEO' || (ad.snapshot?.videos && ad.snapshot.videos.length > 0)) adType = 'video';
  if (displayFmt === 'DCO' || (ad.collationCount && ad.collationCount > 1)) adType = 'carousel';

  // CTA detection — prefer direct ctaType field, fallback to text matching
  const ctaMap: Record<string, string> = {
    'comprar': 'SHOP_NOW', 'shop': 'SHOP_NOW', 'buy': 'SHOP_NOW',
    'learn more': 'LEARN_MORE', 'más información': 'LEARN_MORE',
    'sign up': 'SIGN_UP', 'registrarse': 'SIGN_UP',
    'descargar': 'DOWNLOAD', 'download': 'DOWNLOAD',
  };
  const directCtaType = ad.snapshot?.ctaType || ad.snapshot?.cta_type || '';
  let ctaType = directCtaType || 'OTHER';
  if (ctaType === 'OTHER') {
    const ctaText = (ad.snapshot?.ctaText || ad.snapshot?.cta_text || ad.snapshot?.cards?.[0]?.ctaText || ad.snapshot?.cards?.[0]?.cta_text || '').toLowerCase();
    for (const [key, value] of Object.entries(ctaMap)) {
      if (ctaText.includes(key)) { ctaType = value; break; }
    }
  }

  // Impressions — impressionsWithIndex contains text like "1K-5K"
  // Parse the text or use raw data
  let impressionsLower: number | null = null;
  let impressionsUpper: number | null = null;
  if (ad.impressionsWithIndex) {
    const impText = ad.impressionsWithIndex.impressionsText || ad.impressionsWithIndex.impressions_text || '';
    // Try to parse "1K-5K", "10K-50K", "500-1K" etc
    const match = impText.match(/([0-9,.]+)\s*([KMB]?)\s*[-–]\s*([0-9,.]+)\s*([KMB]?)/i);
    if (match) {
      const mult = (s: string) => s.toUpperCase() === 'K' ? 1000 : s.toUpperCase() === 'M' ? 1000000 : s.toUpperCase() === 'B' ? 1000000000 : 1;
      impressionsLower = Math.round(parseFloat(match[1].replace(/,/g, '')) * mult(match[2]));
      impressionsUpper = Math.round(parseFloat(match[3].replace(/,/g, '')) * mult(match[4]));
    }
  }

  // Spend — lower_bound/upper_bound as strings
  const spendLower = ad.spend?.lower_bound ? parseFloat(ad.spend.lower_bound) : null;
  const spendUpper = ad.spend?.upper_bound ? parseFloat(ad.spend.upper_bound) : null;

  // Reach
  const reachLower = ad.reachEstimate?.lower_bound ?? null;
  const reachUpper = ad.reachEstimate?.upper_bound ?? null;

  // Platforms
  const platforms = ad.publisherPlatform && ad.publisherPlatform.length > 0 ? ad.publisherPlatform : null;

  // Images — from snapshot images, cards, and video previews (handle both camelCase and snake_case)
  const imageUrls: string[] = [];
  if (ad.snapshot?.images) {
    for (const img of ad.snapshot.images) {
      const url = img.resizedImageUrl || img.resized_image_url || img.originalImageUrl || img.original_image_url;
      if (url) imageUrls.push(url);
    }
  }
  if (ad.snapshot?.cards) {
    for (const card of ad.snapshot.cards) {
      const imgUrl = card.resizedImageUrl || card.resized_image_url || card.originalImageUrl || card.original_image_url;
      if (imgUrl) imageUrls.push(imgUrl);
      const vidUrl = card.videoPreviewImageUrl || card.video_preview_image_url;
      if (vidUrl) imageUrls.push(vidUrl);
    }
  }
  // Video preview images as fallback
  if (ad.snapshot?.videos) {
    for (const vid of ad.snapshot.videos) {
      const url = vid.videoPreviewImageUrl || vid.video_preview_image_url;
      if (url) imageUrls.push(url);
    }
  }
  // Dedupe
  const uniqueImages = [...new Set(imageUrls)];

  // Landing URL — from snapshot or first card
  const landingUrl = ad.snapshot?.linkUrl || ad.snapshot?.link_url
    || ad.snapshot?.cards?.[0]?.linkUrl || ad.snapshot?.cards?.[0]?.link_url
    || null;

  // Video URL — prefer HD, fallback SD
  let videoUrl: string | null = null;
  if (ad.snapshot?.videos && ad.snapshot.videos.length > 0) {
    const vid = ad.snapshot.videos[0];
    videoUrl = vid.videoHdUrl || vid.videoSdUrl || null;
  }

  return {
    tracking_id: trackingId,
    client_id: clientId,
    ad_library_id: archiveId,
    ad_text: adText || null,
    ad_headline: adHeadline,
    ad_description: null,
    image_url: uniqueImages[0] || null,
    ad_type: adType,
    cta_type: ctaType,
    started_at: startStr || null,
    is_active: isActive,
    days_running: daysRunning,
    // Apify metric columns
    impressions_lower: impressionsLower,
    impressions_upper: impressionsUpper,
    spend_lower: spendLower,
    spend_upper: spendUpper,
    reach_lower: reachLower,
    reach_upper: reachUpper,
    platforms: platforms,
    image_urls: uniqueImages.length > 0 ? uniqueImages : null,
    landing_url: landingUrl,
    video_url: videoUrl,
  };
}

export async function syncCompetitorAds(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Auth — user is set by authMiddleware
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Missing authorization' }, 401);
    }

    const body = await c.req.json();
    const { client_id, queries, ig_handles, fb_urls } = body;

    // Support new `queries[]` param, with backward-compat for old `ig_handles[]` + `fb_urls[]`
    let rawInputs: string[];
    if (Array.isArray(queries) && queries.length > 0) {
      rawInputs = queries.map((q: any) => String(q).trim()).filter(Boolean);
    } else if (Array.isArray(ig_handles) && ig_handles.length > 0) {
      // Legacy: reconstruct from ig_handles + fb_urls
      const legacyFbUrls: (string | null)[] = Array.isArray(fb_urls)
        ? fb_urls.map((u: any) => (typeof u === 'string' && u.trim() ? u.trim() : null))
        : [];
      rawInputs = ig_handles.map((h: string, i: number) => {
        const fb = legacyFbUrls[i];
        return fb || (h ? `@${h.trim().replace(/^@/, '')}` : '');
      }).filter(Boolean);
    } else {
      return c.json({ error: 'client_id and queries[] required' }, 400);
    }

    if (!client_id || rawInputs.length === 0) {
      return c.json({ error: 'client_id and queries[] required' }, 400);
    }

    // Verify ownership
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .maybeSingle();

    if (clientError || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    if (client.user_id !== user.id && client.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Limit to 5 inputs
    const inputs = rawInputs.slice(0, 5);

    console.log(`[sync-competitor-ads] Processing ${inputs.length} inputs for client ${client_id}`);

    // Get Meta access token — needed for fallback (ig_handle only) path
    const metaConn = await safeQuerySingleOrDefault<any>(
      supabase
        .from('platform_connections')
        .select('id, access_token_encrypted, connection_type')
        .eq('client_id', client_id)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
      null,
      'syncCompetitorAds.getMetaConn',
    );

    let accessToken = '';
    let tokenSource = '';

    if (metaConn) {
      const resolved = await getTokenForConnection(supabase, metaConn);
      if (resolved) {
        accessToken = resolved;
        tokenSource = metaConn.connection_type === 'bm_partner' ? 'bm_partner' : 'user_token';
      }
    }

    const warnings: string[] = [];

    if (!accessToken) {
      const metaAppId = process.env.META_APP_ID;
      const metaAppSecret = process.env.META_APP_SECRET;
      if (metaAppId && metaAppSecret) {
        try {
          const tokenRes = await fetch(
            'https://graph.facebook.com/oauth/access_token',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: metaAppId, client_secret: metaAppSecret,
                grant_type: 'client_credentials',
              }),
            }
          );
          const tokenData: any = await tokenRes.json();
          if (tokenData.access_token) {
            accessToken = tokenData.access_token;
            tokenSource = 'app_token';
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          console.error('[sync-competitor-ads] App token fetch failed:', e);
          warnings.push(`App token fetch failed: ${msg}`);
        }
      }
    }

    // Apify path doesn't need Meta token, but fallback does
    const hasApifyToken = !!process.env.APIFY_TOKEN;
    if (!accessToken && !hasApifyToken) {
      return c.json({
        error: 'meta_not_connected',
        message: 'Debes conectar tu cuenta de Meta Ads o configurar Apify para rastrear competidores.'
      }, 400);
    }

    console.log(`[sync-competitor-ads] Meta token: ${tokenSource || 'none'}, Apify: ${hasApifyToken ? 'yes' : 'no'}`);

    // Helper: resolve a search query to a Facebook page_id via Pages Search API
    async function resolvePageId(searchQuery: string): Promise<{ pageId: string; pageName: string } | null> {
      if (!accessToken) return null;
      try {
        const url = new URL('https://graph.facebook.com/v23.0/pages/search');
        url.searchParams.set('access_token', accessToken);
        url.searchParams.set('q', searchQuery);
        url.searchParams.set('fields', 'id,name,verification_status');
        const res = await fetch(url.toString());
        const json: any = await res.json();
        if (json.data && json.data.length > 0) {
          return { pageId: json.data[0].id, pageName: json.data[0].name };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error(`[sync-competitor-ads] Page search failed for "${searchQuery}":`, e);
        warnings.push(`Page search failed for "${searchQuery}": ${msg}`);
      }
      return null;
    }

    // Helper: fetch ads from Meta Ad Library API
    const AD_LIBRARY_FIELDS = 'id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,ad_snapshot_url,bylines,collation_count,languages';
    const AD_LIBRARY_COUNTRIES = '["CL","MX","CO","AR","PE","US"]';

    async function fetchAdLibrary(params: Record<string, string>): Promise<{ ads: AdLibraryAd[]; error?: string }> {
      const url = new URL('https://graph.facebook.com/v23.0/ads_archive');
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('ad_type', 'ALL');
      url.searchParams.set('ad_reached_countries', AD_LIBRARY_COUNTRIES);
      url.searchParams.set('ad_active_status', 'ALL');
      url.searchParams.set('fields', AD_LIBRARY_FIELDS);
      url.searchParams.set('limit', params.search_page_ids ? '50' : '25');
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

      const res = await fetch(url.toString());
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch {
        return { ads: [], error: 'Non-JSON response from Meta' };
      }
      if (!res.ok || json.error) {
        const code = json.error?.code || 0;
        const msg = json.error?.message || 'Unknown error';
        if (code === 190) return { ads: [], error: 'token_expired: El token de Meta expiró. Reconecta Meta Ads en Conexiones.' };
        if (code === 10 || code === 200) return { ads: [], error: 'permission_denied: La app necesita permisos de Ad Library.' };
        return { ads: [], error: `api_error: ${msg}` };
      }
      return { ads: json.data || [] };
    }

    const results: { handle: string; ads_found: number; status: string }[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const inputType = classifyInput(input);
      const handle = normalizeToHandle(input);

      // For FB URLs, extract the URL; for others, no fbUrl
      const fbUrl = inputType === 'fb_url' ? input.trim() : null;

      try {
        // Step 1: Upsert competitor tracking record
        const upsertData: Record<string, any> = {
          client_id,
          ig_handle: handle,
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        if (fbUrl) upsertData.fb_page_url = fbUrl;

        const { data: tracking, error: trackError } = await supabase
          .from('competitor_tracking')
          .upsert(upsertData, { onConflict: 'client_id,ig_handle' })
          .select('id, meta_page_id, last_sync_at, fb_page_url')
          .maybeSingle();

        if (trackError || !tracking) {
          console.error(`Error upserting tracking for ${handle}:`, trackError);
          results.push({ handle, ads_found: 0, status: 'error: ' + (trackError?.message || 'tracking upsert returned null') });
          continue;
        }

        const effectiveFbUrl = tracking.fb_page_url || fbUrl;

        // Build Apify source URL — TODO va por Apify ahora. Meta Ad Library
        // API directa fue removida (ya no devuelve datos sin business
        // verification). Apify scrapea la Ad Library pública sin esos límites.
        //
        // Estrategia escalonada (cae al siguiente si el anterior falla):
        // 1. FB URL directa del input → Apify
        // 2. FB URL cacheada en competitor_tracking → Apify
        // 3. Page ID cacheado en competitor_tracking → Apify con view_all_page_id
        // 4. Si input es dominio (foo.cl) → fetch del sitio + extraer FB link
        //    del HTML (footer/header) → Apify con esa URL real (PRECISO)
        // 5. Fallback: keyword search en Ad Library (puede dar falsos positivos)
        let apifySource: string | null = null;
        let resolutionMethod = '';

        if (effectiveFbUrl && (isFacebookUrl(effectiveFbUrl) || effectiveFbUrl.includes('ads/library'))) {
          apifySource = effectiveFbUrl;
          resolutionMethod = 'fb_url_direct';
        } else if (tracking.meta_page_id) {
          apifySource = buildAdLibraryUrlWithPageId(tracking.meta_page_id);
          resolutionMethod = 'cached_page_id';
          console.log(`[sync-competitor-ads] ${handle}: Using cached page_id ${tracking.meta_page_id}`);
        } else if (isDomainLike(input)) {
          // Resolver dominio → FB Page haciendo fetch del sitio del competidor
          console.log(`[sync-competitor-ads] ${handle}: Resolving domain "${input}" via website scrape...`);
          const fbFromWeb = await findFacebookFromWebsite(input);
          if (fbFromWeb) {
            apifySource = fbFromWeb;
            resolutionMethod = 'website_scrape';
            // Persistir el FB URL resuelto para syncs futuros (skip el fetch)
            await supabase.from('competitor_tracking').update({
              fb_page_url: fbFromWeb,
            }).eq('id', tracking.id);
          } else {
            // Sitio sin FB link visible o sitio caído → fallback keyword search
            apifySource = buildAdLibrarySearchUrl(input);
            resolutionMethod = 'keyword_search_fallback';
            console.log(`[sync-competitor-ads] ${handle}: No FB link in website, falling back to keyword search`);
          }
        } else {
          // @handle o nombre crudo → keyword search
          apifySource = buildAdLibrarySearchUrl(input);
          resolutionMethod = 'keyword_search';
          console.log(`[sync-competitor-ads] ${handle}: Using keyword search "${sanitizeForSearch(input)}"`);
        }

        // Check if we already have Apify metrics for this competitor
        const { count: apifyMetricCount } = await supabase
          .from('competitor_ads')
          .select('id', { count: 'exact', head: true })
          .eq('tracking_id', tracking.id)
          .not('impressions_lower', 'is', null);
        const hasApifyMetrics = (apifyMetricCount || 0) > 0;

        // Force fresh sync if: fb_page_url changed, OR we have Apify source but no metrics yet
        const fbUrlChanged = fbUrl && fbUrl !== tracking.fb_page_url;
        const forceFreshSync = !!fbUrlChanged || (!!apifySource && !hasApifyMetrics);

        // Check if synced recently (< 6h) — skip cache if force fresh
        if (tracking.last_sync_at && !forceFreshSync) {
          const lastSync = new Date(tracking.last_sync_at);
          const hoursSince = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 6) {
            console.log(`[sync-competitor-ads] ${handle} synced ${hoursSince.toFixed(1)}h ago, skipping`);
            const { count } = await supabase
              .from('competitor_ads')
              .select('id', { count: 'exact', head: true })
              .eq('tracking_id', tracking.id);
            results.push({ handle, ads_found: count || 0, status: 'cached' });
            continue;
          }
        }

        if (forceFreshSync) {
          console.log(`[sync-competitor-ads] ${handle}: Force fresh sync (apifySource=${apifySource ? 'yes' : 'no'}, hasApifyMetrics=${hasApifyMetrics})`);
        }

        // ==========================================
        // PRIMARY PATH: Apify (when we have a source URL)
        // ==========================================
        if (apifySource && hasApifyToken) {
          console.log(`[sync-competitor-ads] ${handle}: Using Apify with: ${apifySource}`);
          const apifyResult = await fetchAdsViaApify(apifySource, 50);

          if (apifyResult.error) {
            console.warn(`[sync-competitor-ads] ${handle}: Apify failed: ${apifyResult.error}`);
            results.push({ handle, ads_found: 0, status: apifyResult.error });
            continue;
          } else if (apifyResult.ads.length === 0) {
            // Apify corrió OK pero no encontró ads activos. Esto puede ser:
            // 1. La marca no está corriendo ads en Meta hoy (Ad Library solo
            //    muestra ads ACTIVOS en este momento).
            // 2. La búsqueda por keyword no matcheó ningún resultado.
            // 3. El page_id cacheado quedó obsoleto.
            console.log(`[sync-competitor-ads] ${handle}: Apify returned 0 ads (no active campaigns or query mismatch)`);
            await supabase.from('competitor_tracking').update({
              last_sync_at: new Date().toISOString(),
            }).eq('id', tracking.id);
            results.push({ handle, ads_found: 0, status: 'no_active_ads' });
            continue;
          } else if (apifyResult.ads.length > 0) {
            // Success — map and save Apify ads
            const adsToUpsert = apifyResult.ads.map(ad => mapApifyAdToRow(ad, tracking.id, client_id));

            // Persist images to Supabase Storage (max 3 per ad to limit storage)
            console.log(`[sync-competitor-ads] ${handle}: Persisting images for ${adsToUpsert.length} ads...`);
            for (const row of adsToUpsert) {
              if (row.image_urls && Array.isArray(row.image_urls)) {
                const urls = (row.image_urls as string[]).slice(0, 3);
                const results = await Promise.allSettled(
                  urls.map((url, idx) => persistImage(supabase, url, client_id, row.ad_library_id, idx))
                );
                const persisted = results.map((r, idx) => r.status === 'fulfilled' ? r.value : urls[idx]);
                row.image_urls = persisted;
                row.image_url = persisted[0] || row.image_url;
              }
            }

            // Log first mapped ad for debugging
            const firstAd = adsToUpsert[0];
            console.log(`[sync-competitor-ads] ${handle}: First mapped ad: text=${(firstAd?.ad_text || '').substring(0, 50)}, images=${(firstAd?.image_urls || []).length}, impressions=${firstAd?.impressions_lower}, type=${firstAd?.ad_type}`);

            // Clear old ads
            await supabase.from('competitor_ads').delete().eq('tracking_id', tracking.id);

            if (adsToUpsert.length > 0) {
              const { error: upsertError } = await supabase
                .from('competitor_ads')
                .upsert(adsToUpsert, { onConflict: 'tracking_id,ad_library_id', ignoreDuplicates: false });

              if (upsertError) {
                console.error(`Upsert error for ${handle}:`, upsertError);
                results.push({ handle, ads_found: 0, status: 'upsert_error: ' + upsertError.message });
              } else {
                results.push({ handle, ads_found: adsToUpsert.length, status: 'synced_apify' });
              }
            } else {
              results.push({ handle, ads_found: 0, status: 'synced_apify' });
            }

            // Update tracking
            const pageName = apifyResult.ads[0]?.pageName || apifyResult.ads[0]?.snapshot?.pageName;
            const pageId = apifyResult.ads[0]?.pageId || apifyResult.ads[0]?.pageID;
            await supabase.from('competitor_tracking').update({
              last_sync_at: new Date().toISOString(),
              ...(pageId ? { meta_page_id: pageId } : {}),
              ...(pageName ? { display_name: pageName } : {}),
            }).eq('id', tracking.id);

            continue;
          }
        } else {
          // No tenemos Apify token configurado — no hay forma de buscar ads.
          // Meta Ad Library API directa fue removida (no devuelve datos para
          // nuestra app sin business verification).
          results.push({ handle, ads_found: 0, status: 'apify_not_configured' });
          continue;
        }

      } catch (err: any) {
        console.error(`Error processing ${handle}:`, err);
        results.push({ handle, ads_found: 0, status: 'error: ' + err.message });
      }
    }

    console.log('[sync-competitor-ads] Complete:', results);
    return c.json({ success: true, results, ...(warnings.length > 0 && { warnings }) });

  } catch (error) {
    console.error('Sync error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
