-- ============================================================
-- Email Editor Upgrade: Brand Kit, Templates Gallery, Universal Blocks
-- Fully idempotent — safe to re-run
-- ============================================================

-- 1. Brand Kit columns on clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#18181b',
  ADD COLUMN IF NOT EXISTS brand_secondary_color TEXT DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS brand_font TEXT DEFAULT 'Inter';

-- 2. Email Templates Gallery — add missing columns to existing table
DO $$
BEGIN
  -- Add columns that might be missing if table was created with incomplete schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates') THEN
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS description TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS industry TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'campaign'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS thumbnail_url TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS design_json JSONB; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS html_preview TEXT; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT true; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSE
    CREATE TABLE email_templates (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      industry TEXT,
      template_type TEXT NOT NULL DEFAULT 'campaign',
      thumbnail_url TEXT,
      design_json JSONB NOT NULL,
      html_preview TEXT,
      is_system BOOLEAN DEFAULT true,
      client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;
END $$;

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_client ON email_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_system ON email_templates(is_system);

-- RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "System templates visible to all authenticated" ON email_templates
    FOR SELECT USING (is_system = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Client templates visible to owner" ON email_templates
    FOR SELECT USING (client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can manage own templates" ON email_templates
    FOR ALL USING (client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Super admin full access to templates" ON email_templates
    FOR ALL USING (
      auth.uid() IN (SELECT id FROM auth.users WHERE email = 'jmbarros@bgconsult.cl')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Universal Content Blocks
CREATE TABLE IF NOT EXISTS email_universal_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'custom',
  block_json JSONB NOT NULL,
  thumbnail_url TEXT,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_universal_blocks_client ON email_universal_blocks(client_id);

ALTER TABLE email_universal_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Clients can view own universal blocks" ON email_universal_blocks
    FOR SELECT USING (client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can manage own universal blocks" ON email_universal_blocks
    FOR ALL USING (client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Super admin full access to universal blocks" ON email_universal_blocks
    FOR ALL USING (
      auth.uid() IN (SELECT id FROM auth.users WHERE email = 'jmbarros@bgconsult.cl')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Add conditional_blocks column to campaigns and flows (if tables exist)
DO $$ BEGIN
  ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS conditional_blocks JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE email_flows ADD COLUMN IF NOT EXISTS conditional_blocks JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
