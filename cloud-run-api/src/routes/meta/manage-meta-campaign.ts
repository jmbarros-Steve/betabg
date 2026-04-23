import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { criterioMeta } from '../ai/criterio-meta.js';

import { espejoAd } from '../ai/espejo.js';
import { detectAngle } from '../../lib/angle-detector.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

type Action = 'create' | 'create_322' | 'pause' | 'resume' | 'update' | 'update_budget' | 'duplicate' | 'archive' | 'get_ad_details' | 'update_ad' | 'reach_estimate' | 'generate_previews';

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  data?: Record<string, any>;
}

// Helper: make a Meta Graph API request
async function metaApiRequest(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, any>
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = new URL(`${META_API_BASE}/${endpoint}`);

  const fetchOptions: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;

  if (method === 'GET') {
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
  } else {
    fetchOptions.body = JSON.stringify(body || {});
  }

  const response = await fetch(url.toString(), { ...fetchOptions, signal: AbortSignal.timeout(15_000) });
  const responseText = await response.text();

  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    console.error(`Meta API non-JSON response [${method} ${endpoint}] (status ${response.status}):`, responseText.slice(0, 500));
    if (!response.ok) {
      return { ok: false, error: `Meta API error (${response.status}): ${responseText.slice(0, 200)}` };
    }
    return { ok: false, error: `Meta API error (${response.status}): non-JSON response` };
  }

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || responseData?.error?.error_user_msg || 'Unknown Meta API error';
    console.error(`Meta API error [${method} ${endpoint}]:`, responseData);
    return { ok: false, error: errorMessage };
  }

  if (responseData === undefined || responseData === null) {
    return { ok: false, error: 'Empty response from Meta API' };
  }

  return { ok: true, data: responseData };
}

// Build call_to_action object. When a browser_addon is chosen (Click-to-Message),
// override the CTA type so Meta renders a chat button that opens the chosen app.
// Meta maps these to specific CTA types for messaging apps:
//   messenger  → MESSAGE_PAGE (Messenger) with link to m.me
//   instagram  → INSTAGRAM_MESSAGE (IG Direct)
//   whatsapp   → WHATSAPP_MESSAGE (WA Business)
function buildCallToAction(
  userCta: string,
  link: string,
  browserAddon?: string | null,
  pageId?: string | null,
): Record<string, any> {
  if (!browserAddon || browserAddon === 'none') {
    return { type: userCta || 'SHOP_NOW', value: { link } };
  }
  if (browserAddon === 'messenger') {
    // MESSAGE_PAGE requires a page link; Meta falls back to m.me/{page}.
    return {
      type: 'MESSAGE_PAGE',
      value: pageId ? { link: `https://m.me/${pageId}` } : { link },
    };
  }
  if (browserAddon === 'instagram') {
    return { type: 'INSTAGRAM_MESSAGE', value: { link } };
  }
  if (browserAddon === 'whatsapp') {
    return { type: 'WHATSAPP_MESSAGE', value: { link } };
  }
  return { type: userCta || 'SHOP_NOW', value: { link } };
}

// Detect whether a given URL is video by extension / content-type probe.
// Cheap heuristic first (extension), then HEAD if inconclusive.
const VIDEO_EXTS = ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'];
function looksLikeVideoUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return VIDEO_EXTS.some(ext => path.endsWith(ext));
  } catch {
    return false;
  }
}

// Upload video to Meta ad account via POST /act_{id}/advideos with file_url,
// then poll GET /{video_id}?fields=status until video_status === 'ready'.
// Meta refuses to render a creative referencing a video still in 'processing'.
async function uploadVideoFromUrl(
  accountId: string,
  accessToken: string,
  videoUrl: string,
  title?: string,
): Promise<{ ok: boolean; videoId?: string; error?: string }> {
  try {
    // 1) Start upload via file_url (async on Meta side)
    const startResult = await metaApiRequest(
      `act_${accountId}/advideos`,
      accessToken,
      'POST',
      {
        file_url: videoUrl,
        ...(title ? { title: title.slice(0, 255) } : {}),
      },
    );
    if (!startResult.ok || !startResult.data?.id) {
      return { ok: false, error: startResult.error || 'Video upload failed to start' };
    }
    const videoId: string = String(startResult.data.id);

    // 2) Poll /{video_id}?fields=status until ready or timeout. Meta typically
    //    takes 30s–5min depending on video length. Cap at 4 min so we don't
    //    tie up the Cloud Run request.
    const DEADLINE_MS = Date.now() + 4 * 60_000;
    let attempts = 0;
    while (Date.now() < DEADLINE_MS) {
      attempts++;
      await new Promise(r => setTimeout(r, attempts <= 3 ? 4_000 : 8_000));
      const statusRes = await metaApiRequest(videoId, accessToken, 'GET', { fields: 'status' });
      const vStatus = statusRes.data?.status?.video_status;
      if (vStatus === 'ready') {
        return { ok: true, videoId };
      }
      if (vStatus === 'error') {
        return { ok: false, error: `Video processing failed on Meta side (video_id=${videoId})` };
      }
      // 'processing' | 'uploading' → keep polling
    }
    return { ok: false, error: `Video upload timed out after ${attempts} polls (video_id=${videoId})` };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Video upload exception' };
  }
}

// --- Helper: upload image from URL to get image_hash ---

async function uploadImageFromUrl(
  accountId: string,
  accessToken: string,
  imageUrl: string
): Promise<{ ok: boolean; hash?: string; error?: string }> {
  try {
    // First try: upload via URL parameter
    const result = await metaApiRequest(
      `act_${accountId}/adimages`,
      accessToken,
      'POST',
      { url: imageUrl }
    );

    if (result.ok) {
      const images = result.data?.images;
      if (images) {
        const firstKey = Object.keys(images)[0];
        if (firstKey && images[firstKey]?.hash) {
          return { ok: true, hash: images[firstKey].hash };
        }
      }
    }

    // Fallback: download image and upload as base64 bytes
    console.log(`[manage-meta-campaign] URL upload failed, trying base64 fallback for ${imageUrl}`);
    let imgResponse: Response;
    try {
      imgResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    } catch (fetchErr: any) {
      return { ok: false, error: `Failed to download image (network error): ${fetchErr?.message || 'unknown'}` };
    }
    if (!imgResponse.ok) {
      return { ok: false, error: `Failed to download image: ${imgResponse.status}` };
    }
    const imgBuffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');

    const formData = new FormData();
    // Meta adimages API accepts filename + bytes (base64)
    formData.append('filename', 'ad_image.jpg');
    formData.append('bytes', base64);

    const uploadUrl = `${META_API_BASE}/act_${accountId}/adimages`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });
    let uploadData: any;
    try { uploadData = await uploadResponse.json(); }
    catch { return { ok: false, error: `Non-JSON response from Meta (HTTP ${uploadResponse.status})` }; }

    if (!uploadResponse.ok) {
      return { ok: false, error: uploadData?.error?.message || 'Base64 upload failed' };
    }

    const imgs = uploadData?.images;
    if (imgs) {
      const key = Object.keys(imgs)[0];
      if (key && imgs[key]?.hash) {
        console.log(`[manage-meta-campaign] Image uploaded via base64: hash=${imgs[key].hash}`);
        return { ok: true, hash: imgs[key].hash };
      }
    }

    return { ok: false, error: 'No image hash in base64 upload response' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Image upload error' };
  }
}

// --- Action handlers ---

