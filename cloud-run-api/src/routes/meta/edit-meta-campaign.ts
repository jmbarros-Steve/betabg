import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

type Action =
  | 'list_adsets'           // Lista ad sets de una campaña
  | 'list_ads'              // Lista ads de un ad set (o de toda la campaña)
  | 'update_campaign'       // name, daily_budget, status, end_time, special_ad_categories
  | 'update_adset'          // name, daily_budget, status, end_time
  | 'update_ad_status'      // pausa/activa un ad puntual
  | 'pause_resume_campaign'; // toggle ACTIVE/PAUSED a nivel campaña

interface RequestBody {
  action: Action;
  connection_id: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  data?: Record<string, any>;
}

async function metaApiRequest(
  endpoint: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, any>,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = new URL(`${META_API_BASE}/${endpoint}`);
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
  if (method === 'GET' && body) {
    for (const [k, v] of Object.entries(body)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  } else if (method === 'POST') {
    fetchOptions.body = JSON.stringify(body || {});
  }

  const response = await fetch(url.toString(), { ...fetchOptions, signal: AbortSignal.timeout(15_000) });
  let responseData: any;
  try {
    responseData = await response.json();
  } catch {
    return { ok: false, error: `Non-JSON response (HTTP ${response.status})` };
  }
  if (!response.ok) {
    const msg = responseData?.error?.message || responseData?.error?.error_user_msg || 'Meta API error';
    console.error(`[edit-meta-campaign] Meta error [${method} ${endpoint}]:`, responseData);
    return { ok: false, error: msg };
  }
  return { ok: true, data: responseData };
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleListAdsets(campaignId: string, accessToken: string) {
  // Lista ad sets activos de una campaña con métricas básicas
  const result = await metaApiRequest(
    `${campaignId}/adsets`,
    accessToken,
    'GET',
    {
      fields: 'id,name,status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal,billing_event,targeting,bid_strategy',
      limit: '50',
    },
  );
  if (!result.ok) {
    return { body: { error: 'Failed to list ad sets', details: result.error }, status: 502 };
  }
  return {
    body: {
      adsets: (result.data?.data || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        daily_budget: a.daily_budget ? Number(a.daily_budget) : null,
        lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) : null,
        start_time: a.start_time || null,
        end_time: a.end_time || null,
        optimization_goal: a.optimization_goal || null,
        billing_event: a.billing_event || null,
        targeting: a.targeting || null,
      })),
    },
    status: 200,
  };
}

async function handleListAds(campaignId: string | null, adsetId: string | null, accessToken: string) {
  // Lista ads de una campaña (todos sus ad sets) o de un ad set específico
  const parent = adsetId || campaignId;
  if (!parent) {
    return { body: { error: 'Missing campaign_id or adset_id' }, status: 400 };
  }
  const result = await metaApiRequest(
    `${parent}/ads`,
    accessToken,
    'GET',
    {
      fields: 'id,name,status,creative{id,thumbnail_url,object_story_spec},adset_id,campaign_id,created_time',
      limit: '100',
    },
  );
  if (!result.ok) {
    return { body: { error: 'Failed to list ads', details: result.error }, status: 502 };
  }
  return {
    body: {
      ads: (result.data?.data || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        thumbnail_url: a.creative?.thumbnail_url || null,
        creative_id: a.creative?.id || null,
        adset_id: a.adset_id,
        campaign_id: a.campaign_id,
        created_time: a.created_time,
      })),
    },
    status: 200,
  };
}

async function handleUpdateCampaign(
  campaignId: string,
  accessToken: string,
  data: Record<string, any>,
) {
  // Build payload — solo incluimos campos que el cliente quiso cambiar.
  // Meta acepta POST en /{campaign_id} con cualquier subset.
  const payload: Record<string, any> = {};
  if (typeof data.name === 'string' && data.name.trim()) payload.name = data.name.trim();
  if (typeof data.daily_budget === 'number' && data.daily_budget > 0) {
    // Meta espera daily_budget en centavos para algunas monedas, pero para
    // CLP (sin decimales) usa el valor entero. Pasamos como llega del frontend.
    payload.daily_budget = Math.round(data.daily_budget);
  }
  if (data.status === 'ACTIVE' || data.status === 'PAUSED') payload.status = data.status;
  if (typeof data.end_time === 'string' && data.end_time) payload.end_time = data.end_time;
  if (Array.isArray(data.special_ad_categories)) payload.special_ad_categories = data.special_ad_categories;

  if (Object.keys(payload).length === 0) {
    return { body: { error: 'No changes provided' }, status: 400 };
  }

  console.log(`[edit-meta-campaign] update_campaign ${campaignId}:`, payload);
  const result = await metaApiRequest(campaignId, accessToken, 'POST', payload);
  if (!result.ok) {
    return { body: { error: 'Failed to update campaign', details: result.error }, status: 502 };
  }
  return { body: { success: true, campaign_id: campaignId, applied: payload }, status: 200 };
}

