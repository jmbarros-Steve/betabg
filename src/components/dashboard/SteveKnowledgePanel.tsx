import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Save, X, BookOpen, Bug, ChevronDown, ChevronUp, Upload, Sparkles, ImageIcon, Loader2, CalendarDays, RefreshCw } from 'lucide-react';
import { LearningCenter } from './LearningCenter';
import { LearningHistory } from './LearningHistory';

type DateFilter = 'today' | 'week' | 'all';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeEntry {
  id: string;
  categoria: string;
  titulo: string;
  contenido: string;
  activo: boolean;
  orden: number;
  created_at: string;
}

interface BugEntry {
  id: string;
  categoria: string;
  descripcion: string;
  ejemplo_malo: string | null;
  ejemplo_bueno: string | null;
  activo: boolean;
  created_at: string;
}

// ─── Tab Config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'seo',      label: '🔍 SEO',                    categoria: 'seo' },
  { id: 'keywords', label: '🔑 Keywords',                categoria: 'keywords' },
  { id: 'meta',     label: '📘 Meta Ads',                categoria: 'meta' },
  { id: 'google',   label: '🟡 Google Ads',              categoria: 'google' },
  { id: 'klaviyo',  label: '📧 Klaviyo',                 categoria: 'klaviyo' },
  { id: 'shopify',  label: '🛍 Shopify',                 categoria: 'shopify' },
  { id: 'brief',    label: '📋 Brief',                   categoria: 'brief' },
  { id: 'buyer_persona', label: '👤 Buyer Persona',      categoria: 'buyer_persona' },
  { id: 'anuncios', label: '🎯 Anuncios',                categoria: 'anuncios' },
  { id: 'analisis', label: '📊 Generación de Análisis',  categoria: 'analisis' },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Empty forms ───────────────────────────────────────────────────────────────

const emptyKnowledge = { titulo: '', contenido: '', orden: 0 };
const emptyBug = { descripcion: '', ejemplo_malo: '', ejemplo_bueno: '' };

// ─── Constants ─────────────────────────────────────────────────────────────────

const ANGULOS_CREATIVOS = [
  { value: 'call_out', label: '📣 Call Out' },
  { value: 'bold_statement', label: '💥 Bold Statement' },
  { value: 'us_vs_them', label: '⚔️ Us vs Them' },
  { value: 'antes_despues', label: '🔄 Antes y Después' },
  { value: 'reviews', label: '⭐ Reviews' },
  { value: 'ugly_ads', label: '📱 Ugly Ads' },
  { value: 'beneficios', label: '✨ Beneficios' },
  { value: 'resultados', label: '📈 Resultados' },
  { value: 'descuentos', label: '🏷️ Descuentos/Ofertas' },
  { value: 'paquetes', label: '📦 Paquetes' },
  { value: 'memes', label: '😂 Memes' },
  { value: 'credenciales', label: '📰 Credenciales en Medios' },
];

// ─── Ad Image Analyzer (Batch) ─────────────────────────────────────────────────

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  mediaType: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  analysis?: string;
  error?: string;
}

