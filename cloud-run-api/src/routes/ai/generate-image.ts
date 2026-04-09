import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

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
  let clientId: string | undefined;

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
  if (!user?.id) return c.json({ error: 'Unauthorized' }, 401);
  if (!clientId) {
    return c.json({ error: 'Missing clientId' }, 400);
  }
  const ownerCheck = await safeQuerySingleOrDefault<{ id: string }>(
    supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
      .maybeSingle(),
    null,
    'generate-image.ownerCheck',
  );
  if (!ownerCheck) {
    return c.json({ error: 'No tienes acceso a este cliente' }, 403);
  }

  // Load visual/creative knowledge rules
  const { knowledgeBlock: visualKnowledge } = await loadKnowledge(
    ['anuncios', 'meta_ads', 'creativos', 'imagenes'],
    { clientId, limit: 8, audit: { source: 'generate-image' } }
  );

  // TODO: Re-enable credit system when billing is ready

  // Auto-fetch client reference photos if none provided
  // PRIORITY: Match product mentioned in the copy prompt to use its REAL Shopify photo
  let effectiveFotoBase = fotoBaseUrl;
  if (!effectiveFotoBase) {
    const supabaseForQuery = getSupabaseAdmin();

    // Get ALL Shopify product images with titles for matching
    const shopifyProducts = await safeQueryOrDefault<{ image_url: string | null; title: string | null }>(
      supabaseForQuery
        .from('shopify_products')
        .select('image_url, title')
        .eq('client_id', clientId)
        .not('image_url', 'is', null)
        .limit(50),
      [],
      'generate-image.fetchShopifyProducts',
    );

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
      const brandAssets = await safeQueryOrDefault<{ asset_url: string | null }>(
        supabaseForQuery
          .from('ad_assets')
          .select('asset_url')
          .eq('client_id', clientId)
          .eq('tipo', 'imagen')
          .order('created_at', { ascending: false })
          .limit(5),
        [],
        'generate-image.fetchBrandAssets',
      );

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

  const visualRulesForPrompt = visualKnowledge
    ? `\nBRAND & CREATIVE RULES (follow these):\n${visualKnowledge}\n`
    : '';

  const promptFinal = `${promptBase}. ${randomDiversity}. ${visualRulesForPrompt}Ultra-realistic commercial photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. Natural lighting with soft shadows, real skin texture with pores and subtle imperfections, genuine facial expressions. Real physical environment with depth of field and bokeh. No illustrations, no 3D renders, no AI artifacts, no plastic-looking skin, no floating objects. The image must be indistinguishable from a real professional advertising photo shoot.`;

  let imageBytes: Uint8Array | null = null;

  if (engine === 'imagen') {
    // -- Gemini 2.5 Flash native image generation --
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-image] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Build parts: text prompt + optional reference photo
    const parts: Array<Record<string, any>> = [];

    // If a base photo URL is provided, download it and send as visual reference
    if (effectiveFotoBase) {
      try {
        console.log('[generate-image] Downloading reference photo for Gemini:', effectiveFotoBase);
        const refResponse = await fetch(effectiveFotoBase, { signal: AbortSignal.timeout(15000) });
        if (!refResponse.ok) {
          console.warn('[generate-image] Could not download reference photo:', refResponse.status);
          parts.push({ text: promptFinal });
        } else {
          const contentLength = parseInt(refResponse.headers.get('content-length') || '0', 10);
          if (contentLength > 10 * 1024 * 1024) {
            // 10MB limit — skip reference image, proceed without it
            console.warn('[generate-image] Reference image too large:', contentLength);
            parts.push({ text: promptFinal });
          } else {
            const refBuffer = await refResponse.arrayBuffer();
            const refBase64 = Buffer.from(refBuffer).toString('base64');
            const mimeType = refResponse.headers.get('content-type') || 'image/jpeg';
            parts.push({
              inlineData: { mimeType, data: refBase64 },
            });
            parts.push({
              text: `CRITICAL: This is the REAL product photo. The product in the generated image MUST look EXACTLY like this — same shape, same colors, same packaging, same labels, same textures. Do not alter, stylize, or reimagine the product. Place this exact real product into the advertising scene described below. The final image must look like a real photograph taken with a professional camera, NOT an AI illustration.\n\n${promptFinal}`,
            });
          }
        }
      } catch (refErr) {
        console.warn('[generate-image] Reference photo download error:', refErr);
        parts.push({ text: promptFinal });
      }
    } else {
      parts.push({ text: promptFinal });
    }

    // Note: Gemini API requires key in URL per their docs
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

  } else {
    // All engines now route to Gemini (BUG 4+12a: removed OpenAI/Fal.ai)
    console.log(`[generate-image] Engine '${engine}' requested, routing to Gemini`);

    const GEMINI_API_KEY_FALLBACK = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY_FALLBACK) {
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
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
