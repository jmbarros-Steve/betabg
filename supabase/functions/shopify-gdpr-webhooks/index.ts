import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain, x-shopify-webhook-id',
};

/**
 * Verify Shopify webhook HMAC signature using timing-safe comparison
 * Critical for GDPR compliance - prevents timing attacks
 */
function verifyWebhookHmac(body: string, hmacHeader: string, secret: string): boolean {
  try {
    if (!hmacHeader || !secret) {
      console.error('Missing HMAC header or secret');
      return false;
    }
    
    const generatedHmac = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
    
    // Use timing-safe comparison to prevent timing attacks
    const encoder = new TextEncoder();
    const generatedBuffer = encoder.encode(generatedHmac);
    const headerBuffer = encoder.encode(hmacHeader);
    
    if (generatedBuffer.length !== headerBuffer.length) {
      return false;
    }
    
    return timingSafeEqual(generatedBuffer, headerBuffer);
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

/**
 * Initialize Supabase admin client for data operations
 */
function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Delete all data associated with a shop domain
 * Called when merchant uninstalls the app (shop/redact)
 */
async function deleteShopData(shopDomain: string): Promise<{ deleted: boolean; details: string[] }> {
  const supabase = getSupabaseAdmin();
  const details: string[] = [];
  
  try {
    // 1. Delete campaign recommendations
    const { error: recError, count: recCount } = await supabase
      .from('campaign_recommendations')
      .delete()
      .eq('shop_domain', shopDomain);
    
    if (recError) {
      console.error('Error deleting campaign_recommendations:', recError);
    } else {
      details.push(`campaign_recommendations: ${recCount ?? 0} deleted`);
    }
    
    // 2. Delete campaign metrics
    const { error: cmError, count: cmCount } = await supabase
      .from('campaign_metrics')
      .delete()
      .eq('shop_domain', shopDomain);
    
    if (cmError) {
      console.error('Error deleting campaign_metrics:', cmError);
    } else {
      details.push(`campaign_metrics: ${cmCount ?? 0} deleted`);
    }
    
    // 3. Delete platform metrics
    const { error: pmError, count: pmCount } = await supabase
      .from('platform_metrics')
      .delete()
      .eq('shop_domain', shopDomain);
    
    if (pmError) {
      console.error('Error deleting platform_metrics:', pmError);
    } else {
      details.push(`platform_metrics: ${pmCount ?? 0} deleted`);
    }
    
    // 4. Delete platform connections
    const { error: pcError, count: pcCount } = await supabase
      .from('platform_connections')
      .delete()
      .eq('shop_domain', shopDomain);
    
    if (pcError) {
      console.error('Error deleting platform_connections:', pcError);
    } else {
      details.push(`platform_connections: ${pcCount ?? 0} deleted`);
    }
    
    // 5. Find and delete client record
    const { data: clients } = await supabase
      .from('clients')
      .select('id')
      .eq('shop_domain', shopDomain);
    
    if (clients && clients.length > 0) {
      for (const client of clients) {
        // Delete related records first (foreign key constraints)
        await supabase.from('buyer_personas').delete().eq('client_id', client.id);
        await supabase.from('client_financial_config').delete().eq('client_id', client.id);
        await supabase.from('saved_meta_copies').delete().eq('client_id', client.id);
        await supabase.from('saved_google_copies').delete().eq('client_id', client.id);
        await supabase.from('klaviyo_email_plans').delete().eq('client_id', client.id);
        await supabase.from('steve_feedback').delete().eq('client_id', client.id);
        
        // Delete steve conversations and messages
        const { data: convs } = await supabase
          .from('steve_conversations')
          .select('id')
          .eq('client_id', client.id);
        
        if (convs) {
          for (const conv of convs) {
            await supabase.from('steve_messages').delete().eq('conversation_id', conv.id);
          }
          await supabase.from('steve_conversations').delete().eq('client_id', client.id);
        }
      }
      
      // Now delete client records
      const { error: clientError, count: clientCount } = await supabase
        .from('clients')
        .delete()
        .eq('shop_domain', shopDomain);
      
      if (clientError) {
        console.error('Error deleting clients:', clientError);
      } else {
        details.push(`clients: ${clientCount ?? 0} deleted`);
      }
    }
    
    console.log(`Shop data deletion completed for ${shopDomain}:`, details);
    return { deleted: true, details };
    
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in deleteShopData:', err);
    return { deleted: false, details: [`Error: ${errorMessage}`] };
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

  const webhookId = req.headers.get('x-shopify-webhook-id') || 'unknown';
  console.log(`[GDPR Webhook ${webhookId}] Processing request...`);

  try {
    const shopifySecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
    if (!shopifySecret) {
      console.error('[GDPR] SHOPIFY_CLIENT_SECRET not configured');
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

    console.log(`[GDPR ${webhookId}] topic=${topic}, shop=${shopDomain}`);

    // SECURITY: Verify HMAC signature using timing-safe comparison
    if (!verifyWebhookHmac(rawBody, hmacHeader, shopifySecret)) {
      console.error(`[GDPR ${webhookId}] HMAC verification failed`);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[GDPR ${webhookId}] HMAC verified successfully`);

    // Parse body after verification
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }

    // Handle different webhook types (GDPR + app lifecycle)
    switch (topic) {
      case 'app/uninstalled': {
        // Merchant uninstalled the app — deactivate connection and clear token
        const payloadShopDomain = payload.myshopify_domain || payload.domain || shopDomain;
        console.log(`[Webhook ${webhookId}] App uninstalled for shop: ${payloadShopDomain}`);
        
        const supabase = getSupabaseAdmin();
        
        // Deactivate the Shopify connection and clear the access token
        const { error: updateError, count } = await supabase
          .from('platform_connections')
          .update({
            is_active: false,
            access_token_encrypted: null,
            updated_at: new Date().toISOString(),
          })
          .eq('shop_domain', payloadShopDomain)
          .eq('platform', 'shopify');
        
        if (updateError) {
          console.error(`[Webhook ${webhookId}] Error deactivating connection:`, updateError);
        } else {
          console.log(`[Webhook ${webhookId}] Deactivated ${count ?? 0} connection(s) for ${payloadShopDomain}`);
        }
        
        return new Response(JSON.stringify({
          success: true,
          webhook_id: webhookId,
          topic: 'app/uninstalled',
          message: `Connection deactivated for ${payloadShopDomain}`,
          processed_at: new Date().toISOString(),
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'customers/data_request': {
        // Customer requests their data under GDPR Article 15
        // We only store aggregated store metrics, no personal customer data
        const customerId = payload.customer?.id;
        const email = payload.customer?.email;
        
        console.log(`[GDPR ${webhookId}] Customer data request:`, {
          shop: shopDomain,
          customer_id: customerId,
          email: email ? `${email.substring(0, 3)}***` : 'none',
        });
        
        return new Response(JSON.stringify({
          success: true,
          webhook_id: webhookId,
          topic: 'customers/data_request',
          message: 'Data request acknowledged. This application only stores aggregated store performance metrics. No personal customer data (names, emails, addresses, purchase history) is collected or stored.',
          data_stored: 'none',
          processed_at: new Date().toISOString(),
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'customers/redact': {
        // Customer requests deletion under GDPR Article 17 (Right to Erasure)
        const customerId = payload.customer?.id;
        const email = payload.customer?.email;
        
        console.log(`[GDPR ${webhookId}] Customer redact request:`, {
          shop: shopDomain,
          customer_id: customerId,
          orders_to_redact: payload.orders_to_redact?.length || 0,
        });
        
        return new Response(JSON.stringify({
          success: true,
          webhook_id: webhookId,
          topic: 'customers/redact',
          message: 'Redact request acknowledged. No personal customer data is stored by this application. Only aggregated store metrics are collected.',
          data_deleted: 'none_required',
          processed_at: new Date().toISOString(),
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'shop/redact': {
        // Merchant uninstalled the app - MUST delete all their data within 48 hours
        const shopId = payload.shop_id;
        const payloadShopDomain = payload.shop_domain || shopDomain;
        
        console.log(`[GDPR ${webhookId}] Shop redact request - DELETING ALL DATA:`, {
          shop_id: shopId,
          shop_domain: payloadShopDomain,
        });
        
        // Actually delete the merchant's data
        const deleteResult = await deleteShopData(payloadShopDomain);
        
        console.log(`[GDPR ${webhookId}] Shop data deletion result:`, deleteResult);
        
        return new Response(JSON.stringify({
          success: true,
          webhook_id: webhookId,
          topic: 'shop/redact',
          message: 'Shop redact request processed. All merchant data has been deleted.',
          deletion_details: deleteResult.details,
          deleted: deleteResult.deleted,
          processed_at: new Date().toISOString(),
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        console.log(`[GDPR ${webhookId}] Unknown topic: ${topic}`);
        return new Response(JSON.stringify({
          success: true,
          webhook_id: webhookId,
          message: 'Webhook received but topic not recognized',
          topic: topic,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[GDPR] Error processing webhook:`, err);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
