-- Add portfolio/business asset fields to platform_connections
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS business_id text,
  ADD COLUMN IF NOT EXISTS portfolio_name text,
  ADD COLUMN IF NOT EXISTS page_id text,
  ADD COLUMN IF NOT EXISTS ig_account_id text,
  ADD COLUMN IF NOT EXISTS pixel_id text;

-- Comment on new columns
COMMENT ON COLUMN platform_connections.business_id IS 'Meta Business Manager ID';
COMMENT ON COLUMN platform_connections.portfolio_name IS 'Display name of the selected portfolio/negocio';
COMMENT ON COLUMN platform_connections.page_id IS 'Facebook Page ID for Social Inbox';
COMMENT ON COLUMN platform_connections.ig_account_id IS 'Instagram Business Account ID';
COMMENT ON COLUMN platform_connections.pixel_id IS 'Meta Pixel ID';
