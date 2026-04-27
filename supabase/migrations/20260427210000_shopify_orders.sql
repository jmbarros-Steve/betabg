-- shopify_orders — tabla nueva para sincronizar orders desde Shopify.
-- Sprint 2 del informe Shopify: necesita order-level data para revenue por hora/canal,
-- top productos por revenue real del período, geografía, atribución a campañas.
--
-- Schema mirrors Shopify Orders API 2026-04 con los campos relevantes para análisis.

CREATE TABLE IF NOT EXISTS public.shopify_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  shop_domain TEXT,

  -- Shopify identifiers
  shopify_order_id TEXT NOT NULL,
  order_number INTEGER,
  order_name TEXT,

  -- Customer
  customer_id TEXT,
  customer_email TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,

  -- Money (numeric for precision)
  total_price NUMERIC(14, 2) DEFAULT 0,
  subtotal_price NUMERIC(14, 2) DEFAULT 0,
  total_tax NUMERIC(14, 2) DEFAULT 0,
  total_discounts NUMERIC(14, 2) DEFAULT 0,
  shipping_price NUMERIC(14, 2) DEFAULT 0,
  currency TEXT,

  -- Status
  financial_status TEXT,
  fulfillment_status TEXT,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  -- Attribution / source
  source_name TEXT,
  referring_site TEXT,
  landing_site TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  -- Geo
  shipping_country TEXT,
  shipping_city TEXT,
  shipping_province TEXT,
  shipping_address JSONB,
  billing_address JSONB,

  -- Items + tags (jsonb for flex)
  line_items JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',

  -- Timestamps
  created_at_shop TIMESTAMPTZ NOT NULL,
  updated_at_shop TIMESTAMPTZ,
  processed_at_shop TIMESTAMPTZ,

  -- Internal
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shopify_orders_unique_per_client UNIQUE (client_id, shopify_order_id)
);

-- Indexes para queries del informe (revenue por día/hora/canal, top productos por SKU,
-- geografía, marketing attribution).
CREATE INDEX IF NOT EXISTS idx_shopify_orders_client_created
  ON public.shopify_orders(client_id, created_at_shop DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_connection_updated
  ON public.shopify_orders(connection_id, updated_at_shop DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_client_status
  ON public.shopify_orders(client_id, financial_status)
  WHERE financial_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_orders_client_source
  ON public.shopify_orders(client_id, source_name)
  WHERE source_name IS NOT NULL;

ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shopify_orders' AND policyname = 'shopify_orders_select'
  ) THEN
    CREATE POLICY shopify_orders_select ON public.shopify_orders
      FOR SELECT
      USING (
        client_id IN (
          SELECT id FROM public.clients
          WHERE user_id = auth.uid() OR client_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND is_super_admin = TRUE
        )
      );
  END IF;
END $$;

-- Trigger updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'shopify_orders_updated_at'
  ) THEN
    CREATE TRIGGER shopify_orders_updated_at
      BEFORE UPDATE ON public.shopify_orders
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Seguimiento del último sync por conexión (para sync incremental con updated_at_min)
CREATE TABLE IF NOT EXISTS public.shopify_orders_sync_state (
  connection_id UUID PRIMARY KEY REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  last_synced_updated_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_synced INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

ALTER TABLE public.shopify_orders_sync_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.shopify_orders IS
  'Snapshot de orders Shopify por cliente. Incremental sync via shopify_orders_sync_state.last_synced_updated_at.';
COMMENT ON COLUMN public.shopify_orders.line_items IS
  'JSONB array: [{sku, name, quantity, price, total_discount, product_id, variant_id, ...}]';
