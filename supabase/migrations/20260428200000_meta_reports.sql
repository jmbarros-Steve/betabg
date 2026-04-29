-- Meta Ads reports infrastructure: PDF tier-1 informe estilo agencia.
-- Tabla `meta_reports` — historial de informes generados (1 fila por reporte, multi-account vía connection_ids[]).
-- Storage:
--   bucket "reports" ya existe (compartido con shopify_reports).
--   Path convention: "{client_id}/meta-{from}-{to}-{timestamp}.pdf"

-- ============================================================
-- 1. meta_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  connection_ids TEXT[] NOT NULL DEFAULT '{}',  -- array de UUIDs como text para flexibilidad multi-account
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  storage_path TEXT,
  signed_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  file_size_bytes BIGINT,
  generated_at TIMESTAMPTZ,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL DEFAULT 'on_demand',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meta_reports_status_chk CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  CONSTRAINT meta_reports_trigger_chk CHECK (trigger_type IN ('on_demand', 'scheduled')),
  CONSTRAINT meta_reports_period_valid CHECK (to_date >= from_date),
  CONSTRAINT meta_reports_period_min_7d CHECK (to_date - from_date >= 6)
);

CREATE INDEX IF NOT EXISTS idx_meta_reports_client_created
  ON public.meta_reports(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_reports_status_pending
  ON public.meta_reports(status, created_at)
  WHERE status IN ('pending', 'generating');

ALTER TABLE public.meta_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meta_reports' AND policyname = 'meta_reports_select'
  ) THEN
    CREATE POLICY meta_reports_select ON public.meta_reports
      FOR SELECT
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meta_reports' AND policyname = 'meta_reports_insert'
  ) THEN
    CREATE POLICY meta_reports_insert ON public.meta_reports
      FOR INSERT
      WITH CHECK (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meta_reports' AND policyname = 'meta_reports_update'
  ) THEN
    CREATE POLICY meta_reports_update ON public.meta_reports
      FOR UPDATE
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.meta_reports IS
  'Historial de informes Meta Ads PDF generados. Multi-account vía connection_ids[]. status: pending|generating|completed|failed.';
COMMENT ON COLUMN public.meta_reports.connection_ids IS
  'Array de platform_connections.id (Meta) que se agregaron en este reporte. Permite reportes multi-cuenta.';
COMMENT ON COLUMN public.meta_reports.storage_path IS
  'Path relativo en Storage bucket "reports". Permite regenerar URL firmada sin guardar la URL cifrada.';
COMMENT ON COLUMN public.meta_reports.metadata IS
  'JSON libre: spend_clp, revenue_clp, roas, campaigns_analyzed, ai_recommendations_count, generation_duration_ms.';

-- ============================================================
-- 2. Storage bucket "reports" — ya existe (creado por shopify_reports migration).
-- Las RLS policies del bucket reports usan path convention "{client_id}/..." — los
-- meta-reports siguen la misma convención por lo que las policies existentes aplican.
-- ============================================================
