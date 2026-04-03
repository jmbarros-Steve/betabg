import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronDown, Search, Loader2, ThumbsUp, ThumbsDown,
  MessageSquare, Brain, X, Send, Users, CheckCircle2, BookOpen,
  TrendingUp, ArrowRight, Globe, FileText, AlertTriangle, Flag, ExternalLink
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
import { ProspectDetail as ProspectDetailCRM } from './ProspectDetail';

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
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
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
      const ruleIds: string[] = message.metadata?.rule_ids || [];

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

      if (rating === 'good') {
        // Create good example in steve_knowledge
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

        // Boost rules used: orden += 5 (cap 100)
        if (ruleIds.length > 0) {
          for (const ruleId of ruleIds) {
            const { data: rule } = await supabase
              .from('steve_knowledge')
              .select('orden')
              .eq('id', ruleId)
              .maybeSingle();
            if (rule) {
              await supabase
                .from('steve_knowledge')
                .update({ orden: Math.min((rule.orden || 0) + 5, 100) })
                .eq('id', ruleId);
            }
          }
        }

        toast.success('Ejemplo bueno guardado + reglas reforzadas');
      } else {
        // Bad rating: create CORRECCION rule + steve_bugs + degrade rules
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

        // Create CORRECCION rule with high priority if correction text provided
        if (correction.trim()) {
          const { error: corrErr } = await supabase
            .from('steve_knowledge')
            .insert({
              categoria: 'prospecting',
              titulo: `CORRECCION: ${prospect.stage} — ${prospect.what_they_sell || 'general'}`,
              contenido: `CONTEXTO: Prospecto de ${prospect.what_they_sell || 'industria desconocida'} en stage ${prospect.stage}\nRESPUESTA INCORRECTA: ${message.body}\nRESPUESTA CORRECTA: ${correction}${notes ? `\nNOTA: ${notes}` : ''}`,
              activo: true,
              orden: 99,
            });
          if (corrErr) throw corrErr;
        }

        // Degrade rules used: orden -= 10
        if (ruleIds.length > 0) {
          for (const ruleId of ruleIds) {
            const { data: rule } = await supabase
              .from('steve_knowledge')
              .select('orden')
              .eq('id', ruleId)
              .maybeSingle();
            if (rule) {
              await supabase
                .from('steve_knowledge')
                .update({ orden: Math.max((rule.orden || 0) - 10, 0) })
                .eq('id', ruleId);
            }
          }
        }

        toast.success(correction.trim()
          ? 'Bug + corrección guardados, reglas degradadas'
          : 'Bug registrado, reglas degradadas');
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

            {/* Rule count indicator */}
            {(message.metadata?.rule_ids?.length || 0) > 0 && (
              <p className="text-xs text-slate-400">
                Este mensaje usó {message.metadata!.rule_ids.length} regla(s) de steve_knowledge
              </p>
            )}

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
                <p className="text-xs text-slate-400 mt-1">
                  Se creará una regla CORRECCION de prioridad máxima que Steve usará en futuros mensajes
                </p>
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

// ─── Rules Dialog ────────────────────────────────────────────────────────────

interface KnowledgeRule {
  id: string;
  titulo: string | null;
  categoria: string | null;
  orden: number | null;
  contenido: string | null;
}

function RulesDialog({
  open,
  onOpenChange,
  ruleIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ruleIds: string[];
}) {
  const [rules, setRules] = useState<KnowledgeRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [flagging, setFlagging] = useState<string | null>(null);

  useEffect(() => {
    if (open && ruleIds.length > 0) {
      fetchRules();
    }
  }, [open, ruleIds]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('steve_knowledge')
        .select('id, titulo, categoria, orden, contenido')
        .in('id', ruleIds);
      if (error) throw error;
      setRules(data || []);
    } catch {
      toast.error('Error cargando reglas');
    } finally {
      setLoading(false);
    }
  };

  const handleFlag = async (ruleId: string) => {
    setFlagging(ruleId);
    try {
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) return;
      const newOrden = Math.max((rule.orden || 0) - 10, 0);
      const { error } = await supabase
        .from('steve_knowledge')
        .update({ orden: newOrden })
        .eq('id', ruleId);
      if (error) throw error;
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, orden: newOrden } : r));
      toast.success(`Regla degradada: orden ${rule.orden} → ${newOrden}`);
    } catch (err: any) {
      toast.error(err.message || 'Error al degradar regla');
    } finally {
      setFlagging(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Reglas usadas en este mensaje ({ruleIds.length})
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No se encontraron reglas</p>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">
                      {rule.categoria}
                    </Badge>
                    <span className="text-sm font-medium text-slate-700">
                      {rule.titulo || '(sin título)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">
                      orden: {rule.orden ?? 0}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                      onClick={() => handleFlag(rule.id)}
                      disabled={flagging === rule.id}
                      title="Degradar regla (orden -10)"
                    >
                      {flagging === rule.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Flag className="w-3.5 h-3.5" />
                      }
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 whitespace-pre-wrap leading-relaxed">
                  {(rule.contenido || '').slice(0, 300)}
                  {(rule.contenido || '').length > 300 && '...'}
                </p>
              </div>
            ))}
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
  onShowRules,
}: {
  msg: WaMessage;
  onRate: (msg: WaMessage) => void;
  onShowRules: (ruleIds: string[]) => void;
}) {
  const isOutbound = msg.direction === 'outbound';
  const existingRating = msg.metadata?.rating as string | undefined;
  const ruleIds: string[] = msg.metadata?.rule_ids || [];

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
        <div className={`flex items-center gap-2 mt-1 text-[10px] ${isOutbound ? 'text-blue-200' : 'text-slate-400'}`}>
          <span>
            {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {existingRating && (
            <span>{existingRating === 'good' ? '👍' : '👎'}</span>
          )}
          {/* Rules badge */}
          {isOutbound && ruleIds.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onShowRules(ruleIds); }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors cursor-pointer"
              title="Ver reglas usadas"
            >
              <FileText className="w-2.5 h-2.5" />
              {ruleIds.length} regla{ruleIds.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>

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
  const [rulesDialogOpen, setRulesDialogOpen] = useState(false);
  const [rulesDialogIds, setRulesDialogIds] = useState<string[]>([]);

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

  const handleShowRules = (ruleIds: string[]) => {
    setRulesDialogIds(ruleIds);
    setRulesDialogOpen(true);
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
                <MessageBubble key={msg.id} msg={msg} onRate={handleRate} onShowRules={handleShowRules} />
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

      {/* Rules dialog */}
      <RulesDialog
        open={rulesDialogOpen}
        onOpenChange={setRulesDialogOpen}
        ruleIds={rulesDialogIds}
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
  const [crmDetailId, setCrmDetailId] = useState<string | null>(null);

  useEffect(() => {
    fetchProspects();
  }, []);

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wa_prospects')
        .select('id, phone, profile_name, name, company, what_they_sell, stage, lead_score, message_count, updated_at, created_at, utm_source, utm_medium, utm_campaign')
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

      {/* Funnel visualization */}
      {(() => {
        const funnelStages = ['discovery', 'qualifying', 'pitching', 'closing', 'converted'] as const;
        const funnelColors = ['bg-cyan-500', 'bg-amber-500', 'bg-purple-500', 'bg-green-500', 'bg-emerald-600'];
        const funnelCounts = funnelStages.map(s => stageCounts[s] || 0);
        const maxCount = Math.max(...funnelCounts, 1);

        // UTM breakdown
        const utmCounts: Record<string, number> = {};
        prospects.forEach(p => {
          const src = p.utm_source || 'directo';
          utmCounts[src] = (utmCounts[src] || 0) + 1;
        });
        const utmEntries = Object.entries(utmCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Funnel */}
            <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Funnel de ventas
              </h3>
              <div className="space-y-2">
                {funnelStages.map((stage, i) => {
                  const count = funnelCounts[i];
                  const pct = totalProspects > 0 ? ((count / totalProspects) * 100).toFixed(0) : '0';
                  const convRate = i > 0 && funnelCounts[i - 1] > 0
                    ? ((count / funnelCounts[i - 1]) * 100).toFixed(0) + '%'
                    : null;
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <div className="w-24 text-xs font-medium text-slate-600 text-right capitalize">{stage}</div>
                      <div className="flex-1 h-7 bg-slate-100 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full ${funnelColors[i]} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.max((count / maxCount) * 100, count > 0 ? 8 : 0)}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
                          {count} ({pct}%)
                        </span>
                      </div>
                      {convRate && (
                        <div className="w-14 text-xs text-slate-400 flex items-center gap-0.5">
                          <ArrowRight className="w-3 h-3" /> {convRate}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-400">
                <span>Lost: {stageCounts['lost'] || 0}</span>
                <span>New: {stageCounts['new'] || 0}</span>
                <span>Total: {totalProspects}</span>
              </div>
            </div>

            {/* UTM breakdown */}
            <div className="rounded-xl bg-white border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Fuentes (UTM)
              </h3>
              <div className="space-y-2">
                {utmEntries.map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 capitalize">{src}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${(count / totalProspects) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-500 w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
                {utmEntries.length === 0 && (
                  <p className="text-xs text-slate-400">Sin datos UTM</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-[#1E3A7B]"
                      onClick={(e) => { e.stopPropagation(); setCrmDetailId(prospect.id); }}
                      title="Ficha CRM"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
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

      {crmDetailId && (
        <ProspectDetailCRM
          prospectId={crmDetailId}
          open={!!crmDetailId}
          onOpenChange={(open) => !open && setCrmDetailId(null)}
        />
      )}
    </div>
  );
}
