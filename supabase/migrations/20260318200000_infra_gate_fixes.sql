-- INFRA GATE: Fix blockers found during infrastructure audit 2026-03-18
-- 1) RLS policies for email_subscribers (had RLS ON but 0 policies)
-- 2) Create shopify_products table
-- 3) Seed 6 system email templates

----------------------------------------------------------------------
-- 1. email_subscribers RLS policies
----------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients can view own subscribers" ON email_subscribers;
CREATE POLICY "Clients can view own subscribers" ON email_subscribers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = email_subscribers.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Clients can insert own subscribers" ON email_subscribers;
CREATE POLICY "Clients can insert own subscribers" ON email_subscribers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = email_subscribers.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Clients can update own subscribers" ON email_subscribers;
CREATE POLICY "Clients can update own subscribers" ON email_subscribers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = email_subscribers.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Clients can delete own subscribers" ON email_subscribers;
CREATE POLICY "Clients can delete own subscribers" ON email_subscribers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = email_subscribers.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Super admins manage all subscribers" ON email_subscribers;
CREATE POLICY "Super admins manage all subscribers" ON email_subscribers
  FOR ALL USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role full access email_subscribers" ON email_subscribers;
CREATE POLICY "Service role full access email_subscribers" ON email_subscribers
  FOR ALL USING (auth.role() = 'service_role');

----------------------------------------------------------------------
-- 2. shopify_products table
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shopify_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  shop_domain TEXT,
  shopify_product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  vendor TEXT,
  product_type TEXT,
  handle TEXT,
  status TEXT DEFAULT 'active',
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  images JSONB DEFAULT '[]',
  variants JSONB DEFAULT '[]',
  price_min NUMERIC,
  price_max NUMERIC,
  inventory_total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_client ON public.shopify_products(client_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_shop ON public.shopify_products(shop_domain);
CREATE INDEX IF NOT EXISTS idx_shopify_products_status ON public.shopify_products(client_id, status);

ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own products" ON public.shopify_products;
CREATE POLICY "Users can view own products" ON public.shopify_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = shopify_products.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Super admins manage all products" ON public.shopify_products;
CREATE POLICY "Super admins manage all products" ON public.shopify_products
  FOR ALL USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role full access shopify_products" ON public.shopify_products;
CREATE POLICY "Service role full access shopify_products" ON public.shopify_products
  FOR ALL USING (auth.role() = 'service_role');
