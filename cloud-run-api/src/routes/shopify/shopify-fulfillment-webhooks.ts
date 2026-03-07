import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// TypeScript interfaces for webhook payloads
// ---------------------------------------------------------------------------

/** Common shape of a Shopify line item inside an order webhook */
interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  sku: string | null;
  variant_id: number | null;
  price: string;
  fulfillment_status: string | null;
}

/** Simplified Shopify order payload — add more fields as needed */
interface ShopifyOrderPayload {
  id: number;
  order_number: number;
  name: string;            // e.g. "#1001"
  email: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  currency: string;
  created_at: string;
  updated_at: string;
  line_items: ShopifyLineItem[];
  shipping_address?: {
    city: string;
    country: string;
  };
  [key: string]: unknown;  // allow additional fields
}

// ---------------------------------------------------------------------------
// HMAC verification — timing-safe, raw body, SHA-256, Base64
// ---------------------------------------------------------------------------

/**
 * Verify the X-Shopify-Hmac-Sha256 header against the raw request body.
 * Returns true only when the signature is valid.
 */
function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string,
): boolean {
  try {
    if (!hmacHeader || !secret) {
      console.error('[HMAC] Missing header or secret');
      return false;
    }

    // Compute expected HMAC
    const computed = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Timing-safe comparison
    const encoder = new TextEncoder();
    const a = encoder.encode(computed);
    const b = encoder.encode(hmacHeader);

    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (err) {
    console.error('[HMAC] Verification error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Background / async processing placeholder
// ---------------------------------------------------------------------------

/**
 * ASYNC PROCESSING HOOK
 *
 * Shopify requires a 200 response within ~5 seconds. For heavy work
 * (ERP sync, email notifications, inventory updates, analytics, etc.)
 * queue the job here and return immediately.
 */
async function enqueueBackgroundJob(
  topic: string,
  shopDomain: string,
  payload: unknown,
): Promise<void> {
  // TODO: implement your async job queue here
  console.log(`[BG] Job enqueued — topic=${topic}, shop=${shopDomain}`);
}

// ---------------------------------------------------------------------------
// Per-topic handlers
// ---------------------------------------------------------------------------

async function handleOrderFulfilled(
  shopDomain: string,
  payload: ShopifyOrderPayload,
  webhookId: string,
): Promise<void> {
  console.log(`[${webhookId}] Order FULFILLED — #${payload.name}, shop=${shopDomain}`);
  console.log(`[${webhookId}] Items: ${payload.line_items?.length ?? 0}, total=${payload.total_price} ${payload.currency}`);

  // Synchronous light work (< 5 s)
  try {
    const supabase = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Find the Shopify connection for this shop
    const { data: conn } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('shop_domain', shopDomain)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .single();

    if (conn) {
      await supabase.from('platform_metrics').upsert(
        {
          connection_id: conn.id,
          shop_domain: shopDomain,
          metric_type: 'fulfilled_orders',
          metric_date: today,
          metric_value: 1,          // will be summed in queries
          currency: payload.currency,
        },
        { onConflict: 'connection_id,metric_type,metric_date' },
      );
    }
  } catch (err) {
    console.error(`[${webhookId}] Metrics upsert error:`, err);
  }

  // Heavy work -> background
  await enqueueBackgroundJob('orders/fulfilled', shopDomain, payload);
}

async function handleOrderPartiallyFulfilled(
  shopDomain: string,
  payload: ShopifyOrderPayload,
  webhookId: string,
): Promise<void> {
  console.log(`[${webhookId}] Order PARTIALLY FULFILLED — #${payload.name}, shop=${shopDomain}`);

  // Light processing inline
  await enqueueBackgroundJob('orders/partially_fulfilled', shopDomain, payload);
}

async function handleOrderCancelled(
  shopDomain: string,
  payload: ShopifyOrderPayload,
  webhookId: string,
): Promise<void> {
  console.log(`[${webhookId}] Order CANCELLED — #${payload.name}, shop=${shopDomain}`);
  await enqueueBackgroundJob('orders/cancelled', shopDomain, payload);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Shopify Fulfillment Webhooks handler — POST only.
 *
 * Handles topics: orders/fulfilled, orders/partially_fulfilled, orders/cancelled
 *
 * NO auth middleware — uses Shopify HMAC verification (X-Shopify-Hmac-Sha256).
 * Always returns 200 (Shopify requirement) after successful HMAC check.
 */
export async function shopifyFulfillmentWebhooks(c: Context) {
  // Extract Shopify headers
  const hmacHeader = c.req.header('x-shopify-hmac-sha256') || '';
  const topic      = c.req.header('x-shopify-topic') || '';
  const shopDomain = c.req.header('x-shopify-shop-domain') || '';
  const webhookId  = c.req.header('x-shopify-webhook-id') || 'unknown';

  console.log(`[Fulfillment ${webhookId}] Received — topic=${topic}, shop=${shopDomain}`);

  // Read raw body BEFORE any parsing (required for HMAC)
  const rawBody = await c.req.text();

  // HMAC verification
  // SHOPIFY_WEBHOOK_SECRET is the "Webhook signing secret" from the Partner Dashboard.
  // Falls back to SHOPIFY_CLIENT_SECRET for backwards compatibility.
  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
  if (!shopifySecret) {
    console.error('[Fulfillment] Neither SHOPIFY_WEBHOOK_SECRET nor SHOPIFY_CLIENT_SECRET configured');
    return c.json({ error: 'Server misconfiguration' }, 500);
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, shopifySecret)) {
    console.error(`[Fulfillment ${webhookId}] HMAC verification FAILED — rejecting`);
    // DO NOT process the body — return immediately
    return c.json({ error: 'Unauthorized — HMAC mismatch' }, 401);
  }

  console.log(`[Fulfillment ${webhookId}] HMAC verified`);

  // Parse payload
  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // Route by topic
  try {
    switch (topic) {
      case 'orders/fulfilled':
        await handleOrderFulfilled(shopDomain, payload, webhookId);
        break;

      case 'orders/partially_fulfilled':
        await handleOrderPartiallyFulfilled(shopDomain, payload, webhookId);
        break;

      case 'orders/cancelled':
        await handleOrderCancelled(shopDomain, payload, webhookId);
        break;

      default:
        console.log(`[Fulfillment ${webhookId}] Unhandled topic: ${topic}`);
    }
  } catch (err) {
    // Log but still return 200 so Shopify doesn't retry
    console.error(`[Fulfillment ${webhookId}] Handler error:`, err);
  }

  // Always return 200 quickly
  return c.json({
    success: true,
    webhook_id: webhookId,
    topic,
    processed_at: new Date().toISOString(),
  }, 200);
}
