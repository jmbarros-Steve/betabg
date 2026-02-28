import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_BASE = 'https://graph.facebook.com/v18.0';

type Action = 'create' | 'pause' | 'resume' | 'update' | 'update_budget' | 'duplicate' | 'archive';

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
  const responseData = await response.json();

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || responseData?.error?.error_user_msg || 'Unknown Meta API error';
    console.error(`Meta API error [${method} ${endpoint}]:`, responseData);
    return { ok: false, error: errorMessage };
  }

  return { ok: true, data: responseData };
}

// ─── Action handlers ─────────────────────────────────────────────────────────

async function handleCreate(
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
  const {
    name,
    objective = 'OUTCOME_TRAFFIC',
    status = 'PAUSED',
    special_ad_categories = [],
    // Ad set fields
    adset_name,
    daily_budget,
    billing_event = 'IMPRESSIONS',
    optimization_goal = 'LINK_CLICKS',
    targeting,
    start_time,
    end_time,
  } = data;

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: name' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Step 1: Create the campaign
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
    return new Response(
      JSON.stringify({ error: 'Failed to create campaign', details: campaignResult.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const campaignId = campaignResult.data.id;
  console.log(`[manage-meta-campaign] Campaign created: ${campaignId}`);

  // Step 2: Create ad set if budget/targeting data is provided
  let adSetId: string | null = null;

  if (daily_budget || targeting) {
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
      // Campaign was created but ad set failed - return partial success
      return new Response(
        JSON.stringify({
          success: true,
          partial: true,
          campaign_id: campaignId,
          adset_error: adsetResult.error,
          message: 'Campaign created but ad set creation failed',
        }),
        { status: 207, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    adSetId = adsetResult.data.id;
    console.log(`[manage-meta-campaign] Ad set created: ${adSetId}`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      campaign_id: campaignId,
      adset_id: adSetId,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handlePause(
  campaignId: string,
  accessToken: string
): Promise<Response> {
  console.log(`[manage-meta-campaign] Pausing campaign ${campaignId}`);

  const result = await metaApiRequest(campaignId, accessToken, 'POST', {
    status: 'PAUSED',
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to pause campaign', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, campaign_id: campaignId, status: 'PAUSED' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleResume(
  campaignId: string,
  accessToken: string
): Promise<Response> {
  console.log(`[manage-meta-campaign] Resuming campaign ${campaignId}`);

  const result = await metaApiRequest(campaignId, accessToken, 'POST', {
    status: 'ACTIVE',
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to resume campaign', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, campaign_id: campaignId, status: 'ACTIVE' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleUpdate(
  campaignId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
  const { name, status, daily_budget, start_time, end_time, adset_id } = data;

  // Step 1: Update campaign-level fields (name, status)
  const campaignUpdates: Record<string, any> = {};
  if (name) campaignUpdates.name = name;
  if (status) campaignUpdates.status = status;

  if (Object.keys(campaignUpdates).length > 0) {
    console.log(`[manage-meta-campaign] Updating campaign ${campaignId}:`, campaignUpdates);

    const campaignResult = await metaApiRequest(campaignId, accessToken, 'POST', campaignUpdates);

    if (!campaignResult.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to update campaign', details: campaignResult.error }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({
          error: 'Campaign updated but ad set update failed',
          details: adsetResult.error,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ success: true, campaign_id: campaignId }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleUpdateBudget(
  campaignId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
  const { daily_budget, adset_id } = data;

  if (!daily_budget) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: daily_budget' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // If a specific adset_id is provided, update that one directly
  if (adset_id) {
    console.log(`[manage-meta-campaign] Updating budget for ad set ${adset_id}`);

    const result = await metaApiRequest(adset_id, accessToken, 'POST', {
      daily_budget: Math.round(Number(daily_budget) * 100),
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to update ad set budget', details: result.error }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, adset_id, daily_budget }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
    return new Response(
      JSON.stringify({ error: 'Failed to fetch ad sets', details: adsetsResult.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  return new Response(
    JSON.stringify({
      success: failedAdsets.length === 0,
      campaign_id: campaignId,
      daily_budget,
      updated_adsets: updatedAdsets,
      failed_adsets: failedAdsets,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleDuplicate(
  campaignId: string,
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
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
    return new Response(
      JSON.stringify({ error: 'Failed to fetch campaign for duplication', details: campaignResult.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
    return new Response(
      JSON.stringify({ error: 'Failed to create duplicate campaign', details: newCampaignResult.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  return new Response(
    JSON.stringify({
      success: true,
      original_campaign_id: campaignId,
      new_campaign_id: newCampaignId,
      new_campaign_name: duplicateName,
      duplicated_adsets: duplicatedAdsets,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleArchive(
  campaignId: string,
  accessToken: string
): Promise<Response> {
  console.log(`[manage-meta-campaign] Archiving campaign ${campaignId}`);

  const result = await metaApiRequest(campaignId, accessToken, 'POST', {
    status: 'ARCHIVED',
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to archive campaign', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, campaign_id: campaignId, status: 'ARCHIVED' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { action, connection_id, campaign_id, data } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: connection_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validActions: Action[] = ['create', 'pause', 'resume', 'update', 'update_budget', 'duplicate', 'archive'];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: `Invalid action: ${action}. Valid actions: ${validActions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Actions that require an existing campaign_id
    if (['pause', 'resume', 'update', 'update_budget', 'duplicate', 'archive'].includes(action) && !campaign_id) {
      return new Response(
        JSON.stringify({ error: `Missing required field: campaign_id (required for action "${action}")` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return new Response(
        JSON.stringify({ error: 'Missing Meta credentials (access token or account ID)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('[manage-meta-campaign] Token decryption error:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize account_id (strip act_ prefix if present, we add it where needed)
    const accountId = connection.account_id.replace(/^act_/, '');

    // Route to the appropriate action handler
    switch (action) {
      case 'create':
        return await handleCreate(accountId, decryptedToken, data || {});

      case 'pause':
        return await handlePause(campaign_id!, decryptedToken);

      case 'resume':
        return await handleResume(campaign_id!, decryptedToken);

      case 'update':
        return await handleUpdate(campaign_id!, decryptedToken, data || {});

      case 'update_budget':
        return await handleUpdateBudget(campaign_id!, decryptedToken, data || {});

      case 'duplicate':
        return await handleDuplicate(campaign_id!, accountId, decryptedToken, data || {});

      case 'archive':
        return await handleArchive(campaign_id!, decryptedToken);

      default:
        return new Response(
          JSON.stringify({ error: `Unhandled action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[manage-meta-campaign] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
