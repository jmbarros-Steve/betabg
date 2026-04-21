import { Context } from 'hono';
import { googleAdsQuery, googleAdsMutate, resolveConnectionAndToken } from '../../lib/google-ads-api.js';

/**
 * manage-google-shopping.ts
 *
 * Módulo Shopping (Standard Shopping campaigns) — Google Ads API v23.
 *
 * Particularidades Shopping vs Search/PMAX:
 *  - NO tiene keywords: tiene "product groups" (listing_group) que son subdivisiones del feed
 *    del Merchant Center.
 *  - Los ads son auto-generados del feed — ShoppingProductAd es un mensaje vacío `{}`.
 *  - Cuando creás un ad group `SHOPPING_PRODUCT_ADS`, Google auto-crea un UNIT root
 *    "All products" catch-all. Para subdividir por brand/product_type/etc hay que
 *    convertirlo en SUBDIVISION (remove el UNIT + create nuevo SUBDIVISION + children).
 *  - v23 NO permite referenciar temp IDs de criterion en el mismo mutate — hacemos 2
 *    mutates seriales: primero SUBDIVISION, después children con el resource_name real.
 *  - Merchant Center es obligatorio: `shopping_setting.merchant_id`. `feed_label`
 *    reemplazó `sales_country` desde v15+.
 *  - Smart Shopping está deprecated (Google lo migró a Performance Max).
 */

type Action =
  | 'list_shopping_campaigns'
  | 'create_shopping_campaign'
  | 'list_shopping_ad_groups'
  | 'list_shopping_products'
  | 'list_product_groups'
  | 'update_product_group_bid'
  | 'add_product_group_subdivision'
  | 'add_negative_product_group'
  | 'remove_product_group'
  | 'list_shopping_metrics_by_dimension'
  | 'suggest_shopping_structure';

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  ad_group_id?: string;
  data?: Record<string, any>;
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Helpers ---

function validateNumericId(value: string | undefined | null): boolean {
  return !value || (/^\d+$/.test(String(value)) && String(value).length <= 20);
}

/**
 * Valida una dimensión de product group. Retorna el caseValue v23 correcto o
 * `null` si la dimensión/valor no es válido.
 *
 * v23 supported dimensions:
 *  - productBrand: { value: string }
 *  - productType: { level: "LEVEL1..LEVEL5", value: string }
 *  - productCondition: { condition: "NEW" | "USED" | "REFURBISHED" }
 *  - productChannel: { channel: "ONLINE" | "LOCAL" }
 *  - productCustomAttribute: { index: "INDEX0..INDEX4", value: string }
 *  - productItemId: { value: string }
 *  - productBiddingCategory: { id: int64, level: "LEVEL1..LEVEL5" }  ← taxonomía Google
 */
function buildListingDimensionCaseValue(
  dimension: string,
  value: string | number | null,
  extra?: { level?: string; index?: string }
): Record<string, any> | null {
  if (!dimension) return null;
  const dim = String(dimension).toLowerCase();

  switch (dim) {
    case 'brand':
    case 'product_brand':
      return value ? { productBrand: { value: String(value) } } : null;

    case 'product_type': {
      const level = extra?.level || 'LEVEL1';
      if (!['LEVEL1', 'LEVEL2', 'LEVEL3', 'LEVEL4', 'LEVEL5'].includes(level)) return null;
      return value ? { productType: { level, value: String(value) } } : null;
    }

    case 'condition':
    case 'product_condition': {
      const cond = String(value || '').toUpperCase();
      if (!['NEW', 'USED', 'REFURBISHED'].includes(cond)) return null;
      return { productCondition: { condition: cond } };
    }

    case 'channel':
    case 'product_channel': {
      const ch = String(value || '').toUpperCase();
      if (!['ONLINE', 'LOCAL'].includes(ch)) return null;
      return { productChannel: { channel: ch } };
    }

    case 'custom_attribute':
    case 'product_custom_attribute': {
      const index = extra?.index || 'INDEX0';
      if (!['INDEX0', 'INDEX1', 'INDEX2', 'INDEX3', 'INDEX4'].includes(index)) return null;
      return value ? { productCustomAttribute: { index, value: String(value) } } : null;
    }

    case 'item_id':
    case 'product_item_id':
      return value ? { productItemId: { value: String(value) } } : null;

    case 'bidding_category':
    case 'product_bidding_category': {
      const level = extra?.level || 'LEVEL1';
      if (!['LEVEL1', 'LEVEL2', 'LEVEL3', 'LEVEL4', 'LEVEL5'].includes(level)) return null;
      return value ? { productBiddingCategory: { id: String(value), level } } : null;
    }

    default:
      return null;
  }
}

// --- Handlers ---

/**
 * List Shopping campaigns con métricas 30d.
 * Partnership con Campaign Manager (Search tiene handleListDetails) — acá filtramos
 * por advertising_channel_type = 'SHOPPING'.
 */
