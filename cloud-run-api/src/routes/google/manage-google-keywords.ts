import { Context } from 'hono';
import { googleAdsQuery, googleAdsMutate, resolveConnectionAndToken } from '../../lib/google-ads-api.js';
import { convertToCLP, fetchGoogleAccountCurrency } from '../../lib/currency.js';

type Action =
  | 'list_ad_groups'
  | 'list_search_ad_groups'
  | 'get_ad_group_detail'
  | 'list_keywords'
  | 'add_keyword'
  | 'update_keyword'
  | 'remove_keyword'
  | 'list_search_terms'
  | 'add_negative_keyword'
  | 'remove_negative_keyword'
  | 'suggest_keywords'
  | 'list_pending_suggestions'   // NUEVA (Tier 2): leer sugerencias pending del cron
  | 'apply_suggestion'            // NUEVA: aprobar y aplicar una sugerencia
  | 'reject_suggestion';          // NUEVA: rechazar sin aplicar

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  ad_group_id?: string;
  data?: Record<string, any>;
}

function validateNumericId(value: string | undefined): boolean {
  return !value || (/^\d+$/.test(value) && value.length <= 20);
}

// --- Action handlers ---

async function handleListAdGroups(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT ad_group.id, ad_group.name, ad_group.status,
           campaign.id, campaign.name, campaign.advertising_channel_type
    FROM ad_group
    WHERE campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
    ORDER BY campaign.name, ad_group.name
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch ad groups', details: result.error }, status: 502 };

  const adGroups = (result.data || []).map((row: any) => ({
    id: row.adGroup?.id,
    name: row.adGroup?.name,
    status: row.adGroup?.status,
    campaign_id: row.campaign?.id,
    campaign_name: row.campaign?.name,
    campaign_type: row.campaign?.advertisingChannelType,
  }));

  return { body: { success: true, ad_groups: adGroups }, status: 200 };
}

