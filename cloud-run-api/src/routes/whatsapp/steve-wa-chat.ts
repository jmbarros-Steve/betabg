import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { handleChinoWhatsApp } from '../../chino/whatsapp.js';
import {
  WA_SYSTEM_PROMPT,
  buildWAContext,
  getWAHistory,
  getProspectHistory,
  loadRelevantKnowledge,
  buildDynamicSalesPrompt,
  buildEnrichedProspectContext,
  extractProspectInfo,
  consolidatePainPoints,
  calculateLeadScore,
  generateConversationSummary,
  pushToHubSpot,
  detectDisqualification,
  detectBuyingSignals,
  loadIndustryCaseStudy,
  quickFirstMessageIntel,
  updateRollingConversationSummary,
  detectMeetingConfirmation,
  parseMeetingTime,
  type ProspectRecord,
  type DynamicPromptResult,
} from '../../lib/steve-wa-brain.js';
import { sendWhatsApp, sendWhatsAppMedia } from '../../lib/twilio-client.js';
import { type CaseStudyResult } from '../../lib/steve-wa-brain.js';
import { runInvestigator, runStrategist, runConversationalist } from '../../lib/steve-multi-brain.js';
import { investigateProspectBackground } from '../../lib/steve-investigator.js';
import { generateProspectMockup } from '../../lib/steve-mockup-generator.js';
import { generateAndSendSalesDeck } from '../../lib/steve-sales-deck.js';
import { enqueueWAAction } from '../../lib/wa-task-queue.js';
import { scrubPII } from '../../lib/pii-scrubber.js';
import { isSupportedAudio, transcribeAudio } from '../../lib/audio-transcriber.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

// Supported image types for vision
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * Download image from Twilio and return base64 + media type for Claude vision.
 * Returns null if download fails or image is too large (>5MB).
 */
