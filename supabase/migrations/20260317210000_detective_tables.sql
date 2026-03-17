-- Detective Visual + Onboarding tables (MISION_SKYVERN Module 2)

-- Log unificado de todos los módulos del detective
CREATE TABLE IF NOT EXISTS detective_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'visual' | 'api' | 'qa' | 'onboarding'
  module TEXT NOT NULL,              -- 'meta-campaigns' | 'shopify-products' | etc
  client_id UUID,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,              -- 'PASS' | 'MISMATCH' | 'MISSING' | 'ERROR'
  severity TEXT NOT NULL,            -- 'CRITICAL' | 'MAJOR' | 'MINOR'
  steve_value JSONB,
  real_value JSONB,
  mismatched_fields TEXT[],
  details TEXT,
  screenshot_url TEXT,
  steve_record_id TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Runs (resumen por ejecución)
CREATE TABLE IF NOT EXISTS detective_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  total_checks INTEGER,
  passed INTEGER,
  mismatches INTEGER,
  critical INTEGER,
  score INTEGER,
  by_module JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding jobs (estado de conexión de plataformas)
CREATE TABLE IF NOT EXISTS onboarding_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  status TEXT NOT NULL,              -- 'running' | 'completed' | 'failed'
  shopify_status TEXT DEFAULT 'pending',
  meta_status TEXT DEFAULT 'pending',
  klaviyo_status TEXT DEFAULT 'pending',
  shopify_step TEXT,
  meta_step TEXT,
  klaviyo_step TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_detective_log_run_id ON detective_log(run_id);
CREATE INDEX IF NOT EXISTS idx_detective_log_source ON detective_log(source);
CREATE INDEX IF NOT EXISTS idx_detective_log_status ON detective_log(status);
CREATE INDEX IF NOT EXISTS idx_detective_log_module ON detective_log(module);
CREATE INDEX IF NOT EXISTS idx_detective_log_created ON detective_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_detective_runs_created ON detective_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_jobs_client ON onboarding_jobs(client_id);

-- RLS
ALTER TABLE detective_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE detective_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_jobs ENABLE ROW LEVEL SECURITY;

-- Service role full access (internal cron)
CREATE POLICY "service_role_detective_log" ON detective_log
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_detective_runs" ON detective_runs
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_onboarding_jobs" ON onboarding_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- Super admin read access
CREATE POLICY "admin_read_detective_log" ON detective_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
CREATE POLICY "admin_read_detective_runs" ON detective_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
CREATE POLICY "admin_read_onboarding_jobs" ON onboarding_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );
