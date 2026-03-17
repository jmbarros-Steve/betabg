import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

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

  (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;

  if (method === 'GET') {
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
  } else {
    fetchOptions.body = JSON.stringify(body || {});
  }

  const response = await fetch(url.toString(), fetchOptions);
  const responseData: any = await response.json();

  if (!response.ok) {
    const errorMessage = responseData?.error?.message || responseData?.error?.error_user_msg || 'Unknown Meta API error';
    console.error(`Meta API error [${method} ${endpoint}]:`, responseData);
    return { ok: false, error: errorMessage };
  }

  return { ok: true, data: responseData };
}

// --- Source type to subtype mapping ---

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

// --- Action handlers ---

async function handleCreateCustom(
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const {
    name,
    description = '',
    source_type = 'customer_list',
    rule,
    customer_file_source,
    retention_days = 180,
    pixel_id,
    engagement_type,
  } = data;

  if (!name) {
    return { body: { error: 'Missing required field: name' }, status: 400 };
  }

  const subtype = getSubtypeForSourceType(source_type);

  const payload: Record<string, any> = {
    name,
    subtype,
    description,
  };

  // Add rule for website audiences (rule built by frontend with pixel_id embedded)
  if (rule) {
    payload.rule = typeof rule === 'object' ? JSON.stringify(rule) : rule;
  }

  // For website audiences, pixel_id must also be sent as a top-level param
  if (source_type === 'website' && pixel_id) {
    payload.pixel_id = pixel_id;
  }

  // For website/engagement/app_activity, set retention_days at top level
  if (source_type === 'website' || source_type === 'engagement' || source_type === 'app_activity') {
    payload.retention_days = retention_days;
  }

  // Build rule for engagement audiences if not already provided
  if (source_type === 'engagement' && !rule) {
    const engagementRules: Record<string, any> = {
      PAGE: {
        inclusions: {
          operator: 'or',
          rules: [{ event_sources: [{ type: 'page', id: `act_${accountId}` }], retention_seconds: retention_days * 86400 }],
        },
      },
      INSTAGRAM: {
        inclusions: {
          operator: 'or',
          rules: [{ event_sources: [{ type: 'ig_business', id: `act_${accountId}` }], retention_seconds: retention_days * 86400 }],
        },
      },
      VIDEO: {
        inclusions: {
          operator: 'or',
          rules: [{ event_sources: [{ type: 'page', id: `act_${accountId}` }], retention_seconds: retention_days * 86400, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'video_watched' }] } }],
        },
      },
    };
    const engRule = engagementRules[engagement_type || 'PAGE'];
    if (engRule) {
      payload.rule = JSON.stringify(engRule);
    }
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
    return { body: { error: 'Failed to create custom audience', details: result.error }, status: 502 };
  }

  console.log(`[manage-meta-audiences] Custom audience created: ${result.data.id}`);

  return {
    body: {
      success: true,
      audience_id: result.data.id,
      name,
      subtype,
    },
    status: 200
  };
}

async function handleCreateLookalike(
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const {
    name,
    source_audience_id,
    country,
    ratio = 0.01,
  } = data;

  if (!name) {
    return { body: { error: 'Missing required field: name' }, status: 400 };
  }

  if (!source_audience_id) {
    return { body: { error: 'Missing required field: source_audience_id' }, status: 400 };
  }

  if (!country) {
    return { body: { error: 'Missing required field: country' }, status: 400 };
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
    return { body: { error: 'Failed to create lookalike audience', details: result.error }, status: 502 };
  }

  console.log(`[manage-meta-audiences] Lookalike audience created: ${result.data.id}`);

  return {
    body: {
      success: true,
      audience_id: result.data.id,
      name,
      subtype: 'LOOKALIKE',
      source_audience_id,
      country,
      ratio,
    },
    status: 200
  };
}

async function handleList(
  accountId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
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
    return { body: { error: 'Failed to list audiences', details: result.error }, status: 502 };
  }

  const audiences = result.data?.data || [];
  console.log(`[manage-meta-audiences] Found ${audiences.length} audiences`);

  return {
    body: {
      success: true,
      audiences,
    },
    status: 200
  };
}

async function handleDelete(
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const { audience_id } = data;

  if (!audience_id) {
    return { body: { error: 'Missing required field: audience_id' }, status: 400 };
  }

  console.log(`[manage-meta-audiences] Deleting audience ${audience_id}`);

  const result = await metaApiRequest(audience_id, accessToken, 'DELETE');

  if (!result.ok) {
    return { body: { error: 'Failed to delete audience', details: result.error }, status: 502 };
  }

  console.log(`[manage-meta-audiences] Audience ${audience_id} deleted`);

  return { body: { success: true, audience_id }, status: 200 };
}

// --- Main handler ---

export async function manageMetaAudiences(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Verify JWT and get user
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Parse request body
    const body: RequestBody = await c.req.json();
    const { action, connection_id, data } = body;

    if (!action) {
      return c.json({ error: 'Missing required field: action' }, 400);
    }

    if (!connection_id) {
      return c.json({ error: 'Missing required field: connection_id' }, 400);
    }

    const validActions: Action[] = ['create_custom', 'create_lookalike', 'delete', 'list'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid actions: ${validActions.join(', ')}` }, 400);
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
      return c.json({ error: 'Connection not found' }, 404);
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
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return c.json({ error: 'Missing Meta credentials (access token or account ID)' }, 400);
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('[manage-meta-audiences] Token decryption error:', decryptError);
      return c.json({ error: 'Failed to decrypt access token' }, 500);
    }

    // Normalize account_id (strip act_ prefix if present, we add it where needed)
    const accountId = connection.account_id.replace(/^act_/, '');

    // Route to the appropriate action handler
    let result: { body: any; status: number };

    switch (action) {
      case 'create_custom':
        result = await handleCreateCustom(accountId, decryptedToken, data || {});
        break;

      case 'create_lookalike':
        result = await handleCreateLookalike(accountId, decryptedToken, data || {});
        break;

      case 'list':
        result = await handleList(accountId, decryptedToken);
        break;

      case 'delete':
        result = await handleDelete(decryptedToken, data || {});
        break;

      default:
        result = { body: { error: `Unhandled action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error) {
    console.error('[manage-meta-audiences] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
  }
}
