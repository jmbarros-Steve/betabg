-- Add campaign_status column to campaign_metrics
-- Stores real status from Meta/Google API ('ACTIVE', 'PAUSED', 'ARCHIVED', etc.)
ALTER TABLE campaign_metrics ADD COLUMN IF NOT EXISTS campaign_status TEXT;
