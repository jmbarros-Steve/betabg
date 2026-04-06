-- Add connection_type to platform_connections
-- Values: 'oauth' (default), 'bm_partner', 'flbi'
-- Default 'oauth' means zero data migration — all existing rows are oauth.

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS connection_type text NOT NULL DEFAULT 'oauth';

-- Index for filtering bm_partner connections in sync cron
CREATE INDEX IF NOT EXISTS idx_platform_connections_connection_type
  ON platform_connections (connection_type)
  WHERE connection_type = 'bm_partner';
