
-- Table: client_assets (product photos, logos, lifestyle images per client)
CREATE TABLE IF NOT EXISTS public.client_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  url TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'producto', -- producto | lifestyle | logo | otro
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own assets"
  ON public.client_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own assets"
  ON public.client_assets FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own assets"
  ON public.client_assets FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own assets"
  ON public.client_assets FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_assets.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all assets"
  ON public.client_assets FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_client_assets_updated_at
  BEFORE UPDATE ON public.client_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: ad_creatives (generated ad copies + visual briefs per client)
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  funnel TEXT NOT NULL,       -- tofu | mofu | bofu
  formato TEXT NOT NULL,      -- static | video
  angulo TEXT NOT NULL,
  titulo TEXT,
  texto_principal TEXT,
  descripcion TEXT,
  cta TEXT,
  brief_visual JSONB,
  prompt_generacion TEXT,
  foto_base_url TEXT,
  asset_url TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador',  -- borrador | aprobado | en_pauta
  custom_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own ad creatives"
  ON public.ad_creatives FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own ad creatives"
  ON public.ad_creatives FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own ad creatives"
  ON public.ad_creatives FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own ad creatives"
  ON public.ad_creatives FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = ad_creatives.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all ad creatives"
  ON public.ad_creatives FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_ad_creatives_updated_at
  BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
