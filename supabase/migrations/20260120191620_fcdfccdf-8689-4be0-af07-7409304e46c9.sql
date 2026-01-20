-- Create buyer_personas table to store client buyer persona data
CREATE TABLE public.buyer_personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  persona_data JSONB NOT NULL DEFAULT '{}',
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- Create steve_conversations table to store chat history
CREATE TABLE public.steve_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create steve_messages table to store individual messages
CREATE TABLE public.steve_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.steve_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.buyer_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steve_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for buyer_personas
CREATE POLICY "Clients can view their own buyer persona"
  ON public.buyer_personas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = buyer_personas.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can insert their own buyer persona"
  ON public.buyer_personas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = buyer_personas.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can update their own buyer persona"
  ON public.buyer_personas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = buyer_personas.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

-- RLS policies for steve_conversations
CREATE POLICY "Clients can view their own conversations"
  ON public.steve_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = steve_conversations.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can create their own conversations"
  ON public.steve_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = steve_conversations.client_id
      AND (clients.client_user_id = auth.uid() OR clients.user_id = auth.uid())
    )
  );

-- RLS policies for steve_messages
CREATE POLICY "Clients can view their own messages"
  ON public.steve_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.steve_conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = steve_messages.conversation_id
      AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())
    )
  );

CREATE POLICY "Clients can insert their own messages"
  ON public.steve_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.steve_conversations conv
      JOIN public.clients c ON c.id = conv.client_id
      WHERE conv.id = steve_messages.conversation_id
      AND (c.client_user_id = auth.uid() OR c.user_id = auth.uid())
    )
  );

-- Add trigger for updated_at on buyer_personas
CREATE TRIGGER update_buyer_personas_updated_at
  BEFORE UPDATE ON public.buyer_personas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on steve_conversations
CREATE TRIGGER update_steve_conversations_updated_at
  BEFORE UPDATE ON public.steve_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();