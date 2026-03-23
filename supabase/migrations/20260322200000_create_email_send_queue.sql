-- Create email_send_queue table (was missing from 20260315 migration)
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
  priority SMALLINT DEFAULT 5,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  scheduled_for TIMESTAMPTZ DEFAULT now(),
  attempts SMALLINT DEFAULT 0,
  max_attempts SMALLINT DEFAULT 3,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_send_queue_pending ON email_send_queue(client_id, status, scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign ON email_send_queue(campaign_id, status);

-- RLS
ALTER TABLE email_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "send_queue_client_access" ON email_send_queue
  FOR ALL USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

-- Send settings (also from 20260315)
CREATE TABLE IF NOT EXISTS email_send_settings (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  rate_limit_per_hour INT DEFAULT 500,
  smart_send_enabled BOOLEAN DEFAULT true,
  auto_cleanup_enabled BOOLEAN DEFAULT true,
  sunset_days INT DEFAULT 90,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE email_send_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "send_settings_client_access" ON email_send_settings
  FOR ALL USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );
