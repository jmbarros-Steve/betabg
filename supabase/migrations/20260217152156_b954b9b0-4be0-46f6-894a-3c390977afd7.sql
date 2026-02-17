
-- Table: competitor_tracking (los handles de IG que el cliente quiere seguir)
CREATE TABLE public.competitor_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ig_handle TEXT NOT NULL,
  meta_page_id TEXT, -- Se resuelve una sola vez desde el handle
  display_name TEXT,
  profile_pic_url TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, ig_handle)
);

-- Table: competitor_ads (anuncios extraídos de Meta Ad Library)
CREATE TABLE public.competitor_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_id UUID NOT NULL REFERENCES public.competitor_tracking(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ad_library_id TEXT NOT NULL, -- ID único del anuncio en Meta Ad Library
  ad_text TEXT,
  ad_headline TEXT,
  ad_description TEXT,
  image_url TEXT,
  video_url TEXT,
  ad_type TEXT, -- 'image', 'video', 'carousel'
  cta_type TEXT, -- 'SHOP_NOW', 'LEARN_MORE', etc.
  started_at TIMESTAMP WITH TIME ZONE, -- Fecha inicio del anuncio
  is_active BOOLEAN NOT NULL DEFAULT true, -- Si sigue activo en Ad Library
  days_running INTEGER, -- Calculado: cuántos días lleva activo (los ganadores)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tracking_id, ad_library_id)
);

-- Indexes for performance
CREATE INDEX idx_competitor_tracking_client ON public.competitor_tracking(client_id);
CREATE INDEX idx_competitor_ads_tracking ON public.competitor_ads(tracking_id);
CREATE INDEX idx_competitor_ads_client ON public.competitor_ads(client_id);
CREATE INDEX idx_competitor_ads_days ON public.competitor_ads(days_running DESC NULLS LAST);

-- RLS
ALTER TABLE public.competitor_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_ads ENABLE ROW LEVEL SECURITY;

-- Policies: competitor_tracking
CREATE POLICY "Clients can view their own competitor tracking"
  ON public.competitor_tracking FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own competitor tracking"
  ON public.competitor_tracking FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own competitor tracking"
  ON public.competitor_tracking FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own competitor tracking"
  ON public.competitor_tracking FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_tracking.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all competitor tracking"
  ON public.competitor_tracking FOR ALL
  USING (is_super_admin(auth.uid()));

-- Policies: competitor_ads
CREATE POLICY "Clients can view their own competitor ads"
  ON public.competitor_ads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_ads.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own competitor ads"
  ON public.competitor_ads FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_ads.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own competitor ads"
  ON public.competitor_ads FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = competitor_ads.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all competitor ads"
  ON public.competitor_ads FOR ALL
  USING (is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_competitor_tracking_updated_at
  BEFORE UPDATE ON public.competitor_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_competitor_ads_updated_at
  BEFORE UPDATE ON public.competitor_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
