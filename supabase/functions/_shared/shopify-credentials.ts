/**
 * ============================================================================
 * Shopify Credential Resolver (Deno / Edge Functions)
 * ============================================================================
 *
 * Version Deno del resolver para usar en Supabase Edge Functions
 * (shopify-fulfillment-webhooks, shopify-gdpr-webhooks, etc.).
 *
 * Ver cloud-run-api/src/lib/shopify-credentials.ts para la version Node.
 * Mantener ambos archivos sincronizados.
 * ============================================================================
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type ShopifyMode = 'custom_app' | 'app_store';

export interface ShopifyCredentials {
  mode: ShopifyMode;
  shopDomain: string;
  connectionId: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  webhookSecret: string;
}

function getSupabaseAdmin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

function normalizeShopDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!d.endsWith('.myshopify.com')) d = `${d}.myshopify.com`;
  return d;
}

async function decryptToken(
  supabase: SupabaseClient,
  encrypted: string | null,
): Promise<string | null> {
  if (!encrypted) return null;
  try {
    const { data, error } = await supabase.rpc('decrypt_platform_token', {
      encrypted_token: encrypted,
    });
    if (error) {
      console.error('[shopify-credentials] decrypt error:', error);
      return null;
    }
    return data as string | null;
  } catch (err) {
    console.error('[shopify-credentials] decrypt exception:', err);
    return null;
  }
}

/**
 * Resuelve las credenciales Shopify para un shop_domain.
 * Retorna null si no hay conexion activa.
 */
export async function resolveShopifyCredentials(
  shopDomain: string,
  supabase?: SupabaseClient,
): Promise<ShopifyCredentials | null> {
  if (!shopDomain) return null;

  const normalizedDomain = normalizeShopDomain(shopDomain);
  const client = supabase ?? getSupabaseAdmin();

  const { data: connection, error } = await client
    .from('platform_connections')
    .select(
      'id, connection_mode, shopify_client_id, shopify_client_secret_encrypted, access_token_encrypted, shop_domain',
    )
    .eq('platform', 'shopify')
    .eq('shop_domain', normalizedDomain)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[shopify-credentials] DB lookup error:', error);
    return null;
  }
  if (!connection) return null;

  const accessToken = await decryptToken(client, connection.access_token_encrypted);
  if (!accessToken) {
    console.error('[shopify-credentials] Missing access_token for', normalizedDomain);
    return null;
  }

  const mode: ShopifyMode = (connection.connection_mode as ShopifyMode) || 'custom_app';

  if (mode === 'custom_app') {
    if (!connection.shopify_client_id || !connection.shopify_client_secret_encrypted) {
      console.error(
        '[shopify-credentials] custom_app mode pero faltan client_id/secret para',
        normalizedDomain,
      );
      return null;
    }
    const clientSecret = await decryptToken(
      client,
      connection.shopify_client_secret_encrypted,
    );
    if (!clientSecret) return null;

    return {
      mode: 'custom_app',
      shopDomain: normalizedDomain,
      connectionId: connection.id,
      clientId: connection.shopify_client_id,
      clientSecret,
      accessToken,
      webhookSecret: clientSecret,
    };
  }

  // Mode: app_store
  const globalClientId = Deno.env.get('SHOPIFY_CLIENT_ID');
  const globalClientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET');
  const globalWebhookSecret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || globalClientSecret;

  if (!globalClientId || !globalClientSecret) {
    throw new Error(
      `[shopify-credentials] app_store mode pero faltan env vars (shop=${normalizedDomain})`,
    );
  }

  return {
    mode: 'app_store',
    shopDomain: normalizedDomain,
    connectionId: connection.id,
    clientId: globalClientId,
    clientSecret: globalClientSecret,
    accessToken,
    webhookSecret: globalWebhookSecret!,
  };
}

/**
 * Helper para webhooks: obtiene SOLO el webhookSecret dado un shopDomain.
 * Usa cache en memoria por request para no desencriptar multiples veces.
 */
export async function getWebhookSecretForShop(
  shopDomain: string,
): Promise<string | null> {
  // Intenta resolver desde DB (Custom App o App Store marcado)
  try {
    const creds = await resolveShopifyCredentials(shopDomain);
    if (creds?.webhookSecret) return creds.webhookSecret;
  } catch (err) {
    console.error('[shopify-credentials] getWebhookSecret exception:', err);
  }

  // Fallback: env vars globales (solo sirve si SHOPIFY_MODE=appstore/both esta activo)
  const fallback =
    Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || Deno.env.get('SHOPIFY_CLIENT_SECRET');
  return fallback || null;
}
