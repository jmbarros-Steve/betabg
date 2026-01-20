-- Create table for saved meta copies
CREATE TABLE public.saved_meta_copies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  funnel_stage TEXT NOT NULL,
  ad_type TEXT NOT NULL,
  has_script BOOLEAN NOT NULL DEFAULT false,
  headlines TEXT[] NOT NULL DEFAULT '{}',
  primary_texts TEXT[] NOT NULL DEFAULT '{}',
  descriptions TEXT[] NOT NULL DEFAULT '{}',
  video_hooks TEXT[],
  video_scripts TEXT[],
  custom_instructions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.saved_meta_copies ENABLE ROW LEVEL SECURITY;

-- Clients can view their own saved copies
CREATE POLICY "Clients can view their own saved copies"
ON public.saved_meta_copies
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = saved_meta_copies.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Clients can insert their own saved copies
CREATE POLICY "Clients can insert their own saved copies"
ON public.saved_meta_copies
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = saved_meta_copies.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Clients can delete their own saved copies
CREATE POLICY "Clients can delete their own saved copies"
ON public.saved_meta_copies
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = saved_meta_copies.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Create index for faster queries
CREATE INDEX idx_saved_meta_copies_client_id ON public.saved_meta_copies(client_id);
CREATE INDEX idx_saved_meta_copies_created_at ON public.saved_meta_copies(created_at DESC);