-- =============================================================
-- Steve Brain Swarm — Tables for parallel research + approval
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. swarm_runs — registro de cada ejecución del swarm
CREATE TABLE IF NOT EXISTS swarm_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','error')),
  questions JSONB,
  reports JSONB,
  synthesis TEXT,
  insights_generated INTEGER DEFAULT 0,
  total_sources INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: service_role only
ALTER TABLE swarm_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on swarm_runs"
  ON swarm_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. auto_learning_digests — tracking de WA enviados
CREATE TABLE IF NOT EXISTS auto_learning_digests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  pending_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: service_role only
ALTER TABLE auto_learning_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on auto_learning_digests"
  ON auto_learning_digests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Extend steve_knowledge with swarm columns
ALTER TABLE steve_knowledge
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS swarm_run_id UUID REFERENCES swarm_runs(id),
  ADD COLUMN IF NOT EXISTS source_explanation TEXT,
  ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS sources_urls TEXT[],
  ADD COLUMN IF NOT EXISTS industria TEXT DEFAULT 'general';

-- Index for pending approval queries
CREATE INDEX IF NOT EXISTS idx_steve_knowledge_approval
  ON steve_knowledge(approval_status) WHERE approval_status = 'pending';

-- Index for swarm run lookups
CREATE INDEX IF NOT EXISTS idx_steve_knowledge_swarm_run
  ON steve_knowledge(swarm_run_id) WHERE swarm_run_id IS NOT NULL;
