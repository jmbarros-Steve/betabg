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

    // Race-condition fix: Deduct credit ATOMICALLY before sending.
    // deduct_wa_credit uses UPDATE ... WHERE balance >= p_amount, so two concurrent
    // requests cannot both succeed — the second one will get insufficient_credits.
    const cleanPhone = to_phone.replace('whatsapp:', '').replace('+', '');

    const { data: deductResult } = await supabase.rpc('deduct_wa_credit', {
      p_client_id: client_id,
      p_amount: 1,
      p_description: `Mensaje manual a ${cleanPhone}`,
    });

    const result = deductResult as any;
    if (!result?.success) {
      return c.json({ error: 'Créditos insuficientes', balance: 0 }, 402);
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

    let twilioMsg;
    try {
      twilioMsg = await subClient.messages.create({
        from: fromNorm,
        to: toNorm,
        body: messageBody,
      });
    } catch (twilioErr) {
      // Twilio failed — refund the credit we already deducted.
      // Bug #116 fix: Do NOT use deduct_wa_credit with -1 as it corrupts total_used.
      // Instead, read current balance and increment it directly without touching total_used.
      console.error('[wa-send-message] Twilio send failed, refunding credit:', twilioErr);
      try {
        const { data: currentCredits } = await supabase
          .from('wa_credits')
          .select('balance')
          .eq('client_id', client_id)
          .single();
        const currentBalance = (currentCredits as any)?.balance ?? (result?.new_balance ?? 0);
        await supabase
          .from('wa_credits')
          .update({ balance: currentBalance + 1 })
          .eq('client_id', client_id);
      } catch (refundErr) {
        console.error('[wa-send-message] Refund direct update failed:', refundErr);
      }
      throw twilioErr;
    }

    // Save message
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

    return c.json({
      success: true,
      message_sid: twilioMsg.sid,
      credits_remaining: result?.new_balance ?? 0,
    });

  } catch (err: any) {
    console.error('[wa-send-message] Error:', err);
    return c.json({ error: 'Error al enviar mensaje', details: err.message }, 500);
  }
}
