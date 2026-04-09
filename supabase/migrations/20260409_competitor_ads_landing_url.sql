-- Add landing_url column to competitor_ads
ALTER TABLE competitor_ads ADD COLUMN IF NOT EXISTS landing_url TEXT;
