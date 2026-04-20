import { Context } from 'hono';
import { googleAdsQuery, googleAdsMutate, resolveConnectionAndToken } from '../../lib/google-ads-api.js';
import { convertToCLP, fetchGoogleAccountCurrency } from '../../lib/currency.js';

type Action = 'pause' | 'resume' | 'update_budget' | 'list_details';

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  data?: Record<string, any>;
}

// --- Action handlers ---

async function handlePause(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-google-campaign] Pausing campaign ${campaignId}`);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignOperation: {
      update: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        status: 'PAUSED',
      },
      updateMask: 'status',
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to pause campaign', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, status: 'PAUSED' }, status: 200 };
}

async function handleResume(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-google-campaign] Resuming campaign ${campaignId}`);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignOperation: {
      update: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        status: 'ENABLED',
      },
      updateMask: 'status',
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to resume campaign', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, status: 'ENABLED' }, status: 200 };
}

async function handleUpdateBudget(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { daily_budget } = data;

  if (!daily_budget) {
    return { body: { error: 'Missing required field: daily_budget' }, status: 400 };
  }

  const parsedBudget = Number(daily_budget);
  if (isNaN(parsedBudget) || parsedBudget <= 0) {
    return { body: { error: 'daily_budget must be a positive number' }, status: 400 };
  }

  console.log(`[manage-google-campaign] Updating budget for campaign ${campaignId} to ${parsedBudget}`);

  // Step 1: Get the campaign's budget resource name
  const budgetQuery = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${campaignId}`;
  const queryResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, budgetQuery);

  if (!queryResult.ok || !queryResult.data?.length) {
    return { body: { error: 'Failed to fetch campaign budget resource', details: queryResult.error }, status: 502 };
  }

  const budgetResourceName = queryResult.data[0]?.campaign?.campaignBudget;
  if (!budgetResourceName) {
    return { body: { error: 'Campaign has no associated budget resource' }, status: 400 };
  }

  // Step 2: Convert to micros (budget amount is in account currency units)
  const amountMicros = Math.round(parsedBudget * 1_000_000).toString();

  // Step 3: Mutate the budget
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignBudgetOperation: {
      update: {
        resourceName: budgetResourceName,
        amountMicros,
      },
      updateMask: 'amount_micros',
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to update budget', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, daily_budget: parsedBudget }, status: 200 };
}

async function handleListDetails(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  accountCurrency: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-google-campaign] Listing campaign details for ${customerId}`);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.campaign_budget,
      campaign_budget.amount_micros,
      campaign.bidding_strategy_type,
      campaign.advertising_channel_type
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.name
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);

  if (!result.ok) {
    return { body: { error: 'Failed to fetch campaigns', details: result.error }, status: 502 };
  }

  const campaigns = await Promise.all((result.data || []).map(async (row: any) => {
    const amountMicros = Number(row.campaignBudget?.amountMicros || 0);
    const budgetInCurrency = amountMicros / 1_000_000;
    const budgetCLP = await convertToCLP(budgetInCurrency, accountCurrency);

    return {
      id: row.campaign?.id,
      name: row.campaign?.name,
      status: row.campaign?.status,
      channel_type: row.campaign?.advertisingChannelType,
      bidding_strategy: row.campaign?.biddingStrategyType,
      daily_budget_micros: amountMicros,
      daily_budget_currency: budgetInCurrency,
      daily_budget_clp: Math.round(budgetCLP),
      currency: accountCurrency,
    };
  }));

  return { body: { success: true, campaigns }, status: 200 };
}

// --- Fase 0: Check write access ---

async function handleCheckWriteAccess(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-google-campaign] Checking write access for ${customerId}`);

  const query = `
    SELECT customer.id, customer.descriptive_name, customer.manager,
           customer.status, customer.test_account
    FROM customer
    LIMIT 1
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);

  if (!result.ok) {
    return {
      body: { success: true, has_write_access: false, reason: 'Cannot query account — possible read-only access' },
      status: 200,
    };
  }

  // If we can query, try a dry-run mutate to check write access
  // For now, we assume if we can query the customer, writes are possible
  // The actual write will fail at mutate time if permissions are insufficient
  const customer = result.data?.[0]?.customer;

  return {
    body: {
      success: true,
      has_write_access: true,
      customer_id: customer?.id,
      customer_name: customer?.descriptiveName,
      is_manager: customer?.manager,
      is_test_account: customer?.testAccount,
    },
    status: 200,
  };
}

// --- Fase 1: Campaign Settings ---

async function handleGetSettings(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.bidding_strategy_type,
           campaign.network_settings.target_google_search,
           campaign.network_settings.target_search_network,
           campaign.network_settings.target_content_network,
           campaign.geo_target_type_setting.positive_geo_target_type,
           campaign.geo_target_type_setting.negative_geo_target_type,
           campaign.start_date, campaign.end_date,
           campaign.advertising_channel_type
    FROM campaign
    WHERE campaign.id = ${campaignId}
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);

  if (!result.ok || !result.data?.length) {
    return { body: { error: 'Failed to fetch campaign settings', details: result.error }, status: 502 };
  }

  const row = result.data[0];
  const c = row.campaign;

  return {
    body: {
      success: true,
      settings: {
        id: c?.id,
        name: c?.name,
        status: c?.status,
        bidding_strategy_type: c?.biddingStrategyType,
        target_google_search: c?.networkSettings?.targetGoogleSearch,
        target_search_network: c?.networkSettings?.targetSearchNetwork,
        target_content_network: c?.networkSettings?.targetContentNetwork,
        positive_geo_target_type: c?.geoTargetTypeSetting?.positiveGeoTargetType,
        negative_geo_target_type: c?.geoTargetTypeSetting?.negativeGeoTargetType,
        start_date: c?.startDate,
        end_date: c?.endDate,
        channel_type: c?.advertisingChannelType,
      },
    },
    status: 200,
  };
}

