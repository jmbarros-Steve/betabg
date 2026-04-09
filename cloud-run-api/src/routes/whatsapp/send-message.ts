import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

/**
 * POST /api/whatsapp/send-message
 * Merchant sends a manual reply to a customer from the portal.
 * Auth: JWT (authMiddleware)
 *
 * Body: { client_id, to_phone, body, channel? }
 */
export async function waSendMessage(c: Context) {
  try {
    const payload = await c.req.json();
    const { client_id, to_phone, body: messageBody } = payload;

    if (!client_id || !to_phone || !messageBody) {
      return c.json({ error: 'Missing client_id, to_phone, or body' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Fix Bug#3: verify authenticated user owns client_id (IDOR prevention)
    const user = c.get('user');
    if (user?.id) {
      const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);
      if (!isSuperAdmin && !clientIds.includes(client_id)) {
        return c.json({ error: 'Forbidden: you do not own this client' }, 403);
      }
    }

    // Get merchant's Twilio sub-account
    const waAccount = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_twilio_accounts')
        .select('twilio_account_sid, twilio_auth_token, phone_number')
        .eq('client_id', client_id)
        .eq('status', 'active')
        .single(),
      null,
      'sendMessage.getWaAccount',
    );

    if (!waAccount) {
      return c.json({ error: 'WhatsApp no configurado para este merchant' }, 404);
    }

    // Check credits (read-only check before sending)
    const creditCheck = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_credits')
        .select('balance')
        .eq('client_id', client_id)
        .single(),
      null,
      'sendMessage.getCreditCheck',
    );

    if (!creditCheck || creditCheck.balance < 1) {
      return c.json({ error: 'Creditos insuficientes', balance: creditCheck?.balance || 0 }, 402);
    }

    // Send via Twilio sub-account
    const subClient = getTwilioSubClient(
      waAccount.twilio_account_sid,
      decryptToken(waAccount.twilio_auth_token),
    );

    const toNorm = to_phone.startsWith('whatsapp:')
      ? to_phone
      : `whatsapp:${to_phone.startsWith('+') ? to_phone : '+' + to_phone}`;

    const fromNorm = `whatsapp:${waAccount.phone_number.startsWith('+') ? waAccount.phone_number : '+' + waAccount.phone_number}`;

    const twilioMsg = await subClient.messages.create({
      from: fromNorm,
      to: toNorm,
      body: messageBody,
    });

    // Save message
    const cleanPhone = to_phone.replace('whatsapp:', '').replace('+', '');

    await supabase.from('wa_messages').insert({
      client_id,
      channel: 'merchant_wa',
      direction: 'outbound',
      from_number: waAccount.phone_number,
      to_number: cleanPhone,
      body: messageBody,
      message_sid: twilioMsg.sid,
      contact_phone: cleanPhone,
      credits_used: 1,
    });

    // Update conversation
    await supabase.from('wa_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageBody.substring(0, 100),
        assigned_to: 'human', // Merchant took over
      })
      .eq('client_id', client_id)
      .eq('channel', 'merchant_wa')
      .eq('contact_phone', cleanPhone);

    // Deduct credit atomically (Issue 1: prevents race condition)
    const { data: deductResult } = await supabase.rpc('deduct_wa_credit', {
      p_client_id: client_id,
      p_amount: 1,
      p_description: `Mensaje manual a ${cleanPhone}`,
    });

    const result = deductResult as any;
    if (!result?.success) {
      // Message already sent but credits failed — log but don't fail
      console.warn('[wa-send-message] Credit deduction failed after message sent');
    }

    return c.json({
      success: true,
      message_sid: twilioMsg.sid,
      credits_remaining: result?.new_balance ?? (creditCheck.balance - 1),
    });

  } catch (err: any) {
    console.error('[wa-send-message] Error:', err);
    return c.json({ error: 'Error al enviar mensaje', details: err.message }, 500);
  }
}
