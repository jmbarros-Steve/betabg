import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Bot, Loader2, Send, CheckCircle, Edit2, Save, X, Bug, BookOpen, RefreshCw } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BugPreview {
  descripcion: string;
  ejemplo_malo?: string;
  ejemplo_bueno?: string;
}

interface EntradaPreview {
  categoria: string;
  titulo: string;
  contenido: string;
  bugs?: BugPreview[];
}

interface TrainResult {
  entradas: EntradaPreview[];
  resumen: string;
  savedKnowledge: number;
  savedBugs: number;
}

// ─── Category map ────────────────────────────────────────────────────────────

const CATEGORIAS = [
  { value: 'auto', label: '🤖 Detectar automáticamente' },
  { value: 'meta_ads', label: '📘 Meta Ads' },
  { value: 'google_ads', label: '🟡 Google Ads' },
  { value: 'seo', label: '🔍 SEO' },
  { value: 'keywords', label: '🔑 Keywords' },
  { value: 'klaviyo', label: '📧 Klaviyo' },
  { value: 'shopify', label: '🛍 Shopify' },
  { value: 'brief', label: '📋 Brief' },
  { value: 'anuncios', label: '🎯 Anuncios' },
  { value: 'buyer_persona', label: '👤 Buyer Persona' },
  { value: 'analisis', label: '📊 Análisis' },
];

