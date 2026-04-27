import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

type Action = 'create_custom' | 'create_lookalike' | 'create_retargeting' | 'delete' | 'list' | 'list_pixels';

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

  const response = await fetch(url.toString(), { ...fetchOptions, signal: AbortSignal.timeout(15_000) });
  let responseData: any;
  try { responseData = await response.json(); }
  catch { return { ok: false, error: `Non-JSON response (HTTP ${response.status})` }; }

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
    // Engagement audience source IDs:
    //   - PAGE  → page_id (real Facebook Page ID)
    //   - INSTAGRAM → ig_user_id (real Instagram Business Account ID)
    //   - VIDEO → page_id (videos posted by a Page)
    page_id,
    ig_user_id,
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

  // For website audiences, pixel_id must also be sent as a top-level param.
  // M9: Validate the pixel belongs to this ad account before posting; Meta
  // would otherwise reject with a generic "Object does not exist or you do not
  // have permission" error.
  if (source_type === 'website' && pixel_id) {
    const pixelsResp = await metaApiRequest(
      `act_${accountId}/adspixels`,
      accessToken,
      'GET',
      { fields: 'id', limit: '50' }
    );
    if (!pixelsResp.ok) {
      return {
        body: { error: 'No se pudo validar el pixel contra la cuenta', details: pixelsResp.error },
        status: 502,
      };
    }
    const knownPixelIds: string[] = (pixelsResp.data?.data || []).map((p: any) => String(p.id));
    if (!knownPixelIds.includes(String(pixel_id))) {
      return {
        body: {
          error: `Pixel ${pixel_id} no pertenece a la cuenta act_${accountId}.`,
          available_pixel_ids: knownPixelIds,
        },
        status: 400,
      };
    }
    payload.pixel_id = pixel_id;
  }

  // For website/engagement/app_activity, set retention_days at top level
  if (source_type === 'website' || source_type === 'engagement' || source_type === 'app_activity') {
    const numRetention = Number(retention_days);
    if (isNaN(numRetention) || numRetention < 1 || numRetention > 180) {
      return { body: { error: 'retention_days must be between 1 and 180' }, status: 400 };
    }
    payload.retention_days = numRetention;
  }

  // Build rule for engagement audiences if not already provided.
  // event_sources for PAGE/VIDEO needs the real Facebook Page ID and for
  // INSTAGRAM the real IG Business Account ID. The ad account ID
  // (act_{accountId}) is NOT a valid event source — Meta returns
  // "Invalid event_sources.id" if we send it.
  if (source_type === 'engagement' && !rule) {
    const engKind = engagement_type || 'PAGE';

    if (engKind === 'PAGE' || engKind === 'VIDEO') {
      if (!page_id) {
        console.error(`[manage-meta-audiences] missing page_id for engagement subtype (${engKind})`);
        return {
          body: {
            error: `Missing required field: page_id is required for ${engKind} engagement audiences`,
            hint: 'Send the real Facebook Page ID, not the ad account ID.',
          },
          status: 400,
        };
      }
    } else if (engKind === 'INSTAGRAM') {
      if (!ig_user_id) {
        console.error('[manage-meta-audiences] missing ig_user_id for engagement subtype (INSTAGRAM)');
        return {
          body: {
            error: 'Missing required field: ig_user_id is required for INSTAGRAM engagement audiences',
            hint: 'Send the real Instagram Business Account ID, not the ad account ID.',
          },
          status: 400,
        };
      }
    }

    const engagementRules: Record<string, any> = {
      PAGE: {
        inclusions: {
          operator: 'or',
          rules: [{ event_sources: [{ type: 'page', id: page_id }], retention_seconds: retention_days * 86400 }],
        },
      },
      INSTAGRAM: {
        inclusions: {
          operator: 'or',
          rules: [{ event_sources: [{ type: 'ig_business', id: ig_user_id }], retention_seconds: retention_days * 86400 }],
        },
      },
      VIDEO: {
        inclusions: {
          operator: 'or',
          rules: [{ event_sources: [{ type: 'page', id: page_id }], retention_seconds: retention_days * 86400, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'video_watched' }] } }],
        },
      },
    };
    const engRule = engagementRules[engKind];
    if (engRule) {
      payload.rule = JSON.stringify(engRule);
    }
  }

  // Add customer_file_source for customer list audiences.
  // Meta v23 valid values:
  //   USER_PROVIDED_ONLY            (default — list collected directly from users)
  //   PARTNER_PROVIDED_ONLY         (third-party data partner)
  //   BOTH_USER_AND_PARTNER_PROVIDED (mix)
  if (source_type === 'customer_list') {
    const VALID_CFS = [
      'USER_PROVIDED_ONLY',
      'PARTNER_PROVIDED_ONLY',
      'BOTH_USER_AND_PARTNER_PROVIDED',
    ];
    const requestedCfs = customer_file_source || 'USER_PROVIDED_ONLY';
    if (!VALID_CFS.includes(requestedCfs)) {
      return {
        body: {
          error: `Invalid customer_file_source: ${requestedCfs}. Valid values: ${VALID_CFS.join(', ')}`,
        },
        status: 400,
      };
    }
    payload.customer_file_source = requestedCfs;
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
    starting_ratio,
    end_ratio,
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

  const numRatio = Number(ratio);
  if (isNaN(numRatio) || numRatio < 0.01 || numRatio > 0.20) {
    return { body: { error: 'ratio must be between 0.01 and 0.20 (1% to 20%)' }, status: 400 };
  }

  // Validate optional starting_ratio / end_ratio (used for "expanded" lookalikes
  // like 1-3% / 3-5%). Both must be in [0, 0.20] and starting < end.
  let numStartingRatio: number | null = null;
  let numEndRatio: number | null = null;
  if (starting_ratio !== undefined || end_ratio !== undefined) {
    if (starting_ratio === undefined || end_ratio === undefined) {
      return { body: { error: 'starting_ratio and end_ratio must be provided together' }, status: 400 };
    }
    numStartingRatio = Number(starting_ratio);
    numEndRatio = Number(end_ratio);
    if (
      isNaN(numStartingRatio) || isNaN(numEndRatio) ||
      numStartingRatio < 0 || numStartingRatio > 0.20 ||
      numEndRatio <= numStartingRatio || numEndRatio > 0.20
    ) {
      return { body: { error: 'starting_ratio/end_ratio must be in [0, 0.20] and starting < end' }, status: 400 };
    }
  }

  // CRITICO-1 (Antipatrón #2 SUAT): Validar ownership de la audiencia origen
  // contra la cuenta publicitaria ANTES de leer su count.
  // Con tokens SUAT (bm_partner/leadsie) un GET directo a `source_audience_id`
  // succeed para CUALQUIER audiencia del BM → un user malicioso podría crear un
  // lookalike apuntando a la audiencia de OTRO cliente. Listamos primero las
  // audiencias del act_{accountId} y rechazamos si el ID no pertenece.
  // Mismo patrón que M9 con pixel_id.
  const ownedAudienceIds = new Set<string>();
  let nextEndpoint: string | null = `act_${accountId}/customaudiences`;
  let nextParams: Record<string, any> | null = { fields: 'id', limit: '1000' };
  let pageGuard = 0;
  while (nextEndpoint && pageGuard < 10) {
    pageGuard++;
    const ownershipCheck: { ok: boolean; data?: any; error?: string } = await metaApiRequest(
      nextEndpoint,
      accessToken,
      'GET',
      nextParams || undefined
    );
    if (!ownershipCheck.ok) {
      return {
        body: {
          error: 'No se pudo validar la audiencia origen contra la cuenta',
          details: ownershipCheck.error,
        },
        status: 502,
      };
    }
    for (const a of ownershipCheck.data?.data || []) {
      ownedAudienceIds.add(String(a.id));
    }
    // Follow paging.next if present (already a fully-qualified URL with cursor)
    const nextUrl: string | undefined = ownershipCheck.data?.paging?.next;
    if (nextUrl && !ownedAudienceIds.has(String(source_audience_id))) {
      // Use the absolute URL by stripping the base prefix; metaApiRequest builds
      // `${META_API_BASE}/${endpoint}` so we pass only the path+query relative
      // to v23.0/.
      try {
        const u = new URL(nextUrl);
        // Preserve everything after `/v23.0/` as endpoint, drop access_token
        // (metaApiRequest re-attaches it) and let other params ride in body.
        const pathAfterVersion = u.pathname.replace(/^\/v\d+\.\d+\//, '');
        const params: Record<string, string> = {};
        u.searchParams.forEach((v, k) => {
          if (k !== 'access_token') params[k] = v;
        });
        nextEndpoint = pathAfterVersion;
        nextParams = params;
      } catch {
        nextEndpoint = null;
        nextParams = null;
      }
    } else {
      nextEndpoint = null;
      nextParams = null;
    }
  }

  if (!ownedAudienceIds.has(String(source_audience_id))) {
    return {
      body: {
        error: 'La audiencia origen no pertenece a esta cuenta publicitaria',
        source_audience_id,
      },
      status: 403,
    };
  }

  // Pre-flight: Meta requires the source audience to have at least 100 people.
  // Hit the audience endpoint and read approximate_count first so we fail
  // fast with a clear error instead of letting Meta reject the POST with a
  // generic message.
  const sourceCheck = await metaApiRequest(
    String(source_audience_id),
    accessToken,
    'GET',
    { fields: 'approximate_count,approximate_count_lower_bound,approximate_count_upper_bound,name' }
  );

  if (!sourceCheck.ok) {
    return {
      body: {
        error: 'No se pudo leer la audiencia origen',
        details: sourceCheck.error,
      },
      status: 502,
    };
  }

  const approxCount = Number(
    sourceCheck.data?.approximate_count ??
    sourceCheck.data?.approximate_count_lower_bound ??
    0
  );

  if (!Number.isFinite(approxCount) || approxCount < 100) {
    return {
      body: {
        error: 'Audiencia origen tiene menos de 100 personas. Mínimo Meta requiere 100.',
        count: approxCount,
        source_audience_id,
      },
      status: 400,
    };
  }

  const lookalikeSpecObj: Record<string, any> = {
    type: 'similarity',
    country,
    ratio: numRatio,
  };
  if (numStartingRatio !== null && numEndRatio !== null) {
    lookalikeSpecObj.starting_ratio = numStartingRatio;
    lookalikeSpecObj.ratio = numEndRatio; // when expanded, ratio = end_ratio
    delete lookalikeSpecObj.type; // expanded lookalikes don't take "similarity"
  }
  const lookalikeSpec = JSON.stringify(lookalikeSpecObj);

  console.log(`[manage-meta-audiences] Creating lookalike audience "${name}" from source ${source_audience_id} (count=${approxCount}) for account ${accountId}`);

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
      starting_ratio: numStartingRatio,
      end_ratio: numEndRatio,
      source_count: approxCount,
    },
    status: 200
  };
}

