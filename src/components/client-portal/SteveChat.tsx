import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, User, Sparkles, RefreshCw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import avatarSteve from '@/assets/avatar-steve.png';
import avatarChonga from '@/assets/avatar-chonga.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Helper to detect and parse Chonga's spirit messages
function parseMessageWithChonga(content: string) {
  const chongaPattern = /---\s*\n👻\s*\*\*\[ESPÍRITU DE LA CHONGA\]\:\*\*([^]*?)\*desaparece[^*]*\*\s*\n---/g;
  const parts: Array<{ type: 'steve' | 'chonga'; content: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = chongaPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const stevePart = content.slice(lastIndex, match.index).trim();
      if (stevePart) parts.push({ type: 'steve', content: stevePart });
    }
    parts.push({ type: 'chonga', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) parts.push({ type: 'steve', content: remaining });
  }

  if (parts.length === 0) parts.push({ type: 'steve', content });

  return parts;
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
  const [progress, setProgress] = useState({ answered: 0, total: 15 });
  const [examples, setExamples] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initializeConversation();
  }, [clientId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function initializeConversation() {
    setIsInitializing(true);
    try {
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

        const { data: existingMessages, error: msgError } = await supabase
          .from('steve_messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        if (existingMessages && existingMessages.length > 0) {
          setMessages(existingMessages as Message[]);
          
          // Calc progress from user messages
          const userMsgCount = existingMessages.filter(m => m.role === 'user').length;
          setProgress({ answered: userMsgCount, total: 15 });
          
          const { data: persona } = await supabase
            .from('buyer_personas')
            .select('is_complete')
            .eq('client_id', clientId)
            .maybeSingle();
          
          setIsComplete(persona?.is_complete || false);
        } else {
          await startNewConversation();
        }
      } else {
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
        setProgress({ answered: 0, total: data.total_questions || 15 });
        if (data.examples) setExamples(data.examples);
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
    setExamples([]);
    
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
        
        if (data.answered_count !== undefined) {
          setProgress({ answered: data.answered_count, total: data.total_questions || 15 });
        }
        
        if (data.examples) setExamples(data.examples);
        
        if (data.is_complete) {
          setIsComplete(true);
          toast.success('¡Brief de Marca completado! 🎉');
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      if (error?.status === 429) {
        toast.error('Demasiadas solicitudes. Espera un momento.');
      } else if (error?.status === 402) {
        toast.error('Servicio de IA no disponible temporalmente.');
      } else {
        toast.error('Error al enviar mensaje');
      }
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleExampleClick(example: string) {
    setInput(example);
    inputRef.current?.focus();
  }

  async function handleRestart() {
    if (!confirm('¿Estás seguro de que quieres reiniciar la conversación?')) return;

    setMessages([]);
    setConversationId(null);
    setIsComplete(false);
    setProgress({ answered: 0, total: 15 });
    setExamples([]);
    
    if (conversationId) {
      await supabase.from('steve_conversations').delete().eq('id', conversationId);
    }
    await supabase.from('buyer_personas').delete().eq('client_id', clientId);
    await startNewConversation();
  }

  const progressPercent = Math.round((progress.answered / progress.total) * 100);

  if (isInitializing) {
    return (
      <Card className="h-[700px]">
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
    <Card className="h-[700px] flex flex-col">
      {/* Header */}
      <CardHeader className="border-b flex-shrink-0 pb-3">
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
                {isComplete ? 'Brief completado ✅' : 'Bulldog Francés PhD • Stanford'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 1 && (
              <Button variant="ghost" size="sm" onClick={handleRestart}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Reiniciar
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {!isComplete && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progreso del Brief</span>
              <span className="font-medium text-foreground">{progressPercent}% ({progress.answered}/{progress.total})</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}
      </CardHeader>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === 'user' ? (
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-br-md">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-secondary">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                parseMessageWithChonga(message.content).map((part, partIndex) => (
                  <div key={`${message.id}-${partIndex}`} className={cn(
                    "flex gap-3 justify-start",
                    partIndex > 0 && "mt-3"
                  )}>
                    <Avatar className={cn(
                      "h-8 w-8 flex-shrink-0 border",
                      part.type === 'chonga' ? "border-purple-400" : "border-primary/20"
                    )}>
                      {part.type === 'chonga' ? (
                        <>
                          <AvatarImage src={avatarChonga} alt="La Chonga" />
                          <AvatarFallback className="bg-purple-100 text-purple-600">👻</AvatarFallback>
                        </>
                      ) : (
                        <>
                          <AvatarImage src={avatarSteve} alt="Steve" />
                          <AvatarFallback className="bg-primary text-primary-foreground">🐕</AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm rounded-bl-md",
                      part.type === 'chonga' 
                        ? "bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800" 
                        : "bg-muted"
                    )}>
                      {part.type === 'chonga' && (
                        <div className="flex items-center gap-1 mb-1 text-xs text-purple-600 dark:text-purple-400 font-medium">
                          <span>👻</span>
                          <span>Espíritu de La Chonga</span>
                        </div>
                      )}
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                        <ReactMarkdown>{part.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))
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

      {/* Example Suggestions */}
      {examples.length > 0 && !isLoading && !isComplete && (
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-xs text-muted-foreground mb-2">💡 Ejemplos (haz clic para usar):</p>
          <div className="flex flex-wrap gap-2">
            {examples.map((example, i) => (
              <button
                key={i}
                onClick={() => handleExampleClick(example)}
                className="text-xs bg-muted hover:bg-accent border border-border rounded-full px-3 py-1.5 text-left transition-colors max-w-full truncate"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0">
        {isComplete ? (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground mb-2">
              🐕 ¡WOOF! Tu Brief de Marca está listo. Ve a la pestaña <strong>Brief</strong> para verlo y descargarlo.
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
