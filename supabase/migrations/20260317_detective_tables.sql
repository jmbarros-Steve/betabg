-- Detective & QA Bot tables
-- Used by skyvern-jobs for automated QA, detective visual/API, and onboarding

CREATE TABLE IF NOT EXISTS detective_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  module TEXT NOT NULL,
  client_id UUID REFERENCES clients(id),
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL,
  steve_value JSONB,
  real_value JSONB,
  mismatched_fields TEXT[],
  details TEXT,
  screenshot_url TEXT,
  steve_record_id TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS onboarding_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'pending',
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

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_detective_log_run_id ON detective_log(run_id);
CREATE INDEX IF NOT EXISTS idx_detective_log_source ON detective_log(source);
CREATE INDEX IF NOT EXISTS idx_detective_log_severity ON detective_log(severity) WHERE status != 'PASS';
CREATE INDEX IF NOT EXISTS idx_detective_log_created ON detective_log(created_at);
CREATE INDEX IF NOT EXISTS idx_detective_runs_source ON detective_runs(source);
CREATE INDEX IF NOT EXISTS idx_onboarding_jobs_client ON onboarding_jobs(client_id);
