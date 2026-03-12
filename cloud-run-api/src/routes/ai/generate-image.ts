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

  const promptFinal = `${promptBase}. Ultra-realistic commercial photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. Natural lighting with soft shadows, real skin texture with pores and subtle imperfections, genuine facial expressions. Real physical environment with depth of field and bokeh. No illustrations, no 3D renders, no AI artifacts, no plastic-looking skin, no floating objects. The image must be indistinguishable from a real professional advertising photo shoot.`;

  let imageUrl: string | null = null;
  let imageBytes: Uint8Array | null = null;

  if (engine === 'imagen') {
    // -- Gemini 2.0 Flash native image generation --
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-image] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Build parts: text prompt + optional reference photo
    const parts: Array<Record<string, any>> = [];

    // If a base photo URL is provided, download it and send as visual reference
    if (fotoBaseUrl) {
      try {
        console.log('[generate-image] Downloading reference photo for Gemini:', fotoBaseUrl);
        const refResponse = await fetch(fotoBaseUrl);
        if (refResponse.ok) {
          const refBuffer = await refResponse.arrayBuffer();
          const refBase64 = Buffer.from(refBuffer).toString('base64');
          const mimeType = refResponse.headers.get('content-type') || 'image/jpeg';
          parts.push({
            inlineData: { mimeType, data: refBase64 },
          });
          parts.push({
            text: `CRITICAL: This is the REAL product photo. The product in the generated image MUST look EXACTLY like this — same shape, same colors, same packaging, same labels, same textures. Do not alter, stylize, or reimagine the product. Place this exact real product into the advertising scene described below. The final image must look like a real photograph taken with a professional camera, NOT an AI illustration.\n\n${promptFinal}`,
          });
        } else {
          console.warn('[generate-image] Could not download reference photo:', refResponse.status);
          parts.push({ text: promptFinal });
        }
      } catch (refErr) {
        console.warn('[generate-image] Reference photo download error:', refErr);
        parts.push({ text: promptFinal });
      }
    } else {
      parts.push({ text: promptFinal });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['IMAGE'],
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('[generate-image] Gemini Flash error:', geminiResponse.status, errText);
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

    const geminiResult: any = await geminiResponse.json();
    const responseParts = geminiResult.candidates?.[0]?.content?.parts || [];

    for (const part of responseParts) {
      if (part.inlineData?.data) {
        imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
        break;
      }
    }

    if (!imageBytes) {
      console.error('[generate-image] No image in Gemini response:', JSON.stringify(geminiResult).substring(0, 500));
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
  const engineLabel = engine === 'imagen' ? 'Gemini 2.0 Flash' : engine === 'flux' ? 'Fal.ai Flux Pro v1.1 Ultra' : 'OpenAI GPT-4o (gpt-image-1)';
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
