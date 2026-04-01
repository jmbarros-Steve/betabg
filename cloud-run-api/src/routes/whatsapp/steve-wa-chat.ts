import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import {
  WA_SYSTEM_PROMPT,
  buildWAContext,
  getWAHistory,
  getProspectHistory,
  loadRelevantKnowledge,
  buildDynamicSalesPrompt,
  buildEnrichedProspectContext,
  extractProspectInfo,
  calculateLeadScore,
  generateConversationSummary,
  pushToHubSpot,
  detectDisqualification,
  detectBuyingSignals,
  loadIndustryCaseStudy,
  type ProspectRecord,
} from '../../lib/steve-wa-brain.js';
import { sendWhatsApp, sendWhatsAppMedia } from '../../lib/twilio-client.js';
import { type CaseStudyResult } from '../../lib/steve-wa-brain.js';
import { runInvestigator, runStrategist, runConversationalist } from '../../lib/steve-multi-brain.js';
import { investigateProspectBackground } from '../../lib/steve-investigator.js';
import { generateProspectMockup } from '../../lib/steve-mockup-generator.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

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
    const messageBody = String(body['Body'] || '');
    const profileName = String(body['ProfileName'] || '');
    const messageSid = String(body['MessageSid'] || '');

    if (!from || !messageBody) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // Extract clean phone number
    const phone = from.replace('whatsapp:', '').replace('+', '').trim();

    // Identify merchant by whatsapp_phone (with and without + prefix)
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, company, whatsapp_phone')
      .or(`whatsapp_phone.eq.${phone},whatsapp_phone.eq.+${phone},whatsapp_phone.eq.+56${phone.replace(/^56/, '')}`)
      .limit(1)
      .maybeSingle();

    if (!client) {
      // Unknown number — AI sales funnel for prospects
      return handleProspect(c, supabase, phone, messageBody, profileName, messageSid);
    }

    // Save inbound message
    await supabase.from('wa_messages').insert({
      client_id: client.id,
      channel: 'steve_chat',
      direction: 'inbound',
      from_number: phone,
      to_number: STEVE_WA_NUMBER,
      body: messageBody,
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

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt.slice(0, 12000),
        messages: sanitized,
      }),
    });

    let replyText: string;

    if (!aiResponse.ok) {
      console.error('[steve-wa-chat] Claude API error:', aiResponse.status);
      replyText = 'Perdón, tuve un momento de confusión 🐕 ¿Me repites eso?';
    } else {
      const aiData: any = await aiResponse.json();
      const rawMsg = aiData.content?.[0]?.text || '';
      replyText = rawMsg
        .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
        .trim() || 'Woof, no pude procesar eso. ¿Me lo dices de otra forma?';
    }

    // Truncate for WhatsApp (1600 char limit)
    if (replyText.length > 1500) {
      replyText = replyText.slice(0, 1497) + '...';
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
) {
  try {
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

    // 2. Save inbound message
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'inbound',
      from_number: phone,
      to_number: STEVE_WA_NUMBER,
      body: messageBody,
      message_sid: messageSid,
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // 3. Load history
    const history = await getProspectHistory(phone, 10);

    // Build messages array for Claude
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [...history];
    if (messages.length === 0 || messages[messages.length - 1].content !== messageBody) {
      messages.push({ role: 'user', content: messageBody });
    }
    const sanitized = sanitizeForClaude(messages);

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      const twiml = `<Response><Message>Woof, tuve un problema técnico 🐕 Intenta de nuevo en un momento.</Message></Response>`;
      return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
    }

    let replyText: string;

    try {
      // ============================================================
      // MULTI-BRAIN PIPELINE
      // Step 1: Investigator + Dynamic Prompt in PARALLEL (~1s)
      // ============================================================
      const [investigatorResults, dynamicPrompt] = await Promise.all([
        runInvestigator(prospect),
        buildDynamicSalesPrompt(prospect, messageBody, history),
      ]);

      // Step 2: Strategist (~1.5s)
      const strategistBrief = await runStrategist(prospect, history, investigatorResults);

      // Step 3: Conversationalist with strategist brief (~3-5s)
      replyText = await runConversationalist(history, strategistBrief, dynamicPrompt, sanitized);

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
      const dynamicPrompt = await buildDynamicSalesPrompt(prospect, messageBody, history);
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: dynamicPrompt,
          messages: sanitized,
        }),
      });
      if (!aiResponse.ok) {
        replyText = 'Hola! Soy Steve 🐕 Tu asistente de marketing AI. ¿En qué te puedo ayudar?';
      } else {
        const aiData: any = await aiResponse.json();
        const rawMsg = aiData.content?.[0]?.text || '';
        replyText = rawMsg
          .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
          .trim() || 'Hola! Soy Steve 🐕 ¿Tienes una tienda online? Te puedo ayudar con tu marketing.';
      }
    }

    // Paso 13: Detect human escalation requests
    const lowerMsg = messageBody.toLowerCase();
    const humanEscalationTriggers = ['hablar con alguien', 'persona real', 'habla con alguien', 'agente humano', 'quiero hablar con una persona', 'asesor'];
    if (humanEscalationTriggers.some(t => lowerMsg.includes(t))) {
      replyText = 'Entendido, te conecto con José Manuel. Te va a escribir pronto por este mismo chat.';
      // Fire & forget: create escalation task
      supabase.from('tasks').insert({
        title: `[ESCALAR] Prospecto ${phone} pidió hablar con humano`,
        description: `El prospecto solicitó hablar con una persona real. Mensaje: "${messageBody}"`,
        priority: 'high',
        status: 'pending',
        assigned_to: '3d195082-aa83-48c0-b514-a8052264a1e7',
        created_at: new Date().toISOString(),
      }).catch(() => {});
    }

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
      }).catch(() => {});
    }

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
            max_tokens: 400,
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

    // Paso 6: Double text — split on [SPLIT]
    let firstReply = replyText;
    let secondReply: string | null = null;
    if (replyText.includes('[SPLIT]')) {
      const parts = replyText.split('[SPLIT]').map(p => p.trim()).filter(Boolean);
      firstReply = parts[0] || replyText;
      secondReply = parts[1] || null;
    }

    // Truncate to 400 chars for prospects (WhatsApp = short messages)
    if (firstReply.length > 400) {
      firstReply = firstReply.slice(0, 397) + '...';
    }
    if (secondReply && secondReply.length > 400) {
      secondReply = secondReply.slice(0, 397) + '...';
    }

    // 5. Save outbound message (first part)
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: firstReply,
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // Paso 6: Send second message via Twilio (fire & forget, 2s delay)
    if (secondReply) {
      const secondMsg = secondReply;
      setTimeout(async () => {
        try {
          await sendWhatsApp(`+${phone}`, secondMsg);
          await supabase.from('wa_messages').insert({
            client_id: null,
            channel: 'prospect',
            direction: 'outbound',
            from_number: STEVE_WA_NUMBER,
            to_number: phone,
            body: secondMsg,
            contact_name: profileName || phone,
            contact_phone: phone,
          });
        } catch (err) {
          console.error('[steve-wa-chat] Double text send error:', err);
        }
      }, 2000);
    }

    // 6. Reply via TwiML — user gets response HERE
    const escapedReply = firstReply
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const twiml = `<Response><Message>${escapedReply}</Message></Response>`;

    // Paso 20: Wingman — detect [GENERATE_COPY:description] and send copy as extra msg
    const copyMatch = (firstReply + (secondReply || '')).match(/\[GENERATE_COPY:([^\]]+)\]/);
    if (copyMatch) {
      const copyDesc = copyMatch[1].trim();
      // Remove the tag from the reply
      firstReply = firstReply.replace(/\[GENERATE_COPY:[^\]]+\]/g, '').trim();
      if (secondReply) secondReply = secondReply.replace(/\[GENERATE_COPY:[^\]]+\]/g, '').trim();

      // Fire & forget: generate copy and send as extra message
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (ANTHROPIC_KEY) {
        const industry = prospect.what_they_sell || 'e-commerce';
        setTimeout(async () => {
          try {
            const copyRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 400,
                messages: [{
                  role: 'user',
                  content: `Genera un copy de anuncio de Meta Ads para una marca de ${industry}. Descripción: ${copyDesc}. Formato:\n🎯 Headline: ...\n📝 Texto principal: ...\n🔗 Descripción: ...\n📲 CTA: ...\nMáximo 300 caracteres total. Español neutro.`,
                }],
              }),
            });
            if (!copyRes.ok) return;
            const copyData: any = await copyRes.json();
            const copyText = (copyData.content?.[0]?.text || '').trim();
            if (!copyText) return;

            await sendWhatsApp(`+${phone}`, `Acá te va un ejemplo de copy gratis 🎁:\n\n${copyText}`);
            await supabase.from('wa_messages').insert({
              client_id: null, channel: 'prospect', direction: 'outbound',
              from_number: STEVE_WA_NUMBER, to_number: phone,
              body: `Acá te va un ejemplo de copy gratis 🎁:\n\n${copyText}`,
              contact_name: profileName || phone, contact_phone: phone,
            });
          } catch (err) {
            console.error('[wingman-copy] Error:', err);
          }
        }, 4000); // 4s delay after main reply
      }
    }

    // Paso: Handle [SEND_CASE_STUDY] tag — send case study with media
    const caseStudyTag = (firstReply + (secondReply || '')).includes('[SEND_CASE_STUDY]');
    if (caseStudyTag) {
      firstReply = firstReply.replace(/\[SEND_CASE_STUDY\]/g, '').trim();
      if (secondReply) secondReply = secondReply.replace(/\[SEND_CASE_STUDY\]/g, '').trim();

      // Fire & forget: load case study and send media
      const sellsWhat = prospect.what_they_sell;
      setTimeout(async () => {
        try {
          const caseStudy = await loadIndustryCaseStudy(sellsWhat);
          if (caseStudy) {
            const msg = `📊 ${caseStudy.title}\n\n${caseStudy.summary}`;
            if (caseStudy.mediaUrl) {
              await sendWhatsAppMedia(`+${phone}`, msg, caseStudy.mediaUrl);
            } else {
              await sendWhatsApp(`+${phone}`, msg);
            }
            await supabase.from('wa_messages').insert({
              client_id: null, channel: 'prospect', direction: 'outbound',
              from_number: STEVE_WA_NUMBER, to_number: phone,
              body: msg, contact_name: profileName || phone, contact_phone: phone,
            });
          }
        } catch (err) {
          console.error('[send-case-study] Error:', err);
        }
      }, 3000);
    }

    // Safety: strip any [ACTIVATE_TRIAL] tag if it leaks through (Steve NEVER creates free accounts)
    firstReply = firstReply.replace(/\[ACTIVATE_TRIAL:[^\]]*\]/g, '').trim();
    if (secondReply) secondReply = secondReply.replace(/\[ACTIVATE_TRIAL:[^\]]*\]/g, '').trim();

    // Paso: Handle [SEND_MOCKUP] tag — generate and send ad mockup
    const mockupTag = (firstReply + (secondReply || '')).includes('[SEND_MOCKUP]');
    if (mockupTag) {
      firstReply = firstReply.replace(/\[SEND_MOCKUP\]/g, '').trim();
      if (secondReply) secondReply = secondReply.replace(/\[SEND_MOCKUP\]/g, '').trim();

      // Fire & forget: generate mockup with Gemini and send via WA (5s delay)
      setTimeout(async () => {
        try {
          await generateProspectMockup(prospect, phone, profileName);
        } catch (err) {
          console.error('[send-mockup] Error:', err);
        }
      }, 5000);
    }

    // Auto-trigger mockup: pitching/closing + has product_images + not sent yet
    if (
      !mockupTag &&
      (prospect.stage === 'pitching' || prospect.stage === 'closing') &&
      (prospect as any).investigation_data?.store?.product_images?.length &&
      !(prospect as any).mockup_sent
    ) {
      setTimeout(async () => {
        try {
          await generateProspectMockup(prospect, phone, profileName);
        } catch (err) {
          console.error('[auto-mockup] Error:', err);
        }
      }, 5000);
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

    // Paso 2: Detect disqualification → mark as lost
    const disqResult = detectDisqualification(messageBody, history);

    // Paso 17: Detect URL in prospect message
    const urlMatch = messageBody.match(/https?:\/\/[^\s]+/);

    processProspectAsync(prospect, fullHistory, meetingLinkSent, disqResult.disqualified ? disqResult.reason : undefined, urlMatch?.[0]).catch(err => {
      console.error('[steve-wa-chat] processProspectAsync error:', err);
    });

    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });

  } catch (error: any) {
    console.error('[steve-wa-chat] Prospect handler error:', error);
    const twiml = `<Response><Message>Hola! Soy Steve 🐕 el asistente de marketing de Steve Ads. Visita steve.cl para conocer más!</Message></Response>`;
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

    // Paso 10: Skip extraction if < 3 inbound messages (not enough info in "Hola" and "sí")
    const inboundCount = history.filter(m => m.role === 'user').length;

    let extracted: Record<string, any> | null = null;
    if (inboundCount >= 3) {
      extracted = await extractProspectInfo(history, prospect);
    }

    // Merge new data with existing — Paso 7: protect against weak overwrites
    const merged: Record<string, any> = {};

    if (extracted) {
      const mergeFields = [
        'name', 'email', 'company', 'what_they_sell', 'monthly_revenue',
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

        // For arrays, merge with existing
        if (Array.isArray(newVal) && Array.isArray(existingVal)) {
          merged[field] = [...new Set([...existingVal, ...newVal])];
        } else {
          merged[field] = newVal;
        }
      }
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

    // Update prospect in DB
    await supabase
      .from('wa_prospects')
      .update(updatePayload)
      .eq('id', prospect.id);

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
