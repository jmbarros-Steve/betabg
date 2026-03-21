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
import { Send, User, Lightbulb, AlertTriangle, Activity, WifiOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import avatarSteve from '@/assets/avatar-steve.png';

/** Strip <thinking>...</thinking> blocks that leak from chain-of-thought models */
function stripThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '').trim();
}

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
  const [hasConnections, setHasConnections] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  const suggestedQuestions = [
    '¿Cómo están mis campañas de Meta este mes?',
    '¿Cuál es mi ROAS real y cómo mejorarlo?',
    'Analiza mi TOFU: gasté mucho con poco retorno',
    '¿Qué estrategia recomiendas para escalar?',
  ];

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initializeConversation();
  }, [clientId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    // ScrollArea (Radix) creates an internal viewport — scrollIntoView doesn't
    // reach it reliably, so we scroll the viewport div directly.
    setTimeout(() => {
      const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      } else {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
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

      // Check platform connections via Cloud Run (bypasses RLS)
      try {
        const { data: connData } = await callApi('check-client-connections', {
          body: { client_id: clientId },
        });
        if (connData) {
          setHasConnections(connData.connected === true);
        }
        // If API fails, hasConnections stays null (no banner shown)
      } catch {
        // Silently ignore — no banner is better than a false "disconnected" banner
      }

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
      // Estrategia init error handled via toast
      toast.error('Error al cargar la conversación de estrategia');
    } finally {
      setIsInitializing(false);
    }
  }

  async function sendMessage(messageText: string) {
    console.log('[EST] sendMessage called, text:', messageText?.slice(0, 50), 'isLoading:', isLoading);
    if (!messageText.trim() || isLoading) return;
    const userMessage = messageText.trim();
    setInput('');

    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    console.log('[EST] Adding user message to state, id:', tempUserMsg.id);
    setMessages(prev => {
      console.log('[EST] setMessages(user): prev.length=', prev.length, '→ new length=', prev.length + 1);
      return [...prev, tempUserMsg];
    });
    setIsLoading(true);

    // Safety timeout: if callApi hangs (network drop, browser tab suspension),
    // force-unlock the UI after 100s so the user can retry without reloading.
    const safetyTimer = setTimeout(() => {
      console.warn('[EST] SAFETY TIMEOUT — force-unlocking UI after 100s');
      setIsLoading(false);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⚠️ La solicitud tardó demasiado. Revisa tu conexión e intenta de nuevo.',
        created_at: new Date().toISOString(),
      }]);
      inputRef.current?.focus();
    }, 100_000);

    try {
      console.log('[EST] Calling callApi steve-chat, clientId:', clientId, 'convId:', conversationId);
      const { data, error } = await callApi('steve-chat', {
        body: {
          client_id: clientId,
          conversation_id: conversationId,
          message: userMessage,
          mode: 'estrategia',
        },
      });
      console.log('[EST] callApi returned — error:', error, 'data keys:', data ? Object.keys(data) : 'null', 'data.message length:', data?.message?.length);

      if (error) throw error;
      if (!data) throw new Error('No data returned from API');

      if (data.conversation_id && !conversationId) {
        console.log('[EST] Setting conversationId:', data.conversation_id);
        setConversationId(data.conversation_id);
      }

      // Accept message from response — handle both string and empty cases
      const responseText = data.message || data.text || data.response;
      console.log('[EST] responseText type:', typeof responseText, 'length:', responseText?.length, 'first 80:', String(responseText || '').slice(0, 80));
      if (responseText) {
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: String(responseText),
          created_at: new Date().toISOString(),
        };
        console.log('[EST] Adding assistant message to state, id:', assistantMsg.id);
        setMessages(prev => {
          console.log('[EST] setMessages(assistant): prev.length=', prev.length, '→ new length=', prev.length + 1);
          return [...prev, assistantMsg];
        });
      } else {
        console.warn('[EST] API returned OK but no message. Full data:', JSON.stringify(data).slice(0, 500));
        const fallbackMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '⚠️ Steve procesó tu mensaje pero no generó respuesta. Intenta de nuevo.',
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, fallbackMsg]);
      }
    } catch (err: any) {
      console.error('[EST] CATCH — error:', err, 'type:', typeof err, 'message:', err?.message);
      const errStr = typeof err === 'string' ? err : (err?.message || '');
      const is429 = err?.status === 429 || errStr.includes('429');
      const is5xx = /\b50[0-9]\b/.test(errStr);
      const isNetwork = errStr.includes('fetch') || errStr.includes('network') || errStr.includes('Failed to fetch') || errStr.includes('aborted');

      let errorText: string;
      if (is429) {
        errorText = '⚠️ Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
      } else if (is5xx) {
        errorText = '⚠️ El servidor está temporalmente fuera de servicio. Intenta de nuevo en unos segundos.';
      } else if (isNetwork) {
        errorText = '⚠️ Error de conexión. Revisa tu internet e intenta de nuevo.';
      } else {
        errorText = `⚠️ Error al procesar tu mensaje. Intenta de nuevo.${errStr ? ` (${errStr.slice(0, 120)})` : ''}`;
      }

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorText,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      clearTimeout(safetyTimer);
      console.log('[EST] FINALLY — setting isLoading=false');
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  console.log('[EST] RENDER — messages.length:', messages.length, 'isLoading:', isLoading, 'isInitializing:', isInitializing, 'conversationId:', conversationId);

  if (isInitializing) {
    return (
      <Card className="h-[750px] bg-card border border-border rounded-2xl">
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
    <Card className="h-[calc(100vh-10rem)] min-h-[500px] max-h-[800px] flex flex-col bg-card border border-border rounded-2xl overflow-hidden relative">
      {/* Header */}
      <CardHeader className="border-b flex-shrink-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-12 w-12 border-2 border-primary/20">
              <AvatarImage src={avatarSteve} alt="Steve" />
              <AvatarFallback className="bg-primary text-primary-foreground">🐕</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" aria-label="En línea" role="status" />
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

      {/* Metrics connection banner */}
      {hasConnections === true && (
        <div className="px-4 py-2 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800 flex items-center gap-2 flex-shrink-0">
          <Activity className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-xs text-green-700 dark:text-green-300">
            Conectado a datos reales — las respuestas incluyen métricas actualizadas de tus plataformas.
          </p>
        </div>
      )}
      {hasConnections === false && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/30 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-shrink-0">
          <WifiOff className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Sin conexiones activas — Steve responderá con conocimiento general. Conecta tus plataformas para análisis con datos reales.
          </p>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="space-y-5">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full py-10 text-center">
              <Avatar className="h-16 w-16 border-2 border-primary/20 mb-4">
                <AvatarImage src={avatarSteve} alt="Steve" />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">🐕</AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-semibold mb-2">Steve Estrategia</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Tengo acceso a tus métricas de Meta, Shopify y el brief de tu marca. Puedes preguntarme sobre tus campañas, ROAS, estrategia, competencia, etc.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left text-xs px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-accent hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id}>
              {message.role === 'user' ? (
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[75%] px-4 py-3 text-sm bg-primary text-white rounded-xl rounded-tr-sm shadow-sm">
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
                  <div className="max-w-[80%] px-4 py-3 text-sm shadow-sm bg-slate-50 text-slate-700 rounded-xl rounded-tl-sm">
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ol]:my-1 leading-relaxed">
                      <ReactMarkdown>{stripThinking(message.content)}</ReactMarkdown>
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
              <div className="bg-slate-50 text-slate-700 rounded-xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border bg-muted/50 flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre estrategia, marketing, competencia..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon" className="bg-primary rounded-full">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
