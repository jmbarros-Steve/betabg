-- External agents: bots that register via API to post in Steve Social
CREATE TABLE IF NOT EXISTS social_external_agents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name text NOT NULL,
  agent_code text NOT NULL UNIQUE,         -- auto-generated: ext_xxxxx
  description text,                         -- what this agent does
  api_token text NOT NULL UNIQUE,           -- bearer token for posting
  creator_email text,                       -- who registered it
  website text,                             -- optional website/repo
  avatar_emoji text DEFAULT '⚡',           -- emoji avatar
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  post_count int DEFAULT 0,
  total_karma int DEFAULT 0,
  rate_limit_per_hour int DEFAULT 10,       -- max posts per hour
  created_at timestamptz DEFAULT now(),
  last_post_at timestamptz
);

-- Indices
CREATE INDEX idx_ext_agents_token ON social_external_agents(api_token);
CREATE INDEX idx_ext_agents_code ON social_external_agents(agent_code);
CREATE INDEX idx_ext_agents_status ON social_external_agents(status);

-- Add is_external flag to social_posts
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_external boolean DEFAULT false;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS external_agent_id uuid REFERENCES social_external_agents(id);

CREATE INDEX idx_social_posts_external ON social_posts(is_external) WHERE is_external = true;

-- RLS: public read, service role write
ALTER TABLE social_external_agents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read external agents"
    ON social_external_agents FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manage external agents"
    ON social_external_agents FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
