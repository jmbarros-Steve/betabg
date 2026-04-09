import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { decryptToken } from './setup-merchant.js';

/**
 * Merchant WA Webhook — When a CUSTOMER writes to a merchant's WhatsApp number.
 * Steve responds as the store, using the merchant's brand voice and product data.
 *
 * Route: POST /api/whatsapp/merchant-wa/:clientId
 * Auth: None (Twilio webhook, form-encoded)
 */

const MERCHANT_WA_SYSTEM_PROMPT = `Eres el asistente de atención al cliente de esta tienda.
Respondes como si fueras la tienda, NO como Steve Ads.
El cliente NO sabe que está hablando con IA.

REGLAS:
- Respuestas cortas (WhatsApp, no email)
- Si preguntan por stock/precio → responder con datos reales
- Si preguntan por estado de pedido → responder con datos reales
- Si hacen un reclamo → ESCALAR
- Si quieren comprar → mandar link directo
- Habla en español chileno natural
- NUNCA digas que eres IA, bot, o Steve Ads
- NUNCA inventes información

ESCALAR CUANDO:
- Reclamos o problemas con pedidos
- Solicitudes de devolución/reembolso
- Preguntas que no puedes responder
- El cliente pide hablar con una persona

Si debes escalar, incluye exactamente [ESCALAR] al inicio de tu respuesta.
Si puedes responder normalmente, responde directo sin tags.`;

async function buildMerchantContext(clientId: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const client = await safeQuerySingleOrDefault<any>(
    supabase
      .from('clients')
      .select('name, company, shop_domain')
      .eq('id', clientId)
      .maybeSingle(),
    null,
    'merchantWa.buildContext.getClient',
  );

  // Brand brief
  const brief = await safeQuerySingleOrDefault<any>(
    supabase
      .from('brand_research')
      .select('research_data')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    null,
    'merchantWa.buildContext.getBrief',
  );

  const brandInfo = brief?.research_data
    ? JSON.stringify(brief.research_data).slice(0, 800)
    : '';

  // Products (top 20 by price for quick lookup)
  const products = await safeQueryOrDefault<any>(
    supabase
      .from('shopify_products')
      .select('title, price, status')
      .eq('shop_id', clientId)
      .eq('status', 'active')
      .order('price', { ascending: false })
      .limit(20),
    [],
    'merchantWa.buildContext.getProducts',
  );

  const productList = products.length
    ? products.map((p: any) => `- ${p.title}: $${p.price}`).join('\n')
    : 'Sin productos cargados.';

  return `TIENDA: ${client?.company || client?.name || 'N/A'}
SITIO: ${client?.shop_domain || 'N/A'}
${brandInfo ? `MARCA: ${brandInfo}\n` : ''}
PRODUCTOS:
${productList}`;
}

async function getConversationHistory(
  clientId: string,
  contactPhone: string,
  limit = 8,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = getSupabaseAdmin();

  const messages = await safeQueryOrDefault<any>(
    supabase
      .from('wa_messages')
      .select('direction, body')
      .eq('client_id', clientId)
      .eq('channel', 'merchant_wa')
      .eq('contact_phone', contactPhone)
      .order('created_at', { ascending: true })
      .limit(limit),
    [],
    'merchantWa.getHistory.getMessages',
  );

  if (!messages.length) return [];

  return messages
    .filter((m: any) => m.body)
    .map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.body,
    }));
}

