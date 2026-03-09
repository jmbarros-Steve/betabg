-- Add shipping cost per order and Shopify transaction commission to financial config
ALTER TABLE public.client_financial_config
  ADD COLUMN shipping_cost_per_order numeric NOT NULL DEFAULT 0,
  ADD COLUMN shopify_commission_percentage numeric NOT NULL DEFAULT 0;
