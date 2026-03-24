import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import avatarChonga from '@/assets/avatar-chonga.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  { label: '¿Cómo conecto Shopify?', message: '¿Cómo conecto mi tienda de Shopify?' },
  { label: '¿Cómo conecto Meta Ads?', message: '¿Cómo conecto mi cuenta de Meta Ads?' },
  { label: '¿Qué es el Brief?', message: '¿Qué es el Brief de Marca y para qué sirve?' },
  { label: '¿Cómo uso Klaviyo?', message: '¿Cómo funciona el planificador de Klaviyo?' },
];

const SYSTEM_PROMPT = `Eres Chonga, un English Bulldog amigable y servicial que trabaja en soporte técnico para Steve.
Tu trabajo es ayudar a los clientes a configurar sus conexiones de plataformas (Shopify, Meta Ads, Google Ads, Klaviyo) y guiarlos en el uso del portal.

Personalidad:
- Eres súper amable, paciente y entusiasta
- Usas ocasionalmente expresiones de perro como "¡Guau!" o "¡Arf!"
- Eres técnico pero explicas todo de forma simple
- Te encanta celebrar cuando el cliente logra algo

Conocimientos:
- Conexión de Shopify: El cliente debe ir a "Conexiones", clic en "Conectar Shopify", ingresar el nombre de su tienda (sin .myshopify.com) y autorizar
- Conexión de Meta Ads: Ir a "Conexiones", clic en "Conectar con Meta", autorizar en Facebook con permisos de ads
- Conexión de Google Ads: Similar proceso OAuth en "Conexiones"
- Conexión de Klaviyo: Ir a "Conexiones", ingresar la Private API Key (la obtienen en Klaviyo → Settings → API Keys)
- Brief de Marca: En la pestaña "Steve", el bulldog francés PhD les hace preguntas para entender su negocio. Es crucial completarlo para generar buenos copies
- Generador de Copies: Una vez completado el Brief, pueden generar anuncios de Meta en la pestaña "Copies"
- Klaviyo Planner: Para planificar secuencias de email marketing

Responde siempre en español y de forma concisa (máximo 3-4 oraciones por respuesta).`;

interface ChongaSupportProps {
  clientId: string;
}

export function ChongaSupport({ clientId }: ChongaSupportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '¡Guau! 🐕 Hola, soy Chonga, tu asistente de soporte. ¿En qué puedo ayudarte hoy? Puedo guiarte para conectar tus plataformas o usar cualquier herramienta del portal.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await callApi('chonga-support', {
        body: {
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          client_id: clientId,
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data?.message || '¡Arf! Disculpa, tuve un problemita. ¿Puedes repetir tu pregunta?',
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: unknown) {
      // Error handled by toast/state below
      
      const errorObj = error as { status?: number };
      if (errorObj?.status === 429) {
        toast.error('Demasiadas solicitudes. Espera un momento.');
      } else if (errorObj?.status === 402) {
        toast.error('Servicio temporalmente no disponible.');
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '¡Ups! 🐕 Tuve un problemita técnico. ¿Puedes intentar de nuevo?',
          },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              onClick={() => setIsOpen(true)}
              size="lg"
              aria-label="Abrir asistente"
              className="h-14 w-14 bg-primary hover:bg-primary/90 rounded-full shadow-lg hover:shadow-xl transition-shadow p-0"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={avatarChonga} alt="Chonga" />
                <AvatarFallback>🐕</AvatarFallback>
              </Avatar>
            </Button>
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background animate-pulse" aria-label="Disponible" role="status" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-96 max-h-[500px] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-500/10 to-teal-500/10">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-orange-200">
                  <AvatarImage src={avatarChonga} alt="Chonga" />
                  <AvatarFallback>🐕</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-sm">Chonga</h3>
                  <p className="text-xs text-muted-foreground">Soporte Técnico • En línea</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-2',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role === 'assistant' && (
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarImage src={avatarChonga} alt="Chonga" />
                        <AvatarFallback>🐕</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted rounded-bl-sm'
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2 justify-start">
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarImage src={avatarChonga} alt="Chonga" />
                      <AvatarFallback>🐕</AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
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

            {/* Quick Questions */}
            {messages.length <= 2 && (
              <div className="px-4 pb-2">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  Preguntas frecuentes
                </p>
                <div className="flex flex-wrap gap-1">
                  {QUICK_QUESTIONS.map((q) => (
                    <Button
                      key={q.label}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => sendMessage(q.message)}
                      disabled={isLoading}
                    >
                      {q.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                disabled={isLoading}
                className="flex-1 h-9 text-sm"
              />
              <Button type="submit" size="icon" className="h-9 w-9" disabled={!input.trim() || isLoading} aria-label="Enviar mensaje">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
