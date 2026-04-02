/**
 * Steve Sales Deck — Auto-generates personalized commercial presentation for prospects.
 *
 * Flow:
 * 1. Gather prospect data (industry, pains, store data, revenue)
 * 2. Claude Sonnet generates personalized slide content
 * 3. Gemini generates a visual deck image
 * 4. Upload to Supabase Storage
 * 5. Send via WhatsApp with sendWhatsAppMedia
 *
 * Triggered when prospect reaches pitching stage (score 50-74)
 * with at least what_they_sell + 1 pain_point, and deck_sent === false.
 */

import { getSupabaseAdmin } from './supabase.js';
import { sendWhatsApp, sendWhatsAppMedia } from './twilio-client.js';
import { enqueueWAAction } from './wa-task-queue.js';
import type { ProspectRecord } from './steve-wa-brain.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

/**
 * Generate and send a personalized sales deck to a prospect.
 * Returns true if deck was sent successfully, false otherwise.
 */
export async function generateAndSendSalesDeck(
  prospect: ProspectRecord,
  phone: string,
  profileName?: string | null,
): Promise<boolean> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const supabase = getSupabaseAdmin();

  if (!ANTHROPIC_API_KEY) {
    console.warn('[steve-sales-deck] Missing ANTHROPIC_API_KEY');
    return false;
  }
  if (!GEMINI_API_KEY) {
    console.warn('[steve-sales-deck] Missing GEMINI_API_KEY — will use text-only deck');
  }

  if (!prospect.id) return false;

  try {
    // 1. Gather prospect data
    const { data: fresh } = await supabase
      .from('wa_prospects')
      .select('investigation_data, audit_data, deck_sent')
      .eq('id', prospect.id)
      .maybeSingle();

    // Don't send again if already sent
    if (fresh?.deck_sent) {
      console.log(`[steve-sales-deck] Deck already sent for ${phone}`);
      return false;
    }

    const inv = fresh?.investigation_data;
    const companyName = prospect.company || prospect.name || profileName || 'tu marca';
    const industry = prospect.what_they_sell || inv?.detected_industry || 'e-commerce';
    const pains = prospect.pain_points?.join(', ') || 'hacer crecer sus ventas online';
    const revenue = prospect.monthly_revenue || 'no compartido';
    const currentMarketing = prospect.current_marketing || 'no especificado';
    const platform = prospect.store_platform || '';

    // Store data for personalizing
    let storeContext = '';
    if (inv?.store) {
      const products = (inv.store.top_products || []).slice(0, 3).map((p: any) =>
        typeof p === 'string' ? p : `${p.name}${p.price ? ` (${p.price})` : ''}`
      ).join(', ');
      if (products) storeContext += `Productos: ${products}. `;
      if (inv.store.price_range) storeContext += `Rango precios: ${inv.store.price_range}. `;
      if (inv.store.category_summary) storeContext += `Tipo: ${inv.store.category_summary}. `;
    }

    // 2. Generate personalized deck content with Sonnet
    const deckPrompt = `Genera el contenido para una presentación comercial personalizada de Steve (plataforma de marketing AI para e-commerce).

DATOS DEL PROSPECTO:
- Empresa/Nombre: ${companyName}
- Industria: ${industry}
- Dolores: ${pains}
- Facturación: ${revenue}
- Marketing actual: ${currentMarketing}
- Plataforma: ${platform}
- Datos tienda: ${storeContext || 'no disponibles'}

Genera EXACTAMENTE 6 slides en JSON. Cada slide tiene "title" y "body" (máximo 3 bullets por slide, máximo 15 palabras por bullet).

{
  "slides": [
    { "title": "Para ${companyName} — cómo vender más en ${industry}", "body": ["bullet de contexto personalizado"] },
    { "title": "Tu situación hoy", "body": ["dolor 1 real del prospecto", "dolor 2", "oportunidad que no está aprovechando"] },
    { "title": "Qué hace Steve por ti", "body": ["feature relevante a SU caso", "feature 2", "feature 3"] },
    { "title": "Resultados de marcas similares", "body": ["caso 1 de su industria", "métrica real o estimada"] },
    { "title": "Planes Steve (50% OFF lanzamiento)", "body": ["Visual: $49.990/mes → $24.995/mes — ve tus datos", "Estrategia: $99.990/mes → $49.995/mes — ve + IA + análisis", "Full: $199.990/mes → $99.995/mes — ve + IA + crea + ejecuta"] },
    { "title": "Siguiente paso", "body": ["Agenda una reunión de 15 min", "Te mostramos Steve con TUS datos", "meetings.hubspot.com/jose-manuel15"] }
  ]
}

IMPORTANTE: Personaliza TODO con datos reales del prospecto. No seas genérico. Responde SOLO con el JSON.`;

    const deckResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: deckPrompt }],
      }),
    });

    if (!deckResponse.ok) {
      console.error('[steve-sales-deck] Sonnet API error:', deckResponse.status);
      return false;
    }

    const deckData: any = await deckResponse.json();
    const deckText = (deckData.content?.[0]?.text || '').trim();
    const jsonStr = deckText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

    let slides: Array<{ title: string; body: string[] }>;
    try {
      const parsed = JSON.parse(jsonStr);
      slides = parsed.slides || [];
    } catch {
      console.error('[steve-sales-deck] Failed to parse deck JSON');
      return false;
    }

    if (slides.length === 0) return false;

    // 3. Generate deck image with Gemini (or fallback to text if no key)
    if (!GEMINI_API_KEY) {
      return await sendTextDeck(phone, slides, companyName, industry, profileName);
    }

    const slideText = slides.map((s, i) =>
      `Slide ${i + 1}: "${s.title}"\n${s.body.map(b => `• ${b}`).join('\n')}`
    ).join('\n\n');

    const imagePrompt = `Create a professional sales deck summary image (16:9 landscape, 1920x1080).

Design: Modern, dark theme with purple/violet accents (#7C3AED). Clean corporate style.
Logo text "STEVE" at top-left in bold white.

Layout: Show these 6 slides in a 3x2 grid overview, each with its title and key bullets visible:

${slideText}

Style: Professional SaaS pitch deck. Each slide tile should have a subtle icon or visual element.
Typography: Clean sans-serif, high contrast. The text must be READABLE.
This should look like a screenshot of a real pitch deck overview.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );

    if (!geminiRes.ok) {
      console.error('[steve-sales-deck] Gemini error:', geminiRes.status);
      // Fallback: send text-only deck
      return await sendTextDeck(phone, slides, companyName, industry, profileName);
    }

    const geminiData: any = await geminiRes.json();
    let imageBytes: Uint8Array | null = null;
    for (const part of (geminiData.candidates?.[0]?.content?.parts || [])) {
      if (part.inlineData?.data) {
        imageBytes = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
        break;
      }
    }

    if (!imageBytes) {
      console.error('[steve-sales-deck] No image data from Gemini');
      return await sendTextDeck(phone, slides, companyName, industry, profileName);
    }

    // 4. Upload to Supabase Storage
    const ts = Date.now();
    const path = `sales-assets/decks/${prospect.id}_${ts}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('client-assets')
      .upload(path, imageBytes, { contentType: 'image/png', upsert: false });

    if (uploadErr) {
      console.error('[steve-sales-deck] Upload error:', uploadErr);
      return await sendTextDeck(phone, slides, companyName, industry, profileName);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('client-assets')
      .getPublicUrl(path);

    // 5. Send via WhatsApp
    const deckMsg = `Te armé un resumen de cómo Steve puede ayudar a ${companyName} en ${industry}. Échale un ojo 👆`;
    await sendWhatsAppMedia(`+${phone}`, deckMsg, publicUrl);

    // Save outbound message
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: deckMsg,
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // Send demo video if configured (via persistent task queue)
    const DEMO_VIDEO_URL = process.env.STEVE_DEMO_VIDEO_URL;
    if (DEMO_VIDEO_URL) {
      enqueueWAAction(phone, 'send_video_demo', {
        profileName: profileName || phone,
      }, 3).catch(err => console.error('[steve-sales-deck] Video enqueue error:', err));
    }

    // 6. Mark deck as sent
    await supabase
      .from('wa_prospects')
      .update({ deck_sent: true, updated_at: new Date().toISOString() })
      .eq('id', prospect.id);

    console.log(`[steve-sales-deck] Deck sent to ${phone} (image: ${publicUrl})`);
    return true;
  } catch (err) {
    console.error('[steve-sales-deck] Fatal error:', err);
    return false;
  }
}

