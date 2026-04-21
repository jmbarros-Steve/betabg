-- Search Terms Suggestions — sugerencias automáticas de Steve para Search Terms.
-- Cada 3 días un cron analiza search_term_view y genera sugerencias de:
-- 1. Agregar search term como keyword (si tiene buenas conversions)
-- 2. Agregar como negative a nivel ad_group (clicks>=3 sin conv)
-- 3. Agregar como negative a nivel campaign (impressions>=100 ctr<0.5%)
-- JM aprueba/rechaza desde la tab UI antes de aplicar.

CREATE TABLE IF NOT EXISTS search_terms_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  campaign_name text,
  ad_group_id text NOT NULL,
  ad_group_name text,
  search_term text NOT NULL,
  matched_keyword text,
  matched_keyword_match_type text,
  impressions integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions numeric DEFAULT 0,
  cost_micros bigint DEFAULT 0,
  ctr numeric DEFAULT 0,
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('add_keyword', 'add_negative_campaign', 'add_negative_adgroup')),
  suggested_match_type text DEFAULT 'EXACT' CHECK (suggested_match_type IN ('EXACT', 'PHRASE', 'BROAD')),
  suggestion_reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'failed')),
  applied_at timestamptz,
  applied_resource_name text,
  applied_error text,
  rejected_by uuid REFERENCES auth.users(id),
  rejected_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sts_client_status ON search_terms_suggestions (client_id, status);
CREATE INDEX IF NOT EXISTS idx_sts_connection_created ON search_terms_suggestions (connection_id, created_at DESC);
-- Unique pendientes por (client + search_term + campaign + type) para evitar dup del cron
CREATE UNIQUE INDEX IF NOT EXISTS uq_sts_pending
  ON search_terms_suggestions (client_id, campaign_id, search_term, suggestion_type)
  WHERE status = 'pending';

-- RLS: cada cliente ve solo sus sugerencias. Admin ve todas.
ALTER TABLE search_terms_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sts_select_owner' AND tablename = 'search_terms_suggestions') THEN
    CREATE POLICY sts_select_owner ON search_terms_suggestions
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sts_update_owner' AND tablename = 'search_terms_suggestions') THEN
    CREATE POLICY sts_update_owner ON search_terms_suggestions
      FOR UPDATE USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_sts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sts_updated_at ON search_terms_suggestions;
CREATE TRIGGER trg_sts_updated_at
  BEFORE UPDATE ON search_terms_suggestions
  FOR EACH ROW EXECUTE FUNCTION update_sts_updated_at();

COMMENT ON TABLE search_terms_suggestions IS 'Sugerencias Steve AI para Search Terms — review humano antes de aplicar a Google Ads';
