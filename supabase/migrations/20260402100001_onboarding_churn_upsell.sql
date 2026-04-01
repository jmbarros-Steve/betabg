-- ============================================================
-- Steve Post-Venta: Onboarding + Churn + Upsell
-- ============================================================

-- 1. Merchant onboarding tracking table
CREATE TABLE IF NOT EXISTS merchant_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  wa_message_sent BOOLEAN DEFAULT false,
  reminder_count INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, step)
);

CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_client
  ON merchant_onboarding (client_id);

CREATE INDEX IF NOT EXISTS idx_merchant_onboarding_pending
  ON merchant_onboarding (status) WHERE status IN ('pending', 'in_progress');

-- 2. Add post-venta fields to clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_wa_started BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS churn_risk TEXT DEFAULT 'none' CHECK (churn_risk IN ('none', 'low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_clients_churn_risk
  ON clients (churn_risk) WHERE churn_risk != 'none';

CREATE INDEX IF NOT EXISTS idx_clients_last_active
  ON clients (last_active_at);

-- 3. Upsell opportunities table
CREATE TABLE IF NOT EXISTS merchant_upsell_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  metric_data JSONB DEFAULT '{}',
  wa_sent BOOLEAN DEFAULT false,
  wa_sent_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('accepted', 'declined', 'pending', 'ignored')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upsell_client
  ON merchant_upsell_opportunities (client_id);

CREATE INDEX IF NOT EXISTS idx_upsell_pending
  ON merchant_upsell_opportunities (outcome) WHERE outcome = 'pending';

-- 4. RLS policies (drop if exists to handle partial re-runs)
ALTER TABLE merchant_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_upsell_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_onboarding_service" ON merchant_onboarding;
CREATE POLICY "merchant_onboarding_service"
  ON merchant_onboarding FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "merchant_onboarding_client_read" ON merchant_onboarding;
CREATE POLICY "merchant_onboarding_client_read"
  ON merchant_onboarding FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "merchant_onboarding_admin_read" ON merchant_onboarding;
CREATE POLICY "merchant_onboarding_admin_read"
  ON merchant_onboarding FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "upsell_service" ON merchant_upsell_opportunities;
CREATE POLICY "upsell_service"
  ON merchant_upsell_opportunities FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "upsell_admin_read" ON merchant_upsell_opportunities;
CREATE POLICY "upsell_admin_read"
  ON merchant_upsell_opportunities FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
  );
