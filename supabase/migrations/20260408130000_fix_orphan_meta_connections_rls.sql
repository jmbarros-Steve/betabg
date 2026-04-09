-- Fix RLS policy for orphan_meta_connections
-- The original policy checked user_roles.role = 'admin' but JM is super_admin.
-- Also, the canonical pattern in this project is is_super_admin(auth.uid())
-- (see 20260408000000_waitlist_leads.sql).

-- Drop the buggy policy
DROP POLICY IF EXISTS orphan_meta_connections_admin_all ON orphan_meta_connections;

-- Recreate using is_super_admin() helper (matches waitlist_leads pattern)
CREATE POLICY "Super admins manage orphan meta connections"
  ON orphan_meta_connections
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Drop useless email index (Leadsie payload does not include email)
DROP INDEX IF EXISTS idx_orphan_meta_connections_email;
