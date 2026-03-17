-- WhatsApp tables for Steve Chat WA + Merchant WA

CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  channel TEXT NOT NULL,              -- 'steve_chat' | 'merchant_wa'
  direction TEXT NOT NULL,            -- 'inbound' | 'outbound'
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

CREATE INDEX IF NOT EXISTS idx_wa_messages_client ON wa_messages(client_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_phone ON wa_messages(contact_phone, created_at DESC);

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
  assigned_to TEXT DEFAULT 'steve',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, channel, contact_phone)
);

ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
