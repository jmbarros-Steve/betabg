-- Add deck_sent column to wa_prospects for sales deck tracking
ALTER TABLE wa_prospects ADD COLUMN IF NOT EXISTS deck_sent BOOLEAN DEFAULT false;

-- Comment
COMMENT ON COLUMN wa_prospects.deck_sent IS 'Whether a personalized sales deck has been sent to this prospect';
