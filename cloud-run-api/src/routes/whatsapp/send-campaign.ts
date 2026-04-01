import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';

/**
 * POST /api/whatsapp/send-campaign
 * Sends a WhatsApp campaign to a segment of contacts.
 * Returns HTTP response immediately after marking campaign as 'sending'.
 * Actual message sending happens in background (Issue 2).
 * Auth: JWT (authMiddleware)
 *
 * Body: { campaign_id, client_id }
 */
export async function waSendCampaign(c: Context) {
  try {
    const { campaign_id, client_id } = await c.req.json();

    if (!campaign_id || !client_id) {
      return c.json({ error: 'Missing campaign_id or client_id' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Get campaign
    const { data: campaign, error: campError } = await supabase
      .from('wa_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('client_id', client_id)
      .single();

    if (campError || !campaign) {
      return c.json({ error: 'Campaña no encontrada' }, 404);
    }

    if (campaign.status !== 'draft') {
      return c.json({ error: `Campaña ya está en estado ${campaign.status}` }, 400);
    }

    // Get merchant's Twilio account
    const { data: waAccount } = await supabase
      .from('wa_twilio_accounts')
      .select('twilio_account_sid, twilio_auth_token, phone_number')
      .eq('client_id', client_id)
      .eq('status', 'active')
      .single();

    if (!waAccount) {
      return c.json({ error: 'WhatsApp no configurado' }, 404);
    }

    // Get recipients based on segment
    const segment = (campaign.segment_query as any)?.segment || 'all';
    let recipients: Array<{ phone: string; name: string }> = [];

    // Query contacts from wa_conversations (people who've written before)
    const { data: contacts } = await supabase
      .from('wa_conversations')
      .select('contact_phone, contact_name')
      .eq('client_id', client_id)
      .eq('channel', 'merchant_wa')
      .limit(500);

    if (contacts) {
      recipients = contacts.map((c: any) => ({
        phone: c.contact_phone,
        name: c.contact_name || '',
      }));
    }

    // Filter by segment (basic implementation)
    // In production, this would query Shopify order data for buyers/abandoned/vip
    if (segment === 'abandoned') {
      // Would filter by shopify_checkouts where completed_at is null
      // For now, send to all contacts (placeholder)
    }

    if (recipients.length === 0) {
      return c.json({ error: 'No hay destinatarios para esta campaña' }, 400);
    }

    // Check credits (read-only pre-check)
    const { data: creditCheck } = await supabase
      .from('wa_credits')
      .select('balance')
      .eq('client_id', client_id)
      .single();

    if (!creditCheck || creditCheck.balance < recipients.length) {
      return c.json({
        error: `Creditos insuficientes. Necesitas ${recipients.length}, tienes ${creditCheck?.balance || 0}`,
        needed: recipients.length,
        balance: creditCheck?.balance || 0,
      }, 402);
    }

    // Mark campaign as sending
    await supabase.from('wa_campaigns')
      .update({
        status: 'sending',
        recipient_count: recipients.length,
        sent_at: new Date().toISOString(),
      })
      .eq('id', campaign_id);

    // Issue 2: Return HTTP response immediately, process sends in background
    Promise.resolve().then(async () => {
      try {
        const subClient = getTwilioSubClient(
          waAccount.twilio_account_sid,
          decryptToken(waAccount.twilio_auth_token),
        );

        const fromNorm = `whatsapp:${waAccount.phone_number.startsWith('+') ? waAccount.phone_number : '+' + waAccount.phone_number}`;

        let sentCount = 0;
        let failedCount = 0;

        for (const recipient of recipients) {
          try {
            const personalizedBody = campaign.template_body
              .replace(/\{\{nombre\}\}/g, recipient.name || 'Hola')
              .replace(/\{\{customer_name\}\}/g, recipient.name || 'Hola');

            const toNorm = `whatsapp:+${recipient.phone.replace('+', '')}`;

            const msg = await subClient.messages.create({
              from: fromNorm,
              to: toNorm,
              body: personalizedBody,
            });

            // Save individual message with campaign_id in metadata
            await supabase.from('wa_messages').insert({
              client_id,
              channel: 'merchant_wa',
              direction: 'outbound',
              from_number: waAccount.phone_number,
              to_number: recipient.phone,
              body: personalizedBody,
              message_sid: msg.sid,
              contact_phone: recipient.phone,
              contact_name: recipient.name,
              template_name: campaign.template_name,
              credits_used: 1,
              metadata: { campaign_id },
            });

            sentCount++;

            // Rate limit: ~10 messages/second
            if (sentCount % 10 === 0) {
              await new Promise(r => setTimeout(r, 1000));
            }
          } catch (err) {
            console.error(`[wa-campaign] Failed to send to ${recipient.phone}:`, err);
            failedCount++;
          }
        }

        // Update campaign final status
        await supabase.from('wa_campaigns')
          .update({
            status: 'sent',
            sent_count: sentCount,
            credits_used: sentCount,
          })
          .eq('id', campaign_id);

        // Issue 1: Deduct credits atomically in one RPC call
        if (sentCount > 0) {
          await supabase.rpc('deduct_wa_credit', {
            p_client_id: client_id,
            p_amount: sentCount,
            p_description: `Campaña "${campaign.name}": ${sentCount} mensajes`,
          });
        }

        console.log(`[wa-campaign] Campaign ${campaign_id}: ${sentCount} sent, ${failedCount} failed`);
      } catch (bgErr: any) {
        console.error(`[wa-campaign] Background error for campaign ${campaign_id}:`, bgErr);
        // Mark campaign as failed on unrecoverable error
        await supabase.from('wa_campaigns')
          .update({ status: 'failed' })
          .eq('id', campaign_id);
      }
    });

    // Return immediately (Issue 2)
    return c.json({
      success: true,
      status: 'sending',
      recipient_count: recipients.length,
      message: 'Campaña en proceso de envío',
    });

  } catch (err: any) {
    console.error('[wa-send-campaign] Error:', err);
    return c.json({ error: 'Error al enviar campaña', details: err.message }, 500);
  }
}