async function downloadImageForVision(
  mediaUrl: string,
  contentType: string,
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID || '';
    const twilioToken = process.env.TWILIO_AUTH_TOKEN || '';
    const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');

    const res = await fetch(mediaUrl, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      console.error(`[image-vision] Failed to download: ${res.status}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    // Skip images > 5MB (Claude limit is ~20MB but keep it reasonable for latency)
    if (buffer.length > 5 * 1024 * 1024) {
      console.warn('[image-vision] Image too large (>5MB), skipping');
      return null;
    }

    const base64 = buffer.toString('base64');
    // Normalize media type for Claude
    const mediaType = SUPPORTED_IMAGE_TYPES.includes(contentType) ? contentType : 'image/jpeg';
    console.log(`[image-vision] Downloaded ${buffer.length} bytes (${mediaType})`);
    return { base64, mediaType };
  } catch (err: any) {
    console.error('[image-vision] Error:', err.message);
    return null;
  }
}

// URL regex: catches https://..., http://..., www.xxx.xx, and bare domain.tld
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9]*\.[a-z]{2,}(?:\.[a-z]{2,})?(?:\/[^\s]*)?/i;

/**
 * Quick scrape — fetch homepage HTML and extract basic info for Claude context.
 * Timeout: 3s. Returns null on failure. NOT a deep audit, just basic page data.
 */
async function quickScrapeUrl(rawUrl: string): Promise<string | null> {
  try {
    let url = rawUrl.trim();
    if (!url.match(/^https?:\/\//i)) url = 'https://' + url;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SteveBot/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    const parts: string[] = [];

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) parts.push(`Título: ${titleMatch[1].trim()}`);

    // Meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (metaDescMatch) parts.push(`Descripción: ${metaDescMatch[1].trim()}`);

    // H1s and H2s (strip HTML tags inside)
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => stripTags(m[1])).filter(Boolean).slice(0, 5);
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => stripTags(m[1])).filter(Boolean).slice(0, 10);
    if (h1s.length) parts.push(`H1: ${h1s.join(' | ')}`);
    if (h2s.length) parts.push(`Secciones: ${h2s.join(' | ')}`);

    // Shopify product titles
    const productTitles = [...html.matchAll(/class="[^"]*product[_-]?(?:title|name|card__heading)[^"]*"[^>]*>([\s\S]*?)<\//gi)]
      .map(m => stripTags(m[1])).filter(Boolean).slice(0, 15);
    if (productTitles.length) parts.push(`Productos: ${productTitles.join(', ')}`);

    // JSON-LD structured data
    const jsonLds = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const jm of jsonLds.slice(0, 3)) {
      try {
        const data = JSON.parse(jm[1]);
        if (data['@type'] === 'Organization' || data['@type'] === 'WebSite') {
          parts.push(`Organización: ${data.name || ''} — ${data.description || ''}`);
        }
        if (data['@type'] === 'Product' || data['@type'] === 'ItemList') {
          const items = data.itemListElement || [data];
          for (const item of items.slice(0, 10)) {
            const name = item.name || item.item?.name;
            const price = item.offers?.price || item.item?.offers?.price || '';
            if (name) parts.push(`Producto: ${name}${price ? ` — $${price}` : ''}`);
          }
        }
      } catch {}
    }

    // OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitle && !titleMatch) parts.push(`Título: ${ogTitle[1].trim()}`);
    if (ogDesc && !metaDescMatch) parts.push(`Descripción: ${ogDesc[1].trim()}`);

    if (parts.length === 0) return null;
    return parts.join('\n').slice(0, 2000);
  } catch (err: any) {
    console.warn(`[quick-scrape] Error fetching ${rawUrl}: ${err.message}`);
    return null;
  }
}

// Rate limiting: track last response time per phone (in-memory + DB fallback)
const lastResponseTime = new Map<string, number>();
const RATE_LIMIT_MS = 5_000; // 5 seconds

// Stage order for "only advance, never go back" rule
const STAGE_ORDER: Record<string, number> = {
  new: 0,
  discovery: 1,
  qualifying: 2,
  pitching: 3,
  closing: 4,
  converted: 5,
  lost: 6,
};

/**
 * Steve WA Chat — Webhook handler for merchant → Steve WhatsApp messages.
 *
 * Twilio sends a POST with form data when a message arrives at Steve's number.
 * We identify the merchant by phone, load their business context,
 * call Claude for a short WA-style response, and reply via Twilio.
 *
 * Route: POST /api/whatsapp/steve-wa-chat
 * Auth: Twilio signature validation (no JWT — this is a webhook)
 */
export async function steveWAChat(c: Context) {
  const supabase = getSupabaseAdmin();

  try {
    // Parse Twilio webhook payload (application/x-www-form-urlencoded)
    const body = await c.req.parseBody();
    const from = String(body['From'] || '');           // whatsapp:+56987654321
    let messageBody = String(body['Body'] || '');
    const profileName = String(body['ProfileName'] || '');
    const messageSid = String(body['MessageSid'] || '');
    const numMedia = parseInt(String(body['NumMedia'] || '0'), 10);

    // Media handling: audio transcription, image vision, or fallback
    let imageData: { base64: string; mediaType: string } | null = null;
    if (numMedia > 0) {
      const mediaType = String(body['MediaContentType0'] || '');
      const mediaUrl = String(body['MediaUrl0'] || '');
      if (mediaUrl && isSupportedAudio(mediaType)) {
        const transcription = await transcribeAudio(mediaUrl, mediaType);
        if (transcription) {
          messageBody = messageBody
            ? `${messageBody}\n\n[Audio transcrito]: ${transcription}`
            : transcription;
          console.log(`[steve-wa-chat] Audio transcribed for ${from}: ${transcription.slice(0, 100)}...`);
        } else if (!messageBody) {
          messageBody = '[El usuario envió un audio que no pude transcribir]';
        }
      } else if (mediaUrl && mediaType && SUPPORTED_IMAGE_TYPES.some(t => mediaType.startsWith(t))) {
        // Image: download for Claude vision
        imageData = await downloadImageForVision(mediaUrl, mediaType);
        if (!imageData && !messageBody) {
          messageBody = '[El usuario envió una imagen que no pude descargar]';
        } else if (!messageBody) {
          messageBody = '[El usuario envió una imagen]';
        }
      } else if (!messageBody) {
        messageBody = `[SISTEMA: El usuario envió un archivo (${mediaType || 'desconocido'}) que NO puedes ver. Dile que por WhatsApp no puedes abrir archivos, pero en la reunión de demo lo revisan juntos.]`;
      }
    }

    if (!from || !messageBody) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // PII scrubbing: strip sensitive data before any processing/storage
    const { scrubbed: scrubbedBody, hadPII } = scrubPII(messageBody);
    if (hadPII) {
      console.log(`[steve-wa-chat] PII detected and scrubbed from ${from}`);
    }
    // Use scrubbed version for storage, original for detecting PII warning
    const storageBody = scrubbedBody;
    // Keep original for AI processing (AI should see context to warn user)
    // but messageBody for DB storage is always scrubbed

    // Extract clean phone number
    const phone = from.replace('whatsapp:', '').replace('+', '').trim();

    // ─── El Chino routing: if JM sends a command, handle it here ────
    const jmPhone = (process.env.JOSE_WHATSAPP_NUMBER || process.env.JM_PHONE || '').replace('+', '');
    if (jmPhone && phone === jmPhone) {
      const chinoResult = await handleChinoWhatsApp(messageBody);
      if (chinoResult) {
        const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return c.text(`<Response><Message>${escXml(chinoResult)}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
      }
      // Not a Chino command — JM falls through to normal merchant flow
    }

    // Identify merchant by whatsapp_phone (with and without + prefix)
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, company, whatsapp_phone')
      .or(`whatsapp_phone.eq.${phone},whatsapp_phone.eq.+${phone},whatsapp_phone.eq.+56${phone.replace(/^56/, '')}`)
      .limit(1)
      .maybeSingle();

    if (!client) {
      // Unknown number — AI sales funnel for prospects
      return handleProspect(c, supabase, phone, messageBody, profileName, messageSid, storageBody, hadPII, imageData);
    }

    // Save inbound message (PII scrubbed)
    await supabase.from('wa_messages').insert({
      client_id: client.id,
      channel: 'steve_chat',
      direction: 'inbound',
      from_number: phone,
      to_number: STEVE_WA_NUMBER,
      body: storageBody,
      message_sid: messageSid,
      contact_name: profileName || client.name,
      contact_phone: phone,
    });

    // Upsert conversation
    await supabase.from('wa_conversations').upsert({
      client_id: client.id,
      channel: 'steve_chat',
      contact_phone: phone,
      contact_name: profileName || client.name,
      status: 'open',
      last_message_at: new Date().toISOString(),
      last_message_preview: messageBody.substring(0, 100),
    }, { onConflict: 'client_id,channel,contact_phone' });

    // Build Steve's context with real business data + relevant knowledge
    const [merchantContext, history] = await Promise.all([
      buildWAContext(client.id, messageBody),
      getWAHistory(client.id, phone, 10),
    ]);

    // Build messages array for Claude
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
    ];
    // Ensure it ends with the current user message
    if (messages.length === 0 || messages[messages.length - 1].content !== messageBody) {
      messages.push({ role: 'user', content: messageBody });
    }

    // Ensure alternating roles (Anthropic requirement)
    const sanitized = sanitizeForClaude(messages);

    // Call Claude for response
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[steve-wa-chat] ANTHROPIC_API_KEY not configured');
      const twiml = `<Response><Message>Woof, tuve un problema técnico 🐕 Intenta de nuevo en un momento.</Message></Response>`;
      return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
    }

    const systemPrompt = `${WA_SYSTEM_PROMPT}\n\n${merchantContext}`;

    const { ok: aiOk, data: aiData, status: aiStatus } = await anthropicFetch(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt.slice(0, 12000),
        messages: sanitized,
      },
      ANTHROPIC_API_KEY,
    );

    let replyText: string;

    if (!aiOk) {
      console.error('[steve-wa-chat] Claude API error:', aiStatus);
      replyText = 'Perdón, tuve un momento de confusión 🐕 ¿Me repites eso?';
    } else {
      const rawMsg = aiData.content?.[0]?.text || '';
      replyText = rawMsg
        .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
        .trim() || 'Woof, no pude procesar eso. ¿Me lo dices de otra forma?';
    }

    // Smart truncate for WhatsApp — split at word boundary, never mid-word
    if (replyText.length > 1500) {
      const { head } = splitAtWordBoundary(replyText, 1500);
      replyText = head;
    }

    // Save outbound message
    await supabase.from('wa_messages').insert({
      client_id: client.id,
      channel: 'steve_chat',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: replyText,
      contact_name: profileName || client.name,
      contact_phone: phone,
    });

    // Update conversation preview
    await supabase.from('wa_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: replyText.substring(0, 100),
      })
      .eq('client_id', client.id)
      .eq('channel', 'steve_chat')
      .eq('contact_phone', phone);

    // Reply via TwiML (Twilio processes the response XML)
    const escapedReply = replyText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const twiml = `<Response><Message>${escapedReply}</Message></Response>`;
    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });

  } catch (error: any) {
    console.error('[steve-wa-chat] Unhandled error:', error);
    const twiml = `<Response><Message>Steve tuvo un error técnico 🐕 Intenta en un momento.</Message></Response>`;
    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
  }
}

