-- Add Facebook page URL to competitor_tracking
ALTER TABLE competitor_tracking ADD COLUMN IF NOT EXISTS fb_page_url TEXT;

-- Add Apify metrics columns to competitor_ads
ALTER TABLE competitor_ads
  ADD COLUMN IF NOT EXISTS impressions_lower INTEGER,
  ADD COLUMN IF NOT EXISTS impressions_upper INTEGER,
  ADD COLUMN IF NOT EXISTS spend_lower NUMERIC,
  ADD COLUMN IF NOT EXISTS spend_upper NUMERIC,
  ADD COLUMN IF NOT EXISTS reach_lower INTEGER,
  ADD COLUMN IF NOT EXISTS reach_upper INTEGER,
  ADD COLUMN IF NOT EXISTS platforms TEXT[],
  ADD COLUMN IF NOT EXISTS image_urls TEXT[];
