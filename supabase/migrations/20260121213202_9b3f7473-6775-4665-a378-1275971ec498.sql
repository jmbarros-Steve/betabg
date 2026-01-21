-- Create table for campaign-level metrics
CREATE TABLE public.campaign_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
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
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(connection_id, campaign_id, metric_date)
);

-- Create table for AI recommendations per campaign
CREATE TABLE public.campaign_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  recommendation_type TEXT NOT NULL,
  recommendation_text TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recommendations ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_metrics
CREATE POLICY "Users can view their clients campaign metrics"
ON public.campaign_metrics FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can insert campaign metrics for their clients"
ON public.campaign_metrics FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can update campaign metrics for their clients"
ON public.campaign_metrics FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can delete campaign metrics for their clients"
ON public.campaign_metrics FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_metrics.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

-- RLS policies for campaign_recommendations
CREATE POLICY "Users can view their clients campaign recommendations"
ON public.campaign_recommendations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can insert campaign recommendations for their clients"
ON public.campaign_recommendations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can update campaign recommendations for their clients"
ON public.campaign_recommendations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

CREATE POLICY "Users can delete campaign recommendations for their clients"
ON public.campaign_recommendations FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM platform_connections pc
    JOIN clients c ON c.id = pc.client_id
    WHERE pc.id = campaign_recommendations.connection_id
    AND (c.user_id = auth.uid() OR c.client_user_id = auth.uid())
  )
);

-- Add indexes for performance
CREATE INDEX idx_campaign_metrics_connection_date ON public.campaign_metrics(connection_id, metric_date);
CREATE INDEX idx_campaign_metrics_campaign ON public.campaign_metrics(campaign_id);
CREATE INDEX idx_campaign_recommendations_campaign ON public.campaign_recommendations(campaign_id);

-- Add trigger for updated_at
CREATE TRIGGER update_campaign_metrics_updated_at
BEFORE UPDATE ON public.campaign_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();