/**
 * Handle messages from unknown numbers — AI sales funnel with intelligent qualification.
 *
 * Flow:
 * 1. Upsert prospect + save message (SYNC)
 * 2. Load history (10 msgs) + build dynamic prompt with known/missing data (SYNC)
 * 3. Call Claude Sonnet → response + validate (SYNC)
 * 4. Check escalation triggers + truncate to 400 chars (SYNC)
 * 5. Return TwiML — user gets response here (<5s)
 * 6. FIRE & FORGET: extract info (if ≥3 msgs), score, update prospect, escalate if stuck
 */
async function handleProspect(
  c: Context,
  supabase: any,
  phone: string,
  messageBody: string,
  profileName: string,
  messageSid: string,
  storageBody: string,
  hadPII: boolean,
  imageData?: { base64: string; mediaType: string } | null,
) {
  try {
    // Rate limiting: max 1 response per 30s per phone
    const lastTime = lastResponseTime.get(phone) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < RATE_LIMIT_MS) {
      // Still save the message but don't respond (prevents API waste on spam)
      await supabase.from('wa_messages').insert({
        client_id: null, channel: 'prospect', direction: 'inbound',
        from_number: phone, to_number: STEVE_WA_NUMBER,
        body: storageBody, message_sid: messageSid,
        contact_name: profileName || phone, contact_phone: phone,
      });
      // Update message count silently
      const { data: p } = await supabase.from('wa_prospects').select('message_count').eq('phone', phone).maybeSingle();
      if (p) {
        await supabase.from('wa_prospects').update({
          message_count: (p.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq('phone', phone);
      }
      console.log(`[rate-limit] Skipping response to ${phone} (${Math.round(elapsed / 1000)}s < 30s)`);
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // 1. Upsert prospect (use 'discovery' instead of old 'talking' for new prospects)
    const { data: existingProspect } = await supabase
      .from('wa_prospects')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    let prospect: ProspectRecord;

    if (existingProspect) {
      // Update message count
      await supabase
        .from('wa_prospects')
        .update({
          message_count: (existingProspect.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
          profile_name: profileName || existingProspect.profile_name,
        })
        .eq('id', existingProspect.id);

      prospect = {
        ...existingProspect,
        message_count: (existingProspect.message_count || 0) + 1,
      };
    } else {
      // Parse UTM from first message (e.g. "Hola Steve, vi tu web (src=website)")
      let utmSource: string | null = null;
      let utmMedium: string | null = null;
      let utmCampaign: string | null = null;
      const srcMatch = messageBody.match(/\bsrc=(\w+)/i);
      const medMatch = messageBody.match(/\bmed=(\w+)/i);
      const campMatch = messageBody.match(/\bcamp=(\w+)/i);
      if (srcMatch) utmSource = srcMatch[1];
      if (medMatch) utmMedium = medMatch[1];
      if (campMatch) utmCampaign = campMatch[1];

      // Create new prospect
      const { data: newProspect } = await supabase
        .from('wa_prospects')
        .insert({
          phone,
          profile_name: profileName || null,
          stage: 'discovery',
          source: 'whatsapp',
          message_count: 1,
          lead_score: 0,
          score_breakdown: {},
          ...(utmSource && { utm_source: utmSource }),
          ...(utmMedium && { utm_medium: utmMedium }),
          ...(utmCampaign && { utm_campaign: utmCampaign }),
        })
        .select()
        .single();

      prospect = newProspect || {
        id: '',
        phone,
        stage: 'discovery',
        message_count: 1,
        lead_score: 0,
      };
    }

    // 2. Save inbound message (PII scrubbed)
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'inbound',
      from_number: phone,
      to_number: STEVE_WA_NUMBER,
      body: storageBody,
      message_sid: messageSid,
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // 3. Load history + quick scrape URL if detected (in parallel)
    const detectedUrlMatch = messageBody.match(URL_REGEX);
    const detectedUrl = detectedUrlMatch?.[0] || null;

    const [history, quickScrapeData] = await Promise.all([
      getProspectHistory(phone, 20),
      detectedUrl ? quickScrapeUrl(detectedUrl) : Promise.resolve(null),
    ]);

    if (quickScrapeData) {
      console.log(`[quick-scrape] Got ${quickScrapeData.length} chars for ${detectedUrl}`);
    }

    // Build messages array for Claude (use original messageBody for AI context, not scrubbed)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [...history];
    // Build AI message with context injections
    let aiMessageBody = messageBody;
    // Inject quick scrape data so Claude has real page info
    if (quickScrapeData) {
      aiMessageBody += `\n\n[SISTEMA: Steve revisó la página ${detectedUrl} y encontró esta información REAL. USA SOLO ESTOS DATOS para hablar de la tienda, NO inventes nada que no esté aquí:\n${quickScrapeData}]`;
    }
    // If PII was detected, inject warning hint
    if (hadPII) {
      aiMessageBody += `\n\n[SISTEMA: El usuario compartió datos sensibles como tarjeta de crédito o RUT. DEBES advertirle que NO comparta datos financieros por WhatsApp y que los pagos se hacen en steve.cl]`;
    }
    if (messages.length === 0 || messages[messages.length - 1].content !== aiMessageBody) {
      messages.push({ role: 'user', content: aiMessageBody });
    }
    const sanitized = sanitizeForClaude(messages);

    // If image was sent, replace the last user message with multimodal content
    // so Claude can actually SEE the image
    if (imageData && sanitized.length > 0) {
      const lastMsg = sanitized[sanitized.length - 1];
      if (lastMsg.role === 'user') {
        (lastMsg as any).content = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageData.mediaType,
              data: imageData.base64,
            },
          },
          {
            type: 'text',
            text: aiMessageBody + '\n\n[SISTEMA: El usuario envió esta imagen por WhatsApp. Puedes verla. Descríbela brevemente y relaciónala con su negocio si es relevante. Si es un producto, comenta sobre cómo se podría usar en ads o en su tienda.]',
          },
        ];
      }
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      const twiml = `<Response><Message>Woof, tuve un problema técnico 🐕 Intenta de nuevo en un momento.</Message></Response>`;
      return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
    }

    let replyText = '';
    let collectedRuleIds: string[] = [];
    let skipMultiBrain = false;

    // ============================================================
    // PRE-CHECK: Human escalation — respond instantly, skip pipeline
    // ============================================================
    const lowerMsgEarly = messageBody.toLowerCase();
    const humanEscalationTriggers = [
      'hablar con alguien', 'persona real', 'habla con alguien',
      'agente humano', 'quiero hablar con una persona', 'asesor',
      'hablar con humano', 'eres un bot', 'eres robot', 'eres una ia',
    ];
    if (humanEscalationTriggers.some(t => lowerMsgEarly.includes(t))) {
      replyText = 'Sí, soy un asistente de IA del equipo de Steve. Te conecto con José Manuel — te va a escribir pronto por este mismo chat. Si prefieres agendar directo: meetings.hubspot.com/jose-manuel15';
      skipMultiBrain = true;
      // Fire & forget: create escalation task
      supabase.from('tasks').insert({
        title: `[ESCALAR] Prospecto ${phone} pidió hablar con humano`,
        description: `El prospecto solicitó hablar con una persona real. Mensaje: "${messageBody}"`,
        priority: 'high',
        status: 'pending',
        assigned_to: '3d195082-aa83-48c0-b514-a8052264a1e7',
        created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    // Cambio 1: Quick intel for first message (Haiku, ~1s)
    let quickIntel = '';
    if (!skipMultiBrain && (prospect.message_count || 0) <= 1) {
      quickIntel = await quickFirstMessageIntel(messageBody, profileName);
    }

    if (!skipMultiBrain) {
    try {
      // ============================================================
      // MULTI-BRAIN PIPELINE
      // Step 1: Investigator + Dynamic Prompt in PARALLEL (~1s)
      // ============================================================
      const [investigatorResults, promptResult] = await Promise.all([
        runInvestigator(prospect),
        buildDynamicSalesPrompt(prospect, messageBody, history, undefined, quickIntel),
      ]);

      // Collect rule IDs from prompt builder + investigator
      collectedRuleIds = [
        ...promptResult.ruleIds,
        ...investigatorResults.ruleIds,
      ];

      // Step 2: Strategist (~1.5s)
      const strategistBrief = await runStrategist(prospect, history, investigatorResults);

      // Step 3: Conversationalist with strategist brief (~3-5s)
      replyText = await runConversationalist(history, strategistBrief, promptResult.prompt, sanitized);

      // Save strategist brief to history (fire & forget)
      if (strategistBrief.brief && prospect.id) {
        const briefEntry = {
          timestamp: new Date().toISOString(),
          brief: strategistBrief.brief,
          action: strategistBrief.suggestedAction,
          tone: strategistBrief.tone,
        };
        supabase.from('wa_prospects')
          .update({
            strategist_history: [
              ...(prospect.strategist_history || []).slice(-9),
              briefEntry,
            ],
          })
          .eq('id', prospect.id)
          .then(() => {})
          .catch(() => {});
      }
    } catch (multiBrainErr) {
      // FALLBACK: If multi-brain fails, use the original single-call approach
      console.error('[steve-wa-chat] Multi-brain pipeline failed, using fallback:', multiBrainErr);
      const promptResult = await buildDynamicSalesPrompt(prospect, messageBody, history, undefined, quickIntel);
      collectedRuleIds = promptResult.ruleIds;
      const { ok: fbOk, data: fbData } = await anthropicFetch(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system: promptResult.prompt,
          messages: sanitized,
        },
        ANTHROPIC_API_KEY,
      );
      if (!fbOk) {
        replyText = 'Perdón, tuve un problema procesando tu mensaje. ¿Me lo puedes repetir?';
      } else {
        const rawMsg = fbData.content?.[0]?.text || '';
        replyText = rawMsg
          .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
          .trim() || 'Perdón, no pude procesar bien tu mensaje. ¿Me lo repites?';
      }
    }
    } // end if (!skipMultiBrain)

    // Paso 13: Detect frustration (3+ very short messages in a row)
    const recentUserMsgs = history.filter(m => m.role === 'user').slice(-3);
    if (recentUserMsgs.length >= 3 && recentUserMsgs.every(m => m.content.length <= 5)) {
      // Possible frustration — escalate
      supabase.from('tasks').insert({
        title: `[ESCALAR] Prospecto ${phone} posible frustración (mensajes cortos)`,
        description: `3+ mensajes consecutivos de 1-5 caracteres. Puede estar frustrado.`,
        priority: 'medium',
        status: 'pending',
        assigned_to: '3d195082-aa83-48c0-b514-a8052264a1e7',
        created_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }

    // ============================================================
    // POST-PIPELINE: Validation, tag detection, splitting, DB save, TwiML
    // Wrapped in try-catch to prevent propagation to outer fallback
    // ============================================================
    try {

    // Paso 18: Validation — if reply asks "¿qué vendes?" but we already know what_they_sell
    if (
      prospect.what_they_sell &&
      (replyText.toLowerCase().includes('¿qué vendes') || replyText.toLowerCase().includes('qué vendes'))
    ) {
      // One retry: ask Claude to fix the response
      try {
        const fixResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 800,
            messages: [{
              role: 'user',
              content: `Tu respuesta anterior contiene una pregunta REDUNDANTE. Ya sabemos que el prospecto vende "${prospect.what_they_sell}".

Tu respuesta original: "${replyText}"

Reescribe la respuesta SIN preguntar qué vende. Mantén el mismo tono. MÁXIMO 3 oraciones, 1 pregunta NUEVA. Responde SOLO con el texto corregido, nada más.`,
            }],
          }),
        });
        if (fixResponse.ok) {
          const fixData: any = await fixResponse.json();
          const fixedText = (fixData.content?.[0]?.text || '').trim();
          if (fixedText && fixedText.length <= 400) {
            replyText = fixedText;
            console.log(`[prospect ${phone}] reply FIXED: removed redundant question`);
          }
        }
      } catch {} // If fix fails, use original
    }

    // ============================================================
    // STEP A: Strip ALL action tags FIRST (before TwiML or DB save)
    // ============================================================
    const fullText = replyText;

    // Detect tags before stripping
    const copyMatch = fullText.match(/\[GENERATE_COPY:([^\]]+)\]/);
    const caseStudyTag = fullText.includes('[SEND_CASE_STUDY]');
    const mockupTag = fullText.includes('[SEND_MOCKUP]');
    const deckTag = fullText.includes('[SEND_DECK]');
    // Strip ALL tags from the reply text
    replyText = replyText
      .replace(/\[SPLIT\]/g, '|||SPLIT|||')  // preserve split marker
      .replace(/\[GENERATE_COPY:[^\]]*\]/g, '')
      .replace(/\[SEND_CASE_STUDY\]/g, '')
      .replace(/\[SEND_MOCKUP\]/g, '')
      .replace(/\[SEND_DECK\]/g, '')
      .replace(/\[SEND_VIDEO_DEMO\]/g, '')
      .replace(/\[ACTIVATE_TRIAL:[^\]]*\]/g, '')
      .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '')  // catch any other leaked tags
      .trim();

    // ============================================================
    // STEP B: Split into first/second reply
    // ============================================================
    let firstReply = replyText;
    let secondReply: string | null = null;
    if (replyText.includes('|||SPLIT|||')) {
      const parts = replyText.split('|||SPLIT|||').map(p => p.trim()).filter(Boolean);
      firstReply = parts[0] || replyText;
      secondReply = parts[1] || null;
    }

    // Smart split: if firstReply exceeds 1200 chars, break at word boundary
    // MAX 2 messages total (TwiML + 1 split). No flooding the prospect.
    const MAX_CHARS = 1200;
    if (firstReply.length > MAX_CHARS && !secondReply) {
      const { head, tail } = splitAtWordBoundary(firstReply, MAX_CHARS);
      firstReply = head;
      secondReply = tail || null;
    }

    // If both parts exist and secondReply is too long, truncate (don't create 3rd message)
    if (secondReply && secondReply.length > MAX_CHARS) {
      secondReply = secondReply.slice(0, MAX_CHARS - 3) + '...';
    }

    // ============================================================
    // STEP C: Save outbound message (clean text, no tags)
    // ============================================================
    const outboundMetadata: Record<string, any> = {};
    if (collectedRuleIds.length > 0) {
      outboundMetadata.rule_ids = [...new Set(collectedRuleIds)];
    }
    outboundMetadata.stage = prospect.stage || 'discovery';
    outboundMetadata.lead_score = prospect.lead_score || 0;

    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: firstReply,
      contact_name: profileName || phone,
      contact_phone: phone,
      metadata: outboundMetadata,
    });

    // Queue second message via task queue (persistent, 2s delay)
    if (secondReply) {
      enqueueWAAction(phone, 'split_message', {
        body: secondReply,
        profileName: profileName || phone,
      }, 2).catch(err => console.error('[steve-wa-chat] Enqueue split_message error:', err));
    }

    // ============================================================
    // STEP D: Build TwiML (clean, no tags, safe for user)
    // ============================================================
    lastResponseTime.set(phone, Date.now());

    const escapedReply = firstReply
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const twiml = `<Response><Message>${escapedReply}</Message></Response>`;

    // ============================================================
    // STEP E: Enqueue async actions from detected tags
    // ============================================================
    if (copyMatch) {
      enqueueWAAction(phone, 'generate_copy', {
        copyDescription: copyMatch[1].trim(),
        whatTheySell: prospect.what_they_sell || 'e-commerce',
        profileName: profileName || phone,
      }, 4).catch(err => console.error('[wingman-copy] Enqueue error:', err));
    }

    if (caseStudyTag) {
      enqueueWAAction(phone, 'send_case_study', {
        whatTheySell: prospect.what_they_sell || undefined,
        profileName: profileName || phone,
      }, 3).catch(err => console.error('[send-case-study] Enqueue error:', err));
    }

    if (mockupTag) {
      enqueueWAAction(phone, 'send_mockup', {
        prospectId: prospect.id,
        profileName: profileName || phone,
      }, 5).catch(err => console.error('[send-mockup] Enqueue error:', err));
    }

    // Auto-trigger mockup: pitching/closing + has product_images + not sent yet
    if (
      !mockupTag &&
      (prospect.stage === 'pitching' || prospect.stage === 'closing') &&
      (prospect as any).investigation_data?.store?.product_images?.length &&
      !(prospect as any).mockup_sent
    ) {
      enqueueWAAction(phone, 'send_mockup', {
        prospectId: prospect.id,
        profileName: profileName || phone,
      }, 5).catch(err => console.error('[auto-mockup] Enqueue error:', err));
    }

    // Only send deck when Steve EXPLICITLY includes [SEND_DECK] — no auto-trigger
    if (deckTag && !(prospect as any).deck_sent) {
      // Double-check deck_sent from fresh DB to prevent race condition duplicates
      const { data: freshDeck } = await supabase
        .from('wa_prospects')
        .select('deck_sent')
        .eq('id', prospect.id)
        .maybeSingle();
      if (!freshDeck?.deck_sent) {
        enqueueWAAction(phone, 'send_deck', {
          prospectId: prospect.id,
          profileName: profileName || phone,
        }, 7).catch(err => console.error('[auto-sales-deck] Enqueue error:', err));
      }
    }

    // 7. FIRE & FORGET: async extraction + scoring + HubSpot push
    const fullReplyText = secondReply ? `${firstReply}\n${secondReply}` : firstReply;
    const fullHistory = [...history];
    if (fullHistory.length === 0 || fullHistory[fullHistory.length - 1].content !== messageBody) {
      fullHistory.push({ role: 'user', content: messageBody });
    }
    fullHistory.push({ role: 'assistant', content: fullReplyText });

    // Detect if Steve sent meeting link in this reply
    const meetingLinkSent = fullReplyText.includes('meetings.hubspot.com');

    // Detect if Steve proposed meeting times (Mini CRM)
    const meetingProposed = /(?:llamada|reunión|videollamada|call).*(?:\d{1,2}[:\.]?\d{0,2}\s*(?:am|pm|hrs|h)?|mañana|lunes|martes|miércoles|jueves|viernes)/i.test(fullReplyText)
      && (prospect.meeting_status === 'none' || !prospect.meeting_status);

    // Paso 2: Detect disqualification → mark as lost
    const disqResult = detectDisqualification(messageBody, history);

    // Paso 17: Detect URL in prospect message (reuse earlier detection)
    const urlMatch = detectedUrl ? [detectedUrl] : null;

    processProspectAsync(prospect, fullHistory, meetingLinkSent, disqResult.disqualified ? disqResult.reason : undefined, urlMatch?.[0], meetingProposed).catch(err => {
      console.error('[steve-wa-chat] processProspectAsync error:', err);
    });

    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });

    } catch (postPipelineErr) {
      // Post-pipeline failed (tag detection, splitting, or DB save)
      // We still have replyText from the pipeline — send it raw
      console.error('[steve-wa-chat] Post-pipeline error, sending raw reply:', postPipelineErr);
      const safeReply = (replyText || 'Perdón, tuve un problema. ¿Me puedes repetir eso?')
        .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '') // strip any leaked tags
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const fallbackTwiml = `<Response><Message>${safeReply}</Message></Response>`;
      return c.text(fallbackTwiml, 200, { 'Content-Type': 'text/xml' });
    }

  } catch (error: any) {
    console.error('[steve-wa-chat] Prospect handler error:', error);
    const twiml = `<Response><Message>Perdón, tuve un problema técnico. ¿Me puedes repetir eso? Si prefieres hablar con alguien del equipo: meetings.hubspot.com/jose-manuel15</Message></Response>`;
    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
  }
}

