-- Persist which question is "pending" after a rejection so the next message is treated as retry (same question).
-- Fixes bug: after [RECHAZO] user sends new answer but Steve was advancing to next question.
ALTER TABLE public.steve_conversations
  ADD COLUMN IF NOT EXISTS pending_question_index integer;

COMMENT ON COLUMN public.steve_conversations.pending_question_index IS 'When set, the next user message is a retry for this question index (0-based). Cleared when answer is accepted.';
