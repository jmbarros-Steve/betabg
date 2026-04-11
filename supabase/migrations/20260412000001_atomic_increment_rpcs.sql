-- Atomic increment RPCs to fix TOCTOU race conditions in WA counters
-- Fixes: Bug #49 (message_count), Bug #142 (unread_count), Bug #146 (automation total_sent)

CREATE OR REPLACE FUNCTION increment_message_count(p_phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE wa_prospects
  SET message_count = COALESCE(message_count, 0) + 1,
      updated_at = NOW()
  WHERE phone = p_phone;
END;
$$;

CREATE OR REPLACE FUNCTION increment_unread_count(p_conversation_id uuid, p_preview text DEFAULT NULL, p_status text DEFAULT 'open')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE wa_conversations
  SET unread_count = COALESCE(unread_count, 0) + 1,
      last_message_at = NOW(),
      last_message_preview = COALESCE(p_preview, last_message_preview),
      status = p_status
  WHERE id = p_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_automation_total_sent(p_client_id uuid, p_trigger_type text, p_count int DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE wa_automations
  SET total_sent = COALESCE(total_sent, 0) + p_count
  WHERE client_id = p_client_id
    AND trigger_type = p_trigger_type;
END;
$$;