async function handleListKeywords(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, accountCurrency: string,
  campaignId?: string, adGroupId?: string
): Promise<{ body: any; status: number }> {
  let whereClause = `
    WHERE ad_group_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
      AND segments.date DURING LAST_30_DAYS
  `;
  if (campaignId) whereClause += `\n      AND campaign.id = ${campaignId}`;
  if (adGroupId) whereClause += `\n      AND ad_group.id = ${adGroupId}`;

  const query = `
    SELECT
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.cpc_bid_micros,
      ad_group_criterion.quality_info.quality_score,
      ad_group.id, ad_group.name,
      campaign.id, campaign.name,
      metrics.clicks, metrics.impressions, metrics.cost_micros,
      metrics.conversions, metrics.ctr
    FROM keyword_view
    ${whereClause}
    ORDER BY metrics.cost_micros DESC
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch keywords', details: result.error }, status: 502 };

  // Aggregate by keyword (GAQL with date segments returns one row per day)
  const keywordMap = new Map<string, any>();
  for (const row of result.data || []) {
    const key = `${row.adGroup?.id}_${row.adGroupCriterion?.criterionId}`;
    if (!keywordMap.has(key)) {
      const bidMicros = Number(row.adGroupCriterion?.cpcBidMicros || 0);
      const bidCurrency = bidMicros / 1_000_000;
      keywordMap.set(key, {
        criterion_id: row.adGroupCriterion?.criterionId,
        keyword_text: row.adGroupCriterion?.keyword?.text,
        match_type: row.adGroupCriterion?.keyword?.matchType,
        status: row.adGroupCriterion?.status,
        cpc_bid_micros: bidMicros,
        cpc_bid_currency: bidCurrency,
        quality_score: row.adGroupCriterion?.qualityInfo?.qualityScore || null,
        ad_group_id: row.adGroup?.id,
        ad_group_name: row.adGroup?.name,
        campaign_id: row.campaign?.id,
        campaign_name: row.campaign?.name,
        clicks: 0,
        impressions: 0,
        cost_micros: 0,
        conversions: 0,
        ctr: 0,
      });
    }
    const kw = keywordMap.get(key)!;
    kw.clicks += Number(row.metrics?.clicks || 0);
    kw.impressions += Number(row.metrics?.impressions || 0);
    kw.cost_micros += Number(row.metrics?.costMicros || 0);
    kw.conversions += Number(row.metrics?.conversions || 0);
  }

  const keywords = await Promise.all(
    Array.from(keywordMap.values()).map(async (kw) => {
      const costCurrency = kw.cost_micros / 1_000_000;
      const costCLP = await convertToCLP(costCurrency, accountCurrency);
      const bidCLP = await convertToCLP(kw.cpc_bid_currency, accountCurrency);
      return {
        ...kw,
        cost_currency: costCurrency,
        cost_clp: Math.round(costCLP),
        cpc_bid_clp: Math.round(bidCLP),
        ctr: kw.impressions > 0 ? (kw.clicks / kw.impressions * 100) : 0,
        currency: accountCurrency,
      };
    })
  );

  keywords.sort((a, b) => b.cost_micros - a.cost_micros);

  return { body: { success: true, keywords }, status: 200 };
}

async function handleAddKeyword(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { ad_group_id, keyword_text, match_type, cpc_bid } = data;
  if (!ad_group_id || !keyword_text || !match_type) {
    return { body: { error: 'Missing required fields: ad_group_id, keyword_text, match_type' }, status: 400 };
  }
  if (!validateNumericId(ad_group_id)) return { body: { error: 'ad_group_id must be numeric' }, status: 400 };

  const validMatchTypes = ['EXACT', 'PHRASE', 'BROAD'];
  if (!validMatchTypes.includes(match_type)) {
    return { body: { error: `Invalid match_type. Valid: ${validMatchTypes.join(', ')}` }, status: 400 };
  }

  const criterion: any = {
    keyword: { text: keyword_text, matchType: match_type },
    adGroup: `customers/${customerId}/adGroups/${ad_group_id}`,
    status: 'ENABLED',
  };

  if (cpc_bid) {
    const bidValue = Number(cpc_bid);
    if (!Number.isFinite(bidValue) || bidValue <= 0) return { body: { error: 'cpc_bid must be a positive number' }, status: 400 };
    criterion.cpcBidMicros = Math.round(bidValue * 1_000_000).toString();
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupCriterionOperation: { create: criterion },
  }]);

  if (!result.ok) return { body: { error: 'Failed to add keyword', details: result.error }, status: 502 };
  return { body: { success: true, keyword_text, match_type }, status: 200 };
}

async function handleUpdateKeyword(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { ad_group_id, criterion_id, status, cpc_bid } = data;
  if (!ad_group_id || !criterion_id) {
    return { body: { error: 'Missing required fields: ad_group_id, criterion_id' }, status: 400 };
  }
  if (!validateNumericId(ad_group_id)) return { body: { error: 'ad_group_id must be numeric' }, status: 400 };
  if (!validateNumericId(criterion_id)) return { body: { error: 'criterion_id must be numeric' }, status: 400 };

  const resourceName = `customers/${customerId}/adGroupCriteria/${ad_group_id}~${criterion_id}`;
  const updateFields: any = { resourceName };
  const masks: string[] = [];

  if (status) {
    const validStatuses = ['ENABLED', 'PAUSED'];
    if (!validStatuses.includes(status)) return { body: { error: `Invalid status. Valid: ${validStatuses.join(', ')}` }, status: 400 };
    updateFields.status = status;
    masks.push('status');
  }
  if (cpc_bid !== undefined && cpc_bid !== null) {
    const bidValue = Number(cpc_bid);
    if (!Number.isFinite(bidValue) || bidValue <= 0) return { body: { error: 'cpc_bid must be a positive number' }, status: 400 };
    updateFields.cpcBidMicros = Math.round(bidValue * 1_000_000).toString();
    masks.push('cpc_bid_micros');
  }

  if (masks.length === 0) {
    return { body: { error: 'No fields to update. Provide status or cpc_bid.' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupCriterionOperation: {
      update: updateFields,
      updateMask: masks.join(','),
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to update keyword', details: result.error }, status: 502 };
  return { body: { success: true, criterion_id, updated: masks }, status: 200 };
}

async function handleRemoveKeyword(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { ad_group_id, criterion_id } = data;
  if (!ad_group_id || !criterion_id) {
    return { body: { error: 'Missing required fields: ad_group_id, criterion_id' }, status: 400 };
  }
  if (!validateNumericId(ad_group_id)) return { body: { error: 'ad_group_id must be numeric' }, status: 400 };
  if (!validateNumericId(criterion_id)) return { body: { error: 'criterion_id must be numeric' }, status: 400 };

  const resourceName = `customers/${customerId}/adGroupCriteria/${ad_group_id}~${criterion_id}`;
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupCriterionOperation: { remove: resourceName },
  }]);

  if (!result.ok) return { body: { error: 'Failed to remove keyword', details: result.error }, status: 502 };
  return { body: { success: true, criterion_id, removed: true }, status: 200 };
}

async function handleListSearchTerms(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, accountCurrency: string, campaignId?: string
): Promise<{ body: any; status: number }> {
  let whereClause = `
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
  `;
  if (campaignId) whereClause += `\n      AND campaign.id = ${campaignId}`;

  const query = `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.id, campaign.name,
      ad_group.id, ad_group.name,
      metrics.clicks, metrics.impressions, metrics.cost_micros,
      metrics.conversions, metrics.ctr
    FROM search_term_view
    ${whereClause}
    ORDER BY metrics.cost_micros DESC
    LIMIT 10000
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch search terms', details: result.error }, status: 502 };

  // Aggregate by search term (date segments)
  const termMap = new Map<string, any>();
  for (const row of result.data || []) {
    const term = row.searchTermView?.searchTerm || '';
    const key = `${term}_${row.campaign?.id}_${row.adGroup?.id}`;
    if (!termMap.has(key)) {
      termMap.set(key, {
        search_term: term,
        status: row.searchTermView?.status,
        campaign_id: row.campaign?.id,
        campaign_name: row.campaign?.name,
        ad_group_id: row.adGroup?.id,
        ad_group_name: row.adGroup?.name,
        clicks: 0, impressions: 0, cost_micros: 0, conversions: 0,
      });
    }
    const st = termMap.get(key)!;
    st.clicks += Number(row.metrics?.clicks || 0);
    st.impressions += Number(row.metrics?.impressions || 0);
    st.cost_micros += Number(row.metrics?.costMicros || 0);
    st.conversions += Number(row.metrics?.conversions || 0);
  }

  const searchTerms = await Promise.all(
    Array.from(termMap.values()).map(async (st) => {
      const costCurrency = st.cost_micros / 1_000_000;
      const costCLP = await convertToCLP(costCurrency, accountCurrency);
      return {
        ...st,
        cost_currency: costCurrency,
        cost_clp: Math.round(costCLP),
        ctr: st.impressions > 0 ? (st.clicks / st.impressions * 100) : 0,
        currency: accountCurrency,
      };
    })
  );

  searchTerms.sort((a, b) => b.cost_micros - a.cost_micros);

  return { body: { success: true, search_terms: searchTerms }, status: 200 };
}

