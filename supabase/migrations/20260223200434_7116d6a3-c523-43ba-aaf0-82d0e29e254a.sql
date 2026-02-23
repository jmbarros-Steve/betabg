-- Create ad_references table
CREATE TABLE public.ad_references (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id),
  angulo text NOT NULL,
  image_url text NOT NULL,
  visual_patterns jsonb,
  copy_patterns jsonb,
  quality_score integer DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_references ENABLE ROW LEVEL SECURITY;

-- Super admins full access
CREATE POLICY "Super admins manage all ad references"
ON public.ad_references FOR ALL
USING (is_super_admin(auth.uid()));

-- Clients can view their own references
CREATE POLICY "Clients can view their own ad references"
ON public.ad_references FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = ad_references.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Clients can insert their own references
CREATE POLICY "Clients can insert their own ad references"
ON public.ad_references FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = ad_references.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Create ad-references storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-references', 'ad-references', true);

-- Storage policies for ad-references bucket
CREATE POLICY "Anyone can view ad references"
ON storage.objects FOR SELECT
USING (bucket_id = 'ad-references');

CREATE POLICY "Authenticated users can upload ad references"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ad-references' AND auth.role() = 'authenticated');

-- Index for fast lookups by angle + quality
CREATE INDEX idx_ad_references_angulo_quality ON public.ad_references (angulo, quality_score DESC);