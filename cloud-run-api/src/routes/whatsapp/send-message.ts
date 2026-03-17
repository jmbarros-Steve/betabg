import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';

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

    // Get merchant's Twilio sub-account
    const { data: waAccount } = await supabase
      .from('wa_twilio_accounts')
      .select('twilio_account_sid, twilio_auth_token, phone_number')
      .eq('client_id', client_id)
      .eq('status', 'active')
      .single();

    if (!waAccount) {
      return c.json({ error: 'WhatsApp no configurado para este merchant' }, 404);
    }

    // Check credits
    const { data: credits } = await supabase
      .from('wa_credits')
      .select('id, balance, total_used')
      .eq('client_id', client_id)
      .single();

    if (!credits || credits.balance < 1) {
      return c.json({ error: 'Creditos insuficientes', balance: credits?.balance || 0 }, 402);
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

    // Deduct credit
    const newBalance = credits.balance - 1;
    await supabase.from('wa_credits')
      .update({ balance: newBalance, total_used: (credits.total_used || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', credits.id);

    await supabase.from('wa_credit_transactions').insert({
      client_id,
      type: 'usage',
      amount: -1,
      description: `Mensaje manual a ${cleanPhone}`,
      balance_after: newBalance,
    });

    return c.json({
      success: true,
      message_sid: twilioMsg.sid,
      credits_remaining: newBalance,
    });

  } catch (err: any) {
    console.error('[wa-send-message] Error:', err);
    return c.json({ error: 'Error al enviar mensaje', details: err.message }, 500);
  }
}
