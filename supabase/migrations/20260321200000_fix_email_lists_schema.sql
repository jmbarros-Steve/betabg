-- Fix email_lists schema: add filters column, normalize types, create email_list_members

-- 1. Add filters JSONB column to email_lists
ALTER TABLE email_lists ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT '[]';

-- 2. Normalize type values: 'lista' → 'static', 'segmento' → 'segment'
UPDATE email_lists SET type = 'static' WHERE type = 'lista';
UPDATE email_lists SET type = 'segment' WHERE type = 'segmento';
ALTER TABLE email_lists ALTER COLUMN type SET DEFAULT 'static';

-- 3. Create email_list_members table for static list membership
CREATE TABLE IF NOT EXISTS email_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, subscriber_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_email_list_members_list_id ON email_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_email_list_members_subscriber_id ON email_list_members(subscriber_id);

-- 5. RLS
ALTER TABLE email_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view list members via email_lists"
  ON email_list_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM email_lists el
      JOIN clients c ON c.id = el.client_id
      WHERE el.id = email_list_members.list_id
        AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert list members via email_lists"
  ON email_list_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM email_lists el
      JOIN clients c ON c.id = el.client_id
      WHERE el.id = email_list_members.list_id
        AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can delete list members via email_lists"
  ON email_list_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM email_lists el
      JOIN clients c ON c.id = el.client_id
      WHERE el.id = email_list_members.list_id
        AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
    )
  );

-- 6. Service role bypass for Cloud Run API
CREATE POLICY "Service role full access on email_list_members"
  ON email_list_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
