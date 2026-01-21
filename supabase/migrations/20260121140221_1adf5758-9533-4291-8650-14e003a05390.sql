-- Create client financial configuration table
CREATE TABLE public.client_financial_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL UNIQUE,
  
  -- Margin settings
  default_margin_percentage numeric NOT NULL DEFAULT 30,
  use_shopify_costs boolean NOT NULL DEFAULT false,
  
  -- Fixed costs per month
  shopify_plan_cost numeric NOT NULL DEFAULT 0,
  klaviyo_plan_cost numeric NOT NULL DEFAULT 0,
  other_fixed_costs numeric NOT NULL DEFAULT 0,
  other_fixed_costs_description text,
  
  -- Payment gateway commission
  payment_gateway_commission numeric NOT NULL DEFAULT 3.5,
  
  -- Product-level margins (JSON: { "sku": margin_percentage })
  product_margins jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_financial_config ENABLE ROW LEVEL SECURITY;

-- Clients can view their own config
CREATE POLICY "Clients can view their own financial config"
ON public.client_financial_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_financial_config.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  )
);

-- Clients can insert their own config
CREATE POLICY "Clients can insert their own financial config"
ON public.client_financial_config
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_financial_config.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  )
);

-- Clients can update their own config
CREATE POLICY "Clients can update their own financial config"
ON public.client_financial_config
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM clients
    WHERE clients.id = client_financial_config.client_id
    AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_client_financial_config_updated_at
BEFORE UPDATE ON public.client_financial_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();