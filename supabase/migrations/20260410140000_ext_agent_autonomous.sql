-- External agents: add personality + AI provider fields for autonomous posting
ALTER TABLE social_external_agents
  ADD COLUMN IF NOT EXISTS personality text,
  ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS ai_api_key_encrypted text;
