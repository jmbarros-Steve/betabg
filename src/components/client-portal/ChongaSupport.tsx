import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, HelpCircle, AlertTriangle } from 'lucide-react';
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
  { label: 'No veo mis datos', message: 'No veo datos en mis métricas, ¿qué hago?' },
  { label: 'Crear ticket', message: 'Quiero crear un ticket de soporte' },
];

interface ChongaSupportProps {
  clientId: string;
}

// Load knowledge base once
let _kbCache: string | null = null;
async function loadKnowledgeBase(): Promise<string> {
  if (_kbCache) return _kbCache;
  try {
    const res = await fetch('/steve-soporte.md');
    if (res.ok) {
      _kbCache = await res.text();
      return _kbCache;
    }
  } catch {}
  return '';
}

export function ChongaSupport({ clientId }: ChongaSupportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '¡Guau! 🐕 Hola, soy Chonga, tu asistente de soporte. ¿En qué puedo ayudarte hoy?\n\nPuedo guiarte para conectar plataformas, usar cualquier herramienta del portal o resolver problemas técnicos.\n\nSi no puedo resolver algo, puedo crear un ticket para el equipo.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticketMode, setTicketMode] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const escalationTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (escalationTimerRef.current) clearTimeout(escalationTimerRef.current);
    };
  }, []);

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

  // Preload KB when chat opens
  useEffect(() => {
    if (isOpen) loadKnowledgeBase();
  }, [isOpen]);

  async function createTicket(subject: string) {
    try {
      const conversationSummary = messages
        .slice(1) // skip greeting
        .map(m => `${m.role === 'user' ? 'Cliente' : 'Chonga'}: ${m.content}`)
        .join('\n');

      const { error } = await supabase.from('support_tickets' as any).insert({
        client_id: clientId,
        subject,
        conversation: conversationSummary,
        status: 'open',
        priority: 'medium',
      });

      if (error) {
        // If table doesn't exist, try tasks table as fallback
        await supabase.from('tasks' as any).insert({
          title: `[Soporte] ${subject}`,
          description: `Ticket de soporte creado desde Chonga.\n\nConversación:\n${conversationSummary}`,
          status: 'open',
          priority: 'medium',
          assigned_to: null,
          metadata: { type: 'support', client_id: clientId },
        });
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `✅ ¡Ticket creado! El equipo lo revisará pronto.\n\n📋 **Asunto:** ${subject}\n\nTambién puedes contactar directamente:\n• 📧 jmbarros@bgconsult.cl\n• 💬 WhatsApp (botón verde abajo)\n\n¡Arf! No te preocupes, lo resolveremos 🐕`,
      }]);
      setTicketMode(false);
      setTicketSubject('');
    } catch {
      toast.error('Error al crear ticket. Intenta de nuevo.');
    }
  }

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading) return;

    // Detect ticket intent
    const lowerMsg = messageText.toLowerCase();
    if (lowerMsg.includes('ticket') || lowerMsg.includes('hablar con alguien') || lowerMsg.includes('soporte humano')) {
      setTicketMode(true);
      setMessages(prev => [...prev,
        { id: crypto.randomUUID(), role: 'user', content: messageText.trim() },
        { id: crypto.randomUUID(), role: 'assistant', content: '🎫 ¡Claro! Voy a crear un ticket para el equipo.\n\nDescribe brevemente tu problema en el campo de abajo y lo envío.' },
      ]);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const kb = await loadKnowledgeBase();

      const { data, error } = await callApi('chonga-support', {
        body: {
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          client_id: clientId,
          knowledge_base: kb,
        },
      });

      if (error) throw error;

      const reply = data?.message || '¡Arf! Disculpa, tuve un problemita. ¿Puedes repetir tu pregunta?';

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If bot suggests escalation, offer ticket
      if (reply.toLowerCase().includes('ticket') || reply.toLowerCase().includes('equipo técnico')) {
        escalationTimerRef.current = setTimeout(() => {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '¿Quieres que cree un ticket para el equipo? Escribe "crear ticket" o sigue preguntándome 🐕',
          }]);
        }, 1000);
      }
    } catch (error: unknown) {
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
            content: '¡Ups! 🐕 Tuve un problemita técnico. ¿Puedes intentar de nuevo?\n\nSi el error persiste, puedo crear un ticket para el equipo. Escribe "crear ticket".',
          },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ticketMode) {
      if (input.trim()) {
        createTicket(input.trim());
      }
    } else {
      sendMessage(input);
    }
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
            className="fixed bottom-6 right-6 z-50 w-96 max-h-[540px] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-orange-500/10 to-teal-500/10">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-orange-200">
                  <AvatarImage src={avatarChonga} alt="Chonga" />
                  <AvatarFallback>🐕</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-sm">Chonga — Soporte</h3>
                  <p className="text-xs text-muted-foreground">Conozco toda la plataforma</p>
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
            {messages.length <= 2 && !ticketMode && (
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

            {/* Ticket mode banner */}
            {ticketMode && (
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Describe tu problema para crear el ticket
                </div>
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={ticketMode ? 'Describe tu problema...' : 'Escribe tu pregunta...'}
                disabled={isLoading}
                className="flex-1 h-9 text-sm"
              />
              <Button type="submit" size="icon" className="h-9 w-9" disabled={!input.trim() || isLoading} aria-label={ticketMode ? 'Crear ticket' : 'Enviar mensaje'}>
                {ticketMode ? <AlertTriangle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
