-- ============================================================================
-- STEVE ADS - Database Schema Export
-- Generated: 2026-02-26
-- Platform: Supabase (PostgreSQL)
-- ============================================================================

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.platform_type AS ENUM ('meta', 'google_ads', 'shopify', 'klaviyo');

-- ============================================================================
-- 1. CLIENTS (tabla central)
-- ============================================================================
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,                    -- owner/admin user
  client_user_id UUID,                      -- the client's own auth user
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  shop_domain TEXT,
  logo_url TEXT,
  website_url TEXT,
  fase_negocio TEXT,
  presupuesto_ads BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_client_user_id ON public.clients (client_user_id);
CREATE INDEX idx_clients_shop_domain ON public.clients (shop_domain);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create their own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own clients" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Clients can view their own client record" ON public.clients FOR SELECT USING (auth.uid() = client_user_id);
CREATE POLICY "Shopify users view own client record" ON public.clients FOR SELECT USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Users can update their own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own clients" ON public.clients FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Super admins view all clients" ON public.clients FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins update all clients" ON public.clients FOR UPDATE USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 2. USER_ROLES
-- ============================================================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  is_super_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Only admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- 3. BUYER_PERSONAS
-- ============================================================================
CREATE TABLE public.buyer_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  persona_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.buyer_personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own buyer persona" ON public.buyer_personas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own buyer persona" ON public.buyer_personas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own buyer persona" ON public.buyer_personas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own buyer persona" ON public.buyer_personas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all buyer personas" ON public.buyer_personas FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 4. PLATFORM_CONNECTIONS
-- ============================================================================
CREATE TABLE public.platform_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  platform public.platform_type NOT NULL,
  account_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  api_key_encrypted TEXT,
  shop_domain TEXT,
  store_name TEXT,
  store_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Legacy clients view own connections" ON public.platform_connections FOR SELECT
  USING (shop_domain IS NULL AND client_id IN (SELECT clients.id FROM clients WHERE clients.client_user_id = auth.uid() OR clients.user_id = auth.uid()));
CREATE POLICY "Shopify users access own shop connections" ON public.platform_connections FOR SELECT
  USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Super admins view all connections" ON public.platform_connections FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "Insert connections with valid shop" ON public.platform_connections FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid())));
CREATE POLICY "Update own shop connections" ON public.platform_connections FOR UPDATE
  USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid())));
CREATE POLICY "Delete own shop connections" ON public.platform_connections FOR DELETE
  USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid())));

-- ============================================================================
-- 5. CLIENT_CREDITS
-- ============================================================================
CREATE TABLE public.client_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id),
  creditos_disponibles INTEGER NOT NULL DEFAULT 99999,
  creditos_usados INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL DEFAULT 'free_beta'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own credits" ON public.client_credits FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_credits.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own credits" ON public.client_credits FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_credits.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own credits" ON public.client_credits FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_credits.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all client credits" ON public.client_credits FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 6. CLIENT_FINANCIAL_CONFIG
-- ============================================================================
CREATE TABLE public.client_financial_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE,
  default_margin_percentage NUMERIC NOT NULL DEFAULT 30,
  use_shopify_costs BOOLEAN NOT NULL DEFAULT false,
  shopify_plan_cost NUMERIC NOT NULL DEFAULT 0,
  klaviyo_plan_cost NUMERIC NOT NULL DEFAULT 0,
  other_fixed_costs NUMERIC NOT NULL DEFAULT 0,
  other_fixed_costs_description TEXT,
  payment_gateway_commission NUMERIC NOT NULL DEFAULT 3.5,
  product_margins JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_financial_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own financial config" ON public.client_financial_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_financial_config.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own financial config" ON public.client_financial_config FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_financial_config.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own financial config" ON public.client_financial_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_financial_config.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));

-- ============================================================================
-- 7. BRAND_RESEARCH
-- ============================================================================
CREATE TABLE public.brand_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  research_type TEXT NOT NULL,
  research_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, research_type)
);