/**
 * Lista los pixels disponibles del ad account. Used cuando platform_connections
 * no tiene pixel_id guardado (común en conexiones leadsie/bm_partner donde el
 * sync no pobló el campo). El frontend usa esto para auto-detectar el pixel
 * antes de mostrar "Conecta tu Pixel primero".
 */
async function handleListPixels(
  accountId: string,
  accessToken: string,
): Promise<{ body: any; status: number }> {
  try {
    const result = await metaApiRequest(
      `act_${accountId}/adspixels`,
      accessToken,
      'GET',
      { fields: 'id,name', limit: '50' },
    );
    if (result.error) {
      return { body: { error: 'No se pudieron listar los pixels', details: result.error }, status: 502 };
    }
    return {
      body: {
        pixels: (result.data || []).map((p: any) => ({
          id: String(p.id || ''),
          name: String(p.name || ''),
        })),
      },
      status: 200,
    };
  } catch (e: any) {
    return { body: { error: e?.message || 'unknown' }, status: 500 };
  }
}

async function handleList(
  accountId: string,
  accessToken: string
): Promise<{ body: any; status: number }> {
  console.log(`[manage-meta-audiences] Listing audiences for account ${accountId}`);

  // Fetch customaudiences (CUSTOM, LOOKALIKE, WEBSITE, ENGAGEMENT, ...) and
  // saved_audiences (presets of targeting) in parallel — both are surfaced in the wizard.
  const [customResult, savedResult] = await Promise.all([
    metaApiRequest(
      `act_${accountId}/customaudiences`,
      accessToken,
      'GET',
      {
        fields: 'id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,description,time_created',
        limit: '100',
      }
    ),
    metaApiRequest(
      `act_${accountId}/saved_audiences`,
      accessToken,
      'GET',
      {
        fields: 'id,name,description,sentence_lines,approximate_count_lower_bound,approximate_count_upper_bound,run_status,targeting',
        limit: '100',
      }
    ),
  ]);

  if (!customResult.ok) {
    return { body: { error: 'Failed to list audiences', details: customResult.error }, status: 502 };
  }

  const customAudiences = (customResult.data?.data || []).map((a: any) => ({ ...a, source: 'custom' }));
  const savedAudiences = (savedResult.ok ? savedResult.data?.data || [] : []).map((a: any) => ({
    id: a.id,
    name: a.name,
    subtype: 'SAVED',
    source: 'saved',
    description: a.description || (a.sentence_lines || []).join(' · '),
    approximate_count_lower_bound: a.approximate_count_lower_bound,
    approximate_count_upper_bound: a.approximate_count_upper_bound,
    delivery_status: a.run_status,
    targeting: a.targeting,
  }));

  const audiences = [...customAudiences, ...savedAudiences];
  console.log(`[manage-meta-audiences] Found ${customAudiences.length} custom + ${savedAudiences.length} saved = ${audiences.length} audiences`);

  return {
    body: {
      success: true,
      audiences,
      saved_audiences: savedAudiences,
      custom_audiences: customAudiences,
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

// --- Retargeting handler (AddToCart without Purchase) ---

async function handleCreateRetargeting(
  accountId: string,
  accessToken: string,
  data: Record<string, any>
): Promise<{ body: any; status: number }> {
  const {
    name,
    retargeting_type = 'abandoned_cart', // 'abandoned_cart' | 'viewed_not_purchased' | 'all_visitors'
    retention_days = 30,
    pixel_id,
    description = '',
  } = data;

  if (!name) return { body: { error: 'Missing required field: name' }, status: 400 };
  if (!pixel_id) return { body: { error: 'Missing required field: pixel_id' }, status: 400 };

  // M9: validate pixel belongs to the ad account before building any rule.
  const pixelsResp = await metaApiRequest(
    `act_${accountId}/adspixels`,
    accessToken,
    'GET',
    { fields: 'id', limit: '50' }
  );
  if (!pixelsResp.ok) {
    return {
      body: { error: 'No se pudo validar el pixel contra la cuenta', details: pixelsResp.error },
      status: 502,
    };
  }
  const knownPixelIds: string[] = (pixelsResp.data?.data || []).map((p: any) => String(p.id));
  if (!knownPixelIds.includes(String(pixel_id))) {
    return {
      body: {
        error: `Pixel ${pixel_id} no pertenece a la cuenta act_${accountId}.`,
        available_pixel_ids: knownPixelIds,
      },
      status: 400,
    };
  }

  // Build rule based on retargeting type
  let rule: any;

  switch (retargeting_type) {
    case 'abandoned_cart':
      // People who added to cart but did NOT purchase in the last N days
      rule = {
        inclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ type: 'pixel', id: pixel_id }],
            retention_seconds: retention_days * 86400,
            filter: {
              operator: 'and',
              filters: [{ field: 'event', operator: 'eq', value: 'AddToCart' }],
            },
          }],
        },
        exclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ type: 'pixel', id: pixel_id }],
            retention_seconds: retention_days * 86400,
            filter: {
              operator: 'and',
              filters: [{ field: 'event', operator: 'eq', value: 'Purchase' }],
            },
          }],
        },
      };
      break;

    case 'viewed_not_purchased':
      // People who viewed content but did NOT purchase
      rule = {
        inclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ type: 'pixel', id: pixel_id }],
            retention_seconds: retention_days * 86400,
            filter: {
              operator: 'and',
              filters: [{ field: 'event', operator: 'eq', value: 'ViewContent' }],
            },
          }],
        },
        exclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ type: 'pixel', id: pixel_id }],
            retention_seconds: retention_days * 86400,
            filter: {
              operator: 'and',
              filters: [{ field: 'event', operator: 'eq', value: 'Purchase' }],
            },
          }],
        },
      };
      break;

    case 'all_visitors':
      // All website visitors in the last N days
      rule = {
        inclusions: {
          operator: 'or',
          rules: [{
            event_sources: [{ type: 'pixel', id: pixel_id }],
            retention_seconds: retention_days * 86400,
          }],
        },
      };
      break;

    default:
      return { body: { error: `Unknown retargeting_type: ${retargeting_type}` }, status: 400 };
  }

  const retargetingLabels: Record<string, string> = {
    abandoned_cart: 'Carrito abandonado (AddToCart sin Purchase)',
    viewed_not_purchased: 'Vio productos sin comprar (ViewContent sin Purchase)',
    all_visitors: 'Todos los visitantes del sitio',
  };

  const fullDescription = description || retargetingLabels[retargeting_type] || retargeting_type;

  console.log(`[manage-meta-audiences] Creating retargeting audience "${name}" (${retargeting_type}, ${retention_days}d) for account ${accountId}`);

  const result = await metaApiRequest(
    `act_${accountId}/customaudiences`,
    accessToken,
    'POST',
    {
      name,
      subtype: 'WEBSITE',
      description: fullDescription,
      rule: JSON.stringify(rule),
      pixel_id,
      retention_days,
    }
  );

  if (!result.ok) {
    return { body: { error: 'Failed to create retargeting audience', details: result.error }, status: 502 };
  }

  console.log(`[manage-meta-audiences] Retargeting audience created: ${result.data.id}`);

  return {
    body: {
      success: true,
      audience_id: result.data.id,
      name,
      retargeting_type,
      retention_days,
      description: fullDescription,
    },
    status: 200,
  };
}