async function handleUpdateSettings(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const updateFields: Record<string, any> = {};
  const updateMaskParts: string[] = [];

  if (data.bidding_strategy_type) {
    updateFields.biddingStrategyType = data.bidding_strategy_type;
    updateMaskParts.push('bidding_strategy_type');
  }

  if (data.network_settings) {
    const ns: Record<string, any> = {};
    if (data.network_settings.target_google_search !== undefined) {
      ns.targetGoogleSearch = data.network_settings.target_google_search;
      updateMaskParts.push('network_settings.target_google_search');
    }
    if (data.network_settings.target_search_network !== undefined) {
      ns.targetSearchNetwork = data.network_settings.target_search_network;
      updateMaskParts.push('network_settings.target_search_network');
    }
    if (data.network_settings.target_content_network !== undefined) {
      ns.targetContentNetwork = data.network_settings.target_content_network;
      updateMaskParts.push('network_settings.target_content_network');
    }
    if (Object.keys(ns).length) updateFields.networkSettings = ns;
  }

  if (data.name) {
    updateFields.name = data.name;
    updateMaskParts.push('name');
  }

  if (updateMaskParts.length === 0) {
    return { body: { error: 'No settings to update' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignOperation: {
      update: {
        resourceName: `customers/${customerId}/campaigns/${campaignId}`,
        ...updateFields,
      },
      updateMask: updateMaskParts.join(','),
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to update campaign settings', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, updated_fields: updateMaskParts }, status: 200 };
}

// --- Fase 1: Ad Group CRUD ---

async function handleListAdGroups(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type,
           ad_group.cpc_bid_micros,
           metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND ad_group.status != 'REMOVED'
    ORDER BY ad_group.name
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);

  if (!result.ok) {
    return { body: { error: 'Failed to fetch ad groups', details: result.error }, status: 502 };
  }

  const adGroups = (result.data || []).map((row: any) => ({
    id: row.adGroup?.id,
    name: row.adGroup?.name,
    status: row.adGroup?.status,
    type: row.adGroup?.type,
    cpc_bid_micros: Number(row.adGroup?.cpcBidMicros || 0),
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    cost_micros: Number(row.metrics?.costMicros || 0),
    conversions: Number(row.metrics?.conversions || 0),
  }));

  return { body: { success: true, ad_groups: adGroups }, status: 200 };
}

async function handleCreateAdGroup(
  customerId: string,
  campaignId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { name, cpc_bid_micros, type } = data;

  if (!name) {
    return { body: { error: 'Missing required field: name' }, status: 400 };
  }

  const adGroup: Record<string, any> = {
    name,
    campaign: `customers/${customerId}/campaigns/${campaignId}`,
    type: type || 'SEARCH_STANDARD',
    status: 'ENABLED',
  };

  if (cpc_bid_micros) {
    adGroup.cpcBidMicros = String(cpc_bid_micros);
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupOperation: { create: adGroup },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to create ad group', details: result.error }, status: 502 };
  }

  return { body: { success: true, campaign_id: campaignId, data: result.data }, status: 200 };
}

async function handleUpdateAdGroup(
  customerId: string,
  adGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const updateFields: Record<string, any> = {};
  const updateMaskParts: string[] = [];

  if (data.name) {
    updateFields.name = data.name;
    updateMaskParts.push('name');
  }
  if (data.cpc_bid_micros !== undefined) {
    updateFields.cpcBidMicros = String(data.cpc_bid_micros);
    updateMaskParts.push('cpc_bid_micros');
  }
  if (data.status) {
    updateFields.status = data.status;
    updateMaskParts.push('status');
  }

  if (updateMaskParts.length === 0) {
    return { body: { error: 'No fields to update' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupOperation: {
      update: {
        resourceName: `customers/${customerId}/adGroups/${adGroupId}`,
        ...updateFields,
      },
      updateMask: updateMaskParts.join(','),
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to update ad group', details: result.error }, status: 502 };
  }

  return { body: { success: true, ad_group_id: adGroupId }, status: 200 };
}

async function handlePauseAdGroup(
  customerId: string,
  adGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupOperation: {
      update: {
        resourceName: `customers/${customerId}/adGroups/${adGroupId}`,
        status: 'PAUSED',
      },
      updateMask: 'status',
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to pause ad group', details: result.error }, status: 502 };
  }

  return { body: { success: true, ad_group_id: adGroupId, status: 'PAUSED' }, status: 200 };
}

async function handleEnableAdGroup(
  customerId: string,
  adGroupId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupOperation: {
      update: {
        resourceName: `customers/${customerId}/adGroups/${adGroupId}`,
        status: 'ENABLED',
      },
      updateMask: 'status',
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to enable ad group', details: result.error }, status: 502 };
  }

  return { body: { success: true, ad_group_id: adGroupId, status: 'ENABLED' }, status: 200 };
}

// --- Fase 2: Create Campaign ---

async function handleCreateCampaign(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const {
    name, daily_budget, channel_type, bid_strategy,
    target_google_search, target_search_network, target_content_network,
    start_date, end_date, ad_group_name, ad_group_cpc_bid_micros,
    // PMAX-specific
    final_urls, business_name, headlines, descriptions, long_headlines,
    image_assets, youtube_video_ids,
    call_to_action, display_url_path1, display_url_path2,
    url_expansion_opt_out, search_themes,
    // Sitelinks
    sitelinks,
    // Targeting
    locations, languages,
    // Acquisition mode: BID_HIGHER (prioriza nuevos), TARGET_ALL_EQUALLY (todos), BID_ONLY (default)
    acquisition_mode,
    // Audience signal generado por AI (demografia/intereses)
    audience_signal,
    // Productos del catalogo seleccionados (SKUs) — restringen la campana PMAX Shopping a estos IDs
    selected_product_ids,
    // Shopping / Merchant Center
    merchant_center_id,
    // Client ID (inyectado por dispatcher, ownership-validated)
    client_id: clientIdForValidation,
  } = data;

  if (!name || name.length > 128) {
    return { body: { error: 'Campaign name is required and must be <= 128 chars' }, status: 400 };
  }
  if (!daily_budget || Number(daily_budget) <= 0) {
    return { body: { error: 'daily_budget must be a positive number' }, status: 400 };
  }

  const channelType = channel_type || 'SEARCH';
  const bidStrategy = bid_strategy || 'MAXIMIZE_CONVERSIONS';
  const amountMicros = Math.round(Number(daily_budget) * 1_000_000).toString();

  // Format dates (YYYY-MM-DD for Google Ads API v23+)
  const formattedStartDate = start_date
    ? `${start_date.slice(0, 4)}-${start_date.slice(4, 6)}-${start_date.slice(6, 8)}`
    : null;
  const formattedEndDate = end_date
    ? `${end_date.slice(0, 4)}-${end_date.slice(4, 6)}-${end_date.slice(6, 8)}`
    : null;

  const mutateOps: any[] = [];

  // 1. Budget (temp ID -1)
  mutateOps.push({
    campaignBudgetOperation: {
      create: {
        resourceName: `customers/${customerId}/campaignBudgets/-1`,
        name: `Budget - ${name}`,
        amountMicros,
        explicitlyShared: false,
      },
    },
  });

  // 2. Campaign (temp ID -2)
  const campaignCreate: Record<string, any> = {
    resourceName: `customers/${customerId}/campaigns/-2`,
    name,
    advertisingChannelType: channelType,
    status: 'PAUSED',
    campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
    biddingStrategyType: bidStrategy,
    containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
  };

  // Geo target type setting (how to match locations)
  campaignCreate.geoTargetTypeSetting = {
    positiveGeoTargetType: 'PRESENCE_OR_INTEREST',
  };

  // Start/end dates (only if explicitly set)
  if (formattedStartDate) {
    campaignCreate.startDate = formattedStartDate;
  }
  if (formattedEndDate) {
    campaignCreate.endDate = formattedEndDate;
  }

  // Network settings for Search campaigns
  if (channelType === 'SEARCH') {
    campaignCreate.networkSettings = {
      targetGoogleSearch: target_google_search !== false,
      targetSearchNetwork: target_search_network !== false,
      targetContentNetwork: target_content_network === true,
    };
  }

  // Shopping-specific (required)
  if (channelType === 'SHOPPING') {
    if (!merchant_center_id) {
      return { body: { error: 'merchant_center_id is required for Shopping campaigns' }, status: 400 };
    }
    campaignCreate.shoppingSetting = {
      merchantId: String(merchant_center_id),
    };
  }

  // PMAX + Merchant Center (optional — enables Shopping ads within PMAX)
  if (channelType === 'PERFORMANCE_MAX' && merchant_center_id) {
    campaignCreate.shoppingSetting = {
      merchantId: String(merchant_center_id),
    };
  }

  mutateOps.push({ campaignOperation: { create: campaignCreate } });

  // Location targeting criteria
  if (locations?.length) {
    for (const geoId of locations) {
      mutateOps.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${customerId}/campaigns/-2`,
            location: {
              geoTargetConstant: `geoTargetConstants/${geoId}`,
            },
          },
        },
      });
    }
  }

  // Language targeting criteria
  if (languages?.length) {
    for (const langId of languages) {
      mutateOps.push({
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${customerId}/campaigns/-2`,
            language: {
              languageConstant: `languageConstants/${langId}`,
            },
          },
        },
      });
    }
  }

  // 3. Ad Group (temp ID -3) — for Search campaigns
  if (channelType === 'SEARCH') {
    const adGroupCreate: Record<string, any> = {
      name: ad_group_name || 'Ad Group 1',
      campaign: `customers/${customerId}/campaigns/-2`,
      type: 'SEARCH_STANDARD',
      status: 'ENABLED',
    };
    if (ad_group_cpc_bid_micros) {
      adGroupCreate.cpcBidMicros = String(ad_group_cpc_bid_micros);
    }
    mutateOps.push({ adGroupOperation: { create: adGroupCreate } });
  }

  // PMAX: campaign + asset group + assets
  if (channelType === 'PERFORMANCE_MAX') {
    // PMAX requires bidding strategy object, not just type
    const pmaxStrategy = bidStrategy || 'MAXIMIZE_CONVERSION_VALUE';
    delete campaignCreate.biddingStrategyType;
    if (pmaxStrategy === 'MAXIMIZE_CONVERSIONS' || pmaxStrategy === 'TARGET_CPA') {
      campaignCreate.maximizeConversions = {};
    } else {
      campaignCreate.maximizeConversionValue = {};
    }

    // Disable Brand Guidelines (requires CampaignAsset logo+name which we add in Phase 2)
    campaignCreate.brandGuidelinesEnabled = false;

    // Customer Acquisition Setting — solo valores válidos de la API v23
    if (acquisition_mode && ['BID_HIGHER', 'TARGET_ALL_EQUALLY', 'BID_ONLY'].includes(acquisition_mode)) {
      campaignCreate.customerAcquisitionSetting = { optimizationMode: acquisition_mode };
    }

    if (!final_urls?.length) {
      return { body: { error: 'final_urls required for PMAX campaigns' }, status: 400 };
    }

    // Validate PMAX minimum asset requirements (Google Ads enforces these)
    const validHeadlines = (headlines || []).filter((h: string) => h?.trim());
    const validDescriptions = (descriptions || []).filter((d: string) => d?.trim());
    const validLongHeadlines = (long_headlines || []).filter((h: string) => h?.trim());
    const errors: string[] = [];
    if (validHeadlines.length < 3) errors.push(`Minimo 3 headlines (tienes ${validHeadlines.length})`);
    if (validDescriptions.length < 2) errors.push(`Minimo 2 descriptions (tienes ${validDescriptions.length})`);
    if (validLongHeadlines.length < 1) errors.push(`Minimo 1 long headline (tienes ${validLongHeadlines.length})`);
    if (!business_name?.trim()) errors.push('Business name es requerido');
    const imgCount = image_assets?.length || 0;
    const hasLandscape = image_assets?.some((i: any) => i.field_type === 'MARKETING_IMAGE');
    const hasSquare = image_assets?.some((i: any) => i.field_type === 'SQUARE_MARKETING_IMAGE');
    const hasLogo = image_assets?.some((i: any) => i.field_type === 'LOGO');
    if (!hasLandscape) errors.push('Minimo 1 imagen landscape (1.91:1)');
    if (!hasSquare) errors.push('Minimo 1 imagen cuadrada (1:1)');
    if (!hasLogo) errors.push('Minimo 1 logo (1:1)');
    if (errors.length > 0) {
      return { body: { error: `PMAX requiere assets minimos: ${errors.join('; ')}` }, status: 400 };
    }

    // Ensure URLs have protocol
    const sanitizedUrls = final_urls.map((u: string) =>
      /^https?:\/\//i.test(u) ? u : `https://${u}`
    );

    // Google Ads batch mutate requires correct operation order:
    // 1. Asset creation operations (all assets first)
    // 2. Asset group creation (after assets exist)
    // 3. Asset group asset links (after both assets and group exist)
    const assetOps: any[] = [];
    const linkOps: any[] = [];
    let tempId = -4; // -1=budget, -2=campaign, -3=assetGroup

    // Headlines
    if (headlines?.length) {
      for (const hl of headlines.slice(0, 15)) {
        const text = hl.slice(0, 30); // Google Ads max 30 chars
        if (!text) continue;
        const assetTempId = tempId--;
        assetOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              textAsset: { text },
            },
          },
        });
        linkOps.push({
          assetGroupAssetOperation: {
            create: {
              asset: `customers/${customerId}/assets/${assetTempId}`,
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              fieldType: 'HEADLINE',
            },
          },
        });
      }
    }

    // Descriptions
    if (descriptions?.length) {
      for (const desc of descriptions.slice(0, 5)) {
        const text = desc.slice(0, 90); // Google Ads max 90 chars
        if (!text) continue;
        const assetTempId = tempId--;
        assetOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              textAsset: { text },
            },
          },
        });
        linkOps.push({
          assetGroupAssetOperation: {
            create: {
              asset: `customers/${customerId}/assets/${assetTempId}`,
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              fieldType: 'DESCRIPTION',
            },
          },
        });
      }
    }

    // Long headlines
    if (long_headlines?.length) {
      for (const lh of long_headlines.slice(0, 5)) {
        const text = lh.slice(0, 90); // Google Ads max 90 chars
        if (!text) continue;
        const assetTempId = tempId--;
        assetOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              textAsset: { text },
            },
          },
        });
        linkOps.push({
          assetGroupAssetOperation: {
            create: {
              asset: `customers/${customerId}/assets/${assetTempId}`,
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              fieldType: 'LONG_HEADLINE',
            },
          },
        });
      }
    }

    // Business name
    if (business_name) {
      const assetTempId = tempId--;
      assetOps.push({
        assetOperation: {
          create: {
            resourceName: `customers/${customerId}/assets/${assetTempId}`,
            textAsset: { text: business_name },
          },
        },
      });
      linkOps.push({
        assetGroupAssetOperation: {
          create: {
            asset: `customers/${customerId}/assets/${assetTempId}`,
            assetGroup: `customers/${customerId}/assetGroups/-3`,
            fieldType: 'BUSINESS_NAME',
          },
        },
      });
    }

    // Image assets — validate aspect ratio + min dimensions before pushing ops
    if (image_assets?.length) {
      const validatedImages: any[] = [];
      const rejected: string[] = [];
      for (const img of image_assets) {
        const spec = PMAX_IMAGE_SPECS[img.field_type];
        if (!spec) { rejected.push(`${img.name || 'image'}: field_type desconocido ${img.field_type}`); continue; }
        const dims = parseImageDimensions(img.data);
        if (!dims) { rejected.push(`${img.name || 'image'}: no se pudo leer dimensiones (formato no soportado)`); continue; }
        if (dims.width < spec.minW || dims.height < spec.minH) {
          rejected.push(`${img.name || 'image'} (${dims.width}x${dims.height}): menor que mínimo ${spec.minW}x${spec.minH} para ${spec.label}`);
          continue;
        }
        const actualRatio = dims.width / dims.height;
        if (Math.abs(actualRatio - spec.targetRatio) > spec.tolerance) {
          rejected.push(`${img.name || 'image'} (${dims.width}x${dims.height}, ratio ${actualRatio.toFixed(2)}): no cumple ${spec.label} (objetivo ${spec.targetRatio})`);
          continue;
        }
        validatedImages.push(img);
      }
      if (rejected.length > 0) {
        console.warn(`[manage-google-campaign] PMAX rejected ${rejected.length}/${image_assets.length} image(s):`, rejected);
      }
      // Re-validate PMAX minimums after filtering
      const okLandscape = validatedImages.some((i: any) => i.field_type === 'MARKETING_IMAGE');
      const okSquare = validatedImages.some((i: any) => i.field_type === 'SQUARE_MARKETING_IMAGE');
      const okLogo = validatedImages.some((i: any) => i.field_type === 'LOGO');
      if (!okLandscape || !okSquare || !okLogo) {
        return {
          body: {
            error: 'Faltan imágenes válidas después de validar aspect ratios',
            details: `Requiere al menos 1 landscape (1.91:1), 1 cuadrada (1:1), 1 logo (1:1). Imágenes rechazadas: ${rejected.join(' | ')}`,
            rejected_images: rejected,
          },
          status: 400,
        };
      }
      for (const img of validatedImages) {
        const assetTempId = tempId--;
        assetOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              imageAsset: { data: img.data },
              name: img.name || 'Image',
            },
          },
        });
        linkOps.push({
          assetGroupAssetOperation: {
            create: {
              asset: `customers/${customerId}/assets/${assetTempId}`,
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              fieldType: img.field_type,
            },
          },
        });
      }
    }

    // YouTube video assets
    if (youtube_video_ids?.length) {
      for (const videoId of youtube_video_ids) {
        const assetTempId = tempId--;
        assetOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              youtubeVideoAsset: { youtubeVideoId: videoId },
            },
          },
        });
        linkOps.push({
          assetGroupAssetOperation: {
            create: {
              asset: `customers/${customerId}/assets/${assetTempId}`,
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              fieldType: 'YOUTUBE_VIDEO',
            },
          },
        });
      }
    }

    // CTA — create CallToActionAsset (no text!) + link with CALL_TO_ACTION_SELECTION
    // call_to_action es un enum CallToActionType (SHOP_NOW, LEARN_MORE, etc.), no texto libre.
    if (call_to_action) {
      const ctaAssetId = tempId--;
      assetOps.push({
        assetOperation: {
          create: {
            resourceName: `customers/${customerId}/assets/${ctaAssetId}`,
            callToActionAsset: { callToAction: call_to_action },
          },
        },
      });
      linkOps.push({
        assetGroupAssetOperation: {
          create: {
            asset: `customers/${customerId}/assets/${ctaAssetId}`,
            assetGroup: `customers/${customerId}/assetGroups/-3`,
            fieldType: 'CALL_TO_ACTION_SELECTION',
          },
        },
      });
    }

    // Asset group create — includes display URL paths + URL expansion opt-out
    const assetGroupCreate: Record<string, any> = {
      resourceName: `customers/${customerId}/assetGroups/-3`,
      campaign: `customers/${customerId}/campaigns/-2`,
      name: ad_group_name || 'Asset Group 1',
      finalUrls: sanitizedUrls,
      status: 'ENABLED',
    };

    // Display URL paths (max 15 chars each)
    if (display_url_path1) {
      assetGroupCreate.path1 = display_url_path1.slice(0, 15);
    }
    if (display_url_path2 && display_url_path1) {
      assetGroupCreate.path2 = display_url_path2.slice(0, 15);
    }

    // URL expansion opt-out
    if (url_expansion_opt_out === true) {
      assetGroupCreate.urlExpansionOptOut = true;
    }

    // Sitelink assets + campaign asset links (before asset group)
    const sitelinkOps: any[] = [];
    const sitelinkLinkOps: any[] = [];
    if (sitelinks?.length) {
      for (const sl of sitelinks.slice(0, 20)) {
        if (!sl.text?.trim() || !sl.url?.trim()) continue;
        const slAssetId = tempId--;
        const slUrl = /^https?:\/\//i.test(sl.url) ? sl.url : `https://${sl.url}`;
        const slAsset: Record<string, any> = {
          resourceName: `customers/${customerId}/assets/${slAssetId}`,
          finalUrls: [slUrl],
          sitelinkAsset: {
            linkText: sl.text.slice(0, 25),
          },
        };
        if (sl.description1?.trim()) {
          slAsset.sitelinkAsset.description1 = sl.description1.slice(0, 35);
        }
        if (sl.description2?.trim()) {
          slAsset.sitelinkAsset.description2 = sl.description2.slice(0, 35);
        }
        sitelinkOps.push({ assetOperation: { create: slAsset } });
        sitelinkLinkOps.push({
          campaignAssetOperation: {
            create: {
              asset: `customers/${customerId}/assets/${slAssetId}`,
              campaign: `customers/${customerId}/campaigns/-2`,
              fieldType: 'SITELINK',
            },
          },
        });
      }
    }

    // Push in correct order:
    // 1. Sitelink asset creation
    // 2. Campaign-level sitelink links
    // 3. Text/image/video asset creation
    // 4. Asset group
    // 5. Asset group asset links
    // 6. Asset group signal (search themes)
    mutateOps.push(...sitelinkOps);
    mutateOps.push(...sitelinkLinkOps);
    mutateOps.push(...assetOps);
    mutateOps.push({ assetGroupOperation: { create: assetGroupCreate } });
    mutateOps.push(...linkOps);

    // Listing Group Filter tree — restringe PMAX Shopping a un subset de SKUs (si el user eligio productos).
    // Solo aplica cuando hay merchant_center (Shopping) y selected_product_ids provistos.
    // Estructura: Root SUBDIVISION → 1 leaf UNIT_INCLUDED por SKU + 1 leaf UNIT_EXCLUDED "other".
    let validSelectedIds: string[] = Array.isArray(selected_product_ids)
      ? Array.from(new Set(selected_product_ids.map((id: any) => String(id || '').trim()).filter((id: string) => id.length > 0)))
      : [];
    // Cross-validate selected SKUs against the client's actual catalog (shopify_products)
    // — evita que el body inyecte SKUs que no pertenecen al cliente / campaña zombie.
    if (merchant_center_id && validSelectedIds.length > 0 && clientIdForValidation && UUID_RX.test(String(clientIdForValidation))) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        try {
          // Use PostgREST "in.(...)" — quote each ID to be safe
          const idList = validSelectedIds.slice(0, 500).map(id => `"${id.replace(/"/g, '')}"`).join(',');
          const res = await fetch(
            `${supabaseUrl}/rest/v1/shopify_products?client_id=eq.${String(clientIdForValidation).trim()}&product_id=in.(${encodeURIComponent(idList)})&select=product_id&limit=500`,
            { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, signal: AbortSignal.timeout(5_000) }
          );
          if (res.ok) {
            const rows = await res.json() as any[];
            const ownedSet = new Set(rows.map((r: any) => String(r.product_id)));
            const before = validSelectedIds.length;
            validSelectedIds = validSelectedIds.filter(id => ownedSet.has(id));
            const dropped = before - validSelectedIds.length;
            if (dropped > 0) {
              console.warn(`[manage-google-campaign] selected_product_ids: dropped ${dropped} SKU(s) not owned by client ${clientIdForValidation}`);
            }
          }
        } catch (err: any) {
          console.warn('[manage-google-campaign] selected_product_ids validation failed:', err.message);
        }
      }
    }
    if (merchant_center_id && validSelectedIds.length > 0) {
      const rootLgfTempId = tempId--;
      const rootLgfResource = `customers/${customerId}/assetGroupListingGroupFilters/${rootLgfTempId}`;
      const assetGroupResource = `customers/${customerId}/assetGroups/-3`;
      // Root subdivision node
      mutateOps.push({
        assetGroupListingGroupFilterOperation: {
          create: {
            resourceName: rootLgfResource,
            assetGroup: assetGroupResource,
            type: 'SUBDIVISION',
            listingSource: 'SHOPPING',
          },
        },
      });
      // One UNIT_INCLUDED leaf per selected SKU
      // Note: listingSource va SOLO en el root (SUBDIVISION). v23 rechaza si se repite en children.
      for (const sku of validSelectedIds.slice(0, 500)) {
        mutateOps.push({
          assetGroupListingGroupFilterOperation: {
            create: {
              assetGroup: assetGroupResource,
              type: 'UNIT_INCLUDED',
              parentListingGroupFilter: rootLgfResource,
              caseValue: {
                productItemId: { value: sku },
              },
            },
          },
        });
      }
      // Catch-all UNIT_EXCLUDED leaf for everything else (productItemId without value)
      mutateOps.push({
        assetGroupListingGroupFilterOperation: {
          create: {
            assetGroup: assetGroupResource,
            type: 'UNIT_EXCLUDED',
            parentListingGroupFilter: rootLgfResource,
            caseValue: {
              productItemId: {},
            },
          },
        },
      });
      console.log(`[manage-google-campaign] pmax listing group filter queued: ${validSelectedIds.length} included SKUs + 1 catch-all excluded`);
    }


    // Search themes as AssetGroupSignal (audience signals).
    // Google Ads API v23: one AssetGroupSignal per theme, with searchTheme: { text: "..." }.
    if (search_themes?.length) {
      const validThemes: string[] = search_themes
        .map((t: string) => (typeof t === 'string' ? t.trim() : ''))
        .filter((t: string) => t.length > 0)
        .slice(0, 25);
      for (const themeText of validThemes) {
        mutateOps.push({
          assetGroupSignalOperation: {
            create: {
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              searchTheme: { text: themeText },
            },
          },
        });
      }
    }

    // Audience Signal (demografia + intereses) generado por AI — capa 2
    // Crea un Audience customer-level + lo linkea al AssetGroup como signal.
    if (audience_signal && typeof audience_signal === 'object') {
      const {
        name: audName,
        description: audDescription,
        age_ranges,
        genders,
        parental_statuses,
        income_ranges,
      } = audience_signal as any;

      // Valid enums Google Ads API v23 (whitelist — cualquier valor fuera se descarta)
      const AGE_ENUMS = new Set(['AGE_RANGE_18_24', 'AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54', 'AGE_RANGE_55_64', 'AGE_RANGE_65_UP', 'AGE_RANGE_UNDETERMINED']);
      const GENDER_ENUMS = new Set(['MALE', 'FEMALE', 'UNDETERMINED']);
      const PARENTAL_ENUMS = new Set(['PARENT', 'NOT_A_PARENT', 'UNDETERMINED']);
      const INCOME_ENUMS = new Set(['INCOME_RANGE_0_50', 'INCOME_RANGE_50_60', 'INCOME_RANGE_60_70', 'INCOME_RANGE_70_80', 'INCOME_RANGE_80_90', 'INCOME_RANGE_90_UP', 'INCOME_RANGE_UNDETERMINED']);

      const validAges = Array.isArray(age_ranges) ? age_ranges.filter((a: string) => AGE_ENUMS.has(a)) : [];
      // Audience resource rechaza UNDETERMINED en genders/parental/income — solo permite valores concretos.
      // UNDETERMINED sí es enum válido del sistema pero no se acepta al crear audience.
      const validGenders = Array.isArray(genders) ? genders.filter((g: string) => GENDER_ENUMS.has(g) && g !== 'UNDETERMINED') : [];
      const validParental = Array.isArray(parental_statuses) ? parental_statuses.filter((p: string) => PARENTAL_ENUMS.has(p) && p !== 'UNDETERMINED') : [];
      const validIncomes = Array.isArray(income_ranges) ? income_ranges.filter((i: string) => INCOME_ENUMS.has(i) && i !== 'INCOME_RANGE_UNDETERMINED') : [];

      // Shape per Google Ads API v23 proto for AUDIENCE (verificado contra docs oficiales):
      //   AgeDimension.age_ranges: repeated AgeSegment { minAge: int, maxAge: int } — enum se traduce a ints
      //   AgeDimension.include_undetermined: bool — UNDETERMINED va acá, no en el array
      //   GenderDimension.genders: repeated GenderType enum (string directo, no wrapped)
      //   ParentalStatusDimension.parental_statuses: repeated ParentalStatusType enum (string directo)
      //   HouseholdIncomeDimension.income_ranges: repeated IncomeRangeType enum (string directo)
      const AGE_MAP: Record<string, { minAge?: number; maxAge?: number }> = {
        AGE_RANGE_18_24: { minAge: 18, maxAge: 24 },
        AGE_RANGE_25_34: { minAge: 25, maxAge: 34 },
        AGE_RANGE_35_44: { minAge: 35, maxAge: 44 },
        AGE_RANGE_45_54: { minAge: 45, maxAge: 54 },
        AGE_RANGE_55_64: { minAge: 55, maxAge: 64 },
        AGE_RANGE_65_UP: { minAge: 65 },
      };
      const dimensions: any[] = [];
      if (validAges.length) {
        const ageSegments = validAges
          .filter((r: string) => r !== 'AGE_RANGE_UNDETERMINED')
          .map((r: string) => AGE_MAP[r])
          .filter(Boolean);
        const includeUndet = validAges.includes('AGE_RANGE_UNDETERMINED');
        const ageDim: any = {};
        if (ageSegments.length) ageDim.ageRanges = ageSegments;
        if (includeUndet) ageDim.includeUndetermined = true;
        if (ageSegments.length || includeUndet) dimensions.push({ age: ageDim });
      }
      if (validGenders.length) dimensions.push({ gender: { genders: validGenders } });
      if (validParental.length) dimensions.push({ parentalStatus: { parentalStatuses: validParental } });
      if (validIncomes.length) dimensions.push({ householdIncome: { incomeRanges: validIncomes } });

      if (dimensions.length > 0) {
        const audTempId = tempId--;
        const audResource = `customers/${customerId}/audiences/${audTempId}`;
        // Audience op FIRST so it appears in the batch before the AssetGroupSignal that references it (clarity)
        mutateOps.push({
          audienceOperation: {
            create: {
              resourceName: audResource,
              name: (typeof audName === 'string' && audName.trim()) ? audName.trim().slice(0, 50) : `Audiencia PMAX ${Date.now()}`,
              description: (typeof audDescription === 'string' && audDescription.trim()) ? audDescription.trim().slice(0, 250) : 'Audiencia generada para PMAX',
              dimensions,
            },
          },
        });
        // AssetGroupSignal.audience is AudienceInfo { audience: resource_name } (wrapped), not a bare string
        mutateOps.push({
          assetGroupSignalOperation: {
            create: {
              assetGroup: `customers/${customerId}/assetGroups/-3`,
              audience: { audience: audResource },
            },
          },
        });
        console.log(`[manage-google-campaign] pmax audience signal queued: name="${audName || 'auto'}" ages=${validAges.length} genders=${validGenders.length} parental=${validParental.length} income=${validIncomes.length}`);
      } else {
        console.warn('[manage-google-campaign] audience_signal provided but no valid dimensions after enum whitelist — skipping audience creation');
      }
    }
  }

  // Log asset counts for debugging
  const headlineCount = mutateOps.filter((op: any) => op.assetGroupAssetOperation?.create?.fieldType === 'HEADLINE').length;
  const descCount = mutateOps.filter((op: any) => op.assetGroupAssetOperation?.create?.fieldType === 'DESCRIPTION').length;
  const longHlCount = mutateOps.filter((op: any) => op.assetGroupAssetOperation?.create?.fieldType === 'LONG_HEADLINE').length;
  const bizNameCount = mutateOps.filter((op: any) => op.assetGroupAssetOperation?.create?.fieldType === 'BUSINESS_NAME').length;
  const imgCount2 = mutateOps.filter((op: any) => op.assetGroupAssetOperation?.create?.fieldType?.includes('IMAGE') || op.assetGroupAssetOperation?.create?.fieldType === 'LOGO').length;
  const sitelinkCount = mutateOps.filter((op: any) => op.campaignAssetOperation?.create?.fieldType === 'SITELINK').length;
  const locationCount = mutateOps.filter((op: any) => op.campaignCriterionOperation?.create?.location).length;
  const languageCount = mutateOps.filter((op: any) => op.campaignCriterionOperation?.create?.language).length;
  console.log(`[manage-google-campaign] Creating ${channelType} campaign "${name}" with ${mutateOps.length} ops — headlines:${headlineCount} desc:${descCount} longHl:${longHlCount} bizName:${bizNameCount} images:${imgCount2} videos:${youtube_video_ids?.length || 0} sitelinks:${sitelinkCount} locations:${locationCount} languages:${languageCount}`);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutateOps);

  if (!result.ok) {
    return { body: { error: `Failed to create campaign: ${result.error}` }, status: 502 };
  }

  return {
    body: {
      success: true,
      campaign_name: name,
      channel_type: channelType,
      status: 'PAUSED',
      data: result.data,
    },
    status: 200,
  };
}

