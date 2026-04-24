-- Brief Estudio — Etapa 2: rate limiting + cost logging
-- Track AI generation calls (Replicate Flux actors, XTTS voice cloning) per
-- client_id. Used to enforce per-hour limits and to bill credits later.

CREATE TABLE IF NOT EXISTS brief_estudio_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  cost_credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_estudio_ai_usage_client_created
  ON brief_estudio_ai_usage (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brief_estudio_ai_usage_endpoint
  ON brief_estudio_ai_usage (endpoint, created_at DESC);

-- RLS — mismo patrón que brand_actors.
ALTER TABLE brief_estudio_ai_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'brief_estudio_ai_usage_select_owner'
      AND tablename = 'brief_estudio_ai_usage'
  ) THEN
    CREATE POLICY brief_estudio_ai_usage_select_owner ON brief_estudio_ai_usage
      FOR SELECT USING (
        is_super_admin(auth.uid()) OR
        client_id IN (
          SELECT id FROM clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE brief_estudio_ai_usage
  IS 'Brief Estudio Etapa 2 — log de llamadas AI (Flux actores, XTTS voz) para rate limiting y billing';
