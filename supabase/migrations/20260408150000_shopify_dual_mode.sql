-- ============================================================================
-- Shopify Dual Mode: Custom App + App Store
-- ============================================================================
-- Agrega connection_mode a platform_connections para que el backend pueda
-- resolver credenciales desde la DB (Custom App) o desde env vars globales
-- (App Store) segun como cada tienda se haya conectado.
--
-- MODOS:
--   custom_app → credenciales per-connection (shopify_client_id +
--                shopify_client_secret_encrypted). Es el modo actual.
--   app_store  → credenciales globales (SHOPIFY_CLIENT_ID,
--                SHOPIFY_CLIENT_SECRET, SHOPIFY_WEBHOOK_SECRET env vars).
--                Se activa cuando Shopify apruebe la public app.
--
-- Default: custom_app (todas las conexiones existentes quedan marcadas asi,
-- porque hoy solo existen Custom Apps).
-- ============================================================================

ALTER TABLE platform_connections
ADD COLUMN IF NOT EXISTS connection_mode text
  NOT NULL DEFAULT 'custom_app'
  CHECK (connection_mode IN ('custom_app', 'app_store'));

-- Index para lookups rapidos por plataforma + modo
CREATE INDEX IF NOT EXISTS idx_platform_connections_shopify_mode
  ON platform_connections(platform, connection_mode)
  WHERE platform = 'shopify';

-- Comentario para documentacion en el schema
COMMENT ON COLUMN platform_connections.connection_mode IS
  'Shopify connection mode: custom_app (per-connection credentials) or app_store (global env var credentials). Used by Credential Resolver pattern.';
