import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';
import type { SupabaseClient } from '@supabase/supabase-js';

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
const RUNWAY_REPLICATE_MODEL = 'runwayml/gen4-turbo';
const RUNWAY_USD_COST = 0.50; // 10s at $0.05/s
const RUNWAY_CREDIT_COST = 50;
const RUNWAY_DURATION_SEC = 10;

type AspectRatio = '9:16' | '16:9' | '1:1';
type VideoEngine = 'veo' | 'runway';

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
  const credits = engine === 'runway' ? RUNWAY_CREDIT_COST : VIDEO_CREDIT_COST;
  const usd = engine === 'runway' ? RUNWAY_USD_COST : VIDEO_USD_COST;
  const engineLabel = engine === 'runway' ? 'Runway Gen-4 Turbo' : 'Veo 3.1';
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
    } = await c.req.json();

    const supabase = getSupabaseAdmin();

    // Resolve engine. Default = veo. Runway = Replicate gen4-turbo.
    const engineChoice: VideoEngine = engine === 'runway' ? 'runway' : 'veo';

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
    const referenceUrls = await resolveReferenceImageUrls(supabase, clientId, fotoBaseUrls, fotoBaseUrl);

    // Branch on engine. Runway uses Replicate, Veo uses Gemini Developer API.
    if (engineChoice === 'runway') {
      return runGenerateRunway(c, supabase, {
        clientId,
        creativeId,
        promptGeneracion,
        referenceUrls,
        finalAspect,
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
    if (creativeId) {
      await supabase.from('ad_creatives').update({
        prediction_id: operationName,
        estado: 'generando',
      }).eq('id', creativeId);
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
          await supabase.from('ad_creatives').update({
            asset_url: assetUrl,
            estado: 'listo',
            formato: 'video',
          }).eq('id', creativeId);
        }

        return c.json({
          success: true,
          prediction_id: operationName,
          status: 'listo',
          asset_url: assetUrl,
          duration_seconds: DEFAULT_DURATION_SEC,
          generation_attempts: attempts,
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
      message: 'El video se sigue generando. Reintenta en 1-2 min.',
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
  },
) {
  const { clientId, creativeId, promptGeneracion, referenceUrls, finalAspect } = args;

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
    await supabase.from('ad_creatives').update({
      prediction_id: predictionId,
      estado: 'generando',
    }).eq('id', creativeId);
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
    await supabase.from('ad_creatives').update({
      asset_url: assetUrl,
      estado: 'listo',
      formato: 'video',
    }).eq('id', creativeId);
  }

  return c.json({
    success: true,
    prediction_id: predictionId,
    status: 'listo',
    engine: 'runway',
    asset_url: assetUrl,
    duration_seconds: RUNWAY_DURATION_SEC,
    generation_attempts: attempts,
  });
}
