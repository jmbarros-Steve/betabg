-- ============================================================
-- BETABG FULL DATABASE EXPORT
-- Generated: 2026-02-21
-- Project: jnqivntlkemzcpomkvwv
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM TYPES (ENUMS)
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.platform_type AS ENUM ('shopify', 'meta', 'google', 'klaviyo');

-- 3. TABLES
-- ============================================================

CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  company text,
  hourly_rate numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  client_user_id uuid,
  shop_domain text,
  logo_url text,
  website_url text,
  fase_negocio text,
  presupuesto_ads bigint,
  PRIMARY KEY (id)
);

CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_super_admin boolean DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (user_id, role),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.platform_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  platform platform_type NOT NULL,
  store_name text,
  store_url text,
  account_id text,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  access_token_encrypted text,
  refresh_token_encrypted text,
  api_key_encrypted text,
  shop_domain text,
  PRIMARY KEY (id),
  UNIQUE (client_id, platform),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.ad_creatives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  funnel text NOT NULL,
  formato text NOT NULL,
  angulo text NOT NULL,
  titulo text,
  texto_principal text,
  descripcion text,
  cta text,
  brief_visual jsonb,
  prompt_generacion text,
  foto_base_url text,
  asset_url text,
  estado text NOT NULL DEFAULT 'borrador'::text,
  custom_instructions text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  prediction_id text,
  dct_copies jsonb,
  dct_titulos jsonb,
  dct_descripciones jsonb,
  dct_briefs jsonb,
  dct_imagenes jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE public.ad_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  creative_id uuid,
  client_id uuid,
  asset_url text,
  tipo text DEFAULT 'imagen'::text,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (creative_id) REFERENCES ad_creatives(id) ON DELETE CASCADE
);

CREATE TABLE public.blog_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  excerpt text,
  content text,
  category text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.brand_research (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  research_type text NOT NULL,
  research_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (client_id, research_type),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.buyer_personas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  persona_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_complete boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (client_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.campaign_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  platform text NOT NULL,
  metric_date date NOT NULL,
  impressions numeric DEFAULT 0,
  clicks numeric DEFAULT 0,
  spend numeric DEFAULT 0,
  conversions numeric DEFAULT 0,
  conversion_value numeric DEFAULT 0,
  ctr numeric DEFAULT 0,
  cpc numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  roas numeric DEFAULT 0,
  currency text DEFAULT 'USD'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  shop_domain text,
  PRIMARY KEY (id),
  UNIQUE (connection_id, campaign_id, metric_date),
  FOREIGN KEY (connection_id) REFERENCES platform_connections(id) ON DELETE CASCADE
);

CREATE TABLE public.campaign_recommendations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  connection_id uuid NOT NULL,
  platform text NOT NULL,
  recommendation_type text NOT NULL,
  recommendation_text text NOT NULL,
  priority text DEFAULT 'medium'::text,
  is_dismissed boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  shop_domain text,
  PRIMARY KEY (id),
  FOREIGN KEY (connection_id) REFERENCES platform_connections(id) ON DELETE CASCADE
);

CREATE TABLE public.client_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  url text NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'producto'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.client_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  creditos_disponibles integer NOT NULL DEFAULT 99999,
  creditos_usados integer NOT NULL DEFAULT 0,
  plan text NOT NULL DEFAULT 'free_beta'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (client_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.client_financial_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  default_margin_percentage numeric NOT NULL DEFAULT 30,
  use_shopify_costs boolean NOT NULL DEFAULT false,
  shopify_plan_cost numeric NOT NULL DEFAULT 0,
  klaviyo_plan_cost numeric NOT NULL DEFAULT 0,
  other_fixed_costs numeric NOT NULL DEFAULT 0,
  other_fixed_costs_description text,
  payment_gateway_commission numeric NOT NULL DEFAULT 3.5,
  product_margins jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (client_id)
);