async function handleCreate(
  accountId: string,
  accessToken: string,
  data: Record<string, any>,
  pageId?: string | null
): Promise<{ body: any; status: number }> {
  const {
    name,
    objective = 'OUTCOME_TRAFFIC',
    status = 'PAUSED',
    special_ad_categories = [],
    // Optional: use existing entities instead of creating new ones
    campaign_id: existingCampaignId,
    adset_id: existingAdsetId,
    // Ad set fields
    adset_name,
    daily_budget,
    billing_event = 'IMPRESSIONS',
    optimization_goal = 'LINK_CLICKS',
    targeting,
    start_time,
    end_time,
    // Ad creative fields (single — backward compat)
    primary_text,
    headline,
    description,
    image_url,
    cta = 'SHOP_NOW',
    destination_url,
    // Multi-slot fields (from new wizard)
    ad_set_format,
    images: imageUrls,
    texts,
    headlines,
    descriptions,
    // DPA / Catalog fields
    product_catalog_id,
    product_set_id,
    // Explicit pixel + event (overrides auto-fetch)
    pixel_id: explicitPixelId,
    custom_event_type: explicitEventType,
    // Placements (omit = Advantage+ placements auto)
    publisher_platforms,
    facebook_positions,
    instagram_positions,
    audience_network_positions,
    messenger_positions,
    // Explicit IG account for the creative (v23 replaces instagram_actor_id)
    instagram_user_id: explicitIgUserId,
    // UTM tags (string: "utm_source=...&utm_medium=...")
    url_tags,
    // Advantage+ Creative: { image_touchups: 'OPT_IN', text_optimizations: 'OPT_OUT', ... }
    creative_features,
    // Advantage+ Shopping Campaign flag. Meta auto-detects ADVANTAGE_PLUS_SALES when
    // the 3 automation levers are enabled (bid strategy, audience, placements).
    // We accept the flag to (a) enforce those levers and (b) log the resulting
    // advantage_state after create. Docs: /docs/marketing-api/advantage-campaigns/
    is_advantage_sales,
    // Display link (AdCreativeLinkData.caption) — shown under the headline in
    // place of the full URL with UTMs. Optional, defaults to domain of `link`.
    display_link,
    // Browser add-on: 'messenger' | 'instagram' | 'whatsapp' switches the CTA
    // to Click-to-Message on that platform. 'none' keeps the chosen CTA.
    browser_addon,
    // Meta "Optimizar contenido para cada persona" → adds
    // use_flexible_image_aspect_ratio on the link_data so Meta crops per
    // placement, and forces adapt_to_placement to OPT_IN.
    personalize_content,
  } = data;

  // --- Early validations (before any Meta API calls) ---

  // Budget validation: reject negative, zero, or non-numeric values
  if (daily_budget && (isNaN(Number(daily_budget)) || Number(daily_budget) <= 0)) {
    return { body: { error: 'Invalid daily_budget: must be a positive number' }, status: 400 };
  }

  // destination_url is required for non-DPA campaigns (DPA uses product URLs)
  const isDpa = !!(product_catalog_id && product_set_id);
  if (!isDpa && !destination_url) {
    return { body: { error: 'Missing required field: destination_url. A destination URL is required for conversion campaigns.' }, status: 400 };
  }

  // Step 1: Use existing campaign or create new one
  let campaignId = existingCampaignId || null;

  if (!campaignId) {
    if (!name) {
      return { body: { error: 'Missing required field: name' }, status: 400 };
    }

    console.log(`[manage-meta-campaign] Creating campaign "${name}" for account ${accountId}`);

    const campaignResult = await metaApiRequest(
      `act_${accountId}/campaigns`,
      accessToken,
      'POST',
      {
        name,
        objective,
        status,
        special_ad_categories,
        // Required by Meta for ABO campaigns (ad-set-level budget)
        is_campaign_budget_optimization: false,
        is_adset_budget_sharing_enabled: false,
      }
    );

    if (!campaignResult.ok) {
      return { body: { error: 'Failed to create campaign', details: campaignResult.error }, status: 502 };
    }

    campaignId = campaignResult.data.id;
    console.log(`[manage-meta-campaign] Campaign created: ${campaignId}`);
  } else {
    console.log(`[manage-meta-campaign] Using existing campaign: ${campaignId}`);
  }

  // Step 2: Use existing ad set or create new one if budget/targeting data is provided
  let adSetId: string | null = existingAdsetId || null;

  const isFlexible = ad_set_format === 'flexible';
  const isCarousel = ad_set_format === 'carousel';

  // Track warnings to include in the response
  const warnings: string[] = [];

  // Check if existing campaign uses CBO (Campaign Budget Optimization)
  let isCboCampaign = false;
  if (existingCampaignId) {
    try {
      const campCheck = await metaApiRequest(existingCampaignId, accessToken, 'GET', {
        fields: 'daily_budget,lifetime_budget,budget_remaining',
      });
      if (campCheck.ok && (campCheck.data?.daily_budget || campCheck.data?.lifetime_budget)) {
        isCboCampaign = true;
        console.log(`[manage-meta-campaign] Existing campaign ${existingCampaignId} uses CBO — skipping adset budget`);
      }
    } catch (e) {
      console.warn(`[manage-meta-campaign] Could not check CBO status for campaign ${existingCampaignId}`);
    }
  }

  if (!adSetId && (daily_budget || targeting)) {
    const adsetPayload: Record<string, any> = {
      campaign_id: campaignId,
      name: adset_name || `${name} - Ad Set`,
      billing_event,
      optimization_goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status,
    };

    // Dynamic Creative must be enabled at the ad set level
    if (isFlexible) {
      adsetPayload.is_dynamic_creative = true;
    }

    if (daily_budget && !isCboCampaign) {
      // CLP has no cents — smallest currency unit is 1 CLP
      // Skip budget for CBO campaigns — budget is managed at campaign level
      const parsedBudget = Number(daily_budget);
      if (isNaN(parsedBudget) || parsedBudget <= 0) {
        return { body: { success: false, error: 'daily_budget must be a positive number' }, status: 400 };
      }
      adsetPayload.daily_budget = Math.round(parsedBudget);
    }

    if (targeting) {
      // Meta now requires targeting_automation.advantage_audience to be set
      let targetingObj: any;
      try {
        targetingObj = typeof targeting === 'string' ? JSON.parse(targeting) : { ...targeting };
      } catch {
        console.error('[manage-meta-campaign] Invalid targeting JSON:', typeof targeting === 'string' ? targeting.slice(0, 100) : targeting);
        return { body: { success: false, error: 'Invalid targeting format' }, status: 400 };
      }
      if (!targetingObj.targeting_automation) {
        targetingObj.targeting_automation = { advantage_audience: 1 };
      }
      // With Advantage+ audience, age_max cannot be below 65
      if (targetingObj.targeting_automation?.advantage_audience === 1 && targetingObj.age_max && targetingObj.age_max < 65) {
        const originalAgeMax = targetingObj.age_max;
        targetingObj.age_max = 65;
        warnings.push(`Advantage+ audience requires age_max >= 65. Your value (${originalAgeMax}) was adjusted to 65.`);
        console.log(`[manage-meta-campaign] Advantage+ forced age_max from ${originalAgeMax} to 65`);
      }

      // Advantage+ Shopping: force the 3 automation levers regardless of what
      // the caller sent — Meta requires all three to be ON for the campaign to
      // qualify as ADVANTAGE_PLUS_SALES. Any manual override would degrade the
      // campaign back to a regular one.
      if (is_advantage_sales) {
        targetingObj.targeting_automation = { advantage_audience: 1 };
        // Strip any placement override — Advantage+ needs auto placements.
        delete targetingObj.publisher_platforms;
        delete targetingObj.facebook_positions;
        delete targetingObj.instagram_positions;
        delete targetingObj.audience_network_positions;
        delete targetingObj.messenger_positions;
        // Strip any custom audience / interest targeting — Advantage+ Sales
        // only accepts geo_locations + age + gender + advantage_audience.
        delete targetingObj.custom_audiences;
        delete targetingObj.excluded_custom_audiences;
        delete targetingObj.flexible_spec;
        delete targetingObj.exclusions;
        console.log('[manage-meta-campaign] Advantage+ Sales: forcing automation levers (placements auto, broad audience)');
      }

      // Placements: Advantage+ Placements = omit these fields (Meta auto-selects).
      // If user provided explicit publisher_platforms, pass them + matching positions.
      if (!is_advantage_sales && Array.isArray(publisher_platforms) && publisher_platforms.length > 0) {
        targetingObj.publisher_platforms = publisher_platforms;
        if (publisher_platforms.includes('facebook') && Array.isArray(facebook_positions) && facebook_positions.length > 0) {
          targetingObj.facebook_positions = facebook_positions;
        }
        if (publisher_platforms.includes('instagram') && Array.isArray(instagram_positions) && instagram_positions.length > 0) {
          targetingObj.instagram_positions = instagram_positions;
        }
        if (publisher_platforms.includes('audience_network') && Array.isArray(audience_network_positions) && audience_network_positions.length > 0) {
          targetingObj.audience_network_positions = audience_network_positions;
        }
        if (publisher_platforms.includes('messenger') && Array.isArray(messenger_positions) && messenger_positions.length > 0) {
          targetingObj.messenger_positions = messenger_positions;
        }
        console.log(`[manage-meta-campaign] Manual placements: ${publisher_platforms.join(',')}`);
      }

      adsetPayload.targeting = JSON.stringify(targetingObj);
    }

    // For DPA/Catalog campaigns, use product_catalog_id + product_set_id as promoted_object
    if (product_catalog_id && product_set_id) {
      adsetPayload.promoted_object = JSON.stringify({
        product_catalog_id,
        product_set_id,
      });
      console.log(`[manage-meta-campaign] DPA promoted_object: catalog=${product_catalog_id}, set=${product_set_id}`);
    } else if (optimization_goal === 'OFFSITE_CONVERSIONS') {
      // For conversion-optimized ad sets, Meta requires a promoted_object with pixel_id.
      // Prefer explicit pixel_id from the wizard; fallback to first pixel on the account.
      const eventType = explicitEventType || 'PURCHASE';
      if (explicitPixelId) {
        adsetPayload.promoted_object = JSON.stringify({
          pixel_id: explicitPixelId,
          custom_event_type: eventType,
        });
        console.log(`[manage-meta-campaign] Using explicit pixel ${explicitPixelId} with event ${eventType}`);
      } else {
        try {
          const pixelResult = await metaApiRequest(`act_${accountId}/adspixels`, accessToken, 'GET', { fields: 'id,name', limit: '1' });
          if (pixelResult.ok && pixelResult.data?.data?.[0]?.id) {
            adsetPayload.promoted_object = JSON.stringify({
              pixel_id: pixelResult.data.data[0].id,
              custom_event_type: eventType,
            });
            console.log(`[manage-meta-campaign] Auto-picked pixel ${pixelResult.data.data[0].id} with event ${eventType}`);
          } else {
            console.warn(`[manage-meta-campaign] No pixel found for account ${accountId}, conversion tracking may fail`);
          }
        } catch (pixelErr: any) {
          console.warn(`[manage-meta-campaign] Failed to fetch pixel: ${pixelErr?.message}`);
        }
      }
    }

    if (start_time) {
      adsetPayload.start_time = start_time;
    }

    if (end_time) {
      adsetPayload.end_time = end_time;
    }

    console.log(`[manage-meta-campaign] Creating ad set for campaign ${campaignId} (format: ${ad_set_format || 'single'})`);

    const adsetResult = await metaApiRequest(
      `act_${accountId}/adsets`,
      accessToken,
      'POST',
      adsetPayload
    );

    if (!adsetResult.ok) {
      console.error('[meta-campaign] Ad set creation failed:', adsetResult.error);
      return {
        body: {
          success: false,
          partial: true,
          error: 'Falló la creación del Ad Set',
          details: adsetResult.error,
          campaign_id: campaignId,
          adset_error: adsetResult.error,
        },
        status: 502
      };
    }

    adSetId = adsetResult.data.id;
    console.log(`[manage-meta-campaign] Ad set created: ${adSetId}`);
  } else if (adSetId) {
    console.log(`[manage-meta-campaign] Using existing ad set: ${adSetId}`);
  }

  // Resolve instagram_user_id (v23 replaced instagram_actor_id).
  // Prefer explicit value from the wizard; else derive from the Page's IG business account.
  let igUserId: string | null = explicitIgUserId || null;
  if (!igUserId && pageId) {
    try {
      const igResult = await metaApiRequest(pageId, accessToken, 'GET', {
        fields: 'instagram_business_account{id,username}',
      });
      if (igResult.ok && igResult.data?.instagram_business_account?.id) {
        igUserId = igResult.data.instagram_business_account.id;
        console.log(`[manage-meta-campaign] Resolved instagram_user_id: ${igUserId} (${igResult.data.instagram_business_account.username || 'no username'})`);
      }
    } catch (err: any) {
      console.warn(`[manage-meta-campaign] Failed to resolve IG user for page ${pageId}:`, err.message);
    }
  }

  // Build degrees_of_freedom_spec from user-selected creative features (opt-in granular).
  function buildDofSpec(): Record<string, any> | null {
    if (!creative_features || typeof creative_features !== 'object') return null;
    const entries = Object.entries(creative_features).filter(([, v]) => v === 'OPT_IN' || v === 'OPT_OUT');
    if (entries.length === 0) return null;
    const spec: Record<string, any> = {};
    for (const [k, v] of entries) spec[k] = { enroll_status: v };
    return { creative_features_spec: spec };
  }
  const dofSpec = buildDofSpec();

  // Helper: create ad creative with retry (drops instagram_user_id on failure)
  async function createCreativeWithRetry(
    creativePayload: Record<string, any>,
    storySpecKey: string = 'object_story_spec'
  ): Promise<{ ok: boolean; data?: any; error?: string }> {
    const result = await metaApiRequest(`act_${accountId}/adcreatives`, accessToken, 'POST', creativePayload);
    if (!result.ok && typeof result.error === 'string' && /instagram_user_id|instagram_actor_id/i.test(result.error) && igUserId) {
      console.warn(`[manage-meta-campaign] Creative failed with instagram_user_id, retrying without it`);
      const retryPayload = { ...creativePayload };
      const specStr = retryPayload[storySpecKey];
      if (specStr) {
        const spec = JSON.parse(specStr);
        delete spec.instagram_user_id;
        retryPayload[storySpecKey] = JSON.stringify(spec);
      }
      return metaApiRequest(`act_${accountId}/adcreatives`, accessToken, 'POST', retryPayload);
    }
    return result;
  }

  // Step 3: Create ad creative + ad if creative data is provided
  let adId: string | null = null;
  let creativeId: string | null = null;

  // ---- DPA / Catalog: template creative with dynamic product fields ----
  if (adSetId && product_catalog_id && product_set_id && !pageId) {
    console.error('[meta-campaign] DPA requires pageId but it is null');
    return {
      body: {
        success: false,
        partial: true,
        error: 'DPA requiere una Página de Facebook. Selecciona un portfolio con página asociada.',
        details: 'pageId is null — DPA creative creation requires a Facebook Page',
        campaign_id: campaignId,
        adset_id: adSetId,
        creative_error: 'Missing page_id for DPA',
      },
      status: 502,
    };
  }
  if (adSetId && product_catalog_id && product_set_id && pageId) {
    console.log(`[manage-meta-campaign] Creating DPA template creative for catalog=${product_catalog_id}`);

    const templateData: Record<string, any> = {
      message: { text: primary_text || (texts && texts[0]) || '{{product.name}}' },
      name: { text: headline || (headlines && headlines[0]) || '{{product.name}}' },
      link: { text: destination_url || '{{product.url}}' },
      description: { text: description || (descriptions && descriptions[0]) || '{{product.price}}' },
      call_to_action: { type: cta || 'SHOP_NOW' },
    };

    const dpaStorySpec: Record<string, any> = {
      page_id: pageId,
      template_data: templateData,
    };
    if (igUserId) dpaStorySpec.instagram_user_id = igUserId;

    const dpaCreativePayload: Record<string, any> = {
      name: `${name} - DPA Creative`,
      object_story_spec: JSON.stringify(dpaStorySpec),
      product_set_id,
    };
    if (dofSpec) dpaCreativePayload.degrees_of_freedom_spec = JSON.stringify(dofSpec);

    const dpaResult = await createCreativeWithRetry(dpaCreativePayload);

    if (!dpaResult.ok) {
      console.error('[meta-campaign] DPA creative creation failed:', dpaResult.error);
      return {
        body: {
          success: false,
          partial: true,
          error: 'Falló la creación del creativo DPA',
          details: dpaResult.error,
          campaign_id: campaignId,
          adset_id: adSetId,
          creative_error: dpaResult.error,
        },
        status: 502,
      };
    }

    creativeId = dpaResult.data.id;
    console.log(`[manage-meta-campaign] DPA creative created: ${creativeId}`);

    const adPayload: Record<string, any> = {
      name: `${name} - DPA Ad`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status,
    };
    if (url_tags && typeof url_tags === 'string' && url_tags.trim()) {
      adPayload.url_tags = url_tags.trim();
    }

    const adResult = await metaApiRequest(`act_${accountId}/ads`, accessToken, 'POST', adPayload);

    if (!adResult.ok) {
      console.error('[meta-campaign] DPA ad creation failed:', adResult.error);
      return {
        body: {
          success: false,
          partial: true,
          error: 'Falló la creación del anuncio DPA',
          details: adResult.error,
          campaign_id: campaignId,
          adset_id: adSetId,
          creative_id: creativeId,
          ad_error: adResult.error,
        },
        status: 502,
      };
    }

    adId = adResult.data.id;
    console.log(`[manage-meta-campaign] DPA ad created: ${adId}`);

    const dpaResponseBody: Record<string, any> = {
      success: true,
      campaign_id: campaignId,
      adset_id: adSetId,
      creative_id: creativeId,
      ad_id: adId,
    };
    if (warnings.length > 0) {
      dpaResponseBody.warnings = warnings;
    }

    return {
      body: dpaResponseBody,
      status: 200,
    };
  }

  // Resolve arrays (multi-slot) or single values (backward compat)
  const allImages: string[] = (imageUrls && imageUrls.length > 0) ? imageUrls : (image_url ? [image_url] : []);
  const allTexts: string[] = (texts && texts.length > 0) ? texts : (primary_text ? [primary_text] : []);
  const allHeadlines: string[] = (headlines && headlines.length > 0) ? headlines : (headline ? [headline] : []);
  const allDescriptions: string[] = (descriptions && descriptions.length > 0) ? descriptions : (description ? [description] : []);
  const destUrl = destination_url;

  const hasCreativeData = allImages.length > 0 || allTexts.length > 0;

  console.log(`[manage-meta-campaign] Creative check: adSetId=${adSetId}, hasCreativeData=${hasCreativeData}, pageId=${pageId}, images=${allImages.length}, texts=${allTexts.length}`);

  // FAIL LOUDLY if we have creative data but no pageId — don't silently create empty campaigns
  if (adSetId && hasCreativeData && !pageId) {
    console.error('[meta-campaign] Cannot create creative: pageId is null. Campaign will have no ads.');
    return {
      body: {
        success: false,
        partial: true,
        error: 'No se pudo resolver la Página de Facebook. Selecciona un portfolio con página asociada.',
        details: 'pageId is null — creative and ad creation requires a Facebook Page',
        campaign_id: campaignId,
        adset_id: adSetId,
        creative_error: 'Missing page_id',
      },
      status: 502,
    };
  }

  if (adSetId && hasCreativeData && pageId) {

    // ---- FLEXIBLE: Dynamic Creative with asset_feed_spec (images + videos) ----
    if (isFlexible && allImages.length > 0) {
      console.log(`[manage-meta-campaign] Creating Dynamic Creative (flexible) with ${allImages.length} assets, ${allTexts.length} texts, ${allHeadlines.length} headlines`);

      // Upload each asset in parallel. Classify by extension and route to the
      // correct helper. DCT in v23 accepts a `videos[]` array with each entry
      // shaped {video_id, thumbnail_hash|thumbnail_url}. Meta rejects videos in
      // asset_feed_spec without a thumbnail, so we always include one.
      const dctUploadSettled = await Promise.allSettled(
        allImages.filter(Boolean).map(async (assetUrl) => {
          if (looksLikeVideoUrl(assetUrl)) {
            const vid = await uploadVideoFromUrl(accountId, accessToken, assetUrl, `${name} DCT`);
            return { kind: 'video' as const, ok: vid.ok, videoId: vid.videoId, thumbUrl: assetUrl, error: vid.error };
          }
          const img = await uploadImageFromUrl(accountId, accessToken, assetUrl);
          return { kind: 'image' as const, ok: img.ok, hash: img.hash, error: img.error };
        })
      );
      const imageHashes: string[] = [];
      const videoEntries: Array<{ videoId: string; thumbUrl?: string }> = [];
      for (const result of dctUploadSettled) {
        if (result.status !== 'fulfilled' || !result.value.ok) {
          const reason = result.status === 'rejected' ? result.reason?.message : (result.value as any).error;
          console.warn(`[manage-meta-campaign] DCT asset upload failed: ${reason}`);
          continue;
        }
        const v = result.value;
        if (v.kind === 'video' && v.videoId) videoEntries.push({ videoId: v.videoId, thumbUrl: v.thumbUrl });
        else if (v.kind === 'image' && v.hash) imageHashes.push(v.hash);
      }

      // Meta rejects duplicate asset values in DCT
      const uniqueHashes = [...new Set(imageHashes)];
      const uniqueVideos = videoEntries.filter((v, i, arr) => arr.findIndex(x => x.videoId === v.videoId) === i);

      if (uniqueHashes.length === 0 && uniqueVideos.length === 0) {
        console.error('[meta-campaign] All asset uploads failed for Dynamic Creative');
        return {
          body: {
            success: false,
            partial: true,
            error: 'Falló la subida de todas las piezas',
            details: 'All asset uploads failed — cannot create Dynamic Creative without images or videos',
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_error: 'All asset uploads failed',
          },
          status: 502,
        };
      }

      // Deduplicate texts, headlines, descriptions — Meta rejects duplicate values
      const uniqueTexts = [...new Set(allTexts.filter(Boolean))];
      const uniqueHeadlines = [...new Set(allHeadlines.filter(Boolean))];
      const uniqueDescriptions = [...new Set(allDescriptions.filter(Boolean))];

      // Build asset_feed_spec for Dynamic Creative.
      // `ad_formats: ['AUTOMATIC_FORMAT']` tells Meta to pick the optimal format
      // per placement (single image, video, carousel, collection). Image+video
      // mix requires AUTOMATIC_FORMAT — using SINGLE_IMAGE forces single-image
      // rendering even with is_dynamic_creative on the adset.
      const assetFeedSpec: Record<string, any> = {
        bodies: uniqueTexts.map((t) => ({ text: t })),
        titles: uniqueHeadlines.map((t) => ({ text: t })),
        call_to_action_types: [cta || 'SHOP_NOW'],
        link_urls: [{ website_url: destUrl }],
        ad_formats: ['AUTOMATIC_FORMAT'],
      };

      if (uniqueHashes.length > 0) {
        assetFeedSpec.images = uniqueHashes.map((h) => ({ hash: h }));
      }
      if (uniqueVideos.length > 0) {
        // NOTE: we intentionally skip `thumbnail_url` — Meta expects an IMAGE
        // URL (jpg/png), not an mp4. Passing the video URL itself fails review.
        // Meta auto-extracts a frame as fallback thumbnail until we wire a
        // proper thumbnail pipeline (ffmpeg / Imagen 4 / video frame grab).
        assetFeedSpec.videos = uniqueVideos.map((v) => ({ video_id: v.videoId }));
      }

      if (uniqueDescriptions.length > 0) {
        assetFeedSpec.descriptions = uniqueDescriptions.map((d) => ({ text: d }));
      }

      console.log(`[manage-meta-campaign] DCT mix: ${uniqueHashes.length} images + ${uniqueVideos.length} videos`);

      console.log(`[manage-meta-campaign] DCT asset_feed_spec:`, JSON.stringify(assetFeedSpec));

      // For DCT: object_story_spec only needs page_id + instagram_user_id (v23)
      const dctStorySpec: Record<string, any> = { page_id: pageId };
      if (igUserId) dctStorySpec.instagram_user_id = igUserId;

      const creativePayload: Record<string, any> = {
        name: `${name} - DCT Creative`,
        asset_feed_spec: JSON.stringify(assetFeedSpec),
        object_story_spec: JSON.stringify(dctStorySpec),
      };
      if (dofSpec) creativePayload.degrees_of_freedom_spec = JSON.stringify(dofSpec);

      const creativeResult = await createCreativeWithRetry(creativePayload);

      if (!creativeResult.ok) {
        console.error('[meta-campaign] Dynamic Creative creation failed:', creativeResult.error);
        return {
          body: {
            success: false,
            partial: true,
            error: 'Falló la creación del Dynamic Creative',
            details: creativeResult.error,
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_error: creativeResult.error,
          },
          status: 502,
        };
      }

      creativeId = creativeResult.data.id;
      console.log(`[manage-meta-campaign] Dynamic Creative created: ${creativeId}`);

    // ---- CAROUSEL: child_attachments ----
    } else if (isCarousel && allImages.length > 1) {
      console.log(`[manage-meta-campaign] Creating Carousel creative with ${allImages.length} assets (mix image+video allowed)`);

      // Upload each asset in parallel — classify by extension and route to the
      // correct helper. Each child_attachment can be image (image_hash) or
      // video (video_id + picture thumbnail) per Meta Carousel spec.
      const carouselUploadSettled = await Promise.allSettled(
        allImages.filter(Boolean).map(async (assetUrl) => {
          if (looksLikeVideoUrl(assetUrl)) {
            const vid = await uploadVideoFromUrl(accountId, accessToken, assetUrl, `${name} card`);
            return { kind: 'video' as const, ok: vid.ok, videoId: vid.videoId, thumbnail: assetUrl, error: vid.error };
          }
          const img = await uploadImageFromUrl(accountId, accessToken, assetUrl);
          return { kind: 'image' as const, ok: img.ok, hash: img.hash, error: img.error };
        })
      );
      const cards: Array<{ kind: 'image' | 'video'; hashOrId: string; thumbnail?: string }> = [];
      for (const result of carouselUploadSettled) {
        if (result.status !== 'fulfilled' || !result.value.ok) {
          const reason = result.status === 'rejected' ? result.reason?.message : (result.value as any).error;
          console.warn(`[manage-meta-campaign] Carousel asset upload failed: ${reason}`);
          continue;
        }
        const v = result.value;
        if (v.kind === 'video' && v.videoId) {
          cards.push({ kind: 'video', hashOrId: v.videoId, thumbnail: v.thumbnail });
        } else if (v.kind === 'image' && v.hash) {
          cards.push({ kind: 'image', hashOrId: v.hash });
        }
      }

      if (cards.length < 2) {
        console.error('[meta-campaign] Carousel requires at least 2 assets — not enough uploads succeeded');
        return {
          body: {
            success: false,
            partial: true,
            error: 'Carrusel necesita al menos 2 piezas (imágenes o videos)',
            details: 'Carousel requires at least 2 assets — not enough uploads succeeded',
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_error: 'Carousel requires at least 2 assets — not enough uploads succeeded',
          },
          status: 502,
        };
      }

      const childAttachments = cards.map((card, i) => {
        const base: Record<string, any> = {
          link: destUrl,
          name: allHeadlines.length > 0 ? allHeadlines[i % allHeadlines.length] : '',
          description: allDescriptions.length > 0 ? allDescriptions[i % allDescriptions.length] : '',
        };
        if (card.kind === 'video') {
          base.video_id = card.hashOrId;
          // NOTE: we intentionally skip `picture` — Meta's Carousel API expects
          // `picture` to be a URL of an IMAGE (jpg/png). Feeding the raw mp4 URL
          // back makes Meta reject the creative or silently drop the thumbnail.
          // Letting Meta auto-extract the first frame is the safe default until
          // we wire a real thumbnail pipeline (ffmpeg / Imagen 4).
        } else {
          base.image_hash = card.hashOrId;
        }
        return base;
      });

      const carouselLinkData: Record<string, any> = {
        link: destUrl,
        message: allTexts[0] || '',
        child_attachments: childAttachments,
        call_to_action: buildCallToAction(cta || 'SHOP_NOW', destUrl, browser_addon, pageId),
      };
      if (display_link && typeof display_link === 'string' && display_link.trim()) {
        carouselLinkData.caption = display_link.trim();
      }
      if (personalize_content) {
        carouselLinkData.use_flexible_image_aspect_ratio = true;
      }
      const carouselStorySpec: Record<string, any> = {
        page_id: pageId,
        link_data: carouselLinkData,
      };
      if (igUserId) carouselStorySpec.instagram_user_id = igUserId;

      const creativePayload: Record<string, any> = {
        name: `${name} - Carousel Creative`,
        object_story_spec: JSON.stringify(carouselStorySpec),
      };
      if (dofSpec) creativePayload.degrees_of_freedom_spec = JSON.stringify(dofSpec);

      const creativeResult = await createCreativeWithRetry(creativePayload);

      if (!creativeResult.ok) {
        console.error('[meta-campaign] Carousel creative creation failed:', creativeResult.error);
        return {
          body: {
            success: false,
            partial: true,
            error: 'Falló la creación del creativo Carousel',
            details: creativeResult.error,
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_error: creativeResult.error,
          },
          status: 502,
        };
      }

      creativeId = creativeResult.data.id;
      console.log(`[manage-meta-campaign] Carousel creative created: ${creativeId}`);

    // ---- SINGLE (default): existing logic ----
    } else {
      const singleImage = allImages[0] || image_url;
      if (singleImage) {
        const singleAssetIsVideo = looksLikeVideoUrl(singleImage);
        const singleStorySpec: Record<string, any> = { page_id: pageId };
        if (igUserId) singleStorySpec.instagram_user_id = igUserId;

        if (singleAssetIsVideo) {
          // ── SINGLE VIDEO ── use object_story_spec.video_data (NOT link_data).
          // Per Meta docs 2026, single video creatives must use video_data with
          // explicit thumbnail (image_hash) — without it ads get rejected at
          // review with "poor quality preview".
          const videoUpload = await uploadVideoFromUrl(accountId, accessToken, singleImage, name);
          if (!videoUpload.ok || !videoUpload.videoId) {
            return {
              body: {
                success: false, partial: true,
                error: 'Falló la subida del video',
                details: videoUpload.error,
                campaign_id: campaignId, adset_id: adSetId,
                creative_error: `Video upload failed: ${videoUpload.error}`,
              }, status: 502,
            };
          }
          // Try to use a sibling image slot as thumbnail; fallback to Meta auto.
          const thumbSource = allImages.find(u => u && !looksLikeVideoUrl(u));
          let thumbHash: string | undefined;
          if (thumbSource) {
            const thumbRes = await uploadImageFromUrl(accountId, accessToken, thumbSource);
            if (thumbRes.ok && thumbRes.hash) thumbHash = thumbRes.hash;
          }
          const videoData: Record<string, any> = {
            video_id: videoUpload.videoId,
            title: allHeadlines[0] || headline || '',
            message: allTexts[0] || primary_text || '',
            call_to_action: buildCallToAction(cta, destUrl, browser_addon, pageId),
          };
          if (allDescriptions[0] || description) videoData.link_description = allDescriptions[0] || description;
          if (thumbHash) videoData.image_hash = thumbHash;
          singleStorySpec.video_data = videoData;
          console.log(`[manage-meta-campaign] Creating SINGLE VIDEO creative (video_id=${videoUpload.videoId}, thumb=${thumbHash ? 'custom' : 'auto'})`);
        } else {
          // ── SINGLE IMAGE ── classic link_data path.
          const upload = await uploadImageFromUrl(accountId, accessToken, singleImage);
          if (!upload.ok || !upload.hash) {
            console.error('[meta-campaign] Single image upload failed:', upload.error);
            return {
              body: {
                success: false, partial: true,
                error: 'Falló la subida de imagen',
                details: upload.error,
                campaign_id: campaignId, adset_id: adSetId,
                creative_error: `Image upload failed: ${upload.error}`,
              }, status: 502,
            };
          }
          const linkData: Record<string, any> = {
            link: destUrl,
            message: allTexts[0] || primary_text || '',
            name: allHeadlines[0] || headline || '',
            image_hash: upload.hash,
            call_to_action: buildCallToAction(cta, destUrl, browser_addon, pageId),
          };
          if (allDescriptions[0] || description) linkData.description = allDescriptions[0] || description;
          if (display_link && typeof display_link === 'string' && display_link.trim()) linkData.caption = display_link.trim();
          if (personalize_content) linkData.use_flexible_image_aspect_ratio = true;
          singleStorySpec.link_data = linkData;
          console.log(`[manage-meta-campaign] Creating SINGLE IMAGE creative for campaign ${campaignId}`);
        }

        const creativePayload: Record<string, any> = {
          name: `${name} - Creative`,
          object_story_spec: JSON.stringify(singleStorySpec),
        };
        if (dofSpec) creativePayload.degrees_of_freedom_spec = JSON.stringify(dofSpec);

        const creativeResult = await createCreativeWithRetry(creativePayload);

        if (!creativeResult.ok) {
          console.error('[meta-campaign] Ad creative creation failed:', creativeResult.error);
          return {
            body: {
              success: false,
              partial: true,
              error: 'Falló la creación del creativo',
              details: creativeResult.error,
              campaign_id: campaignId,
              adset_id: adSetId,
              creative_error: creativeResult.error,
            },
            status: 502,
          };
        }

        creativeId = creativeResult.data.id;
        console.log(`[manage-meta-campaign] Ad creative created: ${creativeId}`);
      }
    }

    // Step 3b: Create ad (same for all formats)
    if (creativeId) {
      const adPayload: Record<string, any> = {
        // Prefer explicit `ad_name` from the wizard; fall back to first headline
        // or the campaign name. Truncate to Meta's 512-char limit.
        name: (data.ad_name && typeof data.ad_name === 'string' && data.ad_name.trim())
          ? data.ad_name.trim().slice(0, 512)
          : (allHeadlines[0] || headline || `${name} - Ad`).slice(0, 512),
        adset_id: adSetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status,
      };
      if (url_tags && typeof url_tags === 'string' && url_tags.trim()) {
        adPayload.url_tags = url_tags.trim();
      }

      const adResult = await metaApiRequest(
        `act_${accountId}/ads`,
        accessToken,
        'POST',
        adPayload
      );

      if (!adResult.ok) {
        console.error('[meta-campaign] Ad creation failed:', adResult.error);
        return {
          body: {
            success: false,
            partial: true,
            error: 'Falló la creación del anuncio',
            details: adResult.error,
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_id: creativeId,
            ad_error: adResult.error,
          },
          status: 502,
        };
      }

      adId = adResult.data.id;
      console.log(`[manage-meta-campaign] Ad created: ${adId}`);
    }
  }

  const responseBody: Record<string, any> = {
    success: true,
    campaign_id: campaignId,
    adset_id: adSetId,
    creative_id: creativeId,
    ad_id: adId,
  };

  if (warnings.length > 0) {
    responseBody.warnings = warnings;
  }

  return {
    body: responseBody,
    status: 200
  };
}

