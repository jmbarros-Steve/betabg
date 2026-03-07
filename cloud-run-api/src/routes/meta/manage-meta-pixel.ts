import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

type Action = 'list' | 'get' | 'stats';

interface RequestBody {
  action: Action;
  connection_id: string;
  pixel_id?: string;
}

async function metaApiRequest(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = new URL(`${META_API_BASE}/${endpoint}`);
  url.searchParams.set('access_token', accessToken);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString());
  const responseData: any = await response.json();

  if (!response.ok) {
    const errorMessage =
      responseData?.error?.message ||
      responseData?.error?.error_user_msg ||
      'Unknown Meta API error';
    console.error(`Meta API error [GET ${endpoint}]:`, responseData);
    return { ok: false, error: errorMessage };
  }

  return { ok: true, data: responseData };
}

// List all pixels for the ad account
async function handleList(
  accountId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-pixel] Listing pixels for account ${accountId}`);

  const result = await metaApiRequest(`act_${accountId}/adspixels`, accessToken, {
    fields: 'id,name,creation_time,last_fired_time,is_unavailable,data_use_setting,code',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to list pixels', details: result.error }, status: 502 };
  }

  const pixels = (result.data?.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    created: p.creation_time,
    last_fired: p.last_fired_time || null,
    is_unavailable: p.is_unavailable || false,
    data_use_setting: p.data_use_setting || null,
    code: p.code || null,
  }));

  return { body: { success: true, pixels }, status: 200 };
}

// Get details for a specific pixel
async function handleGet(
  pixelId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-pixel] Getting pixel ${pixelId}`);

  const result = await metaApiRequest(pixelId, accessToken, {
    fields: 'id,name,creation_time,last_fired_time,is_unavailable,data_use_setting,code',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to get pixel', details: result.error }, status: 502 };
  }

  return {
    body: {
      success: true,
      pixel: {
        id: result.data.id,
        name: result.data.name,
        created: result.data.creation_time,
        last_fired: result.data.last_fired_time || null,
        is_unavailable: result.data.is_unavailable || false,
        code: result.data.code || null,
      },
    },
    status: 200
  };
}

// Get pixel stats (events received)
async function handleStats(
  pixelId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-pixel] Getting stats for pixel ${pixelId}`);

  const result = await metaApiRequest(`${pixelId}/stats`, accessToken, {
    aggregation: 'event',
  });

  if (!result.ok) {
    return { body: { error: 'Failed to get pixel stats', details: result.error }, status: 502 };
  }

  const events = (result.data?.data || []).map((e: any) => ({
    event: e.event,
    count: e.count || 0,
    last_received: e.timestamp || null,
  }));

  return { body: { success: true, events }, status: 200 };
}

// --- Main handler ---

export async function manageMetaPixel(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Verify JWT
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const body: RequestBody = await c.req.json();
    const { action, connection_id, pixel_id } = body;

    if (!action || !connection_id) {
      return c.json({ error: 'Missing required fields: action, connection_id' }, 400);
    }

    // Fetch connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return c.json({ error: 'Missing Meta credentials (access token or account ID)' }, 400);
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Failed to decrypt access token' }, 500);
    }

    const accountId = connection.account_id.replace(/^act_/, '');

    let result: { body: any; status: number };

    switch (action) {
      case 'list':
        result = await handleList(accountId, decryptedToken);
        break;
      case 'get':
        if (!pixel_id) {
          return c.json({ error: 'Missing pixel_id for get action' }, 400);
        }
        result = await handleGet(pixel_id, decryptedToken);
        break;
      case 'stats':
        if (!pixel_id) {
          return c.json({ error: 'Missing pixel_id for stats action' }, 400);
        }
        result = await handleStats(pixel_id, decryptedToken);
        break;
      default:
        result = { body: { error: `Invalid action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (error) {
    console.error('[manage-meta-pixel] Unhandled error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
}