CREATE TABLE public.competitor_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  ig_handle text NOT NULL,
  meta_page_id text,
  display_name text,
  profile_pic_url text,
  last_sync_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deep_dive_data jsonb,
  store_url text,
  last_deep_dive_at timestamp with time zone,
  PRIMARY KEY (id),
  UNIQUE (client_id, ig_handle),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.competitor_ads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tracking_id uuid NOT NULL,
  client_id uuid NOT NULL,
  ad_library_id text NOT NULL,
  ad_text text,
  ad_headline text,
  ad_description text,
  image_url text,
  video_url text,
  ad_type text,
  cta_type text,
  started_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  days_running integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tracking_id, ad_library_id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (tracking_id) REFERENCES competitor_tracking(id) ON DELETE CASCADE
);

CREATE TABLE public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  accion text NOT NULL,
  creditos_usados integer NOT NULL DEFAULT 0,
  costo_real_usd numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  invoice_number text NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  total_hours numeric NOT NULL,
  total_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.klaviyo_email_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  flow_type text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  campaign_date timestamp with time zone,
  campaign_subject text,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_notes text,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.oauth_states (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nonce text NOT NULL,
  shop_domain text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  PRIMARY KEY (id),
  UNIQUE (nonce)
);

CREATE TABLE public.platform_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL,
  metric_date date NOT NULL,
  metric_type text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'USD'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  shop_domain text,
  PRIMARY KEY (id),
  UNIQUE (connection_id, metric_date, metric_type),
  FOREIGN KEY (connection_id) REFERENCES platform_connections(id) ON DELETE CASCADE
);

CREATE TABLE public.saved_google_copies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  campaign_type text NOT NULL,
  headlines text[] NOT NULL,
  long_headlines text[],
  descriptions text[] NOT NULL,
  sitelinks jsonb,
  custom_instructions text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.saved_meta_copies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  funnel_stage text NOT NULL,
  ad_type text NOT NULL,
  has_script boolean NOT NULL DEFAULT false,
  headlines text[] NOT NULL DEFAULT '{}'::text[],
  primary_texts text[] NOT NULL DEFAULT '{}'::text[],
  descriptions text[] NOT NULL DEFAULT '{}'::text[],
  video_hooks text[],
  video_scripts text[],
  custom_instructions text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.steve_bugs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  descripcion text NOT NULL,
  ejemplo_malo text,
  ejemplo_bueno text,
  activo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.steve_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.steve_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  content_type text NOT NULL,
  content_id uuid,
  rating integer,
  feedback_text text,
  improvement_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.steve_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  titulo text NOT NULL,
  contenido text NOT NULL,
  activo boolean DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.steve_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (conversation_id) REFERENCES steve_conversations(id) ON DELETE CASCADE
);

CREATE TABLE public.steve_training_examples (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  platform text NOT NULL,
  scenario_description text NOT NULL,
  campaign_metrics jsonb DEFAULT '{}'::jsonb,
  correct_analysis text NOT NULL,
  incorrect_analysis text,
  tags text[] DEFAULT '{}'::text[],
  is_active boolean DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.steve_training_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recommendation_id uuid,
  campaign_id text NOT NULL,
  platform text NOT NULL,
  recommendation_type text NOT NULL,
  original_recommendation text NOT NULL,
  feedback_rating text NOT NULL,
  feedback_notes text,
  improved_recommendation text,
  campaign_metrics jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (recommendation_id) REFERENCES campaign_recommendations(id) ON DELETE CASCADE
);

CREATE TABLE public.study_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  content text,
  resource_type text NOT NULL DEFAULT 'article'::text,
  duration text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  price_monthly numeric NOT NULL DEFAULT 0,
  credits_monthly integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (slug)
);

CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  description text NOT NULL,
  hours numeric NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  billed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE public.user_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  credits_used integer NOT NULL DEFAULT 0,
  credits_reset_at timestamp with time zone NOT NULL DEFAULT now(),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

