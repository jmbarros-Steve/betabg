import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { decryptToken } from './setup-merchant.js';
import { scrubPII } from '../../lib/pii-scrubber.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

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

// Bug #137 fix: In-memory rate limiter — 10s cooldown per phone to prevent spam burning credits
const merchantRateLimit = new Map<string, number>();
const MERCHANT_RATE_LIMIT_MS = 10_000; // 10 seconds

// Cleanup stale entries every 5 minutes
let _merchantRateLimitCleanup: NodeJS.Timeout | null = null;
if (!_merchantRateLimitCleanup) {
  _merchantRateLimitCleanup = setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 min
    for (const [phone, time] of merchantRateLimit) {
      if (time < cutoff) merchantRateLimit.delete(phone);
    }
  }, 5 * 60 * 1000); // every 5 min
}

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
  // Bug #181 fix: shop_id doesn't exist on shopify_products — use client_id (FK to clients.id).
  // Also fix column name: shopify_products has price_min, not price.
  const products = await safeQueryOrDefault<any>(
    supabase
      .from('shopify_products')
      .select('title, price_min, status')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('price_min', { ascending: false })
      .limit(20),
    [],
    'merchantWa.buildContext.getProducts',
  );

  const productList = products.length
    ? products.map((p: any) => `- ${p.title}: $${p.price_min || 'N/A'}`).join('\n')
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
  limit = 50, // Bug #156 fix: increased from 8, but capped at 50 to avoid exceeding Claude context window
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = getSupabaseAdmin();

  // Bug #156 fix: Fetch most recent N messages (descending) then reverse for chronological order
  const messages = await safeQueryOrDefault<any>(
    supabase
      .from('wa_messages')
      .select('direction, body')
      .eq('client_id', clientId)
      .eq('channel', 'merchant_wa')
      .eq('contact_phone', contactPhone)
      .order('created_at', { ascending: false })
      .limit(limit),
    [],
    'merchantWa.getHistory.getMessages',
  );

  if (!messages.length) return [];

  // Reverse to chronological order (oldest first) for Claude conversation context
  return messages
    .reverse()
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

    // Bug #114 fix: Twilio HMAC signature validation — reject forged webhooks.
    // Merchant WA webhooks are signed with the merchant's Twilio subaccount auth token.
    // We fetch the encrypted token, decrypt it, and validate the signature before processing.
    const waAccount = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_twilio_accounts')
        .select('phone_number, twilio_auth_token')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .single(),
      null,
      'merchantWa.webhook.getWaAccount',
    );

    if (!waAccount) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    {
      const merchantAuthToken = waAccount.twilio_auth_token
        ? decryptToken(waAccount.twilio_auth_token)
        : null;
      if (!merchantAuthToken) {
        console.error(`[merchant-wa] No auth token for client ${clientId} — rejecting webhook`);
        return c.text('Forbidden', 403);
      }
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
      // ESM: validateRequest is on default.validateRequest, not the module root
      const validateRequest = (twilioMod.default as any)?.validateRequest ?? (twilioMod as any).validateRequest;
      if (typeof validateRequest !== 'function') {
        console.error('[merchant-wa-hmac] validateRequest not found in twilio module — skipping validation');
      } else if (!validateRequest(merchantAuthToken, sig, rawUrl, params)) {
        console.warn(`[merchant-wa-hmac] Invalid signature — rejecting request from ${rawUrl}`);
        return c.text('Forbidden', 403);
      }
    }

    const from = String(body['From'] || '');
    const messageBody = String(body['Body'] || '');
    const profileName = String(body['ProfileName'] || '');
    const messageSid = String(body['MessageSid'] || body['SmsMessageSid'] || '');

    if (!from || !messageBody) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    // Bug #143 fix: Idempotency — Twilio retries can cause double AI response + double charge
    if (messageSid) {
      const { data: existingMsg } = await supabase
        .from('wa_messages')
        .select('id')
        .eq('message_sid', messageSid)
        .eq('client_id', clientId)
        .maybeSingle();
      if (existingMsg) {
        return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
      }
    }

    const phone = from.replace('whatsapp:', '').replace('+', '').trim();

    // Bug #137 fix: Rate limit — 10s cooldown per phone
    const lastTime = merchantRateLimit.get(phone) || 0;
    if (Date.now() - lastTime < MERCHANT_RATE_LIMIT_MS) {
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }
    merchantRateLimit.set(phone, Date.now());

    // Bug #136 fix: Scrub PII (credit cards, RUT) before saving and before sending to AI
    const { scrubbed: scrubbedBody, hadPII } = scrubPII(messageBody);
    if (hadPII) {
      console.log(`[merchant-wa] PII detected and scrubbed from ${phone}`);
    }

    // Save inbound message (with scrubbed body)
    await supabase.from('wa_messages').insert({
      client_id: clientId,
      channel: 'merchant_wa',
      direction: 'inbound',
      from_number: phone,
      to_number: waAccount.phone_number,
      body: scrubbedBody,
      message_sid: messageSid,
      contact_name: profileName,
      contact_phone: phone,
      metadata: messageSid ? { message_sid: messageSid } : undefined,
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
      // Fix Bug #142: Use atomic RPC for unread_count increment (prevents TOCTOU race)
      await supabase.rpc('increment_unread_count', {
        p_conversation_id: existingConv.id,
        p_preview: scrubbedBody.substring(0, 100),
        p_status: 'open',
      });
    } else {
      await supabase.from('wa_conversations').insert({
        client_id: clientId,
        channel: 'merchant_wa',
        contact_phone: phone,
        contact_name: profileName,
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: scrubbedBody.substring(0, 100),
        unread_count: 1,
        assigned_to: 'steve',
      });
    }

    // If conversation is assigned to human (escalated), don't auto-reply
    if (existingConv?.assigned_to === 'human') {
      // Bug #193 fix: Don't send WA notification from Steve's master number — it confuses
      // the merchant (message appears from Steve, not from their store number).
      // Instead, create a task so the merchant sees it in the dashboard.
      try {
        await supabase.from('tasks').insert({
          title: `[WA] Cliente escribió - ${profileName || phone}`,
          description: `Cliente envió mensaje a merchant ${clientId}. Requiere atención humana.\nMensaje: "${scrubbedBody.slice(0, 100)}"\nResponde en app.steveads.com/portal (tab WhatsApp)`,
          priority: 'high',
          status: 'pending',
          type: 'wa_task',
          assigned_agent: '3d195082-aa83-48c0-b514-a8052264a1e7', // JM user_id
          created_at: new Date().toISOString(),
        });
      } catch (err) { console.warn('[merchant-wa] Failed to create escalation task:', err); }

      // Update conversation to mark it needs attention
      try {
        await supabase.from('wa_conversations')
          .update({ status: 'escalated', updated_at: new Date().toISOString() })
          .eq('id', existingConv.id);
      } catch (err) { console.warn('[merchant-wa] Failed to update conversation status:', err); }

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
    // Build context, knowledge, and history in parallel
    const [context, history, { knowledgeBlock }] = await Promise.all([
      buildMerchantContext(clientId),
      getConversationHistory(clientId, phone),
      loadKnowledge(['shopify', 'brief', 'buyer_persona'], { clientId, limit: 10, label: 'REGLAS DE ATENCIÓN AL CLIENTE', audit: { source: 'merchant-wa' } }),
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
    // Bug #136 fix: Use scrubbed body for AI context (PII already stripped)
    if (messages.length === 0 || messages[messages.length - 1].content !== scrubbedBody) {
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages[messages.length - 1].content += '\n' + scrubbedBody;
      } else {
        messages.push({ role: 'user', content: scrubbedBody });
      }
    }
    if (messages[0]?.role !== 'user') {
      messages.unshift({ role: 'user', content: scrubbedBody });
    }

    let replyText: string;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[merchant-wa] ANTHROPIC_API_KEY not set');
      // Bug #131 fix: Use refund_wa_credit RPC instead of deduct_wa_credit(-1) which corrupts total_used
      try {
        await supabase.rpc('refund_wa_credit', {
          p_client_id: clientId,
          p_amount: 1,
          p_reason: 'config_error_refund',
        });
      } catch (refundErr) {
        console.warn('[merchant-wa] refund_wa_credit failed, using direct balance update:', refundErr);
        await supabase
          .from('wa_credits')
          .update({ balance: (deductData.new_balance ?? 0) + 1 })
          .eq('client_id', clientId);
      }
      return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
    }

    const systemPrompt = `${MERCHANT_WA_SYSTEM_PROMPT}\n${knowledgeBlock}\n${context}`;

    try {
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
        signal: AbortSignal.timeout(30_000),
      });

      if (!aiRes.ok) {
        console.error('[merchant-wa] Claude API error:', aiRes.status);
        // Bug #138 fix: Refund credit on AI failure — customer gets no AI value
        try {
          // Bug #182 fix: RPC parameter is p_description, not p_reason
          await supabase.rpc('refund_wa_credit', { p_client_id: clientId, p_amount: 1, p_description: 'ai_api_error_refund' });
        } catch (refundErr) { console.error('[merchant-wa] Refund after AI error failed:', refundErr); }
        replyText = 'Gracias por tu mensaje, te responderemos pronto.';
      } else {
        const aiData: any = await aiRes.json();
        replyText = (aiData.content?.[0]?.text || '')
          .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
          .trim() || 'Gracias por tu mensaje, te responderemos pronto.';
      }
    } catch (aiError) {
      // Bug #138 fix: Refund credit on AI exception — customer gets no AI value
      console.error('[merchant-wa] AI call exception:', aiError);
      try {
        // Bug #182 fix: RPC parameter is p_description, not p_reason
        await supabase.rpc('refund_wa_credit', { p_client_id: clientId, p_amount: 1, p_description: 'ai_failure_refund' });
      } catch (refundErr) { console.error('[merchant-wa] Refund after AI exception failed:', refundErr); }
      replyText = 'Gracias por tu mensaje, te responderemos pronto.';
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

      // Bug #193 fix: Don't send WA notification from Steve's master number.
      // Create a task instead so the merchant sees it in the dashboard.
      try {
        await supabase.from('tasks').insert({
          title: `[ESCALAR] ${profileName || phone} necesita atención humana`,
          description: `Cliente escribió a merchant ${clientId} y Steve decidió escalar.\nMensaje: "${scrubbedBody.slice(0, 100)}"\nResponde en app.steveads.com/portal (tab WhatsApp)`,
          priority: 'high',
          status: 'pending',
          type: 'wa_task',
          assigned_agent: '3d195082-aa83-48c0-b514-a8052264a1e7', // JM user_id
          created_at: new Date().toISOString(),
        });
      } catch (err) { console.warn('[merchant-wa] Failed to create escalation task:', err); }

      // Send a hold message to the customer
      replyText = 'Gracias por tu mensaje, un momento por favor. Te responderemos enseguida.';
    }

    // Truncate for WA
    if (replyText.length > 1500) replyText = replyText.slice(0, 1497) + '...';
    // Bug #141 fix: Use global regex — .replace(string) only replaces first occurrence
    replyText = replyText.replace(/\[ESCALAR\]/g, '').trim();

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
    const { error: convUpdateErr } = await supabase.from('wa_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: replyText.substring(0, 100),
      })
      .eq('client_id', clientId)
      .eq('channel', 'merchant_wa')
      .eq('contact_phone', phone);
    if (convUpdateErr) console.error('[merchant-wa] Conversation preview update failed:', convUpdateErr);

    const escaped = replyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return c.text(`<Response><Message>${escaped}</Message></Response>`, 200, { 'Content-Type': 'text/xml' });

  } catch (error: any) {
    console.error('[merchant-wa] Outer error:', error?.message, error?.stack);
    // Bug #189 fix: Return EMPTY TwiML — do NOT send a message since credits were not deducted.
    // Sending a <Message> here causes Twilio to deliver a reply that the merchant gets charged for
    // (via Twilio's per-message pricing) without a corresponding WA credit deduction on our side.
    return c.text('<Response></Response>', 200, { 'Content-Type': 'text/xml' });
  }
}
