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
