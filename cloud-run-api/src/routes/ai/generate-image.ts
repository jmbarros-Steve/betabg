import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function generateImage(c: Context) {
  try {
  const {
    clientId,
    creativeId,
    promptGeneracion,
    fotoBaseUrl,
    formato,
    rechazoTexto,
    engine = 'imagen',
  } = await c.req.json();

  const supabase = getSupabaseAdmin();

  // Check & deduct 2 credits
  const { data: credits } = await supabase
    .from('client_credits')
    .select('id, creditos_disponibles, creditos_usados')
    .eq('client_id', clientId)
    .maybeSingle();

  const available = credits?.creditos_disponibles ?? 99999;
  if (available < 2) {
    return c.json(
      { error: 'NO_CREDITS', message: 'Se necesitan 2 créditos para generar una imagen' },
      402
    );
  }

  // Adjust prompt if there's rejection text
  const promptBase = rechazoTexto
    ? `${promptGeneracion}. IMPORTANTE: Corregir esto: ${rechazoTexto}. No repetir el error anterior.`
    : promptGeneracion;

  const promptFinal = `${promptBase}, shot on Canon EOS R5, 85mm f/1.4 lens, natural window lighting, editorial style`;

  let imageUrl: string | null = null;
  let imageBytes: Uint8Array | null = null;

  if (engine === 'imagen') {
    // -- Google Imagen 4 (AI Studio) path --
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-image] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    const aspectRatio = formato === 'story' ? '9:16' :
                        formato === 'feed' ? '1:1' :
                        '1:1';

    const imagenResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: promptFinal }],
          parameters: {
            sampleCount: 1,
            aspectRatio,
          },
        }),
      }
    );

    if (!imagenResponse.ok) {
      const errText = await imagenResponse.text();
      console.error('[generate-image] Imagen 4 API error:', imagenResponse.status, errText);
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

    const imagenResult: any = await imagenResponse.json();
    const prediction = imagenResult.predictions?.[0];

    if (prediction?.bytesBase64Encoded) {
      imageBytes = new Uint8Array(Buffer.from(prediction.bytesBase64Encoded, 'base64'));
    } else {
      console.error('[generate-image] No image returned from Imagen 4:', JSON.stringify(imagenResult).substring(0, 500));
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

  } else if (engine === 'flux') {
    // -- Flux (Fal.ai) path --
    const FAL_API_KEY = process.env.FAL_API_KEY;
    if (!FAL_API_KEY) {
      console.error('[generate-image] FAL_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    const imageSize = formato === 'story' ? 'portrait_16_9' :
                      formato === 'feed' ? 'square_hd' :
                      'square_hd';

    const falBody: Record<string, unknown> = {
      prompt: promptFinal,
      num_images: 1,
      image_size: imageSize,
      enable_safety_checker: true,
    };

    if (fotoBaseUrl) {
      falBody.image_url = fotoBaseUrl;
      falBody.image_prompt_strength = 0.3;
    }

    const falResponse = await fetch('https://fal.run/fal-ai/flux-pro/v1.1-ultra', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(falBody),
    });

    if (!falResponse.ok) {
      const errText = await falResponse.text();
      console.error('[generate-image] Fal.ai API error:', falResponse.status, errText);
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

    const falResult: any = await falResponse.json();
    imageUrl = falResult.images?.[0]?.url;
    if (!imageUrl) {
      console.error('[generate-image] No image returned from Fal.ai');
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

    // Download image
    const imageResp = await fetch(imageUrl);
    const imageBlob = await imageResp.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    imageBytes = new Uint8Array(arrayBuffer);

  } else {
    // -- GPT-4o (OpenAI) path --
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('[generate-image] OPENAI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    const gptSize = formato === 'story' ? '1024x1792' :
                    formato === 'feed' ? '1024x1024' :
                    '1024x1024';

    const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: promptFinal,
        n: 1,
        size: gptSize,
        quality: 'high',
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error('[generate-image] OpenAI API error:', openaiResponse.status, errText);
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

    const openaiResult: any = await openaiResponse.json();
    const item = openaiResult.data?.[0];

    if (item?.b64_json) {
      // Decode base64 to bytes
      const buffer = Buffer.from(item.b64_json, 'base64');
      imageBytes = new Uint8Array(buffer);
    } else if (item?.url) {
      imageUrl = item.url;
      const imageResp = await fetch(imageUrl!);
      const imageBlob = await imageResp.blob();
      const arrayBuffer = await imageBlob.arrayBuffer();
      imageBytes = new Uint8Array(arrayBuffer);
    } else {
      console.error('[generate-image] No image returned from OpenAI');
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }
  }

  if (!imageBytes) {
    console.error('[generate-image] No image data obtained');
    return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
  }

  // Save to Storage
  const timestamp = Date.now();
  const storagePath = `assets/${clientId}/generated/${timestamp}.png`;

  const { error: storageErr } = await supabase.storage
    .from('client-assets')
    .upload(storagePath, imageBytes, {
      contentType: 'image/png',
      upsert: false,
    });

  if (storageErr) {
    console.error('[generate-image] Storage upload error:', storageErr);
    return c.json({ error: 'Error guardando la imagen.' }, 500);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('client-assets')
    .getPublicUrl(storagePath);

  // Save image as a separate asset record
  await supabase.from('ad_assets').insert({
    creative_id: creativeId || null,
    client_id: clientId,
    asset_url: publicUrl,
    tipo: 'imagen',
  });

  // Deduct credits
  const engineLabel = engine === 'imagen' ? 'Google Imagen 4' : engine === 'flux' ? 'Fal.ai Flux Pro v1.1 Ultra' : 'OpenAI GPT-4o (gpt-image-1)';
  await supabase.from('client_credits').update({
    creditos_disponibles: (credits?.creditos_disponibles || 99999) - 2,
    creditos_usados: (credits?.creditos_usados || 0) + 2,
  }).eq('client_id', clientId);

  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Generar imagen — ${engineLabel}`,
    creditos_usados: 2,
    costo_real_usd: engine === 'imagen' ? 0.02 : engine === 'flux' ? 0.05 : 0.04,
  });

  return c.json({ asset_url: publicUrl });
  } catch (err: any) {
    console.error('[generate-image]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
