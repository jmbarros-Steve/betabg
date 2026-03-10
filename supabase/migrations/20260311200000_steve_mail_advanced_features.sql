-- ============================================================
-- Steve Mail Advanced Features
-- A/B Testing, Product Alerts, Signup Forms, Flow Branching
-- ============================================================

-- 1. A/B Tests
CREATE TABLE IF NOT EXISTS email_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL,
  variant_b_subject TEXT,
  variant_b_preview_text TEXT,
  variant_b_html_content TEXT,
  variant_b_design_json JSONB,
  test_percentage INT DEFAULT 20 CHECK (test_percentage BETWEEN 5 AND 50),
  winning_metric TEXT DEFAULT 'open_rate' CHECK (winning_metric IN ('open_rate', 'click_rate', 'revenue')),
  test_duration_hours INT DEFAULT 4 CHECK (test_duration_hours BETWEEN 1 AND 72),
  winner TEXT CHECK (winner IN ('a', 'b')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'testing', 'winner_selected', 'completed', 'cancelled')),
  variant_a_recipients INT DEFAULT 0,
  variant_b_recipients INT DEFAULT 0,
  remaining_recipients INT DEFAULT 0,
  test_started_at TIMESTAMPTZ,
  winner_selected_at TIMESTAMPTZ,
  cloud_task_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id)
);

CREATE INDEX idx_ab_tests_campaign ON email_ab_tests(campaign_id);
CREATE INDEX idx_ab_tests_status ON email_ab_tests(client_id, status);

-- 2. Product Alerts (Back-in-Stock + Price Drop)
CREATE TABLE IF NOT EXISTS product_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subscriber_id UUID,
  email TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  product_title TEXT,
  product_image TEXT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('back_in_stock', 'price_drop')),
  original_price NUMERIC(12,2),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'cancelled', 'expired')),
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_product_alerts_lookup ON product_alerts(client_id, product_id, alert_type, status);
CREATE INDEX idx_product_alerts_subscriber ON product_alerts(subscriber_id) WHERE subscriber_id IS NOT NULL;

-- 3. Signup Forms (Popups/Slide-ins/Inline)
CREATE TABLE IF NOT EXISTS email_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  form_type TEXT NOT NULL CHECK (form_type IN ('popup', 'slide_in', 'inline', 'full_page')),
  design JSONB DEFAULT '{}'::jsonb,
  trigger_rules JSONB DEFAULT '{}'::jsonb,
  incentive_type TEXT CHECK (incentive_type IN ('discount_code', 'free_shipping', 'none')),
  incentive_value TEXT,
  tags_to_apply TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  total_views INT DEFAULT 0,
  total_submissions INT DEFAULT 0,
  script_tag_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_email_forms_client ON email_forms(client_id, status);

-- 4. Extend existing Steve Mail tables (only if they exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_events') THEN
    ALTER TABLE email_events ADD COLUMN IF NOT EXISTS ab_variant TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_campaigns') THEN
    ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS design_json JSONB;
    ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS recommendation_config JSONB;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_domains') THEN
    ALTER TABLE email_domains ADD COLUMN IF NOT EXISTS resend_domain_id TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_flows') THEN
    ALTER TABLE email_flows DROP CONSTRAINT IF EXISTS email_flows_trigger_type_check;
    ALTER TABLE email_flows ADD CONSTRAINT email_flows_trigger_type_check
      CHECK (trigger_type IN (
        'abandoned_cart', 'welcome', 'post_purchase', 'winback',
        'browse_abandonment', 'back_in_stock', 'price_drop'
      ));
  END IF;
END $$;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE email_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_forms ENABLE ROW LEVEL SECURITY;

-- Service role bypass (backend uses service role key)
CREATE POLICY "Service role full access ab_tests" ON email_ab_tests
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access product_alerts" ON product_alerts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access email_forms" ON email_forms
  FOR ALL USING (true) WITH CHECK (true);
