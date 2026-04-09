import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const VIDEO_CREDIT_COST = 10;
const VIDEO_USD_COST = 0.50;

export async function generateVideo(c: Context) {
  try {
    const { clientId, creativeId, promptGeneracion, fotoBaseUrl } = await c.req.json();

    const supabase = getSupabaseAdmin();

    const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
    if (!REPLICATE_API_KEY) {
      console.error('[generate-video] REPLICATE_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Atomically deduct credits BEFORE generating (prevents race condition)
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', { p_client_id: clientId, p_amount: VIDEO_CREDIT_COST });

    if (deductError) {
      return c.json(
        { error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos para este cliente. Contacta al administrador.' },
        402
      );
    }
    if (!deductResult?.[0]?.success) {
      return c.json(
        { error: 'NO_CREDITS', message: `Se necesitan ${VIDEO_CREDIT_COST} créditos para generar un video` },
        402
      );
    }

    // Call Replicate Kling
    const replicateBody: Record<string, unknown> = {
      version: "kling-v1.5",
      input: {
        prompt: promptGeneracion,
        duration: 5,
        aspect_ratio: "9:16",
        cfg_scale: 0.5,
      },
    };

    if (fotoBaseUrl) {
      (replicateBody.input as Record<string, unknown>).image = fotoBaseUrl;
    }

    const replicateResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(replicateBody),
    });

    if (!replicateResp.ok) {
      const errText = await replicateResp.text();
      console.error('[generate-video] Replicate API error:', replicateResp.status, errText);
      // Refund credits — Replicate failed
      await supabase.rpc('deduct_credits', { p_client_id: clientId, p_amount: -VIDEO_CREDIT_COST });
      return c.json({ error: 'Error generando el video. Intenta de nuevo.' }, 500);
    }

    const prediction: any = await replicateResp.json();

    if (!prediction.id) {
      console.error('[generate-video] No prediction ID returned from Replicate');
      // Refund credits — no prediction ID
      await supabase.rpc('deduct_credits', { p_client_id: clientId, p_amount: -VIDEO_CREDIT_COST });
      return c.json({ error: 'Error generando el video. Intenta de nuevo.' }, 500);
    }

    // Update creative with prediction ID and estado = generando
    if (creativeId) {
      await supabase.from('ad_creatives').update({
        prediction_id: prediction.id,
        estado: 'generando',
      }).eq('id', creativeId);
    }

    // Log credit transaction (credits already deducted above)
    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: 'Generar video — Replicate Kling AI',
      creditos_usados: VIDEO_CREDIT_COST,
      costo_real_usd: VIDEO_USD_COST,
    });

    return c.json({ prediction_id: prediction.id, status: 'generando' });

  } catch (err: any) {
    console.error('[generate-video]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
