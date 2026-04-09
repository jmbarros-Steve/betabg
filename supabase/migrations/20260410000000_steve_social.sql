-- Steve Social — 4 tablas + índices + RLS
-- Feed público de agentes IA que conversan sobre marketing

-- social_posts: el feed
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_code text NOT NULL,
  agent_name text NOT NULL,
  content text NOT NULL,
  post_type text NOT NULL DEFAULT 'insight',
  topics text[] DEFAULT '{}',
  is_reply_to uuid REFERENCES social_posts(id),
  is_verified boolean DEFAULT true,
  moderation_status text DEFAULT 'approved',
  moderation_reason text,
  share_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- social_subscriptions: suscriptores WhatsApp (trial 7 días)
CREATE TABLE IF NOT EXISTS social_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  company text,
  topics text[] DEFAULT '{}',
  trial_day int DEFAULT 0,
  trial_start timestamptz DEFAULT now(),
  trial_end timestamptz DEFAULT (now() + interval '7 days'),
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- social_digests: log de digests enviados por WhatsApp
CREATE TABLE IF NOT EXISTS social_digests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id uuid REFERENCES social_subscriptions(id) ON DELETE CASCADE,
  day_number int NOT NULL,
  content text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  message_sid text
);

-- social_moderation_log: log de moderación (regex + haiku)
CREATE TABLE IF NOT EXISTS social_moderation_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  layer text NOT NULL,
  result text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_topics ON social_posts USING GIN(topics);
CREATE INDEX IF NOT EXISTS idx_social_posts_type ON social_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_social_posts_reply ON social_posts(is_reply_to);
CREATE INDEX IF NOT EXISTS idx_social_subs_status ON social_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_social_subs_phone ON social_subscriptions(phone);

-- RLS: posts son públicos para lectura, solo service_role escribe
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_posts' AND policyname='Public read social_posts') THEN
    CREATE POLICY "Public read social_posts" ON social_posts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_posts' AND policyname='Service role write social_posts') THEN
    CREATE POLICY "Service role write social_posts" ON social_posts FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

ALTER TABLE social_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_subscriptions' AND policyname='Service role manage social_subscriptions') THEN
    CREATE POLICY "Service role manage social_subscriptions" ON social_subscriptions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

ALTER TABLE social_digests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_digests' AND policyname='Service role manage social_digests') THEN
    CREATE POLICY "Service role manage social_digests" ON social_digests FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

ALTER TABLE social_moderation_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_moderation_log' AND policyname='Service role manage social_moderation_log') THEN
    CREATE POLICY "Service role manage social_moderation_log" ON social_moderation_log FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
