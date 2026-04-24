import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadStudioAssets,
  buildAssetSnapshot,
  type StudioAssets,
} from '../../lib/brief-estudio-loader.js';
import { pickTrackForAngleAndMood, type MusicMood } from '../../lib/music-library.js';
import { runReplicatePrediction, ReplicateError } from '../../lib/replicate.js';

// Google Veo 3.1 Preview (standard — max quality) via Gemini Developer API.
// Same GEMINI_API_KEY as generate-image.ts (Imagen 4 Fast). Pricing: $0.40/sec
// with native audio (music + SFX + lip-synced dialog). Supported durations: 4, 6, 8s.
// 4s 1080p = $1.60, 8s 1080p = $3.20. Legacy Replicate/Kling was $0.50 for 5s silent.
const VEO_MODEL = 'veo-3.1-generate-preview';
const VEO_LAUNCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning`;
const VEO_POLL_BASE = 'https://generativelanguage.googleapis.com/v1beta/';

const DEFAULT_DURATION_SEC = 8;
const VIDEO_USD_COST = DEFAULT_DURATION_SEC * 0.40; // $3.20 for 8s @ $0.40/s
const VIDEO_CREDIT_COST = 30;                       // ~3x Kling cost (10) reflecting Veo pricing

// Runway Gen-4 Turbo via Replicate — premium alternative to Veo. 10s default,
// text+image-to-video, ~$0.05/s → $0.50/10s. 50 credits reflects higher perceived
// quality (more cinematic camera moves, better motion coherence) and 10s length.
// Kept as admin-forceable fallback — default for silent templates is now Seedance.
const RUNWAY_REPLICATE_MODEL = 'runwayml/gen4-turbo';
const RUNWAY_USD_COST = 0.50; // 10s at $0.05/s
const RUNWAY_CREDIT_COST = 50;
const RUNWAY_DURATION_SEC = 10;

// Seedance 1 Pro via Replicate — kept reachable as admin-forceable engine.
// Image-to-video / text-to-video, 2-12s @ 480p/720p/1080p @ 24fps. Single start-frame
// ref via `image`. Seedance does NOT accept multi-ref so even when studio_mode
// has both producto + actor, only ONE anchor reaches the model. That single-ref
// limitation is exactly what motivated the Kling migration below.
// Pricing: $3.00/10s, billed as 60 credits.
const SEEDANCE_REPLICATE_MODEL = 'bytedance/seedance-1-pro';
const SEEDANCE_USD_COST = 3.00;
const SEEDANCE_CREDIT_COST = 60;
const SEEDANCE_DURATION_SEC = 10;

// Kling Video 3.0 Omni via Replicate — DEFAULT silent engine (replaces Seedance 1 Pro).
//
// CRITICAL FINDING (2026-04-24): The user task referenced "Kling 2.1 Master" as the
// multi-ref engine. That is FACTUALLY WRONG on Replicate — kwaivgi/kling-v2.1-master
// only accepts a single `start_image` (verified against openapi_schema). The Kling
// models on Replicate that accept multi-image refs are:
//   - kwaivgi/kling-v1.6-pro      → reference_images array (max 4) — legacy
//   - kwaivgi/kling-v3-omni-video → reference_images array (max 7) + native <<<image_N>>>
//                                   template syntax in prompt for explicit per-image
//                                   referencing — best disambiguation tooling.
// We pick kling-v3-omni-video. It's the newest, supports per-image references in the
// prompt (so we can explicitly say "<<<image_1>>> sits on a desk while <<<image_2>>>
// holds it"), and produces 1080p in 'pro' mode. This is the DEFINITIVE fix for the
// "producto falso" bug — both producto + actor land in reference_images at the same
// time, no more 1-ref tradeoff.
//
// Schema verified 2026-04-24 against latest_version 460d4f46... (kling-v3-omni-video):
//   - required: prompt (max 2500 chars; supports <<<image_1>>>, <<<video_1>>> templates)
//   - reference_images: array<uri> — Max 7 without video, 4 with video. Used for
//     elements/scenes/styles. THIS is the multi-ref field we need.
//   - mode enum: 'standard' | 'pro' | 'pro4k' (note: schema literal is 'standard'/'pro'/'4k')
//   - duration: integer 3-15 (we use 10)
//   - aspect_ratio enum: '16:9' | '9:16' | '1:1' (required when no start_image)
//   - generate_audio: boolean (default false) — we leave false for silent templates
//   - start_image, end_image: optional anchors (we don't use them; reference_images
//     is the multi-ref path)
// Pricing: ~$3.50/10s 1080p (Kling v3 tier). 70 credits.
const KLING_REPLICATE_MODEL = 'kwaivgi/kling-v3-omni-video';
const KLING_USD_COST = 3.50;
const KLING_CREDIT_COST = 70;
const KLING_DURATION_SEC = 10;

type AspectRatio = '9:16' | '16:9' | '1:1';
type VideoEngine = 'veo' | 'runway' | 'seedance' | 'kling';

// ── Hardcoded engine auto-select ───────────────────────────────────────────
// The client NEVER chooses Veo vs Runway vs templates. Steve picks the right
// engine behind the scenes based on the creative angle. Runway = product-led
// cinematic (silent, 10s, better motion coherence). Veo = people-led with
// audio (talking head, UGC, testimonials, 8s, native voice+ambience).
// Admin override: super_admin callers can force `engine: 'veo' | 'runway'`
// in the request body; everyone else gets auto-selection.
const ANGLE_TEMPLATE: Record<string, string> = {
  'Bold Statement': 'hero_shot',
  'Beneficios': 'hero_shot',
  'Beneficios Principales': 'hero_shot',
  'Nueva Colección': 'product_reveal',
  'Descuentos/Ofertas': 'product_reveal',
  'Ingredientes/Material': 'macro_detail',
  'Detalles de Producto': 'macro_detail',
  'Antes y Después': 'before_after',
  'Reviews/Testimonios': 'testimonial',
  'Reviews + Beneficios': 'testimonial',
  'Mensajes y Comentarios': 'testimonial',
  'Call Out': 'talking_head',
  'Ugly Ads': 'lifestyle_ugc',
  'Memes': 'lifestyle_ugc',
  'Pantalla Dividida': 'before_after',
  'Paquetes': 'hero_shot',
  'Resultados': 'hero_shot',
  'Us vs Them': 'before_after',
};

// Silent templates default to Kling Video 3.0 Omni (replaces Seedance 1 Pro).
// Kling v3 Omni is the only Replicate Kling that accepts multi-image refs (up to
// 7 via reference_images), so we can finally pass producto + actor as PEER
// references and let the prompt disambiguate them via <<<image_1>>>/<<<image_2>>>
// template tokens. Seedance and Runway stay reachable via admin override
// `engine: 'seedance' | 'runway'` for A/B testing. Veo keeps all dialog angles.
const TEMPLATE_ENGINE: Record<string, VideoEngine> = {
  'hero_shot': 'kling',
  'product_reveal': 'kling',
  'unboxing': 'kling',
  'before_after': 'kling',
  'macro_detail': 'kling',
  'lifestyle_ugc': 'veo',
  'talking_head': 'veo',
  'testimonial': 'veo',
};

function deriveTemplate(angulo: string | undefined): string {
  return (angulo && ANGLE_TEMPLATE[angulo]) || 'hero_shot';
}

function deriveEngine(angulo: string | undefined): VideoEngine {
  const template = deriveTemplate(angulo);
  return TEMPLATE_ENGINE[template] || 'kling';
}

async function isSuperAdmin(supabase: SupabaseClient, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin')
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// Merge engine metadata into the existing brief_visual JSON without clobbering
// the structured brief fields (concepto, plano, prompt_generacion, etc.) that
// generate-brief-visual writes. Read-modify-write keeps it simple and we don't
// care about the race window (single-writer per creativeId).
async function persistEngineToCreative(
  supabase: SupabaseClient,
  creativeId: string,
  extraUpdates: Record<string, unknown>,
  engineMeta: { engine: VideoEngine; template: string; angulo: string | null },
): Promise<void> {
  const { data: existing } = await supabase
    .from('ad_creatives')
    .select('brief_visual')
    .eq('id', creativeId)
    .maybeSingle();
  const currentBrief = (existing?.brief_visual && typeof existing.brief_visual === 'object')
    ? existing.brief_visual as Record<string, unknown>
    : {};
  const mergedBrief = { ...currentBrief, ...engineMeta };
  await supabase.from('ad_creatives').update({
    ...extraUpdates,
    brief_visual: mergedBrief,
  }).eq('id', creativeId);
}

// Idempotent refund. Uses credit_transactions.accion as the dedup key because
// we don't have an operation_id column yet. The first refund inserts a row with
// `refund op=<operationName>` in accion; subsequent calls are no-ops.
// Billing RPC (deduct_credits) not yet in place — we only log transactions.
// When billing lands, wire back the `.rpc('deduct_credits', ...)` call.
async function refundVideoCreditsOnce(
  supabase: SupabaseClient,
  clientId: string,
  operationName: string,
  reason: string,
  engine: VideoEngine = 'veo',
): Promise<void> {
  const refundMarker = `refund op=${operationName}`;
  const { data: existing } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('client_id', clientId)
    .like('accion', `%${refundMarker}%`)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(`[generate-video] refund already applied for op ${operationName}, skipping`);
    return;
  }
  const credits =
    engine === 'kling' ? KLING_CREDIT_COST
      : engine === 'seedance' ? SEEDANCE_CREDIT_COST
        : engine === 'runway' ? RUNWAY_CREDIT_COST
          : VIDEO_CREDIT_COST;
  const usd =
    engine === 'kling' ? KLING_USD_COST
      : engine === 'seedance' ? SEEDANCE_USD_COST
        : engine === 'runway' ? RUNWAY_USD_COST
          : VIDEO_USD_COST;
  const engineLabel =
    engine === 'kling' ? 'Kling 3.0 Omni'
      : engine === 'seedance' ? 'Seedance 1 Pro'
        : engine === 'runway' ? 'Runway Gen-4 Turbo'
          : 'Veo 3.1';
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Refund video ${engineLabel} (${reason}) — ${refundMarker}`,
    creditos_usados: -credits,
    costo_real_usd: -usd,
  });
}