function catLabel(cat: string) {
  return CATEGORIAS.find(c => c.value === cat)?.label ?? cat;
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function EntradaCard({
  entrada,
  index,
  editMode,
  onChange,
}: {
  entrada: EntradaPreview;
  index: number;
  editMode: boolean;
  onChange: (updated: EntradaPreview) => void;
}) {
  return (
    <Card className="border-primary/20">
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs font-mono">{catLabel(entrada.categoria)}</Badge>
          <span className="text-xs text-muted-foreground">Entrada {index + 1}</span>
        </div>

        {editMode ? (
          <div className="space-y-2">
            <input
              className="w-full border border-border rounded px-2 py-1 text-sm bg-background"
              value={entrada.titulo}
              onChange={e => onChange({ ...entrada, titulo: e.target.value })}
              placeholder="Título"
            />
            <Textarea
              rows={4}
              className="text-sm resize-none"
              value={entrada.contenido}
              onChange={e => onChange({ ...entrada, contenido: e.target.value })}
              placeholder="Contenido"
            />
          </div>
        ) : (
          <>
            <p className="font-semibold text-sm">{entrada.titulo}</p>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{entrada.contenido}</p>
          </>
        )}

        {(entrada.bugs ?? []).length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-border">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1">
              <Bug className="w-3 h-3" /> {entrada.bugs!.length} bug{entrada.bugs!.length !== 1 ? 's' : ''} detectado{entrada.bugs!.length !== 1 ? 's' : ''}
            </p>
            {entrada.bugs!.map((bug, bi) => (
              <div key={bi} className="bg-destructive/5 border border-destructive/20 rounded p-2 space-y-1">
                <p className="text-xs font-medium">{bug.descripcion}</p>
                {bug.ejemplo_malo && (
                  <p className="text-xs text-muted-foreground">❌ {bug.ejemplo_malo}</p>
                )}
                {bug.ejemplo_bueno && (
                  <p className="text-xs text-muted-foreground">✅ {bug.ejemplo_bueno}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Chat Message ─────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  result?: TrainResult;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SteveTrainingChat({ onSaved }: { onSaved?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: '¡Hola! Soy el Chat de Entrenamiento de Steve. Pega cualquier contenido — artículos, transcripciones, frameworks — y lo estructuraré automáticamente en entradas para la Knowledge Base. ¿Qué quieres enseñarle a Steve hoy?',
    },
  ]);
  const [input, setInput] = useState('');
  const [categoria, setCategoria] = useState('auto');
  const [processing, setProcessing] = useState(false);

  // Preview/edit state (for the last pending result)
  const [pendingResult, setPendingResult] = useState<TrainResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedEntradas, setEditedEntradas] = useState<EntradaPreview[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSend() {
    const text = input.trim();
    if (!text || processing) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setProcessing(true);
    setPendingResult(null);

    try {
      const { data, error } = await callApi('train-steve', {
        body: {
          contenido: text,
          categoriaHint: categoria === 'auto' ? null : categoria,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const result = data as TrainResult;
      setPendingResult(result);
      setEditedEntradas(result.entradas);

      const summary = buildSummaryMessage(result);
      setMessages(prev => [...prev, { role: 'assistant', text: summary, result }]);
    } catch (err) {
      console.error('train-steve error:', err);
      const errMsg = err instanceof Error ? err.message : 'Error desconocido';
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: `❌ Error al procesar: ${errMsg}. Por favor intenta de nuevo.` },
      ]);
    } finally {
      setProcessing(false);
    }
  }

  function buildSummaryMessage(result: TrainResult): string {
    const knowledgeLines = result.entradas
      .map(e => `→ ${e.titulo} — ${catLabel(e.categoria)}`)
      .join('\n');

    return `✅ Steve está listo para aprender:\n${result.resumen}\n\n📚 Entradas a guardar:\n${knowledgeLines}\n\n🐛 Bugs detectados: ${result.entradas.reduce((acc, e) => acc + (e.bugs?.length ?? 0), 0)}\n\nRevisa las entradas abajo antes de confirmar.`;
  }

  async function handleSaveAll() {
    if (!pendingResult) return;
    setSaving(true);

    try {
      // Save edited entradas directly to DB
      let savedKnowledge = 0;
      let savedBugs = 0;

      await Promise.all(
        editedEntradas.map(async (entrada) => {
          const { error: kErr } = await supabase.from('steve_knowledge').insert({
            categoria: entrada.categoria,
            titulo: entrada.titulo,
            contenido: entrada.contenido,
            activo: true,
            orden: 99,
          });
          if (!kErr) savedKnowledge++;

          if (entrada.bugs?.length) {
            await Promise.all(
              entrada.bugs.map(async (bug) => {
                const { error: bErr } = await supabase.from('steve_bugs').insert({
                  categoria: entrada.categoria,
                  descripcion: bug.descripcion,
                  ejemplo_malo: bug.ejemplo_malo || null,
                  ejemplo_bueno: bug.ejemplo_bueno || null,
                  activo: true,
                });
                if (!bErr) savedBugs++;
              })
            );
          }
        })
      );

      toast.success(`✅ ${savedKnowledge} entradas y ${savedBugs} bugs guardados en Steve`);
      setPendingResult(null);
      setEditMode(false);
      setEditedEntradas([]);
      onSaved?.();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `✅ ¡Guardado! Steve aprendió ${savedKnowledge} entrada${savedKnowledge !== 1 ? 's' : ''} y ${savedBugs} bug${savedBugs !== 1 ? 's' : ''} nuevos.\n\n¿Quieres agregar más contenido?`,
        },
      ]);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar en la base de conocimientos');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setPendingResult(null);
    setEditMode(false);
    setEditedEntradas([]);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', text: 'Entradas descartadas. ¿Quieres intentarlo con otro contenido?' },
    ]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="space-y-4 min-h-[400px] border rounded-xl p-4 bg-card">
      {/* Chat History */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-foreground border border-border'
                }`}
              >
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {processing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 justify-start"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted/60 border border-border rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Procesando con Claude...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Preview Panel */}
      <AnimatePresence>
        {pendingResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Vista previa — {pendingResult.entradas.length} entrada{pendingResult.entradas.length !== 1 ? 's' : ''}
                  {pendingResult.entradas.reduce((acc, e) => acc + (e.bugs?.length ?? 0), 0) > 0 && (
                    <Badge variant="destructive" className="text-xs ml-1">
                      {pendingResult.entradas.reduce((acc, e) => acc + (e.bugs?.length ?? 0), 0)} bugs
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Entry cards */}
                <div className="space-y-2">
                  {editedEntradas.map((entrada, i) => (
                    <EntradaCard
                      key={i}
                      entrada={entrada}
                      index={i}
                      editMode={editMode}
                      onChange={(updated) => {
                        const copy = [...editedEntradas];
                        copy[i] = updated;
                        setEditedEntradas(copy);
                      }}
                    />
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="flex items-center gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}
                    ✅ Guardar todas
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditMode(v => !v)}
                    className="flex items-center gap-1.5"
                  >
                    {editMode ? (
                      <><Save className="w-3.5 h-3.5" /> Listo</>
                    ) : (
                      <><Edit2 className="w-3.5 h-3.5" /> ✏️ Editar antes de guardar</>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDiscard}
                    className="flex items-center gap-1.5 text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                    Descartar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <Label className="text-xs shrink-0">Categoría:</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-8 text-xs flex-1 max-w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 items-end">
          <Textarea
            rows={4}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pega aquí el contenido que quieres que Steve aprenda... (Cmd+Enter para enviar)"
            className="resize-none text-sm flex-1"
            disabled={processing}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || processing}
            size="icon"
            className="h-[104px] w-10 shrink-0"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          💡 Pega artículos, transcripciones, aprendizajes de campañas, estrategias, etc. Claude los estructurará automáticamente.
        </p>
      </div>
    </div>
  );
}