// Add negative keyword — soporta scope campaign OR ad_group (XOR).
// Aplica el mismo límite de 80 chars de Google + no lowercase (case preserved).
async function handleAddNegativeKeyword(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { campaign_id, ad_group_id, keyword_text, match_type } = data;

  // XOR: exactamente uno de {campaign_id, ad_group_id} debe estar
  const hasCampaign = !!campaign_id;
  const hasAdGroup = !!ad_group_id;
  if (hasCampaign === hasAdGroup) {
    return { body: { error: 'Provide exactly ONE of campaign_id or ad_group_id (XOR), not both, not neither' }, status: 400 };
  }
  if (!keyword_text || typeof keyword_text !== 'string') {
    return { body: { error: 'Missing keyword_text' }, status: 400 };
  }
  // Trim pero NO lowercase (Google preserva case en reports, matching es case-insensitive)
  const trimmedText = keyword_text.trim();
  if (trimmedText.length === 0 || trimmedText.length > 80) {
    return { body: { error: 'keyword_text debe tener 1-80 caracteres' }, status: 400 };
  }
  if (hasCampaign && !validateNumericId(campaign_id)) return { body: { error: 'campaign_id must be numeric' }, status: 400 };
  if (hasAdGroup && !validateNumericId(ad_group_id)) return { body: { error: 'ad_group_id must be numeric' }, status: 400 };

  const validNegMatchTypes = ['EXACT', 'PHRASE', 'BROAD'];
  const negativeMatchType = validNegMatchTypes.includes(match_type) ? match_type : 'EXACT';

  let operation: any;
  if (hasCampaign) {
    operation = {
      campaignCriterionOperation: {
        create: {
          campaign: `customers/${customerId}/campaigns/${campaign_id}`,
          keyword: { text: trimmedText, matchType: negativeMatchType },
          negative: true,
        },
      },
    };
  } else {
    operation = {
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${ad_group_id}`,
          keyword: { text: trimmedText, matchType: negativeMatchType },
          negative: true,
        },
      },
    };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [operation]);

  if (!result.ok) return { body: { error: 'Failed to add negative keyword', details: result.error }, status: 502 };
  return {
    body: {
      success: true,
      keyword_text: trimmedText,
      match_type: negativeMatchType,
      scope: hasCampaign ? 'campaign' : 'ad_group',
      scope_id: hasCampaign ? campaign_id : ad_group_id,
    },
    status: 200,
  };
}

// --- Helpers compartidos ---

// UUID regex — defense-in-depth antes de interpolar client_id en PostgREST.
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- List Search Ad Groups (flat con métricas 30d + ad_strength del mejor RSA) ---
// Usa channel_type=SEARCH + métricas agregadas. Ad strength viene de ad_group_ad
// (sacamos el mejor RSA activo como representante del AG).
async function handleListSearchAdGroups(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, accountCurrency: string
): Promise<{ body: any; status: number }> {
  // Query 1: ad groups base + métricas
  const agQuery = `
    SELECT
      ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros,
      campaign.id, campaign.name, campaign.status,
      metrics.clicks, metrics.impressions, metrics.cost_micros,
      metrics.conversions, metrics.ctr
    FROM ad_group
    WHERE campaign.advertising_channel_type = 'SEARCH'
      AND ad_group.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
      AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.cost_micros DESC
  `;

  const [agResult, adResult] = await Promise.all([
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, agQuery),
    // Query 2: ad_strength del mejor RSA por ad_group (tomamos el primer RSA activo)
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
      SELECT ad_group.id, ad_group_ad.ad_strength, ad_group_ad.status
      FROM ad_group_ad
      WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
        AND ad_group_ad.status = 'ENABLED'
        AND campaign.advertising_channel_type = 'SEARCH'
    `),
  ]);

  const warnings: string[] = [];
  if (!agResult.ok) return { body: { error: 'Failed to fetch ad groups', details: agResult.error }, status: 502 };
  if (!adResult.ok) warnings.push('No se pudo obtener ad_strength de los RSAs');

  // Agregamos por ad_group_id (GAQL con segments devuelve 1 row por día)
  const agMap = new Map<string, any>();
  for (const row of agResult.data || []) {
    const id = String(row.adGroup?.id);
    if (!agMap.has(id)) {
      agMap.set(id, {
        id,
        name: row.adGroup?.name,
        status: row.adGroup?.status,
        cpc_bid_micros: Number(row.adGroup?.cpcBidMicros || 0),
        campaign_id: row.campaign?.id,
        campaign_name: row.campaign?.name,
        clicks: 0, impressions: 0, cost_micros: 0, conversions: 0,
      });
    }
    const ag = agMap.get(id)!;
    ag.clicks += Number(row.metrics?.clicks || 0);
    ag.impressions += Number(row.metrics?.impressions || 0);
    ag.cost_micros += Number(row.metrics?.costMicros || 0);
    ag.conversions += Number(row.metrics?.conversions || 0);
  }

  // Mergear ad_strength (primer RSA activo por AG)
  const strengthByAg = new Map<string, string>();
  for (const row of adResult.data || []) {
    const agId = String(row.adGroup?.id);
    if (!strengthByAg.has(agId) && row.adGroupAd?.adStrength) {
      strengthByAg.set(agId, row.adGroupAd.adStrength);
    }
  }

  const ad_groups = await Promise.all(Array.from(agMap.values()).map(async (ag) => {
    const costCurrency = ag.cost_micros / 1_000_000;
    const costCLP = await convertToCLP(costCurrency, accountCurrency);
    return {
      ...ag,
      cost_currency: costCurrency,
      cost_clp: Math.round(costCLP),
      ctr: ag.impressions > 0 ? (ag.clicks / ag.impressions * 100) : 0,
      ad_strength: strengthByAg.get(ag.id) || 'UNSPECIFIED',
      currency: accountCurrency,
    };
  }));

  ad_groups.sort((a, b) => b.cost_micros - a.cost_micros);

  return { body: { success: true, ad_groups, warnings: warnings.length > 0 ? warnings : undefined }, status: 200 };
}

