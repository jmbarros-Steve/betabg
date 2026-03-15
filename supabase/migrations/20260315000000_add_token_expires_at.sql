-- Add token_expires_at to platform_connections for proactive token renewal
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Add index for finding tokens near expiry
CREATE INDEX IF NOT EXISTS idx_platform_connections_token_expires
  ON platform_connections (token_expires_at)
  WHERE platform = 'meta' AND is_active = true AND token_expires_at IS NOT NULL;
