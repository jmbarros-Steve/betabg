-- WhatsApp module tables

-- Sub-accounts de Twilio por merchant
CREATE TABLE IF NOT EXISTS wa_twilio_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  twilio_account_sid TEXT NOT NULL,
  twilio_auth_token TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  phone_number_sid TEXT NOT NULL,
  whatsapp_approved BOOLEAN DEFAULT false,
  display_name TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_twilio_accounts_client
  ON wa_twilio_accounts(client_id) WHERE status = 'active';

-- Créditos de WhatsApp por merchant
CREATE TABLE IF NOT EXISTS wa_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transacciones de créditos
CREATE TABLE IF NOT EXISTS wa_credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  campaign_id UUID,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_credit_tx_client
  ON wa_credit_transactions(client_id, created_at DESC);

-- Mensajes de WhatsApp
CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_wa_messages_client_channel
  ON wa_messages(client_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_sid
  ON wa_messages(message_sid) WHERE message_sid IS NOT NULL;

-- Conversaciones
CREATE TABLE IF NOT EXISTS wa_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
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

-- Campañas de WhatsApp
CREATE TABLE IF NOT EXISTS wa_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
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

-- Automatizaciones de WhatsApp
CREATE TABLE IF NOT EXISTS wa_automations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
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

-- RLS
ALTER TABLE wa_twilio_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_automations ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access wa_twilio_accounts" ON wa_twilio_accounts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access wa_credits" ON wa_credits FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access wa_credit_transactions" ON wa_credit_transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access wa_messages" ON wa_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access wa_conversations" ON wa_conversations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access wa_campaigns" ON wa_campaigns FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access wa_automations" ON wa_automations FOR ALL USING (auth.role() = 'service_role');

-- Users can read their own data
CREATE POLICY "Users read own wa_twilio_accounts" ON wa_twilio_accounts FOR SELECT USING (true);
CREATE POLICY "Users read own wa_credits" ON wa_credits FOR SELECT USING (true);
CREATE POLICY "Users read own wa_credit_transactions" ON wa_credit_transactions FOR SELECT USING (true);
CREATE POLICY "Users read own wa_messages" ON wa_messages FOR SELECT USING (true);
CREATE POLICY "Users read own wa_conversations" ON wa_conversations FOR SELECT USING (true);
CREATE POLICY "Users read own wa_campaigns" ON wa_campaigns FOR SELECT USING (true);
CREATE POLICY "Users read own wa_automations" ON wa_automations FOR SELECT USING (true);
