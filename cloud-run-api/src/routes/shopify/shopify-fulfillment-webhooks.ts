import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

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

// NOTE: HMAC verification is now handled by shopifyHmacMiddleware in index.ts.
// The middleware stores the parsed body in c.set('parsedBody', ...) and raw body in c.set('rawBody', ...).

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
    const conn = await safeQuerySingleOrDefault<{ id: string }>(
      supabase
        .from('platform_connections')
        .select('id')
        .eq('shop_domain', shopDomain)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .single(),
      null,
      'shopifyFulfillmentWebhooks.getConnection',
    );

    if (conn) {
      // Try to increment existing row; if none exists, insert with value 1
      const { data: existing } = await supabase
        .from('platform_metrics')
        .select('id, metric_value')
        .eq('connection_id', conn.id)
        .eq('metric_type', 'fulfilled_orders')
        .eq('metric_date', today)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('platform_metrics')
          .update({ metric_value: (Number(existing.metric_value) || 0) + 1 })
          .eq('id', existing.id);
      } else {
        await supabase.from('platform_metrics').insert({
          connection_id: conn.id,
          shop_domain: shopDomain,
          metric_type: 'fulfilled_orders',
          metric_date: today,
          metric_value: 1,
          currency: payload.currency,
        });
      }
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
  const topic      = c.req.header('x-shopify-topic') || '';
  const shopDomain = c.req.header('x-shopify-shop-domain') || '';
  const webhookId  = c.req.header('x-shopify-webhook-id') || 'unknown';

  console.log(`[Fulfillment ${webhookId}] Received — topic=${topic}, shop=${shopDomain}`);

  // HMAC verification is handled by shopifyHmacMiddleware (applied in index.ts).
  // The middleware stores the parsed body via c.set('parsedBody', ...).
  console.log(`[Fulfillment ${webhookId}] HMAC verified by middleware`);

  // Get pre-parsed payload from middleware
  const payload: ShopifyOrderPayload = c.get('parsedBody');
  if (!payload) {
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
