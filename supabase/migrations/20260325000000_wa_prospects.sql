-- WhatsApp Sales Funnel: prospects table + wa_messages.client_id nullable

-- 1. Tabla de prospectos (números desconocidos que escriben a Steve)
CREATE TABLE IF NOT EXISTS wa_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  profile_name TEXT,
  name TEXT,
  email TEXT,
  company TEXT,
  what_they_sell TEXT,
  stage TEXT DEFAULT 'new' CHECK (stage IN ('new', 'talking', 'info_collected', 'converted')),
  source TEXT DEFAULT 'whatsapp',
  message_count INTEGER DEFAULT 0,
  converted_client_id UUID REFERENCES clients(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_prospects_phone ON wa_prospects(phone);
CREATE INDEX IF NOT EXISTS idx_wa_prospects_stage ON wa_prospects(stage);
CREATE INDEX IF NOT EXISTS idx_wa_prospects_email ON wa_prospects(email) WHERE email IS NOT NULL;

-- RLS: solo service_role
ALTER TABLE wa_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_wa_prospects"
  ON wa_prospects FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Hacer client_id nullable en wa_messages (para mensajes de prospectos sin client)
ALTER TABLE wa_messages ALTER COLUMN client_id DROP NOT NULL;