// --- Fase 3: Merchant Center ---

async function handleListMerchantCenters(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-google-campaign] Listing merchant centers for ${customerId}`);

  const merchantCenters: Array<{ id: string; name: string; status: string }> = [];

  // Method 1: GAQL — query shopping_setting from existing campaigns
  const shoppingQuery = `
    SELECT campaign.shopping_setting.merchant_id, campaign.name
    FROM campaign
    WHERE campaign.shopping_setting.merchant_id IS NOT NULL
      AND campaign.status != 'REMOVED'
  `;
  const shoppingResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, shoppingQuery);
  const seenIds = new Set<string>();
  if (shoppingResult.ok && shoppingResult.data) {
    for (const row of shoppingResult.data) {
      const mid = String(row.campaign?.shoppingSetting?.merchantId || '');
      if (mid && !seenIds.has(mid)) {
        seenIds.add(mid);
        merchantCenters.push({ id: mid, name: `Merchant Center ${mid}`, status: 'ENABLED' });
      }
    }
  }

  // Method 2: REST — list product links (Google Ads API v18)
  try {
    const makeRequest = async (loginId: string) => {
      return fetch(`https://googleads.googleapis.com/v18/customers/${customerId}/productLinks`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginId,
        },
        signal: AbortSignal.timeout(10_000),
      });
    };

    let response = await makeRequest(loginCustomerId);
    if (response.status === 403 && loginCustomerId !== customerId) {
      await response.text().catch(() => {});
      response = await makeRequest(customerId);
    }

    if (response.ok) {
      const json = await response.json() as any;
      const links = json.productLinks || json.results || [];
      for (const link of links) {
        const mc = link.merchantCenter || link.productLink?.merchantCenter;
        if (mc?.merchantCenterId) {
          const mid = String(mc.merchantCenterId);
          if (!seenIds.has(mid)) {
            seenIds.add(mid);
            merchantCenters.push({
              id: mid,
              name: mc.merchantCenterAccountName || `Merchant Center ${mid}`,
              status: link.status || 'ENABLED',
            });
          }
        }
      }
    } else {
      const errText = await response.text().catch(() => '');
      console.log(`[manage-google-campaign] productLinks ${response.status}: ${errText.slice(0, 200)}`);
    }
  } catch (err: any) {
    console.log(`[manage-google-campaign] productLinks fetch failed: ${err.message}`);
  }

  console.log(`[manage-google-campaign] Found ${merchantCenters.length} merchant centers for ${customerId}`);
  return { body: { success: true, merchant_centers: merchantCenters }, status: 200 };
}