ALTER TABLE public.brand_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own research" ON public.brand_research FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = brand_research.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own research" ON public.brand_research FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = brand_research.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own research" ON public.brand_research FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = brand_research.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins can manage all research" ON public.brand_research FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 8. AD_CREATIVES
-- ============================================================================
CREATE TABLE public.ad_creatives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  funnel TEXT NOT NULL,
  formato TEXT NOT NULL,
  angulo TEXT NOT NULL,
  titulo TEXT,
  texto_principal TEXT,
  descripcion TEXT,
  cta TEXT,
  brief_visual JSONB,
  prompt_generacion TEXT,
  foto_base_url TEXT,
  asset_url TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador'::text,
  custom_instructions TEXT,
  prediction_id TEXT,
  dct_copies JSONB,
  dct_titulos JSONB,
  dct_descripciones JSONB,
  dct_briefs JSONB,
  dct_imagenes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own ad creatives" ON public.ad_creatives FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own ad creatives" ON public.ad_creatives FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own ad creatives" ON public.ad_creatives FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own ad creatives" ON public.ad_creatives FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all ad creatives" ON public.ad_creatives FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 9. AD_ASSETS
-- ============================================================================
CREATE TABLE public.ad_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creative_id UUID REFERENCES public.ad_creatives(id),
  client_id UUID REFERENCES public.clients(id),
  asset_url TEXT,
  tipo TEXT DEFAULT 'imagen'::text,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ad_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own ad assets" ON public.ad_assets FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own ad assets" ON public.ad_assets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all ad assets" ON public.ad_assets FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 10. SAVED_META_COPIES
-- ============================================================================
CREATE TABLE public.saved_meta_copies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  funnel_stage TEXT NOT NULL,
  ad_type TEXT NOT NULL,
  headlines TEXT[] NOT NULL DEFAULT '{}'::text[],
  primary_texts TEXT[] NOT NULL DEFAULT '{}'::text[],
  descriptions TEXT[] NOT NULL DEFAULT '{}'::text[],
  video_hooks TEXT[],
  video_scripts TEXT[],
  has_script BOOLEAN NOT NULL DEFAULT false,
  custom_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_meta_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own saved copies" ON public.saved_meta_copies FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = saved_meta_copies.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own saved copies" ON public.saved_meta_copies FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = saved_meta_copies.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own saved copies" ON public.saved_meta_copies FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = saved_meta_copies.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));

-- ============================================================================
-- 11. SAVED_GOOGLE_COPIES
-- ============================================================================
CREATE TABLE public.saved_google_copies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  campaign_type TEXT NOT NULL,
  headlines TEXT[] NOT NULL,
  long_headlines TEXT[],
  descriptions TEXT[] NOT NULL,
  sitelinks JSONB,
  custom_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_google_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their client's google copies" ON public.saved_google_copies FOR SELECT
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Users can insert their client's google copies" ON public.saved_google_copies FOR INSERT
  WITH CHECK (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Users can delete their client's google copies" ON public.saved_google_copies FOR DELETE
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- ============================================================================
-- 12. EMAIL_TEMPLATES
-- ============================================================================
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  name TEXT NOT NULL,
  description TEXT,
  primary_color TEXT DEFAULT '#000000'::text,
  secondary_color TEXT DEFAULT '#ffffff'::text,
  accent_color TEXT DEFAULT '#4F46E5'::text,
  button_color TEXT DEFAULT '#000000'::text,
  button_text_color TEXT DEFAULT '#ffffff'::text,
  font_family TEXT DEFAULT 'Arial, sans-serif'::text,
  logo_url TEXT,
  header_html TEXT,
  footer_html TEXT,
  base_html TEXT,
  content_blocks JSONB DEFAULT '[]'::jsonb,
  assets JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own email templates" ON public.email_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_templates.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own email templates" ON public.email_templates FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_templates.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own email templates" ON public.email_templates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_templates.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own email templates" ON public.email_templates FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_templates.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all email templates" ON public.email_templates FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 13. EMAIL_CAMPAIGNS
-- ============================================================================
CREATE TABLE public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  template_id UUID REFERENCES public.email_templates(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  content_blocks JSONB DEFAULT '[]'::jsonb,
  final_html TEXT,
  klaviyo_campaign_id TEXT,
  klaviyo_list_id TEXT,
  klaviyo_segment_id TEXT,
  status TEXT DEFAULT 'draft'::text,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own email campaigns" ON public.email_campaigns FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_campaigns.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own email campaigns" ON public.email_campaigns FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_campaigns.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own email campaigns" ON public.email_campaigns FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_campaigns.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own email campaigns" ON public.email_campaigns FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = email_campaigns.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all email campaigns" ON public.email_campaigns FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 14. KLAVIYO_EMAIL_PLANS
-- ============================================================================
CREATE TABLE public.klaviyo_email_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  flow_type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'::text,
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  campaign_subject TEXT,
  campaign_date TIMESTAMPTZ,
  client_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.klaviyo_email_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own email plans" ON public.klaviyo_email_plans FOR SELECT
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can create their own email plans" ON public.klaviyo_email_plans FOR INSERT
  WITH CHECK (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can update their own email plans" ON public.klaviyo_email_plans FOR UPDATE
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can delete their own email plans" ON public.klaviyo_email_plans FOR DELETE
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- 15. CAMPAIGN_METRICS
-- ============================================================================
CREATE TABLE public.campaign_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id),
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  metric_date DATE NOT NULL,
  impressions NUMERIC DEFAULT 0,
  clicks NUMERIC DEFAULT 0,
  spend NUMERIC DEFAULT 0,
  conversions NUMERIC DEFAULT 0,
  conversion_value NUMERIC DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  cpc NUMERIC DEFAULT 0,
  cpm NUMERIC DEFAULT 0,
  roas NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD'::text,
  shop_domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, campaign_id, metric_date)
);

