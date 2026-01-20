-- Create enum for platform types
CREATE TYPE public.platform_type AS ENUM ('shopify', 'meta', 'google');

-- Create table to store platform connections for clients
CREATE TABLE public.platform_connections (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    store_name TEXT, -- For Shopify
    store_url TEXT, -- Shopify store URL
    access_token TEXT, -- Encrypted API token
    refresh_token TEXT, -- For OAuth refresh
    api_key TEXT, -- For platforms that use API keys
    account_id TEXT, -- Meta Ad Account ID or Google Account ID
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(client_id, platform)
);

-- Enable RLS
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

-- Only the owner (consultant) can manage connections
CREATE POLICY "Users can view their clients connections"
ON public.platform_connections
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create connections for their clients"
ON public.platform_connections
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their clients connections"
ON public.platform_connections
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete their clients connections"
ON public.platform_connections
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.clients 
        WHERE clients.id = platform_connections.client_id 
        AND clients.user_id = auth.uid()
    )
);

-- Create table to store synced metrics/KPIs
CREATE TABLE public.platform_metrics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_type TEXT NOT NULL, -- 'revenue', 'orders', 'sessions', 'ad_spend', 'impressions', 'clicks', 'roas'
    metric_value NUMERIC NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(connection_id, metric_date, metric_type)
);

-- Enable RLS
ALTER TABLE public.platform_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view metrics for their clients
CREATE POLICY "Users can view their clients metrics"
ON public.platform_metrics
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.platform_connections pc
        JOIN public.clients c ON c.id = pc.client_id
        WHERE pc.id = platform_metrics.connection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert metrics for their clients"
ON public.platform_metrics
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.platform_connections pc
        JOIN public.clients c ON c.id = pc.client_id
        WHERE pc.id = platform_metrics.connection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update metrics for their clients"
ON public.platform_metrics
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.platform_connections pc
        JOIN public.clients c ON c.id = pc.client_id
        WHERE pc.id = platform_metrics.connection_id 
        AND c.user_id = auth.uid()
    )
);

-- Add trigger for updated_at
CREATE TRIGGER update_platform_connections_updated_at
BEFORE UPDATE ON public.platform_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();