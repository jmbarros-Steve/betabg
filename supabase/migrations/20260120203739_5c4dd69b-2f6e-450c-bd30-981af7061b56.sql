-- Create table for Klaviyo email flow planning
CREATE TABLE public.klaviyo_email_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('welcome_series', 'abandoned_cart', 'customer_winback', 'campaign')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'implemented')),
  
  -- For campaigns
  campaign_date TIMESTAMP WITH TIME ZONE,
  campaign_subject TEXT,
  
  -- Email sequence (array of email definitions)
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Notes and feedback
  client_notes TEXT,
  admin_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.klaviyo_email_plans ENABLE ROW LEVEL SECURITY;

-- Clients can view and manage their own plans
CREATE POLICY "Clients can view their own email plans"
  ON public.klaviyo_email_plans FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clients can create their own email plans"
  ON public.klaviyo_email_plans FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clients can update their own email plans"
  ON public.klaviyo_email_plans FOR UPDATE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Clients can delete their own email plans"
  ON public.klaviyo_email_plans FOR DELETE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Trigger for updated_at
CREATE TRIGGER update_klaviyo_email_plans_updated_at
  BEFORE UPDATE ON public.klaviyo_email_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();