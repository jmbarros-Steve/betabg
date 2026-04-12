import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

type Action = 'list_assets' | 'list_campaign_assets' | 'create_sitelink' | 'create_callout' | 'create_snippet' | 'create_call' | 'link_asset' | 'unlink_asset' | 'remove_asset';

interface RequestBody {
  action: Action;
  connection_id: string;
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
    console.error(`[manage-google-extensions] GAQL error (${response.status}):`, errorText.slice(0, 2000));
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
    console.error(`[manage-google-extensions] Mutate error (${response.status}):`, errorText.slice(0, 2000));
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
  if (resourceName.includes('..') || resourceName.includes('//')) return false;
  return resourceName.startsWith(`customers/${customerId}/`);
}

// --- Action handlers ---

async function handleListAssets(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT
      asset.id, asset.name, asset.type,
      asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, asset.final_urls,
      asset.callout_asset.callout_text,
      asset.structured_snippet_asset.header, asset.structured_snippet_asset.values,
      asset.call_asset.phone_number, asset.call_asset.country_code
    FROM asset
    WHERE asset.type IN ('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'CALL')
    ORDER BY asset.type, asset.id
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch assets', details: result.error }, status: 502 };

  const assets = (result.data || []).map((row: any) => {
    const asset: any = {
      id: row.asset?.id,
      name: row.asset?.name,
      type: row.asset?.type,
    };

    if (row.asset?.type === 'SITELINK') {
      asset.link_text = row.asset?.sitelinkAsset?.linkText;
      asset.description1 = row.asset?.sitelinkAsset?.description1;
      asset.description2 = row.asset?.sitelinkAsset?.description2;
      asset.final_urls = row.asset?.finalUrls;
    } else if (row.asset?.type === 'CALLOUT') {
      asset.callout_text = row.asset?.calloutAsset?.calloutText;
    } else if (row.asset?.type === 'STRUCTURED_SNIPPET') {
      asset.header = row.asset?.structuredSnippetAsset?.header;
      asset.values = row.asset?.structuredSnippetAsset?.values;
    } else if (row.asset?.type === 'CALL') {
      asset.phone_number = row.asset?.callAsset?.phoneNumber;
      asset.country_code = row.asset?.callAsset?.countryCode;
    }

    return asset;
  });

  return { body: { success: true, assets }, status: 200 };
}

async function handleListCampaignAssets(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT
      campaign_asset.resource_name, campaign_asset.status, campaign_asset.field_type,
      campaign.id, campaign.name,
      asset.id, asset.type
    FROM campaign_asset
    WHERE campaign_asset.status != 'REMOVED'
    ORDER BY campaign.name
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch campaign assets', details: result.error }, status: 502 };

  const campaignAssets = (result.data || []).map((row: any) => ({
    resource_name: row.campaignAsset?.resourceName,
    status: row.campaignAsset?.status,
    field_type: row.campaignAsset?.fieldType,
    campaign_id: row.campaign?.id,
    campaign_name: row.campaign?.name,
    asset_id: row.asset?.id,
    asset_type: row.asset?.type,
  }));

  return { body: { success: true, campaign_assets: campaignAssets }, status: 200 };
}

// Extract asset ID from mutate response resource name (customers/123/assets/456 → 456)
function extractAssetId(mutateResult: any): string | null {
  try {
    const resourceName = mutateResult?.data?.mutateOperationResponses?.[0]?.assetResult?.resourceName;
    if (!resourceName) return null;
    const parts = resourceName.split('/');
    return parts[parts.length - 1] || null;
  } catch { return null; }
}

// Auto-link asset to campaign if campaign_id provided
async function autoLinkIfNeeded(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, assetId: string, campaignId: string | undefined, fieldType: string
): Promise<void> {
  if (!campaignId || !validateNumericId(campaignId)) return;
  const linkResult = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignAssetOperation: {
      create: {
        campaign: `customers/${customerId}/campaigns/${campaignId}`,
        asset: `customers/${customerId}/assets/${assetId}`,
        fieldType,
      },
    },
  }]);
  if (!linkResult.ok) {
    console.warn(`[manage-google-extensions] Auto-link failed for asset ${assetId} → campaign ${campaignId}:`, linkResult.error);
  }
}

async function handleCreateSitelink(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { link_text, description1, description2, final_urls, campaign_id } = data;
  if (!link_text || !final_urls?.length) {
    return { body: { error: 'Missing required fields: link_text, final_urls' }, status: 400 };
  }
  if (link_text.length > 25) return { body: { error: 'link_text max 25 characters' }, status: 400 };
  if (description1 && description1.length > 35) return { body: { error: 'description1 max 35 characters' }, status: 400 };
  if (description2 && description2.length > 35) return { body: { error: 'description2 max 35 characters' }, status: 400 };

  const asset: any = {
    sitelinkAsset: {
      linkText: link_text,
      finalUrls: Array.isArray(final_urls) ? final_urls : [final_urls],
    },
  };
  if (description1) asset.sitelinkAsset.description1 = description1;
  if (description2) asset.sitelinkAsset.description2 = description2;

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetOperation: { create: asset },
  }]);

  if (!result.ok) return { body: { error: 'Failed to create sitelink', details: result.error }, status: 502 };

  const assetId = extractAssetId(result);
  if (assetId && campaign_id) {
    await autoLinkIfNeeded(customerId, accessToken, developerToken, loginCustomerId, assetId, campaign_id, 'SITELINK');
  }

  return { body: { success: true, message: 'Sitelink created', asset_id: assetId, linked_campaign: campaign_id || null }, status: 200 };
}

