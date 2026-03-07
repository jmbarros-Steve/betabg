import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function generateImage(c: Context) {
  const {
    clientId,
    creativeId,
    promptGeneracion,
    fotoBaseUrl,
    formato,
    rechazoTexto,
    engine = 'gpt4o',
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

  if (engine === 'flux') {
    // -- Flux (Fal.ai) path --
    const FAL_API_KEY = process.env.FAL_API_KEY;
    if (!FAL_API_KEY) throw new Error('FAL_API_KEY not configured');

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
      throw new Error(`Fal.ai API error: ${falResponse.status} - ${errText}`);
    }

    const falResult: any = await falResponse.json();
    imageUrl = falResult.images?.[0]?.url;
    if (!imageUrl) throw new Error('No image returned from Fal.ai');

    // Download image
    const imageResp = await fetch(imageUrl);
    const imageBlob = await imageResp.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    imageBytes = new Uint8Array(arrayBuffer);

  } else {
    // -- GPT-4o (OpenAI) path --
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

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
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errText}`);
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
      throw new Error('No image returned from OpenAI');
    }
  }

  if (!imageBytes) throw new Error('No image data obtained');

  // Save to Storage
  const timestamp = Date.now();
  const storagePath = `assets/${clientId}/generated/${timestamp}.png`;

  const { error: storageErr } = await supabase.storage
    .from('client-assets')
    .upload(storagePath, imageBytes, {
      contentType: 'image/png',
      upsert: false,
    });

  if (storageErr) throw storageErr;

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
  const engineLabel = engine === 'flux' ? 'Fal.ai Flux Pro v1.1 Ultra' : 'OpenAI GPT-4o (gpt-image-1)';
  await supabase.from('client_credits').update({
    creditos_disponibles: (credits?.creditos_disponibles || 99999) - 2,
    creditos_usados: (credits?.creditos_usados || 0) + 2,
  }).eq('client_id', clientId);

  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: `Generar imagen — ${engineLabel}`,
    creditos_usados: 2,
    costo_real_usd: engine === 'flux' ? 0.05 : 0.04,
  });

  return c.json({ asset_url: publicUrl });
}
