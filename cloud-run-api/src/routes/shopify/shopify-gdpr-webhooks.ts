import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

// NOTE: HMAC verification is now handled by shopifyHmacMiddleware in index.ts.
// The middleware stores the parsed body in c.set('parsedBody', ...) and raw body in c.set('rawBody', ...).

/**
 * Delete all data associated with a shop domain.
 * Called when merchant uninstalls the app (shop/redact).
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
    const clients = await safeQueryOrDefault<{ id: string }>(
      supabase
        .from('clients')
        .select('id')
        .eq('shop_domain', shopDomain),
      [],
      'shopifyGdprWebhooks.getClientsByShop',
    );

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
        const convs = await safeQueryOrDefault<{ id: string }>(
          supabase
            .from('steve_conversations')
            .select('id')
            .eq('client_id', client.id),
          [],
          'shopifyGdprWebhooks.getSteveConversations',
        );

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

/**
 * Shopify GDPR Webhooks handler — POST only.
 *
 * Handles topics: app/uninstalled, customers/data_request, customers/redact, shop/redact
 *
 * NO auth middleware — uses Shopify HMAC verification (X-Shopify-Hmac-Sha256).
 * Always returns 200 (Shopify requirement) after successful HMAC check.
 */
export async function shopifyGdprWebhooks(c: Context) {
  const webhookId = c.req.header('x-shopify-webhook-id') || 'unknown';
  console.log(`[GDPR Webhook ${webhookId}] Processing request...`);

  try {
    const topic = c.req.header('x-shopify-topic') || '';
    const shopDomain = c.req.header('x-shopify-shop-domain') || '';

    console.log(`[GDPR ${webhookId}] topic=${topic}, shop=${shopDomain}`);

    // HMAC verification is handled by shopifyHmacMiddleware (applied in index.ts).
    // The middleware stores the parsed body via c.set('parsedBody', ...).
    console.log(`[GDPR ${webhookId}] HMAC verified by middleware`);

    // Get pre-parsed payload from middleware
    const payload: any = c.get('parsedBody') || {};

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

        return c.json({
          success: true,
          webhook_id: webhookId,
          topic: 'app/uninstalled',
          message: `Connection deactivated for ${payloadShopDomain}`,
          processed_at: new Date().toISOString(),
        }, 200);
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

        return c.json({
          success: true,
          webhook_id: webhookId,
          topic: 'customers/data_request',
          message: 'Data request acknowledged. This application only stores aggregated store performance metrics. No personal customer data (names, emails, addresses, purchase history) is collected or stored.',
          data_stored: 'none',
          processed_at: new Date().toISOString(),
        }, 200);
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

        return c.json({
          success: true,
          webhook_id: webhookId,
          topic: 'customers/redact',
          message: 'Redact request acknowledged. No personal customer data is stored by this application. Only aggregated store metrics are collected.',
          data_deleted: 'none_required',
          processed_at: new Date().toISOString(),
        }, 200);
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

        return c.json({
          success: true,
          webhook_id: webhookId,
          topic: 'shop/redact',
          message: 'Shop redact request processed. All merchant data has been deleted.',
          deletion_details: deleteResult.details,
          deleted: deleteResult.deleted,
          processed_at: new Date().toISOString(),
        }, 200);
      }

      default:
        console.log(`[GDPR ${webhookId}] Unknown topic: ${topic}`);
        return c.json({
          success: true,
          webhook_id: webhookId,
          message: 'Webhook received but topic not recognized',
          topic: topic,
        }, 200);
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[GDPR] Error processing webhook:`, err);
    return c.json({
      error: 'Internal server error',
      message: errorMessage,
    }, 500);
  }
}
