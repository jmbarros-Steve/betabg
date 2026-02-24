import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Send, User, Sparkles, Trash2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import avatarSteve from '@/assets/avatar-steve.png';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SteveStrategyChatProps {
  clientId: string;
  onGoToBrief?: () => void;
}

export function SteveStrategyChat({ clientId, onGoToBrief }: SteveStrategyChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('steve-strategy', {
        body: { messages: newMessages, client_id: clientId },
      });

      if (error) throw error;
      if (data?.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      }
    } catch (error: any) {
      console.error('Strategy chat error:', error);
      if (error?.status === 429) {
        toast.error('Demasiadas solicitudes. Espera un momento.');
      } else {
        toast.error('Error al enviar mensaje');
      }
      setMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  }

  function handleClear() {
    if (messages.length === 0) return;
    if (!confirm('¿Limpiar la conversación?')) return;
    setMessages([]);
  }

  const suggestions = [
    '¿Cómo estructuro mi cuenta de Meta Ads?',
    '¿Cuál es un buen ROAS para mi industria?',
    '¿Qué tipo de creativos funcionan mejor en TOF?',
    'Dame una estrategia de email marketing para e-commerce',
  ];

  return (
    <Card className="h-[calc(100vh-120px)] min-h-[600px] max-h-[1100px] flex flex-col">
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
                Steve Estrategia
                <Sparkles className="h-4 w-4 text-primary" />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Consultor de Marketing • Pregúntame lo que quieras 🐕
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </CardHeader>

      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Avatar className="h-20 w-20 border-2 border-primary/20 mb-4">
                <AvatarImage src={avatarSteve} alt="Steve" />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">🐕</AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-semibold mb-2">¡Woof! Soy Steve 🐕</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Pregúntame sobre Meta Ads, Google Ads, SEO, Klaviyo, Shopify, creativos, estrategia... 
                lo que necesites. Uso todo lo que aprendí para darte respuestas accionables.
              </p>
              {onGoToBrief && (
                <Button variant="outline" size="sm" className="mb-6" onClick={onGoToBrief}>
                  <FileText className="h-4 w-4 mr-2" />
                  ¿Quieres hacer tu Brief Estratégico? Ir a Steve Brief
                </Button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="text-xs text-left bg-muted hover:bg-accent border border-border rounded-lg px-3 py-2.5 transition-colors"
                  >
                    💡 {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, i) => (
            <div key={i}>
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
                  <div className="max-w-[85%] rounded-2xl px-5 py-4 text-[0.9rem] rounded-bl-md shadow-sm bg-muted">
                    <div className="prose prose-sm dark:prose-invert max-w-none leading-[1.75] [&>p]:mb-3 [&>p:last-child]:mb-0 [&>ul]:my-3 [&>ol]:my-3 [&>ul>li]:mb-1.5 [&>ol>li]:mb-1.5 [&_strong]:text-foreground [&_table]:text-xs [&_table]:my-3 [&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1.5">
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
              <div className="bg-muted rounded-2xl rounded-bl-md px-5 py-4">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t flex-shrink-0">
        <form onSubmit={sendMessage} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregúntale a Steve sobre estrategia, métricas, creativos..."
            disabled={isLoading}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button type="submit" disabled={!input.trim() || isLoading} size="icon" className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
