-- Products Sync System: Unified products table for multi-platform sync
-- Shopify → Local DB → MercadoLibre

-----------------------------------------------------------------------
-- 1. Add 'mercadolibre' to platform_type enum
-----------------------------------------------------------------------
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'mercadolibre';

-----------------------------------------------------------------------
-- 2. Products table (unified, platform-agnostic)
-----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  cost_price INTEGER DEFAULT 0,
  base_price INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_client ON public.products(client_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(client_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(client_id, status);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products" ON public.products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = products.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own products" ON public.products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = products.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Super admins manage all products" ON public.products
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Service role full access products" ON public.products
  FOR ALL USING (auth.role() = 'service_role');

-----------------------------------------------------------------------
-- 3. Product variants table
-----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT,
  title TEXT,
  attributes JSONB DEFAULT '{}'::jsonb,
  price INTEGER DEFAULT 0,
  cost_price INTEGER DEFAULT 0,
  stock INTEGER DEFAULT 0,
  barcode TEXT,
  weight_kg NUMERIC,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON public.product_variants(sku);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own variants" ON public.product_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products
      JOIN clients ON clients.id = products.client_id
      WHERE products.id = product_variants.product_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own variants" ON public.product_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products
      JOIN clients ON clients.id = products.client_id
      WHERE products.id = product_variants.product_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Super admins manage all variants" ON public.product_variants
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Service role full access variants" ON public.product_variants
  FOR ALL USING (auth.role() = 'service_role');

-----------------------------------------------------------------------
-- 4. Product platform listings (where each variant is published)
-----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_platform_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_item_id TEXT,
  platform_sku TEXT,
  platform_price INTEGER DEFAULT 0,
  platform_stock INTEGER DEFAULT 0,
  platform_url TEXT,
  sync_status TEXT DEFAULT 'pending',
  is_published BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(variant_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_listings_variant ON public.product_platform_listings(variant_id);
CREATE INDEX IF NOT EXISTS idx_platform_listings_platform ON public.product_platform_listings(platform);
CREATE INDEX IF NOT EXISTS idx_platform_listings_item ON public.product_platform_listings(platform_item_id);

ALTER TABLE public.product_platform_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own listings" ON public.product_platform_listings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM product_variants
      JOIN products ON products.id = product_variants.product_id
      JOIN clients ON clients.id = products.client_id
      WHERE product_variants.id = product_platform_listings.variant_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own listings" ON public.product_platform_listings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM product_variants
      JOIN products ON products.id = product_variants.product_id
      JOIN clients ON clients.id = products.client_id
      WHERE product_variants.id = product_platform_listings.variant_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Super admins manage all listings" ON public.product_platform_listings
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Service role full access listings" ON public.product_platform_listings
  FOR ALL USING (auth.role() = 'service_role');

-----------------------------------------------------------------------
-- 5. ML Category Mappings (remember category choices per product type)
-----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ml_category_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL,
  ml_category_id TEXT NOT NULL,
  ml_category_name TEXT,
  default_attributes JSONB DEFAULT '[]'::jsonb,
  default_condition TEXT DEFAULT 'new',
  default_listing_type TEXT DEFAULT 'gold_special',
  default_markup_type TEXT DEFAULT 'percent',
  default_markup_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, product_type)
);

ALTER TABLE public.ml_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mappings" ON public.ml_category_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = ml_category_mappings.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can manage own mappings" ON public.ml_category_mappings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE clients.id = ml_category_mappings.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Super admins manage all mappings" ON public.ml_category_mappings
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Service role full access mappings" ON public.ml_category_mappings
  FOR ALL USING (auth.role() = 'service_role');

-----------------------------------------------------------------------
-- 6. Updated_at triggers
-----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS product_variants_updated_at ON public.product_variants;
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS product_platform_listings_updated_at ON public.product_platform_listings;
CREATE TRIGGER product_platform_listings_updated_at
  BEFORE UPDATE ON public.product_platform_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
