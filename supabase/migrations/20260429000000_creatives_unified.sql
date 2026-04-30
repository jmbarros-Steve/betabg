-- Creativos Unificados (Michael W25 + Felipe W2 + Camila W4 + Diego W8)
-- Sprint 2026-04-29: tab "Creativos" + upload chat estrategia + import Meta + memoria draft

-- 1) client_assets: source tracking + Meta linking + back-reference al uso
ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS source TEXT;
COMMENT ON COLUMN client_assets.source IS 'Origen: strategy_chat_upload | wizard_upload | brief_upload | meta_imported | shopify_synced | steve_generated';

ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS meta_id TEXT;
COMMENT ON COLUMN client_assets.meta_id IS 'ID en Meta Graph (image hash, video_id o creative_id) para creativos importados';

ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS meta_hash TEXT;
COMMENT ON COLUMN client_assets.meta_hash IS 'Hash Meta para imágenes — usado para idempotencia en import';

ALTER TABLE client_assets ADD COLUMN IF NOT EXISTS used_in_creative_id UUID
  REFERENCES creative_history(id) ON DELETE SET NULL;
COMMENT ON COLUMN client_assets.used_in_creative_id IS 'Back-reference a creative_history.id cuando este asset fue usado en un draft/creativo Meta';

-- CHECK constraint en source (Javiera W12 review): caza typos sin perder rollback flexibility
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_assets_source_check') THEN
    ALTER TABLE client_assets ADD CONSTRAINT client_assets_source_check
      CHECK (source IS NULL OR source IN (
        'strategy_chat_upload', 'wizard_upload', 'brief_upload',
        'meta_imported', 'shopify_synced', 'steve_generated', 'manual'
      ));
  END IF;
END $$;

-- Idempotencia para imports Meta — evita duplicados al reimportar
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_assets_meta_hash_uniq
  ON client_assets(client_id, meta_hash)
  WHERE meta_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_assets_meta_id_uniq
  ON client_assets(client_id, meta_id)
  WHERE meta_id IS NOT NULL;

-- Lookup rápido por source en la galería
CREATE INDEX IF NOT EXISTS idx_client_assets_source
  ON client_assets(client_id, source, created_at DESC)
  WHERE active = true;

-- 2) creative_history: source para distinguir IA / Meta / wizard
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS source TEXT;
COMMENT ON COLUMN creative_history.source IS 'Origen: steve_generated | wizard_dct | meta_imported | manual';

ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS asset_id UUID
  REFERENCES client_assets(id) ON DELETE SET NULL;
COMMENT ON COLUMN creative_history.asset_id IS 'Back-reference a client_assets.id (si el creativo fue armado con un asset existente)';

-- CHECK constraint en source de creative_history (Javiera W12 review)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_history_source_check') THEN
    ALTER TABLE creative_history ADD CONSTRAINT creative_history_source_check
      CHECK (source IS NULL OR source IN (
        'steve_generated', 'wizard_dct', 'meta_imported', 'manual', 'strategy_chat'
      ));
  END IF;
END $$;

ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_creative_id TEXT;
COMMENT ON COLUMN creative_history.meta_creative_id IS 'ID del creative en Meta Ads (cuando llega a producción)';

CREATE INDEX IF NOT EXISTS idx_creative_history_source
  ON creative_history(client_id, source, created_at DESC);
