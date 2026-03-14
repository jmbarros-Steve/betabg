-- Add reach column to campaign_metrics for frequency calculation
-- Frequency = impressions / reach
ALTER TABLE campaign_metrics ADD COLUMN IF NOT EXISTS reach NUMERIC DEFAULT 0;
