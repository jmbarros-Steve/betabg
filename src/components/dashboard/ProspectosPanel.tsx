import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronDown, Search, Loader2, ThumbsUp, ThumbsDown,
  MessageSquare, Brain, X, Send, Users, CheckCircle2, BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Prospect {
  id: string;
  phone: string;
  profile_name: string | null;
  name: string | null;
  company: string | null;
  what_they_sell: string | null;
  stage: string;
  lead_score: number | null;
  message_count: number;
  updated_at: string;
  created_at: string;
}

interface WaMessage {
  id: string;
  direction: string;
  body: string | null;
  created_at: string;
  contact_name: string | null;
  metadata: Record<string, any> | null;
}

type Stage = 'all' | 'new' | 'discovery' | 'qualifying' | 'pitching' | 'closing' | 'converted' | 'lost';

const STAGES: { value: Stage; label: string; color: string }[] = [
  { value: 'all', label: 'Todos', color: 'bg-slate-100 text-slate-700' },
  { value: 'new', label: 'Nuevo', color: 'bg-blue-100 text-blue-700' },
  { value: 'discovery', label: 'Discovery', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'qualifying', label: 'Qualifying', color: 'bg-amber-100 text-amber-700' },
  { value: 'pitching', label: 'Pitching', color: 'bg-purple-100 text-purple-700' },
  { value: 'closing', label: 'Closing', color: 'bg-green-100 text-green-700' },
  { value: 'converted', label: 'Convertido', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'lost', label: 'Perdido', color: 'bg-red-100 text-red-700' },
];

function getStageBadge(stage: string) {
  const s = STAGES.find(st => st.value === stage);
  return s ? <Badge className={`${s.color} border-0`}>{s.label}</Badge> : <Badge variant="outline">{stage}</Badge>;
}

// ─── Rating Dialog ──────────────────────────────────────────────────────────

