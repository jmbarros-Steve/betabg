
-- Storage bucket for client brand assets
INSERT INTO storage.buckets (id, name, public) VALUES ('client-assets', 'client-assets', true);

-- RLS for storage: clients can upload to their own folder
CREATE POLICY "Clients can upload their own assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-assets' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients can view their own assets"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'client-assets' 
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR (SELECT is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Clients can delete their own assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'client-assets' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public can view client assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-assets');

-- Table for brand research data (competitor analysis, SEO, ads library, keywords)
CREATE TABLE public.brand_research (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  research_type TEXT NOT NULL, -- 'competitor_analysis', 'seo_audit', 'ads_library', 'keywords'
  research_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id, research_type)
);

ALTER TABLE public.brand_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own research"
ON public.brand_research FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients 
  WHERE clients.id = brand_research.client_id 
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

CREATE POLICY "Clients can insert their own research"
ON public.brand_research FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients 
  WHERE clients.id = brand_research.client_id 
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

CREATE POLICY "Clients can update their own research"
ON public.brand_research FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM clients 
  WHERE clients.id = brand_research.client_id 
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

CREATE POLICY "Super admins can manage all research"
ON public.brand_research FOR ALL
USING (is_super_admin(auth.uid()));

-- Add logo_url and website_url to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Trigger for updated_at
CREATE TRIGGER update_brand_research_updated_at
BEFORE UPDATE ON public.brand_research
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
