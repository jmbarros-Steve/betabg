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
    // Helper: execute a delete and fail immediately if there's an error.
    // This ensures partial deletion never goes unnoticed — the webhook returns 500
    // and Shopify retries, which is the correct GDPR-compliant behavior.
    const deleteOrFail = async (table: string, filter: { column: string; value: string }) => {
      const { error, count } = await supabase
        .from(table)
        .delete()
        .eq(filter.column, filter.value);

      if (error) {
        const msg = `Failed to delete from ${table} where ${filter.column}=${filter.value}: ${error.message} (code: ${error.code})`;
        console.error(`[GDPR deleteShopData] ${msg}`, { table, filter, error });
        throw new Error(msg);
      }

      details.push(`${table}: ${count ?? 0} deleted`);
    };

    // 1. Delete campaign recommendations
    await deleteOrFail('campaign_recommendations', { column: 'shop_domain', value: shopDomain });

    // 2. Delete campaign metrics
    await deleteOrFail('campaign_metrics', { column: 'shop_domain', value: shopDomain });

    // 3. Delete platform metrics
    await deleteOrFail('platform_metrics', { column: 'shop_domain', value: shopDomain });

    // 4. Delete platform connections
    await deleteOrFail('platform_connections', { column: 'shop_domain', value: shopDomain });

    // 5. Find and delete client records and their dependents
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
        await deleteOrFail('buyer_personas', { column: 'client_id', value: client.id });
        await deleteOrFail('client_financial_config', { column: 'client_id', value: client.id });
        await deleteOrFail('saved_meta_copies', { column: 'client_id', value: client.id });
        await deleteOrFail('saved_google_copies', { column: 'client_id', value: client.id });
        await deleteOrFail('klaviyo_email_plans', { column: 'client_id', value: client.id });
        await deleteOrFail('steve_feedback', { column: 'client_id', value: client.id });

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
            await deleteOrFail('steve_messages', { column: 'conversation_id', value: conv.id });
          }
          await deleteOrFail('steve_conversations', { column: 'client_id', value: client.id });
        }
      }

      // Now delete client records
      await deleteOrFail('clients', { column: 'shop_domain', value: shopDomain });
    }

    console.log(`[GDPR deleteShopData] Shop data deletion completed for ${shopDomain}:`, details);
    return { deleted: true, details };

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[GDPR deleteShopData] FAILED — partial deletion may have occurred. Shopify should retry.', {
      shopDomain,
      completedSteps: details,
      error: errorMessage,
    });
    return { deleted: false, details: [...details, `FAILED: ${errorMessage}`] };
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

        if (!deleteResult.deleted) {
          // Return 500 so Shopify retries the webhook — partial deletion is not acceptable for GDPR
          console.error(`[GDPR ${webhookId}] Shop data deletion FAILED for ${payloadShopDomain}. Returning 500 for retry.`);
          return c.json({
            success: false,
            webhook_id: webhookId,
            topic: 'shop/redact',
            message: 'Shop redact failed — will be retried by Shopify.',
            deletion_details: deleteResult.details,
            deleted: false,
            processed_at: new Date().toISOString(),
          }, 500);
        }

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
