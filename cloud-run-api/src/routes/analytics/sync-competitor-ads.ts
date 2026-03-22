import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

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
    impressions_text?: string;
    [key: string]: any; // may contain index-based entries
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
    body?: { markup?: { __html: string } };
    cta_text?: string;
    cta_type?: string;
    link_url?: string;
    cards?: Array<{
      body?: string;
      title?: string;
      link_url?: string;
      cta_text?: string;
      cta_type?: string;
      video_preview_image_url?: string;
      resized_image_url?: string;
    }>;
    images?: Array<{ resized_image_url?: string; original_image_url?: string }>;
    videos?: Array<{ video_preview_image_url?: string }>;
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

  // If it's a proper Facebook URL, extract the page slug/id
  if (isFacebookUrl(fbPageUrl)) {
    const slug = extractPageIdOrSlug(fbPageUrl);
    if (slug) {
      if (/^\d+$/.test(slug)) {
        return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=CL&view_all_page_id=${slug}`;
      }
      return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=CL&q=${encodeURIComponent(slug)}`;
    }
  }

  // Not a FB URL — treat the entire input as a search query for Ad Library
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=CL&q=${encodeURIComponent(fbPageUrl.trim())}`;
}

/**
 * Fetch ads via apify~facebook-ads-scraper (official actor)
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
    const resp = await fetch(
      `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}&format=json&timeout=300`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: adLibraryUrl }],
          maxAds,
        }),
        signal: AbortSignal.timeout(300_000), // 5 min timeout (Apify can take 2-4min)
      },
    );

    if (!resp.ok) {
      const text = await resp.text();
      return { ads: [], error: `apify_error: ${resp.status} — ${text.substring(0, 200)}` };
    }

    const items = (await resp.json()) as any[];
    // Filter valid items (exclude error items like {url, error, errorDescription})
    const validAds = (items || []).filter(
      (item: any) => !item.error && (item.adArchiveID || item.adArchiveId || item.pageId || item.pageID),
    ) as ApifyScraperAd[];

    console.log(`[sync-competitor-ads] Apify returned ${validAds.length} ads`);
    return { ads: validAds };
  } catch (err: any) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { ads: [], error: 'apify_timeout: Apify tardó más de 2 minutos' };
    }
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

  // Ad text — from snapshot body markup
  let adText = '';
  if (ad.snapshot?.body?.markup?.__html) {
    adText = ad.snapshot.body.markup.__html.replace(/<[^>]*>/g, '').trim();
  }
  if (!adText && ad.snapshot?.cards?.[0]?.body) {
    adText = ad.snapshot.cards[0].body;
  }

  // Headline — from first card title
  const adHeadline = ad.snapshot?.cards?.[0]?.title || null;

  // Ad type
  let adType = 'image';
  if (ad.snapshot?.videos && ad.snapshot.videos.length > 0) adType = 'video';
  if (ad.collationCount && ad.collationCount > 1) adType = 'carousel';

  // CTA detection
  const ctaMap: Record<string, string> = {
    'comprar': 'SHOP_NOW', 'shop': 'SHOP_NOW', 'buy': 'SHOP_NOW',
    'learn more': 'LEARN_MORE', 'más información': 'LEARN_MORE',
    'sign up': 'SIGN_UP', 'registrarse': 'SIGN_UP',
    'descargar': 'DOWNLOAD', 'download': 'DOWNLOAD',
  };
  let ctaType = 'OTHER';
  const ctaText = (ad.snapshot?.cta_text || ad.snapshot?.cards?.[0]?.cta_text || '').toLowerCase();
  for (const [key, value] of Object.entries(ctaMap)) {
    if (ctaText.includes(key)) { ctaType = value; break; }
  }

  // Impressions — impressionsWithIndex contains text like "1K-5K"
  // Parse the text or use raw data
  let impressionsLower: number | null = null;
  let impressionsUpper: number | null = null;
  if (ad.impressionsWithIndex) {
    const impText = ad.impressionsWithIndex.impressions_text || '';
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

  // Images — from snapshot cards and images
  const imageUrls: string[] = [];
  if (ad.snapshot?.images) {
    for (const img of ad.snapshot.images) {
      if (img.resized_image_url) imageUrls.push(img.resized_image_url);
      else if (img.original_image_url) imageUrls.push(img.original_image_url);
    }
  }
  if (ad.snapshot?.cards) {
    for (const card of ad.snapshot.cards) {
      if (card.resized_image_url) imageUrls.push(card.resized_image_url);
      if (card.video_preview_image_url) imageUrls.push(card.video_preview_image_url);
    }
  }
  // Dedupe
  const uniqueImages = [...new Set(imageUrls)];

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

    const { client_id, ig_handles, fb_urls } = await c.req.json();
    if (!client_id || !ig_handles || !Array.isArray(ig_handles) || ig_handles.length === 0) {
      return c.json({ error: 'client_id and ig_handles[] required' }, 400);
    }

    // fb_urls is an optional parallel array of Facebook page URLs
    const fbUrls: (string | null)[] = Array.isArray(fb_urls)
      ? fb_urls.map((u: any) => (typeof u === 'string' && u.trim() ? u.trim() : null))
      : [];

    // Verify ownership
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    if (client.user_id !== user.id && client.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Limit to 5 handles
    const handles = ig_handles.slice(0, 5).map((h: string) =>
      h.trim().replace(/^@/, '').toLowerCase()
    );

    console.log(`[sync-competitor-ads] Processing ${handles.length} handles for client ${client_id}`);

    // Get Meta access token — needed for fallback (ig_handle only) path
    const { data: metaConn } = await supabase
      .from('platform_connections')
      .select('access_token_encrypted')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let accessToken = '';
    let tokenSource = '';

    if (metaConn?.access_token_encrypted) {
      const { data: decrypted } = await supabase
        .rpc('decrypt_platform_token', { encrypted_token: metaConn.access_token_encrypted });
      if (decrypted) {
        accessToken = decrypted;
        tokenSource = 'user_token';
      }
    }

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
          console.error('[sync-competitor-ads] App token fetch failed:', e);
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

    const results: { handle: string; ads_found: number; status: string }[] = [];

    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i];
      const fbUrl = fbUrls[i] || null;

      try {
        // Step 1: Upsert competitor tracking record (include fb_page_url if provided)
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
          .single();

        if (trackError) {
          console.error(`Error upserting tracking for ${handle}:`, trackError);
          results.push({ handle, ads_found: 0, status: 'error: ' + trackError.message });
          continue;
        }

        const effectiveFbUrl = tracking.fb_page_url || fbUrl;

        // Bypass cache if fb_page_url was just added/changed (force Apify resync)
        const fbUrlChanged = fbUrl && fbUrl !== tracking.fb_page_url;
        const hasApifyMetrics = await (async () => {
          if (!effectiveFbUrl) return true; // no FB URL = no need to check Apify metrics
          const { count } = await supabase
            .from('competitor_ads')
            .select('id', { count: 'exact', head: true })
            .eq('tracking_id', tracking.id)
            .not('impressions_lower', 'is', null);
          return (count || 0) > 0;
        })();
        const forceFreshSync = !!fbUrlChanged || (!!effectiveFbUrl && !hasApifyMetrics);

        // Check if synced recently (< 6h) — skip cache if fb_page_url changed
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
          console.log(`[sync-competitor-ads] ${handle}: Force fresh sync (fb_page_url=${effectiveFbUrl}, changed=${fbUrlChanged}, hasApifyMetrics=${hasApifyMetrics})`);
        }

        // ==========================================
        // PRIMARY PATH: Apify (when fb_page_url exists)
        // ==========================================
        if (effectiveFbUrl && hasApifyToken) {
          console.log(`[sync-competitor-ads] ${handle}: Using Apify with FB URL: ${effectiveFbUrl}`);
          const apifyResult = await fetchAdsViaApify(effectiveFbUrl, 50);

          if (apifyResult.error) {
            console.warn(`[sync-competitor-ads] ${handle}: Apify failed: ${apifyResult.error}`);
            // Don't fail hard — fall through to Meta API fallback if token available
            if (!accessToken) {
              results.push({ handle, ads_found: 0, status: apifyResult.error });
              continue;
            }
            console.log(`[sync-competitor-ads] ${handle}: Falling back to Meta API`);
          } else if (apifyResult.ads.length > 0) {
            // Success — map and save Apify ads
            const adsToUpsert = apifyResult.ads.map(ad => mapApifyAdToRow(ad, tracking.id, client_id));

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
          // If Apify returned 0 ads, fall through to Meta API
        }

        // ==========================================
        // FALLBACK PATH: Meta Ad Library API (ig_handle only, or Apify failed)
        // ==========================================
        if (!accessToken) {
          results.push({ handle, ads_found: 0, status: 'no_meta_token' });
          continue;
        }

        console.log(`[sync-competitor-ads] ${handle}: Using Meta API fallback (${tokenSource})`);

        const AD_LIBRARY_FIELDS = 'id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_delivery_start_time,ad_delivery_stop_time,page_id,page_name,publisher_platforms,ad_snapshot_url,bylines,collation_count,languages';
        const AD_LIBRARY_COUNTRIES = '["CL","MX","CO","AR","PE","US"]';

        async function fetchAdLibrary(params: Record<string, string>): Promise<{ ads: AdLibraryAd[]; error?: string }> {
          const url = new URL('https://graph.facebook.com/v21.0/ads_archive');
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

        async function resolvePageId(searchQuery: string): Promise<{ pageId: string; pageName: string } | null> {
          try {
            const url = new URL('https://graph.facebook.com/v21.0/pages/search');
            url.searchParams.set('access_token', accessToken);
            url.searchParams.set('q', searchQuery);
            url.searchParams.set('fields', 'id,name,verification_status');
            const res = await fetch(url.toString());
            const json: any = await res.json();
            if (json.data && json.data.length > 0) {
              return { pageId: json.data[0].id, pageName: json.data[0].name };
            }
          } catch (e) {
            console.error(`[sync-competitor-ads] Page search failed for "${searchQuery}":`, e);
          }
          return null;
        }

        let ads: AdLibraryAd[] = [];
        let searchMethod = '';
        let resolvedPageId = tracking.meta_page_id || null;
        let resolvedPageName = '';
        let fatalTokenError = false;

        // Strategy 1: Use cached page_id
        if (resolvedPageId) {
          const result = await fetchAdLibrary({ search_page_ids: resolvedPageId });
          if (result.error) {
            if (result.error.startsWith('token_expired') || result.error.startsWith('permission_denied')) {
              results.push({ handle, ads_found: 0, status: result.error });
              fatalTokenError = true;
            } else {
              resolvedPageId = null;
            }
          } else {
            ads = result.ads;
            searchMethod = 'cached_page_id';
          }
        }

        // Strategy 2: Resolve handle -> page_id
        if (!fatalTokenError && ads.length === 0 && !resolvedPageId) {
          const variations = [...new Set([
            handle,
            handle.replace(/_/g, ' '),
            handle.replace(/([a-z])([A-Z])/g, '$1 $2'),
            handle.replace(/(\d+)/g, ' $1 ').trim(),
          ])];

          for (const variation of variations) {
            const page = await resolvePageId(variation);
            if (page) {
              resolvedPageId = page.pageId;
              resolvedPageName = page.pageName;
              const result = await fetchAdLibrary({ search_page_ids: page.pageId });
              if (result.error) {
                if (result.error.startsWith('token_expired') || result.error.startsWith('permission_denied')) {
                  results.push({ handle, ads_found: 0, status: result.error });
                  fatalTokenError = true;
                }
                break;
              }
              ads = result.ads;
              searchMethod = `resolved_page_id:${variation}`;
              break;
            }
          }
        }

        if (!fatalTokenError && ads.length === 0) {
          console.log(`[sync-competitor-ads] ${handle}: No ads found via Meta API`);
        }

        if (results.find(r => r.handle === handle)) continue;

        // Update tracking
        const updateData: Record<string, any> = { last_sync_at: new Date().toISOString() };
        if (ads.length > 0 && ads[0].page_id) {
          updateData.meta_page_id = ads[0].page_id;
          updateData.display_name = ads[0].page_name || handle;
        } else if (resolvedPageId && !tracking.meta_page_id) {
          updateData.meta_page_id = resolvedPageId;
          if (resolvedPageName) updateData.display_name = resolvedPageName;
        }
        await supabase.from('competitor_tracking').update(updateData).eq('id', tracking.id);

        // Clear old ads and insert fresh ones
        if (ads.length > 0) {
          await supabase.from('competitor_ads').delete().eq('tracking_id', tracking.id);
        }

        const adsToUpsert = ads.map((ad) => {
          const startDate = ad.ad_delivery_start_time ? new Date(ad.ad_delivery_start_time) : null;
          const endDate = ad.ad_delivery_stop_time ? new Date(ad.ad_delivery_stop_time) : null;
          const isActive = !endDate || endDate > new Date();
          const daysRunning = startDate
            ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          let adType = 'image';
          if (ad.collation_count && ad.collation_count > 1) adType = 'carousel';

          const ctaMap: Record<string, string> = {
            'comprar': 'SHOP_NOW', 'shop': 'SHOP_NOW',
            'learn more': 'LEARN_MORE', 'más información': 'LEARN_MORE',
            'sign up': 'SIGN_UP', 'registrarse': 'SIGN_UP',
            'descargar': 'DOWNLOAD', 'download': 'DOWNLOAD',
          };
          let ctaType = 'OTHER';
          const linkTitle = (ad.ad_creative_link_titles?.[0] || '').toLowerCase();
          for (const [key, value] of Object.entries(ctaMap)) {
            if (linkTitle.includes(key)) { ctaType = value; break; }
          }

          return {
            tracking_id: tracking.id,
            client_id,
            ad_library_id: ad.id,
            ad_text: ad.ad_creative_bodies?.[0] || null,
            ad_headline: ad.ad_creative_link_titles?.[0] || null,
            ad_description: ad.ad_creative_link_descriptions?.[0] || null,
            image_url: ad.ad_snapshot_url || null,
            ad_type: adType,
            cta_type: ctaType,
            started_at: ad.ad_delivery_start_time || null,
            is_active: isActive,
            days_running: daysRunning,
          };
        });

        if (adsToUpsert.length > 0) {
          const { error: upsertError } = await supabase
            .from('competitor_ads')
            .upsert(adsToUpsert, { onConflict: 'tracking_id,ad_library_id', ignoreDuplicates: false });

          if (upsertError) {
            results.push({ handle, ads_found: 0, status: 'upsert_error: ' + upsertError.message });
            continue;
          }
        }

        results.push({ handle, ads_found: adsToUpsert.length, status: 'synced_meta' });
      } catch (err: any) {
        console.error(`Error processing ${handle}:`, err);
        results.push({ handle, ads_found: 0, status: 'error: ' + err.message });
      }
    }

    console.log('[sync-competitor-ads] Complete:', results);
    return c.json({ success: true, results });

  } catch (error) {
    console.error('Sync error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
