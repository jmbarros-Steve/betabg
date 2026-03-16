CREATE TABLE IF NOT EXISTS creative_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  channel TEXT NOT NULL,
  type TEXT NOT NULL,
  angle TEXT,
  theme TEXT,
  content_summary TEXT,
  cqs_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creative_history_client ON creative_history(client_id, channel, created_at DESC);
