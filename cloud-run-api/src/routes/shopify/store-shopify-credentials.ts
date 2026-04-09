import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Store Shopify Custom App Client ID + Client Secret (OAuth credentials).
 * 
 * These credentials are needed before the OAuth install link can work.
 * The merchant creates a Custom App in Shopify Admin, and provides
 * the Client ID and Client Secret from the API credentials tab.
 *
 * POST /api/store-shopify-credentials (authMiddleware)
 * Body: { clientId, shopDomain, shopifyClientId, shopifyClientSecret }
 */
export async function storeShopifyCredentials(c: Context) {
  try {
    const body = await c.req.json();
    const { clientId, shopDomain, shopifyClientId, shopifyClientSecret } = body;

    if (!clientId || !shopDomain || !shopifyClientId || !shopifyClientSecret) {
      return c.json({ error: 'Faltan campos requeridos: clientId, shopDomain, shopifyClientId, shopifyClientSecret' }, 400);
    }

    // Normalize domain
    let normalizedDomain = shopDomain.trim().toLowerCase();
    normalizedDomain = normalizedDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!normalizedDomain.endsWith('.myshopify.com')) {
      normalizedDomain = `${normalizedDomain}.myshopify.com`;
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Validate that the authenticated user owns this client or is super admin
    const userId = (c as any).userId;
    if (userId) {
      const client = await safeQuerySingleOrDefault<{ id: string }>(
        supabaseAdmin
          .from('clients')
          .select('id')
          .eq('id', clientId)
          .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
          .single(),
        null,
        'storeShopifyCredentials.getClient',
      );

      if (!client) {
        const role = await safeQuerySingleOrDefault<{ role: string; is_super_admin: boolean }>(
          supabaseAdmin
            .from('user_roles')
            .select('role, is_super_admin')
            .eq('user_id', userId)
            .single(),
          null,
          'storeShopifyCredentials.getRole',
        );

        if (!role?.is_super_admin && role?.role !== 'admin') {
          return c.json({ error: 'No autorizado' }, 403);
        }
      }
    }

    // Encrypt the client secret
    const { data: encryptedSecret, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: shopifyClientSecret.trim() });

    if (encryptError) {
      console.error('Error encrypting Shopify client secret:', encryptError);
      return c.json({ error: 'Error al cifrar las credenciales' }, 500);
    }

    // Upsert platform_connections
    const existing = await safeQuerySingleOrDefault<{ id: string }>(
      supabaseAdmin
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .maybeSingle(),
      null,
      'storeShopifyCredentials.getExistingConnection',
    );

    const connectionData = {
      shopify_client_id: shopifyClientId.trim(),
      shopify_client_secret_encrypted: encryptedSecret,
      shop_domain: normalizedDomain,
      store_url: `https://${normalizedDomain}`,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('platform_connections')
        .update(connectionData)
        .eq('id', existing.id);

      if (updateErr) {
        console.error('Error updating platform_connections:', updateErr);
        return c.json({ error: 'Error al actualizar la conexión' }, 500);
      }
    } else {
      const { error: insertErr } = await supabaseAdmin
        .from('platform_connections')
        .insert({
          client_id: clientId,
          platform: 'shopify',
          ...connectionData,
        });

      if (insertErr) {
        console.error('Error inserting platform_connections:', insertErr);
        return c.json({ error: 'Error al crear la conexión' }, 500);
      }
    }

    console.log('Shopify credentials stored for client:', clientId, 'domain:', normalizedDomain);

    return c.json({ success: true, shopDomain: normalizedDomain });
  } catch (error: any) {
    console.error('Error in store-shopify-credentials:', error);
    return c.json({ error: error.message }, 500);
  }
}