-- Add FK for clients after auth.users reference
ALTER TABLE public.clients ADD CONSTRAINT clients_client_user_id_fkey 
  FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_shop(_user_id uuid, _shop_domain text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
      AND c.shop_domain = _shop_domain
      AND c.shop_domain IS NOT NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_platform_token(encrypted_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
  decrypted_text text;
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;
  decrypted_text := extensions.pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
  RETURN decrypted_text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_platform_token(raw_token text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  encryption_key text;
  encrypted_bytes bytea;
BEGIN
  IF raw_token IS NULL OR raw_token = '' THEN
    RETURN NULL;
  END IF;
  encryption_key := current_setting('app.settings.encryption_key', true);
  IF encryption_key IS NULL OR encryption_key = '' THEN
    encryption_key := md5('platform_tokens_secret_key_2024');
  END IF;
  encrypted_bytes := extensions.pgp_sym_encrypt(raw_token, encryption_key);
  RETURN encode(encrypted_bytes, 'base64');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_shop_domain(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.shop_domain
  FROM public.clients c
  WHERE c.client_user_id = _user_id
     OR c.user_id = _user_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_name text;
  user_email text;
BEGIN
  user_email := NEW.email;
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(user_email, '@', 1)
  );
  INSERT INTO public.clients (user_id, client_user_id, name, email)
  VALUES (NEW.id, NEW.id, user_name, user_email)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles (user_id, role, is_super_admin)
  VALUES (NEW.id, 'client', false)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_shopify_user(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE (c.client_user_id = _user_id OR c.user_id = _user_id)
      AND c.shop_domain IS NOT NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND is_super_admin = TRUE
  )
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- 5. TRIGGER: handle_new_user on auth.users
-- NOTE: You need to create this trigger manually in the new project:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE public.ad_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_financial_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.klaviyo_email_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_google_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_meta_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_training_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES
-- ============================================================

-- ad_assets
CREATE POLICY "Clients can insert their own ad assets" ON public.ad_assets FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own ad assets" ON public.ad_assets FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all ad assets" ON public.ad_assets FOR ALL USING (is_super_admin(auth.uid()));

-- ad_creatives
CREATE POLICY "Clients can delete their own ad creatives" ON public.ad_creatives FOR DELETE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own ad creatives" ON public.ad_creatives FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own ad creatives" ON public.ad_creatives FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own ad creatives" ON public.ad_creatives FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ad_creatives.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all ad creatives" ON public.ad_creatives FOR ALL USING (is_super_admin(auth.uid()));

-- blog_posts
CREATE POLICY "Owners can create blog posts" ON public.blog_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete their blog posts" ON public.blog_posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Owners can update their blog posts" ON public.blog_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owners can view all their blog posts" ON public.blog_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Public can view published blog posts for view" ON public.blog_posts FOR SELECT TO anon, authenticated USING (published = true);

-- brand_research
CREATE POLICY "Clients can insert their own research" ON public.brand_research FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = brand_research.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own research" ON public.brand_research FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = brand_research.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own research" ON public.brand_research FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = brand_research.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins can manage all research" ON public.brand_research FOR ALL USING (is_super_admin(auth.uid()));

-- buyer_personas
CREATE POLICY "Clients can insert their own buyer persona" ON public.buyer_personas FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own buyer persona" ON public.buyer_personas FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own buyer persona" ON public.buyer_personas FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = buyer_personas.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all buyer personas" ON public.buyer_personas FOR ALL USING (is_super_admin(auth.uid()));

-- campaign_metrics
CREATE POLICY "Delete own campaign metrics" ON public.campaign_metrics FOR DELETE TO authenticated USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Insert campaign metrics with valid shop" ON public.campaign_metrics FOR INSERT TO authenticated WITH CHECK (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Legacy clients view own campaign metrics" ON public.campaign_metrics FOR SELECT TO authenticated USING (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()));
CREATE POLICY "Shopify users view own campaign metrics" ON public.campaign_metrics FOR SELECT TO authenticated USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Super admins view all campaign metrics" ON public.campaign_metrics FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "Update own campaign metrics" ON public.campaign_metrics FOR UPDATE TO authenticated USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));

-- campaign_recommendations
CREATE POLICY "Delete own recommendations" ON public.campaign_recommendations FOR DELETE TO authenticated USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Insert recommendations with valid shop" ON public.campaign_recommendations FOR INSERT TO authenticated WITH CHECK (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Legacy clients view own recommendations" ON public.campaign_recommendations FOR SELECT TO authenticated USING (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()));
CREATE POLICY "Shopify users view own recommendations" ON public.campaign_recommendations FOR SELECT TO authenticated USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Super admins view all recommendations" ON public.campaign_recommendations FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "Update own recommendations" ON public.campaign_recommendations FOR UPDATE TO authenticated USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));

-- client_assets
CREATE POLICY "Clients can delete their own assets" ON public.client_assets FOR DELETE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own assets" ON public.client_assets FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own assets" ON public.client_assets FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own assets" ON public.client_assets FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_assets.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all assets" ON public.client_assets FOR ALL USING (is_super_admin(auth.uid()));

-- client_credits
CREATE POLICY "Clients can insert their own credits" ON public.client_credits FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_credits.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own credits" ON public.client_credits FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_credits.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own credits" ON public.client_credits FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_credits.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all client credits" ON public.client_credits FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins manage all credits" ON public.client_credits FOR ALL USING (is_super_admin(auth.uid()));

-- client_financial_config
CREATE POLICY "Clients can insert their own financial config" ON public.client_financial_config FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_financial_config.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own financial config" ON public.client_financial_config FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_financial_config.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own financial config" ON public.client_financial_config FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = client_financial_config.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));

