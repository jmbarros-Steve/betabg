
-- Email Templates table
CREATE TABLE public.email_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) NOT NULL,
  name text NOT NULL,
  description text,
  primary_color text DEFAULT '#000000',
  secondary_color text DEFAULT '#ffffff',
  accent_color text DEFAULT '#4F46E5',
  button_color text DEFAULT '#000000',
  button_text_color text DEFAULT '#ffffff',
  font_family text DEFAULT 'Arial, sans-serif',
  logo_url text,
  header_html text,
  footer_html text,
  assets jsonb DEFAULT '[]'::jsonb,
  base_html text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own email templates"
  ON public.email_templates FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_templates.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own email templates"
  ON public.email_templates FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_templates.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own email templates"
  ON public.email_templates FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_templates.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own email templates"
  ON public.email_templates FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_templates.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all email templates"
  ON public.email_templates FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Email Campaigns table
CREATE TABLE public.email_campaigns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) NOT NULL,
  template_id uuid REFERENCES public.email_templates(id),
  name text NOT NULL,
  subject text NOT NULL,
  preview_text text,
  content_blocks jsonb DEFAULT '[]'::jsonb,
  final_html text,
  klaviyo_campaign_id text,
  klaviyo_list_id text,
  klaviyo_segment_id text,
  scheduled_at timestamptz,
  status text DEFAULT 'draft',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own email campaigns"
  ON public.email_campaigns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_campaigns.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own email campaigns"
  ON public.email_campaigns FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_campaigns.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own email campaigns"
  ON public.email_campaigns FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_campaigns.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can delete their own email campaigns"
  ON public.email_campaigns FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = email_campaigns.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all email campaigns"
  ON public.email_campaigns FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for email assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Clients can upload email assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'email-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Email assets are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'email-assets');

CREATE POLICY "Clients can delete their email assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'email-assets' AND auth.role() = 'authenticated');
