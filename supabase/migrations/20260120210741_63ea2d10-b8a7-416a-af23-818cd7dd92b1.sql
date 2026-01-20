-- Create table to store Google Ads copies
CREATE TABLE public.saved_google_copies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL,
  headlines TEXT[] NOT NULL,
  long_headlines TEXT[],
  descriptions TEXT[] NOT NULL,
  sitelinks JSONB,
  custom_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_google_copies ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their client's google copies"
ON public.saved_google_copies FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert their client's google copies"
ON public.saved_google_copies FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can delete their client's google copies"
ON public.saved_google_copies FOR DELETE
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Create table for Steve feedback on generated content
CREATE TABLE public.steve_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL, -- 'meta_copy', 'google_copy', 'klaviyo_email'
  content_id UUID, -- Reference to the specific content
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  improvement_notes TEXT, -- Steve's notes on how to improve
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.steve_feedback ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their client's feedback"
ON public.steve_feedback FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert their client's feedback"
ON public.steve_feedback FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Add index for performance
CREATE INDEX idx_saved_google_copies_client ON public.saved_google_copies(client_id);
CREATE INDEX idx_steve_feedback_client ON public.steve_feedback(client_id);
CREATE INDEX idx_steve_feedback_content ON public.steve_feedback(content_type, content_id);