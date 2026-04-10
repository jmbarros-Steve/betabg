import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

/**
 * Bug #160 fix: Escape WhatsApp special formatting characters in template variable VALUES.
 * WhatsApp uses *bold*, _italic_, ~strikethrough~, ```code``` — if a contact name or value
 * contains these characters (e.g. "John_Doe" or "Store*Plus"), the message formatting breaks.
 * We only escape the substituted values, NOT the template itself (so intentional formatting is preserved).
 */
function escapeWAFormatting(text: string): string {
  return text.replace(/([*_~`])/g, '\\$1');
}

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

    // Bug #127 fix: explicitly reject completed/sending campaigns with clear error messages
    if (campaign.status === 'completed' || campaign.status === 'sent') {
      return c.json({ error: 'Esta campaña ya fue enviada y no puede re-enviarse' }, 400);
    }
    if (campaign.status === 'sending') {
      return c.json({ error: 'Esta campaña ya está en proceso de envío' }, 400);
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

    // Bug #217 fix: Build query with actual segment filtering.
    // Select metadata + last_message_at so we can filter client-side for segments.
    let contactQuery = supabase
      .from('wa_conversations')
      .select('contact_phone, contact_name, metadata, last_message_at')
      .eq('client_id', client_id)
      .eq('channel', 'merchant_wa');

    // Apply server-side filters where possible
    if (segment === 'inactive') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      contactQuery = contactQuery.lt('last_message_at', thirtyDaysAgo);
    }

    const contacts = await safeQueryOrDefault<any>(
      contactQuery.limit(500),
      [],
      'sendCampaign.getContacts',
    );

    if (contacts.length > 0) {
      // Bug #50 fix: deduplicate recipients by phone number
      const seen = new Set<string>();
      let allContacts = contacts
        .map((c: any) => ({
          phone: c.contact_phone,
          name: c.contact_name || '',
          metadata: c.metadata || {},
          last_message_at: c.last_message_at,
        }))
        .filter((r: { phone: string }) => {
          if (seen.has(r.phone)) return false;
          seen.add(r.phone);
          return true;
        });

      // Bug #217 fix: Apply client-side segment filtering for metadata-based segments
      if (segment === 'buyers') {
        // Filter contacts who have purchase data in metadata
        const filtered = allContacts.filter((c: any) => c.metadata?.last_purchase_at);
        if (filtered.length > 0) {
          allContacts = filtered;
        } else {
          console.warn(`[wa-campaign] Segment 'buyers' matched 0 contacts (no metadata.last_purchase_at) — sending to all ${allContacts.length} contacts`);
        }
      } else if (segment === 'abandoned') {
        // Filter contacts with abandoned cart flag
        const filtered = allContacts.filter((c: any) => c.metadata?.has_abandoned_cart === true || c.metadata?.has_abandoned_cart === 'true');
        if (filtered.length > 0) {
          allContacts = filtered;
        } else {
          console.warn(`[wa-campaign] Segment 'abandoned' matched 0 contacts (no metadata.has_abandoned_cart) — sending to all ${allContacts.length} contacts`);
        }
      } else if (segment === 'vip') {
        // Filter contacts with 3+ purchases
        const filtered = allContacts.filter((c: any) => parseInt(c.metadata?.purchase_count || '0', 10) >= 3);
        if (filtered.length > 0) {
          allContacts = filtered;
        } else {
          console.warn(`[wa-campaign] Segment 'vip' matched 0 contacts (no metadata.purchase_count >= 3) — sending to all ${allContacts.length} contacts`);
        }
      } else if (segment !== 'all' && segment !== 'inactive') {
        // Unknown segment — log warning, proceed with all contacts
        console.warn(`[wa-campaign] Unknown segment '${segment}' — sending to all ${allContacts.length} contacts`);
      }

      recipients = allContacts.map((c: any) => ({ phone: c.phone, name: c.name }));
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
    // TODO Bug #99: This detached Promise is lost if the Cloud Run instance recycles mid-send,
    // leaving the campaign stuck in 'sending' forever (zombie campaign). Proper fix requires:
    //   1. A persistent job queue (Cloud Tasks, Pub/Sub, or pg_boss) that survives instance recycling
    //   2. A cron job that finds campaigns stuck in 'sending' for >1 hour and marks them as 'failed'
    //   3. Idempotent message sending so retries don't double-send
    // For now, we add progress tracking (sent_count updated every 10 messages) so the dashboard
    // can show partial progress and detect stalled campaigns.
    Promise.resolve().then(async () => {
      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0; // Bug #197 fix: track already-sent separately from new sends
      let finalStatus: 'sent' | 'failed' = 'sent';

      try {
        const subClient = getTwilioSubClient(
          waAccount.twilio_account_sid,
          decryptToken(waAccount.twilio_auth_token),
        );

        const fromNorm = `whatsapp:${waAccount.phone_number.startsWith('+') ? waAccount.phone_number : '+' + waAccount.phone_number}`;

        // Bug #124 fix: Query wa_messages for recipients who already received this campaign.
        // If Cloud Run kills the instance mid-send and it restarts (or the campaign is retried),
        // this prevents double-sending to contacts that were already messaged.
        // Bug #140 fix: Use .eq('metadata->>campaign_id', ...) instead of .contains('metadata', ...)
        // The JSONB .contains() without a GIN index causes full table scans and timeouts,
        // which were treated as "no duplicates" — leading to double-sends.
        // Using ->> operator allows Postgres to use a btree index on the extracted text value.
        // Also: fail-safe — if this query fails, we abort rather than proceed without dedup.
        let alreadySent: { contact_phone: string }[] = [];
        try {
          const { data, error: alreadySentError } = await supabase
            .from('wa_messages')
            .select('contact_phone')
            .eq('client_id', client_id)
            .eq('channel', 'merchant_wa')
            .eq('direction', 'outbound')
            .eq('metadata->>campaign_id', campaign_id)
            .limit(10000);
          if (alreadySentError) {
            throw new Error(`alreadySent query failed: ${alreadySentError.message}`);
          }
          alreadySent = (data || []) as { contact_phone: string }[];
        } catch (dedupErr) {
          // Bug #140 fail-safe: if dedup query fails, do NOT proceed (fail-closed, not fail-open)
          console.error(`[wa-campaign] Bug #140: Dedup query failed for campaign ${campaign_id}, aborting to prevent double-send:`, dedupErr);
          finalStatus = 'failed';
          return; // exits the Promise.resolve().then() block, falls through to finally
        }
        const alreadySentPhones = new Set(alreadySent.map((m: { contact_phone: string }) => m.contact_phone));
        if (alreadySentPhones.size > 0) {
          console.log(`[wa-campaign] Bug #124: Skipping ${alreadySentPhones.size} already-sent recipients for campaign ${campaign_id}`);
        }

        for (const recipient of recipients) {
          try {
            // Bug #160 fix: Escape WA formatting chars in variable VALUES only.
            const safeName = escapeWAFormatting(recipient.name || 'Hola');
            const personalizedBody = campaign.template_body
              .replace(/\{\{nombre\}\}/g, safeName)
              .replace(/\{\{customer_name\}\}/g, safeName);

            const rawPhone = recipient.phone || '';
            if (!rawPhone) {
              console.warn(`[wa-campaign] Skipping recipient with no phone`);
              failedCount++;
              continue;
            }

            // Bug #124 fix: skip if this phone was already sent in a previous run
            // Bug #197 fix: Don't count already-sent as sentCount — they don't consume
            // new credits in this run, so they must NOT reduce the refund amount.
            if (alreadySentPhones.has(rawPhone)) {
              skippedCount++;
              continue;
            }

            // Bug #188 fix: .replace('+', '') only removes the FIRST '+' — use regex to strip all
            // leading '+' chars and whitespace, then validate format before sending.
            const cleanPhone = rawPhone.replace(/^\++/, '').replace(/\s/g, '');
            if (!/^\d{8,15}$/.test(cleanPhone)) {
              console.warn(`[wa-campaign] Invalid phone format: ${rawPhone}, skipping`);
              failedCount++;
              continue;
            }
            const toNorm = `whatsapp:+${cleanPhone}`;

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

            // Bug #99 fix: Update sent_count every 10 messages for progress tracking.
            // This lets the dashboard show partial progress and detect stalled campaigns.
            if (sentCount % 10 === 0) {
              await supabase.from('wa_campaigns')
                .update({ sent_count: sentCount })
                .eq('id', campaign_id);
            }

            // Rate limit: ~10 messages/second
            if (sentCount % 10 === 0) {
              await new Promise(r => setTimeout(r, 1000));
            }
          } catch (err) {
            console.error(`[wa-campaign] Failed to send to ${recipient.phone}:`, err);
            failedCount++;
          }
        }

        console.log(`[wa-campaign] Campaign ${campaign_id}: ${sentCount} sent, ${failedCount} failed, ${skippedCount} skipped (already-sent)`);
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
        // Bug #83 fix: Don't call deduct_wa_credit with negative amounts — it corrupts total_used.
        // Bug #111 fix: use atomic refund_wa_credit RPC (balance = balance + X in SQL)
        // instead of read-then-write which has a TOCTOU race condition.
        // Bug #152 fix: Add fallback to refund_wa_credit RPC — if the RPC doesn't exist
        // or fails, use direct balance update so credits are not silently lost.
        try {
          // Bug #197 fix: unusedCredits includes both failed AND skipped (already-sent) recipients.
          // Only actual new sentCount consumed credits in this run.
          const unusedCredits = recipients.length - sentCount;
          if (unusedCredits > 0) {
            console.warn(`[wa-campaign] Campaign ${campaign_id}: ${unusedCredits} unused credits (${failedCount} failed, ${skippedCount} already-sent). ` +
              `Pre-deducted ${recipients.length}, sent ${sentCount}. Refunding atomically.`);
            const { error: refundError } = await supabase.rpc('refund_wa_credit', {
              p_client_id: client_id,
              p_amount: unusedCredits,
              p_description: `Campaña "${campaign.name}": refund ${unusedCredits} créditos no usados (${failedCount} fallidos, ${skippedCount} ya enviados)`,
            });
            if (refundError) {
              // Bug #152: RPC failed — fallback to direct balance update
              console.error(`[wa-campaign] refund_wa_credit RPC failed for campaign ${campaign_id}: ${refundError.message}. Using fallback.`);
              try {
                const { data: credits } = await supabase
                  .from('wa_credits')
                  .select('balance')
                  .eq('client_id', client_id)
                  .single();
                if (credits) {
                  await supabase
                    .from('wa_credits')
                    .update({ balance: (credits as any).balance + unusedCredits })
                    .eq('client_id', client_id);
                  console.log(`[wa-campaign] Bug #152: Refunded ${unusedCredits} credits via fallback for campaign ${campaign_id}`);
                }
              } catch (fallbackErr) {
                console.error(`[wa-campaign] CRITICAL Bug #152: Refund fallback also failed for campaign ${campaign_id}:`, fallbackErr);
              }
            } else {
              console.log(`[wa-campaign] Refunded ${unusedCredits} credits to client ${client_id} via atomic RPC`);
            }
          }
        } catch (creditErr) {
          console.error(`[wa-campaign] CRITICAL: Failed to credit back unused credits for campaign ${campaign_id}:`, creditErr);
          // Bug #152: Last-resort fallback inside catch
          try {
            const unusedCredits = recipients.length - sentCount;
            if (unusedCredits > 0) {
              const { data: credits } = await supabase
                .from('wa_credits')
                .select('balance')
                .eq('client_id', client_id)
                .single();
              if (credits) {
                await supabase
                  .from('wa_credits')
                  .update({ balance: (credits as any).balance + unusedCredits })
                  .eq('client_id', client_id);
                console.log(`[wa-campaign] Bug #152: Refunded ${unusedCredits} credits via last-resort fallback`);
              }
            }
          } catch (lastResortErr) {
            console.error(`[wa-campaign] CRITICAL Bug #152: Last-resort refund failed for campaign ${campaign_id}:`, lastResortErr);
          }
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
