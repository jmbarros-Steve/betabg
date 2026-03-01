import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const responseData = await response.json();

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
): Promise<Response> {
  console.log(`[manage-meta-pixel] Listing pixels for account ${accountId}`);

  const result = await metaApiRequest(`act_${accountId}/adspixels`, accessToken, {
    fields: 'id,name,creation_time,last_fired_time,is_unavailable,data_use_setting,code',
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to list pixels', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  return new Response(
    JSON.stringify({ success: true, pixels }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Get details for a specific pixel
async function handleGet(
  pixelId: string,
  accessToken: string
): Promise<Response> {
  console.log(`[manage-meta-pixel] Getting pixel ${pixelId}`);

  const result = await metaApiRequest(pixelId, accessToken, {
    fields: 'id,name,creation_time,last_fired_time,is_unavailable,data_use_setting,code',
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to get pixel', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      pixel: {
        id: result.data.id,
        name: result.data.name,
        created: result.data.creation_time,
        last_fired: result.data.last_fired_time || null,
        is_unavailable: result.data.is_unavailable || false,
        code: result.data.code || null,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Get pixel stats (events received)
async function handleStats(
  pixelId: string,
  accessToken: string
): Promise<Response> {
  console.log(`[manage-meta-pixel] Getting stats for pixel ${pixelId}`);

  const result = await metaApiRequest(`${pixelId}/stats`, accessToken, {
    aggregation: 'event',
  });

  if (!result.ok) {
    return new Response(
      JSON.stringify({ error: 'Failed to get pixel stats', details: result.error }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const events = (result.data?.data || []).map((e: any) => ({
    event: e.event,
    count: e.count || 0,
    last_received: e.timestamp || null,
  }));

  return new Response(
    JSON.stringify({ success: true, events }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
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

    const body: RequestBody = await req.json();
    const { action, connection_id, pixel_id } = body;

    if (!action || !connection_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: action, connection_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
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
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt access token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountId = connection.account_id.replace(/^act_/, '');

    switch (action) {
      case 'list':
        return await handleList(accountId, decryptedToken);
      case 'get':
        if (!pixel_id) {
          return new Response(
            JSON.stringify({ error: 'Missing pixel_id for get action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleGet(pixel_id, decryptedToken);
      case 'stats':
        if (!pixel_id) {
          return new Response(
            JSON.stringify({ error: 'Missing pixel_id for stats action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleStats(pixel_id, decryptedToken);
      default:
        return new Response(
          JSON.stringify({ error: `Invalid action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[manage-meta-pixel] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
