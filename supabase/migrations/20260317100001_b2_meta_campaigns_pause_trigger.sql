-- ============================================================
-- FASE 6 B.2: meta_campaigns table + trigger que fuerza PAUSED
-- Toda campaña insertada entra como PAUSED sin importar qué
-- status se envíe. Solo se activa vía UPDATE explícito
-- (que pasa por los invariantes de negocio).
-- ============================================================

-- Tabla local para tracking de campañas Meta
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  meta_campaign_id TEXT NOT NULL,           -- ID de campaña en Meta API
  name TEXT NOT NULL,
  objective TEXT,                           -- CONVERSIONS, TRAFFIC, etc.
  status TEXT NOT NULL DEFAULT 'PAUSED',    -- PAUSED | ACTIVE | ARCHIVED
  daily_budget NUMERIC DEFAULT 0,
  lifetime_budget NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  criterio_approved BOOLEAN DEFAULT false,  -- aprobado por CRITERIO
  criterio_score NUMERIC,
  created_by TEXT,                          -- 'agent-2' | 'user' | 'cerebro'
  meta_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(connection_id, meta_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_client ON meta_campaigns(client_id, status);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_connection ON meta_campaigns(connection_id, status);

ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access meta_campaigns" ON meta_campaigns;
CREATE POLICY "Service role full access meta_campaigns" ON meta_campaigns
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view their campaigns" ON meta_campaigns;
CREATE POLICY "Users can view their campaigns" ON meta_campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = meta_campaigns.client_id
      AND (clients.user_id = auth.uid() OR clients.client_user_id = auth.uid())
    )
  );

-- Permitir a agent_role INSERT/UPDATE en meta_campaigns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_role') THEN
    EXECUTE 'GRANT INSERT, UPDATE ON public.meta_campaigns TO agent_role';
  END IF;
END
$$;

-- ── Trigger: forzar PAUSED en INSERT ──
CREATE OR REPLACE FUNCTION fn_force_paused_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'PAUSED' THEN
    RAISE NOTICE '[SAFETY] meta_campaigns INSERT: status "%" forzado a PAUSED (campaign: %)',
      NEW.status, NEW.meta_campaign_id;
    NEW.status := 'PAUSED';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_paused_on_insert ON meta_campaigns;
CREATE TRIGGER trg_force_paused_on_insert
  BEFORE INSERT ON meta_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION fn_force_paused_on_insert();