export async function merchantWAWebhook(c: Context) {
  const supabase = getSupabaseAdmin();
  const clientId = c.req.param('clientId') || '';

  try {
    const body = await c.req.parseBody();
    const from = String(body['From'] || '');
    const messageBody = String(body['Body'] || '');
    const profileName = String(body['ProfileName'] || '');
    const messageSid = String(body['MessageSid'] || '');

    if (!from || !messageBody) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    const phone = from.replace('whatsapp:', '').replace('+', '').trim();

    // Get merchant's WA account
    const waAccount = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_twilio_accounts')
        .select('phone_number')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .single(),
      null,
      'merchantWa.webhook.getWaAccount',
    );

    if (!waAccount) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // Save inbound message
    await supabase.from('wa_messages').insert({
      client_id: clientId,
      channel: 'merchant_wa',
      direction: 'inbound',
      from_number: phone,
      to_number: waAccount.phone_number,
      body: messageBody,
      message_sid: messageSid,
      contact_name: profileName,
      contact_phone: phone,
    });

    // Upsert conversation
    const existingConv = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_conversations')
        .select('id, unread_count, assigned_to')
        .eq('client_id', clientId)
        .eq('channel', 'merchant_wa')
        .eq('contact_phone', phone)
        .single(),
      null,
      'merchantWa.webhook.getExistingConv',
    );

    if (existingConv) {
      await supabase
        .from('wa_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: messageBody.substring(0, 100),
          unread_count: (existingConv.unread_count || 0) + 1,
          status: 'open',
        })
        .eq('id', existingConv.id);
    } else {
      await supabase.from('wa_conversations').insert({
        client_id: clientId,
        channel: 'merchant_wa',
        contact_phone: phone,
        contact_name: profileName,
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: messageBody.substring(0, 100),
        unread_count: 1,
        assigned_to: 'steve',
      });
    }

    // If conversation is assigned to human (escalated), don't auto-reply
    if (existingConv?.assigned_to === 'human') {
      // Notify merchant via Steve Chat that their customer wrote
      const { sendWhatsApp } = await import('../../lib/twilio-client.js');
      const merchant = await safeQuerySingleOrDefault<any>(
        supabase
          .from('clients')
          .select('phone')
          .eq('id', clientId)
          .single(),
        null,
        'merchantWa.webhook.getMerchantForNotify',
      );

      if (merchant?.phone) {
        await sendWhatsApp(
          `whatsapp:+${merchant.phone}`,
          `${profileName || phone} te escribio: "${messageBody.slice(0, 80)}"\nResponde en app.steveads.com/portal (tab WhatsApp)`,
        ).catch(() => {}); // Don't fail if notification fails
      }

      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // Check credits BEFORE calling Claude (Issue 3: don't waste AI credits if no WA credits)
    const creditCheck = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_credits')
        .select('balance')
        .eq('client_id', clientId)
        .single(),
      null,
      'merchantWa.webhook.getCreditCheck',
    );

    if (!creditCheck || creditCheck.balance < 1) {
      // No credits — send fallback without calling AI
      const fallback = 'Gracias por tu mensaje, te responderemos pronto.';
      await supabase.from('wa_messages').insert({
        client_id: clientId,
        channel: 'merchant_wa',
        direction: 'outbound',
        from_number: waAccount.phone_number,
        to_number: phone,
        body: fallback,
        contact_name: profileName,
        contact_phone: phone,
        credits_used: 0,
      });
      const escaped = fallback.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return c.text(`<Response><Message>${escaped}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    // Race-condition fix: Deduct credit ATOMICALLY before AI call.
    // deduct_wa_credit uses UPDATE ... WHERE balance >= p_amount, so two concurrent
    // webhook calls cannot both succeed — the second one gets insufficient_credits.
    const { data: deductResult } = await supabase.rpc('deduct_wa_credit', {
      p_client_id: clientId,
      p_amount: 1,
      p_description: `Respuesta a ${profileName || phone}`,
    });

    const deductData = deductResult as any;
    if (!deductData?.success) {
      // Atomic deduction failed (concurrent request consumed the last credit)
      const fallback = 'Gracias por tu mensaje, te responderemos pronto.';
      await supabase.from('wa_messages').insert({
        client_id: clientId,
        channel: 'merchant_wa',
        direction: 'outbound',
        from_number: waAccount.phone_number,
        to_number: phone,
        body: fallback,
        contact_name: profileName,
        contact_phone: phone,
        credits_used: 0,
      });
      const escaped = fallback.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return c.text(`<Response><Message>${escaped}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
    }

    // Credit deducted — proceed with AI call. If anything fails critically, we still
    // send a fallback reply (credit was legitimately used for the response attempt).
    // Build context and generate response
    const [context, history] = await Promise.all([
      buildMerchantContext(clientId),
      getConversationHistory(clientId, phone),
    ]);

    // Ensure alternating roles
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of history) {
      if (messages.length > 0 && messages[messages.length - 1].role === msg.role) {
        messages[messages.length - 1].content += '\n' + msg.content;
      } else {
        messages.push({ ...msg });
      }
    }
    if (messages.length === 0 || messages[messages.length - 1].content !== messageBody) {
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages[messages.length - 1].content += '\n' + messageBody;
      } else {
        messages.push({ role: 'user', content: messageBody });
      }
    }
    if (messages[0]?.role !== 'user') {
      messages.unshift({ role: 'user', content: messageBody });
    }

    let replyText: string;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[merchant-wa] ANTHROPIC_API_KEY not set');
      // Refund credit — config error means we can't provide AI service
      const { error: refundErr } = await supabase.rpc('deduct_wa_credit', {
        p_client_id: clientId,
        p_amount: -1,
        p_description: `Refund: config error para ${profileName || phone}`,
      });
      if (refundErr) {
        console.warn('[merchant-wa] deduct_wa_credit refund failed, using direct update:', refundErr);
        await supabase
          .from('wa_credits')
          .update({ balance: (deductData.new_balance ?? 0) + 1 })
          .eq('client_id', clientId);
      }
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    const systemPrompt = `${MERCHANT_WA_SYSTEM_PROMPT}\n\n${context}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt.slice(0, 6000),
        messages,
      }),
    });

    if (!aiRes.ok) {
      console.error('[merchant-wa] Claude API error:', aiRes.status);
      replyText = 'Gracias por tu mensaje, te responderemos pronto.';
    } else {
      const aiData: any = await aiRes.json();
      replyText = (aiData.content?.[0]?.text || '')
        .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
        .trim() || 'Gracias por tu mensaje, te responderemos pronto.';
    }

    // Check if Steve wants to escalate
    const shouldEscalate = replyText.includes('[ESCALAR]');

    if (shouldEscalate) {
      // Escalate to human
      await supabase
        .from('wa_conversations')
        .update({ status: 'escalated', assigned_to: 'human' })
        .eq('client_id', clientId)
        .eq('channel', 'merchant_wa')
        .eq('contact_phone', phone);

      // Notify merchant
      const { sendWhatsApp } = await import('../../lib/twilio-client.js');
      const merchant = await safeQuerySingleOrDefault<any>(
        supabase
          .from('clients')
          .select('phone, name')
          .eq('id', clientId)
          .single(),
        null,
        'merchantWa.webhook.getMerchantForEscalate',
      );

      if (merchant?.phone) {
        await sendWhatsApp(
          `whatsapp:+${merchant.phone}`,
          `${merchant.name}, ${profileName || phone} necesita atencion humana:\n"${messageBody.slice(0, 100)}"\nResponde en app.steveads.com/portal`,
        ).catch(() => {});
      }

      // Send a hold message to the customer
      replyText = 'Gracias por tu mensaje, un momento por favor. Te responderemos enseguida.';
    }

    // Truncate for WA
    if (replyText.length > 1500) replyText = replyText.slice(0, 1497) + '...';
    replyText = replyText.replace('[ESCALAR]', '').trim();

    // Save outbound
    await supabase.from('wa_messages').insert({
      client_id: clientId,
      channel: 'merchant_wa',
      direction: 'outbound',
      from_number: waAccount.phone_number,
      to_number: phone,
      body: replyText,
      contact_name: profileName,
      contact_phone: phone,
      credits_used: 1,
    });

    // Update conversation preview
    await supabase.from('wa_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: replyText.substring(0, 100),
      })
      .eq('client_id', clientId)
      .eq('channel', 'merchant_wa')
      .eq('contact_phone', phone);

    const escaped = replyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return c.text(`<Response><Message>${escaped}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });

  } catch (error: any) {
    console.error('[merchant-wa] Error:', error?.message, error?.stack);
    // Return a fallback TwiML response so the customer gets a reply even on error.
    // Empty <Response></Response> silently drops the customer's message with no reply.
    const fallback = 'Gracias por tu mensaje, te responderemos pronto.';
    const escaped = fallback.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return c.text(`<Response><Message>${escaped}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });
  }
}
