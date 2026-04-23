import { Context } from 'hono';
import sharp from 'sharp';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

// Spec oficial de Google Ads PMAX per field_type
const PMAX_OUTPUT_SPECS: Record<string, { width: number; height: number }> = {
  landscape:        { width: 1200, height: 628 },  // 1.91:1 MARKETING_IMAGE
  square:           { width: 1200, height: 1200 }, // 1:1 SQUARE_MARKETING_IMAGE
  portrait:         { width: 960,  height: 1200 }, // 4:5 PORTRAIT_MARKETING_IMAGE
  logo:             { width: 1200, height: 1200 }, // 1:1 LOGO
  landscape_logo:   { width: 1200, height: 300 },  // 4:1 LANDSCAPE_LOGO
};

// Normaliza un buffer de imagen al aspect ratio exacto que PMAX espera (center-crop + resize).
async function normalizeToPmaxSpec(buf: Uint8Array, formato: string | undefined): Promise<Uint8Array> {
  const key = String(formato || '').toLowerCase();
  const spec = PMAX_OUTPUT_SPECS[key];
  if (!spec) return buf; // formato desconocido → no transformar
  try {
    const out = await sharp(Buffer.from(buf))
      .resize(spec.width, spec.height, { fit: 'cover', position: 'attention' }) // attention = auto-center en el sujeto principal
      .png({ compressionLevel: 6 })
      .toBuffer();
    return new Uint8Array(out);
  } catch (err: any) {
    console.warn('[generate-image] normalizeToPmaxSpec failed, using original:', err?.message);
    return buf;
  }
}

