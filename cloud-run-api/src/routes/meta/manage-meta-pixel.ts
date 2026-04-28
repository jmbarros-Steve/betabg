import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

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
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  let responseData: any;
  try {
    responseData = await response.json();
  } catch {
    return { ok: false, error: `Non-JSON response (HTTP ${response.status})` };
  }

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

// Get pixel stats (events received) + CAPI status
//
// Meta v23 devuelve /stats con buckets POR HORA (start_time) y dentro de
// cada bucket un array `data` con {value, count}. El bug anterior leía
// `e.event` y `e.count` directo del nivel superior — siempre devolvía 0.
// Ahora sumamos counts de TODOS los buckets de la ventana y devolvemos
// total por evento + last_received timestamp.
//
// CAPI status: con aggregation=event_source Meta devuelve buckets con
// {value: "SERVER" | "BROWSER", count}. Si SERVER > 0, la Conversions API
// está enviando eventos. Útil para mostrar el badge "API Conexión activa".
async function handleStats(
  pixelId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-pixel] Getting stats for pixel ${pixelId}`);

  const [eventsResp, sourceResp] = await Promise.all([
    metaApiRequest(`${pixelId}/stats`, accessToken, { aggregation: 'event' }),
    metaApiRequest(`${pixelId}/stats`, accessToken, { aggregation: 'event_source' }),
  ]);

  // Eventos: si falla, devolvemos error (es lo crítico)
  if (!eventsResp.ok) {
    return { body: { error: 'Failed to get pixel stats', details: eventsResp.error }, status: 502 };
  }

  // Agregar counts por evento across all hour buckets + tomar bucket más reciente
  const eventCounts: Record<string, number> = {};
  let lastEventTimestamp: string | null = null;
  for (const bucket of eventsResp.data?.data || []) {
    const startTime = bucket.start_time as string | undefined;
    if (startTime && (!lastEventTimestamp || startTime > lastEventTimestamp)) {
      lastEventTimestamp = startTime;
    }
    for (const entry of bucket.data || []) {
      const name = entry.value as string | undefined;
      const count = Number(entry.count || 0);
      if (name) {
        eventCounts[name] = (eventCounts[name] || 0) + count;
      }
    }
  }

  const events = Object.entries(eventCounts)
    .map(([event, count]) => ({
      event,
      count,
      last_received: lastEventTimestamp,
    }))
    .sort((a, b) => b.count - a.count);

  // CAPI detection — sumar counts de BROWSER y SERVER. Si event_source falla
  // (permisos limitados, pixel sin actividad) no es crítico, devolvemos null.
  let capi: { enabled: boolean; server_events: number; browser_events: number } | null = null;
  if (sourceResp.ok) {
    let browserCount = 0;
    let serverCount = 0;
    for (const bucket of sourceResp.data?.data || []) {
      for (const entry of bucket.data || []) {
        const v = entry.value as string;
        const c = Number(entry.count || 0);
        if (v === 'BROWSER') browserCount += c;
        else if (v === 'SERVER') serverCount += c;
      }
    }
    capi = {
      enabled: serverCount > 0,
      server_events: serverCount,
      browser_events: browserCount,
    };
  }

  return { body: { success: true, events, capi }, status: 200 };
}

// --- Main handler ---

export async function manageMetaPixel(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body: RequestBody = await c.req.json();
    const { action, connection_id, pixel_id } = body;

    if (!action || !connection_id) {
      return c.json({ error: 'Missing required fields: action, connection_id' }, 400);
    }

    // Fetch connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, connection_type, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify ownership OR admin
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'manageMetaPixel.getAdminRole',
      );
      if (!adminRole) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Meta account ID' }, 400);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      console.error('[manage-meta-pixel] Token resolution failed');
      return c.json({ error: 'Failed to resolve access token' }, 500);
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
