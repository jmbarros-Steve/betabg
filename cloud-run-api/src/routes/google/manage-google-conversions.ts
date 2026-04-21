import { Context } from 'hono';
import { googleAdsQuery, googleAdsMutate, resolveConnectionAndToken } from '../../lib/google-ads-api.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

type Action = 'list' | 'create' | 'update' | 'check_tracking';

interface RequestBody {
  action: Action;
  connection_id: string;
  data?: Record<string, any>;
}

// --- SSRF-safe host validator (copiado de manage-google-campaign para aislar deps) ---
function isPublicHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (!host || host.includes(':')) return false;
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    if (isIpv4) {
      const p = host.split('.').map(Number);
      if (p.some(n => n < 0 || n > 255)) return false;
      if (p[0] === 10 || p[0] === 127 || p[0] === 0) return false;
      if (p[0] === 169 && p[1] === 254) return false;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
      if (p[0] === 192 && p[1] === 168) return false;
      if (p[0] >= 224) return false;
      return true;
    }
    if (host === 'localhost') return false;
    if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) return false;
    if (!host.includes('.')) return false;
    return true;
  } catch { return false; }
}

// --- Action handlers ---

async function handleList(
  customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  // Query 1: Config (no date segments needed)
  const configQuery = `
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
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.tag_snippets
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
  `;

  // Query 2: Metrics (last 30 days, aggregated per conversion action)
  const metricsQuery = `
    SELECT
      conversion_action.id,
      metrics.all_conversions,
      metrics.all_conversions_value
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
      AND segments.date DURING LAST_30_DAYS
  `;

  const [configResult, metricsResult] = await Promise.all([
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, configQuery),
    googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, metricsQuery),
  ]);

  if (!configResult.ok) return { body: { error: 'Failed to fetch conversion actions', details: configResult.error }, status: 502 };

  // Aggregate metrics by conversion action ID
  const metricsMap = new Map<string, { conversions: number; value: number }>();
  if (metricsResult.ok) {
    for (const row of metricsResult.data || []) {
      const id = row.conversionAction?.id;
      if (!id) continue;
      const existing = metricsMap.get(id) || { conversions: 0, value: 0 };
      existing.conversions += Number(row.metrics?.allConversions || 0);
      existing.value += Number(row.metrics?.allConversionsValue || 0);
      metricsMap.set(id, existing);
    }
  }

  const conversions = (configResult.data || []).map((row: any) => {
    const id = row.conversionAction?.id;
    const metrics = metricsMap.get(id) || { conversions: 0, value: 0 };
    return {
      id,
      name: row.conversionAction?.name,
      type: row.conversionAction?.type,
      status: row.conversionAction?.status,
      category: row.conversionAction?.category,
      include_in_conversions: row.conversionAction?.includeInConversionsMetric,
      click_through_lookback_days: row.conversionAction?.clickThroughLookbackWindowDays,
      view_through_lookback_days: row.conversionAction?.viewThroughLookbackWindowDays,
      counting_type: row.conversionAction?.countingType,
      default_value: row.conversionAction?.valueSettings?.defaultValue || 0,
      always_use_default_value: row.conversionAction?.valueSettings?.alwaysUseDefaultValue || false,
      tag_snippets: row.conversionAction?.tagSnippets || [],
      // Real metrics (last 30 days)
      conversions_30d: Math.round(metrics.conversions * 100) / 100,
      value_30d: Math.round(metrics.value * 100) / 100,
    };
  });

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