// --- Orquestador: get_ad_group_detail (keywords + RSAs + extensions en paralelo) ---
async function handleGetAdGroupDetail(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, accountCurrency: string, adGroupId: string
): Promise<{ body: any; status: number }> {
  if (!validateNumericId(adGroupId)) return { body: { error: 'ad_group_id inválido' }, status: 400 };

  const warnings: string[] = [];

  // 3 queries paralelas: keywords, RSAs, extensions linkeadas al AG
  const [kwRes, rsaRes, extRes] = await Promise.all([
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
      SELECT
        ad_group_criterion.criterion_id, ad_group_criterion.resource_name,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.status, ad_group_criterion.cpc_bid_micros,
        ad_group_criterion.negative, ad_group_criterion.quality_info.quality_score,
        metrics.clicks, metrics.impressions, metrics.conversions, metrics.cost_micros
      FROM keyword_view
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_criterion.status != 'REMOVED'
        AND segments.date DURING LAST_30_DAYS
    `),
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
      SELECT
        ad_group_ad.resource_name, ad_group_ad.ad.id, ad_group_ad.status,
        ad_group_ad.ad_strength, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad.responsive_search_ad.path1,
        ad_group_ad.ad.responsive_search_ad.path2
      FROM ad_group_ad
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
        AND ad_group_ad.status != 'REMOVED'
    `),
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, `
      SELECT
        ad_group_asset.resource_name, ad_group_asset.field_type, ad_group_asset.status,
        asset.resource_name, asset.type, asset.name,
        asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2,
        asset.callout_asset.callout_text,
        asset.structured_snippet_asset.header, asset.structured_snippet_asset.values,
        asset.call_asset.phone_number,
        asset.price_asset.type
      FROM ad_group_asset
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_asset.status != 'REMOVED'
    `),
  ]);

  if (!kwRes.ok) warnings.push('Keywords no disponibles: ' + (kwRes.error || 'error'));
  if (!rsaRes.ok) warnings.push('RSAs no disponibles: ' + (rsaRes.error || 'error'));
  if (!extRes.ok) warnings.push('Extensions no disponibles: ' + (extRes.error || 'error'));

  // Agregar keywords (keyword_view con segments.date devuelve 1 row por día)
  const kwMap = new Map<string, any>();
  for (const row of kwRes.data || []) {
    const cid = String(row.adGroupCriterion?.criterionId);
    if (!kwMap.has(cid)) {
      kwMap.set(cid, {
        criterion_id: cid,
        resource_name: row.adGroupCriterion?.resourceName,
        text: row.adGroupCriterion?.keyword?.text,
        match_type: row.adGroupCriterion?.keyword?.matchType,
        status: row.adGroupCriterion?.status,
        cpc_bid_micros: Number(row.adGroupCriterion?.cpcBidMicros || 0),
        negative: !!row.adGroupCriterion?.negative,
        quality_score: row.adGroupCriterion?.qualityInfo?.qualityScore || null,
        clicks: 0, impressions: 0, conversions: 0, cost_micros: 0,
      });
    }
    const kw = kwMap.get(cid)!;
    kw.clicks += Number(row.metrics?.clicks || 0);
    kw.impressions += Number(row.metrics?.impressions || 0);
    kw.conversions += Number(row.metrics?.conversions || 0);
    kw.cost_micros += Number(row.metrics?.costMicros || 0);
  }
  const keywords_positive: any[] = [];
  const keywords_negative: any[] = [];
  for (const kw of kwMap.values()) {
    if (kw.negative) keywords_negative.push(kw);
    else keywords_positive.push(kw);
  }

  // RSAs
  const rsas = (rsaRes.data || []).map((row: any) => ({
    resource_name: row.adGroupAd?.resourceName,
    ad_id: row.adGroupAd?.ad?.id,
    status: row.adGroupAd?.status,
    ad_strength: row.adGroupAd?.adStrength,
    final_urls: row.adGroupAd?.ad?.finalUrls || [],
    headlines: row.adGroupAd?.ad?.responsiveSearchAd?.headlines || [],
    descriptions: row.adGroupAd?.ad?.responsiveSearchAd?.descriptions || [],
    path1: row.adGroupAd?.ad?.responsiveSearchAd?.path1 || '',
    path2: row.adGroupAd?.ad?.responsiveSearchAd?.path2 || '',
  }));

  // Extensions agrupadas por field_type
  const extensions: Record<string, any[]> = {
    SITELINK: [], CALLOUT: [], STRUCTURED_SNIPPET: [], CALL: [], PRICE: [],
  };
  for (const row of extRes.data || []) {
    const ft = row.adGroupAsset?.fieldType;
    if (!ft || !extensions[ft]) continue;
    extensions[ft].push({
      link_resource: row.adGroupAsset?.resourceName,
      asset_resource: row.asset?.resourceName,
      asset_name: row.asset?.name,
      status: row.adGroupAsset?.status,
      sitelink: row.asset?.sitelinkAsset
        ? {
            link_text: row.asset.sitelinkAsset.linkText,
            description1: row.asset.sitelinkAsset.description1,
            description2: row.asset.sitelinkAsset.description2,
          }
        : undefined,
      callout_text: row.asset?.calloutAsset?.calloutText,
      snippet: row.asset?.structuredSnippetAsset
        ? { header: row.asset.structuredSnippetAsset.header, values: row.asset.structuredSnippetAsset.values }
        : undefined,
      phone_number: row.asset?.callAsset?.phoneNumber,
      price_type: row.asset?.priceAsset?.type,
    });
  }

  return {
    body: {
      success: true,
      ad_group_id: adGroupId,
      keywords_positive,
      keywords_negative,
      rsas,
      extensions,
      counts: {
        keywords: keywords_positive.length,
        negatives: keywords_negative.length,
        rsas: rsas.length,
        sitelinks: extensions.SITELINK.length,
        callouts: extensions.CALLOUT.length,
        snippets: extensions.STRUCTURED_SNIPPET.length,
        calls: extensions.CALL.length,
        prices: extensions.PRICE.length,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    status: 200,
  };
}

// --- Remove negative keyword (extendido para soportar ad_group + campaign scope XOR) ---
async function handleRemoveNegativeKeyword(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { resource_name, scope } = data;
  if (!resource_name || typeof resource_name !== 'string') {
    return { body: { error: 'Missing resource_name' }, status: 400 };
  }
  if (scope !== 'campaign' && scope !== 'ad_group') {
    return { body: { error: 'scope must be "campaign" or "ad_group"' }, status: 400 };
  }

  // Validate shape compound
  const campaignCompound = /^customers\/\d+\/campaignCriteria\/\d+~\d+$/;
  const adGroupCompound = /^customers\/\d+\/adGroupCriteria\/\d+~\d+$/;
  if (scope === 'campaign' && !campaignCompound.test(resource_name)) {
    return { body: { error: 'resource_name shape inválido para campaign' }, status: 400 };
  }
  if (scope === 'ad_group' && !adGroupCompound.test(resource_name)) {
    return { body: { error: 'resource_name shape inválido para ad_group' }, status: 400 };
  }

  const opKey = scope === 'campaign' ? 'campaignCriterionOperation' : 'adGroupCriterionOperation';
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    [opKey]: { remove: resource_name },
  }]);

  if (!result.ok) return { body: { error: 'Failed to remove negative keyword', details: result.error }, status: 502 };
  return { body: { success: true, scope }, status: 200 };
}