// --- Fase 4: Budget Recommendation ---

async function handleGetBudgetRecommendation(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { channel_type, search_themes: themes, client_id } = data;
  const userIntent = typeof data.user_intent === 'string' ? data.user_intent.trim().slice(0, 800) : '';
  console.log(`[manage-google-campaign] Getting budget recommendation for ${customerId}`);

  // Primary path: Unit-economics-based recommendation using brief + financial config
  if (client_id) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (supabaseUrl && supabaseKey && anthropicKey) {
      try {
        const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

        const [finRes, bpRes, shopRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/client_financial_config?client_id=eq.${client_id}&select=*&limit=1`, { headers, signal: AbortSignal.timeout(5_000) }),
          fetch(`${supabaseUrl}/rest/v1/buyer_personas?client_id=eq.${client_id}&select=persona_data&limit=1`, { headers, signal: AbortSignal.timeout(5_000) }),
          fetch(`${supabaseUrl}/rest/v1/shopify_products?client_id=eq.${client_id}&select=price&not.price=is.null&limit=100`, { headers, signal: AbortSignal.timeout(5_000) }),
        ]);

        const fin = finRes.ok ? ((await finRes.json() as any[])?.[0] || null) : null;
        const bp = bpRes.ok ? ((await bpRes.json() as any[])?.[0]?.persona_data || null) : null;
        const prices = shopRes.ok ? ((await shopRes.json() as any[]) || []).map((p: any) => Number(p.price)).filter((n: number) => n > 0) : [];
        const aovShopify = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : null;

        const marginPct = Number(fin?.default_margin_percentage || 0);
        const hasValidAov = !!(aovShopify && aovShopify > 0);
        const hasValidMargin = marginPct > 0;
        const hasValidUnitEconomics = hasValidAov && hasValidMargin;

        if (hasValidUnitEconomics) {
          // Fetch account metrics for context
          const metricsQuery = `SELECT metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'`;
          const metricsResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, metricsQuery);
          let acctSpend = 0, acctConv = 0;
          if (metricsResult.ok && metricsResult.data) {
            for (const row of metricsResult.data) {
              acctSpend += Number(row.metrics?.costMicros || 0);
              acctConv += Number(row.metrics?.conversions || 0);
            }
          }
          acctSpend = acctSpend / 1_000_000;

          const briefResponses = Array.isArray(bp?.raw_responses) ? bp.raw_responses.filter((r: any) => typeof r === 'string' && r.trim()).join('\n').slice(0, 2000) : '';

          const prompt = `Eres Steve, experto en presupuestos de Google Ads basado en UNIT ECONOMICS del cliente.
${userIntent ? `\n## OBJETIVO DE LA CAMPAÑA (palabras del usuario)\n${userIntent}\n` : ''}

## UNIT ECONOMICS
- Margen bruto por default: ${fin?.default_margin_percentage ?? 'no definido'}%
- Costo envío por orden: $${fin?.shipping_cost_per_order ?? 0}
- Comisión Shopify: ${fin?.shopify_commission_percentage ?? 0}%
- Comisión pasarela de pago: ${fin?.payment_gateway_commission ?? 0}%
- Costos fijos mensuales (Shopify + Klaviyo + otros): $${(fin?.shopify_plan_cost ?? 0) + (fin?.klaviyo_plan_cost ?? 0) + (fin?.other_fixed_costs ?? 0)}
- AOV promedio (calculado de Shopify products): ${aovShopify ? `$${aovShopify.toFixed(0)}` : 'no disponible — infiérelo del brief'}
- Fase del negocio: ${bp?.fase_negocio || 'no definida'}
- Presupuesto ads declarado en brief: ${bp?.presupuesto_ads || 'no declarado'}

## BRIEF DEL CLIENTE (17 respuestas Q0-Q16)
${briefResponses || 'sin brief disponible'}

## CUENTA ACTUAL
- Gasto Google Ads 30d: $${acctSpend.toFixed(0)}
- Conversiones 30d: ${acctConv}
- Canal nueva campaña: ${channel_type || 'PERFORMANCE_MAX'}
${themes?.length ? `- Temas: ${themes.join(', ')}` : ''}

## LÓGICA DE CÁLCULO (aplica esta regla de oro)
1. CAC_max = AOV × margen_bruto (punto de equilibrio — gastar más no es rentable)
2. CAC_target = CAC_max × 0.4 a 0.5 (para mantener rentabilidad razonable)
3. Conversiones_diarias_objetivo = (Presupuesto_mensual_brief / 30) / CAC_target
4. Budget_diario_recomendado = Conversiones_diarias_objetivo × CAC_target
5. Si no hay presupuesto declarado, usar la fase del negocio:
   - Inicial: $10k-30k CLP/día
   - Crecimiento: $50k-150k CLP/día
   - Escalamiento: $200k+ CLP/día
6. Low = 50% del recomendado. High = 200% del recomendado.

IMPORTANTE: si los unit economics son débiles (margen <10%, sin AOV), sé CONSERVADOR y recomienda menos presupuesto. Explícalo en el reasoning.

Responde SOLO en JSON válido, sin markdown:
{
  "low": {"daily_budget": N, "reasoning": "..."},
  "recommended": {"daily_budget": N, "reasoning": "..."},
  "high": {"daily_budget": N, "reasoning": "..."},
  "unit_economics_used": {
    "aov": N,
    "margin_pct": N,
    "cac_max": N,
    "cac_target": N,
    "daily_conversions_target": N
  }
}`;

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
            signal: AbortSignal.timeout(20_000),
          });

          if (aiRes.ok) {
            const aiJson = await aiRes.json() as any;
            let text = aiJson?.content?.[0]?.text || '{}';
            text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            try {
              const rec = JSON.parse(text);
              const recBudget = Number(rec.recommended?.daily_budget || 0);
              // Sanity check: budget must be positive and under a safety cap (100M CLP)
              if (recBudget > 0 && recBudget < 100_000_000) {
                return {
                  body: {
                    success: true,
                    source: 'unit_economics',
                    options: {
                      low: { daily_budget: Number(rec.low?.daily_budget || 0), reasoning: rec.low?.reasoning },
                      recommended: { daily_budget: recBudget, reasoning: rec.recommended?.reasoning },
                      high: { daily_budget: Number(rec.high?.daily_budget || 0), reasoning: rec.high?.reasoning },
                    },
                    unit_economics_used: rec.unit_economics_used || null,
                    account_context: { total_spend_30d: acctSpend, total_conversions_30d: acctConv },
                  },
                  status: 200,
                };
              }
              console.warn(`[manage-google-campaign] Unit-economics budget: invalid daily_budget=${recBudget}, falling back`);
            } catch {
              console.warn('[manage-google-campaign] Unit-economics budget: JSON parse failed, falling back');
            }
          } else {
            console.warn('[manage-google-campaign] Unit-economics budget AI call failed:', aiRes.status);
          }
        } else {
          console.log(`[manage-google-campaign] Insufficient unit economics for client ${client_id} (margin=${marginPct}, aov=${aovShopify}), falling back`);
        }
      } catch (err: any) {
        console.warn('[manage-google-campaign] Unit economics fetch failed, falling back:', err.message);
      }
    }
  }

  // Fallback: SmartCampaignSuggestService — only for SMART campaigns, not PMAX/Search/Shopping
  if (channel_type === 'SMART') try {
    const suggestUrl = `https://googleads.googleapis.com/v18/customers/${customerId}:suggestSmartCampaignBudgetOptions`;
    const suggestBody: Record<string, any> = {};

    // Build suggestion criteria from search themes
    if (themes?.length) {
      suggestBody.suggestionInfo = {
        keywordThemes: themes.slice(0, 10).map((t: string) => ({
          freeFormKeywordTheme: t.trim(),
        })),
      };
    }

    const response = await fetch(suggestUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(suggestBody),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const result = await response.json() as any;
      const low = result?.low;
      const recommended = result?.recommended;
      const high = result?.high;

      if (recommended) {
        return {
          body: {
            success: true,
            source: 'google_api',
            options: {
              low: {
                daily_budget: Number(low?.dailyAmountMicros || 0) / 1_000_000,
                estimated_clicks: low?.metrics?.minDailyClicks || 0,
                estimated_impressions: low?.metrics?.minDailyImpressions || 0,
              },
              recommended: {
                daily_budget: Number(recommended?.dailyAmountMicros || 0) / 1_000_000,
                estimated_clicks: recommended?.metrics?.minDailyClicks || 0,
                estimated_impressions: recommended?.metrics?.minDailyImpressions || 0,
              },
              high: {
                daily_budget: Number(high?.dailyAmountMicros || 0) / 1_000_000,
                estimated_clicks: high?.metrics?.minDailyClicks || 0,
                estimated_impressions: high?.metrics?.minDailyImpressions || 0,
              },
            },
          },
          status: 200,
        };
      }
    }
  } catch (err: any) {
    console.log(`[manage-google-campaign] Smart budget suggest failed (falling back to AI): ${err.message}`);
  }

  // Fallback: AI-based recommendation using account context
  const metricsQuery = `
    SELECT metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions,
           campaign.advertising_channel_type
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
  `;
  const metricsResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, metricsQuery);

  let totalSpend = 0;
  let totalConversions = 0;
  let totalClicks = 0;
  let campaignCount = 0;
  if (metricsResult.ok && metricsResult.data) {
    for (const row of metricsResult.data) {
      totalSpend += Number(row.metrics?.costMicros || 0);
      totalConversions += Number(row.metrics?.conversions || 0);
      totalClicks += Number(row.metrics?.clicks || 0);
      campaignCount++;
    }
  }
  totalSpend = totalSpend / 1_000_000;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { body: { error: 'ANTHROPIC_API_KEY not configured' }, status: 500 };
  }

  const prompt = `Eres experto en Google Ads.${userIntent ? `\nObjetivo de la campaña (usuario): ${userIntent}\n` : ''} Basado en:
- Gasto 30d: $${totalSpend.toFixed(0)}
- Conversiones 30d: ${totalConversions}
- Clics 30d: ${totalClicks}
- Campañas activas: ${campaignCount}
- Tipo campaña nueva: ${channel_type || 'PERFORMANCE_MAX'}
${themes?.length ? `- Temas: ${themes.join(', ')}` : ''}

Sugiere 3 opciones de presupuesto diario (bajo/recomendado/alto) en la moneda de la cuenta.
Responde SOLO JSON: {"low":{"daily_budget":N,"reasoning":"..."},"recommended":{"daily_budget":N,"reasoning":"..."},"high":{"daily_budget":N,"reasoning":"..."}}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const result = await response.json() as any;
    let text = result?.content?.[0]?.text || '{}';
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let recommendation: any;
    try {
      recommendation = JSON.parse(text);
    } catch {
      recommendation = { raw: text, parse_error: true };
    }

    return {
      body: {
        success: true,
        source: 'ai_analysis',
        options: {
          low: { daily_budget: recommendation.low?.daily_budget || 0, reasoning: recommendation.low?.reasoning },
          recommended: { daily_budget: recommendation.recommended?.daily_budget || 0, reasoning: recommendation.recommended?.reasoning },
          high: { daily_budget: recommendation.high?.daily_budget || 0, reasoning: recommendation.high?.reasoning },
        },
        account_context: { total_spend_30d: totalSpend, campaign_count: campaignCount },
      },
      status: 200,
    };
  } catch (err: any) {
    console.error('[manage-google-campaign] Budget recommendation error:', err);
    return { body: { error: 'Failed to generate budget recommendation', details: err.message }, status: 502 };
  }
}

// --- Helper: SSRF-safe host validator ---
// Blocks private IPs, loopback, link-local (metadata service), and internal TLDs.
function isPublicHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (!host) return false;
    // Reject IPv6 entirely (ambiguous, hard to validate cheaply)
    if (host.includes(':')) return false;
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    if (isIpv4) {
      const p = host.split('.').map(Number);
      if (p.some(n => n < 0 || n > 255)) return false;
      if (p[0] === 10) return false;                                    // 10.0.0.0/8 (RFC1918)
      if (p[0] === 127) return false;                                   // loopback
      if (p[0] === 0) return false;                                     // reserved
      if (p[0] === 169 && p[1] === 254) return false;                   // link-local (GCP/AWS metadata!)
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;       // RFC1918
      if (p[0] === 192 && p[1] === 168) return false;                   // RFC1918
      if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;      // CGNAT
      if (p[0] >= 224) return false;                                    // multicast + reserved
      return true;
    }
    if (host === 'localhost') return false;
    if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) return false;
    if (host.endsWith('.metadata.google.internal')) return false;
    if (!host.includes('.')) return false; // must be a proper hostname
    return true;
  } catch { return false; }
}

// --- Helper: Fetch real URLs from the client's website ---
// Used to ground sitelink suggestions in REAL site paths (no mulas/invented URLs)
async function fetchRealSiteUrls(baseUrl: string | null | undefined, maxUrls = 40): Promise<string[]> {
  if (!baseUrl || typeof baseUrl !== 'string') return [];
  let origin: string;
  try {
    const cleaned = baseUrl.trim();
    const parsed = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
    if (!isPublicHost(parsed.href)) {
      console.warn(`[fetchRealSiteUrls] Blocked non-public host: ${parsed.hostname}`);
      return [];
    }
    origin = parsed.origin;
  } catch {
    return [];
  }

  const SUFFICIENT = 20; // Early exit once we have enough ground-truth URLs
  const FETCH_HEADERS = { 'User-Agent': 'Steve-Ads/1.0 (+https://steve.cl)' };
  const found = new Set<string>();
  const isJunkExt = (u: string) => /\.(xml|jpg|jpeg|png|gif|svg|webp|ico|css|js|pdf|mp4|webm)(\?|$)/i.test(u);

  const safeFetch = async (url: string, timeoutMs: number): Promise<Response | null> => {
    if (!isPublicHost(url)) return null;
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
        headers: FETCH_HEADERS,
      });
      // Post-redirect host re-check (attacker could redirect to private IP)
      if (resp.url && !isPublicHost(resp.url)) {
        console.warn(`[fetchRealSiteUrls] Redirect to non-public host blocked: ${resp.url}`);
        return null;
      }
      return resp;
    } catch { return null; }
  };

  // Strategy 1: sitemap variants (Shopify, generic, WordPress)
  const sitemapCandidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap_products_1.xml`,
    `${origin}/sitemap_pages_1.xml`,
    `${origin}/sitemap_collections_1.xml`,
  ];
  for (const sm of sitemapCandidates) {
    if (found.size >= SUFFICIENT) break;
    const resp = await safeFetch(sm, 8_000);
    if (!resp?.ok) continue;
    const text = await resp.text();
    const locMatches = text.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi);
    for (const m of locMatches) {
      const u = m[1].trim();
      if (!u.startsWith(origin)) continue;
      if (isJunkExt(u)) continue;
      found.add(u);
      if (found.size >= maxUrls) break;
    }
  }

  // Strategy 2: robots.txt → look for Sitemap: directives (only if still short)
  if (found.size < 5) {
    const resp = await safeFetch(`${origin}/robots.txt`, 5_000);
    if (resp?.ok) {
      const text = await resp.text();
      const sitemapLines = Array.from(text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)).slice(0, 3);
      for (const m of sitemapLines) {
        if (found.size >= SUFFICIENT) break;
        const smResp = await safeFetch(m[1].trim(), 8_000);
        if (!smResp?.ok) continue;
        const smText = await smResp.text();
        const locs = smText.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi);
        for (const l of locs) {
          const u = l[1].trim();
          if (u.startsWith(origin) && !isJunkExt(u)) {
            found.add(u);
            if (found.size >= maxUrls) break;
          }
        }
      }
    }
  }

  // Strategy 3: scrape homepage for anchor hrefs
  if (found.size < 5) {
    const resp = await safeFetch(origin, 10_000);
    if (resp?.ok) {
      const html = await resp.text();
      const hrefMatches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
      for (const m of hrefMatches) {
        if (found.size >= maxUrls) break;
        let u = m[1].trim();
        if (u.startsWith('#') || u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('javascript:')) continue;
        if (u.startsWith('//')) continue;
        if (u.startsWith('/')) u = origin + u;
        if (!u.startsWith(origin)) continue;
        if (isJunkExt(u)) continue;
        u = u.split('#')[0];
        if (u.length > 0 && u !== origin + '/') found.add(u);
      }
    }
  }

  if (found.size > 0) found.add(origin);
  return Array.from(found).slice(0, maxUrls);
}