-- clients
CREATE POLICY "Clients can view their own client record" ON public.clients FOR SELECT TO authenticated USING (auth.uid() = client_user_id);
CREATE POLICY "Shopify users view own client record" ON public.clients FOR SELECT TO authenticated USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Super admins update all clients" ON public.clients FOR UPDATE USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins view all clients" ON public.clients FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "Users can create their own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own clients" ON public.clients FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own clients" ON public.clients FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- competitor_ads
CREATE POLICY "Clients can insert their own competitor ads" ON public.competitor_ads FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_ads.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own competitor ads" ON public.competitor_ads FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_ads.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own competitor ads" ON public.competitor_ads FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_ads.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all competitor ads" ON public.competitor_ads FOR ALL USING (is_super_admin(auth.uid()));

-- competitor_tracking
CREATE POLICY "Clients can delete their own competitor tracking" ON public.competitor_tracking FOR DELETE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own competitor tracking" ON public.competitor_tracking FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can update their own competitor tracking" ON public.competitor_tracking FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own competitor tracking" ON public.competitor_tracking FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = competitor_tracking.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all competitor tracking" ON public.competitor_tracking FOR ALL USING (is_super_admin(auth.uid()));

-- credit_transactions
CREATE POLICY "Clients can insert their own transactions" ON public.credit_transactions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = credit_transactions.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own transactions" ON public.credit_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = credit_transactions.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all transactions" ON public.credit_transactions FOR ALL USING (is_super_admin(auth.uid()));

-- invoices
CREATE POLICY "Users can create their own invoices" ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own invoices" ON public.invoices FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own invoices" ON public.invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);

-- klaviyo_email_plans
CREATE POLICY "Clients can create their own email plans" ON public.klaviyo_email_plans FOR INSERT WITH CHECK (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can delete their own email plans" ON public.klaviyo_email_plans FOR DELETE USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can update their own email plans" ON public.klaviyo_email_plans FOR UPDATE USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Clients can view their own email plans" ON public.klaviyo_email_plans FOR SELECT USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- platform_connections (policies from context)
CREATE POLICY "Clients can view their own connections" ON public.platform_connections FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = platform_connections.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Super admins manage all connections" ON public.platform_connections FOR ALL USING (is_super_admin(auth.uid()));

-- platform_metrics
CREATE POLICY "Delete own shop metrics" ON public.platform_metrics FOR DELETE TO authenticated USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Insert metrics with valid shop" ON public.platform_metrics FOR INSERT TO authenticated WITH CHECK (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));
CREATE POLICY "Legacy clients view own metrics" ON public.platform_metrics FOR SELECT TO authenticated USING (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.client_user_id = auth.uid() OR c.user_id = auth.uid()));
CREATE POLICY "Shopify users view own shop metrics" ON public.platform_metrics FOR SELECT TO authenticated USING (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain));
CREATE POLICY "Super admins view all metrics" ON public.platform_metrics FOR SELECT TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "Update own shop metrics" ON public.platform_metrics FOR UPDATE TO authenticated USING (is_super_admin(auth.uid()) OR (shop_domain IS NOT NULL AND can_access_shop(auth.uid(), shop_domain)) OR (shop_domain IS NULL AND connection_id IN (SELECT pc.id FROM platform_connections pc JOIN clients c ON pc.client_id = c.id WHERE c.user_id = auth.uid())));