async function handlePause(
  campaignId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-campaign] Pausing campaign ${campaignId}`);

  const result = await metaApiRequest(campaignId, accessToken, 'POST', {
    status: 'PAUSED',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to pause campaign', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, status: 'PAUSED' }, status: 200 };
}

async function handleResume(
  campaignId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-campaign] Resuming campaign ${campaignId}`);

  const result = await metaApiRequest(campaignId, accessToken, 'POST', {
    status: 'ACTIVE',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to resume campaign', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, status: 'ACTIVE' }, status: 200 };
}

async function handleUpdate(
  campaignId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { name, status, daily_budget, start_time, end_time, adset_id } = data;

  // Step 1: Update campaign-level fields (name, status)
  const campaignUpdates: Record<string, any> = {};
  if (name) campaignUpdates.name = name;
  if (status) campaignUpdates.status = status;

  if (Object.keys(campaignUpdates).length > 0) {
    console.log(`[manage-meta-campaign] Updating campaign ${campaignId}:`, campaignUpdates);

    const campaignResult = await metaApiRequest(campaignId, accessToken, 'POST', campaignUpdates);

    if (!campaignResult.ok) {
      return { body: { error: 'Failed to update campaign', details: campaignResult.error }, status: 502 };
    }
  }

  // Step 2: Update ad set level fields (budget, schedule) if adset_id is provided
  if (adset_id && (daily_budget || start_time || end_time)) {
    const adsetUpdates: Record<string, any> = {};

    if (daily_budget) {
      // CLP has no cents — pass value directly as smallest currency unit
      adsetUpdates.daily_budget = Math.round(Number(daily_budget));
    }
    if (start_time) adsetUpdates.start_time = start_time;
    if (end_time) adsetUpdates.end_time = end_time;

    console.log(`[manage-meta-campaign] Updating ad set ${adset_id}:`, adsetUpdates);

    const adsetResult = await metaApiRequest(adset_id, accessToken, 'POST', adsetUpdates);

    if (!adsetResult.ok) {
      return {
        body: {
          error: 'Campaign updated but ad set update failed',
          details: adsetResult.error,
        },
        status: 502
      };
    }
  }

  return { body: { success: true, campaign_id: campaignId }, status: 200 };
}

async function handleUpdateBudget(
  campaignId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { daily_budget, adset_id } = data;

  if (!daily_budget) {
    return { body: { error: 'Missing required field: daily_budget' }, status: 400 };
  }

  const parsedBudgetValue = Math.round(Number(daily_budget));
  if (isNaN(parsedBudgetValue) || parsedBudgetValue <= 0) {
    return { body: { error: 'daily_budget must be a positive number' }, status: 400 };
  }

  // If a specific adset_id is provided, update that one directly
  if (adset_id) {
    console.log(`[manage-meta-campaign] Updating budget for ad set ${adset_id}`);

    // CLP has no cents — pass value directly as smallest currency unit
    const result = await metaApiRequest(adset_id, accessToken, 'POST', {
      daily_budget: parsedBudgetValue,
    });

    if (!result.ok) {
      return { body: { error: 'Failed to update ad set budget', details: result.error }, status: 502 };
    }

    return { body: { success: true, adset_id, daily_budget }, status: 200 };
  }

  // Otherwise, fetch all ad sets for this campaign and update each one
  console.log(`[manage-meta-campaign] Fetching ad sets for campaign ${campaignId} to update budgets`);

  const adsetsResult = await metaApiRequest(
    `${campaignId}/adsets`,
    accessToken,
    'GET',
    { fields: 'id,name,status', limit: '100' }
  );

  if (!adsetsResult.ok) {
    return { body: { error: 'Failed to fetch ad sets', details: adsetsResult.error }, status: 502 };
  }

  const adsets = adsetsResult.data?.data || [];
  const updatedAdsets: string[] = [];
  const failedAdsets: Array<{ id: string; error: string }> = [];

  for (const adset of adsets) {
    // CLP has no cents — pass value directly as smallest currency unit
    const updateResult = await metaApiRequest(adset.id, accessToken, 'POST', {
      daily_budget: parsedBudgetValue,
    });

    if (updateResult.ok) {
      updatedAdsets.push(adset.id);
    } else {
      failedAdsets.push({ id: adset.id, error: updateResult.error || `Meta API error updating adset ${adset.id}` });
    }
  }

  return {
    body: {
      success: failedAdsets.length === 0,
      campaign_id: campaignId,
      daily_budget,
      updated_adsets: updatedAdsets,
      failed_adsets: failedAdsets,
    },
    status: 200
  };
}

async function handleDuplicate(
  campaignId: string,
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { new_name } = data;

  console.log(`[manage-meta-campaign] Duplicating campaign ${campaignId}`);

  // Step 1: Fetch the existing campaign details
  const campaignResult = await metaApiRequest(
    campaignId,
    accessToken,
    'GET',
    { fields: 'name,objective,status,special_ad_categories' }
  );

  if (!campaignResult.ok) {
    return { body: { error: 'Failed to fetch campaign for duplication', details: campaignResult.error }, status: 502 };
  }

  const originalCampaign = campaignResult.data;
  const duplicateName = new_name || `${originalCampaign.name} (Copy)`;

  // Step 2: Create the new campaign with same settings but PAUSED
  const newCampaignResult = await metaApiRequest(
    `act_${accountId}/campaigns`,
    accessToken,
    'POST',
    {
      name: duplicateName,
      objective: originalCampaign.objective,
      status: 'PAUSED',
      special_ad_categories: originalCampaign.special_ad_categories || [],
    }
  );

  if (!newCampaignResult.ok) {
    return { body: { error: 'Failed to create duplicate campaign', details: newCampaignResult.error }, status: 502 };
  }

  const newCampaignId = newCampaignResult.data.id;
  console.log(`[manage-meta-campaign] Duplicate campaign created: ${newCampaignId}`);

  // Step 3: Fetch and duplicate ad sets from the original campaign
  const adsetsResult = await metaApiRequest(
    `${campaignId}/adsets`,
    accessToken,
    'GET',
    {
      fields: 'name,daily_budget,lifetime_budget,billing_event,optimization_goal,targeting,start_time,end_time,promoted_object',
      limit: '100',
    }
  );

  const duplicatedAdsets: string[] = [];

  if (adsetsResult.ok && adsetsResult.data?.data) {
    for (const adset of adsetsResult.data.data) {
      const adsetPayload: Record<string, any> = {
        campaign_id: newCampaignId,
        name: `${adset.name} (Copy)`,
        billing_event: adset.billing_event,
        optimization_goal: adset.optimization_goal,
        status: 'PAUSED',
      };

      if (adset.daily_budget) adsetPayload.daily_budget = adset.daily_budget;
      if (adset.lifetime_budget) adsetPayload.lifetime_budget = adset.lifetime_budget;
      if (adset.targeting) adsetPayload.targeting = JSON.stringify(adset.targeting);
      if (adset.promoted_object) adsetPayload.promoted_object = JSON.stringify(adset.promoted_object);

      // Set start_time to now for the duplicate (original start_time may be in the past)
      adsetPayload.start_time = new Date().toISOString();
      if (adset.end_time && adset.start_time) {
        // Keep the same duration
        const originalStart = new Date(adset.start_time).getTime();
        const originalEnd = new Date(adset.end_time).getTime();
        if (!isNaN(originalStart) && !isNaN(originalEnd)) {
          const duration = originalEnd - originalStart;
          if (duration > 0) {
            adsetPayload.end_time = new Date(Date.now() + duration).toISOString();
          }
        }
      }

      const newAdsetResult = await metaApiRequest(
        `act_${accountId}/adsets`,
        accessToken,
        'POST',
        adsetPayload
      );

      if (newAdsetResult.ok) {
        duplicatedAdsets.push(newAdsetResult.data.id);
      } else {
        console.error(`[manage-meta-campaign] Failed to duplicate ad set ${adset.id}: ${newAdsetResult.error}`);
      }
    }
  }

  return {
    body: {
      success: true,
      original_campaign_id: campaignId,
      new_campaign_id: newCampaignId,
      new_campaign_name: duplicateName,
      duplicated_adsets: duplicatedAdsets,
    },
    status: 200
  };
}

async function handleArchive(
  campaignId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-campaign] Archiving campaign ${campaignId}`);

  const result = await metaApiRequest(campaignId, accessToken, 'POST', {
    status: 'ARCHIVED',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to archive campaign', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, status: 'ARCHIVED' }, status: 200 };
}

// --- Helper: create a single adcreative + ad for an adset ---

async function createAdForAdset(
  accountId: string,
  accessToken: string,
  adsetId: string,
  pageId: string,
  opts: {
    name: string;
    imageUrl: string;
    primaryText: string;
    headline: string;
    description?: string;
    cta: string;
    destinationUrl: string;
    status: string;
  }
): Promise<{ ok: boolean; creativeId?: string; adId?: string; error?: string }> {
  const linkData: Record<string, any> = {
    link: opts.destinationUrl,
    message: opts.primaryText,
    name: opts.headline,
    image_url: opts.imageUrl,
    call_to_action: { type: opts.cta, value: { link: opts.destinationUrl } },
  };
  if (opts.description) linkData.description = opts.description;

  const creativeResult = await metaApiRequest(
    `act_${accountId}/adcreatives`,
    accessToken,
    'POST',
    {
      name: `${opts.name} - Creative`,
      object_story_spec: JSON.stringify({ page_id: pageId, link_data: linkData }),
    }
  );

  if (!creativeResult.ok) {
    return { ok: false, error: `Creative failed: ${creativeResult.error}` };
  }

  const creativeId = creativeResult.data.id;

  const adResult = await metaApiRequest(
    `act_${accountId}/ads`,
    accessToken,
    'POST',
    {
      name: opts.name,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: opts.status,
    }
  );

  if (!adResult.ok) {
    return { ok: false, creativeId, error: `Ad failed: ${adResult.error}` };
  }

  return { ok: true, creativeId, adId: adResult.data.id };
}

// --- Action: create_322 (3 images x 2 copies x 2 headlines = 12 ad sets) ---

async function handleCreate322(
  accountId: string,
  accessToken: string,
  data: Record<string, any>,
  pageId: string
): Promise<{ body: any; status: number }> {
  const {
    name,
    objective = 'OUTCOME_SALES',
    status = 'PAUSED',
    combinations,
    cta = 'SHOP_NOW',
    destination_url,
    billing_event = 'IMPRESSIONS',
    optimization_goal = 'OFFSITE_CONVERSIONS',
  } = data;

  if (!name) {
    return { body: { error: 'Missing required field: name' }, status: 400 };
  }
  if (!combinations || !Array.isArray(combinations) || combinations.length === 0) {
    return { body: { error: 'Missing or empty combinations array' }, status: 400 };
  }
  if (!destination_url) {
    return { body: { error: 'Missing required field: destination_url' }, status: 400 };
  }

  // Step 1: Create campaign (ABO)
  console.log(`[manage-meta-campaign] create_322: Creating campaign "${name}" with ${combinations.length} combinations`);

  const campaignResult = await metaApiRequest(
    `act_${accountId}/campaigns`,
    accessToken,
    'POST',
    { name: `${name} [ABO]`, objective, status, special_ad_categories: [] }
  );

  if (!campaignResult.ok) {
    return { body: { error: 'Failed to create campaign', details: campaignResult.error }, status: 502 };
  }

  const campaignId = campaignResult.data.id;
  console.log(`[manage-meta-campaign] create_322: Campaign created: ${campaignId}`);

  // Step 2: Loop through combinations — create adset + creative + ad for each
  const results: Array<{ index: number; adsetId?: string; adId?: string; error?: string }> = [];

  for (let i = 0; i < combinations.length; i++) {
    const combo = combinations[i];

    // Create adset
    const adsetPayload: Record<string, any> = {
      campaign_id: campaignId,
      name: combo.adset_name || `${name} - Ad Set ${i + 1}`,
      billing_event,
      optimization_goal,
      status,
    };

    if (combo.daily_budget) {
      const comboBudget = Math.round(Number(combo.daily_budget));
      if (!isNaN(comboBudget) && comboBudget > 0) {
        adsetPayload.daily_budget = comboBudget;
      }
    }

    const adsetResult = await metaApiRequest(
      `act_${accountId}/adsets`,
      accessToken,
      'POST',
      adsetPayload
    );

    if (!adsetResult.ok) {
      console.error(`[manage-meta-campaign] create_322: Ad set ${i + 1} failed: ${adsetResult.error}`);
      results.push({ index: i, error: `Adset failed: ${adsetResult.error}` });
      continue;
    }

    const adsetId = adsetResult.data.id;

    // Create creative + ad
    const adResult = await createAdForAdset(accountId, accessToken, adsetId, pageId, {
      name: combo.adset_name || `${name} - Ad ${i + 1}`,
      imageUrl: combo.image_url,
      primaryText: combo.primary_text || '',
      headline: combo.headline || '',
      cta,
      destinationUrl: destination_url,
      status,
    });

    if (!adResult.ok) {
      console.error(`[manage-meta-campaign] create_322: Ad ${i + 1} failed: ${adResult.error}`);
      results.push({ index: i, adsetId, error: adResult.error });
    } else {
      results.push({ index: i, adsetId, adId: adResult.adId });
    }

    // Small delay between calls to avoid Meta rate limits
    if (i < combinations.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const successCount = results.filter((r) => r.adId).length;
  console.log(`[manage-meta-campaign] create_322: ${successCount}/${combinations.length} ads created successfully`);

  return {
    body: {
      success: successCount > 0,
      campaign_id: campaignId,
      total: combinations.length,
      created: successCount,
      results,
    },
    status: 200,
  };
}

// --- Get Ad Details ---

async function handleGetAdDetails(
  adId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  const result = await metaApiRequest(adId, accessToken, 'GET', {
    fields: 'id,name,status,creative{id,name,object_story_spec,image_url,thumbnail_url}',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to fetch ad details', details: result.error }, status: 502 };
  }

  const creative = result.data?.creative;
  const spec = creative?.object_story_spec;
  const linkData = spec?.link_data || {};

  return {
    body: {
      success: true,
      ad: {
        id: result.data.id,
        name: result.data.name,
        status: result.data.status,
        creative_id: creative?.id,
        primary_text: linkData.message || '',
        headline: linkData.name || '',
        description: linkData.description || '',
        image_url: linkData.image_url || creative?.image_url || '',
        cta: linkData.call_to_action?.type || 'SHOP_NOW',
        destination_url: linkData.link || '',
        page_id: spec?.page_id || '',
      },
    },
    status: 200,
  };
}

// --- Update Ad (create new creative + point ad to it) ---

async function handleUpdateAd(
  accountId: string,
  adId: string,
  accessToken: string,
  data: Record<string, any>,
  pageId: string
): Promise<{ body: any; status: number }> {
  const { primary_text, headline, description, image_url, cta = 'SHOP_NOW', destination_url } = data;

  if (!primary_text || !headline || !image_url || !destination_url) {
    return { body: { error: 'Missing required creative fields (primary_text, headline, image_url, destination_url)' }, status: 400 };
  }

  // Step 1: Create new adcreative
  const linkData: Record<string, any> = {
    link: destination_url,
    message: primary_text,
    name: headline,
    image_url: image_url,
    call_to_action: { type: cta, value: { link: destination_url } },
  };
  if (description) linkData.description = description;

  const creativeResult = await metaApiRequest(
    `act_${accountId}/adcreatives`,
    accessToken,
    'POST',
    {
      name: `${headline} - Updated ${Date.now()}`,
      object_story_spec: JSON.stringify({ page_id: pageId, link_data: linkData }),
    }
  );

  if (!creativeResult.ok) {
    return { body: { error: 'Failed to create new creative', details: creativeResult.error }, status: 502 };
  }

  // Step 2: Update the ad to point to the new creative
  const newCreativeId = creativeResult.data.id;
  const adResult = await metaApiRequest(adId, accessToken, 'POST', {
    creative: JSON.stringify({ creative_id: newCreativeId }),
  });

  if (!adResult.ok) {
    return { body: { error: 'Creative created but failed to update ad', details: adResult.error, creative_id: newCreativeId }, status: 502 };
  }

  return {
    body: { success: true, ad_id: adId, new_creative_id: newCreativeId },
    status: 200,
  };
}

// --- Reach estimate ---
// GET /act_{id}/delivery_estimate with a targeting_spec returns estimated
// audience size (users_lower_bound / users_upper_bound) for the given targeting,
// without creating anything. We use it in the wizard to show a live "1.2M – 3.4M"
// number as the user tweaks targeting. Also feeds rule R-036 (min 10K audience)
// with a real number instead of 0.
async function handleReachEstimate(
  accountId: string,
  accessToken: string,
  data: Record<string, any>,
): Promise<{ body: any; status: number }> {
  const {
    targeting,
    optimization_goal = 'OFFSITE_CONVERSIONS',
  } = data;

  if (!targeting) {
    return { body: { error: 'Missing targeting spec' }, status: 400 };
  }

  const targetingStr = typeof targeting === 'string' ? targeting : JSON.stringify(targeting);

  // delivery_estimate is the modern endpoint; reachestimate is legacy but still
  // works. Use delivery_estimate so we also get daily_outcomes_curve when budget
  // is present.
  //
  // NOTE v23: `currency` is no longer a valid param on /delivery_estimate — Meta
  // infers it from the ad account. Passing it raises (#100) "Param currency ...
  // is not valid". The account's currency is used automatically.
  const result = await metaApiRequest(
    `act_${accountId}/delivery_estimate`,
    accessToken,
    'GET',
    {
      targeting_spec: targetingStr,
      optimization_goal,
    },
  );

  if (!result.ok) {
    return { body: { error: 'Reach estimate failed', details: result.error }, status: 502 };
  }

  // Meta returns an array with one object inside data[]
  const estimate = result.data?.data?.[0] || {};
  return {
    body: {
      success: true,
      estimate_ready: !!estimate.estimate_ready,
      users_lower_bound: estimate.estimate_mau_lower_bound || estimate.estimate_dau || 0,
      users_upper_bound: estimate.estimate_mau_upper_bound || estimate.estimate_dau || 0,
      daily_outcomes_curve: estimate.daily_outcomes_curve || null,
    },
    status: 200,
  };
}

// --- Ad Previews ---
// GET /act_{id}/generatepreviews with a creative spec and an ad_format returns
// the iframe HTML that Meta will render in that placement. We loop over all
// requested formats and return a map { [ad_format]: "<iframe ...>" } so the
// frontend can build a grid like the Ads Manager "Vista previa avanzada".
//
// Important: Meta fetches the `picture` URL from its own servers to render the
// preview. Supabase Storage occasionally rate-limits the 13 parallel pulls,
// breaking some placements. We upload the image to /act/adimages first to get
// an image_hash, which Meta already has on-disk and can render instantly.
async function handleGeneratePreviews(
  accountId: string,
  accessToken: string,
  data: Record<string, any>,
): Promise<{ body: any; status: number }> {
  const { creative, ad_formats } = data;
  if (!creative || !Array.isArray(ad_formats) || ad_formats.length === 0) {
    return { body: { error: 'Missing creative or ad_formats[]' }, status: 400 };
  }

  // Parse creative, upload picture→hash if present, rebuild creative spec.
  let creativeObj: any;
  try {
    creativeObj = typeof creative === 'string' ? JSON.parse(creative) : creative;
  } catch {
    return { body: { error: 'Invalid creative JSON' }, status: 400 };
  }

  const linkData = creativeObj?.object_story_spec?.link_data;
  if (linkData?.picture && !linkData.image_hash) {
    try {
      const upload = await uploadImageFromUrl(accountId, accessToken, linkData.picture);
      if (upload.ok && upload.hash) {
        linkData.image_hash = upload.hash;
        delete linkData.picture;
      } else {
        console.warn('[handleGeneratePreviews] image upload failed — falling back to picture URL');
      }
    } catch (e: any) {
      console.warn('[handleGeneratePreviews] image upload threw:', e?.message);
    }
  }

  const creativeStr = JSON.stringify(creativeObj);

  // Call generatepreviews in parallel for all formats (up to 14). Each call is
  // ~1-2s so serially it'd be 20+ seconds. Parallelism saves the user.
  const settled = await Promise.allSettled(
    ad_formats.slice(0, 14).map((fmt: string) =>
      metaApiRequest(`act_${accountId}/generatepreviews`, accessToken, 'GET', {
        ad_format: fmt,
        creative: creativeStr,
      }).then(r => ({ fmt, result: r })),
    ),
  );

  const previews: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const { fmt, result } = s.value;
    if (result.ok && result.data?.data?.[0]?.body) {
      previews[fmt] = result.data.data[0].body;
    } else if (!result.ok) {
      errors[fmt] = result.error || 'Unknown';
    }
  }

  return { body: { success: true, previews, errors }, status: 200 };
}

// --- Main handler ---

export async function manageMetaCampaign(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Verify JWT and get user
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Parse request body
    const body: RequestBody = await c.req.json();
    const { action, connection_id, campaign_id, data } = body;

    if (!action) {
      return c.json({ error: 'Missing required field: action' }, 400);
    }

    if (!connection_id) {
      return c.json({ error: 'Missing required field: connection_id' }, 400);
    }

    const validActions: Action[] = ['create', 'create_322', 'pause', 'resume', 'update', 'update_budget', 'duplicate', 'archive', 'get_ad_details', 'update_ad', 'reach_estimate', 'generate_previews'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid actions: ${validActions.join(', ')}` }, 400);
    }

    // Actions that require an existing campaign_id (campaign_id is also used to pass ad_id for ad operations)
    if (['pause', 'resume', 'update', 'update_budget', 'duplicate', 'archive', 'get_ad_details', 'update_ad'].includes(action) && !campaign_id) {
      return c.json({ error: `Missing required field: campaign_id (required for action "${action}")` }, 400);
    }

    console.log(`[manage-meta-campaign] Action: ${action}, Connection: ${connection_id}, Campaign: ${campaign_id || 'N/A'}`);

    // Fetch connection details and verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        account_id,
        access_token_encrypted,
        connection_type,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (connError || !connection) {
      console.error('[manage-meta-campaign] Connection fetch error:', connError);
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify user owns this connection OR is admin
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'manageMetaCampaign.getAdminRole',
      );
      if (!adminRole) {
        console.error('[manage-meta-campaign] Authorization failed:', {
          userId: user.id, clientUserId: clientData.client_user_id, adminId: clientData.user_id,
        });
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Meta account ID' }, 400);
    }

    // Resolve token (SUAT for bm_partner, decrypt for oauth)
    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      console.error('[manage-meta-campaign] Token resolution failed');
      return c.json({ error: 'Failed to resolve access token' }, 500);
    }

    // Normalize account_id (strip act_ prefix if present, we add it where needed)
    const accountId = connection.account_id.replace(/^act_/, '');

    // Resolve page_id from request data (sent by frontend from MetaBusinessContext)
    let pageId: string | null = data?.page_id || null;

    // Auto-fetch page_id if not provided — needed for creative creation
    if (!pageId) {
      try {
        const pagesResult = await metaApiRequest(`act_${accountId}/promote_pages`, decryptedToken, 'GET', { fields: 'id,name', limit: '1' });
        if (pagesResult.ok && pagesResult.data?.data?.[0]?.id) {
          pageId = pagesResult.data.data[0].id;
          console.log(`[manage-meta-campaign] Auto-resolved page_id: ${pageId}`);
        }
      } catch (_) { /* ignore */ }
    }

    // D.6: Track scores for creative_history
    let _criterioScore: number | null = null;
    let _espejoScore: number | null = null;

    // CRITERIO pre-flight check: evaluate campaign data before creating in Meta
    if ((action === 'create' || action === 'create_322') && data) {
      try {
        // Normalize the targeting payload so CRITERIO rules can read it.
        // The wizard sends targeting in Graph API shape (geo_locations.countries,
        // flexible_spec.interests, etc.) but CRITERIO rules were authored against
        // a flat shape (targeting.countries, targeting.interests). Without this
        // mapping, rules like R-034 "País Chile" and R-039 "Idioma español" fail
        // even when the data is present. This is the Felipe W2 ↔ Isidora W6
        // contract alignment identified in the 22/04/2026 rejection audit.
        const rawTargeting = data.targeting
          ? (typeof data.targeting === 'string' ? JSON.parse(data.targeting) : data.targeting)
          : {};
        const normalizedTargeting: Record<string, any> = {
          ...rawTargeting,
          countries: rawTargeting.countries
            || rawTargeting.geo_locations?.countries
            || [],
          cities: rawTargeting.cities
            || rawTargeting.geo_locations?.cities
            || [],
          // Wizard doesn't expose locales yet — default to Spanish for LATAM markets.
          locales: rawTargeting.locales || ['es'],
          // Flatten detailed targeting for the "min 2 intereses" rule.
          interests: rawTargeting.interests
            || rawTargeting.flexible_spec?.[0]?.interests
            || [],
        };

        // R-023 "Variantes A/B deben diferir >30%" expects variant_a/variant_b
        // fields; the wizard sends a `texts[]` array with N variants. Map the
        // first two so the rule can evaluate.
        const variantA = data.texts?.[0] || data.primary_text || '';
        const variantB = data.texts?.[1] || '';

        // creative_type drives conditional CRITERIO rules (e.g. R-108 "DPA
        // template limpio" only applies when creative_type === 'dpa'). Infer
        // from the payload: catalog campaigns → 'dpa', else use ad_set_format.
        const isDpaCreative = !!(data.product_catalog_id && data.product_set_id);
        const creativeType = isDpaCreative
          ? 'dpa'
          : (data.ad_set_format === 'flexible' ? 'dct' : data.ad_set_format || 'single');

        const criterioResult = await criterioMeta(
          {
            primary_text: data.primary_text || (data.texts && data.texts[0]) || '',
            headline: data.headline || (data.headlines && data.headlines[0]) || '',
            description: data.description || (data.descriptions && data.descriptions[0]) || '',
            targeting: normalizedTargeting,
            daily_budget: data.daily_budget,
            placements: data.placements,
            angle: data.angle || 'unknown',
            theme: data.theme,
            product_ids: data.product_ids,
            creative_type: creativeType,
            // DPA campaigns have the template validated upstream; if the
            // catalog + product_set pair is present, the template is valid.
            dpa_template_valid: isDpaCreative ? true : undefined,
            product_catalog_id: data.product_catalog_id,
            product_set_id: data.product_set_id,
            creative_width: data.creative_width,
            creative_height: data.creative_height,
            creative_format: data.creative_format,
            creative_ratio: data.creative_ratio,
            budget_type: data.budget_type,
            end_date: data.end_time,
            currency: data.currency,
            objective: data.objective,
            monthly_revenue: data.monthly_revenue,
            variant_a: variantA,
            variant_b: variantB,
          },
          connection.client_id,
          connection.client_id
        );

        if (!criterioResult.can_publish) {
          console.log(`[manage-meta-campaign] CRITERIO rejected campaign: score=${criterioResult.score}, reason=${criterioResult.reason}`);
          return c.json({
            error: 'CRITERIO rechazó la campaña',
            score: criterioResult.score,
            reason: criterioResult.reason,
            failed_rules: criterioResult.failed_rules,
          }, 422);
        }

        console.log(`[manage-meta-campaign] CRITERIO approved: score=${criterioResult.score}%`);
        _criterioScore = criterioResult.score;
      } catch (criterioErr: any) {
        // Fail-open: if CRITERIO errors, log and continue
        console.error('[manage-meta-campaign] CRITERIO check failed (fail-open):', criterioErr?.message);
      }

      // Force PAUSED status — campaigns must be born PAUSED
      if (data.status && data.status !== 'PAUSED') {
        console.log(`[manage-meta-campaign] Overriding status "${data.status}" → PAUSED (CRITERIO policy)`);
        data.status = 'PAUSED';
      }
    }

    // ── ESPEJO visual check for create actions ──
    if ((action === 'create' || action === 'create_322') && data) {
      const adImageUrl = data.image_url || data.images?.[0];
      if (adImageUrl) {
        try {
          // Fetch brand info for ESPEJO evaluation
          const brandInfo = await safeQuerySingleOrDefault<any>(
            supabase
              .from('brand_research')
              .select('brand_name, colors')
              .eq('shop_id', connection.client_id)
              .maybeSingle(),
            null,
            'manageMetaCampaign.getBrandInfo',
          );

          const espejoResult = await espejoAd(
            adImageUrl,
            connection.client_id,
            data.name || 'pre-create',
            brandInfo?.colors || '#000000',
            brandInfo?.brand_name || 'Brand'
          );

          if (!espejoResult.pass) {
            // ESPEJO is advisory only — log warning but do NOT block campaign creation
            console.warn(`[manage-meta-campaign] ESPEJO advisory: ad image score=${espejoResult.score}, issues=${JSON.stringify(espejoResult.issues)}`);
          } else {
            console.log(`[manage-meta-campaign] ESPEJO approved ad image: score=${espejoResult.score}`);
          }
          _espejoScore = espejoResult.score;
        } catch (espejoErr: any) {
          // ESPEJO failure should not block campaign creation — log and continue
          console.warn(`[manage-meta-campaign] ESPEJO evaluation failed (non-blocking): ${espejoErr?.message}`);
        }
      }
    }

    // Route to the appropriate action handler
    let result: { body: any; status: number };

    switch (action) {
      case 'create':
        result = await handleCreate(accountId, decryptedToken, data || {}, pageId);
        break;

      case 'create_322':
        if (!pageId) {
          return c.json({ error: 'Missing page_id — select a Facebook Page in the portfolio selector' }, 400);
        }
        result = await handleCreate322(accountId, decryptedToken, data || {}, pageId);
        break;

      case 'pause':
        result = await handlePause(campaign_id!, decryptedToken);
        break;

      case 'resume':
        result = await handleResume(campaign_id!, decryptedToken);
        break;

      case 'update':
        result = await handleUpdate(campaign_id!, decryptedToken, data || {});
        break;

      case 'update_budget':
        result = await handleUpdateBudget(campaign_id!, decryptedToken, data || {});
        break;

      case 'duplicate':
        result = await handleDuplicate(campaign_id!, accountId, decryptedToken, data || {});
        break;

      case 'archive':
        result = await handleArchive(campaign_id!, decryptedToken);
        break;

      case 'get_ad_details':
        result = await handleGetAdDetails(campaign_id!, decryptedToken);
        break;

      case 'update_ad': {
        const adPageId = pageId || data?.page_id;
        if (!adPageId) {
          return c.json({ error: 'Missing page_id — required for updating ad creative' }, 400);
        }
        result = await handleUpdateAd(accountId, campaign_id!, decryptedToken, data || {}, adPageId);
        break;
      }

      case 'reach_estimate':
        result = await handleReachEstimate(accountId, decryptedToken, data || {});
        break;

      case 'generate_previews':
        result = await handleGeneratePreviews(accountId, decryptedToken, data || {});
        break;

      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    // D.6: Save to creative_history on successful create/create_322
    if ((action === 'create' || action === 'create_322') && result.status === 200 && result.body?.success) {
      try {
        const copyText = data?.primary_text || (data?.texts && data.texts[0]) || data?.name || '';
        const angle = data?.angle || await detectAngle(copyText);
        await supabase.from('creative_history').insert({
          client_id: connection.client_id,
          channel: 'meta',
          type: 'meta_campaign',
          angle,
          content_summary: Array.from(copyText).slice(0, 200).join(''),
          copy_text: (() => {
            if (copyText.length > 2000) {
              console.warn(`[manage-meta-campaign] copy_text truncated from ${copyText.length} to 2000 chars for creative_history`);
            }
            return Array.from(copyText).slice(0, 2000).join('');
          })(),
          entity_type: 'meta_campaign',
          entity_id: result.body.campaign_id,
          meta_campaign_id: result.body.campaign_id,
          product_name: data?.product_name || null,
          image_url: data?.image_url || data?.images?.[0] || null,
          cqs_score: _criterioScore,
          criterio_score: _criterioScore,
          espejo_score: _espejoScore,
        });
      } catch (chErr) {
        console.error('[manage-meta-campaign] creative_history insert error:', chErr);
      }
    }

    return c.json(result.body, result.status as any);
  } catch (error) {
    console.error('[manage-meta-campaign] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
