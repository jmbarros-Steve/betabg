-- ============================================================
-- Deal Value + Forecast + Rotting Indicator + Web Forms
-- ============================================================

-- 1. Deal value + forecast columns on wa_prospects
ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_probability INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_close_date DATE DEFAULT NULL;

-- 2. Rotting indicator columns on wa_prospects
ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_rotting BOOLEAN DEFAULT false;

-- Partial index for rotting queries (only active prospects)
CREATE INDEX IF NOT EXISTS idx_wa_prospects_rotting
  ON wa_prospects (is_rotting, stage, last_activity_at)
  WHERE stage NOT IN ('converted', 'lost');

-- 3. Web forms table
CREATE TABLE IF NOT EXISTS public.web_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  form_name TEXT NOT NULL DEFAULT 'Formulario principal',
  fields JSONB DEFAULT '[{"name":"nombre","label":"Nombre","type":"text","required":true},{"name":"email","label":"Email","type":"email","required":true},{"name":"telefono","label":"Teléfono","type":"tel","required":false},{"name":"empresa","label":"Empresa","type":"text","required":false}]',
  redirect_url TEXT,
  notify_whatsapp BOOLEAN DEFAULT true,
  auto_create_prospect BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Web form submissions table
CREATE TABLE IF NOT EXISTS public.web_form_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id UUID NOT NULL REFERENCES web_forms(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  prospect_id UUID REFERENCES wa_prospects(id),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_form_submissions_form
  ON web_form_submissions(form_id, created_at DESC);

-- 5. RLS policies
ALTER TABLE web_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage web forms" ON web_forms FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()));

CREATE POLICY "Admins view submissions" ON web_form_submissions FOR ALL
  USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()));

CREATE POLICY "Public can insert submissions" ON web_form_submissions FOR INSERT
  WITH CHECK (true);
