/**
 * Steve Mockup Generator — Visual proof for prospects.
 *
 * Uses Gemini 2.5 Flash to generate an ad mockup using the prospect's
 * actual product images and brand colors from investigation_data.
 * Sends the mockup via WhatsApp as a powerful sales tool.
 *
 * Pattern: Same as creative-preview.ts but for prospects (no credits).
 */

import { getSupabaseAdmin } from './supabase.js';
import { sendWhatsAppMedia } from './twilio-client.js';
import type { ProspectRecord } from './steve-wa-brain.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

/**
 * Generate and send a professional ad mockup to a prospect.
 * Fire & forget — called after WA response is sent.
 */
export async function generateProspectMockup(
  prospect: ProspectRecord,
  phone: string,
  profileName: string,
): Promise<void> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.warn('[steve-mockup] GEMINI_API_KEY not configured');
    return;
  }

  const supabase = getSupabaseAdmin();
  const invData = (prospect as any).investigation_data;

  // Need at least product images or audit data
  const productImages = invData?.store?.product_images || [];
  const brandColors = invData?.store?.brand_colors || '';
  const industry = prospect.what_they_sell || 'e-commerce';
  const auditTitle = prospect.audit_data?.title || '';

  // If no product images, try to get one from audit_data URL
  let heroImageUrl: string | null = productImages[0] || null;

  if (!heroImageUrl && prospect.audit_data?.url) {
    // No hero image available — generate without reference photo
    heroImageUrl = null;
  }

  try {
    // Build Gemini prompt
    const colorCtx = brandColors ? `Colores de marca: ${brandColors}.` : '';
    const brandCtx = auditTitle ? `Marca: "${auditTitle}".` : prospect.company ? `Marca: "${prospect.company}".` : '';

    const adPrompt = [
      `Crea un anuncio profesional de Meta Ads (1080x1080, cuadrado) para una marca de ${industry}.`,
      brandCtx,
      colorCtx,
      'Incluir: headline compelling en español, CTA "Comprar ahora", diseño moderno de e-commerce.',
      'Estilo: profesional, limpio, alta conversión, como un anuncio real de Facebook/Instagram.',
      'Tipografía clara, jerarquía visual, contraste alto. NO stock photo genérico.',
      'El anuncio debe parecer hecho por una agencia profesional.',
    ].filter(Boolean).join(' ');

    // Build parts for Gemini
    const parts: Array<Record<string, any>> = [];

    if (heroImageUrl) {
      try {
        const refResp = await fetch(heroImageUrl, { signal: AbortSignal.timeout(10000) });
        if (refResp.ok) {
          const refBuf = await refResp.arrayBuffer();
          const refB64 = Buffer.from(refBuf).toString('base64');
          const mime = refResp.headers.get('content-type') || 'image/jpeg';
          parts.push({ inlineData: { mimeType: mime, data: refB64 } });
          parts.push({ text: `Usa esta imagen de producto como hero del anuncio. Mantén el producto EXACTO. ${adPrompt}` });
        } else {
          parts.push({ text: adPrompt });
        }
      } catch {
        parts.push({ text: adPrompt });
      }
    } else {
      parts.push({ text: adPrompt });
    }

    // Call Gemini
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );

    if (!resp.ok) {
      console.error('[steve-mockup] Gemini error:', resp.status, await resp.text().catch(() => ''));
      return;
    }

    const result: any = await resp.json();
    let imageBytes: Uint8Array | null = null;

    for (const part of (result.candidates?.[0]?.content?.parts || [])) {
      if (part.inlineData?.data) {
        imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
        break;
      }
    }

    if (!imageBytes) {
      console.error('[steve-mockup] No image data from Gemini');
      return;
    }

    // Upload to Supabase Storage
    const ts = Date.now();
    const path = `sales-assets/prospect-mockups/${prospect.id}/${ts}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('client-assets')
      .upload(path, imageBytes, { contentType: 'image/png', upsert: false });

    if (uploadErr) {
      console.error('[steve-mockup] Upload error:', uploadErr);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(path);

    // Send via WhatsApp
    const mockupMsg = 'Te armé un ejemplo de cómo se vería un anuncio para tu marca. Solo para que veas el potencial 👀';
    await sendWhatsAppMedia(`+${phone}`, mockupMsg, publicUrl);

    // Save message
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: mockupMsg,
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // Mark mockup as sent
    await supabase
      .from('wa_prospects')
      .update({
        mockup_sent: true,
        mockup_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospect.id);

    console.log(`[steve-mockup] Mockup sent to ${phone}: ${publicUrl}`);
  } catch (err) {
    console.error('[steve-mockup] Error:', err);
  }
}
