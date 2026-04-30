-- meta_campaign_drafts — soporte para jerarquía A/B/C.
--
-- Felipe W2 — alineación con Michael W25 (estrategia).
--
-- Cuando Steve estrategia crea un draft puede pedir 3 niveles:
--   A) Solo nuevo AD dentro de un adset existente.
--      Requiere: parent_campaign_id + parent_adset_id.
--   B) Nuevo ADSET (+ ad dentro) dentro de una campaña existente.
--      Requiere: parent_campaign_id.
--   C) Nueva CAMPAÑA completa (campaign + adset + ad) — comportamiento default histórico.
--
-- El draft sigue siendo PAUSED hasta que el cliente apruebe en /portal/campaigns/draft/:id.
-- En el publish flow, manage-meta-draft mapea parent_campaign_id → data.campaign_id y
-- parent_adset_id → data.adset_id, y manage-meta-campaign:handleCreate ya tiene la
-- lógica para reusar campaign/adset existentes (ver líneas 463–739).

ALTER TABLE meta_campaign_drafts
  ADD COLUMN IF NOT EXISTS jerarquia TEXT DEFAULT 'C'
    CHECK (jerarquia IN ('A', 'B', 'C')),
  ADD COLUMN IF NOT EXISTS parent_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_adset_id TEXT;

-- Coherencia: si jerarquia='A' debe haber adset; si 'B' debe haber campaign.
-- Usamos un CHECK constraint en la fila completa.
DO $$ BEGIN
  ALTER TABLE meta_campaign_drafts
    ADD CONSTRAINT meta_drafts_hierarchy_consistency
    CHECK (
      (jerarquia = 'A' AND parent_campaign_id IS NOT NULL AND parent_adset_id IS NOT NULL)
      OR
      (jerarquia = 'B' AND parent_campaign_id IS NOT NULL)
      OR
      (jerarquia = 'C')
      OR
      (jerarquia IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_meta_drafts_parent_campaign
  ON meta_campaign_drafts (parent_campaign_id)
  WHERE parent_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meta_drafts_parent_adset
  ON meta_campaign_drafts (parent_adset_id)
  WHERE parent_adset_id IS NOT NULL;

COMMENT ON COLUMN meta_campaign_drafts.jerarquia IS
  'Nivel jerárquico del draft. A=nuevo ad en adset existente; B=nuevo adset en campaña existente; C=campaña nueva completa (default).';
COMMENT ON COLUMN meta_campaign_drafts.parent_campaign_id IS
  'Meta campaign_id existente (jerarquia A o B). El publish reusa esta campaña en lugar de crear una nueva.';
COMMENT ON COLUMN meta_campaign_drafts.parent_adset_id IS
  'Meta adset_id existente (jerarquia A). El publish reusa este adset en lugar de crear uno nuevo.';
