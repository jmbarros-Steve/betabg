-- Fase 5 A.3: Extend client_assets with required columns
-- Existing columns: id, client_id, url, nombre, tipo, created_at, updated_at

ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS shop_id TEXT;
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS asset_type TEXT;
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS asset_url TEXT;
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS asset_value TEXT;
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS asset_metadata JSONB DEFAULT '{}';
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_client_assets_shop ON client_assets(shop_id, asset_type) WHERE active = true;

ALTER TABLE client_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access client_assets" ON client_assets;
CREATE POLICY "Service role full access client_assets" ON client_assets
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Public read client_assets" ON client_assets;
CREATE POLICY "Public read client_assets" ON client_assets
  FOR SELECT USING (true);
