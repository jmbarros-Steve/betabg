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

type AspectRatio = '9:16' | '16:9' | '1:1';

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
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Refund video Veo 3.1 (${reason}) — ${refundMarker}`,
    creditos_usados: -VIDEO_CREDIT_COST,
    costo_real_usd: -VIDEO_USD_COST,
  });
}

export async function generateVideo(c: Context) {
  try {
    const { clientId, creativeId, promptGeneracion, fotoBaseUrl, aspectRatio } = await c.req.json();

    const supabase = getSupabaseAdmin();

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-video] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    if (!promptGeneracion || typeof promptGeneracion !== 'string') {
      return c.json({ error: 'promptGeneracion es obligatorio' }, 400);
    }

    // Validate aspect ratio (Veo 3.1 supports 16:9 and 9:16 — 1:1 is NOT
    // supported as of April 2026, falls back to 9:16 with a warning).
    const validRatios: AspectRatio[] = ['9:16', '16:9'];
    const finalAspect: AspectRatio = validRatios.includes(aspectRatio as AspectRatio)
      ? (aspectRatio as AspectRatio)
      : '9:16';
    if (aspectRatio && aspectRatio !== finalAspect) {
      console.warn(`[generate-video] aspect ratio ${aspectRatio} not supported by Veo 3.1, falling back to ${finalAspect}`);
    }

    // TODO: Re-enable credit enforcement when billing system is ready. For
    // now we log the transaction at the end (same pattern as generate-image).
    // The deduct_credits RPC doesn't exist yet — calling it returned
    // NO_CREDIT_RECORD for every client, blocking all video generation.

    // Enrich prompt with learned visual style rules + explicit audio cue for Veo.
    // loadKnowledge is wrapped so a DB hiccup here doesn't strand the credits.
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

    // Optional image-to-video: download fotoBaseUrl and inline as base64 (Veo API
    // doesn't accept public URLs — only bytesBase64Encoded / inlineData).
    let imagePart: { inlineData: { mimeType: string; data: string } } | undefined;
    if (fotoBaseUrl) {
      try {
        const imgResp = await fetch(fotoBaseUrl, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          const mime = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
          imagePart = { inlineData: { mimeType: mime, data: buf.toString('base64') } };
        } else {
          console.warn(`[generate-video] fotoBase download failed ${imgResp.status}, continuing without image`);
        }
      } catch (err: any) {
        console.warn('[generate-video] fotoBase download error — continuing text-to-video:', err?.message);
      }
    }

    // 1) Launch long-running generation
    const instance: Record<string, any> = { prompt: enrichedPrompt };
    if (imagePart) instance.image = imagePart;

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
