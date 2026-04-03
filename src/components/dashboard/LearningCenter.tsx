import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Brain, Youtube, FileText, Globe, Type, Upload, Loader2,
  Check, X, ChevronDown, ChevronUp, Save, Plus, ListPlus,
} from 'lucide-react';
import { LearningQueue } from './LearningQueue';
import { LearningHistory } from './LearningHistory';

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtractedRule {
  titulo: string;
  contenido: string;
  categoria: string;
  active: boolean; // local toggle
}

type SourceTab = 'youtube' | 'document' | 'url' | 'text';
type ProcessingPhase = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

const CATEGORY_COLORS: Record<string, string> = {
  brief: 'bg-[#1E3A7B]/15 text-[#162D5F] border-[#7B9BCF]',
  seo: 'bg-green-500/15 text-green-700 border-green-300',
  meta_ads: 'bg-purple-500/15 text-purple-700 border-purple-300',
  meta: 'bg-indigo-500/15 text-indigo-700 border-indigo-300',
  google: 'bg-red-500/15 text-red-700 border-red-300',
  shopify: 'bg-orange-500/15 text-orange-700 border-orange-300',
  klaviyo: 'bg-pink-500/15 text-pink-700 border-pink-300',
  anuncios: 'bg-yellow-500/15 text-yellow-700 border-yellow-300',
  buyer_persona: 'bg-cyan-500/15 text-cyan-700 border-cyan-300',
  keywords: 'bg-gray-500/15 text-gray-700 border-gray-300',
  analisis: 'bg-emerald-500/15 text-emerald-700 border-emerald-300',
  cross_channel: 'bg-violet-500/15 text-violet-700 border-violet-300',
  sales_learning: 'bg-amber-500/15 text-amber-700 border-amber-300',
};

const CATEGORIES = [
  { value: 'brief', label: '📋 Brief' },
  { value: 'seo', label: '🔍 SEO' },
  { value: 'keywords', label: '🔑 Keywords' },
  { value: 'meta_ads', label: '📘 Meta Ads' },
  { value: 'meta', label: '📱 Meta' },
  { value: 'google', label: '🟡 Google Ads' },
  { value: 'shopify', label: '🛍 Shopify' },
  { value: 'klaviyo', label: '📧 Klaviyo' },
  { value: 'anuncios', label: '🎯 Anuncios' },
  { value: 'buyer_persona', label: '👤 Buyer Persona' },
  { value: 'analisis', label: '📊 Análisis' },
  { value: 'cross_channel', label: '🔗 Cross Channel' },
  { value: 'sales_learning', label: '💼 Sales' },
];

// ── Queue item for batch processing ──────────────────────────────────────────

