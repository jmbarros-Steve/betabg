-- Full WhatsApp tables for Merchant WA (Producto 2)
-- Note: wa_credits already exists from 20260317600000_wa_credits.sql

-- Credit transactions (detailed history)
CREATE TABLE IF NOT EXISTS wa_credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  campaign_id UUID,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp messages
CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  message_sid TEXT,
  status TEXT DEFAULT 'sent',
  template_name TEXT,
  credits_used INTEGER DEFAULT 0,
  contact_name TEXT,
  contact_phone TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Conversations (grouped by contact)
CREATE TABLE IF NOT EXISTS wa_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  channel TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  status TEXT DEFAULT 'open',
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  assigned_to TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, channel, contact_phone)
);

-- WhatsApp campaigns (bulk sends)
CREATE TABLE IF NOT EXISTS wa_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_body TEXT NOT NULL,
  segment_query JSONB,
  recipient_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp automations
CREATE TABLE IF NOT EXISTS wa_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB,
  template_name TEXT NOT NULL,
  template_body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  total_sent INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Twilio sub-accounts per merchant
CREATE TABLE IF NOT EXISTS wa_twilio_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  twilio_account_sid TEXT NOT NULL,
  twilio_auth_token TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  phone_number_sid TEXT NOT NULL,
  whatsapp_approved BOOLEAN DEFAULT false,
  display_name TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_messages_client ON wa_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_contact ON wa_messages(client_id, contact_phone);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created ON wa_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_client ON wa_conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_last ON wa_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_client ON wa_campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_automations_client ON wa_automations(client_id);
CREATE INDEX IF NOT EXISTS idx_wa_credit_tx_client ON wa_credit_transactions(client_id);

-- RLS
ALTER TABLE wa_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_twilio_accounts ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_wa_credit_transactions" ON wa_credit_transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_wa_messages" ON wa_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_wa_conversations" ON wa_conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_wa_campaigns" ON wa_campaigns FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_wa_automations" ON wa_automations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_wa_twilio_accounts" ON wa_twilio_accounts FOR ALL USING (auth.role() = 'service_role');

-- Client access (RLS via can_access_shop)
CREATE POLICY "client_wa_credit_transactions" ON wa_credit_transactions FOR SELECT USING (can_access_shop(client_id));
CREATE POLICY "client_wa_messages" ON wa_messages FOR SELECT USING (can_access_shop(client_id));
CREATE POLICY "client_wa_conversations" ON wa_conversations FOR SELECT USING (can_access_shop(client_id));
CREATE POLICY "client_wa_campaigns" ON wa_campaigns FOR ALL USING (can_access_shop(client_id));
CREATE POLICY "client_wa_automations" ON wa_automations FOR ALL USING (can_access_shop(client_id));
CREATE POLICY "client_wa_twilio_accounts" ON wa_twilio_accounts FOR SELECT USING (can_access_shop(client_id));