// --- Fase 5: AI Recommendations ---

async function handleGetRecommendations(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { recommendation_type, channel_type, client_id } = data;
  // user_intent (prompt libre del usuario) alimenta todos los recomendadores.
  // Se concatena con el context adicional que venga del front.
  const userIntent = typeof data.user_intent === 'string' ? data.user_intent.trim() : '';
  const extraContextRaw = typeof data.context === 'string' ? data.context : '';
  const extraContext = [
    userIntent ? `OBJETIVO DE LA CAMPAÑA (palabras del usuario): ${userIntent.slice(0, 800)}` : '',
    extraContextRaw.trim(),
  ].filter(Boolean).join('\n');

  if (!recommendation_type) {
    return { body: { error: 'Missing recommendation_type' }, status: 400 };
  }

  // Fetch brand brief from Supabase (if client_id provided)
  let briefContext = '';
  if (client_id) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
      try {
        // 1) Fetch buyer_personas — contains the actual brief Q&A responses
        const bpRes = await fetch(
          `${supabaseUrl}/rest/v1/buyer_personas?client_id=eq.${client_id}&select=persona_data&limit=1`,
          { headers, signal: AbortSignal.timeout(5_000) }
        );
        if (bpRes.ok) {
          const bpData = await bpRes.json() as any[];
          const pd = bpData?.[0]?.persona_data;
          if (pd) {
            // raw_responses = array of the 17 brief answers (Q0-Q16)
            if (Array.isArray(pd.raw_responses) && pd.raw_responses.length > 0) {
              briefContext += '## RESPUESTAS DEL BRIEF DEL CLIENTE\n';
              for (let i = 0; i < pd.raw_responses.length; i++) {
                const resp = pd.raw_responses[i];
                if (resp && typeof resp === 'string' && resp.trim()) {
                  briefContext += `${resp.trim()}\n`;
                }
              }
              briefContext += '\n';
            }
            if (pd.fase_negocio) briefContext += `Fase del negocio: ${pd.fase_negocio}\n`;
            if (pd.presupuesto_ads) briefContext += `Presupuesto ads: ${pd.presupuesto_ads}\n`;
          }
        }

        // 2) Fetch brand_research — google_ads_strategy has ad copies & keywords
        const brRes = await fetch(
          `${supabaseUrl}/rest/v1/brand_research?client_id=eq.${client_id}&select=research_type,research_data&research_type=in.(google_ads_strategy,competitive_analysis,keywords)&order=created_at.desc&limit=3`,
          { headers, signal: AbortSignal.timeout(5_000) }
        );
        if (brRes.ok) {
          const brData = await brRes.json() as any[];
          for (const row of brData) {
            const rd = row.research_data;
            if (!rd) continue;

            if (row.research_type === 'google_ads_strategy') {
              // Extract existing ad copies for tone/style reference
              if (Array.isArray(rd.ad_copies) && rd.ad_copies.length > 0) {
                briefContext += '\n## ESTRATEGIA GOOGLE ADS (referencia de tono)\n';
                const copy = rd.ad_copies[0];
                if (copy.headline1) briefContext += `Headline ejemplo: ${copy.headline1}\n`;
                if (copy.description1) briefContext += `Descripcion ejemplo: ${copy.description1}\n`;
              }
              if (rd.bidding_strategy) briefContext += `Estrategia de pujas sugerida: ${JSON.stringify(rd.bidding_strategy)}\n`;
            }

            if (row.research_type === 'competitive_analysis') {
              if (rd.strategic_insights) {
                briefContext += `\n## INSIGHTS COMPETITIVOS\n${typeof rd.strategic_insights === 'string' ? rd.strategic_insights : JSON.stringify(rd.strategic_insights).slice(0, 500)}\n`;
              }
            }

            if (row.research_type === 'keywords') {
              if (Array.isArray(rd.primary)) {
                briefContext += `\n## KEYWORDS PRINCIPALES\n${rd.primary.map((k: any) => typeof k === 'string' ? k : k.keyword || k.term || JSON.stringify(k)).slice(0, 15).join(', ')}\n`;
              }
            }
          }
        }

        if (briefContext) {
          console.log(`[manage-google-campaign] Loaded brief context for client ${client_id}: ${briefContext.length} chars`);
        } else {
          console.log(`[manage-google-campaign] No brief data found for client ${client_id}`);
        }
      } catch (err: any) {
        console.log(`[manage-google-campaign] Brief fetch failed (non-critical): ${err.message}`);
      }
    }
  }

  // Fetch account metrics for context
  const metricsQuery = `
    SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value,
           campaign.advertising_channel_type
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status = 'ENABLED'
  `;
  const metricsResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, metricsQuery);

  let totalSpend = 0;
  let totalConversions = 0;
  let totalConvValue = 0;
  let campaignCount = 0;
  const channelTypes = new Set<string>();

  if (metricsResult.ok && metricsResult.data) {
    for (const row of metricsResult.data) {
      totalSpend += Number(row.metrics?.costMicros || 0);
      totalConversions += Number(row.metrics?.conversions || 0);
      totalConvValue += Number(row.metrics?.conversionsValue || 0);
      if (row.campaign?.advertisingChannelType) {
        channelTypes.add(row.campaign.advertisingChannelType);
      }
      campaignCount++;
    }
  }

  totalSpend = totalSpend / 1_000_000;
  const avgRoas = totalSpend > 0 ? (totalConvValue / totalSpend).toFixed(2) : '0';

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { body: { error: 'ANTHROPIC_API_KEY not configured' }, status: 500 };
  }

  // For cta_sitelinks: fetch REAL site URLs so sitelinks are grounded (no mulas/invented)
  let realSiteUrls: string[] = [];
  if (recommendation_type === 'cta_sitelinks') {
    let websiteUrl: string | null = null;
    if (client_id) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseKey) {
        try {
          const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
          const res = await fetch(
            `${supabaseUrl}/rest/v1/clients?id=eq.${client_id}&select=website_url&limit=1`,
            { headers, signal: AbortSignal.timeout(5_000) }
          );
          if (res.ok) {
            const rows = await res.json() as any[];
            websiteUrl = rows?.[0]?.website_url || null;
          }
        } catch (err: any) {
          console.warn('[manage-google-campaign] website_url fetch failed:', err.message);
        }
      }
    }
    // Fallback: parse URL from extraContext ("URL: https://...")
    if (!websiteUrl && typeof extraContext === 'string') {
      const m = extraContext.match(/https?:\/\/[^\s,]+/i);
      if (m) websiteUrl = m[0];
    }
    realSiteUrls = await fetchRealSiteUrls(websiteUrl, 40);
    console.log(`[manage-google-campaign] Fetched ${realSiteUrls.length} real URLs from ${websiteUrl || 'n/a'}`);
  }

  let prompt = '';

  if (recommendation_type === 'campaign_setup') {
    prompt = `Eres un experto en Google Ads. Basado en:
- Gasto últimos 30 días: $${totalSpend.toFixed(0)}
- ROAS promedio: ${avgRoas}x
- Conversiones totales: ${totalConversions}
- Campañas activas: ${campaignCount} (${[...channelTypes].join(', ')})
${extraContext ? `- Contexto adicional: ${extraContext}` : ''}

Recomienda para una nueva campaña ${channel_type || 'SEARCH'}:
1. bid_strategy: uno de [MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, TARGET_CPA, TARGET_ROAS, MANUAL_CPC]
2. daily_budget: número (en la moneda de la cuenta)
3. networks: { search: bool, search_partners: bool, display: bool }
4. reasoning: explicación en 1 línea en español

Responde SOLO en JSON válido, sin markdown.`;
  } else if (recommendation_type === 'pmax_assets') {
    const hasBrief = briefContext.trim().length > 0;
    prompt = `Eres Steve, un experto en Google Ads Performance Max y copywriting publicitario.
${hasBrief ? `\n## BRIEF DEL CLIENTE (usa esta informacion como base OBLIGATORIA)\n${briefContext.slice(0, 3000)}` : ''}
${extraContext ? `\nContexto adicional: ${extraContext}` : ''}
${!hasBrief && !extraContext ? '\nNo hay brief disponible. Genera assets genéricos pero profesionales.' : ''}

Genera assets para un asset group PMAX. Los textos DEBEN:
- Reflejar la marca, propuesta de valor y tono del brief${hasBrief ? '' : ' (o del contexto dado)'}
- Incluir beneficios concretos y llamados a la accion
- Ser variados (no repetir la misma idea con distintas palabras)
- Respetar ESTRICTAMENTE los limites de caracteres

Genera:
1. headlines: array de 10 strings (MAXIMO 30 caracteres cada uno, ni uno mas)
2. long_headlines: array de 4 strings (MAXIMO 90 caracteres cada uno)
3. descriptions: array de 5 strings (MAXIMO 90 caracteres cada uno)
4. reasoning: explicacion breve en español de por que elegiste estos textos

IMPORTANTE: Cuenta los caracteres. Si un texto tiene 31+ chars en headline, es INVALIDO.

Responde SOLO en JSON valido, sin markdown.`;
  } else if (recommendation_type === 'bid_strategy') {
    prompt = `Eres un experto en Google Ads. Basado en:
- Gasto 30d: $${totalSpend.toFixed(0)}
- ROAS: ${avgRoas}x
- Conversiones: ${totalConversions}
${extraContext ? `- Contexto: ${extraContext}` : ''}

Recomienda el mejor bid strategy de [MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, TARGET_CPA, TARGET_ROAS, MANUAL_CPC].
Responde en JSON: { "bid_strategy": "...", "reasoning": "..." }`;
  } else if (recommendation_type === 'campaign_name') {
    const hasBrief = briefContext.trim().length > 0;
    prompt = `Eres Steve, un experto en Google Ads.
${hasBrief ? `\n## BRIEF DEL CLIENTE\n${briefContext.slice(0, 2000)}` : ''}
${extraContext ? `\nContexto adicional: ${extraContext}` : ''}

Genera un nombre descriptivo para una campaña Performance Max de Google Ads.
El nombre debe:
- Ser claro y profesional (ej: "PMAX - Nacuttus Alimento Natural")
- Incluir "PMAX" al inicio
- Reflejar la marca o producto principal del brief
- Máximo 80 caracteres

Responde SOLO en JSON válido: { "name": "...", "reasoning": "..." }`;
  } else if (recommendation_type === 'targeting') {
    const hasBrief = briefContext.trim().length > 0;
    prompt = `Eres Steve, un experto en Google Ads y segmentación.
${hasBrief ? `\n## BRIEF DEL CLIENTE\n${briefContext.slice(0, 2000)}` : ''}
${extraContext ? `\nContexto adicional: ${extraContext}` : ''}

Basado en el brief del cliente, recomienda la segmentación geográfica e idiomas.
Usa SOLO estos IDs válidos:
- Locations: 2152=Chile, 2032=Argentina, 2484=Mexico, 2170=Colombia, 2604=Peru, 2724=España, 2840=Estados Unidos, 2076=Brasil
- Languages: 1003=Español, 1000=Inglés, 1014=Portugués, 1002=Francés, 1001=Alemán

Responde SOLO en JSON válido:
{
  "locations": [{ "id": "2152", "name": "Chile" }],
  "languages": [{ "id": "1003", "name": "Español" }],
  "reasoning": "..."
}`;
  } else if (recommendation_type === 'product_selection') {
    const hasBrief = briefContext.trim().length > 0;
    const rawProducts = Array.isArray((data as any).products) ? (data as any).products : [];
    const products = rawProducts
      .filter((p: any) => p && (p.id || p.product_id) && p.title)
      .slice(0, 200); // cap to keep prompt manageable
    if (products.length === 0) {
      return { body: { error: 'No products provided', details: 'data.products debe ser un array con {id, title, price, category/product_type}' }, status: 400 };
    }
    // Group by product_type > category (fallback "Sin categoria")
    const groups = new Map<string, any[]>();
    for (const p of products) {
      const key = (p.product_type && String(p.product_type).trim()) || (p.category && String(p.category).trim()) || 'Sin categoría';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    const groupKeys = Array.from(groups.keys()).sort();
    const catalogBlock = groupKeys.map(k => {
      const items = groups.get(k)!;
      const head = `\n### Categoría: ${k} (${items.length} productos en total${items.length > 40 ? `, ver solo ${40} para no saturar` : ''})`;
      const lines = items.slice(0, 40).map((p: any, i: number) => {
        const id = String(p.id || p.product_id);
        const price = p.price ? ` - $${p.price}` : '';
        return `  ${i + 1}. [${id}] ${String(p.title).slice(0, 100)}${price}`;
      }).join('\n');
      const truncated = items.length > 40 ? `\n  ... (${items.length - 40} más productos ocultos en esta categoría — si seleccionás esta categoría, se incluyen todos los ${items.length})` : '';
      return `${head}\n${lines}${truncated}`;
    }).join('\n');

    prompt = `Eres Steve, experto en Google Ads Performance Max Shopping.
${hasBrief ? `\n## BRIEF DEL CLIENTE\n${briefContext.slice(0, 1500)}` : ''}
${extraContext ? `\n## CONTEXTO / USER INTENT\n${extraContext}` : ''}

