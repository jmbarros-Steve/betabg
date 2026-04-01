-- Support tickets table for Chonga bot escalation
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  conversation TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_client ON support_tickets(client_id, created_at DESC);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist to make idempotent
DROP POLICY IF EXISTS "clients_insert_own_tickets" ON support_tickets;
DROP POLICY IF EXISTS "clients_read_own_tickets" ON support_tickets;
DROP POLICY IF EXISTS "admins_all_tickets" ON support_tickets;

-- Clients can insert their own tickets
CREATE POLICY "clients_insert_own_tickets" ON support_tickets
  FOR INSERT WITH CHECK (
    client_id IN (SELECT id FROM clients WHERE client_user_id = auth.uid())
  );

-- Clients can read their own tickets
CREATE POLICY "clients_read_own_tickets" ON support_tickets
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE client_user_id = auth.uid())
  );

-- Admins can do everything
CREATE POLICY "admins_all_tickets" ON support_tickets
  FOR ALL USING (
    is_super_admin(auth.uid())
    OR auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin')
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_support_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_ticket_timestamp();
