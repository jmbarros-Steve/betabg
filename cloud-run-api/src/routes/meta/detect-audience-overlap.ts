import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { metaApiJson } from '../../lib/meta-fetch.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

interface TargetingInfo {
  adset_id: string;
  adset_name: string;
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: any;
  interests?: Array<{ id: string; name: string }>;
  custom_audiences?: Array<{ id: string; name: string }>;
  excluded_custom_audiences?: Array<{ id: string; name: string }>;
}

interface OverlapResult {
  adset_a: { id: string; name: string };
  adset_b: { id: string; name: string };
  overlap_pct: number;
  overlap_details: string[];
}

/**
 * POST /api/detect-audience-overlap
 *
 * Body: { client_id, campaign_id }
 *
 * Fetches targeting of all active ad sets in a campaign,
 * compares pairwise, and flags overlaps > 30%.
 */
export async function detectAudienceOverlap(c: Context) {
  const supabase = getSupabaseAdmin();
  const body = await c.req.json();
  const { client_id, campaign_id } = body;

  if (!client_id || !campaign_id) {
    return c.json({ error: 'client_id and campaign_id are required' }, 400);
  }

  // Auth
  const user = c.get('user');
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  const ownerCheck = await safeQuerySingleOrDefault<any>(
    supabase
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .or(`user_id.eq."${user.id}",client_user_id.eq."${user.id}"`)
      .maybeSingle(),
    null,
    'detectAudienceOverlap.ownerCheck',
  );
  if (!ownerCheck) return c.json({ error: 'No tienes acceso' }, 403);

  // Get Meta token
  const conn = await safeQuerySingleOrDefault<any>(
    supabase
      .from('platform_connections')
      .select('id, access_token_encrypted, connection_type')
      .eq('client_id', client_id)
      .eq('platform', 'meta')
      .maybeSingle(),
    null,
    'detectAudienceOverlap.getConnection',
  );

  if (!conn) {
    return c.json({ error: 'No hay conexión a Meta' }, 404);
  }

  const token = await getTokenForConnection(supabase, conn);
  if (!token) return c.json({ error: 'Error resolviendo token' }, 500);

  try {
    // Fetch ad sets for the campaign
    const adsetsRes = await metaApiJson<any>(`/${campaign_id}/adsets`, token, {
      params: {
        fields: 'id,name,status,targeting',
        limit: '50',
      },
    });

    if (!adsetsRes.ok) {
      const metaError = adsetsRes.error?.message || 'Error obteniendo ad sets';
      return c.json({ error: metaError }, 502);
    }
    if (!adsetsRes.data?.data) {
      return c.json({ error: 'No se encontraron ad sets para esta campaña' }, 404);
    }

    // Filter active ad sets only
    const activeAdsets = adsetsRes.data.data.filter(
      (a: any) => ['ACTIVE', 'PAUSED'].includes(a.status)
    );

    if (activeAdsets.length < 2) {
      return c.json({ overlaps: [], message: 'Se necesitan 2+ ad sets para detectar overlap' });
    }

    // Extract targeting info
    const targetings: TargetingInfo[] = activeAdsets.map((a: any) => {
      const t = a.targeting || {};
      return {
        adset_id: a.id,
        adset_name: a.name,
        age_min: t.age_min,
        age_max: t.age_max,
        genders: t.genders,
        geo_locations: t.geo_locations,
        interests: t.flexible_spec?.[0]?.interests || [],
        custom_audiences: t.custom_audiences || [],
        excluded_custom_audiences: t.excluded_custom_audiences || [],
      };
    });

    // Pairwise comparison
    const overlaps: OverlapResult[] = [];

    for (let i = 0; i < targetings.length; i++) {
      for (let j = i + 1; j < targetings.length; j++) {
        const result = compareTargeting(targetings[i], targetings[j]);
        if (result.overlap_pct > 30) {
          overlaps.push(result);
        }
      }
    }

    // Build map of adset_id → overlapping adset IDs for easy frontend lookup
    const overlapMap: Record<string, { overlap_pct: number; conflicting_adset: string; details: string[] }[]> = {};
    for (const o of overlaps) {
      if (!overlapMap[o.adset_a.id]) overlapMap[o.adset_a.id] = [];
      if (!overlapMap[o.adset_b.id]) overlapMap[o.adset_b.id] = [];
      overlapMap[o.adset_a.id].push({
        overlap_pct: o.overlap_pct,
        conflicting_adset: o.adset_b.name,
        details: o.overlap_details,
      });
      overlapMap[o.adset_b.id].push({
        overlap_pct: o.overlap_pct,
        conflicting_adset: o.adset_a.name,
        details: o.overlap_details,
      });
    }

    return c.json({ overlaps, overlap_map: overlapMap });
  } catch (err: any) {
    console.error('[detect-audience-overlap]', err);
    return c.json({ error: 'Error analizando overlap', details: err?.message || 'Unknown error' }, 500);
  }
}

