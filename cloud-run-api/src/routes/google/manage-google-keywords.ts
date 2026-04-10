import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { convertToCLP, fetchGoogleAccountCurrency } from '../../lib/currency.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

type Action = 'list_ad_groups' | 'list_keywords' | 'add_keyword' | 'update_keyword' | 'remove_keyword' | 'list_search_terms' | 'add_negative_keyword';

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  ad_group_id?: string;
  data?: Record<string, any>;
}

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';

function validateNumericId(value: string | undefined): boolean {
  return !value || /^\d+$/.test(value);
}

async function googleAdsQuery(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, query: string
): Promise<{ ok: boolean; data?: any[]; error?: string }> {
  const makeRequest = async (loginId: string) => {
    return fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
  };

  let response = await makeRequest(loginCustomerId);
  if (response.status === 403 && loginCustomerId !== customerId) {
    console.warn(`[manage-google-keywords] MCC login ${loginCustomerId} denied, retrying with ${customerId}`);
    await response.text().catch(() => {}); // drain body to free socket
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[manage-google-keywords] GAQL error (${response.status}):`, errorText.slice(0, 500));
    return { ok: false, error: `Google Ads API error (${response.status})` };
  }

  const responseText = await response.text();
  let results: any[] = [];
  try {
    const json = JSON.parse(responseText);
    if (Array.isArray(json)) {
      for (const batch of json) {
        if (batch.results) results = results.concat(batch.results);
      }
    } else if (json.results) {
      results = json.results;
    }
  } catch {
    return { ok: false, error: 'Failed to parse Google Ads response' };
  }
  return { ok: true, data: results };
}

async function googleAdsMutate(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, mutateOperations: any[]
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const makeRequest = async (loginId: string) => {
    return fetch(`${GOOGLE_ADS_API}/customers/${customerId}/googleAds:mutate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutateOperations }),
      signal: AbortSignal.timeout(15_000),
    });
  };

  let response = await makeRequest(loginCustomerId);
  if (response.status === 403 && loginCustomerId !== customerId) {
    console.warn(`[manage-google-keywords] MCC mutate ${loginCustomerId} denied, retrying with ${customerId}`);
    await response.text().catch(() => {}); // drain body to free socket
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[manage-google-keywords] Mutate error (${response.status}):`, errorText.slice(0, 500));
    let errorMessage = `Google Ads API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      const detail = errJson?.error?.message || errJson?.[0]?.error?.message;
      if (detail) errorMessage = detail;
    } catch {}
    return { ok: false, error: errorMessage };
  }

  const data = await response.json();
  return { ok: true, data };
}

// --- Action handlers ---

async function handleListAdGroups(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name
    FROM ad_group
    WHERE campaign.advertising_channel_type = 'SEARCH'
      AND campaign.status != 'REMOVED'
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
  }));

  return { body: { success: true, ad_groups: adGroups }, status: 200 };
}

async function handleListKeywords(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, accountCurrency: string,
  campaignId?: string, adGroupId?: string
): Promise<{ body: any; status: number }> {
  let whereClause = `
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.status != 'REMOVED'
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
    FROM ad_group_criterion
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

async function handleAddNegativeKeyword(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { campaign_id, keyword_text, match_type } = data;
  if (!campaign_id || !keyword_text) {
    return { body: { error: 'Missing required fields: campaign_id, keyword_text' }, status: 400 };
  }
  if (!validateNumericId(campaign_id)) return { body: { error: 'campaign_id must be numeric' }, status: 400 };

  const validNegMatchTypes = ['EXACT', 'PHRASE', 'BROAD'];
  const negativeMatchType = validNegMatchTypes.includes(match_type) ? match_type : 'EXACT';

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignCriterionOperation: {
      create: {
        campaign: `customers/${customerId}/campaigns/${campaign_id}`,
        keyword: { text: keyword_text, matchType: negativeMatchType },
        negative: true,
      },
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to add negative keyword', details: result.error }, status: 502 };
  return { body: { success: true, keyword_text, match_type: negativeMatchType, campaign_id }, status: 200 };
}

// --- Main handler ---

export async function manageGoogleKeywords(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) return c.json({ error: 'Google Ads developer token not configured' }, 500);

    const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));
    let user: { id: string } | null = null;
    if (!isCron) {
      user = c.get('user');
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
    }

    const body: RequestBody = await c.req.json();
    const { action, connection_id, campaign_id, ad_group_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = ['list_ad_groups', 'list_keywords', 'add_keyword', 'update_keyword', 'remove_keyword', 'list_search_terms', 'add_negative_keyword'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    // Validate numeric IDs to prevent GAQL injection
    if (!validateNumericId(campaign_id)) return c.json({ error: 'campaign_id must be numeric' }, 400);
    if (!validateNumericId(ad_group_id)) return c.json({ error: 'ad_group_id must be numeric' }, 400);

    console.log(`[manage-google-keywords] Action: ${action}, Connection: ${connection_id}`);

    // Fetch connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, refresh_token_encrypted,
        connection_type, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'google')
      .maybeSingle();

    if (connError || !connection) return c.json({ error: 'Connection not found' }, 404);

    // Verify ownership
    if (!isCron && user) {
      const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
      const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
      if (!isOwner) {
        const adminRole = await safeQuerySingleOrDefault<any>(
          supabase.from('user_roles').select('role').eq('user_id', user.id)
            .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
          null, 'manageGoogleKeywords.getAdminRole',
        );
        if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) return c.json({ error: 'Missing Google Ads account_id' }, 400);

    const tokenResult = await getGoogleTokenForConnection(supabase, connection);
    const { accessToken } = tokenResult;
    const customerId = connection.account_id;
    const loginCustomerId = tokenResult.mccCustomerId || customerId;

    const needsCurrency = ['list_keywords', 'list_search_terms'].includes(action);
    const accountCurrency = needsCurrency
      ? await fetchGoogleAccountCurrency(customerId, accessToken, developerToken, loginCustomerId)
      : 'USD';

    let result: { body: any; status: number };

    switch (action) {
      case 'list_ad_groups':
        result = await handleListAdGroups(customerId, accessToken, developerToken, loginCustomerId);
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
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-keywords] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
