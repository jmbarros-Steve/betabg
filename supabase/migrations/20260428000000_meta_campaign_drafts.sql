-- meta_campaign_drafts — campañas armadas en Steve Ads ANTES de subirse a Meta.
-- Steve estrategia (chat) crea drafts vía manage-meta-draft.
-- El cliente revisa en /campaigns/draft/:id, edita inline o pide cambios a Steve,
-- y aprueba para subir a Meta como status=PAUSED (borrador funcional en Meta).

CREATE TABLE IF NOT EXISTS meta_campaign_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES platform_connections(id) ON DELETE SET NULL,
  -- Quien creó el draft: 'steve' (vía chat estratégico) o 'wizard' (UI Campaign Studio)
  created_by TEXT NOT NULL DEFAULT 'steve',
  -- Conversación de Steve estrategia que originó el draft (para trazabilidad)
  source_conversation_id UUID REFERENCES steve_conversations(id) ON DELETE SET NULL,
  -- Nombre humano de la campaña
  name TEXT NOT NULL,
  -- Spec completa: objetivo, presupuesto, audiencia, schedule, creativos, etc.
  spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Estado del draft
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rejected', 'archived')),
  -- Cuando se publica, se llena con el ID de Meta de la campaña creada
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  -- Notas opcionales del cliente o de Steve
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meta_drafts_client_status
  ON meta_campaign_drafts (client_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meta_drafts_conversation
  ON meta_campaign_drafts (source_conversation_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_meta_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_meta_drafts_updated_at ON meta_campaign_drafts;
CREATE TRIGGER trg_meta_drafts_updated_at
  BEFORE UPDATE ON meta_campaign_drafts
  FOR EACH ROW EXECUTE FUNCTION set_meta_drafts_updated_at();

-- RLS
ALTER TABLE meta_campaign_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY meta_drafts_owner_select
    ON meta_campaign_drafts FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = meta_campaign_drafts.client_id
          AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY meta_drafts_owner_update
    ON meta_campaign_drafts FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = meta_campaign_drafts.client_id
          AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE meta_campaign_drafts IS 'Campañas Meta armadas en Steve Ads antes de subirse a Meta. Steve crea drafts vía chat, cliente revisa/edita en frontend, aprueba para publicar a Meta como status=PAUSED.';