## CATÁLOGO DEL MERCHANT CENTER (${products.length} productos agrupados por categoría)
${catalogBlock}

REGLA CLAVE:
- Si el OBJETIVO del usuario es AMPLIO ("quiero vender más", "hacer marca", "promoción general") → incluye productos de TODAS las categorías relevantes (selecciona los mejores 3-10 por categoría).
- Si el OBJETIVO es ESPECÍFICO ("solo perros", "producto X", "categoría Y") → selecciona SOLO los productos de esa(s) categoría(s) relevantes. Descarta las categorías que NO matchean.

NO selecciones todo el catálogo por defecto. Prioriza productos que:
- Alineen con la intención del usuario
- Estén probablemente en stock (status/availability si está disponible)
- Tengan título descriptivo (no genéricos tipo "Producto XYZ")
- Diversifica si el objetivo es amplio, concentrá si es específico

Rango típico: 5-40 productos (más si el usuario pide campaña amplia, menos si es nicho).

Responde SOLO en JSON valido, sin markdown. Los IDs deben ser EXACTAMENTE los que aparecen entre corchetes [...] arriba:
{
  "selected_product_ids": ["id_1", "id_2", ...],
  "selected_categories": ["Categoría 1", "Categoría 2"],
  "reasoning": "explicación breve: por qué estas categorías/productos y no los demás (1-2 líneas)"
}`;
  } else if (recommendation_type === 'audience_signals') {
    const hasBrief = briefContext.trim().length > 0;
    prompt = `Eres Steve, experto en Google Ads Performance Max.
