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
    start_date, ad_group_name, ad_group_cpc_bid_micros,
    // PMAX-specific
    final_urls, business_name, headlines, descriptions, long_headlines,
    // Shopping-specific
    merchant_center_id,
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

  // Format start date (YYYY-MM-DD for Google Ads API v23+)
  const formattedStartDate = start_date
    ? `${start_date.slice(0, 4)}-${start_date.slice(4, 6)}-${start_date.slice(6, 8)}`
    : null;

  const mutateOps: any[] = [];

  // 1. Budget (temp ID -1)
  mutateOps.push({
    campaignBudgetOperation: {
      create: {
        resourceName: `customers/${customerId}/campaignBudgets/-1`,
        name: `Budget - ${name}`,
        amountMicros,
        deliveryMethod: 'STANDARD',
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
    geoTargetTypeSetting: {
      positiveGeoTargetType: 'PRESENCE_OR_INTEREST',
    },
  };

  // Start date (only if explicitly set)
  if (formattedStartDate) {
    campaignCreate.startDate = formattedStartDate;
  }

  // Network settings for Search campaigns
  if (channelType === 'SEARCH') {
    campaignCreate.networkSettings = {
      targetGoogleSearch: target_google_search !== false,
      targetSearchNetwork: target_search_network !== false,
      targetContentNetwork: target_content_network === true,
    };
  }

  // Shopping-specific
  if (channelType === 'SHOPPING') {
    if (!merchant_center_id) {
      return { body: { error: 'merchant_center_id is required for Shopping campaigns' }, status: 400 };
    }
    campaignCreate.shoppingSetting = {
      merchantId: String(merchant_center_id),
    };
  }

  mutateOps.push({ campaignOperation: { create: campaignCreate } });

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
    campaignCreate.biddingStrategyType = bidStrategy || 'MAXIMIZE_CONVERSION_VALUE';

    if (!final_urls?.length) {
      return { body: { error: 'final_urls required for PMAX campaigns' }, status: 400 };
    }

    // Asset Group (temp ID -3)
    mutateOps.push({
      assetGroupOperation: {
        create: {
          resourceName: `customers/${customerId}/assetGroups/-3`,
          campaign: `customers/${customerId}/campaigns/-2`,
          name: ad_group_name || 'Asset Group 1',
          finalUrls: final_urls,
          status: 'ENABLED',
        },
      },
    });

    // Create text assets and link them
    let tempId = -4;

    // Headlines
    if (headlines?.length) {
      for (const hl of headlines.slice(0, 15)) {
        const assetTempId = tempId--;
        mutateOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              type: 'TEXT',
              textAsset: { text: hl },
            },
          },
        });
        mutateOps.push({
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
      for (const desc of descriptions.slice(0, 4)) {
        const assetTempId = tempId--;
        mutateOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              type: 'TEXT',
              textAsset: { text: desc },
            },
          },
        });
        mutateOps.push({
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
        const assetTempId = tempId--;
        mutateOps.push({
          assetOperation: {
            create: {
              resourceName: `customers/${customerId}/assets/${assetTempId}`,
              type: 'TEXT',
              textAsset: { text: lh },
            },
          },
        });
        mutateOps.push({
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
      mutateOps.push({
        assetOperation: {
          create: {
            resourceName: `customers/${customerId}/assets/${assetTempId}`,
            type: 'TEXT',
            textAsset: { text: business_name },
          },
        },
      });
      mutateOps.push({
        assetGroupAssetOperation: {
          create: {
            asset: `customers/${customerId}/assets/${assetTempId}`,
            assetGroup: `customers/${customerId}/assetGroups/-3`,
            fieldType: 'BUSINESS_NAME',
          },
        },
      });
    }
  }

  console.log(`[manage-google-campaign] Creating ${channelType} campaign "${name}" with ${mutateOps.length} operations`);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutateOps);

  if (!result.ok) {
    return { body: { error: 'Failed to create campaign', details: result.error }, status: 502 };
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

// --- Fase 5: AI Recommendations ---

async function handleGetRecommendations(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { recommendation_type, channel_type, context: extraContext } = data;

  if (!recommendation_type) {
    return { body: { error: 'Missing recommendation_type' }, status: 400 };
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
    prompt = `Eres un experto en Google Ads Performance Max. Genera assets para un asset group PMAX.
${extraContext ? `Contexto del negocio: ${extraContext}` : 'Negocio genérico'}

Genera:
1. headlines: array de 5 strings (max 30 chars cada uno)
2. long_headlines: array de 2 strings (max 90 chars)
3. descriptions: array de 3 strings (max 90 chars)
4. reasoning: explicación breve en español

Responde SOLO en JSON válido, sin markdown.`;
  } else if (recommendation_type === 'bid_strategy') {
    prompt = `Eres un experto en Google Ads. Basado en:
- Gasto 30d: $${totalSpend.toFixed(0)}
- ROAS: ${avgRoas}x
- Conversiones: ${totalConversions}
${extraContext ? `- Contexto: ${extraContext}` : ''}

Recomienda el mejor bid strategy de [MAXIMIZE_CONVERSIONS, MAXIMIZE_CLICKS, TARGET_CPA, TARGET_ROAS, MANUAL_CPC].
Responde en JSON: { "bid_strategy": "...", "reasoning": "..." }`;
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

// --- Main handler ---

type AllActions = Action
  | 'check_write_access'
  | 'get_settings' | 'update_settings'
  | 'list_ad_groups' | 'create_ad_group' | 'update_ad_group' | 'pause_ad_group' | 'enable_ad_group'
  | 'create_campaign'
  | 'get_recommendations';

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
        result = await handleCreateCampaign(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
        break;
      case 'get_recommendations':
        result = await handleGetRecommendations(ctx.customerId, ctx.accessToken, ctx.developerToken, ctx.loginCustomerId, data || {});
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
