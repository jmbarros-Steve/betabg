import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Send, User, Sparkles, RefreshCw, Upload, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import avatarSteve from '@/assets/avatar-steve.png';
import avatarChonga from '@/assets/avatar-chonga.png';
import { StructuredFieldsForm, type QuestionField } from './StructuredFieldsForm';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// Strip system instruction annotations visible to user
function cleanMessageForDisplay(content: string): string {
  // Remove "⚠️ FORMULARIO: ..." lines that are system instructions
  return content
    .replace(/⚠️ FORMULARIO:[^\n]*/g, '')
    .replace(/Da \d+-\d+ ejemplos[^\n]*/g, '')
    .trim();
}

function parseMessageWithChonga(content: string) {
  const cleaned = cleanMessageForDisplay(content);
  const chongaPattern = /---\s*\n👻\s*\*\*\[ESPÍRITU DE LA CHONGA\]\:\*\*([^]*?)\*desaparece[^*]*\*\s*\n---/g;
  const parts: Array<{ type: 'steve' | 'chonga'; content: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = chongaPattern.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      const stevePart = cleaned.slice(lastIndex, match.index).trim();
      if (stevePart) parts.push({ type: 'steve', content: stevePart });
    }
    parts.push({ type: 'chonga', content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    const remaining = cleaned.slice(lastIndex).trim();
    if (remaining) parts.push({ type: 'steve', content: remaining });
  }

  if (parts.length === 0) parts.push({ type: 'steve', content: cleaned });

  return parts;
}

// Orden igual que en steve-chat (17 preguntas). Para "Ahora: X" y resumen "Lo que ya respondiste".
const BRIEF_QUESTION_LABELS = [
  'URL de tu sitio web',
  'Tu negocio (pitch)',
  'Números (precio, costo, fase)',
  'Canales de venta',
  'Cliente ideal (buyer persona)',
  'Dolor del cliente',
  'Palabras y objeciones del cliente',
  'La transformación (después de usarte)',
  'Estilo de vida del cliente',
  '3 competidores (con URLs)',
  'Análisis de competidores',
  'Tu ventaja incopiable',
  'Vaca púrpura y gran promesa',
  'Villano y garantía',
  'Prueba social y tono',
  'Identidad visual (colores, estilo)',
  'Archivos visuales (logo y fotos)',
];

interface SteveChatProps {
  clientId: string;
}

export function SteveChat({ clientId }: SteveChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<'research' | 'strategy' | 'done' | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 15 });
  const [examples, setExamples] = useState<string[]>([]);
  const [currentFields, setCurrentFields] = useState<QuestionField[]>([]);
  const [fieldValidation, setFieldValidation] = useState<string | undefined>();
  const [showAssetUpload, setShowAssetUpload] = useState(false);
  const [uploadingAssets, setUploadingAssets] = useState<string | null>(null);
  const [uploadedAssets, setUploadedAssets] = useState<{ logo: string[]; products: string[] }>({ logo: [], products: [] });
  // Delay showing the next interaction block so user can read Steve's response
  const [showInteraction, setShowInteraction] = useState(true);
  const [currentQuestionLabel, setCurrentQuestionLabel] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [acceptedResponses, setAcceptedResponses] = useState<Array<{label: string; content: string}>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

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
  }, [messages, currentFields, showAssetUpload, showInteraction]);

  // Show asset upload when we're on Q15
  useEffect(() => {
    if (progress.answered >= 14 && !isComplete) {
      setShowAssetUpload(true);
      loadExistingAssets();
    }
  }, [progress.answered]);

  // Delay interaction elements after new assistant message so user reads first
  useEffect(() => {
    if (isLoading) {
      setShowInteraction(false);
    }
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      const timer = setTimeout(() => setShowInteraction(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isLoading, messages.length]);

  async function loadExistingAssets() {
    if (!user) return;
    const loaded: typeof uploadedAssets = { logo: [], products: [] };
    for (const cat of ['logo', 'products'] as const) {
      const { data } = await supabase.storage
        .from('client-assets')
        .list(`${user.id}/${cat}`, { limit: 20 });
      if (data) {
        loaded[cat] = data.map(f => {
          const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(`${user.id}/${cat}/${f.name}`);
          return urlData.publicUrl;
        });
      }
    }
    setUploadedAssets(loaded);
  }

  async function handleAssetUpload(category: 'logo' | 'products', files: FileList | null) {
    if (!files || !user) return;
    setUploadingAssets(category);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${category}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('client-assets').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('client-assets').getPublicUrl(path);
        newUrls.push(urlData.publicUrl);

        // Also save to client_assets table so it appears in the Assets gallery
        await supabase.from('client_assets').insert({
          client_id: clientId,
          url: urlData.publicUrl,
          nombre: file.name,
          tipo: category === 'logo' ? 'logo' : 'producto',
        });
      }
      setUploadedAssets(prev => ({ ...prev, [category]: [...prev[category], ...newUrls] }));
      if (category === 'logo' && newUrls.length > 0) {
        await supabase.from('clients').update({ logo_url: newUrls[newUrls.length - 1] }).eq('id', clientId);
      }
      toast.success(`${files.length} archivo(s) subido(s)`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error al subir archivo. Verifica que el archivo sea menor a 5MB.');
    } finally {
      setUploadingAssets(null);
    }
  }

  async function handleDeleteAsset(category: 'logo' | 'products', url: string) {
    if (!user) return;
    try {
      const pathMatch = url.match(/client-assets\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from('client-assets').remove([pathMatch[1]]);
      }
      setUploadedAssets(prev => ({ ...prev, [category]: prev[category].filter(u => u !== url) }));
      toast.success('Archivo eliminado');
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  async function initializeConversation() {
    setIsInitializing(true);
    try {
      const { data: existingConvs, error: convError } = await supabase
        .from('steve_conversations')
        .select('id')
        .eq('client_id', clientId)
        .eq('conversation_type', 'brief')
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
          const userMsgCount = existingMessages.filter(m => m.role === 'user').length;
          const { data: persona } = await supabase
            .from('buyer_personas')
            .select('is_complete, persona_data')
            .eq('client_id', clientId)
            .maybeSingle();
          const acceptedCount = (persona?.persona_data as { answered_count?: number } | null)?.answered_count;
          const rawResponses: string[] = (persona?.persona_data as any)?.raw_responses ?? [];
          setAcceptedResponses(rawResponses.map((content: string, i: number) => ({
            label: BRIEF_QUESTION_LABELS[i] ?? `Pregunta ${i + 1}`,
            content,
          })));
          const progressAnswered = typeof acceptedCount === 'number' ? acceptedCount : userMsgCount;
          setProgress({ answered: progressAnswered, total: 17 });
          setCurrentQuestionLabel(BRIEF_QUESTION_LABELS[Math.min(progressAnswered, BRIEF_QUESTION_LABELS.length - 1)] ?? null);
          setIsComplete(persona?.is_complete || false);

          // Check if analysis is in progress (user might have refreshed while it was running)
          if (persona?.is_complete) {
            const { data: analysisRow } = await supabase
              .from('brand_research')
              .select('research_data')
              .eq('client_id', clientId)
              .eq('research_type', 'analysis_status')
              .maybeSingle();
            const status = (analysisRow?.research_data as any)?.status;
            if (status === 'pending' || status === 'in_progress') {
              setIsAnalyzing(true);
              setAnalysisPhase('research');
            }
          }
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
    const WELCOME_MESSAGE = '¡Hola! Soy Steve, tu consultor de performance marketing. Voy a ayudarte a construir el brief estratégico de tu marca — un documento que va a definir exactamente cómo hacer crecer tu negocio online. Son 15 preguntas y toma unos 20 minutos. ¿Empezamos? Primero necesito saber: ¿Cuál es tu sitio web o tienda online?';

    try {
      // Use edge function to create conversation — it uses service_role and bypasses RLS.
      // This is required for both regular clients AND super admins viewing a client's portal.
      const { data, error } = await callApi('steve-chat', {
        body: { client_id: clientId },
      });

      if (error) throw error;

      if (data?.conversation_id) {
        setConversationId(data.conversation_id);
        setMessages([{
          id: crypto.randomUUID(),
          role: 'assistant',
          content: WELCOME_MESSAGE,
          created_at: new Date().toISOString(),
        }]);
        setProgress({ answered: 0, total: data.total_questions ?? 17 });
        setCurrentQuestionLabel(data.current_question_label ?? BRIEF_QUESTION_LABELS[0]);
        setExamples(data.examples ?? []);
        setCurrentFields(data.fields ?? []);
        setFieldValidation(data.field_validation);
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
      toast.error('Error al iniciar conversación con Steve');
    }
  }

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading || !conversationId) return;
    const userMessage = messageText.trim();
    setInput('');
    setExamples([]);
    setCurrentFields([]);
    setFieldValidation(undefined);
    setShowInteraction(false);
    
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
        if (data.rejected) {
          // Remove the rejected user message from chat so index mapping stays clean
          setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
          setShowInteraction(true);
          toast.info('Steve no aceptó la respuesta. Puedes volver a intentar con la misma pregunta abajo.');
        } else {
          // Track accepted response only when the counter actually advances
          const prevAnswered = progress.answered;
          const newAnswered = data.answered_count ?? prevAnswered;
          if (newAnswered > prevAnswered) {
            setAcceptedResponses(prev => {
              const copy = [...prev];
              copy[prevAnswered] = {
                label: BRIEF_QUESTION_LABELS[prevAnswered] ?? `Pregunta ${prevAnswered + 1}`,
                content: userMessage,
              };
              return copy;
            });
          }
          if (data.answered_count !== undefined) {
            setProgress({ answered: data.answered_count, total: data.total_questions ?? 17 });
          }
          if (data.current_question_label != null) setCurrentQuestionLabel(data.current_question_label);
          else if (data.answered_count != null && !data.is_complete) setCurrentQuestionLabel(BRIEF_QUESTION_LABELS[Math.min(data.answered_count, BRIEF_QUESTION_LABELS.length - 1)] ?? null);
        }
        // Always sync examples and fields from response so they never show stale data
        setExamples(data.examples ?? []);
        setCurrentFields(data.fields ?? []);
        setFieldValidation(data.field_validation);
      if (data.is_complete) {
          setIsComplete(true);
          toast.success('¡Brief de Marca completado! 🎉');
          // Trigger analysis chain from frontend since edge function fire-and-forget
          // gets killed by Deno after returning the response.
          triggerAnalysisChain(clientId);
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

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleStructuredSubmit(formattedMessage: string) {
    sendMessage(formattedMessage);
  }

  function handleExampleClick(example: string) {
    setInput(example);
    inputRef.current?.focus();
  }

  // Trigger the two-phase analysis chain (research → strategy) from the frontend.
  // This replaces the fire-and-forget pattern in steve-chat which gets killed by Deno.
  async function triggerAnalysisChain(cId: string) {
    setIsAnalyzing(true);
    setAnalysisPhase('research');
    try {
      // Get client website URL
      const { data: clientData } = await supabase.from('clients').select('website_url').eq('id', cId).single();
      // Get competitor URLs
      const { data: competitors } = await supabase.from('competitor_tracking').select('store_url').eq('client_id', cId).eq('is_active', true);
      const competitorUrls = (competitors || []).map(c => c.store_url).filter(Boolean);

      // Phase 1: Research (scraping + AI competitor detection)
      const { data: researchData, error: researchErr } = await callApi('analyze-brand-research', {
        body: { client_id: cId, website_url: clientData?.website_url, competitor_urls: competitorUrls },
      });
      if (researchErr || !researchData?.research) {
        console.error('[triggerAnalysis] Research failed:', researchErr || researchData);
        await supabase.from('brand_research').upsert({
          client_id: cId, research_type: 'analysis_status',
          research_data: { status: 'error', error: researchErr?.message || 'Research failed' },
        }, { onConflict: 'client_id,research_type' });
        setIsAnalyzing(false);
        setAnalysisPhase(null);
        toast.error('Error en el análisis. Intenta de nuevo desde la pestaña Brief.');
        return;
      }

      // Phase 2: Strategy (12 parallel Claude Sonnet calls)
      setAnalysisPhase('strategy');
      const { data: strategyData, error: strategyErr } = await callApi('analyze-brand-strategy', {
        body: { client_id: cId, research: researchData.research },
      });
      if (strategyErr) {
        console.error('[triggerAnalysis] Strategy failed:', strategyErr);
        await supabase.from('brand_research').upsert({
          client_id: cId, research_type: 'analysis_status',
          research_data: { status: 'error', error: strategyErr?.message || 'Strategy failed' },
        }, { onConflict: 'client_id,research_type' });
        setIsAnalyzing(false);
        setAnalysisPhase(null);
        toast.error('Error en la estrategia. Intenta de nuevo desde la pestaña Brief.');
        return;
      }

      // Mark complete
      await supabase.from('brand_research').upsert({
        client_id: cId, research_type: 'analysis_status',
        research_data: { status: 'complete', research_completed_at: new Date().toISOString(), strategy_completed_at: new Date().toISOString() },
      }, { onConflict: 'client_id,research_type' });

      setAnalysisPhase('done');
      toast.success('¡Análisis completo! Revisa las pestañas Brief, Competencia y SEO.');
      // Keep the "done" phase visible for a few seconds, then hide
      setTimeout(() => {
        setIsAnalyzing(false);
        setAnalysisPhase(null);
      }, 5000);
    } catch (err) {
      console.error('[triggerAnalysis] Error:', err);
      setIsAnalyzing(false);
      setAnalysisPhase(null);
      toast.error('Error inesperado en el análisis.');
    }
  }

  async function handleRestart() {
    if (!confirm('¿Estás seguro de que quieres reiniciar la conversación?')) return;

    const oldConversationId = conversationId;

    // Reset ALL local state
    setMessages([]);
    setConversationId(null);
    setIsComplete(false);
    setProgress({ answered: 0, total: 17 });
    setExamples([]);
    setCurrentFields([]);
    setFieldValidation(undefined);
    setShowAssetUpload(false);
    setAcceptedResponses([]);
    setCurrentQuestionLabel(null);
    setShowSummary(false);

    // Delete old data from DB (messages first, then conversation)
    if (oldConversationId) {
      await supabase.from('steve_messages').delete().eq('conversation_id', oldConversationId);
      await supabase.from('steve_conversations').delete().eq('id', oldConversationId);
    }
    await supabase.from('buyer_personas').delete().eq('client_id', clientId);
    await startNewConversation();
  }

  const progressPercent = Math.round((progress.answered / progress.total) * 100);
  const hasStructuredFields = currentFields.length > 0 && !isLoading && !isComplete;

  const summaryItems = acceptedResponses.map((resp, i) => ({
    label: resp.label,
    content: resp.content,
    excerpt: resp.content.length > 60 ? resp.content.slice(0, 60).trim() + '…' : resp.content,
  }));

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');

  if (isInitializing) {
    return (
      <Card className="h-[900px]">
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
    <Card className="h-[calc(100vh-120px)] min-h-[700px] max-h-[1100px] flex flex-col">
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

        {!isComplete && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progreso del Brief</span>
              <span className="font-medium text-foreground">{progressPercent}% ({progress.answered}/{progress.total})</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            {currentQuestionLabel && (
              <p className="text-xs text-primary font-medium mt-1.5">Ahora: {currentQuestionLabel}</p>
            )}
          </div>
        )}
      </CardHeader>

      {/* Resumen de lo que ya respondiste — colapsable */}
      {summaryItems.length > 0 && !isComplete && (
        <div className="border-b px-4 py-2 flex-shrink-0 bg-muted/30">
          <button
            type="button"
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-2 w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showSummary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Lo que ya respondiste ({summaryItems.length})
          </button>
          {showSummary && (
            <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
              {summaryItems.map((item, i) => (
                <div key={i} className="text-xs">
                  <span className="font-medium text-foreground">{i + 1}. {item.label}</span>
                  <p className="text-muted-foreground truncate pl-0.5">{item.excerpt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="space-y-6">
          {messages.map((message, msgIndex) => (
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
                parseMessageWithChonga(message.content).map((part, partIndex) => (
                  <div key={`${message.id}-${partIndex}`} className={cn(
                    "flex gap-3 justify-start",
                    partIndex > 0 && "mt-4"
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
                      "max-w-[85%] rounded-2xl px-5 py-4 text-[0.9rem] rounded-bl-md shadow-sm",
                      part.type === 'chonga' 
                        ? "bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800" 
                        : "bg-muted"
                    )}>
                      {part.type === 'chonga' && (
                        <div className="flex items-center gap-1 mb-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                          <span>👻</span>
                          <span>Espíritu de La Chonga</span>
                        </div>
                      )}
                      <div className="max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                        <div className="prose prose-sm dark:prose-invert max-w-none leading-[1.75] [&>p]:mb-3 [&>p:last-child]:mb-0 [&>ul]:my-3 [&>ol]:my-3 [&>ul>li]:mb-1.5 [&>ol>li]:mb-1.5 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>h1]:mt-4 [&>h2]:mt-3 [&>h3]:mt-3 [&>h1]:mb-2 [&>h2]:mb-2 [&>h3]:mb-2 [&>blockquote]:border-l-primary [&>blockquote]:pl-3 [&>blockquote]:italic [&>hr]:my-3 [&_strong]:text-foreground [&_table]:text-xs [&_table]:my-3 [&_th]:px-2 [&_th]:py-1.5 [&_td]:px-2 [&_td]:py-1.5">
                          <ReactMarkdown>{part.content}</ReactMarkdown>
                        </div>
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
              <div className="bg-muted rounded-2xl rounded-bl-md px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {progress.answered >= progress.total - 1 && (
                    <span className="text-xs text-muted-foreground ml-1 animate-pulse">
                      Generando tu Brief estratégico... esto toma ~2 min
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Interaction area — delayed appearance so user reads Steve's answer */}
      {showInteraction && (
        <>
          {/* Contexto de la pregunta anterior + tu respuesta — visible card */}
          {hasStructuredFields && lastUserMessage && (
            <div className="px-4 pt-2 flex-shrink-0">
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 mb-2">
                <p className="text-xs font-semibold text-primary mb-1">Tu respuesta anterior:</p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{lastUserMessage.content}</p>
              </div>
            </div>
          )}

          {/* Asset Upload for Q15 — inline in chat */}
          {showAssetUpload && !isLoading && (
            <div className="px-4 pb-2 flex-shrink-0 border-t pt-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <p className="text-xs font-medium text-muted-foreground mb-2">📸 Sube tus archivos aquí (obligatorio para el brief):</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Logo upload */}
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs font-medium mb-2">🎨 Logo</p>
                  {uploadedAssets.logo.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {uploadedAssets.logo.map((url, i) => (
                        <div key={i} className="relative group">
                          <img src={url} alt="Logo" className="h-12 w-12 object-contain rounded border border-border bg-background" />
                          <button onClick={() => handleDeleteAsset('logo', url)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <input type="file" ref={logoInputRef} accept="image/*" onChange={e => handleAssetUpload('logo', e.target.files)} className="hidden" />
                  <Button variant="outline" size="sm" className="w-full text-xs" disabled={uploadingAssets === 'logo'} onClick={() => logoInputRef.current?.click()}>
                    {uploadingAssets === 'logo' ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Subiendo...</> : <><Upload className="h-3 w-3 mr-1" /> {uploadedAssets.logo.length > 0 ? 'Cambiar' : 'Subir Logo'}</>}
                  </Button>
                </div>

                {/* Product photos upload */}
                <div className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-xs font-medium mb-2">📷 Fotos Productos</p>
                  {uploadedAssets.products.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {uploadedAssets.products.map((url, i) => (
                        <div key={i} className="relative group">
                          <img src={url} alt={`Producto ${i+1}`} className="h-12 w-12 object-cover rounded border border-border" />
                          <button onClick={() => handleDeleteAsset('products', url)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <input type="file" ref={photosInputRef} accept="image/*" multiple onChange={e => handleAssetUpload('products', e.target.files)} className="hidden" />
                  <Button variant="outline" size="sm" className="w-full text-xs" disabled={uploadingAssets === 'products'} onClick={() => photosInputRef.current?.click()}>
                    {uploadingAssets === 'products' ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Subiendo...</> : <><Upload className="h-3 w-3 mr-1" /> Subir Fotos ({uploadedAssets.products.length})</>}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Structured Fields Form */}
          {hasStructuredFields && (
            <div className="px-4 pb-2 flex-shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* Show Steve's last question above the form */}
              {lastAssistantMessage && (
                <div className="bg-muted/60 border border-border rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={avatarSteve} alt="Steve" />
                      <AvatarFallback className="text-[10px]">🐕</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold text-primary">Pregunta de Steve:</span>
                  </div>
                  <div className="prose prose-xs dark:prose-invert max-w-none text-xs [&>p]:mb-1 [&>p:last-child]:mb-0 leading-relaxed">
                    <ReactMarkdown>{cleanMessageForDisplay(lastAssistantMessage.content).split('\n').slice(0, 6).join('\n')}</ReactMarkdown>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mb-2">📝 Llena los campos y envía tu respuesta:</p>
              <StructuredFieldsForm
                fields={currentFields}
                validation={fieldValidation}
                onSubmit={handleStructuredSubmit}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* Example Suggestions */}
          {examples.length > 0 && !hasStructuredFields && !isLoading && !isComplete && (
            <div className="px-4 pb-2 flex-shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
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
        </>
      )}

      {/* Input */}
      <div className="p-4 border-t flex-shrink-0">
        {!isComplete && currentQuestionLabel && (
          <p className="text-xs text-muted-foreground mb-2">Responde sobre: <span className="font-medium text-foreground">{currentQuestionLabel}</span></p>
        )}
        {isComplete ? (
          <div className="text-center py-2 space-y-3">
            {isAnalyzing && analysisPhase && analysisPhase !== 'done' && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mx-2 animate-in fade-in duration-500">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {analysisPhase === 'research'
                      ? 'Investigando tu sitio web y competidores...'
                      : 'Generando estrategia de marketing con IA...'}
                  </span>
                </div>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
                  {analysisPhase === 'research'
                    ? 'Escaneando sitios web, detectando competidores y recopilando datos (1-3 min)'
                    : 'Analizando posicionamiento, audiencia, SEO y más (1-2 min)'}
                </p>
              </div>
            )}
            {analysisPhase === 'done' && (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3 mx-2 animate-in fade-in duration-500">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  ¡Análisis completo! Revisa las pestañas Brief, Competencia y SEO.
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
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
              placeholder={
                hasStructuredFields && showInteraction
                  ? "¿Tienes alguna pregunta para Steve? Escribe aquí..."
                  : examples.length > 0
                  ? "Usa un ejemplo de arriba o escribe con tus palabras..."
                  : "Escribe tu respuesta..."
              }
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
