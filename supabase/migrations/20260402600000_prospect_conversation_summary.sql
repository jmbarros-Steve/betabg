-- ============================================================
-- Add conversation_summary to wa_prospects for rolling memory
-- Haiku compresses older messages every 10 msgs so Steve
-- has full context even after 500+ messages.
-- ============================================================

ALTER TABLE wa_prospects
  ADD COLUMN IF NOT EXISTS conversation_summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_up_to_msg INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN wa_prospects.conversation_summary IS 'Rolling summary of conversation history compressed by Haiku';
COMMENT ON COLUMN wa_prospects.summary_up_to_msg IS 'message_count at which the last summary was generated';
