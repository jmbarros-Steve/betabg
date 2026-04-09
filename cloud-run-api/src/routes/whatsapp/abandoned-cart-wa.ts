import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { getTwilioSubClient } from '../../lib/twilio-client.js';
import { decryptToken } from './setup-merchant.js';

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
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
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

      const toNumber = cart.customer_phone.startsWith('+')
        ? cart.customer_phone
        : `+${cart.customer_phone}`;

      const twilioMsg = await subClient.messages.create({
        from: `whatsapp:${waAccount.phone_number}`,
        to: `whatsapp:${toNumber}`,
        body: message,
      });

      // Deduct credit atomically (Issue 1: prevents race condition)
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

      // Update automation stats
      await supabase.from('wa_automations')
        .update({ total_sent: (automation as any).total_sent ? (automation as any).total_sent + 1 : 1 })
        .eq('client_id', cart.client_id)
        .eq('trigger_type', 'abandoned_cart');

      sent++;
      console.log(`[abandoned-cart-wa] Sent to ${toNumber} for client ${cart.client_id}`);

    } catch (err: any) {
      console.error(`[abandoned-cart-wa] Error processing cart ${cart.id}:`, err?.message);
      skipped++;
    }
  }

  console.log(`[abandoned-cart-wa] Done: ${sent} sent, ${skipped} skipped, ${carts.length} total`);

  return c.json({ sent, skipped, total: carts.length });
}
