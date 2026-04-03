-- Creative Review Feed: adds review columns to creative_history
-- Allows JM to review generated creatives and submit feedback that becomes rules

ALTER TABLE creative_history
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_feedback TEXT,
  ADD COLUMN IF NOT EXISTS feedback_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_rules_generated INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feedback_queue_id UUID;

-- Filtered index for fast pending lookups
CREATE INDEX IF NOT EXISTS idx_creative_history_review_pending
  ON creative_history (created_at DESC)
  WHERE review_status = 'pending';
