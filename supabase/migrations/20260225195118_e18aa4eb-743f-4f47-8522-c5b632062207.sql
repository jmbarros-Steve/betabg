-- Add content_blocks column to email_templates for block-based editing
ALTER TABLE public.email_templates 
ADD COLUMN IF NOT EXISTS content_blocks jsonb DEFAULT '[]'::jsonb;