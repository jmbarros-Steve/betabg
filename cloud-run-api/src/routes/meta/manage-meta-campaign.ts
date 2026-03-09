import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v18.0';

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

  if (method === 'GET') {
    url.searchParams.set('access_token', accessToken);
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
  } else {
    // POST / DELETE - send access_token in body
    fetchOptions.body = JSON.stringify({ ...body, access_token: accessToken });
  }

  const response = await fetch(url.toString(), fetchOptions);
  const responseData: any = await response.json();

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || responseData?.error?.error_user_msg || 'Unknown Meta API error';
    console.error(`Meta API error [${method} ${endpoint}]:`, responseData);
    return { ok: false, error: errorMessage };
  }

  return { ok: true, data: responseData };
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
    // Ad creative fields
    primary_text,
    headline,
    description,
    image_url,
    cta = 'SHOP_NOW',
    destination_url,
  } = data;

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

  if (!adSetId && (daily_budget || targeting)) {
    const adsetPayload: Record<string, any> = {
      campaign_id: campaignId,
      name: adset_name || `${name} - Ad Set`,
      billing_event,
      optimization_goal,
      status,
    };

    if (daily_budget) {
      // Meta expects budget in cents (smallest currency unit)
      adsetPayload.daily_budget = Math.round(Number(daily_budget) * 100);
    }

    if (targeting) {
      adsetPayload.targeting = typeof targeting === 'string' ? targeting : JSON.stringify(targeting);
    }

    if (start_time) {
      adsetPayload.start_time = start_time;
    }

    if (end_time) {
      adsetPayload.end_time = end_time;
    }

    console.log(`[manage-meta-campaign] Creating ad set for campaign ${campaignId}`);

    const adsetResult = await metaApiRequest(
      `act_${accountId}/adsets`,
      accessToken,
      'POST',
      adsetPayload
    );

    if (!adsetResult.ok) {
      console.error(`[manage-meta-campaign] Ad set creation failed: ${adsetResult.error}`);
      return {
        body: {
          success: true,
          partial: true,
          campaign_id: campaignId,
          adset_error: adsetResult.error,
          message: 'Campaign created but ad set creation failed',
        },
        status: 207
      };
    }

    adSetId = adsetResult.data.id;
    console.log(`[manage-meta-campaign] Ad set created: ${adSetId}`);
  } else if (adSetId) {
    console.log(`[manage-meta-campaign] Using existing ad set: ${adSetId}`);
  }

  // Step 3: Create ad creative + ad if creative data is provided
  let adId: string | null = null;
  let creativeId: string | null = null;

  if (adSetId && image_url && pageId) {
    // Step 3a: Create ad creative
    const linkData: Record<string, any> = {
      link: destination_url || 'https://example.com',
      message: primary_text || '',
      name: headline || '',
      call_to_action: { type: cta, value: { link: destination_url || 'https://example.com' } },
    };

    if (image_url.endsWith('.mp4') || image_url.includes('video')) {
      // Video creative — use video_data instead of link_data
      // For now, treat as image (Meta will handle video URLs in link_data for single video ads)
      linkData.image_url = image_url;
    } else {
      linkData.image_url = image_url;
    }

    if (description) {
      linkData.description = description;
    }

    const creativePayload = {
      name: `${name} - Creative`,
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: linkData,
      }),
    };

    console.log(`[manage-meta-campaign] Creating ad creative for campaign ${campaignId}`);

    const creativeResult = await metaApiRequest(
      `act_${accountId}/adcreatives`,
      accessToken,
      'POST',
      creativePayload
    );

    if (!creativeResult.ok) {
      console.error(`[manage-meta-campaign] Ad creative creation failed: ${creativeResult.error}`);
      return {
        body: {
          success: true,
          partial: true,
          campaign_id: campaignId,
          adset_id: adSetId,
          creative_error: creativeResult.error,
          message: 'Campaign + ad set created but ad creative failed',
        },
        status: 207
      };
    }

    creativeId = creativeResult.data.id;
    console.log(`[manage-meta-campaign] Ad creative created: ${creativeId}`);

    // Step 3b: Create ad
    const adPayload = {
      name: headline || `${name} - Ad`,
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
      console.error(`[manage-meta-campaign] Ad creation failed: ${adResult.error}`);
      return {
        body: {
          success: true,
          partial: true,
          campaign_id: campaignId,
          adset_id: adSetId,
          creative_id: creativeId,
          ad_error: adResult.error,
          message: 'Campaign + ad set + creative created but ad creation failed',
        },
        status: 207
      };
    }

    adId = adResult.data.id;
    console.log(`[manage-meta-campaign] Ad created: ${adId}`);
  }

  return {
    body: {
      success: true,
      campaign_id: campaignId,
      adset_id: adSetId,
      creative_id: creativeId,
      ad_id: adId,
    },
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
      adsetUpdates.daily_budget = Math.round(Number(daily_budget) * 100);
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

    const result = await metaApiRequest(adset_id, accessToken, 'POST', {
      daily_budget: Math.round(Number(daily_budget) * 100),
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
    const updateResult = await metaApiRequest(adset.id, accessToken, 'POST', {
      daily_budget: Math.round(Number(daily_budget) * 100),
    });

    if (updateResult.ok) {
      updatedAdsets.push(adset.id);
    } else {
      failedAdsets.push({ id: adset.id, error: updateResult.error || 'Unknown error' });
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

    // Verify user owns this connection (admin via user_id OR client via client_user_id)
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      console.error('[manage-meta-campaign] Authorization failed:', {
        userId: user.id,
        clientUserId: clientData.client_user_id,
        adminId: clientData.user_id,
      });
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return c.json({ error: 'Missing Meta credentials (access token or account ID)' }, 400);
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('[manage-meta-campaign] Token decryption error:', decryptError);
      return c.json({ error: 'Failed to decrypt access token' }, 500);
    }

    // Normalize account_id (strip act_ prefix if present, we add it where needed)
    const accountId = connection.account_id.replace(/^act_/, '');

    // Resolve page_id from request data (sent by frontend from MetaBusinessContext)
    const pageId: string | null = data?.page_id || null;

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

    return c.json(result.body, result.status as any);
  } catch (error) {
    console.error('[manage-meta-campaign] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
