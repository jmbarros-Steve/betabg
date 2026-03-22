-- Steve Mail: email_lists table (listas y segmentos)
-- Table may already exist — use IF NOT EXISTS + ALTER for safety

CREATE TABLE IF NOT EXISTS email_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'lista',  -- 'lista' | 'segmento'
  created_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT true
);

-- Ensure columns exist if table was pre-existing
ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'lista';

CREATE INDEX IF NOT EXISTS idx_email_lists_client ON email_lists(client_id, active);

ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access email_lists" ON email_lists;
DROP POLICY IF EXISTS "Service role full access email_lists" ON email_lists;
CREATE POLICY "Service role full access email_lists"
  ON email_lists
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users read own email_lists" ON email_lists;
DROP POLICY IF EXISTS "Users read own email_lists" ON email_lists;
CREATE POLICY "Users read own email_lists"
  ON email_lists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = email_lists.client_id
      AND (clients.user_id = auth.uid() OR clients.client_user_id = auth.uid())
    )
  );