function compareTargeting(a: TargetingInfo, b: TargetingInfo): OverlapResult {
  let totalFactors = 0;
  let matchingFactors = 0;
  const details: string[] = [];

  // Age overlap
  totalFactors++;
  const aMin = a.age_min || 18;
  const aMax = a.age_max || 65;
  const bMin = b.age_min || 18;
  const bMax = b.age_max || 65;
  const overlapMin = Math.max(aMin, bMin);
  const overlapMax = Math.min(aMax, bMax);
  if (overlapMax > overlapMin) {
    const overlapRange = overlapMax - overlapMin;
    const maxRange = Math.max(aMax - aMin, bMax - bMin, 1);
    const ageOverlap = overlapRange / maxRange;
    matchingFactors += ageOverlap;
    if (ageOverlap > 0.5) details.push(`Edad: ${overlapMin}-${overlapMax} años (${Math.round(ageOverlap * 100)}% overlap)`);
  }

  // Gender overlap
  totalFactors++;
  const aGenders = a.genders || [0]; // 0 = all
  const bGenders = b.genders || [0];
  if (aGenders.includes(0) || bGenders.includes(0) || aGenders.some(g => bGenders.includes(g))) {
    matchingFactors += 1;
    if (aGenders.includes(0) && bGenders.includes(0)) {
      details.push('Género: ambos apuntan a todos');
    }
  }

  // Geo overlap
  totalFactors++;
  const aCountries = (a.geo_locations?.countries || []) as string[];
  const bCountries = (b.geo_locations?.countries || []) as string[];
  if (aCountries.length === 0 && bCountries.length === 0) {
    matchingFactors += 1;
    details.push('Geo: sin restricción geográfica');
  } else if (aCountries.length > 0 && bCountries.length > 0) {
    const commonCountries = aCountries.filter(c => bCountries.includes(c));
    if (commonCountries.length > 0) {
      const geoOverlap = commonCountries.length / Math.max(aCountries.length, bCountries.length, 1);
      matchingFactors += geoOverlap;
      if (geoOverlap > 0.5) details.push(`Geo: ${commonCountries.join(', ')} en común`);
    }
  }

  // Interest overlap
  totalFactors++;
  const aInterests = a.interests || [];
  const bInterests = b.interests || [];
  const aInterestIds = new Set(aInterests.map(i => i.id));
  const bInterestIds = new Set(bInterests.map(i => i.id));
  if (aInterestIds.size === 0 && bInterestIds.size === 0) {
    matchingFactors += 0.5; // Both broad = partial overlap
  } else if (aInterestIds.size > 0 && bInterestIds.size > 0) {
    const common = [...aInterestIds].filter(id => bInterestIds.has(id));
    if (common.length > 0) {
      const interestOverlap = common.length / Math.max(aInterestIds.size, bInterestIds.size, 1);
      matchingFactors += interestOverlap;
      const commonNames = aInterests
        .filter(i => common.includes(i.id))
        .map(i => i.name)
        .slice(0, 3);
      if (interestOverlap > 0.3) details.push(`Intereses: ${commonNames.join(', ')} en común`);
    }
  }

  // Custom audience overlap
  totalFactors++;
  const aCustom = a.custom_audiences || [];
  const bCustom = b.custom_audiences || [];
  const aCustomIds = new Set(aCustom.map(ca => ca.id));
  const bCustomIds = new Set(bCustom.map(ca => ca.id));
  if (aCustomIds.size > 0 && bCustomIds.size > 0) {
    const commonCA = [...aCustomIds].filter(id => bCustomIds.has(id));
    if (commonCA.length > 0) {
      const caOverlap = commonCA.length / Math.max(aCustomIds.size, bCustomIds.size, 1);
      matchingFactors += caOverlap;
      const commonNames = aCustom
        .filter(ca => commonCA.includes(ca.id))
        .map(ca => ca.name)
        .slice(0, 2);
      details.push(`Audiencia custom: ${commonNames.join(', ')} en común`);
    }
  }

  const overlapPct = totalFactors > 0 ? Math.round((matchingFactors / totalFactors) * 100) : 0;

  return {
    adset_a: { id: a.adset_id, name: a.adset_name },
    adset_b: { id: b.adset_id, name: b.adset_name },
    overlap_pct: overlapPct,
    overlap_details: details,
  };
}
