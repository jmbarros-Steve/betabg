-- Instagram scheduled posts table
CREATE TABLE IF NOT EXISTS public.instagram_scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.platform_connections(id),
  ig_user_id TEXT,

  -- Content
  media_type TEXT NOT NULL DEFAULT 'IMAGE' CHECK (media_type IN ('IMAGE', 'CAROUSEL', 'REELS')),
  image_url TEXT,
  image_urls TEXT[], -- for carousel (up to 10)
  video_url TEXT,   -- for reels
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',

  -- Scheduling
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  -- Instagram API IDs
  creation_id TEXT,       -- container ID from /media
  media_id TEXT,          -- published media ID from /media_publish
  permalink TEXT,         -- instagram.com/p/... URL

  -- AI generation metadata
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,

  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_posts_client ON public.instagram_scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_ig_posts_status ON public.instagram_scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_ig_posts_scheduled ON public.instagram_scheduled_posts(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.instagram_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own instagram posts" ON public.instagram_scheduled_posts
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own instagram posts" ON public.instagram_scheduled_posts
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients
      WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own instagram posts" ON public.instagram_scheduled_posts
  FOR UPDATE USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access ig posts" ON public.instagram_scheduled_posts
  FOR ALL USING (auth.role() = 'service_role');