// --- Steve AI: suggest_keywords con Claude Haiku + brief ---
// Reusa el patrón callClaude + retry-on-shortfall del handleSuggestAssetContent.
async function handleSuggestKeywords(
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { client_id, user_intent, count = 10, match_type_default = 'BROAD' } = data;
  const warnings: string[] = [];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { body: { error: 'ANTHROPIC_API_KEY not configured' }, status: 500 };

  // Defense-in-depth: UUID_RX antes de interpolar client_id
  let briefContext = '';
  if (client_id && UUID_RX.test(String(client_id).trim())) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const safeClientId = String(client_id).trim();
    if (supabaseUrl && supabaseKey) {
      try {
        const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
        const bpRes = await fetch(
          `${supabaseUrl}/rest/v1/buyer_personas?client_id=eq.${safeClientId}&select=persona_data&limit=1`,
          { headers, signal: AbortSignal.timeout(5_000) }
        );
        if (bpRes.ok) {
          const rows = await bpRes.json() as any[];
          const pd = rows?.[0]?.persona_data;
          if (pd && Array.isArray(pd.raw_responses)) {
            briefContext = pd.raw_responses
              .filter((r: any) => typeof r === 'string' && r.trim())
              .map((r: string) => r.trim())
              .join('\n')
              .slice(0, 3000);
          }
        }
      } catch (err: any) {
        console.warn('[suggest_keywords] brief fetch failed:', err.message);
        warnings.push('Brief del cliente no disponible — contexto genérico');
      }
    }
  }

  const validMatchType = ['BROAD', 'PHRASE', 'EXACT'].includes(match_type_default) ? match_type_default : 'BROAD';
  const n = Math.max(5, Math.min(Number(count) || 10, 20));

  const prompt = `Eres Steve, experto en Google Ads Search y keyword research.
${briefContext ? `\n## BRIEF DEL CLIENTE\n${briefContext}\n` : ''}
${user_intent ? `\n## OBJETIVO (palabras del usuario)\n${user_intent}\n` : ''}
${!briefContext && !user_intent ? '\nNo hay brief. Genera keywords genéricas pero profesionales.\n' : ''}

