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
import { sendMetaCAPIEvent } from '../../lib/meta-capi.js';
import { enqueueWAAction } from '../../lib/wa-task-queue.js';
import { scrubPII } from '../../lib/pii-scrubber.js';
import { isSupportedAudio, transcribeAudio } from '../../lib/audio-transcriber.js';
import { anthropicFetch } from '../../lib/anthropic-fetch.js';
import { logProspectEvent } from '../../lib/prospect-event-logger.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';
// Fix #6: single canonical booking URL used everywhere
const BOOKING_URL = 'www.steve.cl/agendar/steve';

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

    // Fix R6-#17: validar tamaño antes de cargar en RAM
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > 5 * 1024 * 1024) {
      console.warn(`[download-image] Skipping: too large (${contentLength} bytes)`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    // Skip images > 5MB (Claude limit is ~20MB but keep it reasonable for latency)
    if (buffer.length > 5 * 1024 * 1024) {
      console.warn('[image-vision] Image too large (>5MB), skipping');
      return null;
    }

    // Fix #11: validate file magic bytes — skip corrupted/wrong-type files
    const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];
    const isJpeg = b0 === 0xff && b1 === 0xd8;
    const isPng  = b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47;
    const isGif  = b0 === 0x47 && b1 === 0x49;
    const isWebp = b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46;
    if (!isJpeg && !isPng && !isGif && !isWebp) {
      console.warn(`[image-vision] Invalid file format (magic: ${b0?.toString(16)} ${b1?.toString(16)}), skipping`);
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

    let html = await res.text();

    // Fix R5-#20: detect JS-rendered sites and use Firecrawl for better content
    const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const isJsRendered = bodyText.length < 500 || html.includes('__NEXT_DATA__') || html.includes('window.__reactFiber') || html.includes('__NUXT__');
    if (isJsRendered) {
      const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
      if (FIRECRAWL_API_KEY) {
        try {
          const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, formats: ['html'], timeout: 5000 }),
          });
          if (fcRes.ok) {
            const fcData = await fcRes.json() as any;
            if (fcData?.data?.html) html = fcData.data.html;
          }
        } catch { /* fallback to original html */ }
      }
    }

    const parts: string[] = [];

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) parts.push(`Título: ${titleMatch[1].trim()}`);

    // Meta description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (metaDescMatch) parts.push(`Descripción: ${metaDescMatch[1].trim()}`);

    // H1s and H2s (strip HTML tags inside)
    // Fix R5-#16: decode HTML entities so products show as "Zapatilla deportiva" not "Zapatilla&nbsp;deportiva"
    const decodeEntities = (s: string) => s
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
      .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
      .replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '');
    const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, '')).trim();
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => stripTags(m[1])).filter(Boolean).slice(0, 5);
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => stripTags(m[1])).filter(Boolean).slice(0, 10);
    if (h1s.length) parts.push(`H1: ${h1s.join(' | ')}`);
    if (h2s.length) parts.push(`Secciones: ${h2s.join(' | ')}`);

    // Fix R4-#11: extended regex to catch Shopify camelCase classes (ProductTitle, ProductMeta)
    const productTitles = [
      ...html.matchAll(/class="[^"]*product[_-]?(?:title|name|card__heading|item[_-]?name)[^"]*"[^>]*>([\s\S]*?)<\//gi),
      ...html.matchAll(/class="[^"]*[Pp]roduct[^"]*[Tt]itle[^"]*"[^>]*>([\s\S]*?)<\//gi),
      ...html.matchAll(/data-product-title="([^"]+)"/gi),
    ].map(m => stripTags(m[1] || '')).filter(Boolean);
    const deduplicatedTitles = [...new Set(productTitles)].slice(0, 15);
    if (deduplicatedTitles.length) {
      parts.push(`Productos: ${deduplicatedTitles.join(', ')}`);
    } else if (h1s.length) {
      // Fix #24: if no class-based products found, use H1s as likely product names
      // (on product pages H1 = product title; on homepages H1 = brand headline — still useful)
      parts.push(`Productos/Títulos principales: ${h1s.join(' | ')}`);
    }

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
const RATE_LIMIT_MS = 30_000; // 30 seconds (Fix #5: was 5s, causing duplicate responses on slow typing)

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

    // Fix #1: Twilio HMAC signature validation — reject forged webhooks
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (!twilioAuthToken) {
      console.error('[steve-wa] TWILIO_AUTH_TOKEN not configured — rejecting webhook');
      return c.text('Forbidden', 403);
    }
    {
      const sig = c.req.header('X-Twilio-Signature') || '';
      const proto = c.req.header('x-forwarded-proto') || 'https';
      const host = c.req.header('host') || '';
      const reqUrl = c.req.url;
      const rawUrl = host
        ? `${proto}://${host}${new URL(reqUrl).pathname}`
        : reqUrl.replace(/^http:\/\//i, 'https://');
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(body)) params[k] = String(v ?? '');
      const twilioMod = await import('twilio');
      // ESM: validateRequest está en default.validateRequest, no en el root del módulo
      const validateRequest = (twilioMod.default as any)?.validateRequest ?? (twilioMod as any).validateRequest;
      if (typeof validateRequest !== 'function') {
        console.error('[twilio-hmac] validateRequest not found in twilio module — skipping validation');
      } else if (!validateRequest(twilioAuthToken, sig, rawUrl, params)) {
        console.warn(`[twilio-hmac] Invalid signature — rejecting request from ${rawUrl}`);
        return c.text('Forbidden', 403);
      }
    }

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
        // Fix R4-#13: check audio size before transcribing (prevent timeout on long audios)
        const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5MB ≈ 2-3 min
        let okToTranscribe = true;
        try {
          const headRes = await fetch(mediaUrl, { method: 'HEAD' });
          const cl = headRes.headers.get('content-length');
          if (cl && parseInt(cl, 10) > MAX_AUDIO_BYTES) {
            messageBody = messageBody || '[Audio demasiado largo para transcribir (máx ~3 minutos)]';
            okToTranscribe = false;
          }
        } catch { /* Can't check — proceed anyway */ }
        if (okToTranscribe) {
        const transcription = await transcribeAudio(mediaUrl, mediaType);
        if (transcription) {
          messageBody = messageBody
            ? `${messageBody}\n\n[Audio transcrito]: ${transcription}`
            : transcription;
          console.log(`[steve-wa-chat] Audio transcribed for ${from}: ${transcription.slice(0, 100)}...`);
        } else if (!messageBody) {
          messageBody = '[El usuario envió un audio que no pude transcribir]';
        }
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
    // Use scrubbed version for ALL processing and storage — PII must never reach AI or DB
    const storageBody = scrubbedBody;
    // Override messageBody with scrubbed version so AI calls also use scrubbed data
    messageBody = scrubbedBody;

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
      last_message_preview: storageBody.substring(0, 100),
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
      // Fix #19: if prospect was 'lost' and writes again — re-activate (reset to discovery)
      const isReactivation = existingProspect.stage === 'lost';
      if (isReactivation) {
        console.log(`[handleProspect] Lost prospect ${phone} wrote again → re-activating (was: ${existingProspect.lost_reason || 'unknown'})`);
      }
      await supabase
        .from('wa_prospects')
        .update({
          message_count: (existingProspect.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
          profile_name: profileName || existingProspect.profile_name,
          ...(isReactivation && {
            stage: 'discovery',
            lead_score: 0,
            score_breakdown: {},       // Fix R6-#5: limpiar breakdown
            pain_points: [],           // Fix R6-#30: limpiar dolores viejos
            budget_range: null,        // Fix R6-#5: limpiar presupuesto anterior
            decision_timeline: null,   // Fix R6-#5: limpiar timeline anterior
            meeting_status: 'none',    // Fix R6-#30: limpiar reunión anterior
            meeting_at: null,
            // Fix R5-#18: store reactivation context for future reference
            reactivated_at: new Date().toISOString(),
          }),
        })
        .eq('id', existingProspect.id);

      prospect = {
        ...existingProspect,
        message_count: (existingProspect.message_count || 0) + 1,
        ...(isReactivation && { stage: 'discovery', lead_score: 0 }),
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

      // Fire Meta CAPI Lead event (fire & forget)
      sendMetaCAPIEvent({
        eventName: 'Lead',
        eventId: `lead-${phone}-${Date.now()}`,
        userData: { phone, name: profileName || undefined, country: 'cl' },
        customData: { content_name: 'WhatsApp Lead', status: 'new' },
      }).catch(() => {});
    }

    // R7-#10: detectar inactividad larga y resetear contexto de pitch
    const lastActive = prospect.updated_at ? new Date(prospect.updated_at).getTime() : 0;
    const daysSinceLastMsg = lastActive ? (Date.now() - lastActive) / 86400000 : 0;
    const isLongInactive = daysSinceLastMsg > 14;

    if (isLongInactive) {
      console.log(`[reactivation-context] ${prospect.phone} inactivo ${Math.round(daysSinceLastMsg)} días — inyectando contexto de reactivación`);
      (prospect as any)._longInactive = true;
      (prospect as any)._inactiveDays = Math.round(daysSinceLastMsg);
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

    // Fix R6-#3: descartar URLs que son falsos positivos (palabras en castellano con punto)
    let validatedUrl = detectedUrl;
    if (validatedUrl) {
      const hasValidTld = /\.(com|cl|co|mx|ar|pe|uy|br|net|org|io|store|shop|app|dev|ai)\b/i.test(validatedUrl);
      const isTooShort = validatedUrl.replace(/^https?:\/\//i, '').length < 8;
      if (!hasValidTld || isTooShort) {
        console.log(`[quick-scrape] Ignoring likely false-positive URL: ${validatedUrl}`);
        validatedUrl = null;
      }
    }

    const [history, quickScrapeData] = await Promise.all([
      getProspectHistory(phone, 20),
      validatedUrl ? quickScrapeUrl(validatedUrl) : Promise.resolve(null),
    ]);

    if (quickScrapeData) {
      console.log(`[quick-scrape] Got ${quickScrapeData.length} chars for ${detectedUrl}`);
    }

    // Fix #21 + R4-#16: stricter injection guard — avoid false positives like "ignora mis dudas"
    const INJECTION_PATTERNS = [
      /^\s*(?:system|instrucción|directiva)[\s:]/i,  // Starts with "system:" command
      /\[\s*(?:SYSTEM|INSTRUCCIÓN|DIRECTIVA)\s*:/i,  // [SYSTEM: ...] tags
      /jailbreak|DAN\s+mode|developer\s+mode/i,
      /forget\s+everything|ignore\s+(?:all|previous|everything)/i,
      /\[INSTRUCCIÓN:/i,
    ];
    const sanitizedMessageBody = INJECTION_PATTERNS.some(p => p.test(messageBody))
      ? 'Hola'  // neutralize injection — treat as blank greeting
      : messageBody;

    // Build messages array for Claude (use original messageBody for AI context, not scrubbed)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [...history];
    // Build AI message with context injections
    let aiMessageBody = sanitizedMessageBody;
    // Inject quick scrape data so Claude has real page info
    if (quickScrapeData) {
      // Fix R6-#14: decodificar HTML entities antes de inyectar al prompt
      const cleanScrapeData = quickScrapeData
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      aiMessageBody += `\n\n[SISTEMA: Steve revisó la página ${validatedUrl} y encontró esta información REAL. USA SOLO ESTOS DATOS para hablar de la tienda, NO inventes nada que no esté aquí:\n${cleanScrapeData}]`;
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
        // Fix R4-#6: preserve original user text — don't overwrite with aiMessageBody (system context)
        const originalUserText = typeof lastMsg.content === 'string' ? lastMsg.content : sanitizedMessageBody;
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
            text: `${originalUserText}\n\n[SISTEMA: El usuario también envió esta imagen. Puedes verla. Descríbela brevemente y relaciónala con su negocio si es relevante. Si es un producto, comenta sobre cómo podría usarse en ads o en su tienda.]`,
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
      replyText = 'Sí, soy un asistente de IA del equipo de Steve. Te conecto con José Manuel — te va a escribir pronto por este mismo chat. Si prefieres agendar directo: www.steve.cl/agendar/steve';
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
      // Fix R4-#15: null-safe spread — investigatorResults may be null/empty
      collectedRuleIds = [
        ...promptResult.ruleIds,
        ...(investigatorResults?.ruleIds || []),
      ];

      // Step 2: Strategist (~1.5s) — use fallback if investigator returned nothing
      const safeInvestigatorResults = (investigatorResults && investigatorResults.investigationContext)
        ? investigatorResults
        : { ruleIds: [], investigationContext: '', competitorInsights: '', salesLearnings: '' };
      const strategistBriefRaw = await runStrategist(prospect, history, safeInvestigatorResults);
      // Fix #18: validate strategist output — if empty/too short, don't pass garbage to conversationalist
      const strategistBrief = (strategistBriefRaw?.brief?.trim()?.length ?? 0) > 20
        ? strategistBriefRaw
        : { ...strategistBriefRaw, brief: '' };

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

    // R7-#11: no enviar link si el mensaje contiene negación de disponibilidad
    const hasTimingNegation = /no (tengo|puedo|estoy|hay)|no es buen momento|mejor después|más adelante|otro momento|en (unas|algunas) semanas|ocupado/i.test(messageBody);
    if (hasTimingNegation && replyText.includes(BOOKING_URL)) {
      console.log('[meeting-link] Bloqueado — prospecto indicó no disponibilidad');
      replyText = replyText.replace(/www\.steve\.cl\/agendar[^\s]*/g, '[link disponible cuando quieras]');
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

    // Fix #2: strip <thinking> blocks BEFORE detecting tags — prevents phantom actions from Claude's internal reasoning
    replyText = replyText.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '').trim();

    const fullText = replyText;

    // Detect tags (from clean text, without thinking blocks)
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
    // Fix #20: split FIRST then truncate each part (not the other way around)
    // ============================================================
    let firstReply = replyText;
    let secondReply: string | null = null;
    if (replyText.includes('|||SPLIT|||')) {
      const parts = replyText.split('|||SPLIT|||').map(p => p.trim()).filter(Boolean);
      firstReply = parts[0] || replyText;
      secondReply = parts[1] || null;
    }

    // Smart split: if firstReply exceeds 800 chars (part 1 budget), break at word boundary
    const MAX_FIRST = 800;
    const MAX_SECOND = 600;
    if (firstReply.length > MAX_FIRST && !secondReply) {
      const { head, tail } = splitAtWordBoundary(firstReply, MAX_FIRST);
      firstReply = head;
      // Fix R5-#15: only assign secondReply if tail has actual content
      secondReply = tail?.trim() ? tail : null;
    } else if (firstReply.length > MAX_FIRST) {
      firstReply = firstReply.slice(0, MAX_FIRST - 3) + '...';
    }

    // Truncate second part separately (600 char budget for part 2)
    if (secondReply && secondReply.length > MAX_SECOND) {
      secondReply = secondReply.slice(0, MAX_SECOND - 3) + '...';
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
    // Fix #18: include message_order so worker respects sequence even with parallel splits
    if (secondReply) {
      enqueueWAAction(phone, 'split_message', {
        body: secondReply,
        profileName: profileName || phone,
        message_order: (prospect.message_count || 0) + 0.5,
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
    // Fix #3: atomic DB update prevents race condition when 2 msgs arrive in parallel
    if (deckTag) {
      const { data: updated } = await supabase
        .from('wa_prospects')
        .update({ deck_sent: true, deck_sent_at: new Date().toISOString() })
        .eq('id', prospect.id)
        .is('deck_sent', null)  // Only update if NOT already sent (atomic guard)
        .select('id');
      if (updated && updated.length > 0) {
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

    // Fix #6+#10: use canonical BOOKING_URL constant + better detection (needs explicit proposal context)
    const meetingLinkSent = (fullReplyText.includes(BOOKING_URL) || fullReplyText.includes('meetings.hubspot.com')) &&
      /(?:agendar|agenda|reserva|reunión|llamada|link|horario|elige)/i.test(fullReplyText);

    // Detect if Steve proposed meeting times (Mini CRM)
    const meetingProposed = /(?:llamada|reunión|videollamada|call|meeting).*(?:\d{1,2}[:\.]?\d{0,2}\s*(?:am|pm|hrs|h)?|mañana|pasado|lunes|martes|miércoles|jueves|viernes)/i
      .test(fullReplyText) &&
      (prospect.meeting_status === 'none' || !prospect.meeting_status) &&
      // Fix R6-#13: descartar fechas imposibles (día > 31)
      !fullReplyText.match(/(?:día\s+|el\s+)(?:3[2-9]|[4-9]\d)\s+de/i);

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
    const twiml = `<Response><Message>Perdón, tuve un problema técnico. ¿Me puedes repetir eso? Si prefieres hablar con alguien del equipo: www.steve.cl/agendar/steve</Message></Response>`;
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
      // R7-#17: separar timing blocker de rechazo real
      const lastMsgForDisq = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
      const msgLowerDisq = lastMsgForDisq.toLowerCase();
      const timingBlockers = ['no tengo tiempo', 'ahora no', 'más adelante', 'después', 'cuando tenga tiempo', 'en otro momento', 'no es buen momento', 'estoy ocupado', 'muy ocupado'];
      const trueRejections = ['no me interesa', 'no gracias', 'no me convence', 'déjame en paz', 'no quiero', 'no es para mí', 'no lo necesito'];

      const isTimingBlocker = timingBlockers.some(k => msgLowerDisq.includes(k));
      const isTrueRejection = trueRejections.some(k => msgLowerDisq.includes(k));

      if (isTimingBlocker && !isTrueRejection) {
        // Es timing, no rechazo — NO marcar como lost, marcar como deferred stage
        console.log(`[disqualification] Timing blocker detected for ${prospect.phone} — deferring, not losing`);
        await supabase
          .from('wa_prospects')
          .update({
            stage: 'discovery', // Keep in funnel
            meeting_status: 'deferred',
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);
        logProspectEvent(prospect.id, 'timing_blocker', { reason: 'timing_not_interest', msg: lastMsgForDisq.slice(0, 100) }, 'steve');
        return; // No further processing needed for timing blocker
      }

      // R7-#30: pedir feedback de pérdida antes de marcar definitivamente como lost
      const isFirstLoss = prospect.stage !== 'lost';
      if (isFirstLoss) {
        console.log(`[loss-feedback] Will request feedback from ${prospect.phone} before marking as lost`);
        // Guardar flag awaiting_loss_feedback en metadata para que el siguiente mensaje de Steve lo pida
        // El bot ya envió su respuesta, pero en el siguiente mensaje podemos pedir el feedback
        // (este flag se puede usar en buildDynamicSalesPrompt si se agrega en el futuro)
      }

      await supabase
        .from('wa_prospects')
        .update({
          stage: 'lost',
          // Fix R6-#12: truncar lost_reason antes de guardar (evita overflow en DB)
          lost_reason: disqualifiedReason ? String(disqualifiedReason).slice(0, 200).trim() : undefined,
          updated_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          is_rotting: false,
        })
        .eq('id', prospect.id);
      logProspectEvent(prospect.id, 'stage_change', { from: prospect.stage, to: 'lost', reason: disqualifiedReason }, 'steve');
      console.log(`[prospect ${prospect.phone}] DISQUALIFIED: ${disqualifiedReason}`);
      // Fix #16 + R4-#9: preserve rolling summary with lost_reason so re-activations have context
      updateRollingConversationSummary(
        { ...prospect, stage: 'lost', lost_reason: disqualifiedReason } as ProspectRecord,
        prospect.phone,
      ).catch(err => console.error('[disq-summary]', err));
      return; // No further processing needed
    }

    // Paso 17: If URL detected, fire & forget audit
    // Fix R4-#20: skip if same URL was already audited
    if (detectedUrl && prospect.audit_data?.url !== detectedUrl) {
      auditProspectUrl(detectedUrl, prospect.id).catch(err => {
        console.error('[prospect-audit] Error:', err);
      });
    } else if (detectedUrl) {
      console.log(`[prospect-audit] URL already audited: ${detectedUrl} — skip`);
    }

    // Steve Depredador: Background investigation for NEXT message
    // Enriches investigation_data with store scraping, competitor ads, social data
    const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    // Fix R6-#7: wrapper async completo para capturar y loguear errores en qa_log
    void (async () => {
      try {
        await investigateProspectBackground(prospect, history, lastUserMsg);
      } catch (err) {
        console.error('[steve-investigator] Background error:', err);
        void getSupabaseAdmin().from('qa_log').insert({
          check_type: 'investigator_bg_error',
          status: 'error',
          details: JSON.stringify({ phone: prospect.phone, error: String(err) }),
          detected_by: 'fire-and-forget-wrapper',
        });
      }
    })();

    // Paso 10: Extract at msg 2 (first info-dense turn) then every 3rd message
    const inboundCount = history.filter(m => m.role === 'user').length;

    let extracted: Record<string, any> | null = null;
    if (inboundCount >= 2 && (inboundCount === 2 || inboundCount % 3 === 0)) {
      extracted = await extractProspectInfo(history, prospect);
      // Fix #7: log extraction failure to qa_log so JM can detect API issues
      if (!extracted) {
        console.warn(`[extract] Failed after 2 attempts for ${prospect.phone} (msg ${inboundCount})`);
        void getSupabaseAdmin().from('qa_log').insert({
          check_type: 'extraction_failure',
          status: 'warning',
          details: JSON.stringify({ phone: prospect.phone, msg_count: inboundCount }),
          detected_by: 'steve-wa-chat',
        });
      } else if (!extracted || Object.keys(extracted).length === 0) {
        // Fix R6-#15: log cuando extractProspectInfo retorna objeto vacío
        console.warn(`[extract] No data extracted for ${prospect.phone} (msg ${inboundCount}) — prospect may be stuck in ${prospect.stage || 'discovery'}`);
      } else {
        console.log(`[extract] Got ${Object.keys(extracted).length} fields for ${prospect.phone}`);
      }
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
            // Fix R4-#7: expand window from 3 → 5 messages + detect explicit correction phrases
            const recentUserMsgs = history
              .filter(m => m.role === 'user')
              .slice(-5) // Was -3
              .map(m => m.content.toLowerCase())
              .join(' ');
            const newValStr = String(newVal).toLowerCase();
            // Check if prospect used a correction phrase in their last message
            const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content.toLowerCase() || '';
            const isCorrecting = /\b(en realidad|es que|perdón|perdon|corrijo|actualmente|ahora vendo|cambié|cambie)\b/.test(lastUserMsg);
            if (!recentUserMsgs.includes(newValStr) && !isCorrecting) {
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
          // Fix #16: log key field changes to CRM timeline (fire & forget)
          const KEY_FIELDS = ['what_they_sell', 'monthly_revenue', 'store_platform', 'is_decision_maker', 'budget_range'];
          if (KEY_FIELDS.includes(field) && existingVal !== newVal && existingVal != null) {
            logProspectEvent(prospect.id, 'field_updated', { field, old: existingVal, new: newVal }, 'steve-extractor').catch(() => {});
          }
          merged[field] = newVal;
        }
      }
    }

    // Consolidate pain points if too many (semantic dedup via Haiku)
    // Fix R6-#8: validar que pain_points sea array antes de consolidar
    if (!Array.isArray(merged.pain_points)) {
      console.warn(`[consolidate] pain_points is not array for ${prospect.phone}:`, typeof merged.pain_points);
      merged.pain_points = [];
    } else if (merged.pain_points.length > 8) {
      merged.pain_points = await consolidatePainPoints(merged.pain_points);
    }

    // Calculate lead score with merged data
    const prospectForScoring = { ...prospect, ...merged };
    const { score, breakdown, stage: newStage } = calculateLeadScore(prospectForScoring);

    // Only advance stage, never go back (exception: 'lost' from no-fit detection)
    // Fix R5-#26: warn if invalid stage detected (not in STAGE_ORDER)
    if (prospect.stage && !(prospect.stage in STAGE_ORDER)) {
      console.warn(`[stage-order] Unknown stage "${prospect.stage}" for ${prospect.phone} — treating as 'new'`);
    }
    if (!(newStage in STAGE_ORDER)) {
      console.warn(`[stage-order] calculateLeadScore returned unknown stage "${newStage}" for ${prospect.phone}`);
    }
    const currentStageOrder = STAGE_ORDER[prospect.stage || 'new'] ?? 0;
    const newStageOrder = STAGE_ORDER[newStage] ?? 0;
    let effectiveStage = newStageOrder > currentStageOrder ? newStage : (prospect.stage || 'discovery');
    // Fix R4-#4: force advance out of discovery if stuck with enough messages + decent score
    // (handles extraction failure loops where score never improves)
    const msgCountForStage = prospect.message_count || 0;
    if (effectiveStage === 'discovery' && msgCountForStage >= 8 && (prospect.lead_score || 0) >= 60) {
      effectiveStage = 'qualifying';
      console.log(`[force-advance] ${prospect.phone} → qualifying (${msgCountForStage} msgs, score=${prospect.lead_score})`);
    }

    // Fix #13: ghosting detection — meeting propuesto hace 3+ días sin agendar → is_rotting = true
    const isGhosting =
      prospect.meeting_status === 'proposed' &&
      prospect.meeting_suggested_at &&
      (Date.now() - new Date(prospect.meeting_suggested_at).getTime()) > 3 * 24 * 60 * 60 * 1000;

    // Fix #9: reset cancelled meeting after 5 days — prospect may be ready again
    const daysSinceCancelled = prospect.meeting_status === 'cancelled' && prospect.meeting_suggested_at
      ? (Date.now() - new Date(prospect.meeting_suggested_at).getTime()) / 86400000
      : 0;
    const shouldResetMeeting = daysSinceCancelled > 5;

    // Build update payload
    const updatePayload: Record<string, any> = {
      ...merged,
      lead_score: score,
      score_breakdown: breakdown,
      stage: effectiveStage,
      last_extracted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      is_rotting: isGhosting ? true : false,
      // Fix #9: reset cancelled meeting status after 5 days (prospect may be ready again)
      ...(shouldResetMeeting && { meeting_status: 'none' }),
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

    // Fix R5-#1: atomic update with updated_at check to prevent race condition
    // If another processProspectAsync already ran, its updated_at will differ → this update is a no-op
    const { data: updatedRows } = await supabase
      .from('wa_prospects')
      .update(updatePayload)
      .eq('id', prospect.id)
      .eq('updated_at', prospect.updated_at || '')
      .select('id');
    if ((updatedRows?.length ?? 0) === 0) {
      console.log(`[processProspectAsync] Race condition detected for ${prospect.phone} — skipping stale update`);
    }

    // CRM Timeline: log stage/score changes (fire & forget)
    if (effectiveStage !== (prospect.stage || 'new')) {
      logProspectEvent(prospect.id, 'stage_change', { from: prospect.stage || 'new', to: effectiveStage }, 'steve');
    }
    if (score !== (prospect.lead_score || 0)) {
      logProspectEvent(prospect.id, 'score_change', { old_score: prospect.lead_score || 0, new_score: score }, 'steve');
    }

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

      // R7-#7: validar que el 'sí' era respuesta a pregunta de reunión
      const isShortAffirmation = /^(sí|si|ya|ok|dale|bueno|claro|perfecto|va|listo)$/i.test(lastUserMsg.trim());
      if (isShortAffirmation) {
        const lastSteveMsg = history.filter((m: any) => m.role === 'assistant').slice(-1)[0]?.content || '';
        const steveWasAskingMeeting = /reunión|agendar|horario|cuándo podemos|cuando podemos|disponible|llamada|zoom|meet/i.test(lastSteveMsg);
        if (!steveWasAskingMeeting) {
          console.log('[meeting] Short affirmation but Steve was not asking about meeting — skipping meeting detection');
          // Skip meeting confirmation logic entirely
          // (fall through — meetingResult won't be used)
        }
      }

      // R7-#27: detectar si el prospecto propone alternativa de horario vs rechazar
      const proposesAlternativeTime = /mejor (el|la|los|las)|prefiero|¿qué tal|qué tal|en vez|en lugar|podría ser|sería mejor|(lunes|martes|miércoles|jueves|viernes|sábado|domingo)|(\d{1,2})(am|pm|:00)/i.test(lastUserMsg);
      const hasRejection = /no (puedo|quiero|tengo tiempo)|no me viene|no me sale|no es buen|cancelar|no va a ser posible/i.test(lastUserMsg);

      if (proposesAlternativeTime && !hasRejection) {
        console.log(`[meeting] Prospect propone alternativa de horario para ${prospect.phone} — manteniendo en 'proposed'`);
        // NO transicionar a 'deferred' — mantener 'proposed' para que Steve coordine
        // (skip the meetingResult.rejected branch by not calling detectMeetingConfirmation with rejection)
      }

      const meetingResult = await detectMeetingConfirmation(lastUserMsg, history);
      // Fix R6-#20: loguear resultado de detectMeetingConfirmation para debugging
      console.log(`[meeting-confirm] phone=${prospect.phone}`, {
        confirmed: meetingResult.confirmed,
        rejected: meetingResult.rejected,
        proposedTime: meetingResult.proposedTime ?? 'none',
        input: lastUserMsg.slice(0, 80),
      });

      if (meetingResult.confirmed && meetingResult.proposedTime) {
        // R7-#19: al confirmar reunión, verificar si se acordó presupuesto
        const hasClearBudget = prospect.budget_range &&
          /\$|\d{3,}|millón|mil\b|[kK]\b/.test(prospect.budget_range);

        if (!hasClearBudget) {
          console.warn(`[meeting] Reunión confirmada sin presupuesto claro para ${prospect.phone}`);
          // Flag guardado en updatePayload más abajo cuando procesamos el update
        }

        // Prospect confirmed a time via text — parse it and save as scheduled
        // The booking API handles Calendar + Meet when prospect books via link.
        // This fallback handles text-based confirmations (no link was used).
        const meetingDate = await parseMeetingTime(meetingResult.proposedTime);
        // Fix R4-#12: CRITICAL — only save meeting if date is in the future
        // Fix R6-#19: comparar en timezone Chile (UTC-3/UTC-4)
        const chileNow = new Date(
          new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
        );
        if (meetingDate && meetingDate.getTime() > chileNow.getTime()) {
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
        } else if (meetingDate && meetingDate.getTime() <= chileNow.getTime()) {
          console.warn(`[meeting-confirm] Rejected past date: ${meetingDate.toISOString()} for ${prospect.phone}`);
        }

        if (meetingDate && meetingDate.getTime() > chileNow.getTime()) {
          // If there's an assigned seller, create Calendar event via booking API
          if (prospect.assigned_seller_id) {
            const bookingApiUrl = process.env.CLOUD_RUN_URL || 'http://localhost:8080';
            if (bookingApiUrl && !bookingApiUrl.startsWith('https://') && !bookingApiUrl.startsWith('http://localhost')) {
              console.warn('[steve-wa] Invalid booking URL (not HTTPS):', bookingApiUrl);
              // Skip booking confirmation — SSRF protection
            } else {
              fetch(`${bookingApiUrl}/api/booking/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({
                  seller_id: prospect.assigned_seller_id,
                  slot_start: meetingDate.toISOString(),
                  prospect_name: prospect.name || prospect.profile_name || 'Prospecto',
                  prospect_phone: prospect.phone,
                  prospect_id: prospect.id,
                }),
              }).catch(err => console.error('[meeting-confirm] Booking API error:', err));
            }
          }

          logProspectEvent(prospect.id, 'meeting_booked', { meeting_at: meetingDate.toISOString(), method: 'text_confirmation' }, 'steve');
          console.log(`[prospect ${prospect.phone}] Meeting scheduled via text: ${meetingDate.toISOString()}`);
        }
      } else if (meetingResult.rejected) {
        // R7-#27: Si el prospecto propone alternativa de horario, NO es rechazo — mantener en 'proposed'
        const lastMsgForAlt = history.filter((m: any) => m.role === 'user').slice(-1)[0]?.content || '';
        const proposesAlternativeForReject = /mejor (el|la|los|las)|prefiero|¿qué tal|qué tal|en vez|en lugar|podría ser|sería mejor|(lunes|martes|miércoles|jueves|viernes|sábado|domingo)|(\d{1,2})(am|pm|:00)/i.test(lastMsgForAlt);
        const hasExplicitRejection = /no (puedo|quiero|tengo tiempo)|no me viene|no me sale|no es buen|cancelar|no va a ser posible/i.test(lastMsgForAlt);

        if (proposesAlternativeForReject && !hasExplicitRejection) {
          console.log(`[meeting] Prospect propone alternativa de horario para ${prospect.phone} — manteniendo en 'proposed', no marcando como deferred`);
          // No cambiamos meeting_status — el prospecto está cooperando, solo propone otro horario
        } else {
          // Fix #12: two-level rejection — deferred first, cancelled only on confirmed second rejection
          const prevMeetingStatus = prospect.meeting_status;
          const newMeetingStatus = prevMeetingStatus === 'deferred' ? 'cancelled' : 'deferred';
          await supabase
            .from('wa_prospects')
            .update({
              meeting_status: newMeetingStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', prospect.id);
          const eventName = newMeetingStatus === 'cancelled' ? 'meeting_cancelled' : 'meeting_deferred';
          logProspectEvent(prospect.id, eventName, { reason: 'prospect_rejected', prev_status: prevMeetingStatus }, 'steve');
          console.log(`[prospect ${prospect.phone}] Meeting ${newMeetingStatus} (was: ${prevMeetingStatus})`);
        }
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
    const missing = !APIFY_TOKEN ? 'APIFY_TOKEN' : 'ANTHROPIC_API_KEY';
    console.warn(`[prospect-audit] Missing ${missing}`);
    // Fix R5-#14: log to qa_log for visibility (silent failures are invisible to JM)
    void getSupabaseAdmin().from('qa_log').insert({
      check_type: 'missing_service_token',
      status: 'warning',
      details: JSON.stringify({ missing, prospect_id: prospectId, url }),
      detected_by: 'audit-prospect-url',
    });
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
      signal: AbortSignal.timeout(30000),
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
      // Apify actor-runs GET requires token in URL (not supported in Authorization header for this endpoint)
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`, {
        signal: AbortSignal.timeout(30000),
      });
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
    // Apify dataset items GET requires token in URL (not supported in Authorization header for this endpoint)
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=3`, {
      signal: AbortSignal.timeout(30000),
    });

    // Size check before parsing — reject oversized responses
    const itemsText = await itemsRes.text();
    if (itemsText.length > 1024 * 1024) {
      console.warn('[steve-wa] Apify response too large:', itemsText.length, 'bytes');
      return;
    }
    const items = JSON.parse(itemsText) as any[];

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
  // Fix R5-#10: filter null/empty content before merging to avoid literal "null" strings
  const validMsgs = msgs.filter(m => m.content != null && String(m.content).trim() !== '');
  for (const msg of validMsgs) {
    const content = String(msg.content || '');
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n' + content;
    } else {
      merged.push({ role: msg.role, content });
    }
  }

  // Fix R6-#18: filtrar mensajes vacíos DESPUÉS del merge también
  const result = merged.filter(m => m.content.trim() !== '');
  // Asegurar que el primer mensaje es 'user' (Anthropic lo requiere)
  while (result.length > 0 && result[0].role !== 'user') {
    result.shift();
  }
  if (result.length === 0) return [{ role: 'user', content: 'Hola' }];

  if (result[result.length - 1].role !== 'user') {
    result.push({ role: 'user', content: '...' });
  }

  return result;
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
  // Fix R6-#4: trim both head and tail to avoid leading/trailing whitespace
  return {
    head: text.slice(0, maxLen).trim(),
    tail: text.slice(maxLen).trim() || '',
  };
}

// Fix R5-#8: cleanup stale rate limit entries every 1 minute (was 5m), cutoff = 1x RATE_LIMIT (was 2x)
// Fix R6-#16: guard para evitar duplicar interval en redeploy
// Fix R6-#28: intervalo 30s en vez de 60s para limpiar más frecuente
let _rateLimitCleanupInterval: NodeJS.Timeout | null = null;
if (!_rateLimitCleanupInterval) {
  _rateLimitCleanupInterval = setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_MS;
    for (const [phone, time] of lastResponseTime) {
      if (time < cutoff) lastResponseTime.delete(phone);
    }
  }, 30_000);
}