CREATE INDEX idx_campaign_metrics_connection_date ON public.campaign_metrics (connection_id, metric_date);
CREATE INDEX idx_campaign_metrics_campaign ON public.campaign_metrics (campaign_id);
CREATE INDEX idx_campaign_metrics_shop_domain ON public.campaign_metrics (shop_domain);

ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view all campaign metrics" ON public.campaign_metrics FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "Shopify users view own campaign metrics" ON public.campaign_metrics FOR SELECT
  USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Legacy clients view own campaign metrics" ON public.campaign_metrics FOR SELECT
  USING (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()));
CREATE POLICY "Insert campaign metrics with valid shop" ON public.campaign_metrics FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Update own campaign metrics" ON public.campaign_metrics FOR UPDATE
  USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Delete own campaign metrics" ON public.campaign_metrics FOR DELETE
  USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));

-- ============================================================================
-- 16. COMPETITOR_TRACKING
-- ============================================================================
CREATE TABLE public.competitor_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  ig_handle TEXT NOT NULL,
  meta_page_id TEXT,
  display_name TEXT,
  profile_pic_url TEXT,
  store_url TEXT,
  deep_dive_data JSONB,
  last_deep_dive_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, ig_handle)
);

CREATE INDEX idx_competitor_tracking_client ON public.competitor_tracking (client_id);

ALTER TABLE public.competitor_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own competitor tracking" ON public.competitor_tracking FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own competitor tracking" ON public.competitor_tracking FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own competitor tracking" ON public.competitor_tracking FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own competitor tracking" ON public.competitor_tracking FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all competitor tracking" ON public.competitor_tracking FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 17. COMPETITOR_ADS
-- ============================================================================
CREATE TABLE public.competitor_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_id UUID NOT NULL REFERENCES public.competitor_tracking(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  ad_library_id TEXT NOT NULL,
  ad_text TEXT,
  ad_headline TEXT,
  ad_description TEXT,
  image_url TEXT,
  video_url TEXT,
  ad_type TEXT,
  cta_type TEXT,
  started_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  days_running INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tracking_id, ad_library_id)
);

CREATE INDEX idx_competitor_ads_tracking ON public.competitor_ads (tracking_id);
CREATE INDEX idx_competitor_ads_client ON public.competitor_ads (client_id);
CREATE INDEX idx_competitor_ads_days ON public.competitor_ads (days_running DESC NULLS LAST);

ALTER TABLE public.competitor_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own competitor ads" ON public.competitor_ads FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_ads.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own competitor ads" ON public.competitor_ads FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_ads.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own competitor ads" ON public.competitor_ads FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_ads.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all competitor ads" ON public.competitor_ads FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- 18. STEVE_CONVERSATIONS
-- ============================================================================
CREATE TABLE public.steve_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.steve_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own conversations" ON public.steve_conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = steve_conversations.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can create their own conversations" ON public.steve_conversations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = steve_conversations.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own conversations" ON public.steve_conversations FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = steve_conversations.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));