Genera ${n} keywords para una campaña Search de Google Ads.

REGLAS ESTRICTAS:
- Cada keyword MAX 80 caracteres (Google Ads limit)
- match_type default: "${validMatchType}" — pero podés sugerir EXACT para keywords muy específicas o PHRASE para frases clave
- Mix de intención: informacional (top-funnel), comercial (comparación), transaccional (compra)
- En español neutro LATAM. Si el brief menciona país específico, adaptá regionalismos.
- NO usar marcas de competidores directos (salvo que user_intent lo pida explícito)

También genera 5 negative keywords obvios derivados del brief (ej: si el brief dice "solo B2B", negativos: "gratis", "barato", "diy", "casero"; si dice "premium", negativo: "barato", "descuento").

Responde SOLO JSON válido sin markdown:
{
  "options": [{"text": "...", "match_type": "BROAD|PHRASE|EXACT", "intent": "informacional|comercial|transaccional", "reason": "1 línea"}],
  "negative_suggestions": [{"text": "...", "reason": "1 línea"}],
  "reasoning": "1-2 líneas general"
}`;

  const callClaude = async (userPrompt: string): Promise<{ options: any[]; negatives: any[]; reasoning: string | null; parseError?: boolean }> => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json() as any;
    let text = result?.content?.[0]?.text || '{}';
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return { options: [], negatives: [], reasoning: null, parseError: true }; }

    const rawOptions = Array.isArray(parsed.options) ? parsed.options : [];
    const options = rawOptions
      .map((o: any) => ({
        text: typeof o?.text === 'string' ? o.text.trim().slice(0, 80) : '',
        match_type: ['BROAD', 'PHRASE', 'EXACT'].includes(o?.match_type) ? o.match_type : validMatchType,
        intent: typeof o?.intent === 'string' ? o.intent : null,
        reason: typeof o?.reason === 'string' ? o.reason : null,
      }))
      .filter((o: any) => o.text.length > 0 && o.text.length <= 80);

    const rawNegatives = Array.isArray(parsed.negative_suggestions) ? parsed.negative_suggestions : [];
    const negatives = rawNegatives
      .map((n: any) => ({
        text: typeof n?.text === 'string' ? n.text.trim().slice(0, 80) : '',
        reason: typeof n?.reason === 'string' ? n.reason : null,
      }))
      .filter((n: any) => n.text.length > 0 && n.text.length <= 80);

    return { options, negatives, reasoning: parsed.reasoning || null };
  };

  try {
    const first = await callClaude(prompt);
    let options = first.options;
    let negatives = first.negatives;
    let reasoning = first.reasoning;

    // Retry-on-shortfall si Claude devolvió < mitad del count pedido
    if (options.length < Math.ceil(n / 2) && !first.parseError) {
      const need = n - options.length;
      const retryPrompt = `${prompt}\n\nNOTA: Generaste solo ${options.length} opciones. Genera ${need} más distintas a éstas:\n${options.map((o, i) => `${i + 1}. ${o.text}`).join('\n')}`;
      const retry = await callClaude(retryPrompt);
      options = [...options, ...retry.options].slice(0, n);
      if (retry.negatives.length > negatives.length) negatives = retry.negatives;
    }

    if (first.parseError && options.length === 0) {
      return { body: { error: 'Failed to parse AI response' }, status: 502 };
    }

    return {
      body: {
        success: true,
        source: 'ai',
        options,
        negative_suggestions: negatives,
        reasoning,
        default_match_type: validMatchType,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      status: 200,
    };
  } catch (err: any) {
    console.error('[suggest_keywords] error:', err);
    return { body: { error: 'AI request failed', details: err.message }, status: 502 };
  }
}

// --- Search Terms Suggestions (Tier 2) ---
// Lee pending del cron para mostrar en UI. Filtra por client_id autenticado.
async function handleListPendingSuggestions(
  clientId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  if (!clientId || !UUID_RX.test(clientId)) {
    return { body: { error: 'Invalid client_id' }, status: 400 };
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return { body: { error: 'Supabase not configured' }, status: 500 };

  const status = data?.status_filter || 'pending';
  const validStatuses = ['pending', 'approved', 'rejected', 'applied', 'failed'];
  if (!validStatuses.includes(status)) {
    return { body: { error: `Invalid status_filter. Valid: ${validStatuses.join(', ')}` }, status: 400 };
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/search_terms_suggestions?client_id=eq.${clientId}&status=eq.${status}&order=created_at.desc&limit=500`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) return { body: { error: 'Failed to fetch suggestions', status_code: res.status }, status: 502 };

  const suggestions = await res.json() as any[];
  return { body: { success: true, suggestions, count: suggestions.length }, status: 200 };
}

