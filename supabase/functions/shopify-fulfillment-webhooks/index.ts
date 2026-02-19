/**
 * ============================================================================
 * SHOPIFY FULFILLMENT WEBHOOKS — Edge Function
 * ============================================================================
 *
 * Handles mandatory fulfillment-related Shopify webhooks:
 *   • orders/fulfilled
 *   • orders/partially_fulfilled
 *   • orders/cancelled
 *   • (extensible — add more topics in the switch statement below)
 *
 * SECURITY:
 *   - HMAC-SHA256 verification using X-Shopify-Hmac-Sha256 header
 *   - Timing-safe comparison to prevent timing attacks
 *   - Raw body used for HMAC (never parsed JSON)
 *   - Returns 401 immediately on HMAC failure — body is NOT processed
 *
 * TLS / HTTPS:
 *   - Lovable Cloud / Supabase Edge Functions are served over HTTPS
 *     with valid TLS certificates automatically (no self-signed certs).
 *   - For local dev, use `ngrok http 54321` and register the ngrok
 *     HTTPS URL as the webhook address in Shopify.
 *
 * ENVIRONMENT VARIABLES (secrets):
 *   - SHOPIFY_WEBHOOK_SECRET — The "Webhook signing secret" from Shopify
 *                              Partner Dashboard → App → API credentials.
 *                              This is used to verify HMAC signatures on
 *                              incoming webhooks. Falls back to
 *                              SHOPIFY_CLIENT_SECRET if not set.
 *                              Configure in Lovable Cloud → Secrets.
 *   - SUPABASE_URL           — auto-provided by Lovable Cloud
 *   - SUPABASE_SERVICE_ROLE_KEY — auto-provided by Lovable Cloud
 *
 * HOW TO REGISTER THESE WEBHOOKS:
 *   Option A — Admin API (recommended, done automatically in OAuth callback):
 *     POST https://{shop}.myshopify.com/admin/api/2024-10/webhooks.json
 *     Headers: { "X-Shopify-Access-Token": "{access_token}" }
 *     Body: { "webhook": { "topic": "orders/fulfilled", "address": "https://…/shopify-fulfillment-webhooks", "format": "json" } }
 *
 *   Option B — Shopify Admin UI:
 *     Settings → Notifications → Webhooks → Create webhook
 *     Topic: "Order fulfillment" | Address: this function's URL
 *
 * HOW TO TEST LOCALLY:
 *   1. Run `npx supabase functions serve` locally
 *   2. Run `ngrok http 54321` to get a public HTTPS URL
 *   3. Register the ngrok URL as the webhook address in Shopify
 *   4. Trigger a test event from Shopify Admin → Settings → Notifications → Send test notification
 *   5. Check function logs for output
 *
 * HMAC VERIFICATION (high-level):
 *   1. Read raw request body as text (NOT parsed JSON)
 *   2. Compute: Base64(HMAC-SHA256(rawBody, SHOPIFY_WEBHOOK_SECRET))
 *   3. Compare computed hash to X-Shopify-Hmac-Sha256 header using timingSafeEqual
 *   4. If mismatch → 401. If match → process webhook.
 *
 * ============================================================================
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS headers (needed for Supabase Edge Functions)
// ---------------------------------------------------------------------------
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, ' +
    'x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain, ' +
    'x-shopify-webhook-id, x-shopify-api-version',
};

// ---------------------------------------------------------------------------
// TypeScript interfaces for webhook payloads (extend as needed)
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
// Supabase admin client helper
// ---------------------------------------------------------------------------
function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing Supabase config');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Background / async processing placeholder
// ---------------------------------------------------------------------------

/**
 * ⚡ ASYNC PROCESSING HOOK
 *
 * Shopify requires a 200 response within ~5 seconds. For heavy work
 * (ERP sync, email notifications, inventory updates, analytics, etc.)
 * queue the job here and return immediately.
 *
 * Options:
 *   - Insert a row into a `webhook_jobs` table and poll with a cron
 *   - Use Supabase pg_cron or pg_net for deferred HTTP calls
 *   - Push to an external queue (SQS, BullMQ, etc.)
 */
