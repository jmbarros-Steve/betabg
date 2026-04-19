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

// SSRF-safe host validator (blocks private IPs, loopback, metadata services)
function isPublicHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (!host || host.includes(':')) return false;
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    if (isIpv4) {
      const p = host.split('.').map(Number);
      if (p.some(n => n < 0 || n > 255)) return false;
      if (p[0] === 10 || p[0] === 127 || p[0] === 0) return false;
      if (p[0] === 169 && p[1] === 254) return false;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
      if (p[0] === 192 && p[1] === 168) return false;
      if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
      if (p[0] >= 224) return false;
      return true;
    }
    if (host === 'localhost') return false;
    if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost')) return false;
    if (!host.includes('.')) return false;
    return true;
  } catch { return false; }
}

interface BrandContext {
  colors: string[];       // hex codes + color names
  logoUrl: string | null;
  briefColorHints: string; // raw color-relevant text from brief
}

// Load brand identity context for image generation coherence
async function loadBrandContext(supabase: ReturnType<typeof getSupabaseAdmin>, clientId: string): Promise<BrandContext> {
  const ctx: BrandContext = { colors: [], logoUrl: null, briefColorHints: '' };
  if (!clientId || !clientId.trim()) return ctx;

  // 1) Brief responses — find those that mention colors (hex or keywords)
  const bpData = await safeQuerySingleOrDefault<{ persona_data: any }>(
    supabase.from('buyer_personas').select('persona_data').eq('client_id', clientId).maybeSingle(),
    null,
    'generate-image.loadBrandContext.bp',
  );
  if (bpData?.persona_data?.raw_responses && Array.isArray(bpData.persona_data.raw_responses)) {
    const responses = bpData.persona_data.raw_responses.filter((r: any) => typeof r === 'string' && r.trim());
    // Content-based match (robust against question reordering by Bastián W24)
    const hexRx = /#[0-9a-f]{6}\b/i;
    const colorKwRx = /\b(rojo|azul|verde|amarillo|negro|blanco|rosa|violeta|morado|naranja|gris|caf[eé]|marr[óo]n|celeste|turquesa|dorado|plateado|beige|crema|vino|burdeos|lila|coral|menta|salm[óo]n|mostaza|oliva|terracota|paleta|color|colores)\b/i;
    const colorRelevant = responses.filter((r: string) => hexRx.test(r) || colorKwRx.test(r));
    const selected = colorRelevant.length > 0 ? colorRelevant.slice(0, 3) : responses.slice(-2);
    ctx.briefColorHints = selected.join('\n').slice(0, 1500);
  }

  // 2) Extract hex codes + color keywords from brief
  const hexRegex = /#[0-9a-f]{6}\b/gi;
  const hexFromBrief = Array.from(ctx.briefColorHints.matchAll(hexRegex)).map(m => m[0].toLowerCase());
  const colorKeywordRegex = /\b(rojo|azul|verde|amarillo|negro|blanco|rosa|violeta|morado|naranja|gris|caf[eé]|marr[óo]n|celeste|turquesa|dorado|plateado|beige|crema|vino|burdeos|lila|coral|menta|salm[óo]n|mostaza|oliva|terracota)\b/gi;
  const colorsFromBrief = Array.from(ctx.briefColorHints.matchAll(colorKeywordRegex)).map(m => m[0].toLowerCase());

  // 3) Logo URL + clients.website_url
  const [logoRow, clientRow] = await Promise.all([
    safeQuerySingleOrDefault<{ url: string }>(
      supabase.from('client_assets').select('url').eq('client_id', clientId).eq('tipo', 'logo').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      null,
      'generate-image.loadBrandContext.logo',
    ),
    safeQuerySingleOrDefault<{ website_url: string | null }>(
      supabase.from('clients').select('website_url').eq('id', clientId).maybeSingle(),
      null,
      'generate-image.loadBrandContext.client',
    ),
  ]);
  if (logoRow?.url) ctx.logoUrl = logoRow.url;

  // 4) Scrape homepage for dominant hex colors
  const hexFromWeb: string[] = [];
  if (clientRow?.website_url) {
    const rawUrl = clientRow.website_url.trim();
    const candidateUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    if (isPublicHost(candidateUrl)) {
      try {
        const resp = await fetch(candidateUrl, {
          signal: AbortSignal.timeout(8_000),
          redirect: 'follow',
          headers: { 'User-Agent': 'Steve-Ads/1.0 (+https://steve.cl)' },
        });
        if (resp.ok && (!resp.url || isPublicHost(resp.url))) {
          const html = await resp.text();
          const matches = html.matchAll(/#[0-9a-f]{6}\b/gi);
          const counts = new Map<string, number>();
          for (const m of matches) {
            const hex = m[0].toLowerCase();
            if (hex === '#ffffff' || hex === '#000000') continue; // skip pure white/black
            counts.set(hex, (counts.get(hex) || 0) + 1);
          }
          const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
          hexFromWeb.push(...top);
        }
      } catch (err: any) {
        console.warn('[generate-image.loadBrandContext] homepage scrape failed:', err?.message);
      }
    }
  }

  // 5) Merge: brief hex > web hex > brief keywords. Dedup. Cap at 8.
  const combined = [...hexFromBrief, ...hexFromWeb, ...colorsFromBrief];
  ctx.colors = Array.from(new Set(combined)).slice(0, 8);
  return ctx;
}

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
    referenceImageUrls,
  } = body;
  const refUrls: string[] = Array.isArray(referenceImageUrls)
    ? referenceImageUrls.filter((u: any) => typeof u === 'string' && u.trim().length > 0).slice(0, 3)
    : [];

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

  // Load brand context (colors from brief + website, logo URL) for visual coherence
  const brandCtx = await loadBrandContext(supabase, clientId);
  const includeLogoReference = !!brandCtx.logoUrl && String(formato || '').toLowerCase() !== 'logo';
  const brandColorsBlock = brandCtx.colors.length > 0
    ? `\nBRAND COLORS (use these in the composition — props, lighting accents, background tones): ${brandCtx.colors.join(', ')}\n`
    : '';
  const brandConsistencyBlock = includeLogoReference
    ? `\nBRAND IDENTITY CONSISTENCY: A second reference image is provided — it is the client's LOGO. The generated photograph MUST feel visually consistent with that logo: match its color palette, mood, level of polish, and design language. Do NOT render the logo itself in the scene unless explicitly requested; the logo is shared only for style reference.\n`
    : '';

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

  const promptFinal = `${promptBase}. ${randomDiversity}. ${visualRulesForPrompt}${brandColorsBlock}${brandConsistencyBlock}Ultra-realistic commercial photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. Natural lighting with soft shadows, real skin texture with pores and subtle imperfections, genuine facial expressions. Real physical environment with depth of field and bokeh. No illustrations, no 3D renders, no AI artifacts, no plastic-looking skin, no floating objects. The image must be indistinguishable from a real professional advertising photo shoot.`;

  let imageBytes: Uint8Array | null = null;

  if (engine === 'imagen') {
    // -- Gemini 2.5 Flash native image generation --
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('[generate-image] GEMINI_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Build parts: text prompt + optional product photo + optional logo (as brand-style reference)
    const parts: Array<Record<string, any>> = [];

    // Running total to respect Gemini's ~20MB request cap across all inline images
    const GEMINI_MAX_BYTES = 18 * 1024 * 1024; // safety margin below 20MB
    let totalInlineBytes = 0;

    // Helper: safely download an image URL and return Gemini inlineData part (or null)
    const downloadInlineData = async (url: string, label: string): Promise<Record<string, any> | null> => {
      try {
        if (!isPublicHost(url)) {
          console.warn(`[generate-image] Blocked non-public host for ${label}: ${url}`);
          return null;
        }
        const resp = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'follow' });
        if (!resp.ok) {
          console.warn(`[generate-image] ${label} download failed:`, resp.status);
          return null;
        }
        if (resp.url && !isPublicHost(resp.url)) {
          console.warn(`[generate-image] ${label} redirected to non-public host: ${resp.url}`);
          return null;
        }
        const declaredMime = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (declaredMime && !declaredMime.startsWith('image/')) {
          console.warn(`[generate-image] ${label} non-image content-type rejected: ${declaredMime}`);
          return null;
        }
        const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
        if (contentLength > 10 * 1024 * 1024) {
          console.warn(`[generate-image] ${label} too large: ${contentLength}`);
          return null;
        }
        const buf = await resp.arrayBuffer();
        if (totalInlineBytes + buf.byteLength > GEMINI_MAX_BYTES) {
          console.warn(`[generate-image] ${label} would exceed Gemini payload cap (current=${totalInlineBytes}, adding=${buf.byteLength}) — skipping`);
          return null;
        }
        totalInlineBytes += buf.byteLength;
        const data = Buffer.from(buf).toString('base64');
        const mimeType = declaredMime || 'image/jpeg';
        return { inlineData: { mimeType, data } };
      } catch (err: any) {
        console.warn(`[generate-image] ${label} error:`, err?.message);
        return null;
      }
    };

    // 1) Product reference (from auto-match or explicit fotoBaseUrl)
    let productPart: Record<string, any> | null = null;
    if (effectiveFotoBase) {
      console.log('[generate-image] Downloading product reference:', effectiveFotoBase);
      productPart = await downloadInlineData(effectiveFotoBase, 'product-ref');
    }

    // 2) Logo reference (for brand consistency — only when generating non-logo formats)
    let logoPart: Record<string, any> | null = null;
    if (includeLogoReference && brandCtx.logoUrl) {
      console.log('[generate-image] Downloading logo for brand consistency:', brandCtx.logoUrl);
      logoPart = await downloadInlineData(brandCtx.logoUrl, 'logo-ref');
    }

    // 3) Previous ad images (passed from caller — usually Google Ads image assets) for style reference
    const prevAdParts: Array<Record<string, any>> = [];
    for (const u of refUrls) {
      if (prevAdParts.length >= 2) break; // cap 2 prev ads to avoid huge payloads
      const part = await downloadInlineData(u, 'prev-ad-ref');
      if (part) prevAdParts.push(part);
    }

    // Assemble parts in a defined order: product, logo, prev ads, text instruction
    const imagesProvided: string[] = [];
    if (productPart) { parts.push(productPart); imagesProvided.push('PRODUCT'); }
    if (logoPart) { parts.push(logoPart); imagesProvided.push('LOGO'); }
    for (const p of prevAdParts) { parts.push(p); imagesProvided.push('PREV_AD'); }

    if (imagesProvided.length > 0) {
      // Build per-image role description
      const roleLines: string[] = [];
      let idx = 1;
      if (productPart) {
        roleLines.push(`IMAGE ${idx} = the REAL product. Must appear EXACTLY as shown — same shape, colors, packaging, labels, textures. Do not alter, stylize, or reimagine it.`);
        idx++;
      }
      if (logoPart) {
        roleLines.push(`IMAGE ${idx} = the client's LOGO. STYLE REFERENCE ONLY: match its color palette, mood, polish, and design language in the whole composition (lighting, background, props). Do NOT render the logo itself in the scene unless explicitly requested.`);
        idx++;
      }
      if (prevAdParts.length > 0) {
        const range = prevAdParts.length === 1 ? `IMAGE ${idx}` : `IMAGES ${idx}-${idx + prevAdParts.length - 1}`;
        roleLines.push(`${range} = previous successful Google Ads of this brand. Match their visual style, tone, lighting mood, and overall aesthetic. Do NOT copy their exact scenes.`);
      }
      parts.push({
        text: `CRITICAL: ${imagesProvided.length} reference image(s) were provided, each with a distinct role:\n${roleLines.join('\n')}\n\n${promptFinal}`,
      });
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
