-- Track Shopify checkouts for abandoned cart WA automation
CREATE TABLE IF NOT EXISTS shopify_abandoned_checkouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  checkout_id TEXT NOT NULL,
  customer_phone TEXT,
  customer_name TEXT,
  customer_email TEXT,
  line_items JSONB,                         -- [{title, price, quantity, image_url}]
  total_price DECIMAL,
  currency TEXT DEFAULT 'CLP',
  abandoned_checkout_url TEXT,
  wa_reminder_sent BOOLEAN DEFAULT false,
  order_completed BOOLEAN DEFAULT false,    -- set true when order webhook fires
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, checkout_id)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_pending
  ON shopify_abandoned_checkouts(client_id, created_at DESC)
  WHERE wa_reminder_sent = false AND order_completed = false;
