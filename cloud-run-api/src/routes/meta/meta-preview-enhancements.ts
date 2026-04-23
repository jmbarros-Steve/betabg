import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

// Catálogo de Advantage+ Creative enhancements que Steve expone al merchant.
// Cada uno se previsualiza individualmente llamando /generatepreviews con el
// `creative_features_spec` overrideado. `is_generative=true` significa que el
// feature usa IA y el ad se marca como AI-modified — merchant decide.
const ADVANTAGE_FEATURES = [
  // Standard (rule-based, seguras)
  { key: 'image_touchups',                 label: 'Auto-crop por placement',        is_generative: false, default: true,  applies_to: ['image'] },
  { key: 'image_brightness_and_contrast',  label: 'Brillo y contraste',             is_generative: false, default: true,  applies_to: ['image'] },
  { key: 'image_uncrop',                   label: 'Adaptar a vertical 9:16',        is_generative: false, default: true,  applies_to: ['image'] },
  { key: 'music_gen',                      label: 'Música de fondo (Stories/Reels)',is_generative: false, default: true,  applies_to: ['image', 'video'] },
  { key: 'product_extensions',             label: 'Etiquetas de producto',          is_generative: false, default: true,  applies_to: ['image', 'video', 'dpa'] },
  { key: 'site_extensions',                label: 'Site Links (4 enlaces extra)',   is_generative: false, default: true,  applies_to: ['image', 'video'] },
  { key: 'text_optimizations',             label: 'Reorganizar texto por placement',is_generative: false, default: true,  applies_to: ['image', 'video', 'dpa'] },
  { key: 'dynamic_media',                  label: 'Mezcla imagen+video dinámica',   is_generative: false, default: true,  applies_to: ['image', 'video'] },
  // Generative (IA — marca AI-modified)
  { key: 'image_expansion',                label: 'Expandir imagen con IA',         is_generative: true,  default: false, applies_to: ['image'] },
  { key: 'image_generation_background',    label: 'Generar fondo con IA',           is_generative: true,  default: false, applies_to: ['image'] },
  { key: 'text_generation',                label: 'Texto overlay generado por IA',  is_generative: true,  default: false, applies_to: ['image', 'video'] },
  { key: 'enhance_cta',                    label: 'CTA mejorado con IA',            is_generative: true,  default: false, applies_to: ['image', 'video'] },
];

// Single placement used for comparison previews. We don't need all 13 formats —
// the merchant just needs to see the effect of each enhancement side-by-side.
// MOBILE_FEED_STANDARD is the most common placement and renders images and
// videos naturally, so a single iframe per feature is enough to judge.
const PREVIEW_PLACEMENT = 'MOBILE_FEED_STANDARD';

export async function metaPreviewEnhancements(c: Context) {
  try {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { connection_id, creative, ad_type } = body as {
      connection_id: string;
      creative: any;
      ad_type?: 'image' | 'video' | 'dpa';
    };

    if (!connection_id || !creative) {
      return c.json({ error: 'Missing connection_id or creative' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const { data: connection } = await supabase
      .from('platform_connections')
      .select(`id, platform, account_id, access_token_encrypted, connection_type, client_id,
        clients!inner(user_id, client_user_id)`)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (!connection) return c.json({ error: 'Connection not found' }, 404);

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null, 'metaPreviewEnhancements.admin',
      );
      if (!adminRole) return c.json({ error: 'Forbidden' }, 403);
    }

    const token = await getTokenForConnection(supabase, connection);
    if (!token) return c.json({ error: 'Failed to resolve access token' }, 500);

    const accountId = String(connection.account_id).replace(/^act_/, '');
    const resolvedAdType: 'image' | 'video' | 'dpa' = ad_type === 'video' || ad_type === 'dpa' ? ad_type : 'image';
    const applicableFeatures = ADVANTAGE_FEATURES.filter(f => f.applies_to.includes(resolvedAdType));

    // Pre-upload the creative's image to /act/adimages so Meta can render it
    // from its own CDN instead of pulling from Supabase each time (faster and
    // avoids rate limits across N parallel preview calls).
    const creativeForPreview = JSON.parse(JSON.stringify(creative));
    const linkData = creativeForPreview?.object_story_spec?.link_data;
    if (linkData?.picture && !linkData.image_hash) {
      try {
        const imgRes = await fetch(linkData.picture, { signal: AbortSignal.timeout(15_000) });
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const form = new FormData();
          form.append('bytes', Buffer.from(buf).toString('base64'));
          form.append('access_token', token);
          const upRes = await fetch(`${META_API_BASE}/act_${accountId}/adimages`, { method: 'POST', body: form });
          const upData: any = await upRes.json().catch(() => ({}));
          const hash = upData?.images ? Object.values(upData.images)[0] : null;
          if (hash && typeof hash === 'object' && (hash as any).hash) {
            linkData.image_hash = (hash as any).hash;
            delete linkData.picture;
          }
        }
      } catch { /* fall back to picture URL */ }
    }

    // Build a `creative_features_spec` helper: one feature OPT_IN, rest NOT_SET.
    const buildSpec = (featureKey: string) => {
      const spec: Record<string, { enroll_status: string }> = {};
      spec[featureKey] = { enroll_status: 'OPT_IN' };
      return spec;
    };

    // Parallel preview calls — one per feature. Each call overrides the creative
    // with a creative_features_spec that turns ONLY that feature on. If Meta
    // rejects the call with an eligibility error, we mark the feature as
    // ineligible so the UI can show it greyed-out instead of a broken preview.
    const settled = await Promise.allSettled(
      applicableFeatures.map(async (feature) => {
        const creativeWithFeature = {
          ...creativeForPreview,
          creative_features_spec: buildSpec(feature.key),
        };
        const url = new URL(`${META_API_BASE}/act_${accountId}/generatepreviews`);
        url.searchParams.set('ad_format', PREVIEW_PLACEMENT);
        url.searchParams.set('creative', JSON.stringify(creativeWithFeature));
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(30_000),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok || !data?.data?.[0]?.body) {
          const errMsg = data?.error?.message || `HTTP ${res.status}`;
          const isIneligible = /not eligible|does not support|invalid enroll|ineligible/i.test(errMsg);
          return {
            ...feature,
            eligible: !isIneligible,
            iframe: null as string | null,
            error: errMsg,
          };
        }
        return {
          ...feature,
          eligible: true,
          iframe: data.data[0].body as string,
          error: null as string | null,
        };
      }),
    );

    const results = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { ...applicableFeatures[i], eligible: false, iframe: null, error: 'Request failed' },
    );

    // Baseline preview without any enhancements — used as "before" comparison.
    let baselineIframe: string | null = null;
    try {
      const baselineUrl = new URL(`${META_API_BASE}/act_${accountId}/generatepreviews`);
      baselineUrl.searchParams.set('ad_format', PREVIEW_PLACEMENT);
      baselineUrl.searchParams.set('creative', JSON.stringify(creativeForPreview));
      const baseRes = await fetch(baselineUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      const baseData: any = await baseRes.json().catch(() => ({}));
      if (baseRes.ok && baseData?.data?.[0]?.body) {
        baselineIframe = baseData.data[0].body;
      }
    } catch { /* non-fatal */ }

    return c.json({
      baseline: baselineIframe,
      placement: PREVIEW_PLACEMENT,
      features: results,
    });
  } catch (err: any) {
    console.error('[meta-preview-enhancements] error:', err);
    return c.json({ error: err?.message || 'Internal error' }, 500);
  }
}
