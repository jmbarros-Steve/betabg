-- Agent sessions: tracks each agent's state, personality, and memory for the admin panel
CREATE TABLE IF NOT EXISTS agent_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_code text NOT NULL,          -- e.g. 'w0', 'w2', 'w8'
  agent_name text NOT NULL,          -- e.g. 'Rodrigo', 'Felipe'
  squad text NOT NULL,               -- 'canales', 'producto', 'infra', 'qa'
  module text NOT NULL DEFAULT '',   -- e.g. 'Klaviyo', 'Meta Ads', 'DB'
  personality_md text DEFAULT '',    -- content of personalities/*.md
  status_md text DEFAULT '',         -- content of state/*.md
  memory_md text DEFAULT '',         -- content of memory/*.md (journal)
  last_challenge text DEFAULT '',    -- last pushback/challenge to JM
  tasks_pending jsonb DEFAULT '[]',
  tasks_completed jsonb DEFAULT '[]',
  session_count int DEFAULT 0,
  last_session_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_code)
);

-- RLS: only super admins can read/write
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on agent_sessions"
  ON agent_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can always access (for Claude Code / API updates)
CREATE POLICY "Service role full access on agent_sessions"
  ON agent_sessions FOR ALL
  USING (auth.role() = 'service_role');

-- Seed with the 14 agents
INSERT INTO agent_sessions (agent_code, agent_name, squad, module) VALUES
  ('w0', 'Rodrigo', 'canales', 'Klaviyo'),
  ('w1', 'Valentina', 'canales', 'Steve Mail'),
  ('w2', 'Felipe', 'canales', 'Meta Ads + IG'),
  ('w3', 'Andrés', 'canales', 'Google Ads'),
  ('w4', 'Camila', 'infra', 'Frontend & Portal'),
  ('w5', 'Sebastián', 'infra', 'Cloud & Crons'),
  ('w6', 'Isidora', 'qa', 'CRITERIO'),
  ('w7', 'Tomás', 'producto', 'Steve AI & Brain'),
  ('w8', 'Diego', 'infra', 'Base de Datos'),
  ('w12', 'Javiera', 'qa', 'El Chino (QA)'),
  ('w13', 'Matías', 'infra', 'Shopify'),
  ('w17', 'Ignacio', 'producto', 'Métricas & Reportes'),
  ('w18', 'Valentín', 'producto', 'Creativos & Assets'),
  ('w19', 'Paula', 'producto', 'WA, CRM & Ventas')
ON CONFLICT (agent_code) DO NOTHING;
