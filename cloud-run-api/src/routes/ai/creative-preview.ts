import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const PREVIEW_CREDIT_COST = 1;

/** Aspect-ratio / size mappings per engine */
const FORMAT_CONFIG: Record<string, { geminiHint: string }> = {
  feed: { geminiHint: '1:1 square (1080×1080)' },
  story: { geminiHint: '9:16 vertical (1080×1920)' },
  landscape: { geminiHint: '16:9 horizontal (1920×1080)' },
};

/**
 * POST /api/creative-preview
 *
 * Generates an ad-preview image from copy text.
 * Body: { clientId, copyText, formato?, engine?, brandName?, brandColors? }
 * Returns: { preview_url }
 */
export async function creativePreview(c: Context) {
  const supabase = getSupabaseAdmin();
  let creditsDeducted = false;
  let clientId: string | undefined;

  const refundCredits = async () => {
    if (!creditsDeducted || !clientId) return;
    await supabase.rpc('deduct_credits', { p_client_id: clientId, p_amount: -PREVIEW_CREDIT_COST })
      .then(({ error }) => { if (error) console.error('[creative-preview] refund failed:', error); });
  };

  try {
    const body = await c.req.json();
    clientId = body.clientId;
    const {
      copyText,
      formato = 'feed',
      engine = 'imagen',
      brandName,
      brandColors,
    } = body;

    // Auth check
    const user = c.get('user');
    if (!user || !clientId) return c.json({ error: 'Missing authentication or clientId' }, 401);
    if (!copyText) return c.json({ error: 'copyText is required' }, 400);

    const ownerCheck = await safeQuerySingleOrDefault<{ id: string }>(
      supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
        .maybeSingle(),
      null,
      'creative-preview.ownerCheck',
    );
    if (!ownerCheck) return c.json({ error: 'No tienes acceso a este cliente' }, 403);

    // Deduct credits
    const { data: deductResult, error: deductError } = await supabase
      .rpc('deduct_credits', { p_client_id: clientId, p_amount: PREVIEW_CREDIT_COST });
    if (deductError) {
      return c.json({ error: 'NO_CREDIT_RECORD', message: 'No se encontró registro de créditos.' }, 402);
    }
    if (!deductResult?.[0]?.success) {
      return c.json({ error: 'NO_CREDITS', message: `Se necesita ${PREVIEW_CREDIT_COST} crédito para generar preview` }, 402);
    }
    creditsDeducted = true;

    // Try to find a product photo matching the copy
    let productPhotoUrl: string | null = null;
    const shopifyProducts = await safeQueryOrDefault<{ image_url: string | null; title: string | null }>(
      supabase
        .from('shopify_products')
        .select('image_url, title')
        .eq('client_id', clientId)
        .not('image_url', 'is', null)
        .limit(50),
      [],
      'creative-preview.fetchShopifyProducts',
    );

    if (shopifyProducts && shopifyProducts.length > 0) {
      const copyLower = copyText.toLowerCase();
      let bestMatch: { url: string; score: number } | null = null;
      for (const p of shopifyProducts) {
        if (!p.image_url || !p.title) continue;
        const words = p.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        const hits = words.filter((w: string) => copyLower.includes(w));
        const score = hits.length / Math.max(words.length, 1);
        if (hits.length >= 1 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { url: p.image_url, score };
        }
      }
      if (bestMatch && bestMatch.score >= 0.3) {
        productPhotoUrl = bestMatch.url;
      }
    }

    // Fallback to brand assets
    if (!productPhotoUrl) {
      const assets = await safeQueryOrDefault<{ asset_url: string | null }>(
        supabase
          .from('ad_assets')
          .select('asset_url')
          .eq('client_id', clientId)
          .eq('tipo', 'imagen')
          .order('created_at', { ascending: false })
          .limit(1),
        [],
        'creative-preview.fetchAssets',
      );
      if (assets?.[0]?.asset_url) productPhotoUrl = assets[0].asset_url;
    }

    const fmt = FORMAT_CONFIG[formato] || FORMAT_CONFIG.feed;
    const brandCtx = brandName ? `Brand: "${brandName}".` : '';
    const colorCtx = brandColors ? `Brand colors: ${brandColors}.` : '';

    const adPrompt = [
      `Create a professional advertising creative preview for social media (${fmt.geminiHint}).`,
      `The ad must prominently display this copy text as readable overlay text: "${copyText}".`,
      brandCtx,
      colorCtx,
      'Style: modern, clean, commercial ad layout with clear visual hierarchy.',
      'The copy text must be legible, well-positioned, and styled as a real ad headline/body.',
      'Include a subtle call-to-action button area at the bottom.',
      'Professional typography, balanced whitespace, high-contrast text over the background.',
      'This should look like a real Meta/Instagram/Facebook ad, not a stock photo.',
    ].filter(Boolean).join(' ');

    let imageBytes: Uint8Array | null = null;

    {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) { await refundCredits(); return c.json({ error: 'GEMINI_API_KEY not configured' }, 500); }

      const parts: Array<Record<string, any>> = [];

      if (productPhotoUrl) {
        try {
          const refResp = await fetch(productPhotoUrl);
          if (refResp.ok) {
            const refBuf = await refResp.arrayBuffer();
            const refB64 = Buffer.from(refBuf).toString('base64');
            const mime = refResp.headers.get('content-type') || 'image/jpeg';
            parts.push({ inlineData: { mimeType: mime, data: refB64 } });
            parts.push({ text: `Use this product photo as the hero image in the ad layout. Keep the product appearance EXACTLY as shown. ${adPrompt}` });
          } else {
            parts.push({ text: adPrompt });
          }
        } catch { parts.push({ text: adPrompt }); }
      } else {
        parts.push({ text: adPrompt });
      }

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        }
      );

      if (!resp.ok) {
        console.error('[creative-preview] Gemini error:', resp.status, await resp.text());
        await refundCredits();
        return c.json({ error: 'Error generando preview. Intenta de nuevo.' }, 500);
      }

      const result: any = await resp.json();
      for (const part of (result.candidates?.[0]?.content?.parts || [])) {
        if (part.inlineData?.data) {
          imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
          break;
        }
      }
    }

    if (!imageBytes) {
      console.error('[creative-preview] No image data');
      await refundCredits();
      return c.json({ error: 'Error generando preview.' }, 500);
    }

    // Upload to storage
    const ts = Date.now();
    const path = `assets/${clientId}/previews/${ts}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('client-assets')
      .upload(path, imageBytes, { contentType: 'image/png', upsert: false });

    if (uploadErr) {
      console.error('[creative-preview] Upload error:', uploadErr);
      await refundCredits();
      return c.json({ error: 'Error guardando preview.' }, 500);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(path);

    // Log transaction
    const engineLabel = 'Gemini Flash';
    await supabase.from('credit_transactions').insert({
      client_id: clientId,
      accion: `Preview creativo — ${engineLabel}`,
      creditos_usados: PREVIEW_CREDIT_COST,
      costo_real_usd: 0.02,
    });

    return c.json({ preview_url: publicUrl });

  } catch (err: any) {
    console.error('[creative-preview]', err);
    await refundCredits();
    return c.json({ error: 'Error interno del servidor' }, 500);
  }
}
