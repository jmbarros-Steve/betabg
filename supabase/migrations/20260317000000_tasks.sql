-- ============================================================
-- CEREBRO FASE 4: Tasks table for agent orchestration
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',          -- 'critical' | 'high' | 'medium' | 'low'
  type TEXT NOT NULL,                               -- 'optimization' | 'creative' | 'analysis' | 'fix' | 'report'
  source TEXT NOT NULL DEFAULT 'cerebro',           -- 'cerebro' | 'criterio' | 'ojos' | 'user' | 'cron'
  assigned_squad TEXT,                              -- 'meta' | 'google' | 'email' | 'creative' | 'analytics'
  assigned_agent TEXT,                              -- 'agent-0' .. 'agent-8'
  status TEXT NOT NULL DEFAULT 'pending',           -- 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  spec JSONB DEFAULT '{}',                          -- task-specific parameters / payload
  attempts INTEGER DEFAULT 0,
  result JSONB,                                     -- outcome data after execution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_shop_status ON tasks(shop_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_squad, assigned_agent, status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority, status) WHERE status IN ('pending', 'in_progress');

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access tasks" ON tasks;
CREATE POLICY "Service role full access tasks" ON tasks
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Shop read own tasks" ON tasks;
CREATE POLICY "Shop read own tasks" ON tasks
  FOR SELECT USING (true);
