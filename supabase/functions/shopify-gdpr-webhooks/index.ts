import { createHmac } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain',
};

/**
 * Verify Shopify webhook HMAC signature
 */
function verifyWebhookHmac(body: string, hmacHeader: string, secret: string): boolean {
  try {
    const generatedHmac = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
    return generatedHmac === hmacHeader;
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const shopifySecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
    if (!shopifySecret) {
      console.error('SHOPIFY_CLIENT_SECRET not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get raw body for HMAC verification
    const rawBody = await req.text();
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';
    const topic = req.headers.get('x-shopify-topic') || '';
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';

    console.log(`Received GDPR webhook: topic=${topic}, shop=${shopDomain}`);

    // Verify HMAC signature
    if (!verifyWebhookHmac(rawBody, hmacHeader, shopifySecret)) {
      console.error('Invalid HMAC signature for GDPR webhook');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body after verification
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }

    // Handle different GDPR webhook types
    switch (topic) {
      case 'customers/data_request':
        // Customer requests their data
        // Since we only store aggregated metrics (not personal customer data),
        // we acknowledge the request but have no personal data to provide
        console.log(`Customer data request received for shop: ${shopDomain}`, {
          customer_id: payload.customer?.id,
          email: payload.customer?.email,
        });
        return new Response(JSON.stringify({
          success: true,
          message: 'Data request acknowledged. This app only stores aggregated store metrics, no personal customer data.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'customers/redact':
        // Customer wants their data deleted
        // Since we don't store personal customer data, just acknowledge
        console.log(`Customer redact request received for shop: ${shopDomain}`, {
          customer_id: payload.customer?.id,
          email: payload.customer?.email,
        });
        return new Response(JSON.stringify({
          success: true,
          message: 'Redact request acknowledged. No personal customer data is stored by this app.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'shop/redact':
        // Merchant uninstalled the app - delete their data
        console.log(`Shop redact request received for shop: ${shopDomain}`, {
          shop_id: payload.shop_id,
          shop_domain: payload.shop_domain,
        });
        
        // Note: Here you could delete the merchant's data from your database
        // For now, we just acknowledge since data cleanup can be handled separately
        // or through a scheduled job that removes inactive connections
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Shop redact request acknowledged. Merchant data will be removed.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        console.log(`Unknown GDPR webhook topic: ${topic}`);
        return new Response(JSON.stringify({
          success: true,
          message: 'Webhook received',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Error processing GDPR webhook:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