// Resolve a valid image URL for image-to-video. Priority:
// 1. Explicit `fotoBaseUrls[]` (array, new) — use up to 3
// 2. Explicit `fotoBaseUrl` (string, legacy) — wrap as single-item array
// 3. Shopify catalog fallback — if client has synced products, pick up to 3 real
//    photos. This stops Veo from inventing garbage when the caller didn't pass
//    any reference (previous symptom: "finger in mud" when doing pure text-to-video).
// Only returns URLs that pass an http(s) validity check.
async function resolveReferenceImageUrls(
  supabase: SupabaseClient,
  clientId: string | undefined,
  fotoBaseUrls: string[] | undefined,
  fotoBaseUrl: string | undefined,
): Promise<string[]> {
  const isHttpUrl = (s: unknown): s is string =>
    typeof s === 'string' && /^https?:\/\//i.test(s.trim());

  const urls: string[] = [];

  if (Array.isArray(fotoBaseUrls)) {
    for (const u of fotoBaseUrls) {
      if (isHttpUrl(u)) urls.push(u.trim());
    }
  }
  if (urls.length === 0 && isHttpUrl(fotoBaseUrl)) {
    urls.push(fotoBaseUrl.trim());
  }
  if (urls.length > 0) return urls.slice(0, 3);

  // Catalog fallback — only if we have a clientId. Text-to-video is the last
  // resort because Veo hallucinates badly without an anchor image.
  if (!clientId) return [];
  try {
    const { data: products } = await supabase
      .from('shopify_products')
      .select('image_url, title')
      .eq('client_id', clientId)
      .not('image_url', 'is', null)
      .limit(20);
    if (!products || products.length === 0) return [];
    const catalogUrls = products
      .map((p: any) => p.image_url as string | null)
      .filter((u): u is string => isHttpUrl(u));
    if (catalogUrls.length === 0) return [];
    const picked = catalogUrls.slice(0, 3);
    console.log(`[generate-video] Using catalog fallback product photos (${picked.length}):`, picked[0]);
    return picked;
  } catch (err: any) {
    console.warn('[generate-video] catalog fallback query failed:', err?.message);
    return [];
  }
}

// Download a URL as base64 with a 15s timeout. Returns null on any failure.
async function fetchImageAsBase64(
  url: string,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const imgResp = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    if (!imgResp.ok) {
      console.warn(`[generate-video] image download failed ${imgResp.status} for ${url.slice(0, 80)}`);
      return null;
    }
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const mime = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    return { mimeType: mime, data: buf.toString('base64') };
  } catch (err: any) {
    console.warn('[generate-video] image download error:', err?.message);
    return null;
  }
}

