-- Orphan Meta connections from Admatic webhook
-- When a webhook arrives but we cannot match end_user.email to any client,
-- we store the raw payload here so an admin can manually assign it later.

CREATE TABLE IF NOT EXISTS orphan_meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_user_id text,
  end_user_email text,
  end_user_name text,
  partner_id text,
  event_type text,
  status text,
  raw_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  assigned_to_client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_orphan_meta_connections_email
  ON orphan_meta_connections (lower(end_user_email))
  WHERE end_user_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orphan_meta_connections_unassigned
  ON orphan_meta_connections (received_at DESC)
  WHERE assigned_to_client_id IS NULL;

ALTER TABLE orphan_meta_connections ENABLE ROW LEVEL SECURITY;

-- Only super admins can see / manage orphan webhooks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orphan_meta_connections'
      AND policyname = 'orphan_meta_connections_admin_all'
  ) THEN
    CREATE POLICY orphan_meta_connections_admin_all
      ON orphan_meta_connections
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = 'admin'
        )
      );
  END IF;
END $$;
