import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getGoogleTokenForConnection } from '../../lib/resolve-google-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { convertToCLP, fetchGoogleAccountCurrency } from '../../lib/currency.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

type Action = 'pause' | 'resume' | 'update_budget' | 'list_details';

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  data?: Record<string, any>;
}

const GOOGLE_ADS_API = 'https://googleads.googleapis.com/v23';

// --- Google Ads API helpers ---

async function googleAdsQuery(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  query: string
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

  // Fallback: MCC 403 → retry with customer's own ID
  if (response.status === 403 && loginCustomerId !== customerId) {
    console.warn(`[manage-google-campaign] MCC login ${loginCustomerId} denied, retrying with ${customerId}`);
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[manage-google-campaign] GAQL error (${response.status}):`, errorText.slice(0, 500));
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
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  mutateOperations: any[]
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
    console.warn(`[manage-google-campaign] MCC mutate ${loginCustomerId} denied, retrying with ${customerId}`);
    response = await makeRequest(customerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[manage-google-campaign] Mutate error (${response.status}):`, errorText.slice(0, 500));
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

// --- Main handler ---

export async function manageGoogleCampaign(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    if (!developerToken) {
      return c.json({ error: 'Google Ads developer token not configured' }, 500);
    }

    // Auth: authMiddleware user OR cron secret
    const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));
    let user: { id: string } | null = null;

    if (!isCron) {
      user = c.get('user');
      if (!user) return c.json({ error: 'Unauthorized' }, 401);
    }

    const body: RequestBody = await c.req.json();
    const { action, connection_id, campaign_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = ['pause', 'resume', 'update_budget', 'list_details'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    if (['pause', 'resume', 'update_budget'].includes(action) && !campaign_id) {
      return c.json({ error: `Missing campaign_id for action "${action}"` }, 400);
    }

    console.log(`[manage-google-campaign] Action: ${action}, Connection: ${connection_id}, Campaign: ${campaign_id || 'N/A'}`);

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

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify ownership (skip for cron)
    if (!isCron && user) {
      const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
      const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

      if (!isOwner) {
        const adminRole = await safeQuerySingleOrDefault<any>(
          supabase
            .from('user_roles').select('role').eq('user_id', user.id)
            .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
          null,
          'manageGoogleCampaign.getAdminRole',
        );
        if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Google Ads account_id' }, 400);
    }

    // Resolve token
    const tokenResult = await getGoogleTokenForConnection(supabase, connection);
    const { accessToken } = tokenResult;
    const customerId = connection.account_id;
    const loginCustomerId = tokenResult.mccCustomerId || customerId;

    // Detect account currency for budget display
    const accountCurrency = action === 'list_details' || action === 'update_budget'
      ? await fetchGoogleAccountCurrency(customerId, accessToken, developerToken, loginCustomerId)
      : 'USD';

    // Route to handler
    let result: { body: any; status: number };

    switch (action) {
      case 'pause':
        result = await handlePause(customerId, campaign_id!, accessToken, developerToken, loginCustomerId);
        break;
      case 'resume':
        result = await handleResume(customerId, campaign_id!, accessToken, developerToken, loginCustomerId);
        break;
      case 'update_budget':
        result = await handleUpdateBudget(customerId, campaign_id!, accessToken, developerToken, loginCustomerId, data || {});
        break;
      case 'list_details':
        result = await handleListDetails(customerId, accessToken, developerToken, loginCustomerId, accountCurrency);
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
