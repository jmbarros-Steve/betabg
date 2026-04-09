import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { criterioMeta } from '../ai/criterio-meta.js';

import { espejoAd } from '../ai/espejo.js';
import { detectAngle } from '../../lib/angle-detector.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

type Action = 'create' | 'create_322' | 'pause' | 'resume' | 'update' | 'update_budget' | 'duplicate' | 'archive' | 'get_ad_details' | 'update_ad';

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

  const response = await fetch(url.toString(), fetchOptions);
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
      imgResponse = await fetch(imageUrl);
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
    });
    const uploadData: any = await uploadResponse.json();

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
      // For conversion-optimized ad sets, Meta requires a promoted_object with pixel_id
      try {
        const pixelResult = await metaApiRequest(`act_${accountId}/adspixels`, accessToken, 'GET', { fields: 'id,name', limit: '1' });
        if (pixelResult.ok && pixelResult.data?.data?.[0]?.id) {
          adsetPayload.promoted_object = JSON.stringify({
            pixel_id: pixelResult.data.data[0].id,
            custom_event_type: 'PURCHASE',
          });
          console.log(`[manage-meta-campaign] Using pixel ${pixelResult.data.data[0].id} for promoted_object`);
        } else {
          console.warn(`[manage-meta-campaign] No pixel found for account ${accountId}, conversion tracking may fail`);
        }
      } catch (pixelErr: any) {
        console.warn(`[manage-meta-campaign] Failed to fetch pixel: ${pixelErr?.message}`);
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

  // Resolve instagram_actor_id for Instagram placements
  let igActorId: string | null = null;
  if (pageId) {
    try {
      const igResult = await metaApiRequest(pageId, accessToken, 'GET', {
        fields: 'instagram_business_account{id,username}',
      });
      if (igResult.ok && igResult.data?.instagram_business_account?.id) {
        igActorId = igResult.data.instagram_business_account.id;
        console.log(`[manage-meta-campaign] Resolved instagram_actor_id: ${igActorId} (${igResult.data.instagram_business_account.username || 'no username'})`);
      }
    } catch (err: any) {
      console.warn(`[manage-meta-campaign] Failed to resolve IG actor for page ${pageId}:`, err.message);
    }
  }

  // Helper: create ad creative with retry (drops instagram_actor_id on failure)
  // Uses a local copy of igActorId to avoid mutating the outer scope variable,
  // which would break subsequent creative creation calls in the same request.
  async function createCreativeWithRetry(
    creativePayload: Record<string, any>,
    storySpecKey: string = 'object_story_spec'
  ): Promise<{ ok: boolean; data?: any; error?: string }> {
    const result = await metaApiRequest(`act_${accountId}/adcreatives`, accessToken, 'POST', creativePayload);
    if (!result.ok && typeof result.error === 'string' && result.error.includes('instagram_actor_id') && igActorId) {
      console.warn(`[manage-meta-campaign] Creative failed with instagram_actor_id, retrying without it`);
      // Remove instagram_actor_id from story spec and retry (local copy only, do NOT mutate outer igActorId)
      const specStr = creativePayload[storySpecKey];
      if (specStr) {
        const spec = JSON.parse(specStr);
        delete spec.instagram_actor_id;
        creativePayload[storySpecKey] = JSON.stringify(spec);
      }
      return metaApiRequest(`act_${accountId}/adcreatives`, accessToken, 'POST', creativePayload);
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
    if (igActorId) dpaStorySpec.instagram_actor_id = igActorId;

    const dpaCreativePayload: Record<string, any> = {
      name: `${name} - DPA Creative`,
      object_story_spec: JSON.stringify(dpaStorySpec),
      product_set_id,
    };

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

    const adPayload = {
      name: `${name} - DPA Ad`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status,
    };

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

    // ---- FLEXIBLE: Dynamic Creative with asset_feed_spec ----
    if (isFlexible && allImages.length > 0) {
      console.log(`[manage-meta-campaign] Creating Dynamic Creative (flexible) with ${allImages.length} images, ${allTexts.length} texts, ${allHeadlines.length} headlines`);

      // Upload images in parallel to get hashes
      const uploadResults = await Promise.all(
        allImages.filter(Boolean).map(imgUrl => uploadImageFromUrl(accountId, accessToken, imgUrl))
      );
      const imageHashes: string[] = [];
      for (const upload of uploadResults) {
        if (upload.ok && upload.hash) {
          imageHashes.push(upload.hash);
        } else {
          console.warn(`[manage-meta-campaign] Image upload failed: ${upload.error}`);
        }
      }

      // Deduplicate hashes — Meta rejects duplicate asset values in DCT
      const uniqueHashes = [...new Set(imageHashes)];
      if (uniqueHashes.length < imageHashes.length) {
        console.log(`[manage-meta-campaign] Deduplicated image hashes: ${imageHashes.length} → ${uniqueHashes.length}`);
      }

      if (uniqueHashes.length === 0) {
        console.error('[meta-campaign] All image uploads failed for Dynamic Creative');
        return {
          body: {
            success: false,
            partial: true,
            error: 'Falló la subida de todas las imágenes',
            details: 'All image uploads failed — cannot create Dynamic Creative without images',
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_error: 'All image uploads failed — cannot create Dynamic Creative without images',
          },
          status: 502,
        };
      }

      // Deduplicate texts, headlines, descriptions — Meta rejects duplicate values
      const uniqueTexts = [...new Set(allTexts.filter(Boolean))];
      const uniqueHeadlines = [...new Set(allHeadlines.filter(Boolean))];
      const uniqueDescriptions = [...new Set(allDescriptions.filter(Boolean))];

      // Build asset_feed_spec for Dynamic Creative
      const assetFeedSpec: Record<string, any> = {
        images: uniqueHashes.map((h) => ({ hash: h })),
        bodies: uniqueTexts.map((t) => ({ text: t })),
        titles: uniqueHeadlines.map((t) => ({ text: t })),
        call_to_action_types: [cta || 'SHOP_NOW'],
        link_urls: [{ website_url: destUrl }],
        ad_formats: ['SINGLE_IMAGE'],
      };

      if (uniqueDescriptions.length > 0) {
        assetFeedSpec.descriptions = uniqueDescriptions.map((d) => ({ text: d }));
      }

      console.log(`[manage-meta-campaign] DCT asset_feed_spec:`, JSON.stringify(assetFeedSpec));

      // For DCT: object_story_spec only needs page_id + instagram_actor_id
      const dctStorySpec: Record<string, any> = { page_id: pageId };
      if (igActorId) dctStorySpec.instagram_actor_id = igActorId;

      const creativePayload: Record<string, any> = {
        name: `${name} - DCT Creative`,
        asset_feed_spec: JSON.stringify(assetFeedSpec),
        object_story_spec: JSON.stringify(dctStorySpec),
      };

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
      console.log(`[manage-meta-campaign] Creating Carousel creative with ${allImages.length} images`);

      // Upload images in parallel to get hashes
      const uploadResults = await Promise.all(
        allImages.filter(Boolean).map(imgUrl => uploadImageFromUrl(accountId, accessToken, imgUrl))
      );
      const imageHashes: string[] = [];
      for (const upload of uploadResults) {
        if (upload.ok && upload.hash) {
          imageHashes.push(upload.hash);
        } else {
          console.warn(`[manage-meta-campaign] Image upload failed: ${upload.error}`);
        }
      }

      if (imageHashes.length < 2) {
        console.error('[meta-campaign] Carousel requires at least 2 images — not enough uploads succeeded');
        return {
          body: {
            success: false,
            partial: true,
            error: 'Carousel necesita al menos 2 imágenes',
            details: 'Carousel requires at least 2 images — not enough uploads succeeded',
            campaign_id: campaignId,
            adset_id: adSetId,
            creative_error: 'Carousel requires at least 2 images — not enough uploads succeeded',
          },
          status: 502,
        };
      }

      const childAttachments = imageHashes.map((hash, i) => ({
        image_hash: hash,
        link: destUrl,
        name: allHeadlines[i] || allHeadlines[0] || '',
        description: allDescriptions[i] || allDescriptions[0] || '',
      }));

      const carouselStorySpec: Record<string, any> = {
        page_id: pageId,
        link_data: {
          link: destUrl,
          message: allTexts[0] || '',
          child_attachments: childAttachments,
          call_to_action: { type: cta || 'SHOP_NOW', value: { link: destUrl } },
        },
      };
      if (igActorId) carouselStorySpec.instagram_actor_id = igActorId;

      const creativePayload = {
        name: `${name} - Carousel Creative`,
        object_story_spec: JSON.stringify(carouselStorySpec),
      };

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
        // Upload image to get image_hash (Meta no longer accepts image_url in link_data)
        const upload = await uploadImageFromUrl(accountId, accessToken, singleImage);
        if (!upload.ok || !upload.hash) {
          console.error('[meta-campaign] Single image upload failed:', upload.error);
          return {
            body: {
              success: false,
              partial: true,
              error: 'Falló la subida de imagen',
              details: upload.error,
              campaign_id: campaignId,
              adset_id: adSetId,
              creative_error: `Image upload failed: ${upload.error}`,
            },
            status: 502,
          };
        }

        const linkData: Record<string, any> = {
          link: destUrl,
          message: allTexts[0] || primary_text || '',
          name: allHeadlines[0] || headline || '',
          image_hash: upload.hash,
          call_to_action: { type: cta, value: { link: destUrl } },
        };

        if (allDescriptions[0] || description) {
          linkData.description = allDescriptions[0] || description;
        }

        const singleStorySpec: Record<string, any> = {
          page_id: pageId,
          link_data: linkData,
        };
        if (igActorId) singleStorySpec.instagram_actor_id = igActorId;

        const creativePayload = {
          name: `${name} - Creative`,
          object_story_spec: JSON.stringify(singleStorySpec),
        };

        console.log(`[manage-meta-campaign] Creating single-image ad creative for campaign ${campaignId}`);

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
      const adPayload = {
        name: allHeadlines[0] || headline || `${name} - Ad`,
        adset_id: adSetId,
        creative: JSON.stringify({ creative_id: creativeId }),
        status,
      };

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

  // If a specific adset_id is provided, update that one directly
  if (adset_id) {
    console.log(`[manage-meta-campaign] Updating budget for ad set ${adset_id}`);

    // CLP has no cents — pass value directly as smallest currency unit
    const result = await metaApiRequest(adset_id, accessToken, 'POST', {
      daily_budget: Math.round(Number(daily_budget)),
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
      daily_budget: Math.round(Number(daily_budget)),
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
      if (adset.end_time) {
        // Keep the same duration
        const originalStart = new Date(adset.start_time).getTime();
        const originalEnd = new Date(adset.end_time).getTime();
        const duration = originalEnd - originalStart;
        if (duration > 0) {
          adsetPayload.end_time = new Date(Date.now() + duration).toISOString();
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
      adsetPayload.daily_budget = Math.round(Number(combo.daily_budget));
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

    const validActions: Action[] = ['create', 'create_322', 'pause', 'resume', 'update', 'update_budget', 'duplicate', 'archive', 'get_ad_details', 'update_ad'];
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
      .single();

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
        const criterioResult = await criterioMeta(
          {
            primary_text: data.primary_text || (data.texts && data.texts[0]) || '',
            headline: data.headline || (data.headlines && data.headlines[0]) || '',
            description: data.description || (data.descriptions && data.descriptions[0]) || '',
            targeting: data.targeting ? (typeof data.targeting === 'string' ? JSON.parse(data.targeting) : data.targeting) : undefined,
            daily_budget: data.daily_budget,
            placements: data.placements,
            angle: data.angle,
            theme: data.theme,
            product_ids: data.product_ids,
            creative_width: data.creative_width,
            creative_height: data.creative_height,
            creative_format: data.creative_format,
            creative_ratio: data.creative_ratio,
            budget_type: data.budget_type,
            end_date: data.end_time,
            currency: data.currency,
            objective: data.objective,
            monthly_revenue: data.monthly_revenue,
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
          content_summary: copyText.substring(0, 200),
          copy_text: copyText.substring(0, 2000),
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