${hasBrief ? `\n## BRIEF DEL CLIENTE\n${briefContext.slice(0, 2500)}` : ''}
${extraContext ? `\nContexto adicional: ${extraContext}` : ''}

Genera un "audience signal" para una campaña PMAX (señales demográficas para guiar al algoritmo — NO restricciones).

Devuelve SOLO enums válidos de Google Ads API v23:
- age_ranges: subset de [AGE_RANGE_18_24, AGE_RANGE_25_34, AGE_RANGE_35_44, AGE_RANGE_45_54, AGE_RANGE_55_64, AGE_RANGE_65_UP]
- genders: subset de [MALE, FEMALE, UNDETERMINED]
- parental_statuses: subset de [PARENT, NOT_A_PARENT, UNDETERMINED]
- income_ranges: subset de [INCOME_RANGE_0_50, INCOME_RANGE_50_60, INCOME_RANGE_60_70, INCOME_RANGE_70_80, INCOME_RANGE_80_90, INCOME_RANGE_90_UP, INCOME_RANGE_UNDETERMINED]

Incluye SOLO los segmentos realmente relevantes al buyer persona del brief (no incluyas todos para "jugar seguro"). Incluir todo dilige la senal. Si no estas seguro de income o parental, omite ese campo (devuelve [] o no lo incluyas).

Responde SOLO en JSON válido:
{
  "name": "nombre corto (max 50 chars) de la audiencia",
  "description": "por qué este perfil es el ideal (max 250 chars, español)",
  "age_ranges": ["AGE_RANGE_25_34", "AGE_RANGE_35_44"],
  "genders": ["FEMALE"],
  "parental_statuses": ["PARENT"],
  "income_ranges": ["INCOME_RANGE_50_60", "INCOME_RANGE_60_70"],
  "reasoning": "breve"
}`;
  } else if (recommendation_type === 'search_themes') {
    const hasBrief = briefContext.trim().length > 0;
    prompt = `Eres Steve, un experto en Google Ads Performance Max.
${hasBrief ? `\n## BRIEF DEL CLIENTE\n${briefContext.slice(0, 2500)}` : ''}
${extraContext ? `\nContexto adicional: ${extraContext}` : ''}

Genera 15-20 "search themes" (audience signals) para una campaña PMAX. Son temas/términos que describen lo que el público ideal busca en Google. Deben ser:
- Específicos y orientados a intención de compra (NO genéricos como "comprar cosas")
- Mezcla de: categoría de producto, problema que resuelve, ocasión de uso, marca/competidores, keywords transaccionales
- 2 a 5 palabras cada uno
- En español (idioma del brief)
- Sin duplicar ideas

## POLICY DE GOOGLE ADS — EVITA ESTRICTAMENTE:
- Enfermedades/condiciones médicas específicas ("diabetes canina", "ansiedad perro", "cáncer") → usa alternativas genéricas ("cuidado de salud", "bienestar animal")
- Afirmaciones de resultados garantizados ("cura", "solución definitiva", "100% efectivo")
- Contenido para adultos, drogas, alcohol, armas, apuestas
- Términos políticos, religiosos o de orientación sexual
- Marcas competidoras directas registradas (usar categoría en vez de marca)
- Afirmaciones no verificables ("el mejor del mundo", "aprobado por médicos" sin respaldo)
- Contenido sensible: violencia, accidentes, tragedias

Prioriza términos neutros y enfocados en beneficio al cliente.

Responde SOLO en JSON válido:
{
  "search_themes": ["tema 1", "tema 2", ...],
  "reasoning": "breve explicación en español"
}`;
  } else if (recommendation_type === 'cta_sitelinks') {
    const hasBrief = briefContext.trim().length > 0;
    const hasRealUrls = realSiteUrls.length > 0;
    const urlsBlock = hasRealUrls
      ? `\n## URLs REALES DEL SITIO DEL CLIENTE (${realSiteUrls.length} encontradas)\nDEBES elegir sitelinks SOLO de esta lista. PROHIBIDO inventar o modificar URLs:\n${realSiteUrls.map(u => `- ${u}`).join('\n')}\n`
      : '\n## SIN URLs VERIFICADAS\nNo se pudieron obtener URLs reales del sitio. Genera SOLO el call_to_action. Devuelve "sitelinks": [] (array vacío).\n';

    prompt = `Eres Steve, un experto en Google Ads Performance Max.
${hasBrief ? `\n## BRIEF DEL CLIENTE\n${briefContext.slice(0, 2000)}` : ''}
${extraContext ? `\nContexto adicional: ${extraContext}` : ''}
${urlsBlock}
Genera recomendaciones de Call to Action y Sitelinks para una campaña PMAX.

CTAs válidos: LEARN_MORE, SHOP_NOW, SIGN_UP, SUBSCRIBE, GET_QUOTE, CONTACT_US, BOOK_NOW, APPLY_NOW

${hasRealUrls ? `Para sitelinks genera hasta 4 links relevantes eligiendo URLs de la lista de arriba. Cada sitelink tiene:
- text: máximo 25 caracteres, descriptivo de la página
- url: EXACTAMENTE una URL de la lista — copiar sin modificar
- description1: máximo 35 caracteres
- description2: máximo 35 caracteres

REGLA ABSOLUTA: cada "url" debe aparecer textualmente en la lista de URLs reales. Si inventas una URL o la modificas, el sistema la descartará.` : 'Devuelve "sitelinks": [] (no hay URLs verificadas).'}