async function enqueueBackgroundJob(
  topic: string,
  shopDomain: string,
  payload: unknown,
): Promise<void> {
  // TODO: implement your async job queue here
  // Example: insert into a jobs table for later processing
  //
  // const supabase = getSupabaseAdmin();
  // await supabase.from('webhook_jobs').insert({
  //   topic, shop_domain: shopDomain,
  //   payload: JSON.stringify(payload),
  //   status: 'pending',
  // });

  console.log(`[BG] Job enqueued — topic=${topic}, shop=${shopDomain}`);
}

// ---------------------------------------------------------------------------
// Per-topic handlers — add new topics here
// ---------------------------------------------------------------------------

async function handleOrderFulfilled(
  shopDomain: string,
  payload: ShopifyOrderPayload,
  webhookId: string,
): Promise<void> {
  console.log(`[${webhookId}] Order FULFILLED — #${payload.name}, shop=${shopDomain}`);
  console.log(`[${webhookId}] Items: ${payload.line_items?.length ?? 0}, total=${payload.total_price} ${payload.currency}`);

  // ── Synchronous light work (< 5 s) ──
  // Example: update platform_metrics with fulfillment count
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

  // ── Heavy work → background ──
  await enqueueBackgroundJob('orders/fulfilled', shopDomain, payload);
}

async function handleOrderPartiallyFulfilled(
  shopDomain: string,
  payload: ShopifyOrderPayload,
  webhookId: string,
): Promise<void> {
  console.log(`[${webhookId}] Order PARTIALLY FULFILLED — #${payload.name}, shop=${shopDomain}`);

  // Light processing inline …
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

Deno.serve(async (req) => {
  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Only accept POST ──
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Extract Shopify headers ──
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';
  const topic      = req.headers.get('x-shopify-topic') || '';
  const shopDomain = req.headers.get('x-shopify-shop-domain') || '';
  const webhookId  = req.headers.get('x-shopify-webhook-id') || 'unknown';

  console.log(`[Fulfillment ${webhookId}] Received — topic=${topic}, shop=${shopDomain}`);

  // ── Read raw body BEFORE any parsing (required for HMAC) ──
  const rawBody = await req.text();

  // ── HMAC verification ──
  // SHOPIFY_WEBHOOK_SECRET is the "Webhook signing secret" from the Partner Dashboard.
  // Falls back to SHOPIFY_CLIENT_SECRET for backwards compatibility.
  const shopifySecret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || Deno.env.get('SHOPIFY_CLIENT_SECRET');
  if (!shopifySecret) {
    console.error('[Fulfillment] Neither SHOPIFY_WEBHOOK_SECRET nor SHOPIFY_CLIENT_SECRET configured');
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, shopifySecret)) {
    console.error(`[Fulfillment ${webhookId}] ❌ HMAC verification FAILED — rejecting`);
    // DO NOT process the body — return immediately
    return new Response(
      JSON.stringify({ error: 'Unauthorized — HMAC mismatch' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[Fulfillment ${webhookId}] ✅ HMAC verified`);

  // ── Parse payload ──
  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Route by topic ──
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

      // ────────────────────────────────────────────────────────
      // ✏️  ADD MORE TOPICS HERE
      // case 'fulfillments/create':
      // case 'fulfillments/update':
      //   await handleFulfillmentEvent(shopDomain, payload, webhookId);
      //   break;
      // ────────────────────────────────────────────────────────

      default:
        console.log(`[Fulfillment ${webhookId}] Unhandled topic: ${topic}`);
    }
  } catch (err) {
    // Log but still return 200 so Shopify doesn't retry
    console.error(`[Fulfillment ${webhookId}] Handler error:`, err);
  }

  // ── Always return 200 quickly ──
  return new Response(
    JSON.stringify({
      success: true,
      webhook_id: webhookId,
      topic,
      processed_at: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
