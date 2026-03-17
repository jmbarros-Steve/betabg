-- D.1: Performance tracking columns for creative_history

ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS shop_id TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_ctr DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_cpa DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_roas DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_spend DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_impressions INTEGER;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_clicks INTEGER;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS meta_conversions INTEGER;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS klaviyo_open_rate DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS klaviyo_click_rate DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS klaviyo_unsubscribe_rate DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS klaviyo_revenue DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS performance_score DECIMAL;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS performance_verdict TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS performance_reason TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS benchmark_comparison JSONB;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS copy_text TEXT;
ALTER TABLE creative_history ADD COLUMN IF NOT EXISTS product_name TEXT;

CREATE INDEX IF NOT EXISTS idx_creative_history_unmeasured
  ON creative_history(channel, created_at DESC)
  WHERE measured_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creative_history_shop_perf
  ON creative_history(client_id, channel, performance_score DESC NULLS LAST);
