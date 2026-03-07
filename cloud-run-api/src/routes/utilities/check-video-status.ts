import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function checkVideoStatus(c: Context) {
  try {
  const { predictionId, creativeId, clientId } = await c.req.json();

  const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
  if (!REPLICATE_API_KEY) {
    console.error('[check-video-status] REPLICATE_API_KEY not configured');
    return c.json({ error: 'Error interno del servidor' }, 500);
  }

  const supabase = getSupabaseAdmin();

  const replicateResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` },
  });

  if (!replicateResp.ok) {
    console.error('[check-video-status] Replicate check error:', replicateResp.status);
    return c.json({ error: 'Error verificando el estado del video.' }, 500);
  }

  const prediction: any = await replicateResp.json();
  const status = prediction.status;

  if (status === 'succeeded') {
    const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!videoUrl) {
      console.error('[check-video-status] No video URL in completed prediction');
      return c.json({ error: 'Error procesando el video.' }, 500);
    }

    const videoResp = await fetch(videoUrl);
    const videoBuffer = await videoResp.arrayBuffer();
    const timestamp = Date.now();
    const storagePath = `assets/${clientId}/generated/${timestamp}.mp4`;

    const { error: storageErr } = await supabase.storage
      .from('client-assets')
      .upload(storagePath, new Uint8Array(videoBuffer), {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (storageErr) {
      console.error('Storage upload error:', storageErr);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(storagePath);

    const finalUrl = storageErr ? videoUrl : publicUrl;

    if (creativeId) {
      await supabase.from('ad_creatives').update({
        asset_url: finalUrl,
        estado: 'aprobado',
      }).eq('id', creativeId);
    }

    return c.json({ status: 'succeeded', asset_url: finalUrl });
  }

  if (status === 'failed' || status === 'canceled') {
    if (creativeId) {
      await supabase.from('ad_creatives').update({ estado: 'borrador' }).eq('id', creativeId);
    }
    return c.json({ status: 'failed', error: prediction.error || 'Video generation failed' });
  }

  return c.json({ status, progress: prediction.metrics?.predict_time || null });
  } catch (err: any) {
    console.error('[check-video-status]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