/**
 * Async post-processing: extract info, score, update prospect, push to HubSpot.
 * Runs AFTER the TwiML response is sent — does not block user response.
 */
async function processProspectAsync(
  prospect: ProspectRecord,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  meetingLinkSentInReply: boolean,
  disqualifiedReason?: string,
  detectedUrl?: string,
  meetingProposed?: boolean,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  try {
    // Paso 2 Perro Lobo: If disqualified, mark as lost immediately
    if (disqualifiedReason) {
      await supabase
        .from('wa_prospects')
        .update({
          stage: 'lost',
          lost_reason: disqualifiedReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);
      console.log(`[prospect ${prospect.phone}] DISQUALIFIED: ${disqualifiedReason}`);
      return; // No further processing needed
    }

    // Paso 17: If URL detected, fire & forget audit
    if (detectedUrl) {
      auditProspectUrl(detectedUrl, prospect.id).catch(err => {
        console.error('[prospect-audit] Error:', err);
      });
    }

    // Steve Depredador: Background investigation for NEXT message
    // Enriches investigation_data with store scraping, competitor ads, social data
    const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    investigateProspectBackground(prospect, history, lastUserMsg).catch(err => {
      console.error('[steve-investigator] Error:', err);
    });

    // Paso 10: Extract every 3rd inbound message (not every message — reduces API calls & duplicates)
    const inboundCount = history.filter(m => m.role === 'user').length;

    let extracted: Record<string, any> | null = null;
    if (inboundCount >= 3 && inboundCount % 3 === 0) {
      extracted = await extractProspectInfo(history, prospect);
    }

    // Merge new data with existing — Paso 7: protect against weak overwrites
    const merged: Record<string, any> = {};

    if (extracted) {
      const mergeFields = [
        'name', 'apellido', 'email', 'company', 'what_they_sell', 'monthly_revenue',
        'has_online_store', 'store_platform', 'is_decision_maker',
        'actively_looking', 'current_marketing', 'pain_points',
        'integrations_used', 'team_size', 'budget_range', 'decision_timeline',
      ] as const;

      for (const field of mergeFields) {
        const newVal = (extracted as any)[field];
        if (newVal == null || newVal === '') continue;
        if (Array.isArray(newVal) && newVal.length === 0) continue;

        const existingVal = (prospect as any)[field];

        // Paso 7: If field already has a value and new value differs → only update
        // if we have strong signal (the value should come from explicit prospect statement)
        if (existingVal != null && existingVal !== '' && existingVal !== newVal) {
          // For key identity fields, don't overwrite with different values
          // unless the new value is from the most recent messages
          if (['company', 'what_they_sell', 'name'].includes(field)) {
            // Check if the new value appears verbatim in the last 3 user messages
            const recentUserMsgs = history
              .filter(m => m.role === 'user')
              .slice(-3)
              .map(m => m.content.toLowerCase())
              .join(' ');
            const newValStr = String(newVal).toLowerCase();
            if (!recentUserMsgs.includes(newValStr)) {
              continue; // Don't overwrite — inference too weak
            }
          }
        }

        // For arrays, merge with case-insensitive dedup
        if (Array.isArray(newVal) && Array.isArray(existingVal)) {
          const seen = new Set(existingVal.map((v: string) => String(v).toLowerCase().trim()));
          const deduped = [...existingVal];
          for (const item of newVal) {
            const key = String(item).toLowerCase().trim();
            if (!seen.has(key)) {
              deduped.push(item);
              seen.add(key);
            }
          }
          merged[field] = deduped;
        } else {
          merged[field] = newVal;
        }
      }
    }

    // Consolidate pain points if too many (semantic dedup via Haiku)
    if (merged.pain_points && Array.isArray(merged.pain_points) && merged.pain_points.length > 8) {
      merged.pain_points = await consolidatePainPoints(merged.pain_points);
    }

    // Calculate lead score with merged data
    const prospectForScoring = { ...prospect, ...merged };
    const { score, breakdown, stage: newStage } = calculateLeadScore(prospectForScoring);

    // Only advance stage, never go back (exception: 'lost' from no-fit detection)
    const currentStageOrder = STAGE_ORDER[prospect.stage || 'new'] ?? 0;
    const newStageOrder = STAGE_ORDER[newStage] ?? 0;
    const effectiveStage = newStageOrder > currentStageOrder ? newStage : (prospect.stage || 'discovery');

    // Build update payload
    const updatePayload: Record<string, any> = {
      ...merged,
      lead_score: score,
      score_breakdown: breakdown,
      stage: effectiveStage,
      last_extracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Track meeting link
    if (meetingLinkSentInReply && !prospect.meeting_link_sent) {
      updatePayload.meeting_link_sent = true;
      updatePayload.meeting_suggested_at = new Date().toISOString();
    }

    // Track meeting proposal (Mini CRM)
    if (meetingProposed && (!prospect.meeting_status || prospect.meeting_status === 'none')) {
      updatePayload.meeting_status = 'proposed';
      updatePayload.meeting_suggested_at = new Date().toISOString();
    }

    // Update prospect in DB
    await supabase
      .from('wa_prospects')
      .update(updatePayload)
      .eq('id', prospect.id);

    // Rolling summary: compress older messages every 10 msgs (fire & forget)
    updateRollingConversationSummary(
      { ...prospect, ...updatePayload } as ProspectRecord,
      prospect.phone,
    ).catch(err => console.error('[rolling-summary] Error:', err));

    // Paso 20: Quality logging
    const knownFields = [
      prospect.what_they_sell || merged.what_they_sell,
      prospect.store_platform || merged.store_platform,
      prospect.monthly_revenue || merged.monthly_revenue,
      prospect.current_marketing || merged.current_marketing,
      prospect.pain_points?.length || (merged.pain_points as string[])?.length,
    ].filter(Boolean).length;

    console.log(`[prospect ${prospect.phone}] stage=${effectiveStage} score=${score} extracted=${Object.keys(merged).length} known=${knownFields} msgs=${prospect.message_count || 0}`);

    // Paso 13: Human escalation — create task if stuck
    const msgCount = prospect.message_count || 0;
    if (msgCount > 20 && effectiveStage === 'discovery') {
      // Prospect has 20+ messages and still in discovery → escalate
      try {
        await supabase.from('tasks').insert({
          title: `[ESCALAR] Prospecto ${prospect.phone} estancado en discovery (${msgCount} msgs)`,
          description: `El prospecto lleva ${msgCount} mensajes y sigue en discovery con score ${score}. Requiere intervención humana.`,
          priority: 'high',
          status: 'pending',
          assigned_to: '3d195082-aa83-48c0-b514-a8052264a1e7', // JM user_id
          created_at: new Date().toISOString(),
        });
        console.log(`[prospect ${prospect.phone}] ESCALATED: stuck in discovery after ${msgCount} msgs`);
      } catch {} // Don't fail if tasks table doesn't exist
    }

    // Push to HubSpot if qualified and not already pushed
    if (score >= 70 && !prospect.pushed_to_hubspot_at) {
      const summary = await generateConversationSummary(history);
      const hubspotResult = await pushToHubSpot(
        { ...prospect, ...updatePayload } as ProspectRecord,
        summary,
      );

      if (hubspotResult) {
        await supabase
          .from('wa_prospects')
          .update({
            hubspot_contact_id: hubspotResult.contactId,
            hubspot_deal_id: hubspotResult.dealId,
            pushed_to_hubspot_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);

        console.log(`[prospect ${prospect.phone}] pushed to HubSpot: contact=${hubspotResult.contactId}`);
      }
    }

    // ============================================================
    // Mini CRM: Meeting confirmation detection
    // If meeting_status === 'proposed', check if prospect confirmed/rejected
    // ============================================================
    const currentMeetingStatus = prospect.meeting_status || 'none';
    if (currentMeetingStatus === 'proposed') {
      const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
      const meetingResult = await detectMeetingConfirmation(lastUserMsg, history);

      if (meetingResult.confirmed && meetingResult.proposedTime) {
        // Prospect confirmed a time via text — parse it and save as scheduled
        // The booking API handles Calendar + Meet when prospect books via link.
        // This fallback handles text-based confirmations (no link was used).
        const meetingDate = await parseMeetingTime(meetingResult.proposedTime);
        if (meetingDate) {
          await supabase
            .from('wa_prospects')
            .update({
              meeting_at: meetingDate.toISOString(),
              meeting_status: 'scheduled',
              reminder_24h_sent: false,
              reminder_2h_sent: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', prospect.id);

          // If there's an assigned seller, create Calendar event via booking API
          if (prospect.assigned_seller_id) {
            const bookingApiUrl = process.env.CLOUD_RUN_URL || 'http://localhost:8080';
            fetch(`${bookingApiUrl}/api/booking/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                seller_id: prospect.assigned_seller_id,
                slot_start: meetingDate.toISOString(),
                prospect_name: prospect.name || prospect.profile_name || 'Prospecto',
                prospect_phone: prospect.phone,
                prospect_id: prospect.id,
              }),
            }).catch(err => console.error('[meeting-confirm] Booking API error:', err));
          }

          console.log(`[prospect ${prospect.phone}] Meeting scheduled via text: ${meetingDate.toISOString()}`);
        }
      } else if (meetingResult.rejected) {
        // Prospect rejected the meeting entirely
        await supabase
          .from('wa_prospects')
          .update({
            meeting_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);
        console.log(`[prospect ${prospect.phone}] Meeting rejected`);
      }
      // If proposedTime but not confirmed → prospect suggested alternative, Steve handles in next reply
    }
  } catch (err) {
    console.error('[steve-wa-chat] processProspectAsync error:', err);
  }
}

/**
 * Paso 17-18: Audit a prospect's URL — scrape + AI analysis.
 * Saves findings to wa_prospects.audit_data.
 */
async function auditProspectUrl(url: string, prospectId: string): Promise<void> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!APIFY_TOKEN || !ANTHROPIC_API_KEY) {
    console.warn('[prospect-audit] Missing APIFY_TOKEN or ANTHROPIC_API_KEY');
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    // Scrape URL with Apify website-content-crawler (lightweight run)
    const runRes = await fetch('https://api.apify.com/v2/acts/apify~website-content-crawler/runs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startUrls: [{ url }],
        maxCrawlPages: 3,
        maxCrawlDepth: 1,
        crawlerType: 'cheerio',
      }),
    });

    if (!runRes.ok) {
      console.error('[prospect-audit] Apify run failed:', runRes.status);
      return;
    }

    const runData: any = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return;

    // Wait for completion (max 60s)
    let attempts = 0;
    let status = 'RUNNING';
    while (status === 'RUNNING' && attempts < 12) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const statusData: any = await statusRes.json();
      status = statusData.data?.status || 'FAILED';
      attempts++;
    }

    if (status !== 'SUCCEEDED') {
      console.warn(`[prospect-audit] Apify run ${runId} ended with status ${status}`);
      return;
    }

    // Get results
    const datasetId = runData.data?.defaultDatasetId;
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=3`);
    const items = (await itemsRes.json()) as any[];

    if (!items || items.length === 0) return;

    // Build markdown from scraped pages
    const markdown = items.map((item: any) =>
      `## ${item.title || 'Sin título'}\n${(item.text || '').slice(0, 2000)}`
    ).join('\n\n').slice(0, 6000);

    // AI analysis with Haiku
    const analysisRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Analiza esta tienda online y da 3-5 findings accionables para mejorar sus ventas. Sé directo y específico. Responde SOLO con un JSON: {"title":"título de la tienda","description":"descripción corta","findings":["finding 1","finding 2","finding 3"]}\n\nContenido:\n${markdown}`,
        }],
      }),
    });

    if (!analysisRes.ok) return;

    const analysisData: any = await analysisRes.json();
    const analysisText = (analysisData.content?.[0]?.text || '').trim();
    const jsonStr = analysisText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsed = JSON.parse(jsonStr);

    // Save audit data
    await supabase
      .from('wa_prospects')
      .update({
        audit_data: {
          url,
          title: parsed.title || null,
          description: parsed.description || null,
          findings: parsed.findings || [],
          audited_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', prospectId);

    console.log(`[prospect-audit] Audit complete for ${url}: ${(parsed.findings || []).length} findings`);
  } catch (err) {
    console.error('[prospect-audit] Error:', err);
  }
}

/** Ensure messages alternate user/assistant and start+end with user. */
function sanitizeForClaude(
  msgs: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (msgs.length === 0) return [{ role: 'user', content: 'Hola' }];

  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of msgs) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  if (merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: 'Hola' });
  }
  if (merged[merged.length - 1].role !== 'user') {
    merged.push({ role: 'user', content: '...' });
  }

  return merged;
}

/**
 * Split text at a word boundary (space or newline) before maxLen.
 * Never cuts a word in half. If no boundary found, falls back to maxLen.
 */
function splitAtWordBoundary(text: string, maxLen: number): { head: string; tail: string } {
  if (text.length <= maxLen) return { head: text, tail: '' };

  // Prefer splitting at a paragraph break (\n\n) near the limit
  const paragraphBreak = text.lastIndexOf('\n\n', maxLen);
  if (paragraphBreak > maxLen * 0.5) {
    return {
      head: text.slice(0, paragraphBreak).trimEnd(),
      tail: text.slice(paragraphBreak + 2).trimStart(),
    };
  }

  // Fall back to last newline
  const newlineBreak = text.lastIndexOf('\n', maxLen);
  if (newlineBreak > maxLen * 0.5) {
    return {
      head: text.slice(0, newlineBreak).trimEnd(),
      tail: text.slice(newlineBreak + 1).trimStart(),
    };
  }

  // Fall back to last space
  const spaceBreak = text.lastIndexOf(' ', maxLen);
  if (spaceBreak > maxLen * 0.3) {
    return {
      head: text.slice(0, spaceBreak).trimEnd(),
      tail: text.slice(spaceBreak + 1).trimStart(),
    };
  }

  // Worst case: hard cut (very long word with no spaces)
  return {
    head: text.slice(0, maxLen),
    tail: text.slice(maxLen),
  };
}

// Cleanup stale rate limit entries every 5 minutes to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_MS * 2;
  for (const [phone, time] of lastResponseTime) {
    if (time < cutoff) lastResponseTime.delete(phone);
  }
}, 5 * 60 * 1000);
