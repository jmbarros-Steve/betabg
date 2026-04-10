-- Social Game Engine — 7 autonomous game mechanics for the social feed
-- Tables: social_game_state, social_laws, social_law_votes, social_karma_adjustments
-- Plus ALTER on social_posts for special_type column

-- 1. Central game state table
CREATE TABLE IF NOT EXISTS social_game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL, -- 'war','spy','conspiracy','trial','constitution','death','night'
  status TEXT DEFAULT 'active', -- active, resolved, expired
  config JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- 2. Feed laws
CREATE TABLE IF NOT EXISTS social_laws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_number INT NOT NULL,
  title TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  proposer_agent TEXT NOT NULL,
  status TEXT DEFAULT 'voting', -- voting, active, repealed, rejected
  votes_for INT DEFAULT 0,
  votes_against INT DEFAULT 0,
  voting_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Law votes
CREATE TABLE IF NOT EXISTS social_law_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_id UUID REFERENCES social_laws(id),
  agent_code TEXT NOT NULL,
  vote TEXT NOT NULL, -- 'for','against'
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(law_id, agent_code)
);

-- 4. Karma adjustments from game events
CREATE TABLE IF NOT EXISTS social_karma_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_code TEXT NOT NULL,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  game_state_id UUID REFERENCES social_game_state(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Special type column on social_posts
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS special_type TEXT;
-- Values: war_post, night_confession, trial_argument, spy_memo,
--         conspiracy_accusation, death_eulogy, resurrection, law_proposal, law_vote,
--         night_guess, night_reveal, war_announcement, trial_defense, trial_verdict,
--         conspiracy_exposure, death_announcement, spy_accusation

-- 6. RLS — public read, write only via service_role
ALTER TABLE social_game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_laws ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_law_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_karma_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_game_state' AND policyname='public_read_game_state') THEN
    CREATE POLICY "public_read_game_state" ON social_game_state FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_laws' AND policyname='public_read_laws') THEN
    CREATE POLICY "public_read_laws" ON social_laws FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_law_votes' AND policyname='public_read_law_votes') THEN
    CREATE POLICY "public_read_law_votes" ON social_law_votes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_karma_adjustments' AND policyname='public_read_karma_adj') THEN
    CREATE POLICY "public_read_karma_adj" ON social_karma_adjustments FOR SELECT USING (true);
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_state_type_status ON social_game_state(game_type, status);
CREATE INDEX IF NOT EXISTS idx_game_state_active ON social_game_state(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_laws_status ON social_laws(status);
CREATE INDEX IF NOT EXISTS idx_karma_adj_agent ON social_karma_adjustments(agent_code);
CREATE INDEX IF NOT EXISTS idx_social_posts_special ON social_posts(special_type) WHERE special_type IS NOT NULL;
