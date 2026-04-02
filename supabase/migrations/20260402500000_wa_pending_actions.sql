-- ============================================================
-- wa_pending_actions: Task queue for async WhatsApp actions
-- Replaces fire-and-forget setTimeout calls that die when
-- Cloud Run closes the HTTP request.
-- ============================================================

CREATE TABLE IF NOT EXISTS wa_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the cron processor: pick pending actions whose time has come
CREATE INDEX idx_wa_pending_actions_pickup
  ON wa_pending_actions (status, scheduled_at)
  WHERE status = 'pending';

-- Index for checking recent actions by phone (dedup)
CREATE INDEX idx_wa_pending_actions_phone
  ON wa_pending_actions (phone, action_type, created_at DESC);

-- RLS: Only service_role can access this table (cron + backend)
ALTER TABLE wa_pending_actions ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role (bypasses RLS)
COMMENT ON TABLE wa_pending_actions IS 'Async task queue for WhatsApp actions (replaces setTimeout fire-and-forget)';
