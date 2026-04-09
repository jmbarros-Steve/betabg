import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

/**
 * Store a Shopify Admin API Access Token directly (Custom App flow).
 *
 * The merchant creates a Custom App in their Shopify Admin,
 * configures scopes, installs it, and copies the Access Token.
 * This endpoint verifies the token works, encrypts it, and
 * upserts into platform_connections with is_active=true.
 *
 * POST /api/store-shopify-token (authMiddleware)
 * Body: { clientId, shopDomain, accessToken }
 */
export async function storeShopifyToken(c: Context) {
  try {
    const body = await c.req.json();
    const { clientId, shopDomain, accessToken } = body;

    if (!clientId || !shopDomain || !accessToken) {
      return c.json({ error: 'Faltan campos requeridos: clientId, shopDomain, accessToken' }, 400);
    }

    // Normalize domain
    let normalizedDomain = shopDomain.trim().toLowerCase();
    normalizedDomain = normalizedDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!normalizedDomain.endsWith('.myshopify.com')) {
      normalizedDomain = `${normalizedDomain}.myshopify.com`;
    }

    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    if (!shopRegex.test(normalizedDomain)) {
      return c.json({ error: 'Formato de dominio inválido. Debe ser tu-tienda.myshopify.com' }, 400);
    }

    // Basic token format validation
    const trimmedToken = accessToken.trim();
    if (trimmedToken.length < 20) {
      return c.json({ error: 'El Access Token parece muy corto. Verifica que lo copiaste completo.' }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Validate that the authenticated user owns this client or is super admin
    const user = c.get('user');
    const userId = user?.id;
    if (userId) {
      const client = await safeQuerySingleOrDefault<{ id: string }>(
        supabaseAdmin
          .from('clients')
          .select('id')
          .eq('id', clientId)
          .or(`user_id.eq.${userId},client_user_id.eq.${userId}`)
          .single(),
        null,
        'storeShopifyToken.getClient',
      );

      if (!client) {
        const role = await safeQuerySingleOrDefault<{ role: string; is_super_admin: boolean }>(
          supabaseAdmin
            .from('user_roles')
            .select('role, is_super_admin')
            .eq('user_id', userId)
            .single(),
          null,
          'storeShopifyToken.getRole',
        );

        if (!role?.is_super_admin && role?.role !== 'admin') {
          return c.json({ error: 'No autorizado: no eres dueño de este cliente' }, 403);
        }
      }
    }

    // Verify the token works by calling Shopify's Shop API
    let shopName = '';
    try {
      const verifyRes = await fetch(
        `https://${normalizedDomain}/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': trimmedToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!verifyRes.ok) {
        const status = verifyRes.status;
        if (status === 401 || status === 403) {
          return c.json({
            error: 'El Access Token no es válido o no tiene permisos. Verifica que instalaste la Custom App y copiaste el token correcto.',
          }, 401);
        }
        return c.json({
          error: `Shopify respondió con error ${status}. Verifica el dominio y el token.`,
        }, 400);
      }

      const shopData: any = await verifyRes.json();
      shopName = shopData?.shop?.name || normalizedDomain;
      console.log('Shopify token verified for shop:', shopName, 'domain:', normalizedDomain);
    } catch (fetchErr: any) {
      console.error('Error verifying Shopify token:', fetchErr);
      return c.json({
        error: 'No se pudo conectar con Shopify. Verifica que el dominio es correcto.',
      }, 400);
    }

    // Encrypt the access token
    const { data: encryptedToken, error: encryptError } = await supabaseAdmin
      .rpc('encrypt_platform_token', { raw_token: trimmedToken });

    if (encryptError) {
      console.error('Error encrypting Shopify access token:', encryptError);
      return c.json({ error: 'Error al cifrar el token' }, 500);
    }

    // Upsert platform_connections with is_active=true
    const existing = await safeQuerySingleOrDefault<{ id: string }>(
      supabaseAdmin
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .maybeSingle(),
      null,
      'storeShopifyToken.getExistingConnection',
    );

    const connectionData = {
      access_token_encrypted: encryptedToken,
      shop_domain: normalizedDomain,
      store_url: `https://${normalizedDomain}`,
      is_active: true,
      connection_status: 'active',
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

    console.log('Shopify Custom App connected for client:', clientId, 'shop:', shopName);

    return c.json({
      success: true,
      shopName,
      shopDomain: normalizedDomain,
    });
  } catch (error: any) {
    console.error('Error in store-shopify-token:', error);
    return c.json({ error: error.message }, 500);
  }
}
