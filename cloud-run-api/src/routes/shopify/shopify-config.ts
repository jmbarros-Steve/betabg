import { Context } from 'hono';
import { getShopifyMode } from '../../lib/shopify-credentials.js';

/**
 * GET /api/shopify/config
 *
 * Endpoint publico (no auth) que devuelve la configuracion actual de Shopify
 * para el frontend:
 *   - mode: 'custom' | 'appstore' | 'both' (controlado por env var SHOPIFY_MODE)
 *   - appStoreAvailable: si el modo App Store esta habilitado
 *   - customAppAvailable: si el modo Custom App esta habilitado
 *   - installUrl: URL del app store (solo si appstore/both)
 *
 * Se usa para mostrar la UI condicional: "Instalar con 1 clic" vs
 * "Configurar Custom App".
 */
export async function shopifyConfig(c: Context) {
  const mode = getShopifyMode();
  const appStoreAvailable = mode === 'appstore' || mode === 'both';
  const customAppAvailable = mode === 'custom' || mode === 'both';

  // URL del App Store (solo valida si appStoreAvailable)
  const appStoreUrl = process.env.SHOPIFY_APP_STORE_URL || null;

  return c.json({
    mode,
    appStoreAvailable,
    customAppAvailable,
    appStoreUrl: appStoreAvailable ? appStoreUrl : null,
  });
}
