import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function generateVideo(c: Context) {
  try {
    const { clientId, creativeId, promptGeneracion, fotoBaseUrl } = await c.req.json();

    const supabase = getSupabaseAdmin();

    const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
    if (!REPLICATE_API_KEY) {
      console.error('[generate-video] REPLICATE_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Check & deduct 10 credits
    const { data: credits } = await supabase
      .from('client_credits')
      .select('id, creditos_disponibles, creditos_usados')
      .eq('client_id', clientId)
      .maybeSingle();

    if (!credits) {
      return c.json(
        { error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos para este cliente. Contacta al administrador.' },
        402
      );
    }

    const available = credits.creditos_disponibles ?? 0;
    if (available < 10) {
      return c.json(
        { error: 'NO_CREDITS', message: 'Se necesitan 10 créditos para generar un video' },
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
      return c.json({ error: 'Error generando el video. Intenta de nuevo.' }, 500);
    }

    const prediction: any = await replicateResp.json();

    if (!prediction.id) {
      console.error('[generate-video] No prediction ID returned from Replicate');
      return c.json({ error: 'Error generando el video. Intenta de nuevo.' }, 500);
    }

    // Update creative with prediction ID and estado = generando
    if (creativeId) {
      await supabase.from('ad_creatives').update({
        prediction_id: prediction.id,
        estado: 'generando',
      }).eq('id', creativeId);
    }

    // Deduct credits atomically
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', { p_client_id: clientId, p_amount: 10 });

    if (deductError || !deductResult?.[0]?.success) {
      console.error('[generate-video] Atomic credit deduction failed:', deductError || deductResult);
    }

    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: 'Generar video — Replicate Kling AI',
      creditos_usados: 10,
      costo_real_usd: 0.50,
    });

    return c.json({ prediction_id: prediction.id, status: 'generando' });

  } catch (err: any) {
    console.error('[generate-video]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