-- ============================================================================
-- 19. STEVE_MESSAGES
-- ============================================================================
CREATE TABLE public.steve_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.steve_conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.steve_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own messages" ON public.steve_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM steve_conversations conv JOIN clients c ON c.id = conv.client_id WHERE conv.id = steve_messages.conversation_id AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own messages" ON public.steve_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM steve_conversations conv JOIN clients c ON c.id = conv.client_id WHERE conv.id = steve_messages.conversation_id AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())));
CREATE POLICY "Clients can delete their own messages" ON public.steve_messages FOR DELETE
  USING (EXISTS (SELECT 1 FROM steve_conversations conv JOIN clients c ON c.id = conv.client_id WHERE conv.id = steve_messages.conversation_id AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())));

-- ============================================================================
-- 20. STEVE_FEEDBACK
-- ============================================================================
CREATE TABLE public.steve_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  content_type TEXT NOT NULL,
  content_id UUID,
  rating INTEGER,
  feedback_text TEXT,
  improvement_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.steve_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their client's feedback" ON public.steve_feedback FOR SELECT
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Users can insert their client's feedback" ON public.steve_feedback FOR INSERT
  WITH CHECK (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- ============================================================================
-- 21. STEVE_TRAINING_EXAMPLES
-- ============================================================================
CREATE TABLE public.steve_training_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  scenario_description TEXT NOT NULL,
  correct_analysis TEXT NOT NULL,
  incorrect_analysis TEXT,
  campaign_metrics JSONB,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.steve_training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view training examples" ON public.steve_training_examples FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert training examples" ON public.steve_training_examples FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update training examples" ON public.steve_training_examples FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete training examples" ON public.steve_training_examples FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- 22. STEVE_TRAINING_FEEDBACK
-- ============================================================================
CREATE TABLE public.steve_training_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  original_recommendation TEXT NOT NULL,
  feedback_rating TEXT NOT NULL,
  feedback_notes TEXT,
  improved_recommendation TEXT,
  recommendation_id UUID REFERENCES public.campaign_recommendations(id),
  campaign_metrics JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.steve_training_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all training feedback" ON public.steve_training_feedback FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert training feedback" ON public.steve_training_feedback FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update training feedback" ON public.steve_training_feedback FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete training feedback" ON public.steve_training_feedback FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================================
-- 23. STEVE_BUGS
-- ============================================================================
CREATE TABLE public.steve_bugs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  ejemplo_malo TEXT,
  ejemplo_bueno TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.steve_bugs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active bugs" ON public.steve_bugs FOR SELECT USING (activo = true);
CREATE POLICY "Super admins manage all bugs" ON public.steve_bugs FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- STEVE_KNOWLEDGE (bonus - usado por Steve chat)
-- ============================================================================
CREATE TABLE public.steve_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,
  source_id UUID REFERENCES public.learning_queue(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.steve_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active knowledge" ON public.steve_knowledge FOR SELECT USING (activo = true);
CREATE POLICY "Super admins manage all knowledge" ON public.steve_knowledge FOR ALL USING (is_super_admin(auth.uid()));

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin' AND is_super_admin = TRUE)
$$;

CREATE OR REPLACE FUNCTION public.is_shopify_user(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE (c.client_user_id = _user_id OR c.user_id = _user_id) AND c.shop_domain IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION public.can_access_shop(_user_id UUID, _shop_domain TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients c WHERE (c.client_user_id = _user_id OR c.user_id = _user_id) AND c.shop_domain = _shop_domain AND c.shop_domain IS NOT NULL)
$$;

CREATE OR REPLACE FUNCTION public.get_user_shop_domain(_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.shop_domain FROM public.clients c WHERE c.client_user_id = _user_id OR c.user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  user_name text;
  user_email text;
BEGIN
  user_email := NEW.email;
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(user_email, '@', 1));
  INSERT INTO public.clients (user_id, client_user_id, name, email) VALUES (NEW.id, NEW.id, user_name, user_email) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, is_super_admin) VALUES (NEW.id, 'client', false) ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  encryption_key text;
  encrypted_bytes bytea;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN RETURN NULL; END IF;
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN encryption_key := md5('platform_tokens_secret_key_2024'); END IF;
  encrypted_bytes := extensions.pgp_sym_encrypt(raw_token, encryption_key);
  RETURN encode(encrypted_bytes, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  encryption_key text;
  decrypted_text text;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN RETURN NULL; END IF;
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN encryption_key := md5('platform_tokens_secret_key_2024'); END IF;
  decrypted_text := extensions.pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  RETURN decrypted_text;
END;
$$;

-- ============================================================================
-- TRIGGER: handle_new_user on auth.users
-- ============================================================================
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- (Note: This trigger is on auth.users which is managed by Supabase)