async function handleUpdateAdset(
  adsetId: string,
  accessToken: string,
  data: Record<string, any>,
) {
  const payload: Record<string, any> = {};
  if (typeof data.name === 'string' && data.name.trim()) payload.name = data.name.trim();
  if (typeof data.daily_budget === 'number' && data.daily_budget > 0) {
    payload.daily_budget = Math.round(data.daily_budget);
  }
  if (data.status === 'ACTIVE' || data.status === 'PAUSED') payload.status = data.status;
  if (typeof data.end_time === 'string' && data.end_time) payload.end_time = data.end_time;
  // Targeting solo si llega como objeto completo (cambios complejos hechos
  // desde el wizard de audiencias). Cambios parciales pueden romper la
  // validación de Meta — mejor pasar el targeting completo.
  if (data.targeting && typeof data.targeting === 'object') payload.targeting = data.targeting;

  if (Object.keys(payload).length === 0) {
    return { body: { error: 'No changes provided' }, status: 400 };
  }

  console.log(`[edit-meta-campaign] update_adset ${adsetId}:`, Object.keys(payload));
  const result = await metaApiRequest(adsetId, accessToken, 'POST', payload);
  if (!result.ok) {
    return { body: { error: 'Failed to update ad set', details: result.error }, status: 502 };
  }
  return { body: { success: true, adset_id: adsetId, applied: Object.keys(payload) }, status: 200 };
}

async function handleUpdateAdStatus(
  adId: string,
  accessToken: string,
  data: Record<string, any>,
) {
  const status = data.status;
  if (status !== 'ACTIVE' && status !== 'PAUSED') {
    return { body: { error: 'status must be ACTIVE or PAUSED' }, status: 400 };
  }
  const result = await metaApiRequest(adId, accessToken, 'POST', { status });
  if (!result.ok) {
    return { body: { error: 'Failed to update ad', details: result.error }, status: 502 };
  }
  return { body: { success: true, ad_id: adId, status }, status: 200 };
}

async function handlePauseResumeCampaign(
  campaignId: string,
  accessToken: string,
  data: Record<string, any>,
) {
  const status = data.status;
  if (status !== 'ACTIVE' && status !== 'PAUSED') {
    return { body: { error: 'status must be ACTIVE or PAUSED' }, status: 400 };
  }
  const result = await metaApiRequest(campaignId, accessToken, 'POST', { status });
  if (!result.ok) {
    return { body: { error: 'Failed to update campaign status', details: result.error }, status: 502 };
  }
  return { body: { success: true, campaign_id: campaignId, status }, status: 200 };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function editMetaCampaign(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body: RequestBody = await c.req.json();
    const { action, connection_id, campaign_id, adset_id, ad_id, data } = body;

    if (!action || !connection_id) {
      return c.json({ error: 'Missing action or connection_id' }, 400);
    }

    // Fetch connection + ownership check
    const { data: connection, error: connErr } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, connection_type, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (connErr || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'editMetaCampaign.adminRole',
      );
      if (!adminRole) return c.json({ error: 'Unauthorized' }, 403);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      return c.json({ error: 'Failed to resolve access token' }, 500);
    }

    let result: { body: any; status: number };

    switch (action) {
      case 'list_adsets':
        if (!campaign_id) return c.json({ error: 'Missing campaign_id' }, 400);
        result = await handleListAdsets(campaign_id, decryptedToken);
        break;
      case 'list_ads':
        result = await handleListAds(campaign_id || null, adset_id || null, decryptedToken);
        break;
      case 'update_campaign':
        if (!campaign_id) return c.json({ error: 'Missing campaign_id' }, 400);
        result = await handleUpdateCampaign(campaign_id, decryptedToken, data || {});
        break;
      case 'update_adset':
        if (!adset_id) return c.json({ error: 'Missing adset_id' }, 400);
        result = await handleUpdateAdset(adset_id, decryptedToken, data || {});
        break;
      case 'update_ad_status':
        if (!ad_id) return c.json({ error: 'Missing ad_id' }, 400);
        result = await handleUpdateAdStatus(ad_id, decryptedToken, data || {});
        break;
      case 'pause_resume_campaign':
        if (!campaign_id) return c.json({ error: 'Missing campaign_id' }, 400);
        result = await handlePauseResumeCampaign(campaign_id, decryptedToken, data || {});
        break;
      default:
        result = { body: { error: `Unknown action: ${action}` }, status: 400 };
    }

    return c.json(result.body, result.status as any);
  } catch (err: any) {
    console.error('[edit-meta-campaign] Unhandled:', err);
    return c.json({ error: 'Internal server error', details: err?.message }, 500);
  }
}
