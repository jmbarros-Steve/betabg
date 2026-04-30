-- email_block_library — Biblioteca global de 100 bloques MJML curados
-- Autora: Valentina W1 — 2026-04-30
-- Uso: bloques drag & drop en Steve Mail editor + plantillas generadas por IA

CREATE TABLE IF NOT EXISTS public.email_block_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  num             text UNIQUE NOT NULL, -- '001'..'100' para orden estable
  category        text NOT NULL,        -- header|hero|product|grid|cta|...
  name            text NOT NULL,
  mjml_content    text NOT NULL,        -- fragmento MJML con {{ variables }}
  variables       jsonb DEFAULT '[]'::jsonb, -- ['brand_color','logo_url',...]
  preview_html    text,                 -- HTML compilado con valores demo (para galería)
  thumbnail_url   text,                 -- screenshot del preview (opcional, futuro)
  tags            text[] DEFAULT '{}',  -- ['minimal','bold','dark','editorial']
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_block_library_category ON public.email_block_library(category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_email_block_library_sort ON public.email_block_library(sort_order, num);

ALTER TABLE public.email_block_library ENABLE ROW LEVEL SECURITY;

-- Lectura: todo usuario autenticado (es contenido global, no por cliente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_block_library' AND policyname = 'block_library_read_authenticated') THEN
    CREATE POLICY block_library_read_authenticated ON public.email_block_library
      FOR SELECT TO authenticated USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_block_library' AND policyname = 'block_library_admin_all') THEN
    CREATE POLICY block_library_admin_all ON public.email_block_library
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND is_super_admin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND is_super_admin = true));
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.email_block_library_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_email_block_library_updated_at ON public.email_block_library;
CREATE TRIGGER trg_email_block_library_updated_at
  BEFORE UPDATE ON public.email_block_library
  FOR EACH ROW EXECUTE FUNCTION public.email_block_library_set_updated_at();

COMMENT ON TABLE public.email_block_library IS 'Biblioteca global de bloques MJML curados (100 inicial). Reusables en Steve Mail editor drag&drop y como semilla para templates IA.';
