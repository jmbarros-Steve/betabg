-- Keyword Quality Score History (Tier 3) — snapshot diario del QS por keyword.
-- Usado por cron quality-score-monitor para detectar caídas y alertar.

CREATE TABLE IF NOT EXISTS keyword_quality_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES platform_connections(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  ad_group_id text NOT NULL,
  criterion_id text NOT NULL,
  keyword_text text NOT NULL,
  match_type text,
  quality_score integer,
  expected_ctr text,           -- ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE
  ad_relevance text,           -- idem
  landing_page_experience text, -- idem
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Un snapshot por día por criterion
CREATE UNIQUE INDEX IF NOT EXISTS uq_qs_daily
  ON keyword_quality_score_history (client_id, criterion_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_qs_client_date ON keyword_quality_score_history (client_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_qs_criterion ON keyword_quality_score_history (criterion_id, snapshot_date DESC);

ALTER TABLE keyword_quality_score_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'qs_select_owner' AND tablename = 'keyword_quality_score_history') THEN
    CREATE POLICY qs_select_owner ON keyword_quality_score_history
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (SELECT id FROM clients WHERE user_id = auth.uid() OR client_user_id = auth.uid())
      );
  END IF;
END $$;

COMMENT ON TABLE keyword_quality_score_history IS 'Snapshot diario del Quality Score por keyword — usado por cron quality-score-monitor para alertas';
