import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const IMAGE_CREDIT_COST = 2;
const DIVERSITY_STYLES = [
  'Vary the model ethnicity, age, and appearance for each generation.',
  'Use diverse backgrounds: urban, nature, studio, home, outdoor café.',
  'Alternate between close-up portrait, medium shot, and environmental portrait.',
  'Mix lighting styles: golden hour, studio softbox, natural window light, overcast diffused.',
  'Vary compositions: rule of thirds, centered, off-center with negative space.',
];

export async function generateImage(c: Context) {
  const supabase = getSupabaseAdmin();
  let creditsDeducted = false;
  let clientId: string | undefined;

  // Helper to refund credits on generation failure (safe to call even if not yet deducted)
  const refundCredits = async () => {
    if (!creditsDeducted || !clientId) return;
    const { error: refundErr } = await supabase.rpc('deduct_credits', { p_client_id: clientId, p_amount: -IMAGE_CREDIT_COST });
    if (refundErr) console.error('[generate-image] Credit refund failed:', refundErr);
  };

  try {
  const body = await c.req.json();
  clientId = body.clientId;
  const {
    creativeId,
    promptGeneracion,
    fotoBaseUrl,
    formato,
    rechazoTexto,
    engine = 'imagen',
  } = body;

  // Verify the authenticated user owns this client
  const user = c.get('user');
  if (!user || !clientId) {
    return c.json({ error: 'Missing authentication or clientId' }, 401);
  }
  const { data: ownerCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!ownerCheck) {
    return c.json({ error: 'No tienes acceso a este cliente' }, 403);
  }

  // Atomically deduct credits BEFORE generating (prevents race condition)
  const { data: deductResult, error: deductError } = await supabase
    .rpc('deduct_credits', { p_client_id: clientId, p_amount: IMAGE_CREDIT_COST });

  if (deductError) {
    console.error('[generate-image] Credit deduction error:', deductError);
    return c.json(
      { error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos para este cliente. Contacta al administrador.' },
      402
    );
  }
  if (!deductResult?.[0]?.success) {
    return c.json(
      { error: 'NO_CREDITS', message: `Se necesitan ${IMAGE_CREDIT_COST} créditos para generar una imagen` },
      402
    );
  }
  creditsDeducted = true;

  // Auto-fetch client reference photos if none provided
  // PRIORITY: Match product mentioned in the copy prompt to use its REAL Shopify photo
  let effectiveFotoBase = fotoBaseUrl;
  if (!effectiveFotoBase) {
    const supabaseForQuery = getSupabaseAdmin();

    // Get ALL Shopify product images with titles for matching
    const { data: shopifyProducts } = await supabaseForQuery
      .from('shopify_products')
      .select('image_url, title')
      .eq('client_id', clientId)
      .not('image_url', 'is', null)
      .limit(50);

    // Try to match a product mentioned in the copy/prompt text
    if (shopifyProducts && shopifyProducts.length > 0 && promptGeneracion) {
      const promptLower = promptGeneracion.toLowerCase();

      // Score each product by how well its title matches the prompt
      let bestMatch: { url: string; score: number } | null = null;
      for (const product of shopifyProducts) {
        if (!product.image_url || !product.title) continue;
        const titleLower = product.title.toLowerCase();
        const titleWords = titleLower.split(/\s+/).filter((w: string) => w.length > 2);
        // Count how many significant words from the product title appear in the prompt
        const matchingWords = titleWords.filter((word: string) => promptLower.includes(word));
        const score = matchingWords.length / Math.max(titleWords.length, 1);
        // Require at least 1 matching word and a decent ratio
        if (matchingWords.length >= 1 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { url: product.image_url, score };
        }
      }

      if (bestMatch && bestMatch.score >= 0.3) {
        effectiveFotoBase = bestMatch.url;
        console.log(`[generate-image] Matched product from copy: ${bestMatch.url} (score: ${bestMatch.score.toFixed(2)})`);
      }
    }

    // Fallback: brand assets or random product photo
    if (!effectiveFotoBase) {
      const { data: brandAssets } = await supabaseForQuery
        .from('ad_assets')
        .select('asset_url')
        .eq('client_id', clientId)
        .eq('tipo', 'imagen')
        .order('created_at', { ascending: false })
        .limit(5);

      const allPhotos: string[] = [];
      if (brandAssets) allPhotos.push(...brandAssets.map((a: any) => a.asset_url).filter(Boolean));
      if (shopifyProducts) allPhotos.push(...shopifyProducts.map((p: any) => p.image_url).filter(Boolean));

      if (allPhotos.length > 0) {
        effectiveFotoBase = allPhotos[Math.floor(Math.random() * allPhotos.length)];
      }
    }
  }

  // Adjust prompt if there's rejection text
  const promptBase = rechazoTexto
    ? `${promptGeneracion}. IMPORTANTE: Corregir esto: ${rechazoTexto}. No repetir el error anterior.`
    : promptGeneracion;

  // Add diversity instruction to avoid repetitive outputs
  const randomDiversity = DIVERSITY_STYLES[Math.floor(Math.random() * DIVERSITY_STYLES.length)];

  const promptFinal = `${promptBase}. ${randomDiversity}. Ultra-realistic commercial photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. Natural lighting with soft shadows, real skin texture with pores and subtle imperfections, genuine facial expressions. Real physical environment with depth of field and bokeh. No illustrations, no 3D renders, no AI artifacts, no plastic-looking skin, no floating objects. The image must be indistinguishable from a real professional advertising photo shoot.`;

  let imageBytes: Uint8Array | null = null;

  if (engine === 'imagen') {
    // -- Gemini 2.5 Flash native image generation --
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-image] GEMINI_API_KEY not configured');
      await refundCredits();
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Build parts: text prompt + optional reference photo
    const parts: Array<Record<string, any>> = [];

    // If a base photo URL is provided, download it and send as visual reference
    if (effectiveFotoBase) {
      try {
        console.log('[generate-image] Downloading reference photo for Gemini:', effectiveFotoBase);
        const refResponse = await fetch(effectiveFotoBase);
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
      await refundCredits();
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
      await refundCredits();
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

  } else {
    // All engines now route to Gemini (BUG 4+12a: removed OpenAI/Fal.ai)
    console.log(`[generate-image] Engine '${engine}' requested, routing to Gemini`);

    const GEMINI_API_KEY_FALLBACK = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY_FALLBACK) {
      await refundCredits();
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    const fallbackParts: Array<Record<string, any>> = [];
    if (effectiveFotoBase) {
      try {
        const refResp = await fetch(effectiveFotoBase);
        if (refResp.ok) {
          const refBuf = await refResp.arrayBuffer();
          const refB64 = Buffer.from(refBuf).toString('base64');
          const mime = refResp.headers.get('content-type') || 'image/jpeg';
          fallbackParts.push({ inlineData: { mimeType: mime, data: refB64 } });
          fallbackParts.push({ text: `CRITICAL: This is the REAL product photo. The product in the generated image MUST look EXACTLY like this. Place this exact real product into the advertising scene described below.\n\n${promptFinal}` });
        } else {
          fallbackParts.push({ text: promptFinal });
        }
      } catch { fallbackParts.push({ text: promptFinal }); }
    } else {
      fallbackParts.push({ text: promptFinal });
    }

    const fbResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY_FALLBACK}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: fallbackParts }], generationConfig: { responseModalities: ['IMAGE'] } }),
      }
    );

    if (!fbResp.ok) {
      console.error('[generate-image] Gemini fallback error:', fbResp.status);
      await refundCredits();
      return c.json({ error: 'Error generando la imagen. Intenta de nuevo.' }, 500);
    }

    const fbResult: any = await fbResp.json();
    for (const part of (fbResult.candidates?.[0]?.content?.parts || [])) {
      if (part.inlineData?.data) {
        imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
        break;
      }
    }

    if (!imageBytes) {
      console.error('[generate-image] No image in Gemini fallback response');
      await refundCredits();
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
    await refundCredits();
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

  // Log credit transaction (credits already deducted above)
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: 'Generar imagen — Gemini',
    creditos_usados: IMAGE_CREDIT_COST,
    costo_real_usd: 0.02,
  });

  return c.json({ asset_url: publicUrl });
  } catch (err: any) {
    console.error('[generate-image]', err);
    await refundCredits();
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
