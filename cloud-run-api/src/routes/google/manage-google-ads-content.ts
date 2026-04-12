import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

type Action = 'list_rsa' | 'create_rsa' | 'pause_ad' | 'enable_ad' | 'list_ad_groups';

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  ad_group_id?: string;
  data?: Record<string, any>;
}

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';

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
    await response.text().catch(() => {}); // drain body to free socket
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[manage-google-ads-content] GAQL error (${response.status}):`, errorText.slice(0, 2000));
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
    await response.text().catch(() => {}); // drain body to free socket
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[manage-google-ads-content] Mutate error (${response.status}):`, errorText.slice(0, 2000));
    let errorMessage = `Google Ads API error (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      const detail = errJson?.error?.message || errJson?.[0]?.error?.message;
      if (detail) errorMessage = detail;
    } catch {}
    return { ok: false, error: errorMessage };
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: 'Failed to parse Google Ads mutate response' };
  }
  return { ok: true, data };
}

// --- Helpers ---

function validateNumericId(value: string | undefined): boolean {
  return !value || (/^\d+$/.test(value) && value.length <= 20);
}

function validateResourceName(resourceName: string, customerId: string): boolean {
  return resourceName.startsWith(`customers/${customerId}/`);
}

// --- Action handlers ---

async function handleListRSA(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, campaignId?: string, adGroupId?: string
): Promise<{ body: any; status: number }> {
  if (!validateNumericId(campaignId)) return { body: { error: 'campaign_id must be numeric' }, status: 400 };
  if (!validateNumericId(adGroupId)) return { body: { error: 'ad_group_id must be numeric' }, status: 400 };

  let whereClause = `
    WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
      AND campaign.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
  `;
  if (campaignId) whereClause += `\n      AND campaign.id = ${campaignId}`;
  if (adGroupId) whereClause += `\n      AND ad_group.id = ${adGroupId}`;

  const query = `
    SELECT
      ad_group_ad.resource_name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.responsive_search_ad.path1,
      ad_group_ad.ad.responsive_search_ad.path2,
      ad_group_ad.ad.final_urls,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.status,
      ad_group_ad.ad.strength,
      ad_group.id, ad_group.name,
      campaign.id, campaign.name,
      metrics.clicks, metrics.impressions, metrics.ctr
    FROM ad_group_ad
    ${whereClause}
    ORDER BY campaign.name, ad_group.name
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch RSA ads', details: result.error }, status: 502 };

  const ads = (result.data || []).map((row: any) => ({
    resource_name: row.adGroupAd?.resourceName,
    ad_id: row.adGroupAd?.ad?.id,
    headlines: (row.adGroupAd?.ad?.responsiveSearchAd?.headlines || []).map((h: any) => ({
      text: h.text,
      pinned_field: h.pinnedField || null,
    })),
    descriptions: (row.adGroupAd?.ad?.responsiveSearchAd?.descriptions || []).map((d: any) => ({
      text: d.text,
      pinned_field: d.pinnedField || null,
    })),
    path1: row.adGroupAd?.ad?.responsiveSearchAd?.path1 || '',
    path2: row.adGroupAd?.ad?.responsiveSearchAd?.path2 || '',
    final_urls: row.adGroupAd?.ad?.finalUrls || [],
    approval_status: row.adGroupAd?.policySummary?.approvalStatus || 'UNKNOWN',
    status: row.adGroupAd?.status,
    ad_strength: row.adGroupAd?.ad?.strength || 'UNSPECIFIED',
    ad_group_id: row.adGroup?.id,
    ad_group_name: row.adGroup?.name,
    campaign_id: row.campaign?.id,
    campaign_name: row.campaign?.name,
    clicks: Number(row.metrics?.clicks || 0),
    impressions: Number(row.metrics?.impressions || 0),
    ctr: Number(row.metrics?.ctr || 0) * 100,
  }));

  return { body: { success: true, ads }, status: 200 };
}

