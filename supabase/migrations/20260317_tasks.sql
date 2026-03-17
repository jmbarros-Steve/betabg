CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,          -- 'changelog-watcher', 'manual', etc.
  platform TEXT,                 -- 'meta', 'klaviyo', 'shopify'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT DEFAULT 'open',    -- 'open', 'in_progress', 'done', 'dismissed'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access_tasks" ON tasks
  FOR ALL USING (auth.role() = 'service_role');
