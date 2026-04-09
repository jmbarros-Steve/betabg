import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Shopify Checkout Webhook — receives checkouts/create events.
 * Saves checkout data to shopify_abandoned_checkouts for later WA follow-up.
 * The abandoned-cart-wa cron checks if the checkout converted to an order.
 *
 * Route: POST /api/whatsapp/shopify-checkout-webhook
 * Auth: Shopify HMAC (verified by caller or middleware)
 */
export async function shopifyCheckoutWebhook(c: Context) {
  try {
    const body = await c.req.json();

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
    await supabase.from('shopify_abandoned_checkouts').upsert({
      client_id: client.id,
      checkout_id: String(body.id),
      customer_phone: cleanPhone,
      customer_name: body.customer?.first_name
        ? `${body.customer.first_name} ${body.customer.last_name || ''}`.trim()
        : body.shipping_address?.name || null,
      customer_email: body.email || body.customer?.email || null,
      line_items: lineItems,
      total_price: parseFloat(body.total_price || '0'),
      currency: body.currency || 'CLP',
      abandoned_checkout_url: body.abandoned_checkout_url || null,
      wa_reminder_sent: false,
      order_completed: false,
    }, { onConflict: 'client_id,checkout_id' });

    console.log(`[checkout-webhook] Saved checkout ${body.id} for ${shopDomain}, phone: ${cleanPhone}`);

    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[checkout-webhook] Error:', error);
    return c.json({ error: 'Internal error' }, 500);
  }
}