interface QueueItem {
  id: string;
  sourceType: SourceTab;
  content: string;
  title: string;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function LearningCenter({ onSaved }: { onSaved: () => void }) {
  const [activeSource, setActiveSource] = useState<SourceTab>('youtube');
  const [phase, setPhase] = useState<ProcessingPhase>('idle');
  const [phaseMessage, setPhaseMessage] = useState('');
  const [rules, setRules] = useState<ExtractedRule[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const [currentQueueId, setCurrentQueueId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Input states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [freeText, setFreeText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('El archivo supera 20MB');
      return;
    }

    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (!validTypes.includes(file.type)) {
      toast.error('Solo se aceptan PDF, DOCX o TXT');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setFileBase64(result.split(',')[1]);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Process source ─────────────────────────────────────────────────────────

  async function processSource(sourceType: SourceTab, content: string, title?: string) {
    if (!content.trim()) {
      toast.error('No hay contenido para procesar');
      return;
    }

    setRules([]);
    setPhase('extracting');
    setIsSending(true);

    const phaseMessages: Record<SourceTab, string> = {
      youtube: 'Descargando transcripción del video...',
      document: 'Procesando documento...',
      url: 'Extrayendo contenido del artículo...',
      text: 'Preparando texto...',
    };
    setPhaseMessage(phaseMessages[sourceType]);

    try {
      await new Promise(r => setTimeout(r, 500));
      setPhaseMessage('Encolando procesamiento...');

      const { data, error } = await callApi('learn-from-source', {
        body: { sourceType, content, title },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.status === 'duplicate') {
        toast.info('Este contenido ya está en la cola');
        setPhase('idle');
        setPhaseMessage('');
        return;
      }

      if (data?.status === 'already_processed') {
        toast.info('Este contenido ya fue procesado anteriormente.');
        setPhase('idle');
        setPhaseMessage('');
        return;
      }

      if (!data?.queueId) {
        throw new Error('No se pudo crear el item de cola');
      }

      setCurrentQueueId(data.queueId || null);

      void callApi('process-queue-item', {
        body: { queueId: data.queueId },
      }).catch(() => {
        // Fire-and-forget — errors silently ignored
      });

      setRules([]);
      setPhase('done');
      setPhaseMessage('✅ Fuente en procesamiento. Revisa el estado en la cola/historial.');
      toast.success('Fuente enviada a procesamiento en background');
    } catch (err) {
      setPhase('error');
      setPhaseMessage(err instanceof Error ? err.message : 'Error desconocido');
      toast.error('Error al procesar la fuente');
    } finally {
      setIsSending(false);
    }
  }

  function handleLearn() {
    switch (activeSource) {
      case 'youtube':
        processSource('youtube', youtubeUrl, 'Video YouTube');
        break;
      case 'document':
        processSource('document', fileBase64, fileName);
        break;
      case 'url':
        processSource('url', articleUrl, 'Artículo web');
        break;
      case 'text':
        processSource('text', freeText, 'Texto libre');
        break;
    }
  }

  function addToQueue() {
    let content = '';
    let title = '';
    switch (activeSource) {
      case 'youtube':
        content = youtubeUrl;
        title = `YouTube: ${youtubeUrl.slice(0, 50)}`;
        break;
      case 'document':
        content = fileBase64;
        title = `Doc: ${fileName}`;
        break;
      case 'url':
        content = articleUrl;
        title = `URL: ${articleUrl.slice(0, 50)}`;
        break;
      case 'text':
        content = freeText;
        title = `Texto: ${freeText.slice(0, 50)}...`;
        break;
    }
    if (!content.trim()) {
      toast.error('No hay contenido para agregar');
      return;
    }
    setQueue(prev => [...prev, {
      id: crypto.randomUUID(),
      sourceType: activeSource,
      content,
      title,
    }]);
    toast.success('Agregado a la cola');
    // Clear the input
    clearCurrentInput();
  }

  function clearCurrentInput() {
    switch (activeSource) {
      case 'youtube': setYoutubeUrl(''); break;
      case 'document': setFileBase64(''); setFileName(''); break;
      case 'url': setArticleUrl(''); break;
      case 'text': setFreeText(''); break;
    }
  }

  function removeFromQueue(id: string) {
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  // ── Toggle / category change ───────────────────────────────────────────────

  function toggleRule(index: number) {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, active: !r.active } : r));
  }

  function changeCategory(index: number, newCat: string) {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, categoria: newCat } : r));
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function saveRules(onlyActive: boolean) {
    const toSave = onlyActive ? rules.filter(r => r.active) : rules;
    if (!toSave.length) {
      toast.error('No hay reglas para guardar');
      return;
    }

    setSavingAll(true);
    try {
      const inserts = toSave.map(r => ({
        categoria: r.categoria,
        titulo: r.titulo.slice(0, 80),
        contenido: r.contenido,
        activo: true,
        orden: 99,
        source_id: currentQueueId || null,
      }));

      const { error } = await supabase.from('steve_knowledge').insert(inserts);
      if (error) throw error;

      toast.success(`${toSave.length} reglas guardadas en Knowledge Base`);
      setRules([]);
      setCurrentQueueId(null);
      setPhase('idle');
      onSaved();
    } catch {
      toast.error('Error al guardar reglas');
    } finally {
      setSavingAll(false);
    }
  }

  function discardAll() {
    setRules([]);
    setPhase('idle');
    setPhaseMessage('');
  }

  // ── Current input has content ──────────────────────────────────────────────

  function hasContent(): boolean {
    switch (activeSource) {
      case 'youtube': return !!youtubeUrl.trim();
      case 'document': return !!fileBase64;
      case 'url': return !!articleUrl.trim();
      case 'text': return !!freeText.trim();
    }
  }

  const learnLabel: Record<SourceTab, string> = {
    youtube: 'Aprender de este video',
    document: 'Aprender de este documento',
    url: 'Aprender de este artículo',
    text: 'Aprender de este texto',
  };

  const activeRulesCount = rules.filter(r => r.active).length;
  const isProcessing = phase === 'extracting' || phase === 'analyzing' || isSending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          🧠 Centro de Aprendizaje — Entrenar a Steve
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Alimenta la base de conocimiento con videos, documentos, artículos o texto libre. Claude extraerá reglas accionables automáticamente.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Results screen ── */}
        {rules.length > 0 && (
          <ResultsReview
            rules={rules}
            onToggle={toggleRule}
            onChangeCategory={changeCategory}
            onSaveActive={() => saveRules(true)}
            onSaveAll={() => saveRules(false)}
            onDiscard={discardAll}
            activeCount={activeRulesCount}
            saving={savingAll}
          />
        )}

