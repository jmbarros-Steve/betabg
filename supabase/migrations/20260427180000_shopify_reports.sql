-- Shopify reports infrastructure: storage of generated PDF reports + auto-schedule config.
-- Sprint 1 of "Informe Shopify" feature (multi-sprint).
-- Tablas:
--   shopify_reports           — historial de informes generados (1 fila por reporte)
--   shopify_report_schedules  — config de auto-generación por cliente (1 fila por cliente)
-- Storage:
--   bucket "reports" privado, paths bajo "{client_id}/{report_id}.pdf"

-- ============================================================
-- 1. shopify_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shopify_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pdf_url TEXT,
  pdf_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  file_size_bytes BIGINT,
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL DEFAULT 'on_demand',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shopify_reports_status_chk CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
  CONSTRAINT shopify_reports_trigger_chk CHECK (trigger_type IN ('on_demand', 'scheduled')),
  CONSTRAINT shopify_reports_period_valid CHECK (period_end >= period_start),
  CONSTRAINT shopify_reports_period_min_7d CHECK (period_end - period_start >= 6)
);

CREATE INDEX IF NOT EXISTS idx_shopify_reports_client_created
  ON public.shopify_reports(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_reports_status_pending
  ON public.shopify_reports(status, created_at)
  WHERE status IN ('pending', 'generating');

ALTER TABLE public.shopify_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopify_reports' AND policyname = 'shopify_reports_select'
  ) THEN
    CREATE POLICY shopify_reports_select ON public.shopify_reports
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
    WHERE schemaname = 'public' AND tablename = 'shopify_reports' AND policyname = 'shopify_reports_insert'
  ) THEN
    CREATE POLICY shopify_reports_insert ON public.shopify_reports
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
    WHERE schemaname = 'public' AND tablename = 'shopify_reports' AND policyname = 'shopify_reports_update'
  ) THEN
    CREATE POLICY shopify_reports_update ON public.shopify_reports
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

COMMENT ON TABLE public.shopify_reports IS
  'Historial de informes Shopify PDF generados. status: pending|generating|ready|failed. trigger_type: on_demand|scheduled.';
COMMENT ON COLUMN public.shopify_reports.pdf_path IS
  'Path relativo en Storage (ej. "{client_id}/{report_id}.pdf"). Permite regenerar URL pre-signed sin guardarla cifrada.';
COMMENT ON COLUMN public.shopify_reports.metadata IS
  'JSON libre: kpis_summary, sections_included, ai_findings, generation_duration_ms, etc.';

-- ============================================================
-- 2. shopify_report_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shopify_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  recipient_emails TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  last_report_id UUID REFERENCES public.shopify_reports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shopify_report_schedules_freq_chk CHECK (frequency IN ('weekly', 'monthly')),
  CONSTRAINT shopify_report_schedules_dow_chk CHECK (day_of_week IS NULL OR day_of_week BETWEEN 0 AND 6),
  CONSTRAINT shopify_report_schedules_dom_chk CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28),
  CONSTRAINT shopify_report_schedules_day_consistency CHECK (
    (frequency = 'weekly' AND day_of_week IS NOT NULL AND day_of_month IS NULL) OR
    (frequency = 'monthly' AND day_of_month IS NOT NULL AND day_of_week IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_shopify_report_schedules_active
  ON public.shopify_report_schedules(active, frequency)
  WHERE active = TRUE;

ALTER TABLE public.shopify_report_schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopify_report_schedules' AND policyname = 'shopify_report_schedules_all'
  ) THEN
    CREATE POLICY shopify_report_schedules_all ON public.shopify_report_schedules
      FOR ALL
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      )
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
END $$;

COMMENT ON TABLE public.shopify_report_schedules IS
  'Config de auto-generación de informe Shopify por cliente. Gateado por plan "estrategia" en la UI. Ejecutado por cron diario.';

-- ============================================================
-- 3. Storage bucket "reports"
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reports', 'reports', FALSE, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = 52428800,
      allowed_mime_types = ARRAY['application/pdf'];

-- RLS para storage.objects bajo el bucket reports.
-- Path convention: "{client_id}/{report_id}.pdf"
-- splittear path con storage.foldername() → primer elemento es client_id

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'reports_select_own'
  ) THEN
    CREATE POLICY reports_select_own ON storage.objects
      FOR SELECT
      USING (
        bucket_id = 'reports'
        AND (
          (storage.foldername(name))[1] IN (
            SELECT id::text FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND is_super_admin = TRUE
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'reports_insert_own'
  ) THEN
    CREATE POLICY reports_insert_own ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'reports'
        AND (
          (storage.foldername(name))[1] IN (
            SELECT id::text FROM public.clients
            WHERE user_id = auth.uid() OR client_user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND is_super_admin = TRUE
          )
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. Trigger updated_at en shopify_report_schedules
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'shopify_report_schedules_updated_at'
  ) THEN
    CREATE TRIGGER shopify_report_schedules_updated_at
      BEFORE UPDATE ON public.shopify_report_schedules
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