/**
 * Fallback: send deck as text messages if image generation fails.
 */
async function sendTextDeck(
  phone: string,
  slides: Array<{ title: string; body: string[] }>,
  companyName: string,
  industry: string,
  profileName?: string | null,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  try {
    // Format as a clean text message
    const textDeck = slides.map(s =>
      `*${s.title}*\n${s.body.map(b => `• ${b}`).join('\n')}`
    ).join('\n\n');

    const msg = `📊 *Propuesta para ${companyName}*\n\n${textDeck}`;

    // Split if too long (WA limit 4096)
    if (msg.length <= 1500) {
      await sendWhatsApp(`+${phone}`, msg);
    } else {
      const mid = Math.ceil(slides.length / 2);
      const part1 = slides.slice(0, mid).map(s =>
        `*${s.title}*\n${s.body.map(b => `• ${b}`).join('\n')}`
      ).join('\n\n');
      const part2 = slides.slice(mid).map(s =>
        `*${s.title}*\n${s.body.map(b => `• ${b}`).join('\n')}`
      ).join('\n\n');

      await sendWhatsApp(`+${phone}`, `📊 *Propuesta para ${companyName}*\n\n${part1}`);
      await new Promise(r => setTimeout(r, 1500));
      await sendWhatsApp(`+${phone}`, part2);
    }

    // Save outbound
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: msg.slice(0, 500),
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // Mark as sent
    await supabase
      .from('wa_prospects')
      .update({ deck_sent: true, updated_at: new Date().toISOString() })
      .eq('phone', phone); // fallback by phone number

    return true;
  } catch (err) {
    console.error('[steve-sales-deck] Text fallback error:', err);
    return false;
  }
}