const IMAGE_CREDIT_COST = 2; // Gemini — fast & cheap
const FLUX_CREDIT_COST = 5;  // Flux Premium via Replicate — 2.5× more realistic
const FLUX_USD_COST = 0.05;
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
    userIntent: rawUserIntent,
    use_brand_logo_reference: forceBrandLogo,
  } = body;
  const userIntent = typeof rawUserIntent === 'string' ? rawUserIntent.trim().slice(0, 600) : '';
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

  // Shortcut: formato=landscape_logo con logo del cliente presente → letterbox con sharp
  // (logo centrado en canvas 1200x300 blanco). No llamamos a Gemini — es gratis, instantáneo,
  // y preserva el logo original. Si falla, cae al flujo normal de Gemini.
  // Exception: si use_brand_logo_reference=true, el user pidió VARIACIONES explícitas
  // → bypass letterbox y usa Gemini con el logo como referencia.
  if (String(formato || '').toLowerCase() === 'landscape_logo' && brandCtx.logoUrl && forceBrandLogo !== true) {
    try {
      const logoResp = await fetch(brandCtx.logoUrl, { signal: AbortSignal.timeout(10_000) });
      if (!logoResp.ok) throw new Error(`logo fetch failed: ${logoResp.status}`);
      const logoBuf = Buffer.from(await logoResp.arrayBuffer());

      const TARGET_W = 1200;
      const TARGET_H = 300;
      const PADDING = 20; // margen interno — logo nunca toca bordes

      const logoResized = await sharp(logoBuf)
        .resize({ height: TARGET_H - PADDING * 2, fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer();

      const composed = await sharp({
        create: {
          width: TARGET_W,
          height: TARGET_H,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        },
      })
        .composite([{ input: logoResized, gravity: 'center' }])
        .png({ compressionLevel: 6 })
        .toBuffer();

      const ts = Date.now();
      const storagePath = `assets/${clientId}/generated/landscape-logo-${ts}.png`;
      const { error: storageErr } = await supabase.storage
        .from('client-assets')
        .upload(storagePath, composed, { contentType: 'image/png', upsert: false });
      if (storageErr) throw storageErr;

      const { data: { publicUrl } } = supabase.storage
        .from('client-assets')
        .getPublicUrl(storagePath);

      await supabase.from('ad_assets').insert({
        creative_id: creativeId || null,
        client_id: clientId,
        asset_url: publicUrl,
        tipo: 'imagen',
      });

      console.log('[generate-image] landscape_logo letterbox generated from brand logo');
      return c.json({ asset_url: publicUrl, source: 'letterbox' });
    } catch (err: any) {
      console.warn('[generate-image] letterbox failed, falling through to Gemini:', err?.message);
      // cae al flujo normal
    }
  }

  // Normalmente excluimos el logo del set de referencias cuando formato=logo
  // (porque asumimos que estamos creando el logo desde cero). PERO para
  // "variaciones del logo" el frontend pasa use_brand_logo_reference=true
  // para forzar que Gemini lo use como referencia y lo mantenga consistente.
  const includeLogoReference = !!brandCtx.logoUrl && (
    String(formato || '').toLowerCase() !== 'logo' || forceBrandLogo === true
  );
  const brandColorsBlock = brandCtx.colors.length > 0
    ? `\nBRAND COLORS (use these in the composition — props, lighting accents, background tones): ${brandCtx.colors.join(', ')}\n`
    : '';
  // Dos modos distintos según si estamos generando una VARIACIÓN del logo
  // (forceBrandLogo=true) o solo usando el logo como style reference para
  // una foto de producto/banner.
  const brandConsistencyBlock = !includeLogoReference
    ? ''
    : forceBrandLogo === true
      ? `\nLOGO VARIATION TASK: A reference image is provided — it is the client's CURRENT LOGO. Create a VARIATION of that exact logo: keep the core symbol, typography, and brand identity recognizable, but change ONLY the background, framing, or subtle stylistic elements (color tones, lighting, texture) as requested in the prompt. The output MUST be immediately identifiable as the same brand. Do NOT invent a new logo — preserve the recognizable design.\n`
      : `\nBRAND IDENTITY CONSISTENCY: A second reference image is provided — it is the client's LOGO. The generated photograph MUST feel visually consistent with that logo: match its color palette, mood, level of polish, and design language. Do NOT render the logo itself in the scene unless explicitly requested; the logo is shared only for style reference.\n`;

  // TODO: Re-enable credit system when billing is ready

  // Auto-fetch client reference photos if none provided.
  // Goal (A1 fix): NEVER compose with an AI-generated asset as reference —
  // iterating on previous AI output amplifies hallucinations ("the product
  // lies"). Only real Shopify product photos are used as visual ground truth.
  let effectiveFotoBase = fotoBaseUrl;
  let productRefConfidence: 'exact' | 'fuzzy' | 'none' = fotoBaseUrl ? 'exact' : 'none';
  let productRefTitle: string | null = null;
  if (!effectiveFotoBase) {
    const supabaseForQuery = getSupabaseAdmin();

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

    // Token-based match against the copy prompt. Tightened thresholds vs. the
    // previous version (score >= 0.3 with 1 hit matched almost anything).
    if (shopifyProducts && shopifyProducts.length > 0 && promptGeneracion) {
      const STOP_WORDS = new Set(['para','con','sin','los','las','del','que','una','uno','est','este','esta','por','pro','más','mas','muy','sus','desde','hasta','entre','como','bien','todo','toda','todos','nuevo','nueva','nuestro','ideal','best','better','great','good']);
      const tokenize = (s: string) =>
        s.toLowerCase()
         .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
         .split(/[^a-z0-9]+/)
         .filter(w => w.length > 3 && !STOP_WORDS.has(w));
      const promptTokens = new Set(tokenize(promptGeneracion));

      let bestMatch: { url: string; score: number; hits: number; title: string } | null = null;
      for (const product of shopifyProducts) {
        if (!product.image_url || !product.title) continue;
        const titleTokens = tokenize(product.title);
        if (titleTokens.length === 0) continue;
        const matchingWords = titleTokens.filter(w => promptTokens.has(w));
        const score = matchingWords.length / titleTokens.length;
        if (matchingWords.length >= 1 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { url: product.image_url, score, hits: matchingWords.length, title: product.title };
        }
      }

      if (bestMatch && (bestMatch.score >= 0.5 || bestMatch.hits >= 2)) {
        effectiveFotoBase = bestMatch.url;
        productRefConfidence = 'exact';
        productRefTitle = bestMatch.title;
        console.log(`[generate-image] Matched product "${bestMatch.title}" (score=${bestMatch.score.toFixed(2)}, hits=${bestMatch.hits})`);
      } else if (bestMatch) {
        console.log(`[generate-image] Weak product match "${bestMatch.title}" (score=${bestMatch.score.toFixed(2)}, hits=${bestMatch.hits}) — NOT using as reference`);
      }
    }

    // Fallback: ONLY real Shopify photos. Never use ad_assets (may be
    // AI-generated output from a prior run → feedback loop of garbage).
    // Pick randomly among real products and tag as 'fuzzy' so the prompt can
    // flag the LLM that this is NOT the exact product being advertised.
    if (!effectiveFotoBase && shopifyProducts && shopifyProducts.length > 0) {
      const realPhotos = shopifyProducts.map((p: any) => p.image_url).filter(Boolean);
      if (realPhotos.length > 0) {
        effectiveFotoBase = realPhotos[Math.floor(Math.random() * realPhotos.length)];
        productRefConfidence = 'fuzzy';
      }
    }
  }

  // Adjust prompt if there's rejection text
  const userIntentBlock = userIntent ? `\nCAMPAIGN OBJECTIVE (user's words, honor this intent): ${userIntent}\n` : '';
  const promptBase = rechazoTexto
    ? `${promptGeneracion}${userIntentBlock}. IMPORTANTE: Corregir esto: ${rechazoTexto}. No repetir el error anterior.`
    : `${promptGeneracion}${userIntentBlock}`;

  // Add diversity instruction to avoid repetitive outputs
  const randomDiversity = DIVERSITY_STYLES[Math.floor(Math.random() * DIVERSITY_STYLES.length)];

  const visualRulesForPrompt = visualKnowledge
    ? `\nBRAND & CREATIVE RULES (follow these):\n${visualKnowledge}\n`
    : '';

  // Logos usan un prompt COMPLETAMENTE distinto al de fotos de producto.
  // Las instrucciones "Canon EOS R5 / real skin texture / genuine facial
  // expressions" son contraproducentes para logos — confunden a Gemini y
  // genera caras humanas o escenas fotográficas en vez del logo variado.
  const isLogoFormat = String(formato || '').toLowerCase() === 'logo' || String(formato || '').toLowerCase() === 'landscape_logo';

  // Pick the "photographic quality" block based on subject type:
  // - logo → graphic design rules
  // - product photography (ANY real Shopify reference, exact or fuzzy) → product-oriented lens/light
  // - lifestyle / people (no product reference at all) → portrait lens, skin texture, expressions
  const isProductShot = productRefConfidence === 'exact' || productRefConfidence === 'fuzzy';
  const photographyBlock = isProductShot
    ? `Ultra-sharp commercial product photograph, shot on medium-format digital (Hasselblad H6D) with 80mm macro lens at f/8. Studio-quality lighting (softbox + reflector) revealing real material textures — glass highlights, fabric weave, printed labels, condensation, natural food sheen. Tack-sharp focus on the product. Clean, deliberate composition suitable for an e-commerce hero banner. No illustrations, no 3D renders, no cartoon stylization, no floating objects, no AI shimmer, no plastic-looking surfaces. The product must look photographically identical to the real reference image — same shape, colors, proportions, packaging, and branding. The final image must be indistinguishable from a professional advertising product shoot.`
    : `Ultra-realistic commercial photograph, shot on Canon EOS R5 with 85mm f/1.4 lens. Natural lighting with soft shadows, real skin texture with pores and subtle imperfections, genuine facial expressions. Real physical environment with depth of field and bokeh. No illustrations, no 3D renders, no AI artifacts, no plastic-looking skin, no floating objects. The image must be indistinguishable from a real professional advertising photo shoot.`;

  const promptFinal = isLogoFormat
    ? `${promptBase}.${brandColorsBlock}${brandConsistencyBlock}
CRITICAL RENDERING INSTRUCTIONS FOR LOGO:
- This is a LOGO / BRAND MARK. Graphic design asset, NOT a photograph.
- Clean vector-style graphic. Flat or subtle gradient. Crisp edges.
- Absolutely NO human figures, faces, skin, hands, people.
- Absolutely NO photographic elements: NO depth of field, NO bokeh, NO natural lighting, NO "real skin texture".
- Preserve the EXACT symbol, icon, and typography from the reference logo. Do not redesign the mark.
- Only vary background color / framing / subtle styling as described in the prompt.
- Centered composition with breathing space. Solid or flat subtle background.
- Output must look like a professional brand logo — the kind that appears on a website header or business card.`
    : `${promptBase}. ${randomDiversity}. ${visualRulesForPrompt}${brandColorsBlock}${brandConsistencyBlock}${photographyBlock}`;

  let imageBytes: Uint8Array | null = null;

  if (engine === 'flux') {
    // -- Flux Premium via Replicate --
    // flux-kontext-pro edits with a reference image (ideal for keeping the
    // real product identical while changing scene). flux-1.1-pro is pure
    // text-to-image, used when no reference photo is available.
    const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
    if (!REPLICATE_API_KEY) {
      console.error('[generate-image] REPLICATE_API_KEY not configured');
      return c.json({ error: 'Error interno del servidor' }, 500);
    }

    // Map our internal formats to Flux aspect ratios.
    const fmtKey = String(formato || '').toLowerCase();
    const aspectRatio = fmtKey === 'portrait' ? '4:5'
      : fmtKey === 'landscape' ? '16:9'
      : fmtKey === 'landscape_logo' ? '16:9'
      : '1:1';

    const useKontext = !!effectiveFotoBase;
    const modelPath = useKontext
      ? 'black-forest-labs/flux-kontext-pro'
      : 'black-forest-labs/flux-1.1-pro';

    // Build the prompt. Kontext edit needs a concise instruction that
    // references the input image, not our long Gemini-style prompt.
    const fluxPrompt = useKontext
      ? `Place the product shown in the input image into this new scene, keeping the product IDENTICAL (same shape, colors, labels, packaging, proportions): ${promptBase}`
      : promptFinal;

    const input: Record<string, any> = {
      prompt: fluxPrompt.slice(0, 2000),
      aspect_ratio: aspectRatio,
      output_format: 'png',
      safety_tolerance: 2,
    };
    if (useKontext && effectiveFotoBase) {
      input.input_image = effectiveFotoBase;
    }

    // Replicate `Prefer: wait` waits up to 60s for the prediction to finish
    // in a single HTTP call — no polling needed for the common case.
    const replRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(90_000),
    });

    const replData: any = await replRes.json().catch(() => ({}));
    if (!replRes.ok) {
      console.error('[generate-image] Replicate error:', replRes.status, JSON.stringify(replData).slice(0, 300));
      return c.json({ error: `Flux error ${replRes.status}: ${replData?.detail || 'Unknown'}` }, 500);
    }

    let outputUrl: string | null = null;
    if (replData.status === 'succeeded' && replData.output) {
      outputUrl = typeof replData.output === 'string' ? replData.output : Array.isArray(replData.output) ? replData.output[0] : null;
    } else if (replData.id && replData.urls?.get) {
      // Fall back to polling if the wait header didn't deliver in time.
      const pollUrl = replData.urls.get;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await fetch(pollUrl, {
          headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` },
          signal: AbortSignal.timeout(10_000),
        });
        const pollData: any = await poll.json().catch(() => ({}));
        if (pollData.status === 'succeeded') {
          outputUrl = typeof pollData.output === 'string' ? pollData.output : Array.isArray(pollData.output) ? pollData.output[0] : null;
          break;
        }
        if (pollData.status === 'failed' || pollData.status === 'canceled') {
          console.error('[generate-image] Flux failed:', pollData.error);
          return c.json({ error: `Flux falló: ${pollData.error || 'unknown'}` }, 500);
        }
      }
    }

    if (!outputUrl) {
      console.error('[generate-image] Flux no output url');
      return c.json({ error: 'Flux no devolvió imagen a tiempo' }, 500);
    }

    const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgResp.ok) {
      return c.json({ error: 'No se pudo descargar la imagen de Flux' }, 500);
    }
    imageBytes = new Uint8Array(await imgResp.arrayBuffer());

  } else if (engine === 'imagen') {
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
        // Key rule (product realism fix): whether the match is exact or fuzzy,
        // the reference photo is a REAL product from the store's Shopify
        // catalog. Treat it as the product to show in the ad, period. The old
        // 'style reference only — do NOT copy' instruction caused Gemini to
        // invent fake products that looked nothing like the real catalog.
        const titleHint = productRefTitle ? ` (titled "${productRefTitle}")` : '';
        const fuzzyNote = productRefConfidence === 'fuzzy'
          ? ' This is ONE of the brand\'s real products — if the copy mentions a different one, still feature THIS exact product in the scene (we\'d rather show a real item than a hallucinated one).'
          : '';
        roleLines.push(`IMAGE ${idx} = the REAL product${titleHint}. The item in the generated photo MUST be the EXACT product shown — identical shape, colors, packaging, labels, logos, textures, and proportions. Do NOT invent, stylize, redesign, or substitute the product. You may change the scene, lighting, props around it, and framing, but the product itself must be photographically identical to this reference.${fuzzyNote}`);
        idx++;
      }
      if (logoPart) {
        if (isLogoFormat) {
          // Modo variación: el logo ES el subject principal, preservarlo literal.
          roleLines.push(`IMAGE ${idx} = the client's EXACT LOGO. This IS the subject to recreate. Preserve its symbol, icon, and typography CHARACTER BY CHARACTER — do NOT redesign or stylize the mark itself. Only vary the background, padding, or subtle framing as described in the prompt below. The output must be INSTANTLY recognizable as the same logo.`);
        } else {
          roleLines.push(`IMAGE ${idx} = the client's LOGO. STYLE REFERENCE ONLY: match its color palette, mood, polish, and design language in the whole composition (lighting, background, props). Do NOT render the logo itself in the scene unless explicitly requested.`);
        }
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
          fallbackParts.push({
            text: isLogoFormat
              ? `CRITICAL: This is the REAL BRAND LOGO. Preserve its symbol, icon, and typography EXACTLY. Only vary background / framing / subtle styling as described below. Do NOT redesign the logo. Do NOT generate photographic content.\n\n${promptFinal}`
              : `CRITICAL: This is the REAL product photo. The product in the generated image MUST look EXACTLY like this. Place this exact real product into the advertising scene described below.\n\n${promptFinal}`,
          });
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

  // Normalize output to exact PMAX aspect ratio + dimensions (Gemini a menudo genera 1024x1024
  // ignorando el prompt; hacemos center-crop + resize al spec exacto que Google Ads exige).
  imageBytes = await normalizeToPmaxSpec(imageBytes, formato);

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
  const isFlux = engine === 'flux';
  await supabase.from('credit_transactions').insert({
    client_id: clientId,
    accion: isFlux ? 'Generar imagen — Flux Premium' : 'Generar imagen — Gemini',
    creditos_usados: isFlux ? FLUX_CREDIT_COST : IMAGE_CREDIT_COST,
    costo_real_usd: isFlux ? FLUX_USD_COST : 0.02,
  });

  return c.json({ asset_url: publicUrl });
  } catch (err: any) {
    console.error('[generate-image]', err);
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
