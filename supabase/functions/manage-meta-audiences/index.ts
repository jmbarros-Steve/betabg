import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_BASE = 'https://graph.facebook.com/v18.0';

type Action = 'create_custom' | 'create_lookalike' | 'delete' | 'list';

interface RequestBody {
  action: Action;
  connection_id: string;
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

// ─── Source type to subtype mapping ──────────────────────────────────────────

function getSubtypeForSourceType(sourceType: string): string {
  switch (sourceType) {
    case 'website':
      return 'WEBSITE';
    case 'customer_list':
      return 'CUSTOM';
    case 'engagement':
      return 'ENGAGEMENT';
    case 'app_activity':
      return 'APP';
    default:
      return 'CUSTOM';
  }
}

// ─── Action handlers ─────────────────────────────────────────────────────────

async function handleCreateCustom(
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
  const {
    name,
    description = '',
    source_type = 'customer_list',
    rule,
    customer_file_source,
    retention_days = 180,
  } = data;

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: name' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const subtype = getSubtypeForSourceType(source_type);

  const payload: Record<string, any> = {
    name,
    subtype,
    description,
    retention_days,
  };

  // Add rule for website/engagement audiences
  if (rule) {
    payload.rule = typeof rule === 'object' ? JSON.stringify(rule) : rule;
  }

  // Add customer_file_source for customer list audiences
  if (source_type === 'customer_list') {
    payload.customer_file_source = customer_file_source || 'USER_PROVIDED_ONLY';
  }

  console.log(`[manage-meta-audiences] Creating custom audience "${name}" (${subtype}) for account ${accountId}`);

  const result = await metaApiRequest(
    `act_${accountId}/customaudiences`,
    accessToken,
    'POST',
    payload
  );

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to create custom audience', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[manage-meta-audiences] Custom audience created: ${result.data.id}`);

  return new Response(
    JSON.stringify({
      success: true,
      audience_id: result.data.id,
      name,
      subtype,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleCreateLookalike(
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
  const {
    name,
    source_audience_id,
    country,
    ratio = 0.01,
  } = data;

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: name' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!source_audience_id) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: source_audience_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!country) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: country' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const lookalikeSpec = JSON.stringify({
    type: 'similarity',
    country,
    ratio: Number(ratio),
  });

  console.log(`[manage-meta-audiences] Creating lookalike audience "${name}" from source ${source_audience_id} for account ${accountId}`);

  const result = await metaApiRequest(
    `act_${accountId}/customaudiences`,
    accessToken,
    'POST',
    {
      name,
      subtype: 'LOOKALIKE',
      origin_audience_id: source_audience_id,
      lookalike_spec: lookalikeSpec,
    }
  );

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to create lookalike audience', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[manage-meta-audiences] Lookalike audience created: ${result.data.id}`);

  return new Response(
    JSON.stringify({
      success: true,
      audience_id: result.data.id,
      name,
      subtype: 'LOOKALIKE',
      source_audience_id,
      country,
      ratio,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleList(
  accountId: string,
  accessToken: string
): Promise<Response> {
  console.log(`[manage-meta-audiences] Listing audiences for account ${accountId}`);

  const result = await metaApiRequest(
    `act_${accountId}/customaudiences`,
    accessToken,
    'GET',
    {
      fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,description,time_created',
      limit: '100',
    }
  );

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to list audiences', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const audiences = result.data?.data || [];
  console.log(`[manage-meta-audiences] Found ${audiences.length} audiences`);

  return new Response(
    JSON.stringify({
      success: true,
      audiences,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleDelete(
  accessToken: string,
  data: Record<string, any>
): Promise<Response> {
  const { audience_id } = data;

  if (!audience_id) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: audience_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[manage-meta-audiences] Deleting audience ${audience_id}`);

  const result = await metaApiRequest(audience_id, accessToken, 'DELETE');

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to delete audience', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[manage-meta-audiences] Audience ${audience_id} deleted`);

  return new Response(
    JSON.stringify({ success: true, audience_id }),
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
    const { action, connection_id, data } = body;

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

    const validActions: Action[] = ['create_custom', 'create_lookalike', 'delete', 'list'];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: `Invalid action: ${action}. Valid actions: ${validActions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[manage-meta-audiences] Action: ${action}, Connection: ${connection_id}`);

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
      console.error('[manage-meta-audiences] Connection fetch error:', connError);
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user owns this connection (admin via user_id OR client via client_user_id)
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      console.error('[manage-meta-audiences] Authorization failed:', {
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
      console.error('[manage-meta-audiences] Token decryption error:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize account_id (strip act_ prefix if present, we add it where needed)
    const accountId = connection.account_id.replace(/^act_/, '');

    // Route to the appropriate action handler
    switch (action) {
      case 'create_custom':
        return await handleCreateCustom(accountId, decryptedToken, data || {});

      case 'create_lookalike':
        return await handleCreateLookalike(accountId, decryptedToken, data || {});

      case 'list':
        return await handleList(accountId, decryptedToken);

      case 'delete':
        return await handleDelete(decryptedToken, data || {});

      default:
        return new Response(
          JSON.stringify({ error: `Unhandled action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[manage-meta-audiences] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