function RatingDialog({
  open,
  onOpenChange,
  message,
  prospect,
  onRated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  message: WaMessage | null;
  prospect: Prospect | null;
  onRated: () => void;
}) {
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [notes, setNotes] = useState('');
  const [correction, setCorrection] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRating(null);
      setNotes('');
      setCorrection('');
    }
  }, [open]);

  const handleSave = async () => {
    if (!rating || !message || !prospect) return;
    setSaving(true);
    try {
      // 1. Update wa_messages.metadata with rating
      const existingMeta = message.metadata || {};
      const newMeta = {
        ...existingMeta,
        rating,
        rating_notes: notes || undefined,
        rated_at: new Date().toISOString(),
      };
      const { error: updateErr } = await supabase
        .from('wa_messages')
        .update({ metadata: newMeta })
        .eq('id', message.id);
      if (updateErr) throw updateErr;

      // 2. Insert training data
      if (rating === 'good') {
        const { error: knErr } = await supabase
          .from('steve_knowledge')
          .insert({
            categoria: 'prospecting',
            titulo: `Ejemplo bueno (${prospect.what_they_sell || 'general'}, ${prospect.stage}) — ${new Date().toLocaleDateString('es-CL')}`,
            contenido: `CONTEXTO: Prospecto ${prospect.name || prospect.profile_name || prospect.phone} — ${prospect.company || 'sin empresa'} — Stage: ${prospect.stage} — Score: ${prospect.lead_score ?? 0}\nPROSPECTO: (conversación previa)\nSTEVE (buena respuesta): ${message.body}${notes ? `\nNOTA ADMIN: ${notes}` : ''}`,
            activo: true,
            orden: 99,
          });
        if (knErr) throw knErr;
        toast.success('Ejemplo bueno guardado en steve_knowledge');
      } else {
        const { error: bugErr } = await supabase
          .from('steve_bugs')
          .insert({
            categoria: 'prospecting',
            descripcion: `Respuesta débil en ${prospect.stage} con prospecto de ${prospect.what_they_sell || 'industria desconocida'}`,
            ejemplo_malo: message.body,
            ejemplo_bueno: correction || null,
            activo: true,
          });
        if (bugErr) throw bugErr;
        toast.success('Bug registrado en steve_bugs');
      }

      onRated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar calificación');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Calificar mensaje de Steve</DialogTitle>
        </DialogHeader>
        {message && (
          <div className="space-y-4">
            {/* Message preview */}
            <div className="rounded-lg bg-blue-50 p-3 text-sm">
              <p className="text-xs text-blue-500 mb-1 font-medium">Mensaje de Steve:</p>
              <p className="text-slate-800">{message.body}</p>
            </div>

            {/* Rating buttons */}
            <div className="flex gap-3">
              <Button
                variant={rating === 'good' ? 'default' : 'outline'}
                className={rating === 'good' ? 'bg-green-600 hover:bg-green-700' : ''}
                onClick={() => setRating('good')}
              >
                <ThumbsUp className="w-4 h-4 mr-2" /> Buena respuesta
              </Button>
              <Button
                variant={rating === 'bad' ? 'default' : 'outline'}
                className={rating === 'bad' ? 'bg-red-600 hover:bg-red-700' : ''}
                onClick={() => setRating('bad')}
              >
                <ThumbsDown className="w-4 h-4 mr-2" /> Mala respuesta
              </Button>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-slate-700">Notas (opcional)</label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="¿Por qué es buena/mala esta respuesta?"
                rows={2}
              />
            </div>

            {/* Correction for bad ratings */}
            {rating === 'bad' && (
              <div>
                <label className="text-sm font-medium text-slate-700">¿Qué debería haber dicho Steve?</label>
                <Textarea
                  value={correction}
                  onChange={e => setCorrection(e.target.value)}
                  placeholder="Escribe la respuesta correcta que Steve debería haber dado..."
                  rows={3}
                />
              </div>
            )}

            {/* Save */}
            <Button onClick={handleSave} disabled={!rating || saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar calificación
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onRate,
}: {
  msg: WaMessage;
  onRate: (msg: WaMessage) => void;
}) {
  const isOutbound = msg.direction === 'outbound';
  const existingRating = msg.metadata?.rating as string | undefined;

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm relative ${
          isOutbound
            ? 'bg-[#1E3A7B] text-white rounded-br-md'
            : 'bg-slate-100 text-slate-800 rounded-bl-md'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.body || '(sin contenido)'}</p>
        <p className={`text-[10px] mt-1 ${isOutbound ? 'text-blue-200' : 'text-slate-400'}`}>
          {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          {existingRating && (
            <span className="ml-2">
              {existingRating === 'good' ? '👍' : '👎'}
            </span>
          )}
        </p>

        {/* Rating buttons for outbound messages */}
        {isOutbound && !existingRating && (
          <div className="absolute -left-20 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
            <button
              onClick={() => onRate(msg)}
              className="p-1.5 rounded-full bg-white border border-slate-200 shadow-sm hover:bg-green-50 transition-colors"
              title="Calificar mensaje"
            >
              <ThumbsUp className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Prospect Detail ────────────────────────────────────────────────────────

function ProspectDetail({
  prospect,
  onClose,
}: {
  prospect: Prospect;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [ratingMsg, setRatingMsg] = useState<WaMessage | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [training, setTraining] = useState(false);

  useEffect(() => {
    fetchMessages();
  }, [prospect.id]);

  const fetchMessages = async () => {
    setLoadingMsgs(true);
    try {
      const { data, error } = await supabase
        .from('wa_messages')
        .select('id, direction, body, created_at, contact_name, metadata')
        .eq('contact_phone', prospect.phone)
        .is('client_id', null)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch {
      toast.error('Error cargando mensajes');
    } finally {
      setLoadingMsgs(false);
    }
  };

  const handleRate = (msg: WaMessage) => {
    setRatingMsg(msg);
    setRatingOpen(true);
  };

  const handleBulkTrain = async () => {
    if (messages.length === 0) return;
    setTraining(true);
    try {
      const transcript = messages
        .map(m => `[${m.direction === 'outbound' ? 'STEVE' : 'PROSPECTO'}] ${m.body || ''}`)
        .join('\n');

      const { error } = await callApi('train-steve', {
        body: {
          contenido: `CONVERSACIÓN CON PROSPECTO: ${prospect.name || prospect.profile_name || prospect.phone}\nEmpresa: ${prospect.company || 'N/A'}\nVende: ${prospect.what_they_sell || 'N/A'}\nStage: ${prospect.stage}\nScore: ${prospect.lead_score ?? 0}\n\n${transcript}`,
          categoriaHint: 'prospecting',
        },
      });

      if (error) throw new Error(error);
      toast.success('Conversación enviada a entrenar');
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar a entrenar');
    } finally {
      setTraining(false);
    }
  };

  const ratedCount = messages.filter(m => m.metadata?.rating).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mt-2 mb-4 rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {getStageBadge(prospect.stage)}
          {prospect.lead_score != null && prospect.lead_score > 0 && (
            <Badge variant="outline" className="font-mono text-xs">Score: {prospect.lead_score}</Badge>
          )}
          {ratedCount > 0 && (
            <span className="text-xs text-slate-400">{ratedCount} calificado(s)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkTrain}
            disabled={training || messages.length === 0}
          >
            {training ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
            Enviar a entrenar
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Left: Prospect info card */}
        <div className="p-4 border-r border-slate-100 space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Datos del prospecto</h4>
          <div className="space-y-2 text-sm">
            {[
              { label: 'Nombre', value: prospect.name || prospect.profile_name || '—' },
              { label: 'Teléfono', value: prospect.phone },
              { label: 'Empresa', value: prospect.company || '—' },
              { label: 'Vende', value: prospect.what_they_sell || '—' },
              { label: 'Mensajes', value: prospect.message_count.toString() },
              { label: 'Último contacto', value: new Date(prospect.updated_at).toLocaleDateString('es-CL') },
              { label: 'Primer contacto', value: new Date(prospect.created_at).toLocaleDateString('es-CL') },
            ].map(item => (
              <div key={item.label} className="flex justify-between">
                <span className="text-slate-400">{item.label}</span>
                <span className="font-medium text-slate-700 text-right max-w-[60%] truncate">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Chat */}
        <div className="lg:col-span-2 flex flex-col">
          {loadingMsgs ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
              Sin mensajes
            </div>
          ) : (
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onRate={handleRate} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rating dialog */}
      <RatingDialog
        open={ratingOpen}
        onOpenChange={setRatingOpen}
        message={ratingMsg}
        prospect={prospect}
        onRated={fetchMessages}
      />
    </motion.div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function ProspectosPanel() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Stage>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchProspects();
  }, []);

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wa_prospects')
        .select('id, phone, profile_name, name, company, what_they_sell, stage, lead_score, message_count, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setProspects(data || []);
    } catch {
      toast.error('Error cargando prospectos');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = prospects;
    if (stageFilter !== 'all') {
      result = result.filter(p => p.stage === stageFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.profile_name ?? '').toLowerCase().includes(q) ||
        (p.company ?? '').toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        (p.what_they_sell ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [prospects, stageFilter, search]);

  // Stats
  const totalProspects = prospects.length;
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    prospects.forEach(p => { counts[p.stage] = (counts[p.stage] || 0) + 1; });
    return counts;
  }, [prospects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Prospectos WhatsApp</h2>
          <p className="text-muted-foreground">{totalProspects} prospectos en total</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar prospecto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center card-hover">
          <div className="text-2xl font-bold text-blue-600">{totalProspects}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <Users className="w-3 h-3" /> Total prospectos
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center card-hover">
          <div className="text-2xl font-bold text-green-600">{stageCounts['qualifying'] || 0}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <MessageSquare className="w-3 h-3" /> En qualifying+
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 text-center card-hover">
          <div className="text-2xl font-bold text-purple-600">{stageCounts['converted'] || 0}</div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
            <BookOpen className="w-3 h-3" /> Convertidos
          </div>
        </div>
      </div>

      {/* Stage filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map(stage => (
          <button
            key={stage.value}
            onClick={() => setStageFilter(stage.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              stageFilter === stage.value
                ? 'bg-[#1E3A7B] text-white shadow-sm'
                : `${stage.color} hover:opacity-80`
            }`}
          >
            {stage.label}
            {stage.value !== 'all' && stageCounts[stage.value] ? ` (${stageCounts[stage.value]})` : ''}
          </button>
        ))}
      </div>

      {/* Prospect list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {prospects.length === 0 ? 'No hay prospectos aún' : 'No hay prospectos que coincidan'}
          </div>
        )}
        {filtered.map((prospect, index) => {
          const isExpanded = expandedId === prospect.id;

          return (
            <div key={prospect.id}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className={`rounded-xl border transition-colors cursor-pointer ${
                  isExpanded
                    ? 'border-primary/40 bg-white'
                    : 'border-slate-200 bg-white hover:border-primary/20'
                }`}
                onClick={() => setExpandedId(isExpanded ? null : prospect.id)}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    }
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          {prospect.name || prospect.profile_name || prospect.phone}
                        </span>
                        {prospect.company && (
                          <span className="text-sm text-muted-foreground">· {prospect.company}</span>
                        )}
                        {prospect.what_they_sell && (
                          <span className="text-xs text-muted-foreground italic">({prospect.what_they_sell})</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {prospect.phone}
                        {' · '}{prospect.message_count} msgs
                        {' · '}{new Date(prospect.updated_at).toLocaleDateString('es-CL')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {getStageBadge(prospect.stage)}
                    {prospect.lead_score != null && prospect.lead_score > 0 && (
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground">Score</div>
                        <div className="text-sm font-mono font-semibold">{prospect.lead_score}</div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              <AnimatePresence>
                {isExpanded && (
                  <ProspectDetail
                    key={`detail-${prospect.id}`}
                    prospect={prospect}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
