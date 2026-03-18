-- Add birthday, customer_created, first_purchase trigger types and last_order_at column
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_flows') THEN
    ALTER TABLE email_flows DROP CONSTRAINT IF EXISTS email_flows_trigger_type_check;
    ALTER TABLE email_flows ADD CONSTRAINT email_flows_trigger_type_check
      CHECK (trigger_type IN (
        'abandoned_cart', 'welcome', 'post_purchase', 'winback',
        'browse_abandonment', 'back_in_stock', 'price_drop',
        'birthday', 'customer_created', 'first_purchase'
      ));
  END IF;

  -- Add last_order_at to email_subscribers for winback cron
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_subscribers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_subscribers' AND column_name = 'last_order_at') THEN
      ALTER TABLE email_subscribers ADD COLUMN last_order_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_subscribers' AND column_name = 'total_orders') THEN
      ALTER TABLE email_subscribers ADD COLUMN total_orders INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_subscribers' AND column_name = 'total_spent') THEN
      ALTER TABLE email_subscribers ADD COLUMN total_spent NUMERIC(12,2) DEFAULT 0;
    END IF;
  END IF;
END $$;
