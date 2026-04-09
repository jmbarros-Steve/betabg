import { Context } from 'hono';
import { createHmac, timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Verify Shopify webhook HMAC signature.
 * Returns true if valid, false if invalid.
 * If SHOPIFY_WEBHOOK_SECRET is not set, logs a warning and returns true (graceful degradation).
 */
function verifyShopifyHmac(rawBody: string, hmacHeader: string | undefined): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('[checkout-webhook] SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC verification (graceful degradation)');
    return true;
  }

  if (!hmacHeader) {
    console.error('[checkout-webhook] Missing X-Shopify-Hmac-Sha256 header');
    return false;
  }

  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

  try {
    return timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmacHeader, 'utf8'));
  } catch {
    // timingSafeEqual throws if buffers differ in length
    return false;
  }
}

/**
 * Shopify Checkout Webhook — receives checkouts/create events.
 * Saves checkout data to shopify_abandoned_checkouts for later WA follow-up.
 * The abandoned-cart-wa cron checks if the checkout converted to an order.
 *
 * Route: POST /api/whatsapp/shopify-checkout-webhook
 * Auth: Shopify HMAC (X-Shopify-Hmac-Sha256)
 */
export async function shopifyCheckoutWebhook(c: Context) {
  try {
    // Read raw body for HMAC verification before parsing JSON
    const rawBody = await c.req.text();
    const hmacHeader = c.req.header('X-Shopify-Hmac-Sha256');

    if (!verifyShopifyHmac(rawBody, hmacHeader)) {
      console.error('[checkout-webhook] HMAC verification failed');
      return c.json({ error: 'Unauthorized: invalid HMAC signature' }, 401);
    }

    const body = JSON.parse(rawBody);

    // Shopify sends the shop domain in headers
    const shopDomain = c.req.header('X-Shopify-Shop-Domain') || '';

    if (!body.id) {
      return c.json({ error: 'Invalid checkout payload' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Find client by shop_domain
    const client = await safeQuerySingleOrDefault<any>(
      supabase
        .from('clients')
        .select('id')
        .eq('shop_domain', shopDomain)
        .limit(1)
        .maybeSingle(),
      null,
      'shopifyCheckoutWebhook.getClient',
    );

    if (!client) {
      // Not a registered merchant — ignore
      console.log(`[checkout-webhook] Unknown shop: ${shopDomain}`);
      return c.json({ ok: true, skipped: 'unknown shop' });
    }

    // Extract customer phone (Shopify sends in various formats)
    const customerPhone = body.phone
      || body.shipping_address?.phone
      || body.billing_address?.phone
      || body.customer?.phone
      || null;

    if (!customerPhone) {
      // No phone → can't send WA
      return c.json({ ok: true, skipped: 'no phone' });
    }

    // Clean phone: remove spaces, dashes, keep + prefix
    const cleanPhone = customerPhone.replace(/[\s\-()]/g, '');

    // Extract line items
    const lineItems = (body.line_items || []).slice(0, 5).map((item: any) => ({
      title: item.title,
      price: item.price,
      quantity: item.quantity,
      image_url: item.image_url || null,
    }));

    // Upsert checkout (Shopify may send multiple events for same checkout)
    const { error: upsertError } = await supabase.from('shopify_abandoned_checkouts').upsert({
      client_id: client.id,
      checkout_id: String(body.id),
      customer_phone: cleanPhone,
      customer_name: body.customer?.first_name
        ? `${body.customer.first_name} ${body.customer.last_name || ''}`.trim()
        : body.shipping_address?.name || null,
      customer_email: body.email || body.customer?.email || null,
      line_items: lineItems,
      total_price: parseFloat(body.total_price) || 0,
      currency: body.currency || 'CLP',
      abandoned_checkout_url: body.abandoned_checkout_url || null,
      wa_reminder_sent: false,
      order_completed: false,
    }, { onConflict: 'client_id,checkout_id' });

    if (upsertError) {
      console.error('[checkout-webhook] Upsert error:', upsertError);
      return c.json({ error: 'Failed to save checkout' }, 500);
    }

    console.log(`[checkout-webhook] Saved checkout ${body.id} for ${shopDomain}, phone: ${cleanPhone}`);

    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[checkout-webhook] Error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}