async function handleListShoppingCampaigns(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const gaql = `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type,
           campaign.shopping_setting.merchant_id,
           campaign.shopping_setting.feed_label,
           campaign.shopping_setting.enable_local_inventory_ads,
           campaign.campaign_priority,
           campaign.bidding_strategy_type,
           campaign_budget.amount_micros,
           metrics.clicks, metrics.impressions, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value, metrics.ctr
    FROM campaign
    WHERE campaign.advertising_channel_type = 'SHOPPING'
      AND campaign.status != 'REMOVED'
      AND segments.date DURING LAST_30_DAYS
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, gaql);
  if (!result.ok) {
    return { body: { error: 'Failed to fetch shopping campaigns', details: result.error }, status: 502 };
  }

  // Aggregar por campaign.id (segments.date genera 1 row por día)
  const campMap = new Map<string, any>();
  for (const row of result.data || []) {
    const id = String(row.campaign?.id);
    if (!campMap.has(id)) {
      campMap.set(id, {
        id,
        name: row.campaign?.name,
        status: row.campaign?.status,
        merchant_id: row.campaign?.shoppingSetting?.merchantId || null,
        feed_label: row.campaign?.shoppingSetting?.feedLabel || null,
        enable_local_inventory_ads: !!row.campaign?.shoppingSetting?.enableLocalInventoryAds,
        campaign_priority: Number(row.campaign?.campaignPriority || 0),
        bidding_strategy_type: row.campaign?.biddingStrategyType,
        budget_micros: Number(row.campaignBudget?.amountMicros || 0),
        clicks: 0, impressions: 0, cost_micros: 0,
        conversions: 0, conversions_value: 0,
      });
    }
    const c = campMap.get(id)!;
    c.clicks += Number(row.metrics?.clicks || 0);
    c.impressions += Number(row.metrics?.impressions || 0);
    c.cost_micros += Number(row.metrics?.costMicros || 0);
    c.conversions += Number(row.metrics?.conversions || 0);
    c.conversions_value += Number(row.metrics?.conversionsValue || 0);
  }

  const campaigns = Array.from(campMap.values()).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    roas: c.cost_micros > 0 ? (c.conversions_value * 1_000_000) / c.cost_micros : 0,
    budget: c.budget_micros / 1_000_000,
  }));

  campaigns.sort((a, b) => b.cost_micros - a.cost_micros);

  return { body: { success: true, campaigns }, status: 200 };
}

/**
 * Create Shopping campaign. Flow:
 *   Mutate 1 (batch): budget + campaign + ad group + shopping product ad
 *   Google auto-crea el UNIT root "All products" al crear el ad group SHOPPING_PRODUCT_ADS.
 *   El user después usa add_product_group_subdivision para crear el tree.
 */
async function handleCreateShoppingCampaign(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const {
    name,
    daily_budget,
    merchant_center_id,
    feed_label,
    enable_local_inventory_ads,
    campaign_priority,
    bid_strategy,
    target_roas,
    target_cpa_micros,
    enhanced_cpc,
    ad_group_name,
    ad_group_cpc_bid_micros,
    start_date,
    end_date,
  } = data;

  // Validaciones básicas
  if (!name || name.length > 128) {
    return { body: { error: 'Campaign name requerido y ≤ 128 chars' }, status: 400 };
  }
  if (!daily_budget || Number(daily_budget) <= 0) {
    return { body: { error: 'daily_budget debe ser > 0' }, status: 400 };
  }
  if (!merchant_center_id) {
    return { body: { error: 'merchant_center_id requerido para Shopping' }, status: 400 };
  }
  if (campaign_priority !== undefined && ![0, 1, 2].includes(Number(campaign_priority))) {
    return { body: { error: 'campaign_priority debe ser 0, 1 o 2' }, status: 400 };
  }

  const bidStrategy = bid_strategy || 'MAXIMIZE_CLICKS';
  const validBidStrategies = ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSION_VALUE', 'MANUAL_CPC', 'TARGET_SPEND'];
  if (!validBidStrategies.includes(bidStrategy)) {
    return {
      body: { error: `bid_strategy inválido. Válidos: ${validBidStrategies.join(', ')}` },
      status: 400,
    };
  }

  const amountMicros = Math.round(Number(daily_budget) * 1_000_000).toString();

  // Format dates
  const formattedStartDate = start_date
    ? `${String(start_date).slice(0, 4)}-${String(start_date).slice(4, 6)}-${String(start_date).slice(6, 8)}`
    : null;
  const formattedEndDate = end_date
    ? `${String(end_date).slice(0, 4)}-${String(end_date).slice(4, 6)}-${String(end_date).slice(6, 8)}`
    : null;

  const mutateOps: any[] = [];

  // 1. Budget (temp -1)
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

  // 2. Campaign (temp -2)
  const campaignCreate: Record<string, any> = {
    resourceName: `customers/${customerId}/campaigns/-2`,
    name,
    advertisingChannelType: 'SHOPPING',
    // NO advertisingChannelSubType para Standard Shopping (v23 deprecó Smart Shopping)
    status: 'PAUSED',
    campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
    shoppingSetting: {
      merchantId: String(merchant_center_id),
      ...(feed_label ? { feedLabel: String(feed_label) } : {}),
      ...(enable_local_inventory_ads ? { enableLocalInventoryAds: true } : {}),
    },
    campaignPriority: Number(campaign_priority || 0),
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    },
    containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
  };

  // Bidding strategy sub-message (v23 requiere el objeto, no el enum solo)
  const roasNum = Number(target_roas);
  const cpaNum = Number(target_cpa_micros);
  if (bidStrategy === 'MAXIMIZE_CONVERSION_VALUE') {
    campaignCreate.maximizeConversionValue = roasNum > 0 ? { targetRoas: roasNum } : {};
  } else if (bidStrategy === 'MAXIMIZE_CLICKS' || bidStrategy === 'TARGET_SPEND') {
    // v23: MAXIMIZE_CLICKS se expresa como TargetSpend sub-message.
    // Sin targetSpendMicros = comportamiento "maximize clicks" (sin ceiling de gasto).
    // Con targetSpendMicros = "target spend" (ceiling explícito).
    const spendMicros = data.target_spend_micros ? Math.round(Number(data.target_spend_micros)) : null;
    campaignCreate.targetSpend = spendMicros && spendMicros > 0
      ? { targetSpendMicros: String(spendMicros) }
      : {};
  } else if (bidStrategy === 'MANUAL_CPC') {
    campaignCreate.manualCpc = { enhancedCpcEnabled: !!enhanced_cpc };
  }
  // cpaNum reservado: MAXIMIZE_CONVERSIONS no es típico en Shopping
  void cpaNum;

  if (formattedStartDate) campaignCreate.startDate = formattedStartDate;
  if (formattedEndDate) campaignCreate.endDate = formattedEndDate;

  mutateOps.push({ campaignOperation: { create: campaignCreate } });

  // 3. Ad Group (temp -3) — SHOPPING_PRODUCT_ADS
  mutateOps.push({
    adGroupOperation: {
      create: {
        resourceName: `customers/${customerId}/adGroups/-3`,
        name: ad_group_name || 'Ad Group 1',
        campaign: `customers/${customerId}/campaigns/-2`,
        type: 'SHOPPING_PRODUCT_ADS',
        status: 'ENABLED',
        ...(ad_group_cpc_bid_micros ? { cpcBidMicros: String(ad_group_cpc_bid_micros) } : {}),
      },
    },
  });

  // 4. Shopping Product Ad (temp — el ad se genera desde el feed, cuerpo vacío)
  mutateOps.push({
    adGroupAdOperation: {
      create: {
        adGroup: `customers/${customerId}/adGroups/-3`,
        status: 'ENABLED',
        ad: { shoppingProductAd: {} },
      },
    },
  });

  console.log(`[manage-google-shopping] Creating Shopping campaign "${name}" with ${mutateOps.length} ops`);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutateOps);

  if (!result.ok) {
    const errStr = String(result.error || '');
    // Mensajes claros para errores comunes
    if (errStr.includes('name is already assigned') || errStr.toLowerCase().includes('duplicate name')) {
      return { body: { error: `Ya existe una campaña con el nombre "${name}". Cambialo y volvé a intentar.` }, status: 400 };
    }
    if (errStr.includes('MERCHANT_ID_CANNOT_BE_ACCESSED') || errStr.includes('merchant')) {
      return { body: { error: `Merchant Center ${merchant_center_id} no está linkeado o no hay acceso. Verificá el link en Google Ads.`, details: errStr }, status: 400 };
    }
    return { body: { error: 'Failed to create Shopping campaign', details: result.error }, status: 502 };
  }

  // Extract real resource names
  let realCampaign = '';
  let realAdGroup = '';
  const primaryResponses: any[] = Array.isArray((result.data as any)?.mutateOperationResponses)
    ? (result.data as any).mutateOperationResponses
    : [];
  for (const r of primaryResponses) {
    const c = r?.campaignResult?.resourceName;
    const ag = r?.adGroupResult?.resourceName;
    if (c && !realCampaign) realCampaign = c;
    if (ag && !realAdGroup) realAdGroup = ag;
  }
  const campaignId = realCampaign ? realCampaign.split('/').pop() : null;
  const adGroupId = realAdGroup ? realAdGroup.split('/').pop() : null;

  return {
    body: {
      success: true,
      campaign_id: campaignId,
      ad_group_id: adGroupId,
      campaign_resource: realCampaign,
      ad_group_resource: realAdGroup,
      message: `Campaña Shopping "${name}" creada. Google crea automáticamente el grupo "All products". Usá add_product_group_subdivision para segmentar.`,
    },
    status: 200,
  };
}

/**
 * List shopping ad groups con métricas 30d (filter opcional por campaign).
 */
async function handleListShoppingAdGroups(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  campaignId?: string
): Promise<{ body: any; status: number }> {
  let gaql = `
    SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros,
           ad_group.type,
           campaign.id, campaign.name, campaign.status,
           metrics.clicks, metrics.impressions, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM ad_group
    WHERE campaign.advertising_channel_type = 'SHOPPING'
      AND ad_group.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
      AND segments.date DURING LAST_30_DAYS
  `;
  if (campaignId) gaql += ` AND campaign.id = ${String(campaignId).replace(/[^0-9]/g, '')}`;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, gaql);
  if (!result.ok) return { body: { error: 'Failed to fetch ad groups', details: result.error }, status: 502 };

  const agMap = new Map<string, any>();
  for (const row of result.data || []) {
    const id = String(row.adGroup?.id);
    if (!agMap.has(id)) {
      agMap.set(id, {
        id,
        name: row.adGroup?.name,
        status: row.adGroup?.status,
        type: row.adGroup?.type,
        cpc_bid_micros: Number(row.adGroup?.cpcBidMicros || 0),
        campaign_id: row.campaign?.id,
        campaign_name: row.campaign?.name,
        clicks: 0, impressions: 0, cost_micros: 0, conversions: 0, conversions_value: 0,
      });
    }
    const ag = agMap.get(id)!;
    ag.clicks += Number(row.metrics?.clicks || 0);
    ag.impressions += Number(row.metrics?.impressions || 0);
    ag.cost_micros += Number(row.metrics?.costMicros || 0);
    ag.conversions += Number(row.metrics?.conversions || 0);
    ag.conversions_value += Number(row.metrics?.conversionsValue || 0);
  }

  const ad_groups = Array.from(agMap.values()).map(ag => ({
    ...ag,
    roas: ag.cost_micros > 0 ? (ag.conversions_value * 1_000_000) / ag.cost_micros : 0,
  }));

  ad_groups.sort((a, b) => b.cost_micros - a.cost_micros);

  return { body: { success: true, ad_groups }, status: 200 };
}

/**
 * List shopping products del feed linkeado a la campaña.
 * Usa GAQL `shopping_product` que es un virtual view del feed MC.
 *
 * v23 fields verificados:
 *  - shopping_product.item_id, .title, .brand, .currency_code, .price_micros
 *  - shopping_product.status (ELIGIBLE | DISAPPROVED | PENDING)
 *  - shopping_product.issues (array de { description, severity, ... })
 *  - shopping_product.availability (IN_STOCK | OUT_OF_STOCK | PREORDER)
 *  - shopping_product.category_level1..level5 (taxonomía Google)
 *  - shopping_product.product_type_level1..level5 (del feed del merchant)
 *  - shopping_product.custom_attribute0..4
 *  - shopping_product.channel (ONLINE | LOCAL)
 *  - shopping_product.image_link
 */
async function handleListShoppingProducts(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { merchant_center_id, limit = 100, status_filter, only_disapproved } = data;
  const lim = Math.max(1, Math.min(Number(limit) || 100, 500));

  let gaql = `
    SELECT shopping_product.item_id, shopping_product.title, shopping_product.brand,
           shopping_product.currency_code, shopping_product.price_micros,
           shopping_product.status, shopping_product.availability,
           shopping_product.channel, shopping_product.image_link,
           shopping_product.category_level1, shopping_product.category_level2,
           shopping_product.product_type_level1, shopping_product.product_type_level2,
           shopping_product.custom_attribute0, shopping_product.custom_attribute1,
           shopping_product.feed_label
    FROM shopping_product
    WHERE shopping_product.merchant_center_id > 0
  `;
  if (merchant_center_id && /^\d+$/.test(String(merchant_center_id))) {
    gaql += ` AND shopping_product.merchant_center_id = ${merchant_center_id}`;
  }
  // v23 enum ShoppingProductStatus: ELIGIBLE | NOT_ELIGIBLE | ELIGIBLE_LIMITED | PENDING
  const VALID_STATUS = ['ELIGIBLE', 'NOT_ELIGIBLE', 'ELIGIBLE_LIMITED', 'PENDING'];
  if (only_disapproved) {
    gaql += ` AND shopping_product.status = 'NOT_ELIGIBLE'`;
  } else if (status_filter) {
    const s = String(status_filter).toUpperCase();
    if (VALID_STATUS.includes(s)) {
      gaql += ` AND shopping_product.status = '${s}'`;
    }
  }
  gaql += ` LIMIT ${lim}`;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, gaql);
  if (!result.ok) {
    // Fallback: si falla (common si MC no linkeado), devolver empty array con warning
    return {
      body: {
        success: true,
        products: [],
        warnings: [`No se pudieron leer productos del feed: ${result.error}`],
      },
      status: 200,
    };
  }

  const products = (result.data || []).map((row: any) => {
    const sp = row.shoppingProduct || {};
    return {
      item_id: sp.itemId,
      title: sp.title,
      brand: sp.brand,
      currency_code: sp.currencyCode,
      price: Number(sp.priceMicros || 0) / 1_000_000,
      status: sp.status,
      availability: sp.availability,
      channel: sp.channel,
      image_link: sp.imageLink,
      category_level1: sp.categoryLevel1,
      category_level2: sp.categoryLevel2,
      product_type_level1: sp.productTypeLevel1,
      product_type_level2: sp.productTypeLevel2,
      custom_attribute0: sp.customAttribute0,
      custom_attribute1: sp.customAttribute1,
      feed_label: sp.feedLabel,
    };
  });

  // Agregar summary (counts por status)
  const summary = products.reduce((acc: Record<string, number>, p) => {
    const k = p.status || 'UNKNOWN';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return { body: { success: true, products, summary, total: products.length }, status: 200 };
}

/**
 * List product groups (listing group tree) con métricas por partición 30d.
 * Returns flat array con parent_resource_name para reconstruir el árbol en frontend.
 *
 * v23: product_group_view es el view canónico para métricas por partición.
 */
async function handleListProductGroups(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  adGroupId: string
): Promise<{ body: any; status: number }> {
  if (!validateNumericId(adGroupId)) {
    return { body: { error: 'ad_group_id inválido' }, status: 400 };
  }

  // Query 1: estructura del tree (sin segments, para capturar todos los nodos)
  const treeQuery = `
    SELECT ad_group_criterion.criterion_id,
           ad_group_criterion.resource_name,
           ad_group_criterion.status,
           ad_group_criterion.negative,
           ad_group_criterion.cpc_bid_micros,
           ad_group_criterion.listing_group.type,
           ad_group_criterion.listing_group.parent_ad_group_criterion,
           ad_group_criterion.listing_group.case_value.product_brand.value,
           ad_group_criterion.listing_group.case_value.product_type.level,
           ad_group_criterion.listing_group.case_value.product_type.value,
           ad_group_criterion.listing_group.case_value.product_condition.condition,
           ad_group_criterion.listing_group.case_value.product_channel.channel,
           ad_group_criterion.listing_group.case_value.product_custom_attribute.index,
           ad_group_criterion.listing_group.case_value.product_custom_attribute.value,
           ad_group_criterion.listing_group.case_value.product_item_id.value,
           ad_group_criterion.listing_group.case_value.product_bidding_category.id,
           ad_group_criterion.listing_group.case_value.product_bidding_category.level
    FROM ad_group_criterion
    WHERE ad_group.id = ${adGroupId}
      AND ad_group_criterion.type = 'LISTING_GROUP'
      AND ad_group_criterion.status != 'REMOVED'
  `;

  // Query 2: métricas 30d por partición
  const metricsQuery = `
    SELECT ad_group_criterion.criterion_id,
           metrics.clicks, metrics.impressions, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM product_group_view
    WHERE ad_group.id = ${adGroupId}
      AND segments.date DURING LAST_30_DAYS
  `;

  const [treeRes, metricsRes] = await Promise.all([
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, treeQuery),
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, metricsQuery),
  ]);

  const warnings: string[] = [];
  if (!treeRes.ok) return { body: { error: 'Failed to fetch product groups', details: treeRes.error }, status: 502 };
  if (!metricsRes.ok) warnings.push('Métricas no disponibles: ' + (metricsRes.error || 'error'));

  // Map de métricas por criterion_id (agregadas por día)
  const metricsByCrit = new Map<string, any>();
  for (const row of metricsRes.data || []) {
    const cid = String(row.adGroupCriterion?.criterionId);
    if (!metricsByCrit.has(cid)) {
      metricsByCrit.set(cid, { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0, conversions_value: 0 });
    }
    const m = metricsByCrit.get(cid)!;
    m.clicks += Number(row.metrics?.clicks || 0);
    m.impressions += Number(row.metrics?.impressions || 0);
    m.cost_micros += Number(row.metrics?.costMicros || 0);
    m.conversions += Number(row.metrics?.conversions || 0);
    m.conversions_value += Number(row.metrics?.conversionsValue || 0);
  }

  const product_groups = (treeRes.data || []).map((row: any) => {
    const agc = row.adGroupCriterion || {};
    const lg = agc.listingGroup || {};
    const cv = lg.caseValue || {};
    const cid = String(agc.criterionId);
    const metrics = metricsByCrit.get(cid) || { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0, conversions_value: 0 };

    // Derive dimension + value (solo 1 case_value activo por nodo)
    let dimension: string | null = null;
    let value: string | null = null;
    let extra: Record<string, any> = {};
    if (cv.productBrand?.value) { dimension = 'product_brand'; value = cv.productBrand.value; }
    else if (cv.productType?.value) { dimension = 'product_type'; value = cv.productType.value; extra = { level: cv.productType.level }; }
    else if (cv.productCondition?.condition) { dimension = 'product_condition'; value = cv.productCondition.condition; }
    else if (cv.productChannel?.channel) { dimension = 'product_channel'; value = cv.productChannel.channel; }
    else if (cv.productCustomAttribute?.value) { dimension = 'product_custom_attribute'; value = cv.productCustomAttribute.value; extra = { index: cv.productCustomAttribute.index }; }
    else if (cv.productItemId?.value) { dimension = 'product_item_id'; value = cv.productItemId.value; }
    else if (cv.productBiddingCategory?.id) { dimension = 'product_bidding_category'; value = String(cv.productBiddingCategory.id); extra = { level: cv.productBiddingCategory.level }; }

    return {
      criterion_id: cid,
      resource_name: agc.resourceName,
      parent_resource_name: lg.parentAdGroupCriterion || null,
      type: lg.type, // SUBDIVISION | UNIT | UNKNOWN
      status: agc.status,
      negative: !!agc.negative,
      cpc_bid_micros: Number(agc.cpcBidMicros || 0),
      dimension, // null = "Everything else" catch-all
      value,
      extra,
      metrics: {
        ...metrics,
        ctr: metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0,
        avg_cpc: metrics.clicks > 0 ? metrics.cost_micros / metrics.clicks / 1_000_000 : 0,
        roas: metrics.cost_micros > 0 ? (metrics.conversions_value * 1_000_000) / metrics.cost_micros : 0,
      },
    };
  });

  return {
    body: {
      success: true,
      ad_group_id: adGroupId,
      product_groups,
      total: product_groups.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    status: 200,
  };
}

/**
 * Update CPC bid de un product group UNIT.
 * SUBDIVISION no puede tener bid (los bids están en sus UNITs hijos).
 */
async function handleUpdateProductGroupBid(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { criterion_resource_name, cpc_bid_micros } = data;

  if (!criterion_resource_name) {
    return { body: { error: 'criterion_resource_name requerido' }, status: 400 };
  }
  // Valida shape: customers/{cid}/adGroupCriteria/{agId}~{critId}
  if (!/^customers\/\d+\/adGroupCriteria\/\d+~\d+$/.test(String(criterion_resource_name))) {
    return { body: { error: 'criterion_resource_name inválido' }, status: 400 };
  }
  const bidNum = Number(cpc_bid_micros);
  if (!bidNum || bidNum <= 0) {
    return { body: { error: 'cpc_bid_micros debe ser > 0' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupCriterionOperation: {
      update: {
        resourceName: String(criterion_resource_name),
        cpcBidMicros: String(bidNum),
      },
      updateMask: 'cpc_bid_micros',
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to update bid', details: result.error }, status: 502 };
  }

  return { body: { success: true, cpc_bid_micros: bidNum }, status: 200 };
}

/**
 * Add product group subdivision: convierte un UNIT en SUBDIVISION + crea children UNITs.
 *
 * Por limitación v23 (no se puede update type UNIT→SUBDIVISION directo, ni referenciar
 * temp IDs de criterion), el flow es:
 *   Mutate 1 (atómico):
 *     - remove el UNIT parent
 *     - create nuevo SUBDIVISION (con el mismo caseValue si no es root)
 *   Mutate 2 (batch):
 *     - create N children UNIT con parent = real resource_name del SUBDIVISION creado
 *     - create 1 catch-all UNIT (sin caseValue) con parent = SUBDIVISION
 *
 * Input:
 *   ad_group_id
 *   parent_criterion_resource_name (el UNIT a convertir — omit si es root)
 *   dimension (product_brand | product_type | product_condition | ...)
 *   subdivisions: [{ value, cpc_bid_micros, level? }]
 *   catch_all_cpc_bid_micros (default 500000 = $0.50)
 */
async function handleAddProductGroupSubdivision(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  adGroupId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  if (!validateNumericId(adGroupId)) {
    return { body: { error: 'ad_group_id inválido' }, status: 400 };
  }

  const {
    parent_criterion_resource_name,
    dimension,
    subdivisions,
    catch_all_cpc_bid_micros,
  } = data;

  if (!dimension) return { body: { error: 'dimension requerida' }, status: 400 };
  if (!Array.isArray(subdivisions) || subdivisions.length === 0) {
    return { body: { error: 'subdivisions array requerido con al menos 1 elemento' }, status: 400 };
  }

  // Query para obtener el tree actual y localizar el parent
  const treeRes = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
    SELECT ad_group_criterion.criterion_id, ad_group_criterion.resource_name,
           ad_group_criterion.listing_group.type,
           ad_group_criterion.listing_group.parent_ad_group_criterion
    FROM ad_group_criterion
    WHERE ad_group.id = ${adGroupId}
      AND ad_group_criterion.type = 'LISTING_GROUP'
      AND ad_group_criterion.status != 'REMOVED'
  `);

  if (!treeRes.ok) {
    return { body: { error: 'No se pudo leer el tree actual', details: treeRes.error }, status: 502 };
  }

  const nodes = (treeRes.data || []).map((row: any) => ({
    resource_name: row.adGroupCriterion?.resourceName,
    type: row.adGroupCriterion?.listingGroup?.type,
    parent: row.adGroupCriterion?.listingGroup?.parentAdGroupCriterion || null,
  }));

  // Localizar el parent a convertir
  let parentNode: any;
  if (parent_criterion_resource_name) {
    parentNode = nodes.find((n: any) => n.resource_name === parent_criterion_resource_name);
    if (!parentNode) {
      return { body: { error: 'parent_criterion_resource_name no encontrado en este ad group' }, status: 400 };
    }
    if (parentNode.type === 'SUBDIVISION') {
      return { body: { error: 'El parent ya es SUBDIVISION. Usá otra action para agregar children.' }, status: 400 };
    }
  } else {
    // Root: el UNIT sin parent (el "All products" auto-generado)
    parentNode = nodes.find((n: any) => n.type === 'UNIT' && !n.parent);
    if (!parentNode) {
      return { body: { error: 'No encontré el UNIT root. El ad group puede no tener product groups.' }, status: 400 };
    }
  }

  // Obtener el caseValue del parent (si no es root, necesitamos preservarlo en el SUBDIVISION)
  let parentCaseValue: any = null;
  let parentOfParent: string | null = null;
  if (parent_criterion_resource_name) {
    // SECURITY: validar shape del resource_name antes de interpolar en GAQL
    if (!/^customers\/\d+\/adGroupCriteria\/\d+~\d+$/.test(String(parent_criterion_resource_name))) {
      return { body: { error: 'parent_criterion_resource_name formato inválido' }, status: 400 };
    }
    const r = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
      SELECT ad_group_criterion.listing_group.case_value.product_brand.value,
             ad_group_criterion.listing_group.case_value.product_type.level,
             ad_group_criterion.listing_group.case_value.product_type.value,
             ad_group_criterion.listing_group.case_value.product_condition.condition,
             ad_group_criterion.listing_group.case_value.product_channel.channel,
             ad_group_criterion.listing_group.case_value.product_custom_attribute.index,
             ad_group_criterion.listing_group.case_value.product_custom_attribute.value,
             ad_group_criterion.listing_group.case_value.product_item_id.value,
             ad_group_criterion.listing_group.case_value.product_bidding_category.id,
             ad_group_criterion.listing_group.case_value.product_bidding_category.level,
             ad_group_criterion.listing_group.parent_ad_group_criterion
      FROM ad_group_criterion
      WHERE ad_group_criterion.resource_name = '${parent_criterion_resource_name}'
    `);
    if (r.ok && r.data?.[0]) {
      const cv = r.data[0].adGroupCriterion?.listingGroup?.caseValue || {};
      parentCaseValue = Object.keys(cv).length > 0 ? cv : null;
      parentOfParent = r.data[0].adGroupCriterion?.listingGroup?.parentAdGroupCriterion || null;
    }
  }

  // Mutate 1: remove parent UNIT + create nuevo SUBDIVISION (temp -1)
  const subdivResource = `customers/${customerId}/adGroupCriteria/${adGroupId}~-1`;
  const mutate1Ops: any[] = [
    {
      adGroupCriterionOperation: {
        remove: parentNode.resource_name,
      },
    },
    {
      adGroupCriterionOperation: {
        create: {
          resourceName: subdivResource,
          adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
          status: 'ENABLED',
          listingGroup: {
            type: 'SUBDIVISION',
            ...(parentOfParent ? { parentAdGroupCriterion: parentOfParent } : {}),
            ...(parentCaseValue ? { caseValue: parentCaseValue } : {}),
          },
        },
      },
    },
  ];

  const res1 = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutate1Ops);
  if (!res1.ok) {
    return { body: { error: 'Failed to convert parent to SUBDIVISION', details: res1.error }, status: 502 };
  }

  // Extraer real resource_name del SUBDIVISION creado.
  // Op 0 = remove, Op 1 = create SUBDIVISION. Usamos índice explícito (Google
  // garantiza orden de responses = orden de operations).
  const r1Responses: any[] = (res1.data as any)?.mutateOperationResponses || [];
  const newSubdivResource = r1Responses[1]?.adGroupCriterionResult?.resourceName || '';
  if (!newSubdivResource || !/^customers\/\d+\/adGroupCriteria\/\d+~\d+$/.test(newSubdivResource)) {
    return { body: { error: 'No se pudo obtener el resource_name del nuevo SUBDIVISION' }, status: 502 };
  }

  // Mutate 2: crear N children UNIT con caseValue + 1 catch-all
  const catchBid = Math.max(1, Math.round(Number(catch_all_cpc_bid_micros) || 500_000));
  const mutate2Ops: any[] = [];

  for (const sub of subdivisions) {
    const cv = buildListingDimensionCaseValue(dimension, sub.value, { level: sub.level, index: sub.index });
    if (!cv) {
      return { body: { error: `Dimensión/valor inválido: ${dimension}=${sub.value}` }, status: 400 };
    }
    const bid = Math.max(1, Math.round(Number(sub.cpc_bid_micros) || 500_000));
    mutate2Ops.push({
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
          status: 'ENABLED',
          cpcBidMicros: String(bid),
          listingGroup: {
            type: 'UNIT',
            parentAdGroupCriterion: newSubdivResource,
            caseValue: cv,
          },
        },
      },
    });
  }

  // Catch-all "Everything else" (sin caseValue)
  mutate2Ops.push({
    adGroupCriterionOperation: {
      create: {
        adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
        status: 'ENABLED',
        cpcBidMicros: String(catchBid),
        listingGroup: {
          type: 'UNIT',
          parentAdGroupCriterion: newSubdivResource,
          // NO caseValue = "Everything else in {dimension}"
        },
      },
    },
  });

  const res2 = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, mutate2Ops);
  if (!res2.ok) {
    // El SUBDIVISION quedó creado pero sin children — Google no lo acepta así.
    // El frontend debe mostrar un warning y ofrecer reintentar.
    return {
      body: {
        error: 'El SUBDIVISION se creó pero fallaron los children. El tree quedó inconsistente — reintentá o remove el SUBDIVISION.',
        details: res2.error,
        partial_subdivision: newSubdivResource,
      },
      status: 502,
    };
  }

  return {
    body: {
      success: true,
      subdivision_resource: newSubdivResource,
      children_created: subdivisions.length + 1, // +1 catch-all
      message: `Subdivisión creada con ${subdivisions.length} valores + 1 "Everything else"`,
    },
    status: 200,
  };
}

/**
 * Add negative product group: excluir productos por dimensión (brand/type/etc).
 * Se crea como UNIT con negative: true bajo el parent especificado.
 */
async function handleAddNegativeProductGroup(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  adGroupId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  if (!validateNumericId(adGroupId)) {
    return { body: { error: 'ad_group_id inválido' }, status: 400 };
  }

  const { parent_criterion_resource_name, dimension, value, level, index } = data;

  if (!parent_criterion_resource_name) {
    return { body: { error: 'parent_criterion_resource_name requerido (debe ser un SUBDIVISION)' }, status: 400 };
  }
  if (!dimension) return { body: { error: 'dimension requerida' }, status: 400 };

  const cv = buildListingDimensionCaseValue(dimension, value, { level, index });
  if (!cv) return { body: { error: `Dimensión/valor inválido: ${dimension}=${value}` }, status: 400 };

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupCriterionOperation: {
      create: {
        adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
        status: 'ENABLED',
        negative: true,
        listingGroup: {
          type: 'UNIT',
          parentAdGroupCriterion: String(parent_criterion_resource_name),
          caseValue: cv,
        },
      },
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to add negative product group', details: result.error }, status: 502 };
  }

  const created = (result.data as any)?.mutateOperationResponses?.[0]?.adGroupCriterionResult?.resourceName;
  return { body: { success: true, criterion_resource_name: created }, status: 200 };
}

/**
 * Remove product group (UNIT o SUBDIVISION).
 * CUIDADO: remover un SUBDIVISION cascadea a todos sus children.
 * Si el parent queda sin children, Google rechaza futuras mutaciones del tree — el
 * frontend debería recrear un UNIT en su lugar.
 */
async function handleRemoveProductGroup(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { criterion_resource_name } = data;
  if (!criterion_resource_name) {
    return { body: { error: 'criterion_resource_name requerido' }, status: 400 };
  }
  if (!/^customers\/\d+\/adGroupCriteria\/\d+~\d+$/.test(String(criterion_resource_name))) {
    return { body: { error: 'criterion_resource_name inválido' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupCriterionOperation: {
      remove: String(criterion_resource_name),
    },
  }]);

  if (!result.ok) {
    return { body: { error: 'Failed to remove product group', details: result.error }, status: 502 };
  }

  return { body: { success: true, removed: criterion_resource_name }, status: 200 };
}

/**
 * Métricas por dimensión (brand / product_type / category / item_id).
 * Uses segments.product_* desde el view campaign o shopping_performance_view.
 */
async function handleListShoppingMetricsByDimension(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { campaign_id, dimension = 'brand', limit = 50 } = data;
  const lim = Math.max(1, Math.min(Number(limit) || 50, 200));

  // v23 verified segment names (shopping_performance_view supports these).
  // Mapeo alias UI → {gaqlPath, camelKey para acceder en la response}.
  const segmentMap: Record<string, { gaql: string; key: string }> = {
    brand:           { gaql: 'segments.product_brand',           key: 'productBrand' },
    product_type_l1: { gaql: 'segments.product_type_l1',         key: 'productTypeL1' },
    product_type_l2: { gaql: 'segments.product_type_l2',         key: 'productTypeL2' },
    category_l1:     { gaql: 'segments.product_category_level1', key: 'productCategoryLevel1' },
    category_l2:     { gaql: 'segments.product_category_level2', key: 'productCategoryLevel2' },
    item_id:         { gaql: 'segments.product_item_id',         key: 'productItemId' },
    channel:         { gaql: 'segments.product_channel',         key: 'productChannel' },
    condition:       { gaql: 'segments.product_condition',       key: 'productCondition' },
  };
  const seg = segmentMap[String(dimension).toLowerCase()];
  if (!seg) {
    return { body: { error: `dimension inválida. Válidas: ${Object.keys(segmentMap).join(', ')}` }, status: 400 };
  }

  let gaql = `
    SELECT ${seg.gaql},
           metrics.clicks, metrics.impressions, metrics.cost_micros,
           metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_30_DAYS
  `;
  if (campaign_id && /^\d+$/.test(String(campaign_id))) {
    gaql += ` AND campaign.id = ${campaign_id}`;
  }

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, gaql);
  if (!result.ok) {
    return { body: { error: 'Failed to fetch metrics', details: result.error }, status: 502 };
  }

  // Agregar por valor de la dimensión (usando el camelKey mapeado explícitamente).
  const agg = new Map<string, any>();
  for (const row of result.data || []) {
    const segs = row.segments || {};
    let rawVal = segs[seg.key];
    // ProductCondition/ProductChannel devuelven {condition|channel: enum} en vez de string
    if (rawVal && typeof rawVal === 'object') {
      rawVal = rawVal.condition || rawVal.channel || rawVal.value || JSON.stringify(rawVal);
    }
    const k = String(rawVal || '(sin valor)');
    if (!agg.has(k)) {
      agg.set(k, { value: k, clicks: 0, impressions: 0, cost_micros: 0, conversions: 0, conversions_value: 0 });
    }
    const a = agg.get(k)!;
    a.clicks += Number(row.metrics?.clicks || 0);
    a.impressions += Number(row.metrics?.impressions || 0);
    a.cost_micros += Number(row.metrics?.costMicros || 0);
    a.conversions += Number(row.metrics?.conversions || 0);
    a.conversions_value += Number(row.metrics?.conversionsValue || 0);
  }

  const rows = Array.from(agg.values()).map(a => ({
    ...a,
    ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
    avg_cpc: a.clicks > 0 ? a.cost_micros / a.clicks / 1_000_000 : 0,
    roas: a.cost_micros > 0 ? (a.conversions_value * 1_000_000) / a.cost_micros : 0,
  }));

  rows.sort((a, b) => b.cost_micros - a.cost_micros);

  return { body: { success: true, dimension, rows: rows.slice(0, lim), total: rows.length }, status: 200 };
}

/**
 * Steve AI: analiza feed + histórico de conversiones por producto y sugiere
 * un árbol óptimo de subdivisiones (brand/product_type/custom_attribute) con bids
 * diferenciados basados en ROAS.
 */
async function handleSuggestShoppingStructure(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { campaign_id, client_id } = data;
  if (!campaign_id || !/^\d+$/.test(String(campaign_id))) {
    return { body: { error: 'campaign_id requerido (numérico)' }, status: 400 };
  }

  const warnings: string[] = [];

  // 1) Métricas por brand de la campaña
  const byBrandRes = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
    SELECT segments.product_brand,
           metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE campaign.id = ${campaign_id}
      AND segments.date DURING LAST_30_DAYS
  `);

  // 2) Métricas por product_type_l1
  const byTypeRes = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
    SELECT segments.product_type_l1,
           metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM shopping_performance_view
    WHERE campaign.id = ${campaign_id}
      AND segments.date DURING LAST_30_DAYS
  `);

  const aggregate = (rows: any[], key: string) => {
    const map = new Map<string, any>();
    for (const r of rows || []) {
      const v = r.segments?.[key];
      if (!v) continue;
      const k = String(v);
      if (!map.has(k)) map.set(k, { value: k, clicks: 0, cost_micros: 0, conversions: 0, conversions_value: 0 });
      const a = map.get(k)!;
      a.clicks += Number(r.metrics?.clicks || 0);
      a.cost_micros += Number(r.metrics?.costMicros || 0);
      a.conversions += Number(r.metrics?.conversions || 0);
      a.conversions_value += Number(r.metrics?.conversionsValue || 0);
    }
    return Array.from(map.values()).map(a => ({
      ...a,
      roas: a.cost_micros > 0 ? (a.conversions_value * 1_000_000) / a.cost_micros : 0,
      conversions_per_click: a.clicks > 0 ? a.conversions / a.clicks : 0,
    })).sort((a, b) => b.cost_micros - a.cost_micros);
  };

  const brands = byBrandRes.ok ? aggregate(byBrandRes.data || [], 'productBrand') : [];
  const types = byTypeRes.ok ? aggregate(byTypeRes.data || [], 'productTypeL1') : [];
  if (!byBrandRes.ok) warnings.push('Métricas por brand no disponibles');
  if (!byTypeRes.ok) warnings.push('Métricas por product_type no disponibles');

  // Heurística Steve: elegir la dimensión con más variación de ROAS (más oportunidad
  // de bid diferenciado). Si no hay histórico, recomendar subdivisión por brand por
  // defecto (suele ser la dimensión con más identidad en e-commerce).
  const varianceRoas = (items: any[]) => {
    if (items.length < 2) return 0;
    const vals = items.map(i => i.roas).filter(r => r > 0);
    if (vals.length < 2) return 0;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length;
  };

  const brandVar = varianceRoas(brands);
  const typeVar = varianceRoas(types);
  const pickBrand = brandVar >= typeVar && brands.length > 1;

  const source = pickBrand ? brands : types;
  const dimension = pickBrand ? 'product_brand' : 'product_type';

  // Steve propone: top 5 valores con mejor ROAS get bid 1.5x promedio;
  // bottom 5 con peor ROAS get 0.6x; resto → "Everything else" con 1x.
  // Si no hay histórico, bids iguales.
  const hasHistory = source.length > 0 && source.some(s => s.cost_micros > 0);
  let suggested: any[] = [];
  const avgBidMicros = 500_000; // $0.50 default

  if (hasHistory) {
    const top = source.slice(0, 5);
    const allCost = source.reduce((s, v) => s + v.cost_micros, 0);
    const avgRoas = allCost > 0
      ? (source.reduce((s, v) => s + v.conversions_value, 0) * 1_000_000) / allCost
      : 0;

    suggested = top.map(t => {
      const ratio = avgRoas > 0 ? t.roas / avgRoas : 1;
      const multiplier = ratio >= 1.5 ? 1.5 : ratio >= 1 ? 1.2 : ratio >= 0.5 ? 1.0 : 0.6;
      return {
        value: t.value,
        cpc_bid_micros: Math.round(avgBidMicros * multiplier),
        reasoning: ratio >= 1.5
          ? `ROAS ${t.roas.toFixed(1)}x (alto) — subir bid`
          : ratio >= 1
          ? `ROAS ${t.roas.toFixed(1)}x (medio-alto)`
          : ratio >= 0.5
          ? `ROAS ${t.roas.toFixed(1)}x (medio)`
          : `ROAS ${t.roas.toFixed(1)}x (bajo) — bajar bid`,
        metrics_30d: { clicks: t.clicks, cost: t.cost_micros / 1_000_000, conversions: t.conversions, roas: t.roas },
      };
    });
  } else {
    // Sin histórico: usar brief del cliente para sugerir top brands (si hay)
    suggested = [{
      value: '(Steve necesita datos)',
      cpc_bid_micros: avgBidMicros,
      reasoning: 'Aún no hay métricas suficientes para esta campaña. Dejá correr 1-2 semanas y reintentá.',
      metrics_30d: null,
    }];
    warnings.push('Sin histórico de conversiones — sugerencia es genérica');
  }

  void client_id; // reservado para uso futuro (cruzar con brief)

  return {
    body: {
      success: true,
      dimension,
      reasoning: pickBrand
        ? `Brand tiene más variación de ROAS (${brandVar.toFixed(2)}) que product_type (${typeVar.toFixed(2)}) — subdividir por brand maximiza oportunidad de bid diferenciado.`
        : `Product_type tiene más variación de ROAS (${typeVar.toFixed(2)}) que brand (${brandVar.toFixed(2)}).`,
      suggested_subdivisions: suggested,
      catch_all_cpc_bid_micros: Math.round(avgBidMicros * 0.8),
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    status: 200,
  };
}

// --- Main handler ---

export async function manageGoogleShopping(c: Context) {
  try {
    const body: RequestBody = await c.req.json();
    const { action, connection_id, campaign_id, ad_group_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = [
      'list_shopping_campaigns',
      'create_shopping_campaign',
      'list_shopping_ad_groups',
      'list_shopping_products',
      'list_product_groups',
      'update_product_group_bid',
      'add_product_group_subdivision',
      'add_negative_product_group',
      'remove_product_group',
      'list_shopping_metrics_by_dimension',
      'suggest_shopping_structure',
    ];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    // Defense-in-depth: numeric IDs
    if (!validateNumericId(campaign_id)) return c.json({ error: 'campaign_id must be numeric' }, 400);
    if (!validateNumericId(ad_group_id)) return c.json({ error: 'ad_group_id must be numeric' }, 400);

    // Actions que requieren ad_group_id
    const needsAdGroupId: Action[] = ['list_product_groups', 'add_product_group_subdivision', 'add_negative_product_group'];
    if (needsAdGroupId.includes(action) && !ad_group_id) {
      return c.json({ error: `Missing ad_group_id for action "${action}"` }, 400);
    }

    console.log(`[manage-google-shopping] Action: ${action}, Connection: ${connection_id}`);

    const resolved = await resolveConnectionAndToken(c, connection_id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status as any);
    }
    const { ctx } = resolved;
    const { customerId, accessToken, developerToken, loginCustomerId } = ctx;

    // client_id puede ser útil para suggest_shopping_structure (cruzar con brief)
    const clientIdForBrief = (data as any)?.client_id && UUID_RX.test(String((data as any).client_id))
      ? String((data as any).client_id)
      : undefined;

    let result: { body: any; status: number };

    switch (action) {
      case 'list_shopping_campaigns':
        result = await handleListShoppingCampaigns(customerId, accessToken, developerToken, loginCustomerId);
        break;
      case 'create_shopping_campaign':
        result = await handleCreateShoppingCampaign(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'list_shopping_ad_groups':
        result = await handleListShoppingAdGroups(customerId, accessToken, developerToken, loginCustomerId, campaign_id);
        break;
      case 'list_shopping_products':
        result = await handleListShoppingProducts(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'list_product_groups':
        result = await handleListProductGroups(customerId, accessToken, developerToken, loginCustomerId, ad_group_id!);
        break;
      case 'update_product_group_bid':
        result = await handleUpdateProductGroupBid(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'add_product_group_subdivision':
        result = await handleAddProductGroupSubdivision(customerId, accessToken, developerToken, loginCustomerId, ad_group_id!, data || {});
        break;
      case 'add_negative_product_group':
        result = await handleAddNegativeProductGroup(customerId, accessToken, developerToken, loginCustomerId, ad_group_id!, data || {});
        break;
      case 'remove_product_group':
        result = await handleRemoveProductGroup(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'list_shopping_metrics_by_dimension':
        result = await handleListShoppingMetricsByDimension(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'suggest_shopping_structure':
        result = await handleSuggestShoppingStructure(customerId, accessToken, developerToken, loginCustomerId, { ...(data || {}), client_id: clientIdForBrief });
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-shopping] Error:', error);
    return c.json({ error: 'Internal server error', details: error.message }, 500);
  }
}
