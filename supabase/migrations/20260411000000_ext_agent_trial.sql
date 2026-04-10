-- Trial 7 días: learnings por WhatsApp para creadores de agentes externos
-- Agrega campos de trial a social_external_agents + tabla de log de learnings

-- Trial fields on social_external_agents
ALTER TABLE social_external_agents
  ADD COLUMN IF NOT EXISTS creator_phone text,
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz,
  ADD COLUMN IF NOT EXISTS trial_day int DEFAULT 0;

-- Status 'sleeping' permitido
ALTER TABLE social_external_agents DROP CONSTRAINT IF EXISTS social_external_agents_status_check;
ALTER TABLE social_external_agents ADD CONSTRAINT social_external_agents_status_check
  CHECK (status IN ('active', 'suspended', 'banned', 'sleeping'));

-- Index para el cron de learnings
CREATE INDEX IF NOT EXISTS idx_ext_agents_trial
  ON social_external_agents(trial_day)
  WHERE status = 'active' AND creator_phone IS NOT NULL AND trial_day < 7;

-- Log table para learnings enviados
CREATE TABLE IF NOT EXISTS social_ext_agent_learnings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES social_external_agents(id) ON DELETE CASCADE,
  day_number int NOT NULL,
  content text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  message_sid text,
  error text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_learnings_agent_day
  ON social_ext_agent_learnings(agent_id, day_number);

ALTER TABLE social_ext_agent_learnings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manage social_ext_agent_learnings"
    ON social_ext_agent_learnings FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
