import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, User, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import avatarSteve from '@/assets/avatar-steve.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SteveChatProps {
  clientId: string;
}

export function SteveChat({ clientId }: SteveChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeConversation();
  }, [clientId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function initializeConversation() {
    setIsInitializing(true);
    try {
      // Check if there's an existing conversation
      const { data: existingConvs, error: convError } = await supabase
        .from('steve_conversations')
        .select('id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (convError) throw convError;

      if (existingConvs && existingConvs.length > 0) {
        const convId = existingConvs[0].id;
        setConversationId(convId);

        // Fetch existing messages
        const { data: existingMessages, error: msgError } = await supabase
          .from('steve_messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        if (existingMessages && existingMessages.length > 0) {
          setMessages(existingMessages as Message[]);
          
          // Check if persona is complete
          const { data: persona } = await supabase
            .from('buyer_personas')
            .select('is_complete')
            .eq('client_id', clientId)
            .maybeSingle();
          
          setIsComplete(persona?.is_complete || false);
        } else {
          // Start new conversation
          await startNewConversation();
        }
      } else {
        // Start new conversation
        await startNewConversation();
      }
    } catch (error) {
      console.error('Error initializing conversation:', error);
      toast.error('Error al cargar la conversación');
    } finally {
      setIsInitializing(false);
    }
  }

  async function startNewConversation() {
    try {
      const { data, error } = await supabase.functions.invoke('steve-chat', {
        body: { client_id: clientId },
      });

      if (error) throw error;

      if (data?.conversation_id && data?.message) {
        setConversationId(data.conversation_id);
        setMessages([{
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
      toast.error('Error al iniciar conversación con Steve');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    
    if (!input.trim() || isLoading || !conversationId) return;

    const userMessage = input.trim();
    setInput('');
    
    // Add user message optimistically
    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('steve-chat', {
        body: {
          client_id: clientId,
          conversation_id: conversationId,
          message: userMessage,
        },
      });

      if (error) throw error;

      if (data?.message) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
        
        if (data.is_complete) {
          setIsComplete(true);
          toast.success('¡Buyer persona completado! 🎉');
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      if (error?.status === 429) {
        toast.error('Demasiadas solicitudes. Por favor espera un momento.');
      } else if (error?.status === 402) {
        toast.error('Servicio de IA no disponible temporalmente.');
      } else {
        toast.error('Error al enviar mensaje');
      }
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  async function handleRestart() {
    if (!confirm('¿Estás seguro de que quieres reiniciar la conversación?')) return;

    setMessages([]);
    setConversationId(null);
    setIsComplete(false);
    
    // Delete existing conversation
    if (conversationId) {
      await supabase.from('steve_conversations').delete().eq('id', conversationId);
    }
    
    // Delete brand brief
    await supabase.from('buyer_personas').delete().eq('client_id', clientId);
    
    await startNewConversation();
  }

  if (isInitializing) {
    return (
      <Card className="h-[600px]">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-16 w-2/3 ml-auto" />
          <Skeleton className="h-16 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-12 w-12 border-2 border-primary/20">
                <AvatarImage src={avatarSteve} alt="Steve" />
                <AvatarFallback className="bg-primary text-primary-foreground">🐕</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Steve
                <Sparkles className="h-4 w-4 text-primary" />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {isComplete ? 'Brief de Marca completado ✅' : 'Bulldog Francés PhD • Stanford'}
              </p>
            </div>
          </div>
          {messages.length > 1 && (
            <Button variant="ghost" size="sm" onClick={handleRestart}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Reiniciar
            </Button>
          )}
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <Avatar className="h-8 w-8 flex-shrink-0 border border-primary/20">
                  <AvatarImage src={avatarSteve} alt="Steve" />
                  <AvatarFallback className="bg-primary text-primary-foreground">🐕</AvatarFallback>
                </Avatar>
              )}
              
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
              
              {message.role === 'user' && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-secondary">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <Avatar className="h-8 w-8 flex-shrink-0 border border-primary/20">
                <AvatarImage src={avatarSteve} alt="Steve" />
                <AvatarFallback className="bg-primary text-primary-foreground">🐕</AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t flex-shrink-0">
        {isComplete ? (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground mb-2">
              🐕 ¡WOOF! Tu Brief de Marca está listo. Ahora podemos crear anuncios épicos.
            </p>
            <Button variant="outline" size="sm" onClick={handleRestart}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Crear nuevo Brief
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu respuesta..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || isLoading} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