async function handleCreateRSA(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { ad_group_id, headlines, descriptions, final_urls, path1, path2 } = data;

  if (!ad_group_id) return { body: { error: 'Missing ad_group_id' }, status: 400 };
  if (!validateNumericId(ad_group_id)) return { body: { error: 'ad_group_id must be numeric' }, status: 400 };
  if (!headlines || !Array.isArray(headlines) || headlines.length < 3 || headlines.length > 15) {
    return { body: { error: 'headlines must be an array of 3-15 items' }, status: 400 };
  }
  if (!descriptions || !Array.isArray(descriptions) || descriptions.length < 2 || descriptions.length > 4) {
    return { body: { error: 'descriptions must be an array of 2-4 items' }, status: 400 };
  }
  if (!final_urls || !Array.isArray(final_urls) || final_urls.length === 0) {
    return { body: { error: 'At least one final_url is required' }, status: 400 };
  }

  // Validate char limits
  for (const h of headlines) {
    const text = typeof h === 'string' ? h : h.text;
    if (!text || text.length > 30) {
      return { body: { error: `Headline "${text}" exceeds 30 character limit` }, status: 400 };
    }
  }
  for (const d of descriptions) {
    const text = typeof d === 'string' ? d : d.text;
    if (!text || text.length > 90) {
      return { body: { error: `Description exceeds 90 character limit` }, status: 400 };
    }
  }

  const formattedHeadlines = headlines.map((h: any) => {
    const obj: any = { text: typeof h === 'string' ? h : h.text };
    if (h.pinned_field) obj.pinnedField = h.pinned_field;
    return obj;
  });

  const formattedDescriptions = descriptions.map((d: any) => {
    const obj: any = { text: typeof d === 'string' ? d : d.text };
    if (d.pinned_field) obj.pinnedField = d.pinned_field;
    return obj;
  });

  const adGroupResource = `customers/${customerId}/adGroups/${ad_group_id}`;

  const adBody: any = {
    responsiveSearchAd: {
      headlines: formattedHeadlines,
      descriptions: formattedDescriptions,
    },
    finalUrls: final_urls,
  };

  if (path1) adBody.responsiveSearchAd.path1 = path1.slice(0, 15);
  if (path2) adBody.responsiveSearchAd.path2 = path2.slice(0, 15);

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupAdOperation: {
      create: {
        adGroup: adGroupResource,
        ad: adBody,
        status: 'ENABLED',
      },
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to create RSA', details: result.error }, status: 502 };
  return { body: { success: true, message: 'RSA created successfully' }, status: 200 };
}

async function handlePauseEnableAd(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>, newStatus: string
): Promise<{ body: any; status: number }> {
  const { resource_name } = data;
  if (!resource_name) return { body: { error: 'Missing resource_name' }, status: 400 };
  if (!validateResourceName(resource_name, customerId)) {
    return { body: { error: 'Invalid resource_name for this account' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    adGroupAdOperation: {
      update: { resourceName: resource_name, status: newStatus },
      updateMask: 'status',
    },
  }]);

  if (!result.ok) return { body: { error: `Failed to ${newStatus === 'PAUSED' ? 'pause' : 'enable'} ad`, details: result.error }, status: 502 };
  return { body: { success: true, status: newStatus }, status: 200 };
}

async function handleListAdGroups(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name
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
  }));

  return { body: { success: true, ad_groups: adGroups }, status: 200 };
}

// --- Main handler ---

export async function manageGoogleAdsContent(c: Context) {
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

    const validActions: Action[] = ['list_rsa', 'create_rsa', 'pause_ad', 'enable_ad', 'list_ad_groups'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    console.log(`[manage-google-ads-content] Action: ${action}, Connection: ${connection_id}`);

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

    if (!isCron && user) {
      const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
      const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
      if (!isOwner) {
        const adminRole = await safeQuerySingleOrDefault<any>(
          supabase.from('user_roles').select('role').eq('user_id', user.id)
            .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
          null, 'manageGoogleAdsContent.getAdminRole',
        );
        if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) return c.json({ error: 'Missing Google Ads account_id' }, 400);

    const tokenResult = await getGoogleTokenForConnection(supabase, connection);
    const { accessToken } = tokenResult;
    const customerId = connection.account_id;
    const loginCustomerId = tokenResult.mccCustomerId || customerId;

    let result: { body: any; status: number };

    switch (action) {
      case 'list_rsa':
        result = await handleListRSA(customerId, accessToken, developerToken, loginCustomerId, campaign_id, ad_group_id);
        break;
      case 'create_rsa':
        result = await handleCreateRSA(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'pause_ad':
        result = await handlePauseEnableAd(customerId, accessToken, developerToken, loginCustomerId, data || {}, 'PAUSED');
        break;
      case 'enable_ad':
        result = await handlePauseEnableAd(customerId, accessToken, developerToken, loginCustomerId, data || {}, 'ENABLED');
        break;
      case 'list_ad_groups':
        result = await handleListAdGroups(customerId, accessToken, developerToken, loginCustomerId);
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-ads-content] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
