import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Send, User, Lightbulb, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import avatarSteve from '@/assets/avatar-steve.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SteveEstrategiaProps {
  clientId: string;
}

export function SteveEstrategia({ clientId }: SteveEstrategiaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [briefComplete, setBriefComplete] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeConversation();
  }, [clientId]);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages]);

  async function initializeConversation() {
    setIsInitializing(true);
    try {
      // Check brief status
      const { data: persona } = await supabase
        .from('buyer_personas')
        .select('is_complete')
        .eq('client_id', clientId)
        .maybeSingle();
      setBriefComplete(persona?.is_complete ?? false);

      // Find existing estrategia conversation
      const { data: existingConvs, error: convError } = await supabase
        .from('steve_conversations')
        .select('id')
        .eq('client_id', clientId)
        .eq('conversation_type', 'estrategia')
        .order('created_at', { ascending: false })
        .limit(1);

      if (convError) throw convError;

      if (existingConvs && existingConvs.length > 0) {
        const convId = existingConvs[0].id;
        setConversationId(convId);

        const { data: existingMessages, error: msgError } = await supabase
          .from('steve_messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        if (existingMessages && existingMessages.length > 0) {
          setMessages(existingMessages as Message[]);
        }
      }
      // If no conversation exists, we'll create one on first message
    } catch (error) {
      console.error('Error initializing estrategia conversation:', error);
      toast.error('Error al cargar la conversación de estrategia');
    } finally {
      setIsInitializing(false);
    }
  }

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading) return;
    const userMessage = messageText.trim();
    setInput('');

    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const { data, error } = await callApi('steve-chat', {
        body: {
          client_id: clientId,
          conversation_id: conversationId,
          message: userMessage,
          mode: 'estrategia',
        },
      });
      if (error) throw error;

      if (data?.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      if (data?.message) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (error: any) {
      console.error('Error sending estrategia message:', error);
      if (error?.status === 429) {
        toast.error('Demasiadas solicitudes. Espera un momento.');
      } else {
        toast.error('Error al enviar mensaje');
      }
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  if (isInitializing) {
    return (
      <Card className="h-[750px]">
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
    <Card className="h-[800px] flex flex-col">
      {/* Header */}
      <CardHeader className="border-b flex-shrink-0 pb-3">
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
              Steve Estrategia
              <Lightbulb className="h-4 w-4 text-yellow-500" />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Consultor estratégico libre
            </p>
          </div>
        </div>
      </CardHeader>

      {/* Brief incomplete banner */}
      {briefComplete === false && (
        <div className="px-4 py-2.5 bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Tu brief aún no está completo. Steve puede ayudarte, pero para un análisis más profundo completa el brief en la pestaña <strong>"Steve"</strong>.
          </p>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-5">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <Avatar className="h-16 w-16 border-2 border-primary/20 mb-4">
                <AvatarImage src={avatarSteve} alt="Steve" />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">🐕</AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-semibold mb-2">Steve Estrategia</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Pregunta lo que quieras sobre marketing, estrategia, competencia, posicionamiento, pricing, campañas, copywriting, SEO... Steve tiene acceso a tu brief y análisis de marca.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id}>
              {message.role === 'user' ? (
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-primary text-primary-foreground rounded-br-md shadow-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-secondary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                <div className="flex gap-3 justify-start">
                  <Avatar className="h-8 w-8 flex-shrink-0 border border-primary/20">
                    <AvatarImage src={avatarSteve} alt="Steve" />
                    <AvatarFallback className="bg-primary text-primary-foreground">🐕</AvatarFallback>
                  </Avatar>
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm rounded-bl-md shadow-sm bg-muted">
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ol]:my-1 leading-relaxed">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
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

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre estrategia, marketing, competencia..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
