-- Campaign Studio: brand identity, campaign types, and monthly plans

-- Add brand_identity to clients
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS brand_identity jsonb DEFAULT '{}'::jsonb;

-- Add campaign studio fields to email_campaigns
ALTER TABLE public.email_campaigns
ADD COLUMN IF NOT EXISTS campaign_type text DEFAULT 'custom',
ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS product_data jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS month_plan_id uuid;

-- Monthly campaign plans
CREATE TABLE IF NOT EXISTS public.campaign_month_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2024 AND 2030),
  status text DEFAULT 'draft',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, month, year)
);

ALTER TABLE public.campaign_month_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own month plans"
  ON public.campaign_month_plans FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()));

CREATE POLICY "Users can insert own month plans"
  ON public.campaign_month_plans FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()));

CREATE POLICY "Users can update own month plans"
  ON public.campaign_month_plans FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()));

CREATE POLICY "Users can delete own month plans"
  ON public.campaign_month_plans FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid() OR client_user_id = auth.uid()));

-- Admin policies
CREATE POLICY "Admins can manage month plans"
  ON public.campaign_month_plans FOR ALL
  USING (
    EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' IN ('admin', 'super_admin'))
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_campaign_month_plans_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_month_plans_updated_at
  BEFORE UPDATE ON public.campaign_month_plans
  FOR EACH ROW EXECUTE FUNCTION update_campaign_month_plans_updated_at();

-- Pre-populate Jardin de Eva brand identity
UPDATE public.clients
SET brand_identity = '{
  "colors": {
    "primary": "#193a43",
    "accent": "#ff5b00",
    "secondaryBg": "#ffece1",
    "footerBg": "#f4f4f8",
    "border": "#e0e6f4",
    "text": "#193a43",
    "textLight": "#6b7280"
  },
  "fonts": {
    "heading": "Kaisei Tokumin",
    "headingType": "serif",
    "body": "Anonymous Pro",
    "bodyType": "monospace"
  },
  "buttons": {
    "borderRadius": 24,
    "height": 48,
    "style": "pill"
  },
  "aesthetic": "Modern Botanical Artisan",
  "logoUrl": "",
  "shopUrl": "https://jardindeeva.cl"
}'::jsonb
WHERE name ILIKE '%jardin%eva%' OR shop_domain ILIKE '%jardindeeva%';
