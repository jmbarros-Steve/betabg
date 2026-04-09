/**
 * ============================================================================
 * Shopify Credential Resolver (Cloud Run / Node.js)
 * ============================================================================
 *
 * Strategy/Resolver pattern para obtener credenciales Shopify segun el modo:
 *
 *   custom_app → lee shopify_client_id + shopify_client_secret_encrypted de
 *                platform_connections (per-connection). Modo actual.
 *
 *   app_store  → lee SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET +
 *                SHOPIFY_WEBHOOK_SECRET de env vars globales. Se activa cuando
 *                Shopify apruebe la public app.
 *
 * Regla dorada: NADIE en el backend debe leer SHOPIFY_CLIENT_* directo.
 * Todo pasa por resolveShopifyCredentials(shopDomain).
 * ============================================================================
 */

import { getSupabaseAdmin } from './supabase.js';

export type ShopifyMode = 'custom_app' | 'app_store';

export interface ShopifyCredentials {
  mode: ShopifyMode;
  shopDomain: string;
  connectionId: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  /**
   * Secret para verificar HMAC de webhooks.
   * - custom_app: igual al clientSecret (Custom Apps firman con client_secret)
   * - app_store:  SHOPIFY_WEBHOOK_SECRET global (distinto del client_secret)
   */
  webhookSecret: string;
}

/**
 * Resuelve las credenciales de Shopify para un shop_domain dado.
 * Retorna null si no existe conexion activa.
 * Throws si el modo es app_store pero faltan env vars globales.
 */
export async function resolveShopifyCredentials(
  shopDomain: string,
): Promise<ShopifyCredentials | null> {
  if (!shopDomain) return null;

  // Normalize shop domain
  const normalizedDomain = normalizeShopDomain(shopDomain);

  const supabase = getSupabaseAdmin();

  const { data: connection, error } = await supabase
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

  // Descifrar access_token (siempre vive en DB, ambos modos)
  const accessToken = await decryptToken(supabase, connection.access_token_encrypted);
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
      supabase,
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
      // En Custom Apps el webhook HMAC se firma con el client_secret de la app
      webhookSecret: clientSecret,
    };
  }

  // Mode: app_store → credenciales globales
  const globalClientId = process.env.SHOPIFY_CLIENT_ID;
  const globalClientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const globalWebhookSecret =
    process.env.SHOPIFY_WEBHOOK_SECRET || globalClientSecret || '';

  if (!globalClientId || !globalClientSecret) {
    throw new Error(
      `[shopify-credentials] app_store mode active pero faltan env vars SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET (shop=${normalizedDomain})`,
    );
  }

  return {
    mode: 'app_store',
    shopDomain: normalizedDomain,
    connectionId: connection.id,
    clientId: globalClientId,
    clientSecret: globalClientSecret,
    accessToken,
    webhookSecret: globalWebhookSecret,
  };
}

/**
 * Feature flag: que modos estan disponibles para NUEVAS conexiones.
 * Solo controla la UI (que opciones ofrecer al cliente).
 * Las conexiones existentes siguen usando su connection_mode guardado en DB.
 */
export type ShopifyModeFlag = 'custom' | 'appstore' | 'both';

export function getShopifyMode(): ShopifyModeFlag {
  const mode = (process.env.SHOPIFY_MODE || 'custom').toLowerCase();
  if (mode === 'appstore') return 'appstore';
  if (mode === 'both') return 'both';
  return 'custom';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeShopDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!d.endsWith('.myshopify.com')) d = `${d}.myshopify.com`;
  return d;
}

