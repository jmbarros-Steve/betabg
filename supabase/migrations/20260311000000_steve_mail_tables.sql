-- ============================================================
-- Steve Mail — Email Marketing Tables
-- ============================================================

-- 1. Email Subscribers (contacts)
CREATE TABLE email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  source TEXT DEFAULT 'manual', -- 'shopify_customer', 'shopify_order', 'shopify_abandoned', 'manual', 'form'
  shopify_customer_id TEXT,
  status TEXT DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  total_orders INT DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  last_order_at TIMESTAMPTZ,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, email)
);

CREATE INDEX idx_email_subscribers_client_status ON email_subscribers(client_id, status);
CREATE INDEX idx_email_subscribers_shopify_id ON email_subscribers(client_id, shopify_customer_id) WHERE shopify_customer_id IS NOT NULL;
CREATE INDEX idx_email_subscribers_source ON email_subscribers(client_id, source);
CREATE INDEX idx_email_subscribers_tags ON email_subscribers USING gin(tags);

-- 2. Email Flows (automations) — created BEFORE email_events since it references this
CREATE TABLE email_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('abandoned_cart', 'welcome', 'post_purchase', 'winback', 'browse_abandonment')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  steps JSONB DEFAULT '[]', -- [{subject, html_content, delay_seconds, conditions}]
  settings JSONB DEFAULT '{}', -- {quiet_hours_start, quiet_hours_end, frequency_cap, exit_on_purchase}
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_flows_client_status ON email_flows(client_id, status);
CREATE INDEX idx_email_flows_trigger ON email_flows(client_id, trigger_type, status);

-- 3. Email Campaigns (blasts)
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  preview_text TEXT,
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  html_content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  audience_filter JSONB DEFAULT '{}', -- segment filter conditions
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_campaigns_client_status ON email_campaigns(client_id, status);
CREATE INDEX idx_email_campaigns_scheduled ON email_campaigns(status, scheduled_at) WHERE status = 'scheduled';

-- 4. Email Events (tracking: opens, clicks, bounces, etc.)
CREATE TABLE email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  message_id TEXT, -- SES message ID
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'converted')),
  metadata JSONB DEFAULT '{}', -- {url, user_agent, ip, order_id, revenue}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_events_campaign ON email_events(campaign_id, event_type);
CREATE INDEX idx_email_events_subscriber ON email_events(subscriber_id, event_type);
CREATE INDEX idx_email_events_flow ON email_events(flow_id, event_type) WHERE flow_id IS NOT NULL;
CREATE INDEX idx_email_events_created ON email_events(client_id, created_at);
CREATE INDEX idx_email_events_message ON email_events(message_id) WHERE message_id IS NOT NULL;

-- 5. Email Flow Enrollments (subscribers in a flow)
CREATE TABLE email_flow_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'converted')),
  current_step INT DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}', -- {checkout_id, order_id, trigger_data}
  cloud_task_name TEXT -- Google Cloud Task name for cancellation
);

CREATE INDEX idx_email_enrollments_flow ON email_flow_enrollments(flow_id, status);
CREATE INDEX idx_email_enrollments_subscriber ON email_flow_enrollments(subscriber_id, status);
CREATE INDEX idx_email_enrollments_next_send ON email_flow_enrollments(status, next_send_at) WHERE status = 'active';
CREATE UNIQUE INDEX idx_email_enrollments_unique_active ON email_flow_enrollments(flow_id, subscriber_id) WHERE status = 'active';

-- 6. Email Domain Verification
CREATE TABLE email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  ses_identity_arn TEXT,
  dkim_tokens TEXT[] DEFAULT '{}',
  dns_records JSONB DEFAULT '[]', -- [{type, name, value, status}]
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, domain)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_flow_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_domains ENABLE ROW LEVEL SECURITY;

-- Service role (admin) bypasses RLS automatically.
-- These policies allow authenticated users to access their own client's data.

CREATE POLICY "Users can view own client subscribers"
  ON email_subscribers FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM client_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own client campaigns"
  ON email_campaigns FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM client_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own client flows"
  ON email_flows FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM client_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own client events"
  ON email_events FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM client_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own client enrollments"
  ON email_flow_enrollments FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM client_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own client domains"
  ON email_domains FOR SELECT
  USING (client_id IN (
    SELECT id FROM clients WHERE user_id = auth.uid()
    UNION
    SELECT client_id FROM client_users WHERE user_id = auth.uid()
  ));
