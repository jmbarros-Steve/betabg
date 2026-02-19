import { useState, useEffect } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Edit, Save, X, BookOpen, Bug, ChevronDown, ChevronUp } from 'lucide-react';

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

  // Knowledge dialog state
  const [showKnowledgeDialog, setShowKnowledgeDialog] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeEntry | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState(emptyKnowledge);

  // Bug dialog state
  const [showBugDialog, setShowBugDialog] = useState(false);
  const [editingBug, setEditingBug] = useState<BugEntry | null>(null);
  const [bugForm, setBugForm] = useState(emptyBug);

  const currentCategoria = TABS.find(t => t.id === activeTab)?.categoria ?? activeTab;

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [kRes, bRes] = await Promise.all([
      supabase.from('steve_knowledge').select('*').order('orden').order('created_at'),
      supabase.from('steve_bugs').select('*').order('created_at'),
    ]);
    if (kRes.data) setKnowledge(kRes.data as KnowledgeEntry[]);
    if (bRes.data) setBugs(bRes.data as BugEntry[]);
    setLoading(false);
  }

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

  const filteredKnowledge = knowledge.filter(k => k.categoria === currentCategoria);
  const filteredBugs = bugs.filter(b => b.categoria === currentCategoria);

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
                  <h3 className="font-semibold text-sm uppercase tracking-wider">
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
                  <h3 className="font-semibold text-sm uppercase tracking-wider">
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