// --- Main handler ---

export async function manageMetaAudiences(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User already validated by authMiddleware
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Parse request body
    const body: RequestBody = await c.req.json();
    const { action, connection_id, data } = body;

    if (!action) {
      return c.json({ error: 'Missing required field: action' }, 400);
    }

    if (!connection_id) {
      return c.json({ error: 'Missing required field: connection_id' }, 400);
    }

    const validActions: Action[] = ['create_custom', 'create_lookalike', 'create_retargeting', 'delete', 'list'];
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
        connection_type,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (connError || !connection) {
      console.error('[manage-meta-audiences] Connection fetch error:', connError);
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify user owns this connection OR is admin
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'manageMetaAudiences.getAdminRole',
      );
      if (!adminRole) {
        console.error('[manage-meta-audiences] Authorization failed:', {
          userId: user.id, clientUserId: clientData.client_user_id, adminId: clientData.user_id,
        });
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Meta account ID' }, 400);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      console.error('[manage-meta-audiences] Token resolution failed');
      return c.json({ error: 'Failed to resolve access token' }, 500);
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

      case 'create_retargeting':
        result = await handleCreateRetargeting(accountId, decryptedToken, data || {});
        break;

      case 'list':
        result = await handleList(accountId, decryptedToken);
        break;

      case 'list_pixels':
        result = await handleListPixels(accountId, decryptedToken);
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
