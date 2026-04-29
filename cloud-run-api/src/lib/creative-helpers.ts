/**
 * Creative helpers — funciones puras para que strategy-chat (Michael W25)
 * arme creativos Meta de los 5 tipos: image, video, dct, carousel, dpa.
 *
 * Generación de assets: imagen vía Gemini 2.5 Flash Image (mismo pattern que
 * /api/generate-image). Video se delega al cliente (upload manual) porque
 * generación tarda 60-90s y excede el agentic loop budget.
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────
// FORMATO RECOMENDADO — lógica de decisión
// ─────────────────────────────────────────────────────────────────

export type CreativeFormat = 'image' | 'video' | 'dct' | 'carousel' | 'catalog';

export interface RecommendInput {
  objective?: string;                        // CONVERSIONS / TRAFFIC / AWARENESS / ENGAGEMENT / CATALOG
  budget_clp?: number;                       // total CLP en el período
  days?: number;                             // duración campaña
  audience_size_estimate?: number;           // tamaño audiencia estimado
  pixel_health?: 'healthy' | 'broken' | 'unknown';
  active_products_count?: number;            // del shopify_products
  has_winning_creative?: boolean;            // creative_history con score > 70
  brand_storytelling_strong?: boolean;       // brief con énfasis en proceso/marca
  funnel_stage?: 'cold' | 'warm' | 'hot';
}

export interface FormatRecommendation {
  primary: CreativeFormat;
  reason: string;
  alternatives: Array<{ format: CreativeFormat; when: string }>;
}

export function recommendCreativeFormat(input: RecommendInput): FormatRecommendation {
  const {
    objective = 'CONVERSIONS',
    budget_clp = 0,
    days = 7,
    audience_size_estimate = 0,
    pixel_health = 'unknown',
    active_products_count = 0,
    has_winning_creative = false,
    brand_storytelling_strong = false,
    funnel_stage = 'cold',
  } = input;

  // CATALOG → DPA (e-commerce con catálogo grande)
  if (objective === 'CATALOG' && active_products_count >= 8) {
    return {
      primary: 'catalog',
      reason: `Tu objetivo es CATALOG y tenés ${active_products_count} productos activos en Shopify. DPA (Dynamic Product Ads) deja que Meta muestre el producto correcto a cada usuario según su comportamiento — más eficiente que crear ads producto por producto.`,
      alternatives: [
        { format: 'carousel', when: 'Si querés controlar exactamente qué productos aparecen y en qué orden' },
        { format: 'dct', when: 'Si querés probar variantes de copy sobre los mismos productos' },
      ],
    };
  }

  // DCT → audiencia fría grande con pixel sano y sin ganador claro
  if (
    funnel_stage === 'cold' &&
    audience_size_estimate >= 50_000 &&
    pixel_health !== 'broken' &&
    !has_winning_creative &&
    budget_clp >= 200_000
  ) {
    return {
      primary: 'dct',
      reason: `Audiencia fría grande (${(audience_size_estimate / 1000).toFixed(0)}K), pixel funcionando y sin un ganador histórico claro. DCT (Dynamic Creative Testing) arma N variantes y deja que Meta encuentre la combinación ganadora — es A/B testing automático, ideal para descubrir qué funciona antes de escalar.`,
      alternatives: [
        { format: 'image', when: 'Si querés ir conservador con un solo creativo seguro' },
        { format: 'video', when: 'Si tu producto requiere demostración y tenés budget para video' },
      ],
    };
  }

  // VIDEO → awareness/engagement con storytelling fuerte
  if (
    (objective === 'AWARENESS' || objective === 'ENGAGEMENT') &&
    brand_storytelling_strong &&
    budget_clp >= 300_000
  ) {
    return {
      primary: 'video',
      reason: `Tu objetivo es ${objective} y tenés storytelling fuerte (proceso, artesanía, marca). Video conecta emocionalmente mejor que imagen estática para awareness/engagement. Necesitás tener el video grabado — no lo generamos automáticamente.`,
      alternatives: [
        { format: 'dct', when: 'Si todavía no tenés video, podés probar imagen + DCT para validar ángulos' },
        { format: 'image', when: 'Si querés algo más rápido y económico' },
      ],
    };
  }

  // CARROUSEL → múltiples productos para selección visual (audiencia tibia)
  if (active_products_count >= 5 && (funnel_stage === 'warm' || funnel_stage === 'hot')) {
    return {
      primary: 'carousel',
      reason: `Tenés ${active_products_count} productos activos y audiencia tibia/caliente. Carrusel deja que el usuario explore varias opciones en un solo ad — ideal para retargeting visual donde ya saben quién sos.`,
      alternatives: [
        { format: 'catalog', when: 'Si querés que Meta elija el producto automáticamente por usuario' },
        { format: 'image', when: 'Si querés enfocar en un solo producto estrella' },
      ],
    };
  }

  // IMAGE → default, conservador, simple
  return {
    primary: 'image',
    reason: `Imagen estática es la opción más simple y rápida. Funciona bien para budget chico (<$300K), un solo producto destacado, o cuando ya tenés un ganador claro. ${has_winning_creative ? 'Reusamos tu creativo histórico ganador.' : 'Generamos uno nuevo o usás uno tuyo.'}`,
    alternatives: [
      { format: 'dct', when: 'Si querés probar varias variantes a la vez' },
      { format: 'video', when: 'Si tenés video grabado y budget para storytelling' },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────
// GENERACIÓN DE IMAGEN — Gemini 2.5 Flash Image
// ─────────────────────────────────────────────────────────────────

const GEMINI_IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

export async function generateImageViaGemini(
  prompt: string,
  supabase: SupabaseClient,
  clientId: string,
  variantSuffix: string = 'v1',
): Promise<{ ok: true; url: string; storage_path: string } | { ok: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: 'GEMINI_API_KEY missing' };

  try {
    const res = await fetch(`${GEMINI_IMAGE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `Gemini ${res.status}: ${errText.slice(0, 150)}` };
    }
    const json: any = await res.json();
    const parts = json.candidates?.[0]?.content?.parts || [];
    let bytes: Uint8Array | null = null;
    for (const p of parts) {
      if (p.inlineData?.data) {
        bytes = new Uint8Array(Buffer.from(p.inlineData.data, 'base64'));
        break;
      }
    }
    if (!bytes) return { ok: false, error: 'No image bytes in Gemini response' };

    const ts = Date.now();
    const storagePath = `creative-drafts/${clientId}/${ts}_${variantSuffix}.png`;
    const { error: upErr } = await supabase.storage
      .from('ad-references')
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

    const { data: { publicUrl } } = supabase.storage.from('ad-references').getPublicUrl(storagePath);
    return { ok: true, url: publicUrl, storage_path: storagePath };
  } catch (e: any) {
    return { ok: false, error: e?.message?.slice(0, 200) || 'fetch exception' };
  }
}

// ─────────────────────────────────────────────────────────────────
// GENERACIÓN DE COPY VARIANTS — Anthropic Sonnet
// ─────────────────────────────────────────────────────────────────

export async function generateCopyVariants(
  brief: string,
  count: number = 3,
): Promise<Array<{ headline: string; body: string }>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `Eres un copywriter de performance marketing. Generás variantes de copy para ads de Meta. Devolvés SOLO un JSON válido con la forma {"variants": [{"headline": "máx 40 chars", "body": "máx 125 chars"}]}. Nada más. Sin markdown, sin explicaciones.`,
        messages: [{
          role: 'user',
          content: `Generá ${count} variantes distintas de headline + body para este brief:\n\n${brief}\n\nCada variante debe tener un ángulo diferente (ej. una con escasez, una con beneficio, una con prueba social).`,
        }],
      }),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const text = (json.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    return Array.isArray(parsed.variants) ? parsed.variants.slice(0, count) : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// SHAPE BUILDERS — convierten formato a la spec Meta correcta
// ─────────────────────────────────────────────────────────────────

export function buildImageCreativeSpec(args: {
  headline: string;
  body: string;
  cta?: string;
  destination_url: string;
  image_url: string;
}): any {
  return {
    type: 'image',
    headline: args.headline,
    body: args.body,
    cta: args.cta || 'SHOP_NOW',
    destination_url: args.destination_url,
    image_url: args.image_url,
  };
}

export function buildVideoCreativeSpec(args: {
  headline: string;
  body: string;
  cta?: string;
  destination_url: string;
  video_url: string;
  thumbnail_url?: string;
}): any {
  return {
    type: 'video',
    headline: args.headline,
    body: args.body,
    cta: args.cta || 'SHOP_NOW',
    destination_url: args.destination_url,
    video_url: args.video_url,
    thumbnail_url: args.thumbnail_url || null,
  };
}

export function buildDctCreativeSpec(args: {
  destination_url: string;
  cta?: string;
  images: string[];           // URLs (3-5 ideal)
  headlines: string[];        // 3-5
  bodies: string[];           // 3-5
}): any {
  return {
    type: 'dct',
    destination_url: args.destination_url,
    cta: args.cta || 'SHOP_NOW',
    asset_feed_spec: {
      images: args.images.map(url => ({ url })),
      titles: args.headlines.map(text => ({ text })),
      bodies: args.bodies.map(text => ({ text })),
      link_urls: [{ website_url: args.destination_url }],
      call_to_action_types: [args.cta || 'SHOP_NOW'],
    },
    primary_count: {
      images: args.images.length,
      headlines: args.headlines.length,
      bodies: args.bodies.length,
      total_combinations: args.images.length * args.headlines.length * args.bodies.length,
    },
  };
}

export interface CarouselCard {
  title: string;
  description?: string;
  image_url: string;
  link: string;
}

export function buildCarouselCreativeSpec(args: {
  cards: CarouselCard[];
  primary_text?: string;
  cta?: string;
}): any {
  return {
    type: 'carousel',
    primary_text: args.primary_text || '',
    cta: args.cta || 'SHOP_NOW',
    cards: args.cards.slice(0, 10), // Meta max 10 cards
    card_count: Math.min(args.cards.length, 10),
  };
}

export function buildCatalogDpaSpec(args: {
  product_catalog_id: string;
  product_set_id?: string;
  primary_text?: string;
  cta?: string;
}): any {
  return {
    type: 'catalog',
    product_catalog_id: args.product_catalog_id,
    product_set_id: args.product_set_id || null,
    primary_text: args.primary_text || '',
    cta: args.cta || 'SHOP_NOW',
  };
}
