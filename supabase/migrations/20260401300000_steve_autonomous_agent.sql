-- Steve Autonomous Agent tables
CREATE TABLE IF NOT EXISTS steve_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('youtube_channel','rss','blog','website')),
  url TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  check_interval_min INTEGER DEFAULT 60,
  last_checked_at TIMESTAMPTZ,
  last_content_id TEXT,
  total_rules_extracted INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE steve_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_steve_sources" ON steve_sources FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS steve_episodic_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE steve_episodic_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_steve_episodic" ON steve_episodic_memory FOR ALL USING (true);
CREATE INDEX idx_episodic_client ON steve_episodic_memory(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS steve_working_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, key)
);
ALTER TABLE steve_working_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srv_steve_working" ON steve_working_memory FOR ALL USING (true);

ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE steve_knowledge ADD COLUMN IF NOT EXISTS source_url TEXT;
CREATE INDEX IF NOT EXISTS idx_knowledge_approval ON steve_knowledge(approval_status);
