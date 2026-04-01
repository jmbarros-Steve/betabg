-- =============================================
-- Knowledge Advanced Features
-- 1. client_id on steve_knowledge (per-client rules)
-- 2. quality_score on steve_knowledge
-- 3. steve_commitments table
-- 4. steve_ab_tests table
-- =============================================

-- 1. Per-client knowledge
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_steve_knowledge_client_id ON steve_knowledge(client_id);

-- 2. Commitments tracking
CREATE TABLE IF NOT EXISTS steve_commitments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  commitment TEXT NOT NULL,
  context TEXT,
  campaign_id TEXT,
  agreed_date TIMESTAMPTZ DEFAULT now(),
  follow_up_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','expired','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE steve_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on steve_commitments" ON steve_commitments FOR ALL USING (true);
CREATE INDEX IF NOT EXISTS idx_steve_commitments_client ON steve_commitments(client_id, status);

-- 3. A/B Test tracking
CREATE TABLE IF NOT EXISTS steve_ab_tests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  variants JSONB NOT NULL,
  campaign_ids TEXT[],
  status TEXT DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  winner_index INTEGER,
  results JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE steve_ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on steve_ab_tests" ON steve_ab_tests FOR ALL USING (true);
