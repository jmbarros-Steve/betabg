-- Facebook scheduled posts table (mirrors instagram_scheduled_posts)
CREATE TABLE IF NOT EXISTS public.facebook_scheduled_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.platform_connections(id),
  page_id TEXT,

  -- Content
  media_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (media_type IN ('TEXT', 'PHOTO', 'VIDEO', 'LINK')),
  message TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  video_url TEXT,
  link_url TEXT,

  -- Scheduling
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  -- Facebook API IDs
  post_id TEXT,
  permalink TEXT,

  -- AI generation metadata
  ai_generated BOOLEAN DEFAULT false,

  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_posts_client ON public.facebook_scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_fb_posts_status ON public.facebook_scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_fb_posts_scheduled ON public.facebook_scheduled_posts(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.facebook_scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own facebook posts" ON public.facebook_scheduled_posts
  FOR SELECT USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own facebook posts" ON public.facebook_scheduled_posts
  FOR INSERT WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients
      WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own facebook posts" ON public.facebook_scheduled_posts
  FOR UPDATE USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE user_id = auth.uid() OR client_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access fb posts" ON public.facebook_scheduled_posts
  FOR ALL USING (auth.role() = 'service_role');