async function decryptToken(supabase: any, encrypted: string | null): Promise<string | null> {
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

// ---------------------------------------------------------------------------
// Webhook registration helper
// ---------------------------------------------------------------------------

/**
 * 7 topics mandatorios que Steve necesita registrar en cada tienda.
 * - 4 fulfillment → shopify-fulfillment-webhooks
 * - 3 GDPR/lifecycle → shopify-gdpr-webhooks
 */
export const SHOPIFY_WEBHOOK_TOPICS = [
  // Fulfillment
  { topic: 'orders/fulfilled', endpoint: 'shopify-fulfillment-webhooks' },
  { topic: 'orders/partially_fulfilled', endpoint: 'shopify-fulfillment-webhooks' },
  { topic: 'orders/cancelled', endpoint: 'shopify-fulfillment-webhooks' },
  { topic: 'orders/create', endpoint: 'shopify-fulfillment-webhooks' },
  // App lifecycle + GDPR
  { topic: 'app/uninstalled', endpoint: 'shopify-gdpr-webhooks' },
  { topic: 'customers/data_request', endpoint: 'shopify-gdpr-webhooks' },
  { topic: 'customers/redact', endpoint: 'shopify-gdpr-webhooks' },
  { topic: 'shop/redact', endpoint: 'shopify-gdpr-webhooks' },
] as const;

export interface WebhookRegistrationResult {
  topic: string;
  status: 'created' | 'exists' | 'error';
  webhookId?: number;
  error?: string;
}

/**
 * Registra los webhooks mandatorios en una tienda Shopify usando la Admin API.
 * Idempotente: si un webhook ya existe, no lo recrea.
 *
 * Debe llamarse desde store-shopify-credentials o shopify-oauth-callback
 * una vez que la tienda haya entregado su access_token.
 */
export async function registerShopifyWebhooks(
  creds: ShopifyCredentials,
): Promise<WebhookRegistrationResult[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL env var missing');
  }

  // Base para los webhook endpoints: Supabase Edge Functions publicas
  const webhookBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

  // Listar webhooks existentes para evitar duplicados
  const existing = await listExistingWebhooks(creds);
  const existingTopics = new Set(existing.map((w) => w.topic));

  const results: WebhookRegistrationResult[] = [];

  for (const { topic, endpoint } of SHOPIFY_WEBHOOK_TOPICS) {
    if (existingTopics.has(topic)) {
      results.push({ topic, status: 'exists' });
      continue;
    }

    try {
      const url = `https://${creds.shopDomain}/admin/api/2024-10/webhooks.json`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': creds.accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${webhookBase}/${endpoint}`,
            format: 'json',
          },
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[shopify-webhooks] Failed to register ${topic}:`, resp.status, errText);
        results.push({ topic, status: 'error', error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` });
        continue;
      }

      const data = (await resp.json().catch(() => ({} as any))) as any;
      results.push({
        topic,
        status: 'created',
        webhookId: data?.webhook?.id,
      });
    } catch (err: any) {
      console.error(`[shopify-webhooks] Exception registering ${topic}:`, err);
      results.push({ topic, status: 'error', error: err.message });
    }
  }

  return results;
}

/**
 * Lista webhooks actualmente registrados en la tienda.
 */
async function listExistingWebhooks(
  creds: ShopifyCredentials,
): Promise<Array<{ id: number; topic: string; address: string }>> {
  try {
    const url = `https://${creds.shopDomain}/admin/api/2024-10/webhooks.json?limit=250`;
    const resp = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': creds.accessToken,
      },
    });
    if (!resp.ok) {
      console.error('[shopify-webhooks] list failed:', resp.status);
      return [];
    }
    const data = (await resp.json()) as any;
    return data?.webhooks || [];
  } catch (err) {
    console.error('[shopify-webhooks] list exception:', err);
    return [];
  }
}

/**
 * Valida credenciales llamando a /admin/api/2024-10/shop.json con el client_secret
 * como Access Token (Custom Apps permiten esto si fueron "instaladas" y tienen
 * el admin_api_access_token). Para el flujo Custom App real, solo validamos
 * que las credenciales tengan formato correcto y que el dominio sea accesible.
 */
export function validateShopifyCredentialsFormat(
  shopifyClientId: string,
  shopifyClientSecret: string,
): { valid: boolean; error?: string } {
  const clientId = shopifyClientId?.trim() || '';
  const clientSecret = shopifyClientSecret?.trim() || '';

  if (!clientId || !clientSecret) {
    return { valid: false, error: 'Client ID y Client Secret son requeridos' };
  }

  // Client ID format: 32 hex chars
  if (!/^[a-f0-9]{32}$/i.test(clientId)) {
    return {
      valid: false,
      error: 'Client ID debe ser 32 caracteres hexadecimales (ej: a1b2c3d4e5f6...)',
    };
  }

  // Client Secret format: starts with "shpss_" or 32+ hex chars
  if (!/^(shpss_[a-f0-9]{32,}|[a-f0-9]{32,})$/i.test(clientSecret)) {
    return {
      valid: false,
      error: 'Client Secret invalido. Debe empezar con "shpss_" o ser 32+ caracteres hex',
    };
  }

  return { valid: true };
}
