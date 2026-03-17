ALTER TABLE creative_history
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS shopify_product_id TEXT;

CREATE INDEX IF NOT EXISTS idx_creative_history_product ON creative_history(shopify_product_id);