        {/* ── Source tabs ── */}
        {rules.length === 0 && (
          <>
            <Tabs value={activeSource} onValueChange={v => setActiveSource(v as SourceTab)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="youtube" className="text-xs gap-1">
                  <Youtube className="w-3.5 h-3.5" /> YouTube
                </TabsTrigger>
                <TabsTrigger value="document" className="text-xs gap-1">
                  <FileText className="w-3.5 h-3.5" /> Documento
                </TabsTrigger>
                <TabsTrigger value="url" className="text-xs gap-1">
                  <Globe className="w-3.5 h-3.5" /> URL
                </TabsTrigger>
                <TabsTrigger value="text" className="text-xs gap-1">
                  <Type className="w-3.5 h-3.5" /> Texto
                </TabsTrigger>
              </TabsList>

              {/* YouTube */}
              <TabsContent value="youtube" className="mt-3 space-y-3">
                <Input
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="text-sm"
                />
              </TabsContent>

              {/* Document */}
              <TabsContent value="document" className="mt-3 space-y-3">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  {fileName ? (
                    <p className="text-sm font-medium text-primary">{fileName}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Arrastra o selecciona un archivo</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT — máximo 20MB</p>
                    </>
                  )}
                </div>
              </TabsContent>

              {/* URL */}
              <TabsContent value="url" className="mt-3 space-y-3">
                <Input
                  value={articleUrl}
                  onChange={e => setArticleUrl(e.target.value)}
                  placeholder="https://blog.ejemplo.com/articulo..."
                  className="text-sm"
                />
              </TabsContent>

              {/* Text */}
              <TabsContent value="text" className="mt-3 space-y-3">
                <Textarea
                  value={freeText}
                  onChange={e => setFreeText(e.target.value)}
                  placeholder="Pega aquí notas de una reunión, apuntes de un curso, o cualquier texto de marketing..."
                  className="text-sm resize-none"
                  style={{ minHeight: '200px' }}
                />
              </TabsContent>
            </Tabs>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleLearn}
                disabled={!hasContent() || isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{phaseMessage}</>
                ) : (
                  <><Brain className="w-4 h-4 mr-2" />{learnLabel[activeSource]}</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={addToQueue}
                disabled={!hasContent() || isProcessing}
                className="shrink-0"
              >
                <ListPlus className="w-4 h-4 mr-1" /> Agregar a la cola
              </Button>
            </div>

            {/* Progress indicator */}
            {isProcessing && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">{phaseMessage}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Esto puede tomar unos segundos...</p>
                </div>
              </div>
            )}

            {/* Error state */}
            {phase === 'error' && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                ❌ {phaseMessage}
              </div>
            )}

            {/* Queue */}
            {queue.length > 0 && (
              <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    Cola de aprendizaje ({queue.length})
                  </p>
                  <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setQueue([])}>
                    <X className="w-3 h-3 mr-1" /> Limpiar
                  </Button>
                </div>
                {queue.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-xs p-2 rounded bg-background border border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.sourceType === 'youtube' && <Youtube className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      {item.sourceType === 'document' && <FileText className="w-3.5 h-3.5 text-[#2A4F9E] shrink-0" />}
                      {item.sourceType === 'url' && <Globe className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      {item.sourceType === 'text' && <Type className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => removeFromQueue(item.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Learning Queue section ── */}
            <LearningQueue />

            {/* ── Learning History section ── */}
            <LearningHistory />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Results Review Component ─────────────────────────────────────────────────

function ResultsReview({
  rules,
  onToggle,
  onChangeCategory,
  onSaveActive,
  onSaveAll,
  onDiscard,
  activeCount,
  saving,
}: {
  rules: ExtractedRule[];
  onToggle: (i: number) => void;
  onChangeCategory: (i: number, cat: string) => void;
  onSaveActive: () => void;
  onSaveAll: () => void;
  onDiscard: () => void;
  activeCount: number;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Check className="w-4 h-4 text-green-600" />
          {rules.length} reglas extraídas — Revisar antes de guardar
        </h3>
        <Badge variant="outline" className="text-xs">
          {activeCount} activas
        </Badge>
      </div>

      {/* Rule cards */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {rules.map((rule, i) => (
          <RuleCard
            key={i}
            rule={rule}
            index={i}
            onToggle={onToggle}
            onChangeCategory={onChangeCategory}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={onSaveActive}
          disabled={saving || activeCount === 0}
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          ✅ Confirmar y guardar {activeCount} reglas
        </Button>
        <Button
          variant="secondary"
          onClick={onSaveAll}
          disabled={saving}
          className="shrink-0"
        >
          <Save className="w-4 h-4 mr-1" /> Guardar todo sin revisar
        </Button>
        <Button
          variant="outline"
          onClick={onDiscard}
          disabled={saving}
          className="shrink-0"
        >
          <X className="w-4 h-4 mr-1" /> Cancelar
        </Button>
      </div>
    </div>
  );
}

// ── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  index,
  onToggle,
  onChangeCategory,
}: {
  rule: ExtractedRule;
  index: number;
  onToggle: (i: number) => void;
  onChangeCategory: (i: number, cat: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = CATEGORY_COLORS[rule.categoria] || CATEGORY_COLORS.analisis;
  const preview = rule.contenido.split('\n').slice(0, 2).join(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Card className={`transition-all ${!rule.active ? 'opacity-50' : ''}`}>
        <CardContent className="py-3 px-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{rule.titulo}</span>
                <Badge variant="outline" className={`text-xs border ${colorClass}`}>
                  {rule.categoria}
                </Badge>
              </div>
              <button
                onClick={() => setExpanded(v => !v)}
                className="text-left w-full mt-1"
              >
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {preview}
                </p>
                <span className="text-xs text-primary mt-0.5 inline-flex items-center gap-1">
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expanded ? 'Menos' : 'Ver más'}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select value={rule.categoria} onValueChange={v => onChangeCategory(index, v)}>
                <SelectTrigger className="h-7 w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                checked={rule.active}
                onCheckedChange={() => onToggle(index)}
                className="scale-75"
              />
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2 mt-1">
                  {rule.contenido}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