function AdImageAnalyzer({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [performance, setPerformance] = useState<string>('no_se');
  const [angulo, setAngulo] = useState<string>('');
  const [context, setContext] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [saveCategory, setSaveCategory] = useState<string>('anuncios');
  const [saving, setSaving] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [dragging, setDragging] = useState(false);

  const doneCount = queue.filter(q => q.status === 'done').length;
  const errorCount = queue.filter(q => q.status === 'error').length;
  const totalCount = queue.length;

  function addFiles(files: File[]) {
    if (!files.length) return;
    const imageFiles = files.filter(f => /^image\/(jpeg|png|webp)$/i.test(f.type));
    const oversized = imageFiles.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length) {
      toast.error(`${oversized.length} archivo(s) superan 10MB y fueron omitidos`);
    }
    const valid = imageFiles.filter(f => f.size <= 10 * 1024 * 1024);
    if (!valid.length) {
      toast.error('No se encontraron imágenes válidas (JPG, PNG, WEBP)');
      return;
    }

    valid.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const item: QueueItem = {
          id: crypto.randomUUID(),
          file,
          previewUrl: result,
          base64: result.split(',')[1],
          mediaType: file.type || 'image/jpeg',
          status: 'pending',
        };
        setQueue(prev => [...prev, item]);
      };
      reader.readAsDataURL(file);
    });

    toast.success(`${valid.length} imagen(es) agregadas a la cola`);
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    addFiles(files);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }

  function removeFromQueue(id: string) {
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  function clearQueue() {
    setQueue([]);
  }

  // Upload image to Storage and save reference to ad_references table
  async function saveReference(item: QueueItem, analysis: string) {
    try {
      // Convert base64 to blob for upload
      const byteChars = atob(item.base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: item.mediaType });

      const ext = item.mediaType.split('/')[1] || 'jpg';
      const filePath = `${angulo}/${Date.now()}_${item.id.slice(0, 8)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('ad-references')
        .upload(filePath, blob, { contentType: item.mediaType });

      if (uploadErr) {
        console.error('Upload error:', uploadErr);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('ad-references')
        .getPublicUrl(filePath);

      // Extract visual patterns from analysis (simple extraction)
      const visualPatterns = {
        raw_analysis: analysis.slice(0, 2000),
        angulo_label: ANGULOS_CREATIVOS.find(a => a.value === angulo)?.label || angulo,
        performance,
      };

      const qualityScore = performance === 'funciono' ? 8 : performance === 'no_funciono' ? 3 : 5;

      // Get client_id from session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientData } = await supabase
        .from('clients')
        .select('id')
        .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();

      if (!clientData) return;

      await supabase.from('ad_references').insert({
        client_id: clientData.id,
        angulo,
        image_url: urlData.publicUrl,
        visual_patterns: visualPatterns,
        quality_score: qualityScore,
      });
    } catch (err) {
      console.error('Error saving reference:', err);
    }
  }

  async function processQueue() {
    const pending = queue.filter(q => q.status === 'pending');
    if (!pending.length) return;

    if (!angulo) {
      toast.error('Selecciona un ángulo creativo antes de analizar');
      return;
    }

    setProcessing(true);

    for (const item of pending) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'analyzing' } : q));

      try {
        const { data, error } = await callApi('analyze-ad-image', {
          body: { imageBase64: item.base64, mediaType: item.mediaType, performance, context },
        });
        if (error) throw error;

        const analysis = data.analysis as string;
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', analysis } : q));

        // Auto-save knowledge + reference
        if (autoSave) {
          const date = new Date().toLocaleDateString('es-CL');
          const anguloLabel = ANGULOS_CREATIVOS.find(a => a.value === angulo)?.label || angulo;
          await supabase.from('steve_knowledge').insert({
            titulo: `Análisis [${anguloLabel}] — ${item.file.name} — ${date}`,
            contenido: analysis,
            categoria: saveCategory,
            activo: true,
            orden: 0,
          });
        }

        // Always save as visual reference
        await saveReference(item, analysis);
      } catch (err) {
        console.error('Error analyzing:', item.file.name, err);
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: err instanceof Error ? err.message : 'Error' } : q));
      }

      // Delay to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }

    setProcessing(false);
    if (autoSave) onSaved();
    toast.success(`Análisis completado: ${pending.length} imagen(es) procesadas y guardadas como referencia`);
  }

  async function saveAllUnsaved() {
    const unsaved = queue.filter(q => q.status === 'done' && q.analysis);
    if (!unsaved.length) return;
    setSaving(true);
    try {
      const date = new Date().toLocaleDateString('es-CL');
      const anguloLabel = ANGULOS_CREATIVOS.find(a => a.value === angulo)?.label || angulo;
      await Promise.all(unsaved.map(item =>
        supabase.from('steve_knowledge').insert({
          titulo: `Análisis [${anguloLabel}] — ${item.file.name} — ${date}`,
          contenido: item.analysis!,
          categoria: saveCategory,
          activo: true,
          orden: 0,
        })
      ));
      toast.success(`${unsaved.length} análisis guardados en Knowledge Base`);
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          🖼 Análisis de Anuncios con IA
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sube múltiples anuncios, clasifícalos por ángulo creativo y Claude Vision los analiza en lote. Las imágenes se guardan como referencias visuales para futuras generaciones.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload area with drag & drop */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFiles}
            multiple={true}
          />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">
            {queue.length ? `Agregar más imágenes (${queue.length} en cola)` : 'Arrastra imágenes aquí o haz clic para seleccionar'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP — máximo 10MB — selección múltiple y drag & drop</p>
        </div>

        {/* Queue preview */}
        {queue.length > 0 && (
          <div className="space-y-3">
            {/* Stats bar */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex gap-3">
                <span className="text-muted-foreground">{totalCount} imagen(es)</span>
                {doneCount > 0 && <span className="text-green-600">✅ {doneCount} listas</span>}
                {errorCount > 0 && <span className="text-destructive">❌ {errorCount} errores</span>}
              </div>
              <Button variant="ghost" size="sm" onClick={clearQueue} className="text-xs h-7">
                <X className="w-3 h-3 mr-1" /> Limpiar cola
              </Button>
            </div>

            {/* Thumbnail grid */}
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 max-h-48 overflow-y-auto">
              {queue.map(item => (
                <div key={item.id} className="relative group aspect-square rounded border border-border overflow-hidden">
                  <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                  <div className={`absolute inset-0 flex items-center justify-center ${
                    item.status === 'analyzing' ? 'bg-primary/30' :
                    item.status === 'done' ? 'bg-green-500/20' :
                    item.status === 'error' ? 'bg-destructive/30' :
                    ''
                  }`}>
                    {item.status === 'analyzing' && <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />}
                    {item.status === 'done' && <span className="text-sm">✅</span>}
                    {item.status === 'error' && <span className="text-sm">❌</span>}
                  </div>
                  {item.status === 'pending' && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Config before processing */}
            <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/20">
              {/* Ángulo creativo — OBLIGATORIO */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary">🎯 Ángulo creativo de estos anuncios *</Label>
                <Select value={angulo} onValueChange={setAngulo}>
                  <SelectTrigger className={`h-9 ${!angulo ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Selecciona el ángulo creativo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ANGULOS_CREATIVOS.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!angulo && <p className="text-xs text-destructive">Obligatorio: clasifica las imágenes por ángulo</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">¿Estos anuncios funcionaron?</Label>
                  <Select value={performance} onValueChange={setPerformance}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="funciono">✅ Sí funcionaron</SelectItem>
                      <SelectItem value="no_funciono">❌ No funcionaron</SelectItem>
                      <SelectItem value="no_se">🤷 No sé / Mixto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Categoría KB</Label>
                  <Select value={saveCategory} onValueChange={setSaveCategory}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anuncios">🎯 Anuncios</SelectItem>
                      <SelectItem value="meta">📘 Meta Ads</SelectItem>
                      <SelectItem value="google">🟡 Google Ads</SelectItem>
                      <SelectItem value="analisis">📊 Análisis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Contexto (aplica a todas)</Label>
                <Textarea
                  rows={2}
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Métricas, plataforma, marca, etc. (opcional)"
                  className="text-sm resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                <Label className="text-xs">Auto-guardar cada análisis en Knowledge Base</Label>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={processQueue}
                disabled={processing || !angulo || !queue.some(q => q.status === 'pending')}
                className="flex-1"
              >
                {processing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analizando {doneCount + errorCount + 1}/{totalCount}…</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" />Analizar {queue.filter(q => q.status === 'pending').length} imagen(es) con Claude Vision</>
                )}
              </Button>
              {!autoSave && doneCount > 0 && (
                <Button onClick={saveAllUnsaved} disabled={saving} variant="outline">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Guardar {doneCount}
                </Button>
              )}
            </div>

            {/* Progress bar */}
            {processing && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${((doneCount + errorCount) / totalCount) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────


function KnowledgeCard({
  entry,
  onEdit,
  onDelete,
  onToggle,
}: {
  entry: KnowledgeEntry;
  onEdit: (e: KnowledgeEntry) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, current: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={`transition-all ${!entry.activo ? 'opacity-50' : ''}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <button
            className="flex-1 text-left"
            onClick={() => setExpanded(v => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{entry.titulo}</span>
              {!entry.activo && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
              {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" /> : <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />}
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={entry.activo}
              onCheckedChange={() => onToggle(entry.id, entry.activo)}
              className="scale-75"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(entry)}>
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(entry.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
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
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap border-t pt-2">
                {entry.contenido}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

function BugCard({
  entry,
  onEdit,
  onDelete,
  onToggle,
}: {
  entry: BugEntry;
  onEdit: (e: BugEntry) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, current: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={`transition-all border-destructive/20 ${!entry.activo ? 'opacity-50' : ''}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <button className="flex-1 text-left" onClick={() => setExpanded(v => !v)}>
            <div className="flex items-center gap-2">
              <Bug className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span className="font-medium text-sm">{entry.descripcion}</span>
              {!entry.activo && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
              {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" /> : <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />}
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <Switch
              checked={entry.activo}
              onCheckedChange={() => onToggle(entry.id, entry.activo)}
              className="scale-75"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(entry)}>
              <Edit className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(entry.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
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
              <div className="mt-2 border-t pt-2 space-y-2">
                {entry.ejemplo_malo && (
                  <div className="bg-destructive/10 rounded p-2">
                    <p className="text-xs font-medium text-destructive mb-1">❌ Ejemplo malo</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.ejemplo_malo}</p>
                  </div>
                )}
                {entry.ejemplo_bueno && (
                  <div className="bg-green-500/10 rounded p-2">
                    <p className="text-xs font-medium text-green-600 mb-1">✅ Ejemplo bueno</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.ejemplo_bueno}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SteveKnowledgePanel() {
  const [activeTab, setActiveTab] = useState<TabId>('seo');
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [bugs, setBugs] = useState<BugEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');

  // Knowledge dialog state
  const [showKnowledgeDialog, setShowKnowledgeDialog] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeEntry | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState(emptyKnowledge);

  // Bug dialog state
  const [showBugDialog, setShowBugDialog] = useState(false);
  const [editingBug, setEditingBug] = useState<BugEntry | null>(null);
  const [bugForm, setBugForm] = useState(emptyBug);

  const currentCategoria = TABS.find(t => t.id === activeTab)?.categoria ?? activeTab;

  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [kRes, bRes] = await Promise.all([
      supabase.from('steve_knowledge').select('*').order('orden').order('created_at'),
      supabase.from('steve_bugs').select('*').order('created_at'),
    ]);
    if (kRes.data) setKnowledge(kRes.data as KnowledgeEntry[]);
    if (bRes.data) setBugs(bRes.data as BugEntry[]);
    setLoading(false);
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
    toast.success('Datos actualizados');
  }

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh every 30 seconds to pick up background changes
  useEffect(() => {
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Knowledge CRUD ──────────────────────────────────────────────────────────

  function openNewKnowledge() {
    setEditingKnowledge(null);
    setKnowledgeForm(emptyKnowledge);
    setShowKnowledgeDialog(true);
  }

  function openEditKnowledge(entry: KnowledgeEntry) {
    setEditingKnowledge(entry);
    setKnowledgeForm({ titulo: entry.titulo, contenido: entry.contenido, orden: entry.orden });
    setShowKnowledgeDialog(true);
  }

  async function saveKnowledge() {
    if (!knowledgeForm.titulo || !knowledgeForm.contenido) return;
    try {
      if (editingKnowledge) {
        await supabase.from('steve_knowledge').update({
          titulo: knowledgeForm.titulo,
          contenido: knowledgeForm.contenido,
          orden: knowledgeForm.orden,
        }).eq('id', editingKnowledge.id);
        toast.success('Conocimiento actualizado');
      } else {
        await supabase.from('steve_knowledge').insert({
          categoria: currentCategoria,
          titulo: knowledgeForm.titulo,
          contenido: knowledgeForm.contenido,
          orden: knowledgeForm.orden,
        });
        toast.success('Conocimiento agregado');
      }
      setShowKnowledgeDialog(false);
      fetchAll();
    } catch {
      toast.error('Error guardando');
    }
  }

  async function deleteKnowledge(id: string) {
    await supabase.from('steve_knowledge').delete().eq('id', id);
    toast.success('Eliminado');
    fetchAll();
  }

  async function toggleKnowledge(id: string, current: boolean) {
    await supabase.from('steve_knowledge').update({ activo: !current }).eq('id', id);
    fetchAll();
  }

  // ── Bug CRUD ────────────────────────────────────────────────────────────────

  function openNewBug() {
    setEditingBug(null);
    setBugForm(emptyBug);
    setShowBugDialog(true);
  }

  function openEditBug(entry: BugEntry) {
    setEditingBug(entry);
    setBugForm({
      descripcion: entry.descripcion,
      ejemplo_malo: entry.ejemplo_malo ?? '',
      ejemplo_bueno: entry.ejemplo_bueno ?? '',
    });
    setShowBugDialog(true);
  }

  async function saveBug() {
    if (!bugForm.descripcion) return;
    try {
      if (editingBug) {
        await supabase.from('steve_bugs').update({
          descripcion: bugForm.descripcion,
          ejemplo_malo: bugForm.ejemplo_malo || null,
          ejemplo_bueno: bugForm.ejemplo_bueno || null,
        }).eq('id', editingBug.id);
        toast.success('Bug actualizado');
      } else {
        await supabase.from('steve_bugs').insert({
          categoria: currentCategoria,
          descripcion: bugForm.descripcion,
          ejemplo_malo: bugForm.ejemplo_malo || null,
          ejemplo_bueno: bugForm.ejemplo_bueno || null,
        });
        toast.success('Bug agregado');
      }
      setShowBugDialog(false);
      fetchAll();
    } catch {
      toast.error('Error guardando');
    }
  }

  async function deleteBug(id: string) {
    await supabase.from('steve_bugs').delete().eq('id', id);
    toast.success('Eliminado');
    fetchAll();
  }

  async function toggleBug(id: string, current: boolean) {
    await supabase.from('steve_bugs').update({ activo: !current }).eq('id', id);
    fetchAll();
  }

  // ── Filtered data ───────────────────────────────────────────────────────────

  // Date filter helpers
  function isWithinFilter(dateStr: string, filter: DateFilter): boolean {
    if (filter === 'all') return true;
    const date = new Date(dateStr);
    const now = new Date();
    if (filter === 'today') {
      return date.toDateString() === now.toDateString();
    }
    if (filter === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return date >= weekAgo;
    }
    return true;
  }

  const filteredKnowledge = knowledge.filter(k =>
    k.categoria === currentCategoria && isWithinFilter(k.created_at, dateFilter)
  );
  const filteredBugs = bugs.filter(b =>
    b.categoria === currentCategoria && isWithinFilter(b.created_at, dateFilter)
  );

  // Global counters (across all categories)
  const totalKnowledge = knowledge.length;
  const todayKnowledge = knowledge.filter(k => isWithinFilter(k.created_at, 'today')).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          Base de Conocimiento de Steve
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona el conocimiento y los bugs de Steve por categoría
        </p>
      </div>

      {/* Date filter + counter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="text-xl">📚</span>
          <span>
            <span className="font-semibold text-foreground">{totalKnowledge}</span> entradas totales
            {todayKnowledge > 0 && (
              <span className="ml-2 text-primary font-medium">— {todayKnowledge} agregadas hoy</span>
            )}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Mostrar:</span>
          {(['today', 'week', 'all'] as DateFilter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={dateFilter === f ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              onClick={() => setDateFilter(f)}
            >
              {f === 'today' ? 'Hoy' : f === 'week' ? 'Esta semana' : 'Todo'}
            </Button>
          ))}
        </div>
      </div>

      {/* Learning Center */}
      <LearningCenter onSaved={fetchAll} />

      {/* Ad Image Analyzer */}
      <AdImageAnalyzer onSaved={fetchAll} />

      {/* Learning History (visible también aquí para acceso directo) */}
      <LearningHistory />

      {/* Category tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabId)}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="flex w-max gap-1 h-auto flex-nowrap">
          {TABS.map(tab => {
            const kCount = knowledge.filter(k => k.categoria === tab.categoria && k.activo).length;
            const bCount = bugs.filter(b => b.categoria === tab.categoria && b.activo).length;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs">
                {tab.label}
                {(kCount + bCount) > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1 py-0">
                    {kCount + bCount}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
          </TabsList>
        </div>

        {TABS.map(tab => (
          <TabsContent key={tab.id} value={tab.id} className="mt-6 space-y-6">

            {/* ── Conocimiento section ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium">
                    Conocimiento
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {filteredKnowledge.length} entradas
                  </Badge>
                </div>
                <Button size="sm" onClick={openNewKnowledge}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agregar
                </Button>
              </div>

              {loading ? (
                <p className="text-muted-foreground text-sm">Cargando…</p>
              ) : filteredKnowledge.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-center">
                    <BookOpen className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground text-sm">
                      No hay conocimiento para esta categoría aún.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={openNewKnowledge}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Agregar primero
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                filteredKnowledge.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <KnowledgeCard
                      entry={entry}
                      onEdit={openEditKnowledge}
                      onDelete={deleteKnowledge}
                      onToggle={toggleKnowledge}
                    />
                  </motion.div>
                ))
              )}
            </div>

            {/* ── Bugs section ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-destructive" />
                  <h3 className="text-sm font-medium">
                    Bugs / Comportamientos a Evitar
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {filteredBugs.length} bugs
                  </Badge>
                </div>
                <Button size="sm" variant="outline" onClick={openNewBug}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agregar Bug
                </Button>
              </div>

              {loading ? (
                <p className="text-muted-foreground text-sm">Cargando…</p>
              ) : filteredBugs.length === 0 ? (
                <Card className="border-destructive/20">
                  <CardContent className="py-6 text-center">
                    <Bug className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground text-sm">
                      No hay bugs registrados para esta categoría.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={openNewBug}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Registrar bug
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                filteredBugs.map((entry, i) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <BugCard
                      entry={entry}
                      onEdit={openEditBug}
                      onDelete={deleteBug}
                      onToggle={toggleBug}
                    />
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Knowledge Dialog ── */}
      <Dialog open={showKnowledgeDialog} onOpenChange={setShowKnowledgeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingKnowledge ? 'Editar Conocimiento' : 'Agregar Conocimiento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={knowledgeForm.titulo}
                onChange={e => setKnowledgeForm(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ej: Cómo calcular el ROAS objetivo"
              />
            </div>
            <div className="space-y-2">
              <Label>Contenido</Label>
              <Textarea
                rows={6}
                value={knowledgeForm.contenido}
                onChange={e => setKnowledgeForm(p => ({ ...p, contenido: e.target.value }))}
                placeholder="Escribe el conocimiento que Steve debe tener sobre este tema…"
              />
            </div>
            <div className="space-y-2">
              <Label>Orden (número)</Label>
              <Input
                type="number"
                value={knowledgeForm.orden}
                onChange={e => setKnowledgeForm(p => ({ ...p, orden: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKnowledgeDialog(false)}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={saveKnowledge} disabled={!knowledgeForm.titulo || !knowledgeForm.contenido}>
              <Save className="w-4 h-4 mr-1" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bug Dialog ── */}
      <Dialog open={showBugDialog} onOpenChange={setShowBugDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBug ? 'Editar Bug' : 'Registrar Bug'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción del bug / comportamiento a evitar</Label>
              <Textarea
                rows={3}
                value={bugForm.descripcion}
                onChange={e => setBugForm(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Ej: Steve recomienda pausar campañas con ROAS > 2 cuando debería escalar"
              />
            </div>
            <div className="space-y-2">
              <Label>❌ Ejemplo Malo (lo que no debe hacer)</Label>
              <Textarea
                rows={3}
                value={bugForm.ejemplo_malo}
                onChange={e => setBugForm(p => ({ ...p, ejemplo_malo: e.target.value }))}
                placeholder="Pega aquí el output incorrecto de Steve…"
              />
            </div>
            <div className="space-y-2">
              <Label>✅ Ejemplo Bueno (lo que sí debe hacer)</Label>
              <Textarea
                rows={3}
                value={bugForm.ejemplo_bueno}
                onChange={e => setBugForm(p => ({ ...p, ejemplo_bueno: e.target.value }))}
                placeholder="Pega aquí la respuesta correcta…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBugDialog(false)}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={saveBug} disabled={!bugForm.descripcion}>
              <Save className="w-4 h-4 mr-1" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