export async function generateVideo(c: Context) {
  try {
    const {
      clientId,
      creativeId,
      promptGeneracion,
      fotoBaseUrl,
      fotoBaseUrls,
      aspectRatio,
      engine,
      angulo,
      funnelStage,
      // Brief Estudio — Etapa 5
      studio_mode: rawStudioMode,
      mood_key: rawMoodKey,
    } = await c.req.json();

    const supabase = getSupabaseAdmin();
    const studioMode = rawStudioMode === true;
    const moodKey: string | null =
      typeof rawMoodKey === 'string' ? rawMoodKey.trim().slice(0, 32) : null;

    // Brief Estudio: si studio_mode=true, cargamos assets del cliente una vez
    // y los usamos para enriquecer refs (actor + primer producto) y seleccionar
    // un track musical sugerido para el post-proceso.
    let studioAssets: StudioAssets | null = null;
    if (studioMode && clientId) {
      try {
        studioAssets = await loadStudioAssets(supabase, clientId);
      } catch (err: any) {
        console.warn('[generate-video][studio] loadStudioAssets failed:', err?.message);
        studioAssets = null;
      }
    }

    // Resolve engine. Default path = auto-select based on creative angle (the
    // client never sees Veo/Runway — Steve picks). Admin override: if the body
    // passes an explicit engine AND the caller is super_admin, honor it.
    // Otherwise we ignore `engine` and use deriveEngine(angulo).
    const user = c.get('user');
    const userId: string | undefined = user?.id;
    const autoEngine: VideoEngine = deriveEngine(angulo);
    let engineChoice: VideoEngine = autoEngine;
    const explicitEngine: VideoEngine | null =
      engine === 'runway' || engine === 'veo' || engine === 'seedance' || engine === 'kling' ? engine : null;
    if (explicitEngine) {
      const adminOverride = await isSuperAdmin(supabase, userId);
      if (adminOverride) {
        engineChoice = explicitEngine;
        console.log(`[generate-video] super_admin override: engine=${explicitEngine} (auto would be ${autoEngine}) for angulo="${angulo || 'n/a'}"`);
      } else {
        console.log(`[generate-video] ignored non-admin engine override "${explicitEngine}", using auto=${autoEngine} for angulo="${angulo || 'n/a'}"`);
      }
    } else {
      console.log(`[generate-video] auto-selected engine=${autoEngine} for angulo="${angulo || 'n/a'}" (template=${deriveTemplate(angulo)})`);
    }
    // Silence unused-param lint — funnelStage is forwarded for future use
    // and logged here so the parameter is not stripped by TS pass.
    if (funnelStage) console.log(`[generate-video] funnelStage=${funnelStage}`);

    if (!promptGeneracion || typeof promptGeneracion !== 'string') {
      return c.json({ error: 'promptGeneracion es obligatorio' }, 400);
    }

    // Validate aspect ratio (Veo 3.1 supports 16:9 and 9:16 — 1:1 is NOT
    // supported as of April 2026, falls back to 9:16 with a warning).
    // Runway Gen-4 supports 16:9, 9:16, 1:1 — so the same validated value
    // works for both (1:1 gets normalized to 9:16 to be Veo-safe by default).
    const validRatios: AspectRatio[] = ['9:16', '16:9'];
    const finalAspect: AspectRatio = validRatios.includes(aspectRatio as AspectRatio)
      ? (aspectRatio as AspectRatio)
      : '9:16';
    if (aspectRatio && aspectRatio !== finalAspect) {
      console.warn(`[generate-video] aspect ratio ${aspectRatio} not supported, falling back to ${finalAspect}`);
    }

    // Resolve reference images (multi-image support + Shopify catalog fallback).
    // IMPROVEMENT #1 + #5: image-to-video is now effectively mandatory whenever
    // the client has a catalog — we fetch up to 3 product photos automatically,
    // stopping Veo from inventing garbage on pure text-to-video.
    //
    // Brief Estudio: if studio_mode=true and the caller did not pass explicit
    // fotoBaseUrls, prepend Brief Estudio assets (first featured product +
    // primary actor image) so Veo/Runway anchor to the brand's chosen visuals.
    let mergedFotoBaseUrls: string[] | undefined = fotoBaseUrls;
    if (studioMode && studioAssets) {
      const providedAny =
        (Array.isArray(fotoBaseUrls) && fotoBaseUrls.length > 0) ||
        (typeof fotoBaseUrl === 'string' && fotoBaseUrl.trim().length > 0);
      if (!providedAny) {
        const studioRefs: string[] = [];
        const firstProductImage = studioAssets.featured_products?.[0]?.image_url;
        if (firstProductImage) studioRefs.push(firstProductImage);
        const actorImage = studioAssets.primary_actor?.reference_images?.[0];
        if (actorImage) studioRefs.push(actorImage);
        if (studioRefs.length > 0) {
          mergedFotoBaseUrls = studioRefs;
          console.log(
            `[generate-video][studio] Using Brief Estudio refs (${studioRefs.length}): first product + actor`,
          );
        }
      }
    }
    const referenceUrls = await resolveReferenceImageUrls(supabase, clientId, mergedFotoBaseUrls, fotoBaseUrl);

    // Brief Estudio: auto-pick a music track seed based on angulo + mood_key.
    // This does NOT generate audio here — generate-video stays focused on
    // video generation. The track id flows through to asset_snapshot so a
    // later FFmpeg merge step (phase 2) can pull the track.
    let studioMusicTrackId: string | null = null;
    if (studioMode && moodKey && angulo) {
      try {
        const track = pickTrackForAngleAndMood(String(angulo), moodKey as MusicMood);
        studioMusicTrackId = track?.id || null;
        if (studioMusicTrackId) {
          console.log(`[generate-video][studio] picked music track: ${studioMusicTrackId} (mood=${moodKey})`);
        }
      } catch (err: any) {
        console.warn('[generate-video][studio] music pick failed:', err?.message);
      }
    }

    // Branch on engine. Kling + Seedance + Runway use Replicate, Veo uses Gemini Developer API.
    if (engineChoice === 'kling') {
      return runGenerateKling(c, supabase, {
        clientId,
        creativeId,
        promptGeneracion,
        referenceUrls,
        finalAspect,
        angulo,
        studioMode,
        studioAssets,
        studioMusicTrackId,
        moodKey,
      });
    }
    if (engineChoice === 'seedance') {
      return runGenerateSeedance(c, supabase, {
        clientId,
        creativeId,
        promptGeneracion,
        referenceUrls,
        finalAspect,
        angulo,
        studioMode,
        studioAssets,
        studioMusicTrackId,
        moodKey,
      });
    }
    if (engineChoice === 'runway') {
      return runGenerateRunway(c, supabase, {
        clientId,
        creativeId,
        promptGeneracion,
        referenceUrls,
        finalAspect,
        angulo,
        studioMode,
        studioAssets,
        studioMusicTrackId,
        moodKey,
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-video] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // TODO: Re-enable credit enforcement when billing system is ready. For
    // now we log the transaction at the end (same pattern as generate-image).

    // Enrich prompt with learned visual style rules + explicit audio cue for Veo.
    let knowledgeBlock = '';
    try {
      const loaded = await loadKnowledge(['anuncios'], { limit: 5, label: 'VISUAL STYLE RULES', audit: { source: 'generate-video' } });
      knowledgeBlock = loaded.knowledgeBlock || '';
    } catch (kerr: any) {
      console.warn('[generate-video] loadKnowledge failed, continuing without it:', kerr?.message);
    }
    const audioCue = 'Include natural ambient audio, light background music matching the mood, and clear diegetic sound effects. If a person speaks, lip-sync accurately.';
    const enrichedPrompt = [
      promptGeneracion,
      audioCue,
      knowledgeBlock,
    ].filter(Boolean).join('\n\n');

    // Download reference images in parallel (up to 3). Each becomes an inlineData
    // part. Veo 3.1 accepts a primary `image` field + optional `reference_images`
    // array (up to 3 total). If no images resolve (no URL provided AND no
    // catalog), fall through to pure text-to-video — still supported, just worse.
    let imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    if (referenceUrls.length > 0) {
      const fetched = await Promise.all(referenceUrls.map((u) => fetchImageAsBase64(u)));
      imageParts = fetched
        .filter((x): x is { mimeType: string; data: string } => !!x)
        .map((x) => ({ inlineData: x }));
    }
    if (referenceUrls.length === 0) {
      console.warn('[generate-video] No reference images available (no URL + no catalog) — falling back to text-to-video. Expect worse results.');
    }

    // 1) Launch long-running generation.
    // Veo 3.1 REST API (predictLongRunning) shape:
    //   - Single image anchor: `image: { inlineData: { mimeType, data } }` (classic image-to-video)
    //   - Multi reference: `referenceImages: [{ image: {inlineData}, referenceType: 'asset' }]` (up to 3)
    // We use `referenceImages` ONLY when we have multiple refs. With a single ref,
    // sticking to the legacy `image` field is more reliable (documented as primary).
    const instance: Record<string, any> = { prompt: enrichedPrompt };
    if (imageParts.length === 1) {
      instance.image = imageParts[0];
    } else if (imageParts.length > 1) {
      instance.referenceImages = imageParts.slice(0, 3).map((p) => ({
        image: p,
        referenceType: 'asset',
      }));
    }

    const launch = await fetch(VEO_LAUNCH_URL, {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: [instance],
        parameters: {
          aspectRatio: finalAspect,
          durationSeconds: DEFAULT_DURATION_SEC, // 4 | 6 | 8 only
          resolution: '1080p',                   // 720p | 1080p | 4k
          personGeneration: 'allow_all',
        },
      }),
    });

    if (!launch.ok) {
      const errText = await launch.text();
      console.error('[generate-video] Veo launch error:', launch.status, errText);
      await refundVideoCreditsOnce(supabase, clientId, `launch-fail-${Date.now()}`, `launch HTTP ${launch.status}`);
      return c.json({ error: 'Error iniciando generación de video', details: errText.slice(0, 300) }, 502);
    }

    const launchData: any = await launch.json();
    const operationName: string | undefined = launchData.name;
    if (!operationName) {
      console.error('[generate-video] Veo did not return operation name:', launchData);
      await refundVideoCreditsOnce(supabase, clientId, `no-op-${Date.now()}`, 'no operation name');
      return c.json({ error: 'Veo no devolvió operation name' }, 502);
    }

    // Persist the operation id so the caller can poll us (and we can poll Google).
    // Engine persisted inside brief_visual JSON (no metadata column exists) so
    // admin UIs can render which motor was used without adding a migration.
    if (creativeId) {
      await persistEngineToCreative(
        supabase,
        creativeId,
        { prediction_id: operationName, estado: 'generando' },
        { engine: 'veo', template: deriveTemplate(angulo), angulo: angulo || null },
      );
    }

    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Generar video Veo 3.1 (${DEFAULT_DURATION_SEC}s, 1080p, audio, ${finalAspect}) — op=${operationName}`,
      creditos_usados: VIDEO_CREDIT_COST,
      costo_real_usd: VIDEO_USD_COST,
    });

    // 2) Poll inline up to ~4.5 minutes. Veo typically takes 1-3 min for 8s 1080p.
    // Cloud Run default timeout is 300s (5 min) — we stay under that. If it times
    // out we return the operation name and let the frontend poll via
    // /api/generate-video-status. Credits are NOT refunded on timeout because the
    // video is still being generated and will land when the client polls later.
    const POLL_DEADLINE_MS = Date.now() + 4.5 * 60_000;
    let attempts = 0;
    while (Date.now() < POLL_DEADLINE_MS) {
      attempts++;
      await new Promise(r => setTimeout(r, attempts <= 3 ? 8_000 : 15_000));
      try {
        const pollRes = await fetch(`${VEO_POLL_BASE}${operationName}`, {
          headers: { 'x-goog-api-key': GEMINI_API_KEY },
          signal: AbortSignal.timeout(15_000),
        });
        if (!pollRes.ok) {
          console.warn(`[generate-video] poll ${attempts} HTTP ${pollRes.status}`);
          continue;
        }
        const op: any = await pollRes.json();
        if (!op.done) continue;
        if (op.error) {
          console.error('[generate-video] Veo operation failed:', op.error);
          await refundVideoCreditsOnce(supabase, clientId, operationName, 'Veo failed');
          return c.json({ error: 'Veo falló al generar el video', details: op.error?.message }, 502);
        }
        const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
        const videoUri: string | undefined = sample?.video?.uri;
        if (!videoUri) {
          console.error('[generate-video] Veo done but no video uri:', op);
          await refundVideoCreditsOnce(supabase, clientId, operationName, 'no video uri');
          return c.json({ error: 'Veo completó pero no devolvió URI' }, 502);
        }

        // 3) Download MP4 (Google retains it only 48h) and persist to Supabase Storage.
        const dl = await fetch(videoUri, {
          headers: { 'x-goog-api-key': GEMINI_API_KEY },
          signal: AbortSignal.timeout(60_000),
        });
        if (!dl.ok) {
          console.error(`[generate-video] mp4 download failed ${dl.status}`);
          await refundVideoCreditsOnce(supabase, clientId, operationName, `mp4 download ${dl.status}`);
          return c.json({ error: 'Video generado pero no se pudo descargar' }, 502);
        }
        const mp4Bytes = Buffer.from(await dl.arrayBuffer());

        const storagePath = `${clientId}/ads/video_${Date.now()}.mp4`;
        const { error: uploadErr } = await supabase
          .storage
          .from('client-assets')
          .upload(storagePath, mp4Bytes, { contentType: 'video/mp4', upsert: false });
        if (uploadErr) {
          console.error('[generate-video] Supabase upload failed:', uploadErr.message);
          await refundVideoCreditsOnce(supabase, clientId, operationName, `storage: ${uploadErr.message}`);
          return c.json({ error: 'No se pudo guardar el video generado' }, 502);
        }
        const { data: pub } = supabase.storage.from('client-assets').getPublicUrl(storagePath);
        const assetUrl = pub.publicUrl;

        if (creativeId) {
          await persistEngineToCreative(
            supabase,
            creativeId,
            { asset_url: assetUrl, estado: 'listo', formato: 'video' },
            { engine: 'veo', template: deriveTemplate(angulo), angulo: angulo || null },
          );
          // Brief Estudio — Etapa 5: snapshot inmutable de los assets usados.
          if (studioMode && studioAssets) {
            try {
              const snapshot = buildAssetSnapshot(studioAssets, {
                mood_key: moodKey ?? null,
                music_track_id: studioMusicTrackId ?? null,
                featured_product_index: 0,
              });
              await supabase
                .from('ad_creatives')
                .update({ asset_snapshot: snapshot })
                .eq('id', creativeId);
            } catch (snapErr: any) {
              console.warn('[generate-video:veo][studio] asset_snapshot failed:', snapErr?.message);
            }
          }
        }

        return c.json({
          success: true,
          prediction_id: operationName,
          status: 'listo',
          engine: 'veo',
          asset_url: assetUrl,
          duration_seconds: DEFAULT_DURATION_SEC,
          generation_attempts: attempts,
          studio_mode: studioMode || undefined,
          music_track_id: studioMusicTrackId || undefined,
        });
      } catch (pollErr: any) {
        console.warn(`[generate-video] poll error attempt ${attempts}:`, pollErr?.message);
      }
    }

    // Timed out — return operation name so the client polls /api/generate-video-status.
    // Credits stay deducted because the video IS being generated — if it never
    // lands, the client polling endpoint will refund via refundVideoCreditsOnce.
    console.warn(`[generate-video] inline polling timed out after ${attempts} tries; returning operation ${operationName}`);
    return c.json({
      success: true,
      prediction_id: operationName,
      status: 'generando',
      engine: 'veo',
      message: 'El video se sigue generando. Reintenta en 1-2 min.',
      studio_mode: studioMode || undefined,
      music_track_id: studioMusicTrackId || undefined,
    });

  } catch (err: any) {
    console.error('[generate-video]', err);
    return c.json({ error: 'Error interno del servidor', details: err?.message }, 500);
  }
}

// GET /api/generate-video-status?op=<operationName>&clientId=<id>&creativeId=<id>
// Called by the frontend after an inline timeout. If Veo finished, we download
// the MP4, upload to Supabase Storage, and return the asset_url. If still
// running, we return `status: 'generando'` and the client polls again.
// Idempotent: calling twice after completion reuses the same asset_url (upload
// only happens once per operationName because storagePath is deterministic).
export async function generateVideoStatus(c: Context) {
  try {
    const operationName = c.req.query('op');
    const clientId = c.req.query('clientId');
    const creativeId = c.req.query('creativeId');
    if (!operationName) return c.json({ error: 'op is required' }, 400);
    if (!clientId) return c.json({ error: 'clientId is required' }, 400);

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return c.json({ error: 'GEMINI_API_KEY not configured' }, 500);

    const supabase = getSupabaseAdmin();

    const pollRes = await fetch(`${VEO_POLL_BASE}${operationName}`, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
      signal: AbortSignal.timeout(15_000),
    });
    if (!pollRes.ok) {
      return c.json({ status: 'generando', message: `Veo poll returned ${pollRes.status}` });
    }
    const op: any = await pollRes.json();
    if (!op.done) return c.json({ status: 'generando', prediction_id: operationName });

    if (op.error) {
      await refundVideoCreditsOnce(supabase, clientId, operationName, 'Veo failed (status endpoint)');
      return c.json({ status: 'error', error: op.error?.message || 'Veo failed' }, 502);
    }

    const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
    const videoUri: string | undefined = sample?.video?.uri;
    if (!videoUri) {
      await refundVideoCreditsOnce(supabase, clientId, operationName, 'no video uri (status endpoint)');
      return c.json({ status: 'error', error: 'No video URI in completed operation' }, 502);
    }

    // Check if we already uploaded for this operation (idempotency safety net).
    // If the `ad_creatives` row already has asset_url, reuse it.
    if (creativeId) {
      const { data: existing } = await supabase
        .from('ad_creatives')
        .select('asset_url')
        .eq('id', creativeId)
        .maybeSingle();
      if (existing?.asset_url && existing.asset_url.includes('client-assets')) {
        return c.json({ status: 'listo', asset_url: existing.asset_url, prediction_id: operationName });
      }
    }

    // Download + upload + write creative row.
    const dl = await fetch(videoUri, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
      signal: AbortSignal.timeout(60_000),
    });
    if (!dl.ok) {
      await refundVideoCreditsOnce(supabase, clientId, operationName, `mp4 download ${dl.status} (status endpoint)`);
      return c.json({ status: 'error', error: `MP4 download failed ${dl.status}` }, 502);
    }
    const mp4Bytes = Buffer.from(await dl.arrayBuffer());
    // Deterministic path based on operation name — upload once per op.
    const opSlug = operationName.split('/').pop() || String(Date.now());
    const storagePath = `${clientId}/ads/veo_${opSlug}.mp4`;
    const { error: uploadErr } = await supabase
      .storage
      .from('client-assets')
      .upload(storagePath, mp4Bytes, { contentType: 'video/mp4', upsert: true });
    if (uploadErr) {
      await refundVideoCreditsOnce(supabase, clientId, operationName, `storage (status endpoint): ${uploadErr.message}`);
      return c.json({ status: 'error', error: 'Upload failed' }, 502);
    }
    const { data: pub } = supabase.storage.from('client-assets').getPublicUrl(storagePath);
    const assetUrl = pub.publicUrl;

    if (creativeId) {
      await supabase.from('ad_creatives').update({
        asset_url: assetUrl,
        estado: 'listo',
        formato: 'video',
      }).eq('id', creativeId);
    }
    return c.json({ status: 'listo', asset_url: assetUrl, prediction_id: operationName });
  } catch (err: any) {
    console.error('[generate-video-status]', err);
    return c.json({ status: 'error', error: err?.message }, 500);
  }
}

// Runway Gen-4 Turbo via Replicate — premium alternative to Veo. Runs synchronously
// via Replicate's "Prefer: wait" header which blocks up to 60s; if the model takes
// longer we fall back to polling. Replicate returns an MP4 URL which we persist to
// Supabase Storage (same pattern as Veo) so the frontend doesn't hit Replicate CDN
// directly (would 404 after 24h). Uses the first reference image as image input —
// Runway Gen-4 Turbo accepts a single image for image-to-video.
async function runGenerateRunway(
  c: Context,
  supabase: SupabaseClient,
  args: {
    clientId: string;
    creativeId?: string;
    promptGeneracion: string;
    referenceUrls: string[];
    finalAspect: AspectRatio;
    angulo?: string;
    studioMode?: boolean;
    studioAssets?: StudioAssets | null;
    studioMusicTrackId?: string | null;
    moodKey?: string | null;
  },
) {
  const {
    clientId,
    creativeId,
    promptGeneracion,
    referenceUrls,
    finalAspect,
    angulo,
    studioMode,
    studioAssets,
    studioMusicTrackId,
    moodKey,
  } = args;

  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  if (!REPLICATE_API_KEY) {
    console.error('[generate-video:runway] REPLICATE_API_KEY not configured');
    return c.json({ error: 'REPLICATE_API_KEY no configurado en el servidor' }, 500);
  }

  // Map Veo aspect ratios to Runway ratios. Gen-4 Turbo supports 16:9, 9:16, 1:1,
  // 4:3, 3:4, 21:9. We feed the input ratio string matching the supported set.
  const runwayRatio = finalAspect === '16:9' ? '16:9' : '9:16';

  // Runway Gen-4 Turbo schema (Replicate):
  //   prompt: string (required for text-to-video, optional with image)
  //   image: url (string) — single reference image
  //   duration: 5 | 10 (seconds)
  //   aspect_ratio: string
  // We use duration=10 for premium feel and image (first ref) when available.
  const input: Record<string, any> = {
    prompt: promptGeneracion,
    duration: RUNWAY_DURATION_SEC,
    aspect_ratio: runwayRatio,
  };
  if (referenceUrls.length > 0) {
    input.image = referenceUrls[0];
  }

  const pseudoOpId = `runway-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Use Replicate's model-endpoint form so we don't need to hardcode a version hash.
  // This endpoint resolves the latest version of the model automatically.
  let launchRes: Response;
  try {
    launchRes = await fetch(
      `https://api.replicate.com/v1/models/${RUNWAY_REPLICATE_MODEL}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=55',
        },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(70_000),
      },
    );
  } catch (err: any) {
    console.error('[generate-video:runway] launch fetch failed:', err?.message);
    return c.json({ error: 'No se pudo contactar a Replicate', details: err?.message }, 502);
  }

  if (!launchRes.ok) {
    const errText = await launchRes.text();
    console.error('[generate-video:runway] launch error:', launchRes.status, errText);
    return c.json({ error: 'Error iniciando Runway Gen-4', details: errText.slice(0, 300) }, 502);
  }

  let prediction: any = await launchRes.json();
  const predictionId: string = prediction?.id || pseudoOpId;

  if (creativeId) {
    await persistEngineToCreative(
      supabase,
      creativeId,
      { prediction_id: predictionId, estado: 'generando' },
      { engine: 'runway', template: deriveTemplate(angulo), angulo: angulo || null },
    );
  }

  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Generar video Runway Gen-4 Turbo (${RUNWAY_DURATION_SEC}s, ${runwayRatio}) — op=${predictionId}`,
    creditos_usados: RUNWAY_CREDIT_COST,
    costo_real_usd: RUNWAY_USD_COST,
  });

  // If "Prefer: wait" gave us the final output, use it. Otherwise poll up to 4 min.
  const deadline = Date.now() + 4 * 60_000;
  let attempts = 0;
  while (prediction?.status !== 'succeeded' && prediction?.status !== 'failed' && prediction?.status !== 'canceled') {
    if (Date.now() > deadline) break;
    attempts++;
    await new Promise(r => setTimeout(r, attempts <= 2 ? 6_000 : 12_000));
    try {
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        { headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` }, signal: AbortSignal.timeout(15_000) },
      );
      if (!pollRes.ok) {
        console.warn(`[generate-video:runway] poll ${attempts} HTTP ${pollRes.status}`);
        continue;
      }
      prediction = await pollRes.json();
    } catch (err: any) {
      console.warn(`[generate-video:runway] poll error ${attempts}:`, err?.message);
    }
  }

  if (prediction?.status === 'failed' || prediction?.status === 'canceled') {
    await refundVideoCreditsOnce(supabase, clientId, predictionId, `runway ${prediction?.status}: ${prediction?.error || 'unknown'}`, 'runway');
    return c.json({ error: 'Runway falló al generar el video', details: prediction?.error }, 502);
  }

  if (prediction?.status !== 'succeeded') {
    // Still processing — return the prediction id; frontend can poll /api/generate-video-status
    // NOTE: status endpoint currently only handles Veo. Runway polling from the
    // client is done directly for now (see wizard). This branch only happens on
    // slow inference — typical Gen-4 Turbo finishes in ~30-60s.
    console.warn(`[generate-video:runway] inline poll timed out after ${attempts} tries`);
    return c.json({
      success: true,
      prediction_id: predictionId,
      status: 'generando',
      engine: 'runway',
      message: 'Runway aún procesando. Reintenta en 1-2 min.',
    });
  }

  // Extract MP4 URL. Runway Gen-4 Turbo returns a single string URL (video/mp4).
  const videoUri: string | undefined = Array.isArray(prediction.output)
    ? prediction.output[0]
    : typeof prediction.output === 'string'
      ? prediction.output
      : undefined;
  if (!videoUri) {
    await refundVideoCreditsOnce(supabase, clientId, predictionId, 'no video uri from runway', 'runway');
    return c.json({ error: 'Runway completó pero no devolvió URI' }, 502);
  }

  // Download MP4 and persist to Supabase Storage (Replicate CDN expires after 24h).
  const dl = await fetch(videoUri, { signal: AbortSignal.timeout(60_000) });
  if (!dl.ok) {
    await refundVideoCreditsOnce(supabase, clientId, predictionId, `mp4 download ${dl.status}`, 'runway');
    return c.json({ error: 'Video generado pero no se pudo descargar' }, 502);
  }
  const mp4Bytes = Buffer.from(await dl.arrayBuffer());
  const storagePath = `${clientId}/ads/runway_${predictionId}.mp4`;
  const { error: uploadErr } = await supabase
    .storage
    .from('client-assets')
    .upload(storagePath, mp4Bytes, { contentType: 'video/mp4', upsert: true });
  if (uploadErr) {
    await refundVideoCreditsOnce(supabase, clientId, predictionId, `storage: ${uploadErr.message}`, 'runway');
    return c.json({ error: 'No se pudo guardar el video de Runway' }, 502);
  }
  const { data: pub } = supabase.storage.from('client-assets').getPublicUrl(storagePath);
  const assetUrl = pub.publicUrl;

  if (creativeId) {
    await persistEngineToCreative(
      supabase,
      creativeId,
      { asset_url: assetUrl, estado: 'listo', formato: 'video' },
      { engine: 'runway', template: deriveTemplate(angulo), angulo: angulo || null },
    );
    // Brief Estudio — Etapa 5: snapshot inmutable de los assets usados.
    if (studioMode && studioAssets) {
      try {
        const snapshot = buildAssetSnapshot(studioAssets, {
          mood_key: moodKey ?? null,
          music_track_id: studioMusicTrackId ?? null,
          featured_product_index: 0,
        });
        await supabase
          .from('ad_creatives')
          .update({ asset_snapshot: snapshot })
          .eq('id', creativeId);
      } catch (snapErr: any) {
        console.warn('[generate-video:runway][studio] asset_snapshot failed:', snapErr?.message);
      }
    }
  }

  return c.json({
    success: true,
    prediction_id: predictionId,
    status: 'listo',
    engine: 'runway',
    asset_url: assetUrl,
    duration_seconds: RUNWAY_DURATION_SEC,
    generation_attempts: attempts,
    studio_mode: studioMode || undefined,
    music_track_id: studioMusicTrackId || undefined,
  });
}

// Seedance 1 Pro via Replicate — default engine for silent templates (hero shot,
// product reveal, unboxing, before/after, macro detail). Replaces Runway Gen-4
// Turbo to fix the "producto falso" bug: Runway only accepts 1 image ref, and
// when studio_mode sent actor + product, the first-listed (actor) was kept and
// the product got hallucinated. Seedance also accepts only 1 ref — but we now
// EXPLICITLY prioritize the product image so Seedance anchors the output on the
// real SKU. The actor is described via the prompt text (Claude already enriches
// promptGeneracion with actor traits when studio_mode is on).
//
// Uses the shared `runReplicatePrediction` helper (handles Prefer: wait +
// polling + structured errors). Same MP4-to-Storage persistence pattern as
// runGenerateRunway so frontend URLs don't expire after 24h.
async function runGenerateSeedance(
  c: Context,
  supabase: SupabaseClient,
  args: {
    clientId: string;
    creativeId?: string;
    promptGeneracion: string;
    referenceUrls: string[];
    finalAspect: AspectRatio;
    angulo?: string;
    studioMode?: boolean;
    studioAssets?: StudioAssets | null;
    studioMusicTrackId?: string | null;
    moodKey?: string | null;
  },
) {
  const {
    clientId,
    creativeId,
    promptGeneracion,
    referenceUrls,
    finalAspect,
    angulo,
    studioMode,
    studioAssets,
    studioMusicTrackId,
    moodKey,
  } = args;

  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  if (!REPLICATE_API_KEY) {
    console.error('[generate-video:seedance] REPLICATE_API_KEY not configured');
    return c.json({ error: 'REPLICATE_API_KEY no configurado en el servidor' }, 500);
  }

  // Seedance supports 9:16, 16:9, 1:1, 3:4, 4:3, 21:9, 9:21. The site-wide
  // validated aspect is already 9:16 or 16:9 (see generateVideo). Note that
  // Seedance IGNORES aspect_ratio when an image is provided (infers from image).
  const seedanceRatio: string = finalAspect === '16:9' ? '16:9' : '9:16';

  // Anchor-image selection — THE CRITICAL FIX for producto-falso.
  //
  // Previous Runway behavior (buggy): studio_mode passed [product, actor] via
  // mergedFotoBaseUrls. referenceUrls[0] was the product, which Runway used as
  // image input. Except the prompt often described an actor holding the product,
  // so Runway tried to synthesize the actor AND the product and produced a fake
  // version of both. When the actor was first (older code path) the product
  // would just get replaced with a hallucinated similar-looking SKU.
  //
  // Seedance fix: we have the same 1-ref limit, but we're EXPLICIT: if a real
  // product image is available (studio assets or first referenceUrl), use it.
  // The actor is now text-described via the prompt enrichment done upstream
  // (generate-brief-visual already bakes actor traits into promptGeneracion
  // when studio_mode is on). This eliminates the "second subject from a photo"
  // mismatch that Runway couldn't resolve.
  let anchorImage: string | undefined;
  const studioProductImage = studioAssets?.featured_products?.[0]?.image_url || null;
  const studioActorImage = studioAssets?.primary_actor?.reference_images?.[0] || null;
  if (studioMode && studioProductImage) {
    anchorImage = studioProductImage;
    console.log('[generate-video:seedance] anchor=producto (studio_mode)');
  } else if (studioMode && studioActorImage) {
    // Fallback: no product but we have actor — better than text-to-video.
    anchorImage = studioActorImage;
    console.log('[generate-video:seedance] anchor=actor (studio_mode, no producto)');
  } else if (referenceUrls.length > 0) {
    // Non-studio path: first ref wins (preserves legacy Runway behavior).
    anchorImage = referenceUrls[0];
    console.log('[generate-video:seedance] anchor=referenceUrls[0]');
  }

  const input: Record<string, any> = {
    prompt: promptGeneracion,
    duration: SEEDANCE_DURATION_SEC,
    resolution: '1080p',
    aspect_ratio: seedanceRatio, // Ignored by Seedance when image is set; harmless to send.
    camera_fixed: false,
  };
  if (anchorImage) {
    input.image = anchorImage;
  }

  const pseudoOpId = `seedance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Persist generating state + log the transaction BEFORE the prediction runs,
  // so a crash mid-call still leaves a traceable credit_transactions row + a
  // creative in 'generando' state that the client can recover.
  if (creativeId) {
    await persistEngineToCreative(
      supabase,
      creativeId,
      { prediction_id: pseudoOpId, estado: 'generando' },
      { engine: 'seedance', template: deriveTemplate(angulo), angulo: angulo || null },
    );
  }
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Generar video Seedance 1 Pro (${SEEDANCE_DURATION_SEC}s, ${seedanceRatio}, 1080p) — op=${pseudoOpId}`,
    creditos_usados: SEEDANCE_CREDIT_COST,
    costo_real_usd: SEEDANCE_USD_COST,
  });

  let output: string | string[];
  try {
    output = await runReplicatePrediction<Record<string, any>, string | string[]>({
      model: SEEDANCE_REPLICATE_MODEL,
      input,
      timeoutMs: 4 * 60_000, // 4 min wall clock — well under Cloud Run 5 min limit
      preferWaitSeconds: 55,
      pollIntervalMs: 6_000,
    });
  } catch (err) {
    const msg = err instanceof ReplicateError ? err.message : (err as any)?.message || 'unknown';
    console.error('[generate-video:seedance] prediction failed:', msg);
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, `seedance failed: ${msg.slice(0, 80)}`, 'seedance');
    return c.json({ error: 'Seedance falló al generar el video', details: msg.slice(0, 300) }, 502);
  }

  // Replicate returns a URL string (or [string] depending on the model).
  const videoUri: string | undefined = Array.isArray(output)
    ? output[0]
    : typeof output === 'string'
      ? output
      : undefined;
  if (!videoUri) {
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, 'no video uri from seedance', 'seedance');
    return c.json({ error: 'Seedance completó pero no devolvió URI' }, 502);
  }

  // Persist MP4 to Supabase Storage (Replicate CDN expires after 24h).
  const dl = await fetch(videoUri, { signal: AbortSignal.timeout(60_000) });
  if (!dl.ok) {
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, `mp4 download ${dl.status}`, 'seedance');
    return c.json({ error: 'Video generado pero no se pudo descargar' }, 502);
  }
  const mp4Bytes = Buffer.from(await dl.arrayBuffer());
  const storagePath = `${clientId}/ads/seedance_${pseudoOpId}.mp4`;
  const { error: uploadErr } = await supabase
    .storage
    .from('client-assets')
    .upload(storagePath, mp4Bytes, { contentType: 'video/mp4', upsert: true });
  if (uploadErr) {
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, `storage: ${uploadErr.message}`, 'seedance');
    return c.json({ error: 'No se pudo guardar el video de Seedance' }, 502);
  }
  const { data: pub } = supabase.storage.from('client-assets').getPublicUrl(storagePath);
  const assetUrl = pub.publicUrl;

  if (creativeId) {
    await persistEngineToCreative(
      supabase,
      creativeId,
      { asset_url: assetUrl, estado: 'listo', formato: 'video' },
      { engine: 'seedance', template: deriveTemplate(angulo), angulo: angulo || null },
    );
    if (studioMode && studioAssets) {
      try {
        const snapshot = buildAssetSnapshot(studioAssets, {
          mood_key: moodKey ?? null,
          music_track_id: studioMusicTrackId ?? null,
          featured_product_index: 0,
        });
        await supabase
          .from('ad_creatives')
          .update({ asset_snapshot: snapshot })
          .eq('id', creativeId);
      } catch (snapErr: any) {
        console.warn('[generate-video:seedance][studio] asset_snapshot failed:', snapErr?.message);
      }
    }
  }

  return c.json({
    success: true,
    prediction_id: pseudoOpId,
    status: 'listo',
    engine: 'seedance',
    asset_url: assetUrl,
    duration_seconds: SEEDANCE_DURATION_SEC,
    studio_mode: studioMode || undefined,
    music_track_id: studioMusicTrackId || undefined,
  });
}

// Kling Video 3.0 Omni via Replicate — DEFAULT engine for silent templates
// (replaces Seedance 1 Pro). The DEFINITIVE fix for the "producto falso" bug:
// Kling v3 Omni is the only Replicate Kling that accepts an array of reference
// images (`reference_images`, max 7 without a video reference), so we pass
// BOTH the producto and the actor at the same time. The prompt uses Kling's
// native <<<image_N>>> template syntax to disambiguate which subject is which
// (image_1 = producto, image_2 = actor) — that token is documented in the
// model's input schema (see Kling 3.0 Omni description in this file).
//
// Same MP4-to-Storage persistence pattern as runGenerateSeedance so frontend
// URLs don't expire after 24h on Replicate's CDN.
async function runGenerateKling(
  c: Context,
  supabase: SupabaseClient,
  args: {
    clientId: string;
    creativeId?: string;
    promptGeneracion: string;
    referenceUrls: string[];
    finalAspect: AspectRatio;
    angulo?: string;
    studioMode?: boolean;
    studioAssets?: StudioAssets | null;
    studioMusicTrackId?: string | null;
    moodKey?: string | null;
  },
) {
  const {
    clientId,
    creativeId,
    promptGeneracion,
    referenceUrls,
    finalAspect,
    angulo,
    studioMode,
    studioAssets,
    studioMusicTrackId,
    moodKey,
  } = args;

  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  if (!REPLICATE_API_KEY) {
    console.error('[generate-video:kling] REPLICATE_API_KEY not configured');
    return c.json({ error: 'REPLICATE_API_KEY no configurado en el servidor' }, 500);
  }

  // Kling v3 Omni aspect_ratio enum: '16:9' | '9:16' | '1:1'.
  // The site-wide validated aspect is 9:16 or 16:9 (see generateVideo).
  // Note: aspect_ratio is REQUIRED when not using start_image — and we pass
  // multi-ref via `reference_images`, NOT via start_image, so aspect_ratio
  // is always honored here (different from Seedance which ignores it on image input).
  const klingRatio: string = finalAspect === '16:9' ? '16:9' : '9:16';

  // Multi-ref selection — THE FIX for producto-falso.
  //
  // Studio mode: collect [producto, actor] in that order. Producto goes first
  // so the prompt's <<<image_1>>> is the SKU (not a face). Actor is image_2.
  // Non-studio fallback: use up to 4 from referenceUrls (catalog or explicit).
  // Kling v3 Omni accepts up to 7 reference_images without a reference_video,
  // we cap at 4 to keep the prompt focused (more refs = more confusion).
  const studioProductImage = studioAssets?.featured_products?.[0]?.image_url || null;
  const studioActorImage = studioAssets?.primary_actor?.reference_images?.[0] || null;
  const refsToUse: string[] = [];
  if (studioMode && (studioProductImage || studioActorImage)) {
    if (studioProductImage) refsToUse.push(studioProductImage);
    if (studioActorImage) refsToUse.push(studioActorImage);
    console.log(
      `[generate-video:kling] studio refs (${refsToUse.length}): ${studioProductImage ? 'producto' : ''}${studioProductImage && studioActorImage ? '+actor' : studioActorImage ? 'actor' : ''}`,
    );
  } else if (referenceUrls.length > 0) {
    for (const u of referenceUrls.slice(0, 4)) refsToUse.push(u);
    console.log(`[generate-video:kling] non-studio refs (${refsToUse.length}) from referenceUrls`);
  } else {
    console.log('[generate-video:kling] no refs available — pure text-to-video (worse results expected)');
  }

  // Build the final prompt. When studio_mode + multi-ref, prepend Kling's
  // native template tokens so the model knows image_1 is the producto and
  // image_2 is the actor. Without these tokens, Kling treats reference_images
  // as a soup — exactly the bug we're fixing.
  let finalPrompt = promptGeneracion;
  if (studioMode && refsToUse.length >= 2 && studioProductImage && studioActorImage) {
    finalPrompt = `<<<image_1>>> is the real product (preserve its exact shape, colors, and packaging). <<<image_2>>> is the human actor (preserve their face and body). ${promptGeneracion}`;
  } else if (refsToUse.length >= 1) {
    finalPrompt = `<<<image_1>>> is the primary reference (preserve its exact appearance). ${promptGeneracion}`;
  }
  // Kling v3 Omni prompt cap is 2500 chars — truncate just in case.
  if (finalPrompt.length > 2500) {
    finalPrompt = finalPrompt.slice(0, 2497) + '...';
  }

  const input: Record<string, any> = {
    prompt: finalPrompt,
    duration: KLING_DURATION_SEC,
    mode: 'pro',                   // 1080p
    aspect_ratio: klingRatio,
    generate_audio: false,         // silent templates — music is added in post
  };
  if (refsToUse.length > 0) {
    input.reference_images = refsToUse;
  }

  const pseudoOpId = `kling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Persist generating state + log the transaction BEFORE the prediction runs
  // (same pattern as runGenerateSeedance — survives mid-call crashes).
  if (creativeId) {
    await persistEngineToCreative(
      supabase,
      creativeId,
      { prediction_id: pseudoOpId, estado: 'generando' },
      { engine: 'kling', template: deriveTemplate(angulo), angulo: angulo || null },
    );
  }
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Generar video Kling 3.0 Omni (${KLING_DURATION_SEC}s, ${klingRatio}, 1080p, refs=${refsToUse.length}) — op=${pseudoOpId}`,
    creditos_usados: KLING_CREDIT_COST,
    costo_real_usd: KLING_USD_COST,
  });

  let output: string | string[];
  try {
    output = await runReplicatePrediction<Record<string, any>, string | string[]>({
      model: KLING_REPLICATE_MODEL,
      input,
      timeoutMs: 4 * 60_000, // 4 min wall clock — under Cloud Run 5 min limit
      preferWaitSeconds: 55,
      pollIntervalMs: 6_000,
    });
  } catch (err) {
    const msg = err instanceof ReplicateError ? err.message : (err as any)?.message || 'unknown';
    console.error('[generate-video:kling] prediction failed:', msg);
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, `kling failed: ${msg.slice(0, 80)}`, 'kling');
    return c.json({ error: 'Kling falló al generar el video', details: msg.slice(0, 300) }, 502);
  }

  const videoUri: string | undefined = Array.isArray(output)
    ? output[0]
    : typeof output === 'string'
      ? output
      : undefined;
  if (!videoUri) {
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, 'no video uri from kling', 'kling');
    return c.json({ error: 'Kling completó pero no devolvió URI' }, 502);
  }

  // Persist MP4 to Supabase Storage (Replicate CDN expires after 24h).
  const dl = await fetch(videoUri, { signal: AbortSignal.timeout(60_000) });
  if (!dl.ok) {
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, `mp4 download ${dl.status}`, 'kling');
    return c.json({ error: 'Video generado pero no se pudo descargar' }, 502);
  }
  const mp4Bytes = Buffer.from(await dl.arrayBuffer());
  const storagePath = `${clientId}/ads/kling_${pseudoOpId}.mp4`;
  const { error: uploadErr } = await supabase
    .storage
    .from('client-assets')
    .upload(storagePath, mp4Bytes, { contentType: 'video/mp4', upsert: true });
  if (uploadErr) {
    await refundVideoCreditsOnce(supabase, clientId, pseudoOpId, `storage: ${uploadErr.message}`, 'kling');
    return c.json({ error: 'No se pudo guardar el video de Kling' }, 502);
  }
  const { data: pub } = supabase.storage.from('client-assets').getPublicUrl(storagePath);
  const assetUrl = pub.publicUrl;

  if (creativeId) {
    await persistEngineToCreative(
      supabase,
      creativeId,
      { asset_url: assetUrl, estado: 'listo', formato: 'video' },
      { engine: 'kling', template: deriveTemplate(angulo), angulo: angulo || null },
    );
    if (studioMode && studioAssets) {
      try {
        const snapshot = buildAssetSnapshot(studioAssets, {
          mood_key: moodKey ?? null,
          music_track_id: studioMusicTrackId ?? null,
          featured_product_index: 0,
        });
        await supabase
          .from('ad_creatives')
          .update({ asset_snapshot: snapshot })
          .eq('id', creativeId);
      } catch (snapErr: any) {
        console.warn('[generate-video:kling][studio] asset_snapshot failed:', snapErr?.message);
      }
    }
  }

  return c.json({
    success: true,
    prediction_id: pseudoOpId,
    status: 'listo',
    engine: 'kling',
    asset_url: assetUrl,
    duration_seconds: KLING_DURATION_SEC,
    reference_count: refsToUse.length,
    studio_mode: studioMode || undefined,
    music_track_id: studioMusicTrackId || undefined,
  });
}
