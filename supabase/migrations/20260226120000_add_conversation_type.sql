-- Add conversation_type column to steve_conversations
-- 'brief' = existing structured Q&A, 'estrategia' = free-form strategy chat
ALTER TABLE public.steve_conversations
  ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'brief';

-- Index for efficient lookups by client + type
CREATE INDEX IF NOT EXISTS idx_steve_conversations_client_type
  ON public.steve_conversations (client_id, conversation_type);