Responde SOLO en JSON válido:
{
  "call_to_action": "SHOP_NOW",
  "sitelinks": [
    ${hasRealUrls ? `{ "text": "Ver Productos", "url": "${realSiteUrls[0] || 'https://ejemplo.com/productos'}", "description1": "Explora nuestro catálogo", "description2": "Envío gratis sobre $30.000" }` : ''}
  ],
  "reasoning": "..."
}`;
  } else {
    return { body: { error: `Unknown recommendation_type: ${recommendation_type}` }, status: 400 };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const result = await response.json() as any;
    let text = result?.content?.[0]?.text || '{}';

    // Strip markdown code fences (```json ... ```)
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

    let recommendation: any;
    try {
      recommendation = JSON.parse(text);
    } catch {
      recommendation = { raw: text, parse_error: true };
    }

    // Post-validation for product_selection: drop any IDs not in the original catalog (anti-mulas)
    if (recommendation_type === 'product_selection' && !recommendation.parse_error) {
      const rawProducts = Array.isArray((data as any).products) ? (data as any).products : [];
      const validIds = new Set(rawProducts.map((p: any) => String(p.id || p.product_id || '')));
      const aiIds: string[] = Array.isArray(recommendation.selected_product_ids) ? recommendation.selected_product_ids : [];
      const validated = aiIds.map(String).filter(id => validIds.has(id));
      const droppedCount = aiIds.length - validated.length;
      if (droppedCount > 0) {
        console.warn(`[manage-google-campaign] product_selection: dropped ${droppedCount} invented/invalid product IDs`);
      }
      recommendation.selected_product_ids = validated;
      recommendation.catalog_size = rawProducts.length;
      recommendation.ids_dropped = droppedCount;
    }

    // Post-validation for cta_sitelinks: drop any sitelink whose url is not in the real list
    if (recommendation_type === 'cta_sitelinks' && !recommendation.parse_error) {
      const realSet = new Set(realSiteUrls);
      const original = Array.isArray(recommendation.sitelinks) ? recommendation.sitelinks : [];
      const validated = original.filter((sl: any) => {
        if (!sl || typeof sl.url !== 'string') return false;
        return realSet.has(sl.url.trim());
      });
      const droppedCount = original.length - validated.length;
      if (droppedCount > 0) {
        console.warn(`[manage-google-campaign] cta_sitelinks: dropped ${droppedCount} sitelink(s) with invented/invalid URLs`);
      }
      recommendation.sitelinks = validated;
      recommendation.real_urls_available = realSiteUrls.length;
      recommendation.sitelinks_dropped = droppedCount;
    }

    return {
      body: {
        success: true,
        recommendation_type,
        recommendation,
        account_context: { total_spend_30d: totalSpend, avg_roas: avgRoas, campaign_count: campaignCount },
      },
      status: 200,
    };
  } catch (err: any) {
    console.error('[manage-google-campaign] AI recommendation error:', err);
    return { body: { error: 'Failed to generate recommendation', details: err.message }, status: 502 };
  }
}

// UUID validator to prevent PostgREST operator injection in eq.${value} interpolation
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parse image dimensions (width/height) from base64-encoded PNG/JPG/WebP without external deps.
function parseImageDimensions(base64: string): { width: number; height: number } | null {
  try {
    const buf = Buffer.from(base64, 'base64');
    // PNG: 8-byte signature + IHDR chunk
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: 0xFFD8 SOI, scan for SOF0-SOF15 (except C4/C8/CC)
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xFF) return null;
        const marker = buf[i + 1];
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        const segLen = buf.readUInt16BE(i + 2);
        i += 2 + segLen;
      }
    }
    // WebP: RIFF....WEBPVP8X/VP8 /VP8L
    if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunkType = buf.toString('ascii', 12, 16);
      if (chunkType === 'VP8X') {
        const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
        const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
        return { width: w, height: h };
      }
      if (chunkType === 'VP8 ' && buf.length >= 30) {
        return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF };
      }
      if (chunkType === 'VP8L' && buf.length >= 25 && buf[20] === 0x2F) {
        const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
        const w = (((b2 & 0x3F) << 8) | b1) + 1;
        const h = (((b4 & 0x0F) << 10) | (b3 << 2) | ((b2 & 0xC0) >> 6)) + 1;
        return { width: w, height: h };
      }
    }
    return null;
  } catch { return null; }
}

// Aspect ratio + min size requirements per PMAX field_type (Google Ads API v23).
const PMAX_IMAGE_SPECS: Record<string, { targetRatio: number; tolerance: number; minW: number; minH: number; label: string }> = {
  MARKETING_IMAGE:          { targetRatio: 1.91, tolerance: 0.08, minW: 600, minH: 314, label: 'Landscape 1.91:1' },
  SQUARE_MARKETING_IMAGE:   { targetRatio: 1.0,  tolerance: 0.05, minW: 300, minH: 300, label: 'Cuadrada 1:1' },
  PORTRAIT_MARKETING_IMAGE: { targetRatio: 0.8,  tolerance: 0.05, minW: 480, minH: 600, label: 'Vertical 4:5' },
  LOGO:                     { targetRatio: 1.0,  tolerance: 0.05, minW: 128, minH: 128, label: 'Logo 1:1' },
  LANDSCAPE_LOGO:           { targetRatio: 4.0,  tolerance: 0.2,  minW: 512, minH: 128, label: 'Logo landscape 4:1' },
};

// --- List catalog products directly from Merchant Center via Google Ads API `shopping_product` ---
// Fallback a shopify_products si el MC no tiene productos o falla la query.
async function handleListCatalogProducts(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  clientId: string,
  merchantCenterId?: string
): Promise<{ body: any; status: number }> {
  const normalize = (p: any) => ({
    id: String(p.id || p.item_id || p.product_id || ''),
    title: p.title || '',
    image_url: p.image_url || null,
    price: p.price ?? null,
    availability: p.availability || null,
    status: p.status || null,
    category: p.category || null,        // breadcrumb "Level1 > Level2 > Level3"
    product_type: p.product_type || null, // merchant-defined taxonomy
  });

  // 1) Primary path: Google Ads API `shopping_product` resource (REAL MC catalog)
  // Require merchantCenterId (numeric) to evitar cross-MC mixing cuando un customer tiene varios MCs linkeados.
  const mcIdSafe = (typeof merchantCenterId === 'string' || typeof merchantCenterId === 'number')
    && /^\d+$/.test(String(merchantCenterId).trim())
    ? String(merchantCenterId).trim()
    : null;
  if (mcIdSafe) try {
    const gaql = `
      SELECT shopping_product.merchant_center_id, shopping_product.item_id,
             shopping_product.title, shopping_product.image_link,
             shopping_product.price_micros, shopping_product.currency_code,
             shopping_product.availability, shopping_product.status,
             shopping_product.product_type_level1, shopping_product.product_type_level2,
             shopping_product.product_type_level3,
             shopping_product.category_level1, shopping_product.category_level2,
             shopping_product.category_level3
      FROM shopping_product
      WHERE shopping_product.merchant_center_id = ${mcIdSafe}
      LIMIT 500
    `;
    const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, gaql);
    if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
      const seen = new Set<string>();
      const products: any[] = [];
      for (const row of result.data) {
        const sp = row.shoppingProduct || row.shopping_product || {};
        const id = String(sp.itemId || sp.item_id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const priceMicros = Number(sp.priceMicros || sp.price_micros || 0);
        const price = priceMicros > 0 ? priceMicros / 1_000_000 : null;
        const pt = [sp.productTypeLevel1, sp.productTypeLevel2, sp.productTypeLevel3].filter(Boolean);
        const cat = [sp.categoryLevel1, sp.categoryLevel2, sp.categoryLevel3].filter(Boolean);
        products.push(normalize({
          id,
          title: sp.title,
          image_url: sp.imageLink || sp.image_link,
          price,
          availability: sp.availability,
          status: sp.status,
          product_type: pt.length ? pt.join(' > ') : null,
          category: cat.length ? cat.join(' > ') : null,
        }));
      }
      if (products.length > 0) {
        return { body: { success: true, products, source: 'merchant_center', count: products.length, merchant_center_id: mcIdSafe }, status: 200 };
      }
    } else if (!result.ok) {
      console.warn('[manage-google-campaign] shopping_product GAQL not ok, will fall back:', (result as any)?.error?.details || (result as any)?.error);
    }
  } catch (err: any) {
    console.warn('[manage-google-campaign] shopping_product GAQL failed, falling back:', err?.message);
  } else {
    console.log('[manage-google-campaign] list_catalog_products: no valid merchant_center_id provided, skipping MC path');
  }

  // 2) Fallback: Shopify DB (si MC está vacío o la query falla)
  if (!clientId || !UUID_RX.test(clientId.trim())) {
    return { body: { success: true, products: [], source: 'none', reason: 'no MC products, no valid client_id' }, status: 200 };
  }
  const cid = clientId.trim();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { body: { success: true, products: [], source: 'none', reason: 'Supabase not configured' }, status: 200 };
  }
  try {
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
    const res = await fetch(
      `${supabaseUrl}/rest/v1/shopify_products?client_id=eq.${cid}&select=id,product_id,title,image_url,price,handle,sku,status,product_type&order=created_at.desc&limit=200`,
      { headers, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return { body: { success: true, products: [], source: 'none', reason: 'shopify fetch failed' }, status: 200 };
    const rows = await res.json() as any[];
    const seen = new Set<string>();
    const products: any[] = [];
    for (const r of rows) {
      const id = String(r.product_id || r.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      products.push(normalize({
        id,
        title: r.title,
        image_url: r.image_url,
        price: r.price,
        status: r.status,
        product_type: r.product_type || null,
        category: null,
      }));
    }
    return { body: { success: true, products, source: 'shopify_db', count: products.length }, status: 200 };
  } catch (err: any) {
    return { body: { success: true, products: [], source: 'none', reason: err.message }, status: 200 };
  }
}

// --- List existing Google Ads IMAGE assets (for brand-consistent image generation) ---
async function handleListImageAssets(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  limit: number = 10
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT asset.resource_name, asset.id, asset.name, asset.image_asset.full_size.url,
           asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels,
           asset.image_asset.file_size
    FROM asset
    WHERE asset.type = 'IMAGE'
    LIMIT ${Math.min(Math.max(limit, 1), 50)}
  `;
  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) {
    return { body: { error: 'Failed to list image assets', details: result.error }, status: 502 };
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  const assets = rows
    .map((r: any) => ({
      id: r.asset?.id || null,
      name: r.asset?.name || null,
      url: r.asset?.imageAsset?.fullSize?.url || null,
      width: r.asset?.imageAsset?.fullSize?.widthPixels || null,
      height: r.asset?.imageAsset?.fullSize?.heightPixels || null,
    }))
    .filter((a: any) => !!a.url);
  return { body: { success: true, assets, count: assets.length }, status: 200 };
}

// --- Main handler ---

type AllActions = Action
  | 'check_write_access'
  | 'get_settings' | 'update_settings'
  | 'list_ad_groups' | 'create_ad_group' | 'update_ad_group' | 'pause_ad_group' | 'enable_ad_group'
  | 'create_campaign'
  | 'get_recommendations'
  | 'list_merchant_centers'
  | 'get_budget_recommendation'
  | 'list_image_assets'
  | 'list_catalog_products';

export async function manageGoogleCampaign(c: Context) {
  try {
    const body = await c.req.json() as {
      action: AllActions;
      connection_id: string;
      campaign_id?: string;
      ad_group_id?: string;
      data?: Record<string, any>;
    };

    const { action, connection_id, campaign_id, ad_group_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: AllActions[] = [
      'pause', 'resume', 'update_budget', 'list_details',
      'check_write_access',
      'get_settings', 'update_settings',
      'list_ad_groups', 'create_ad_group', 'update_ad_group', 'pause_ad_group', 'enable_ad_group',
      'create_campaign',
      'get_recommendations',
      'list_merchant_centers',
      'get_budget_recommendation',
      'list_image_assets',
      'list_catalog_products',
    ];

    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    // Actions that require campaign_id
    const needsCampaignId: AllActions[] = [
      'pause', 'resume', 'update_budget',
      'get_settings', 'update_settings',
      'list_ad_groups', 'create_ad_group',
    ];
    if (needsCampaignId.includes(action) && !campaign_id) {
      return c.json({ error: `Missing campaign_id for action "${action}"` }, 400);
    }

    // Actions that require ad_group_id
    const needsAdGroupId: AllActions[] = ['update_ad_group', 'pause_ad_group', 'enable_ad_group'];
    if (needsAdGroupId.includes(action) && !ad_group_id) {
      return c.json({ error: `Missing ad_group_id for action "${action}"` }, 400);
    }

    console.log(`[manage-google-campaign] Action: ${action}, Connection: ${connection_id}`);

    // Resolve connection + token
    const resolved = await resolveConnectionAndToken(c, connection_id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status as any);
    }
    const { ctx } = resolved;

    // Detect currency for budget-related actions
    const needsCurrency: AllActions[] = ['list_details', 'update_budget', 'create_campaign'];
    const accountCurrency = needsCurrency.includes(action)
      ? await fetchGoogleAccountCurrency(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId)
      : 'USD';

    // Route to handler
    let result: { body: any; status: number };

    switch (action) {
      case 'pause':
        result = await handlePause(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'resume':
        result = await handleResume(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'update_budget':
        result = await handleUpdateBudget(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'list_details':
        result = await handleListDetails(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, accountCurrency);
        break;
      case 'check_write_access':
        result = await handleCheckWriteAccess(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'get_settings':
        result = await handleGetSettings(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'update_settings':
        result = await handleUpdateSettings(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'list_ad_groups':
        result = await handleListAdGroups(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'create_ad_group':
        result = await handleCreateAdGroup(ctx.customerId, campaign_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'update_ad_group':
        result = await handleUpdateAdGroup(ctx.customerId, ad_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'pause_ad_group':
        result = await handlePauseAdGroup(ctx.customerId, ad_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'enable_ad_group':
        result = await handleEnableAdGroup(ctx.customerId, ad_group_id!, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'create_campaign':
        result = await handleCreateCampaign(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, { ...(data || {}), client_id: ctx.clientId });
        break;
      case 'get_recommendations':
        result = await handleGetRecommendations(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, { ...(data || {}), client_id: ctx.clientId });
        break;
      case 'list_merchant_centers':
        result = await handleListMerchantCenters(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId);
        break;
      case 'get_budget_recommendation':
        result = await handleGetBudgetRecommendation(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, { ...(data || {}), client_id: ctx.clientId });
        break;
      case 'list_image_assets':
        result = await handleListImageAssets(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, (data as any)?.limit || 10);
        break;
      case 'list_catalog_products':
        result = await handleListCatalogProducts(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, ctx.clientId, (data as any)?.merchant_center_id);
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-campaign] Error:', error);
    return c.json({ error: 'Internal server error', details: error.message }, 500);
  }
}
