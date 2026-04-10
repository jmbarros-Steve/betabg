import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

type Action = 'list' | 'create' | 'update';

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
    console.error(`[manage-google-conversions] GAQL error (${response.status}):`, errorText.slice(0, 500));
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
    console.error(`[manage-google-conversions] Mutate error (${response.status}):`, errorText.slice(0, 500));
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

async function handleList(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const query = `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category,
      conversion_action.include_in_conversions_metric,
      conversion_action.click_through_lookback_window_days,
      conversion_action.view_through_lookback_window_days,
      conversion_action.counting_type,
      conversion_action.tag_snippets,
      metrics.conversions,
      metrics.conversions_value
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
  `;

  const result = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
  if (!result.ok) return { body: { error: 'Failed to fetch conversion actions', details: result.error }, status: 502 };

  const conversions = (result.data || []).map((row: any) => ({
    id: row.conversionAction?.id,
    name: row.conversionAction?.name,
    type: row.conversionAction?.type,
    status: row.conversionAction?.status,
    category: row.conversionAction?.category,
    include_in_conversions: row.conversionAction?.includeInConversionsMetric,
    click_through_lookback_days: row.conversionAction?.clickThroughLookbackWindowDays,
    view_through_lookback_days: row.conversionAction?.viewThroughLookbackWindowDays,
    counting_type: row.conversionAction?.countingType,
    tag_snippets: row.conversionAction?.tagSnippets || [],
    conversions: Number(row.metrics?.conversions || 0),
    conversions_value: Number(row.metrics?.conversionsValue || 0),
  }));

  return { body: { success: true, conversions }, status: 200 };
}

async function handleCreate(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { name, type, category, counting_type, click_through_lookback_days, view_through_lookback_days, default_value, always_use_default_value } = data;

  if (!name || !type) {
    return { body: { error: 'Missing required fields: name, type' }, status: 400 };
  }

  const conversionAction: any = {
    name,
    type,
    status: 'ENABLED',
    includeInConversionsMetric: true,
  };

  if (category) conversionAction.category = category;
  if (counting_type) conversionAction.countingType = counting_type;
  if (click_through_lookback_days) {
    const v = Number(click_through_lookback_days);
    if (!Number.isFinite(v) || v < 1 || v > 90) return { body: { error: 'click_through_lookback_days must be 1-90' }, status: 400 };
    conversionAction.clickThroughLookbackWindowDays = v;
  }
  if (view_through_lookback_days) {
    const v = Number(view_through_lookback_days);
    if (!Number.isFinite(v) || v < 1 || v > 30) return { body: { error: 'view_through_lookback_days must be 1-30' }, status: 400 };
    conversionAction.viewThroughLookbackWindowDays = v;
  }

  if (default_value !== undefined) {
    const dv = Number(default_value);
    if (!Number.isFinite(dv) || dv < 0) return { body: { error: 'default_value must be a non-negative number' }, status: 400 };
    conversionAction.valueSettings = {
      defaultValue: dv,
      alwaysUseDefaultValue: always_use_default_value ?? true,
    };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    conversionActionOperation: { create: conversionAction },
  }]);

  if (!result.ok) return { body: { error: 'Failed to create conversion action', details: result.error }, status: 502 };
  return { body: { success: true, message: 'Conversion action created', name }, status: 200 };
}

async function handleUpdate(
  customerId: string, accessToken: string, developerToken: string,
  loginCustomerId: string, data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { conversion_action_id, status, name, counting_type } = data;

  if (!conversion_action_id) {
    return { body: { error: 'Missing conversion_action_id' }, status: 400 };
  }
  if (!/^\d+$/.test(conversion_action_id)) {
    return { body: { error: 'conversion_action_id must be numeric' }, status: 400 };
  }

  const resourceName = `customers/${customerId}/conversionActions/${conversion_action_id}`;
  const updateFields: any = { resourceName };
  const masks: string[] = [];

  if (status) {
    const validStatuses = ['ENABLED', 'PAUSED'];
    if (!validStatuses.includes(status)) return { body: { error: `Invalid status. Valid: ${validStatuses.join(', ')}` }, status: 400 };
    updateFields.status = status; masks.push('status');
  }
  if (name) { updateFields.name = name; masks.push('name'); }
  if (counting_type) {
    const validCounting = ['ONE_PER_CLICK', 'MANY_PER_CLICK'];
    if (!validCounting.includes(counting_type)) return { body: { error: `Invalid counting_type. Valid: ${validCounting.join(', ')}` }, status: 400 };
    updateFields.countingType = counting_type; masks.push('counting_type');
  }

  if (masks.length === 0) {
    return { body: { error: 'No fields to update' }, status: 400 };
  }

  const result = await googleAdsMutate(customerId, accessToken, developerToken, loginCustomerId, [{
    conversionActionOperation: {
      update: updateFields,
      updateMask: masks.join(','),
    },
  }]);

  if (!result.ok) return { body: { error: 'Failed to update conversion action', details: result.error }, status: 502 };
  return { body: { success: true, conversion_action_id, updated: masks }, status: 200 };
}

// --- Main handler ---

export async function manageGoogleConversions(c: Context) {
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

    const validActions: Action[] = ['list', 'create', 'update'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    console.log(`[manage-google-conversions] Action: ${action}, Connection: ${connection_id}`);

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
          null, 'manageGoogleConversions.getAdminRole',
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
      case 'list':
        result = await handleList(customerId, accessToken, developerToken, loginCustomerId);
        break;
      case 'create':
        result = await handleCreate(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'update':
        result = await handleUpdate(customerId, accessToken, developerToken, loginCustomerId, data || {});
        break;
      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[manage-google-conversions] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
