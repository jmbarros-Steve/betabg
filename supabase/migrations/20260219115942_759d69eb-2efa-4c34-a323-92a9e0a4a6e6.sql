
-- Create client_credits table
CREATE TABLE IF NOT EXISTS public.client_credits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  creditos_disponibles integer NOT NULL DEFAULT 99999,
  creditos_usados integer NOT NULL DEFAULT 0,
  plan text NOT NULL DEFAULT 'free_beta',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own credits"
  ON public.client_credits FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_credits.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own credits"
  ON public.client_credits FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_credits.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can update their own credits"
  ON public.client_credits FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = client_credits.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all credits"
  ON public.client_credits FOR ALL
  USING (is_super_admin(auth.uid()));

-- Create credit_transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  accion text NOT NULL,
  creditos_usados integer NOT NULL DEFAULT 0,
  costo_real_usd decimal(10,4) DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own transactions"
  ON public.credit_transactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = credit_transactions.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Clients can insert their own transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = credit_transactions.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
  ));

CREATE POLICY "Super admins manage all transactions"
  ON public.credit_transactions FOR ALL
  USING (is_super_admin(auth.uid()));

-- Add updated_at trigger for client_credits
CREATE TRIGGER update_client_credits_updated_at
  BEFORE UPDATE ON public.client_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add prediction_id to ad_creatives if not exists
ALTER TABLE public.ad_creatives ADD COLUMN IF NOT EXISTS prediction_id text;

-- Auto-insert credits when a new client is created
-- (backfill for existing clients too)
INSERT INTO public.client_credits (client_id, creditos_disponibles, creditos_usados, plan)
SELECT id, 99999, 0, 'free_beta'
FROM public.clients
ON CONFLICT (client_id) DO NOTHING;