// Apply suggestion: ejecuta el add_keyword o add_negative_keyword correspondiente
// y actualiza el row de search_terms_suggestions con status='applied' o 'failed'.
async function handleApplySuggestion(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string,
  clientId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { suggestion_id } = data;
  if (!suggestion_id || !UUID_RX.test(suggestion_id)) {
    return { body: { error: 'Invalid suggestion_id' }, status: 400 };
  }
  if (!UUID_RX.test(clientId)) return { body: { error: 'Invalid client_id' }, status: 400 };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return { body: { error: 'Supabase not configured' }, status: 500 };
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };

  // Fetch suggestion + verify ownership
  const fetchRes = await fetch(
    `${supabaseUrl}/rest/v1/search_terms_suggestions?id=eq.${suggestion_id}&client_id=eq.${clientId}&status=eq.pending&limit=1`,
    { headers, signal: AbortSignal.timeout(5_000) }
  );
  if (!fetchRes.ok) return { body: { error: 'Failed to fetch suggestion' }, status: 502 };
  const rows = await fetchRes.json() as any[];
  const sug = rows[0];
  if (!sug) return { body: { error: 'Suggestion not found or not pending' }, status: 404 };

  // Apply based on type
  let mutateResult: any;
  if (sug.suggestion_type === 'add_keyword') {
    mutateResult = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${sug.ad_group_id}`,
          keyword: { text: sug.search_term, matchType: sug.suggested_match_type || 'EXACT' },
          status: 'ENABLED',
        },
      },
    }]);
  } else if (sug.suggestion_type === 'add_negative_adgroup') {
    mutateResult = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
      adGroupCriterionOperation: {
        create: {
          adGroup: `customers/${customerId}/adGroups/${sug.ad_group_id}`,
          keyword: { text: sug.search_term, matchType: sug.suggested_match_type || 'EXACT' },
          negative: true,
        },
      },
    }]);
  } else if (sug.suggestion_type === 'add_negative_campaign') {
    mutateResult = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
      campaignCriterionOperation: {
        create: {
          campaign: `customers/${customerId}/campaigns/${sug.campaign_id}`,
          keyword: { text: sug.search_term, matchType: sug.suggested_match_type || 'EXACT' },
          negative: true,
        },
      },
    }]);
  } else {
    return { body: { error: `Unknown suggestion_type: ${sug.suggestion_type}` }, status: 400 };
  }

  // Update suggestion status
  const success = mutateResult.ok;
  const appliedResourceName = success ? (mutateResult.data?.mutateOperationResponses?.[0]?.adGroupCriterionResult?.resourceName
    || mutateResult.data?.mutateOperationResponses?.[0]?.campaignCriterionResult?.resourceName
    || null) : null;

  await fetch(
    `${supabaseUrl}/rest/v1/search_terms_suggestions?id=eq.${suggestion_id}`,
    {
      method: 'PATCH', headers,
      body: JSON.stringify({
        status: success ? 'applied' : 'failed',
        applied_at: new Date().toISOString(),
        applied_resource_name: appliedResourceName,
        applied_error: success ? null : String(mutateResult.error || 'unknown'),
      }),
    }
  );

  if (!success) return { body: { error: 'Failed to apply suggestion', details: mutateResult.error }, status: 502 };
  return { body: { success: true, suggestion_id, applied_resource_name: appliedResourceName }, status: 200 };
}

// Reject: marca rejected sin ejecutar
async function handleRejectSuggestion(
  userId: string, clientId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { suggestion_id } = data;
  if (!suggestion_id || !UUID_RX.test(suggestion_id)) return { body: { error: 'Invalid suggestion_id' }, status: 400 };
  if (!UUID_RX.test(clientId)) return { body: { error: 'Invalid client_id' }, status: 400 };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return { body: { error: 'Supabase not configured' }, status: 500 };
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' };

  const res = await fetch(
    `${supabaseUrl}/rest/v1/search_terms_suggestions?id=eq.${suggestion_id}&client_id=eq.${clientId}&status=eq.pending`,
    {
      method: 'PATCH', headers,
      body: JSON.stringify({
        status: 'rejected',
        rejected_by: UUID_RX.test(userId) ? userId : null,
        rejected_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) return { body: { error: 'Failed to reject suggestion' }, status: 502 };
  return { body: { success: true, suggestion_id }, status: 200 };
}

// --- Main handler ---

export async function manageGoogleKeywords(c: Context) {
  try {
    const body: RequestBody = await c.req.json();
    const { action, connection_id, campaign_id, ad_group_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = [
      'list_ad_groups', 'list_search_ad_groups', 'get_ad_group_detail',
      'list_keywords', 'add_keyword', 'update_keyword', 'remove_keyword',
      'list_search_terms', 'add_negative_keyword', 'remove_negative_keyword',
      'suggest_keywords',
    ];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    // suggest_keywords is the only action that does NOT need Google connection
    // (solo necesita ANTHROPIC_API_KEY + brief del cliente). Short-circuit temprano.
    if (action === 'suggest_keywords') {
      const result = await handleSuggestKeywords(data || {});
      return c.json(result.body, result.status as any);
    }

    // Validate numeric IDs to prevent GAQL injection
    if (!validateNumericId(campaign_id)) return c.json({ error: 'campaign_id must be numeric' }, 400);
    if (!validateNumericId(ad_group_id)) return c.json({ error: 'ad_group_id must be numeric' }, 400);

    console.log(`[manage-google-keywords] Action: ${action}, Connection: ${connection_id}`);

    const resolved = await resolveConnectionAndToken(c, connection_id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status as any);
    }
    const { ctx } = resolved;
    const { customerId, accessToken, developerToken, loginCustomerId } = ctx;

    const needsCurrency = ['list_keywords', 'list_search_terms', 'list_search_ad_groups', 'get_ad_group_detail'].includes(action);
    const accountCurrency = needsCurrency
      ? await fetchGoogleAccountCurrency(customerId, accessToken, developerToken, loginCustomerId)
      : 'USD';

    let result: { body: any; status: number };

    switch (action) {
      case 'list_ad_groups':
        result = await handleListAdGroups(customerId, accessToken, developerToken, loginCustomerId);
        break;
      case 'list_search_ad_groups':
        result = await handleListSearchAdGroups(customerId, accessToken, developerToken, loginCustomerId, accountCurrency);
        break;
      case 'get_ad_group_detail':
        result = await handleGetAdGroupDetail(customerId, accessToken, developerToken, loginCustomerId, accountCurrency, ad_group_id!);
        break;
      case 'list_keywords':
        result = await handleListKeywords(customerId, accessToken, developerToken, loginCustomerId, accountCurrency, campaign_id, ad_group_id);
        break;
      case 'add_keyword':
        result = await handleAddKeyword(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'update_keyword':
        result = await handleUpdateKeyword(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'remove_keyword':
        result = await handleRemoveKeyword(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'list_search_terms':
        result = await handleListSearchTerms(customerId, accessToken, developerToken, loginCustomerId, accountCurrency, campaign_id);
        break;
      case 'add_negative_keyword':
        result = await handleAddNegativeKeyword(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'remove_negative_keyword':
        result = await handleRemoveNegativeKeyword(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-keywords] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
