-- Add frequency column to campaign_metrics for Meta saturation tracking.
-- Frequency = impressions / reach (how often each unique user saw an ad).
-- High frequency (>3-4) signals audience fatigue — Steve estrategia surfaces this.
-- Owned by Felipe W2 (Meta Ads). Cross-review: Javiera W12 (SQL).

ALTER TABLE campaign_metrics
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(8, 4) DEFAULT 0;

COMMENT ON COLUMN campaign_metrics.frequency IS 'Average impressions per unique reached user (Meta API field). >3-4 indicates audience saturation.';