-- saved_google_copies
CREATE POLICY "Users can delete their client's google copies" ON public.saved_google_copies FOR DELETE USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Users can insert their client's google copies" ON public.saved_google_copies FOR INSERT WITH CHECK (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Users can view their client's google copies" ON public.saved_google_copies FOR SELECT USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- saved_meta_copies
CREATE POLICY "Clients can delete their own saved copies" ON public.saved_meta_copies FOR DELETE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = saved_meta_copies.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can insert their own saved copies" ON public.saved_meta_copies FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = saved_meta_copies.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own saved copies" ON public.saved_meta_copies FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = saved_meta_copies.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));

-- steve_bugs
CREATE POLICY "Authenticated users can view active bugs" ON public.steve_bugs FOR SELECT USING (activo = true);
CREATE POLICY "Super admins manage all bugs" ON public.steve_bugs FOR ALL USING (is_super_admin(auth.uid()));

-- steve_conversations
CREATE POLICY "Clients can create their own conversations" ON public.steve_conversations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = steve_conversations.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));
CREATE POLICY "Clients can view their own conversations" ON public.steve_conversations FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = steve_conversations.client_id AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())));

-- steve_feedback
CREATE POLICY "Users can insert their client's feedback" ON public.steve_feedback FOR INSERT WITH CHECK (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "Users can view their client's feedback" ON public.steve_feedback FOR SELECT USING (client_id IN (SELECT clients.id FROM clients WHERE clients.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- steve_knowledge
CREATE POLICY "Authenticated users can view active knowledge" ON public.steve_knowledge FOR SELECT USING (activo = true);
CREATE POLICY "Super admins manage all knowledge" ON public.steve_knowledge FOR ALL USING (is_super_admin(auth.uid()));

-- steve_messages
CREATE POLICY "Clients can insert their own messages" ON public.steve_messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM steve_conversations conv JOIN clients c ON c.id = conv.client_id WHERE conv.id = steve_messages.conversation_id AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())));
CREATE POLICY "Clients can view their own messages" ON public.steve_messages FOR SELECT USING (EXISTS (SELECT 1 FROM steve_conversations conv JOIN clients c ON c.id = conv.client_id WHERE conv.id = steve_messages.conversation_id AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())));

-- steve_training_examples
CREATE POLICY "Admins can delete training examples" ON public.steve_training_examples FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert training examples" ON public.steve_training_examples FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update training examples" ON public.steve_training_examples FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all training examples" ON public.steve_training_examples FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- steve_training_feedback
CREATE POLICY "Admins can delete training feedback" ON public.steve_training_feedback FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert training feedback" ON public.steve_training_feedback FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update training feedback" ON public.steve_training_feedback FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all training feedback" ON public.steve_training_feedback FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- study_resources
CREATE POLICY "Authenticated users can view published study resources" ON public.study_resources FOR SELECT USING (published = true);
CREATE POLICY "Owners can create study resources" ON public.study_resources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete their study resources" ON public.study_resources FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Owners can update their study resources" ON public.study_resources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owners can view all their study resources" ON public.study_resources FOR SELECT USING (auth.uid() = user_id);

-- subscription_plans
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT USING (is_active = true);

-- time_entries
CREATE POLICY "Users can create their own time entries" ON public.time_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own time entries" ON public.time_entries FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own time entries" ON public.time_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own time entries" ON public.time_entries FOR SELECT USING (auth.uid() = user_id);

-- user_roles
CREATE POLICY "Only admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- user_subscriptions
CREATE POLICY "Admins can manage all subscriptions" ON public.user_subscriptions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their own subscription" ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id);

-- 8. STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('client-assets', 'client-assets', true);

-- 9. VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.public_blog_posts AS
SELECT id, title, excerpt, content, category, published, created_at, updated_at
FROM public.blog_posts
WHERE published = true;

-- ============================================================
-- END OF EXPORT
-- ============================================================
