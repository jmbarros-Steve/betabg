-- Per-client Shopify OAuth credentials
-- Allows each client to use their own Shopify dev app (Client ID + Client Secret)
-- instead of relying on centralized environment variables.

-- Store per-client Shopify app credentials in platform_connections
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS shopify_client_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_client_secret_encrypted TEXT;

-- Track which client initiated the OAuth flow so the callback can retrieve their credentials
ALTER TABLE oauth_states
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
