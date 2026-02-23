-- Allow clients to DELETE their own buyer personas (needed for brief restart)
CREATE POLICY "Clients can delete their own buyer persona"
ON public.buyer_personas
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = buyer_personas.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Allow clients to DELETE their own conversations (needed for brief restart)
CREATE POLICY "Clients can delete their own conversations"
ON public.steve_conversations
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM clients
  WHERE clients.id = steve_conversations.client_id
  AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
));

-- Allow clients to DELETE their own messages (needed for brief restart)
CREATE POLICY "Clients can delete their own messages"
ON public.steve_messages
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM steve_conversations conv
  JOIN clients c ON c.id = conv.client_id
  WHERE conv.id = steve_messages.conversation_id
  AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())
));