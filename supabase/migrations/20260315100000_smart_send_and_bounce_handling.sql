-- Smart Send Time + Bounce Handling + Auto-cleanup
-- Adds send_time_preference, bounce tracking, and sunset automation

-- 1. Add send_time_preference to subscribers (optimal hour 0-23 in their timezone)
ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS send_time_hour SMALLINT,
  ADD COLUMN IF NOT EXISTS send_time_confidence REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_count SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMPTZ;

COMMENT ON COLUMN email_subscribers.send_time_hour IS 'Optimal send hour (0-23 UTC) based on open history';
COMMENT ON COLUMN email_subscribers.send_time_confidence IS 'Confidence score 0-1 for send_time_hour prediction';
COMMENT ON COLUMN email_subscribers.bounce_count IS 'Soft bounce counter, hard bounce sets status=bounced immediately';
COMMENT ON COLUMN email_subscribers.last_engaged_at IS 'Last open or click timestamp, used for sunset detection';

-- 2. Email send queue for throttled sending
CREATE TABLE IF NOT EXISTS email_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT 'Steve',
  reply_to TEXT,
  ab_variant TEXT CHECK (ab_variant IN ('a', 'b')),
  priority SMALLINT DEFAULT 5, -- 1=highest, 10=lowest
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ DEFAULT now(),
  attempts SMALLINT DEFAULT 0,
  max_attempts SMALLINT DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_send_queue_pending ON email_send_queue(client_id, status, scheduled_for)
  WHERE status = 'queued';
CREATE INDEX idx_send_queue_campaign ON email_send_queue(campaign_id, status);

-- 3. Throttle settings per client
CREATE TABLE IF NOT EXISTS email_send_settings (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  rate_limit_per_hour INT DEFAULT 500,
  smart_send_enabled BOOLEAN DEFAULT true,
  auto_cleanup_enabled BOOLEAN DEFAULT true,
  sunset_days INT DEFAULT 90,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Index for sunset detection (subscribers with no engagement in N days)
CREATE INDEX IF NOT EXISTS idx_subscribers_last_engaged
  ON email_subscribers(client_id, last_engaged_at)
  WHERE status = 'subscribed';

-- 5. Backfill last_engaged_at from existing events
UPDATE email_subscribers s
SET last_engaged_at = sub.last_engaged
FROM (
  SELECT subscriber_id, MAX(created_at) AS last_engaged
  FROM email_events
  WHERE event_type IN ('opened', 'clicked')
  GROUP BY subscriber_id
) sub
WHERE s.id = sub.subscriber_id
  AND s.last_engaged_at IS NULL;