// --- Check Tracking (Tier 3 wizard) ---
// Detecta si el website del cliente tiene gtag, GTM o ga4 instalado.
// Hace fetch al homepage del client y parsea HTML.
// Devuelve: { has_gtag, has_gtm, has_ga4, gtag_id?, gtm_id?, ga4_id?, website_url, detected_tags[] }
async function handleCheckTracking(
  clientId: string, customerId: string, accessToken: string, developerToken: string, loginCustomerId: string
): Promise<{ body: any; status: number }> {
  const supabase = getSupabaseAdmin();
  const warnings: string[] = [];

  // 1) Fetch website_url del cliente
  const { data: clientRow } = await supabase
    .from('clients')
    .select('website_url')
    .eq('id', clientId)
    .maybeSingle();

  const websiteUrl = clientRow?.website_url?.trim();
  if (!websiteUrl) {
    return {
      body: {
        success: true,
        has_gtag: false, has_gtm: false, has_ga4: false,
        website_url: null,
        detected_tags: [],
        message: 'El cliente no tiene website_url configurado. Agregalo en Configuración del cliente primero.',
      },
      status: 200,
    };
  }

  const fullUrl = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
  if (!isPublicHost(fullUrl)) {
    return { body: { error: 'URL no es pública (bloqueada por SSRF check)' }, status: 400 };
  }

  // 2) Fetch homepage + parse tags
  let html = '';
  try {
    const resp = await fetch(fullUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
      headers: { 'User-Agent': 'Steve-Ads/1.0 (+https://steve.cl)' },
    });
    if (!resp.ok) {
      warnings.push(`Fetch failed HTTP ${resp.status}`);
      html = '';
    } else {
      if (resp.url && !isPublicHost(resp.url)) {
        return { body: { error: 'Redirect to non-public host blocked' }, status: 400 };
      }
      html = await resp.text();
    }
  } catch (err: any) {
    warnings.push(`Fetch error: ${err.message}`);
  }

  // 3) Detectar tags
  const detected_tags: string[] = [];
  let gtagId: string | null = null;
  let gtmId: string | null = null;
  let ga4Id: string | null = null;

  // gtag (Google Ads conversion tag): gtag('config', 'AW-XXXXXXXXX')
  const gtagMatch = html.match(/gtag\s*\(\s*['"]config['"]\s*,\s*['"](AW-[0-9]+)['"]/);
  if (gtagMatch) {
    gtagId = gtagMatch[1];
    detected_tags.push(`Google Ads tag: ${gtagId}`);
  }
  // GTM: GTM-XXXXXXX in script src OR iframe src
  const gtmMatch = html.match(/['"]((GTM-[A-Z0-9]+))['"]/) || html.match(/id=(GTM-[A-Z0-9]+)/);
  if (gtmMatch) {
    gtmId = gtmMatch[1];
    detected_tags.push(`Google Tag Manager: ${gtmId}`);
  }
  // GA4: gtag('config', 'G-XXXXXXXXXX')
  const ga4Match = html.match(/gtag\s*\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)['"]/);
  if (ga4Match) {
    ga4Id = ga4Match[1];
    detected_tags.push(`Google Analytics 4: ${ga4Id}`);
  }

  // 4) Cross-check con conversion_actions activas en Google Ads
  let active_conversion_count = 0;
  try {
    const query = `
      SELECT conversion_action.id, conversion_action.status, metrics.all_conversions
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
    `;
    const gResult = await googleAdsQuery(customerId, accessToken, developerToken, loginCustomerId, query);
    if (gResult.ok) {
      active_conversion_count = (gResult.data || []).length;
    } else {
      warnings.push('No se pudo obtener conversion_actions del account');
    }
  } catch (err: any) {
    warnings.push(`Query conversion_actions falló: ${err.message}`);
  }

  // 5) Verdict
  const has_any = !!gtagId || !!gtmId || !!ga4Id;
  let recommendation = '';
  if (!has_any) {
    recommendation = 'Sin tags detectados. Instalá el tag de Google Ads (AW-XXXXX) en tu website para trackear conversions.';
  } else if (active_conversion_count === 0) {
    recommendation = 'Tag instalado pero sin conversion_actions activas en Google Ads. Creá una acción de conversión primero.';
  } else {
    recommendation = `Tag OK + ${active_conversion_count} conversion action(s) activa(s). Sistema completo.`;
  }

  return {
    body: {
      success: true,
      website_url: fullUrl,
      has_gtag: !!gtagId,
      has_gtm: !!gtmId,
      has_ga4: !!ga4Id,
      gtag_id: gtagId,
      gtm_id: gtmId,
      ga4_id: ga4Id,
      detected_tags,
      active_conversion_count,
      recommendation,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    status: 200,
  };
}

// --- Main handler ---

export async function manageGoogleConversions(c: Context) {
  try {
    const body: RequestBody = await c.req.json();
    const { action, connection_id, data } = body;

    if (!action) return c.json({ error: 'Missing required field: action' }, 400);
    if (!connection_id) return c.json({ error: 'Missing required field: connection_id' }, 400);

    const validActions: Action[] = ['list', 'create', 'update', 'check_tracking'];
    if (!validActions.includes(action)) {
      return c.json({ error: `Invalid action: ${action}. Valid: ${validActions.join(', ')}` }, 400);
    }

    console.log(`[manage-google-conversions] Action: ${action}, Connection: ${connection_id}`);

    const resolved = await resolveConnectionAndToken(c, connection_id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status as any);
    }
    const { ctx } = resolved;
    const { customerId, accessToken, developerToken, loginCustomerId } = ctx;

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
      case 'check_tracking':
        result = await handleCheckTracking(ctx.clientId, customerId, accessToken, developerToken, loginCustomerId);
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
