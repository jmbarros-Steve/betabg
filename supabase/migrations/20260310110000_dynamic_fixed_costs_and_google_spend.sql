-- Add manual Google spend and dynamic fixed cost items
ALTER TABLE public.client_financial_config
  ADD COLUMN manual_google_spend numeric NOT NULL DEFAULT 0,
  ADD COLUMN fixed_cost_items jsonb NOT NULL DEFAULT '[]'::jsonb;
-- fixed_cost_items stores: [{"name": "Shopify", "amount": 27550}, {"name": "Klaviyo", "amount": 42750}, ...]
