-- Pricing history snapshot table — track price changes over time.
-- Owned by Matías W13 (Shopify). Cron daily 4am snapshots all active products.
-- Steve estrategia compares latest snapshots to detect pricing changes.

CREATE TABLE IF NOT EXISTS shopify_pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  title TEXT,
  price_min NUMERIC,
  price_max NUMERIC,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, shopify_product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_shopify_pricing_history_client_date
  ON shopify_pricing_history (client_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_pricing_history_product
  ON shopify_pricing_history (client_id, shopify_product_id, snapshot_date DESC);

COMMENT ON TABLE shopify_pricing_history IS 'Daily snapshot of shopify_products prices. Used by Steve estrategia to detect pricing changes and correlate with sales/conversion shifts.';
