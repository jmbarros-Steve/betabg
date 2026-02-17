
-- Add deep_dive_data column to competitor_tracking for storing Firecrawl analysis
ALTER TABLE public.competitor_tracking 
ADD COLUMN deep_dive_data JSONB DEFAULT NULL,
ADD COLUMN store_url TEXT DEFAULT NULL,
ADD COLUMN last_deep_dive_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
