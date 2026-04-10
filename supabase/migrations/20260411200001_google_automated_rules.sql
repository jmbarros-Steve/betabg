-- Google Automated Rules + Execution Log
-- Mirrors meta_automated_rules / meta_rule_execution_log structure

CREATE TABLE IF NOT EXISTS google_automated_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}',
  action JSONB NOT NULL DEFAULT '{}',
  apply_to TEXT NOT NULL DEFAULT 'ALL_CAMPAIGNS',
  specific_campaign_ids TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_rule_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES google_automated_rules(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  metrics_snapshot JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_google_automated_rules_client ON google_automated_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_google_automated_rules_connection ON google_automated_rules(connection_id);
CREATE INDEX IF NOT EXISTS idx_google_automated_rules_active ON google_automated_rules(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_google_rule_exec_log_rule ON google_rule_execution_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_google_rule_exec_log_client ON google_rule_execution_log(client_id);

-- RLS
ALTER TABLE google_automated_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_rule_execution_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rules_select_own' AND tablename = 'google_automated_rules') THEN
    CREATE POLICY google_rules_select_own ON google_automated_rules FOR SELECT USING (
      client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rules_insert_own' AND tablename = 'google_automated_rules') THEN
    CREATE POLICY google_rules_insert_own ON google_automated_rules FOR INSERT WITH CHECK (
      client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rules_update_own' AND tablename = 'google_automated_rules') THEN
    CREATE POLICY google_rules_update_own ON google_automated_rules FOR UPDATE USING (
      client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rules_delete_own' AND tablename = 'google_automated_rules') THEN
    CREATE POLICY google_rules_delete_own ON google_automated_rules FOR DELETE USING (
      client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rule_log_select_own' AND tablename = 'google_rule_execution_log') THEN
    CREATE POLICY google_rule_log_select_own ON google_rule_execution_log FOR SELECT USING (
      client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
    );
  END IF;
END $$;

-- Service role bypass (for cron)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rules_service_all' AND tablename = 'google_automated_rules') THEN
    CREATE POLICY google_rules_service_all ON google_automated_rules FOR ALL USING (
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'google_rule_log_service_all' AND tablename = 'google_rule_execution_log') THEN
    CREATE POLICY google_rule_log_service_all ON google_rule_execution_log FOR ALL USING (
      (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
    );
  END IF;
END $$;