async function handleCreateCallout(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { callout_text, campaign_id } = data;
  if (!callout_text) return { body: { error: 'Missing callout_text' }, status: 400 };
  if (callout_text.length > 25) return { body: { error: 'callout_text max 25 characters' }, status: 400 };

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetOperation: { create: { calloutAsset: { calloutText: callout_text } } },
  }]);

  if (!result.ok) return { body: { error: 'Failed to create callout', details: result.error }, status: 502 };

  const assetId = extractAssetId(result);
  if (assetId && campaign_id) {
    await autoLinkIfNeeded(customerId, accessToken, developerToken, loginCustomerId, assetId, campaign_id, 'CALLOUT');
  }

  return { body: { success: true, message: 'Callout created', asset_id: assetId, linked_campaign: campaign_id || null }, status: 200 };
}

async function handleCreateSnippet(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { header, values, campaign_id } = data;
  if (!header || !values?.length) {
    return { body: { error: 'Missing required fields: header, values' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetOperation: {
      create: {
        structuredSnippetAsset: { header, values: Array.isArray(values) ? values : [values] },
      },
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to create snippet', details: result.error }, status: 502 };

  const assetId = extractAssetId(result);
  if (assetId && campaign_id) {
    await autoLinkIfNeeded(customerId, accessToken, developerToken, loginCustomerId, assetId, campaign_id, 'STRUCTURED_SNIPPET');
  }

  return { body: { success: true, message: 'Structured snippet created', asset_id: assetId, linked_campaign: campaign_id || null }, status: 200 };
}

async function handleCreateCall(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { country_code, phone_number, campaign_id } = data;
  if (!country_code || !phone_number) {
    return { body: { error: 'Missing required fields: country_code, phone_number' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetOperation: {
      create: { callAsset: { countryCode: country_code, phoneNumber: phone_number } },
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to create call extension', details: result.error }, status: 502 };

  const assetId = extractAssetId(result);
  if (assetId && campaign_id) {
    await autoLinkIfNeeded(customerId, accessToken, developerToken, loginCustomerId, assetId, campaign_id, 'CALL');
  }

  return { body: { success: true, message: 'Call extension created', asset_id: assetId, linked_campaign: campaign_id || null }, status: 200 };
}

async function handleLinkAsset(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { campaign_id, asset_id, field_type } = data;
  if (!campaign_id || !asset_id || !field_type) {
    return { body: { error: 'Missing required fields: campaign_id, asset_id, field_type' }, status: 400 };
  }
  if (!validateNumericId(campaign_id)) return { body: { error: 'campaign_id must be numeric' }, status: 400 };
  if (!validateNumericId(asset_id)) return { body: { error: 'asset_id must be numeric' }, status: 400 };

  const validFieldTypes = ['SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'CALL'];
  if (!validFieldTypes.includes(field_type)) {
    return { body: { error: `Invalid field_type. Valid: ${validFieldTypes.join(', ')}` }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignAssetOperation: {
      create: {
        campaign: `customers/${customerId}/campaigns/${campaign_id}`,
        asset: `customers/${customerId}/assets/${asset_id}`,
        fieldType: field_type,
      },
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to link asset', details: result.error }, status: 502 };
  return { body: { success: true, message: 'Asset linked to campaign' }, status: 200 };
}

async function handleUnlinkAsset(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { resource_name } = data;
  if (!resource_name) return { body: { error: 'Missing resource_name' }, status: 400 };
  if (!validateResourceName(resource_name, customerId)) {
    return { body: { error: 'Invalid resource_name for this account' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    campaignAssetOperation: { remove: resource_name },
  }]);

  if (!result.ok) return { body: { error: 'Failed to unlink asset', details: result.error }, status: 502 };
  return { body: { success: true, message: 'Asset unlinked' }, status: 200 };
}

async function handleRemoveAsset(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { asset_id } = data;
  if (!asset_id) return { body: { error: 'Missing asset_id' }, status: 400 };
  if (!validateNumericId(asset_id)) return { body: { error: 'asset_id must be numeric' }, status: 400 };

  const resourceName = `customers/${customerId}/assets/${asset_id}`;
  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    assetOperation: { remove: resourceName },
  }]);

  if (!result.ok) return { body: { error: 'Failed to remove asset', details: result.error }, status: 502 };
  return { body: { success: true, message: 'Asset removed' }, status: 200 };
}

// --- Main handler ---

export async function manageGoogleExtensions(c: Context) {
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
    const { action, connection_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = ['list_assets', 'list_campaign_assets', 'create_sitelink', 'create_callout', 'create_snippet', 'create_call', 'link_asset', 'unlink_asset', 'remove_asset'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    console.log(`[manage-google-extensions] Action: ${action}, Connection: ${connection_id}`);

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
          null, 'manageGoogleExtensions.getAdminRole',
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
      case 'list_assets':
        result = await handleListAssets(customerId, accessToken, developerToken, loginCustomerId);
        break;
      case 'list_campaign_assets':
        result = await handleListCampaignAssets(customerId, accessToken, developerToken, loginCustomerId);
        break;
      case 'create_sitelink':
        result = await handleCreateSitelink(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'create_callout':
        result = await handleCreateCallout(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'create_snippet':
        result = await handleCreateSnippet(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'create_call':
        result = await handleCreateCall(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'link_asset':
        result = await handleLinkAsset(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'unlink_asset':
        result = await handleUnlinkAsset(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'remove_asset':
        result = await handleRemoveAsset(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-extensions] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
