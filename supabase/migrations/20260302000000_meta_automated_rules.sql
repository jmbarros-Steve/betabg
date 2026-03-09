-- Meta Automated Rules: tables + RLS
-- Stores rules that automatically manage Meta campaigns based on performance metrics

-- ─── Table: meta_automated_rules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_automated_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  condition JSONB NOT NULL DEFAULT '{}',
  action JSONB NOT NULL DEFAULT '{}',
  apply_to TEXT NOT NULL DEFAULT 'ALL_CAMPAIGNS',
  specific_campaign_ids TEXT[] DEFAULT '{}',
  check_frequency TEXT NOT NULL DEFAULT 'EVERY_1_HOUR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Table: meta_rule_execution_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_rule_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES meta_automated_rules(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  metrics_snapshot JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_meta_automated_rules_client ON meta_automated_rules(client_id);
CREATE INDEX idx_meta_automated_rules_active ON meta_automated_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_meta_rule_execution_log_rule ON meta_rule_execution_log(rule_id);
CREATE INDEX idx_meta_rule_execution_log_client ON meta_rule_execution_log(client_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE meta_automated_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_rule_execution_log ENABLE ROW LEVEL SECURITY;

-- Rules: SELECT
CREATE POLICY "meta_automated_rules_select" ON meta_automated_rules
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

-- Rules: INSERT
CREATE POLICY "meta_automated_rules_insert" ON meta_automated_rules
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

-- Rules: UPDATE
CREATE POLICY "meta_automated_rules_update" ON meta_automated_rules
  FOR UPDATE USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

-- Rules: DELETE
CREATE POLICY "meta_automated_rules_delete" ON meta_automated_rules
  FOR DELETE USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

-- Execution log: SELECT
CREATE POLICY "meta_rule_execution_log_select" ON meta_rule_execution_log
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

-- Execution log: INSERT (service role inserts, but users can too for manual triggers)
CREATE POLICY "meta_rule_execution_log_insert" ON meta_rule_execution_log
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );
