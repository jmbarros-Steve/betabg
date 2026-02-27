import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bot, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface SteveKlaviyoChatProps {
  clientId: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    'Hola! Soy Steve, tu experto en email marketing. Puedo ayudarte con:\n\n' +
    '- Estrategia de email y frecuencia de envio\n' +
    '- Mejores practicas de Klaviyo\n' +
    '- Ideas para campanas y flujos\n' +
    '- Optimizacion de open rate y conversiones\n' +
    '- Segmentacion de audiencia\n\n' +
    'En que puedo ayudarte?',
};

const QUICK_SUGGESTIONS = [
  'Cada cuanto enviar emails?',
  'Que flujos necesito?',
  'Como mejoro mi open rate?',
  'Ideas para mi proxima campana',
];

export function SteveKlaviyoChat({ clientId }: SteveKlaviyoChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasUserMessages = messages.some((m) => m.role === 'user');

  useEffect(() => {
    loadConnection();
  }, [clientId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  };

  const loadConnection = async () => {
    setInitializing(true);
    try {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setConnectionId(data.id);
      }
    } catch (err) {
      console.error('Error loading Klaviyo connection:', err);
    } finally {
      setInitializing(false);
    }
  };

  const sendMessage = async (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Build history for context (last 10 messages)
      const history = [...messages, userMessage].slice(-10);

      const { data, error } = await supabase.functions.invoke(
        'steve-email-content',
        {
          body: {
            connectionId,
            action: 'chat',
            message: trimmed,
            history,
            clientId,
          },
        }
      );

      if (error) {
        // Fallback: try the steve-chat function
        const { data: fallbackData, error: fallbackError } =
          await supabase.functions.invoke('steve-chat', {
            body: {
              client_id: clientId,
              message: trimmed,
            },
          });

        if (fallbackError) throw fallbackError;

        const assistantContent =
          fallbackData?.message ||
          fallbackData?.response ||
          'Lo siento, no pude procesar tu mensaje. Intenta de nuevo.';

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent },
        ]);
      } else {
        const assistantContent =
          data?.message ||
          data?.response ||
          data?.content ||
          'Lo siento, no pude procesar tu mensaje. Intenta de nuevo.';

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent },
        ]);
      }
    } catch (err: any) {
      console.error('Error sending message to Steve:', err);
      if (err?.status === 429) {
        toast.error('Demasiadas solicitudes. Espera un momento.');
      } else {
        toast.error('Error al enviar mensaje');
      }
      // Remove the user message on error
      setMessages((prev) => prev.filter((m) => m !== userMessage));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleChipClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  if (initializing) {
    return (
      <Card className="h-[600px]">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-16 w-2/3 ml-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[600px]">
      {/* Header */}
      <CardHeader className="border-b flex-shrink-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
          </div>
          <div>
            <CardTitle className="text-base">
              Steve — Email Marketing
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Preguntale a Steve sobre email marketing, Klaviyo, estrategia y
              mejores practicas
            </p>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 max-h-[500px]"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              'flex gap-3',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {message.role === 'assistant' && (
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
            )}

            <div
              className={cn(
                'max-w-[80%] px-4 py-2 text-sm',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
                  : 'bg-muted rounded-2xl rounded-bl-sm'
              )}
            >
              {message.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-2 [&>ul>li]:mb-1">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5">
                <span
                  className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick suggestions */}
      {!hasUserMessages && !loading && (
        <div className="px-4 pb-2 flex-shrink-0">
          <p className="text-xs text-muted-foreground mb-2">
            Prueba preguntar:
          </p>
          <div className="flex flex-wrap gap-2">
            {QUICK_SUGGESTIONS.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(suggestion)}
                className="text-xs bg-muted hover:bg-accent border border-border rounded-full px-3 py-1.5 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0">
        <form onSubmit={handleSubmit} className="relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta sobre email marketing..."
            disabled={loading}
            className="pr-12 resize-none rounded-xl min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || loading}
            className="absolute right-2 bottom-2 h-8 w-8 rounded-lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}
