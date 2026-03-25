import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { WA_SYSTEM_PROMPT, WA_SALES_PROMPT, buildWAContext, getWAHistory, buildProspectContext, getProspectHistory, loadRelevantKnowledge } from '../../lib/steve-wa-brain.js';

const STEVE_WA_NUMBER = process.env.TWILIO_PHONE_NUMBER || process.env.STEVE_WA_NUMBER || '';

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
 * Handle messages from unknown numbers — AI sales funnel.
 * Upserts prospect, saves messages, calls Claude Haiku for sales conversation.
 */
async function handleProspect(c: Context, supabase: any, phone: string, messageBody: string, profileName: string, messageSid: string) {
  try {
    // 1. Upsert prospect
    const { data: prospect } = await supabase
      .from('wa_prospects')
      .upsert({
        phone,
        profile_name: profileName || null,
        stage: 'talking',
        source: 'whatsapp',
      }, { onConflict: 'phone' })
      .select()
      .single();

    // Increment message count
    if (prospect) {
      await supabase
        .from('wa_prospects')
        .update({
          message_count: (prospect.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);
    }

    // 2. Save inbound message (client_id = null for prospects)
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

    // 3. Load prospect history + relevant knowledge in parallel
    const [history, knowledgeText] = await Promise.all([
      getProspectHistory(phone, 10),
      loadRelevantKnowledge(messageBody),
    ]);

    // Build messages array
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [...history];
    if (messages.length === 0 || messages[messages.length - 1].content !== messageBody) {
      messages.push({ role: 'user', content: messageBody });
    }
    const sanitized = sanitizeForClaude(messages);

    // 4. Call Claude Haiku for sales response
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      const twiml = `<Response><Message>Woof, tuve un problema técnico 🐕 Intenta de nuevo en un momento.</Message></Response>`;
      return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
    }

    const prospectContext = buildProspectContext(prospect || { stage: 'new', message_count: 0 });
    let systemPrompt = `${WA_SALES_PROMPT}\n\n${prospectContext}`;
    if (knowledgeText) {
      systemPrompt += `\n\n${knowledgeText}`;
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: sanitized,
      }),
    });

    let replyText: string;

    if (!aiResponse.ok) {
      console.error('[steve-wa-chat] Claude Haiku API error:', aiResponse.status);
      replyText = 'Hola! Soy Steve 🐕 Tu asistente de marketing AI. ¿En qué te puedo ayudar? Escríbeme y te cuento todo sobre la plataforma.';
    } else {
      const aiData: any = await aiResponse.json();
      const rawMsg = aiData.content?.[0]?.text || '';
      replyText = rawMsg
        .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
        .trim() || 'Hola! Soy Steve 🐕 ¿Tienes una tienda online? Te puedo ayudar con tu marketing.';
    }

    if (replyText.length > 1500) {
      replyText = replyText.slice(0, 1497) + '...';
    }

    // 5. Save outbound message
    await supabase.from('wa_messages').insert({
      client_id: null,
      channel: 'prospect',
      direction: 'outbound',
      from_number: STEVE_WA_NUMBER,
      to_number: phone,
      body: replyText,
      contact_name: profileName || phone,
      contact_phone: phone,
    });

    // 6. Reply via TwiML
    const escapedReply = replyText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const twiml = `<Response><Message>${escapedReply}</Message></Response>`;
    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });

  } catch (error: any) {
    console.error('[steve-wa-chat] Prospect handler error:', error);
    const twiml = `<Response><Message>Hola! Soy Steve 🐕 el asistente de marketing de Steve Ads. Visita steve.cl para conocer más!</Message></Response>`;
    return c.text(twiml, 200, { 'Content-Type': 'text/xml' });
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
