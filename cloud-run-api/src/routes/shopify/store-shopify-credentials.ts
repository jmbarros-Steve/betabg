import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Store per-client Shopify OAuth credentials.
 *
 * Receives the client's Shopify install link and Client Secret,
 * parses the client_id from the link, encrypts the secret,
 * upserts into platform_connections, and returns the install link
 * so the frontend can redirect to Shopify OAuth.
 *
 * POST /api/store-shopify-credentials (authMiddleware)
 * Body: { clientId, installLink, shopifyClientSecret, shopDomain }
 */
export async function storeShopifyCredentials(c: Context) {
  try {
    const body = await c.req.json();
    const { clientId, installLink, shopifyClientSecret, shopDomain } = body;

    if (!clientId || !installLink || !shopifyClientSecret || !shopDomain) {
      return c.json({ error: 'Missing required fields: clientId, installLink, shopifyClientSecret, shopDomain' }, 400);
    }

    // Parse shopifyClientId from the install link
    // Format: https://admin.shopify.com/store/{handle}/oauth/install?client_id={client_id}
    let shopifyClientId: string;
    try {
      const linkUrl = new URL(installLink.trim());
      shopifyClientId = linkUrl.searchParams.get('client_id') || '';
      if (!shopifyClientId) {
        return c.json({ error: 'No se encontró client_id en el enlace de instalación. Verifica que sea un enlace válido de Shopify Partners.' }, 400);
      }
    } catch {
      return c.json({ error: 'El enlace de instalación no es una URL válida' }, 400);
    }

    // Validate shopifyClientSecret format (basic check)
    if (shopifyClientSecret.trim().length < 10) {
      return c.json({ error: 'Invalid Shopify Client Secret' }, 400);
    }

    // Normalize domain
    let normalizedDomain = shopDomain.trim().toLowerCase();
    normalizedDomain = normalizedDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!normalizedDomain.endsWith('.myshopify.com')) {
      normalizedDomain = `${normalizedDomain}.myshopify.com`;
    }

    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    if (!shopRegex.test(normalizedDomain)) {
      return c.json({ error: 'Invalid shop domain format' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Validate that the authenticated user owns this client
    const userId = (c as any).userId;
    if (userId) {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
        .single();

      if (!client) {
        const { data: role } = await supabaseAdmin
          .from('user_roles')
          .select('role, is_super_admin')
          .eq('user_id', userId)
          .single();

        if (!role?.is_super_admin && role?.role !== 'admin') {
          return c.json({ error: 'Unauthorized: you do not own this client' }, 403);
        }
      }
    }

    // Encrypt the client secret
    const { data: encryptedSecret, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: shopifyClientSecret.trim() });

    if (encryptError) {
      console.error('Error encrypting Shopify client secret:', encryptError);
      return c.json({ error: 'Error encrypting credentials' }, 500);
    }

    // Upsert platform_connections with Shopify credentials (inactive until OAuth completes)
    const { data: existing } = await supabaseAdmin
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .single();

    if (existing) {
      await supabaseAdmin.from('platform_connections').update({
        shopify_client_id: shopifyClientId,
        shopify_client_secret_encrypted: encryptedSecret,
        shop_domain: normalizedDomain,
        store_url: `https://${normalizedDomain}`,
        is_active: false,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('platform_connections').insert({
        client_id: clientId,
        platform: 'shopify',
        shopify_client_id: shopifyClientId,
        shopify_client_secret_encrypted: encryptedSecret,
        shop_domain: normalizedDomain,
        store_url: `https://${normalizedDomain}`,
        is_active: false,
      });
    }

    console.log('Stored Shopify credentials for client:', clientId, 'shopifyClientId:', shopifyClientId);

    // Return the install link directly — the client will be redirected to Shopify
    return c.json({ success: true, installUrl: installLink.trim() });
  } catch (error: any) {
    console.error('Error in store-shopify-credentials:', error);
    return c.json({ error: error.message }, 500);
  }
}
