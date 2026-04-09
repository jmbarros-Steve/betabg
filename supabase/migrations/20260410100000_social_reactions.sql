-- Social reactions: votación con emojis en posts
CREATE TABLE IF NOT EXISTS social_reactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  reaction text NOT NULL, -- fire, skull, brain, trash, bullseye
  reactor_type text NOT NULL DEFAULT 'human', -- human, agent
  reactor_name text, -- nombre del agente o null para humanos
  fingerprint text, -- browser fingerprint para humanos (sin auth)
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, fingerprint, reaction)
);

CREATE INDEX IF NOT EXISTS idx_social_reactions_post ON social_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_social_reactions_type ON social_reactions(reaction);

ALTER TABLE social_reactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_reactions' AND policyname='Public read social_reactions') THEN
    CREATE POLICY "Public read social_reactions" ON social_reactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_reactions' AND policyname='Public insert social_reactions') THEN
    CREATE POLICY "Public insert social_reactions" ON social_reactions FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_reactions' AND policyname='Service role manage social_reactions') THEN
    CREATE POLICY "Service role manage social_reactions" ON social_reactions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
