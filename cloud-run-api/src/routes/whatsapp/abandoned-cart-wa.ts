import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Abandoned Cart WA — Cron that sends WhatsApp reminders for abandoned carts.
 *
 * Runs every hour. Finds checkouts created 1-24hrs ago that:
 * - Have not been completed (order_completed = false)
 * - Have not received a WA reminder yet (wa_reminder_sent = false)
 * - Have a customer phone number
 * - Belong to a merchant with active WA automation for abandoned_cart
 * - Merchant has WA credits
 *
 * Cron: 0 * * * * (every hour)
 * Auth: X-Cron-Secret
 */
export async function abandonedCartWA(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find abandoned checkouts: created 1-24hrs ago, not completed, not reminded
  const { data: carts, error: fetchError } = await supabase
    .from('shopify_abandoned_checkouts')
    .select('*')
    .eq('wa_reminder_sent', false)
    .eq('order_completed', false)
    .lte('created_at', oneHourAgo)
    .gte('created_at', twentyFourHoursAgo)
    .not('customer_phone', 'is', null)
    .limit(100);

  if (fetchError) {
    console.error('[abandoned-cart-wa] Fetch error:', fetchError);
    return c.json({ error: fetchError.message }, 500);
  }

  if (!carts || carts.length === 0) {
    return c.json({ message: 'No abandoned carts to process', sent: 0 });
  }

  let sent = 0;
  let skipped = 0;
  // Bug #88 fix: Track per-client sent counts to batch-update total_sent after the loop
  const sentByClient: Record<string, number> = {};

  for (const cart of carts) {
    try {
      // Check if merchant has active abandoned_cart automation
      const automation = await safeQuerySingleOrDefault<any>(
        supabase
          .from('wa_automations')
          .select('template_body')
          .eq('client_id', cart.client_id)
          .eq('trigger_type', 'abandoned_cart')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        null,
        'abandonedCartWa.getAutomation',
      );

      if (!automation) {
        skipped++;
        continue; // Merchant doesn't have this automation active
      }

      // Check credits
      const credits = await safeQuerySingleOrDefault<any>(
        supabase
          .from('wa_credits')
          .select('id, balance, total_used')
          .eq('client_id', cart.client_id)
          .single(),
        null,
        'abandonedCartWa.getCredits',
      );

      if (!credits || credits.balance < 1) {
        skipped++;
        continue; // No credits
      }

      // Get merchant's Twilio sub-account
      const waAccount = await safeQuerySingleOrDefault<any>(
        supabase
          .from('wa_twilio_accounts')
          .select('twilio_account_sid, twilio_auth_token, phone_number, display_name')
          .eq('client_id', cart.client_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle(),
        null,
        'abandonedCartWa.getWaAccount',
      );

      if (!waAccount) {
        skipped++;
        continue; // No WA configured
      }

      // Build message from template
      const product = (cart.line_items as any[])?.[0];
      const productName = product?.title || 'tu producto';
      const totalPrice = cart.total_price
        ? `$${Math.round(cart.total_price).toLocaleString('es-CL')}`
        : '';
      const cartUrl = cart.abandoned_checkout_url || '';

      let message = automation.template_body
        .replace(/\{\{customer_name\}\}/g, cart.customer_name || 'Hola')
        .replace(/\{\{product_name\}\}/g, productName)
        .replace(/\{\{total_price\}\}/g, totalPrice)
        .replace(/\{\{cart_url\}\}/g, cartUrl)
        .replace(/\{\{store_name\}\}/g, waAccount.display_name || 'nuestra tienda');

      // Fallback if template was empty
      if (!message.trim()) {
        message = `Hola ${cart.customer_name || ''}! Vimos que dejaste ${productName} en tu carrito. ¿Necesitas ayuda para completar tu compra? ${cartUrl}`;
      }

      // Send via Twilio
      const subClient = getTwilioSubClient(
        waAccount.twilio_account_sid,
        decryptToken(waAccount.twilio_auth_token),
      );

      // Bug #195 fix: Sanitize phone — strip spaces, dashes, parens before constructing Twilio address
      const cleanPhone = (cart.customer_phone || '').replace(/[\s\-()]/g, '');
      const toNumber = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
      // Validate format: must be + followed by 8-15 digits
      if (!/^\+\d{8,15}$/.test(toNumber)) {
        console.warn('[abandoned-cart-wa] Invalid phone format:', cart.customer_phone);
        skipped++;
        continue; // skip this cart — don't burn a credit on an invalid number
      }

      // Fix Bug#8: Deduct credit BEFORE sending message (irreversible)
      const { data: deductResult } = await supabase.rpc('deduct_wa_credit', {
        p_client_id: cart.client_id,
        p_amount: 1,
        p_description: `Carrito abandonado: ${productName}`,
      });

      if (!(deductResult as any)?.success) {
        console.warn(`[abandoned-cart-wa] Credit deduction failed for client ${cart.client_id}`);
        skipped++;
        continue;
      }

      // Bug #76 fix: Wrap Twilio send in try/catch to refund credit on failure
      let twilioMsg: any;
      try {
        twilioMsg = await subClient.messages.create({
          from: `whatsapp:${waAccount.phone_number}`,
          to: `whatsapp:${toNumber}`,
          body: message,
        });
      } catch (sendErr) {
        // Bug #132 fix: Use atomic refund_wa_credit RPC to prevent TOCTOU race condition.
        // The previous read-then-write pattern could lose refunds under concurrent cron runs.
        try {
          await supabase.rpc('refund_wa_credit', {
            p_client_id: cart.client_id,
            p_amount: 1,
            p_description: `abandoned_cart_send_failure: ${cart.customer_phone}`,
          });
        } catch (rpcErr) {
          // Fallback: direct balance update if RPC doesn't exist
          console.error(`[abandoned-cart-wa] refund_wa_credit RPC failed for client ${cart.client_id}, using fallback:`, rpcErr);
          try {
            const { data: currentCredits } = await supabase
              .from('wa_credits')
              .select('balance')
              .eq('client_id', cart.client_id)
              .single();
            const currentBalance = (currentCredits as any)?.balance ?? 0;
            await supabase
              .from('wa_credits')
              .update({ balance: currentBalance + 1 })
              .eq('client_id', cart.client_id);
          } catch (fallbackErr) {
            console.error(`[abandoned-cart-wa] CRITICAL: Refund fallback also failed for client ${cart.client_id}:`, fallbackErr);
          }
        }
        throw sendErr; // re-throw to be caught by outer handler
      }

      // Save message
      await supabase.from('wa_messages').insert({
        client_id: cart.client_id,
        channel: 'merchant_wa',
        direction: 'outbound',
        from_number: waAccount.phone_number,
        to_number: toNumber,
        body: message,
        message_sid: twilioMsg.sid,
        template_name: 'abandoned_cart',
        credits_used: 1,
        contact_name: cart.customer_name,
        contact_phone: cart.customer_phone,
        metadata: { checkout_id: cart.checkout_id, product: productName },
      });

      // Mark as sent
      await supabase.from('shopify_abandoned_checkouts')
        .update({ wa_reminder_sent: true })
        .eq('id', cart.id);

      sent++;
      sentByClient[cart.client_id] = (sentByClient[cart.client_id] || 0) + 1;
      console.log(`[abandoned-cart-wa] Sent to ${toNumber} for client ${cart.client_id}`);

    } catch (err: any) {
      console.error(`[abandoned-cart-wa] Error processing cart ${cart.id}:`, err?.message);
      skipped++;
    }
  }

  // Fix Bug #146: Use atomic RPC for total_sent increment (prevents TOCTOU race)
  for (const [clientId, count] of Object.entries(sentByClient)) {
    try {
      await supabase.rpc('increment_automation_total_sent', {
        p_client_id: clientId,
        p_trigger_type: 'abandoned_cart',
        p_count: count,
      });
    } catch (updateErr) {
      console.warn(`[abandoned-cart-wa] Failed to update total_sent for client ${clientId}:`, updateErr);
    }
  }

  console.log(`[abandoned-cart-wa] Done: ${sent} sent, ${skipped} skipped, ${carts.length} total`);

  return c.json({ sent, skipped, total: carts.length });
}
