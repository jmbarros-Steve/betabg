-- Email lists and segments table
CREATE TABLE IF NOT EXISTS email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'static' CHECK (type IN ('static', 'segment')),
  filters JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table for static list members
CREATE TABLE IF NOT EXISTS email_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, subscriber_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_lists_client ON email_lists(client_id);
CREATE INDEX IF NOT EXISTS idx_email_list_members_list ON email_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_email_list_members_subscriber ON email_list_members(subscriber_id);

-- RLS
ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_list_members ENABLE ROW LEVEL SECURITY;

-- Service role has full access (API handles auth)
CREATE POLICY "service_role_email_lists" ON email_lists FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_email_list_members" ON email_list_members FOR ALL TO service_role USING (true) WITH CHECK (true);
