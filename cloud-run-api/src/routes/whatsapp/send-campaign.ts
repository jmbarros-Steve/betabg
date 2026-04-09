import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

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

    // Fix Bug#3: verify authenticated user owns client_id (IDOR prevention)
    const user = c.get('user');
    if (user?.id) {
      const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);
      if (!isSuperAdmin && !clientIds.includes(client_id)) {
        return c.json({ error: 'Forbidden: you do not own this client' }, 403);
      }
    }

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
    const waAccount = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_twilio_accounts')
        .select('twilio_account_sid, twilio_auth_token, phone_number')
        .eq('client_id', client_id)
        .eq('status', 'active')
        .single(),
      null,
      'sendCampaign.getWaAccount',
    );

    if (!waAccount) {
      return c.json({ error: 'WhatsApp no configurado' }, 404);
    }

    // Get recipients based on segment
    const segment = (campaign.segment_query as any)?.segment || 'all';
    let recipients: Array<{ phone: string; name: string }> = [];

    // Query contacts from wa_conversations (people who've written before)
    const contacts = await safeQueryOrDefault<any>(
      supabase
        .from('wa_conversations')
        .select('contact_phone, contact_name')
        .eq('client_id', client_id)
        .eq('channel', 'merchant_wa')
        .limit(500),
      [],
      'sendCampaign.getContacts',
    );

    if (contacts.length > 0) {
      // Bug #50 fix: deduplicate recipients by phone number
      const seen = new Set<string>();
      recipients = contacts
        .map((c: any) => ({
          phone: c.contact_phone,
          name: c.contact_name || '',
        }))
        .filter((r: { phone: string; name: string }) => {
          if (seen.has(r.phone)) return false;
          seen.add(r.phone);
          return true;
        });
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

    // Bug #35 fix: reserve credits atomically BEFORE sending
    // Pre-check balance to give a clear error message
    const creditCheck = await safeQuerySingleOrDefault<any>(
      supabase
        .from('wa_credits')
        .select('balance')
        .eq('client_id', client_id)
        .single(),
      null,
      'sendCampaign.getCreditCheck',
    );

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

    // Bug #35 fix: deduct credits upfront (atomic RPC) to prevent race conditions
    const { error: deductError } = await supabase.rpc('deduct_wa_credit', {
      p_client_id: client_id,
      p_amount: recipients.length,
      p_description: `Campaña "${campaign.name}": ${recipients.length} mensajes (reserva)`,
    });

    if (deductError) {
      console.error(`[wa-campaign] Credit deduction failed for campaign ${campaign_id}:`, deductError);
      // Roll back campaign status to draft
      await supabase.from('wa_campaigns')
        .update({ status: 'draft', sent_at: null })
        .eq('id', campaign_id);
      return c.json({ error: 'Error al reservar créditos', details: deductError.message }, 500);
    }

    // Issue 2: Return HTTP response immediately, process sends in background
    // Bug #36 fix: use finally block to guarantee status update even on partial failure
    Promise.resolve().then(async () => {
      let sentCount = 0;
      let failedCount = 0;
      let finalStatus: 'sent' | 'failed' = 'sent';

      try {
        const subClient = getTwilioSubClient(
          waAccount.twilio_account_sid,
          decryptToken(waAccount.twilio_auth_token),
        );

        const fromNorm = `whatsapp:${waAccount.phone_number.startsWith('+') ? waAccount.phone_number : '+' + waAccount.phone_number}`;

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

        console.log(`[wa-campaign] Campaign ${campaign_id}: ${sentCount} sent, ${failedCount} failed`);
      } catch (bgErr: any) {
        console.error(`[wa-campaign] Background error for campaign ${campaign_id}:`, bgErr);
        finalStatus = 'failed';
      } finally {
        // Bug #36 fix: always update campaign status, even on unrecoverable errors
        try {
          await supabase.from('wa_campaigns')
            .update({
              status: finalStatus,
              sent_count: sentCount,
              credits_used: sentCount,
            })
            .eq('id', campaign_id);
        } catch (statusErr) {
          console.error(`[wa-campaign] CRITICAL: Failed to update campaign ${campaign_id} status to '${finalStatus}':`, statusErr);
        }

        // Bug #35 fix: credits were reserved upfront for recipients.length.
        // Credit back the difference if some messages failed or loop errored out.
        try {
          const unusedCredits = recipients.length - sentCount;
          if (unusedCredits > 0) {
            await supabase.rpc('deduct_wa_credit', {
              p_client_id: client_id,
              p_amount: -unusedCredits,
              p_description: `Campaña "${campaign.name}": devolución ${unusedCredits} créditos (${failedCount} fallidos)`,
            });
          }
        } catch (creditErr) {
          console.error(`[wa-campaign] CRITICAL: Failed to credit back unused credits for campaign ${campaign_id}:`, creditErr);
        }
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
