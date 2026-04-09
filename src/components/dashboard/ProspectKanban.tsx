import { useEffect, useState, useCallback, DragEvent } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, User, Building2, TrendingUp, MessageSquare,
  Calendar, GripVertical, Info, ChevronDown, ChevronUp,
  DollarSign, AlertTriangle, Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { ProspectDetail } from './ProspectDetail';
import { CalendarConnect } from './CalendarConnect';

interface KanbanProspect {
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
  priority: string | null;
  tags: string[] | null;
  meeting_status: string | null;
  meeting_at: string | null;
  apellido: string | null;
  deal_value: number | null;
  win_probability: number | null;
  is_rotting: boolean | null;
}

const STAGES = [
  { id: 'new', label: 'Nuevo', color: 'bg-blue-500', bgLight: 'bg-blue-50 border-blue-200' },
  { id: 'discovery', label: 'Discovery', color: 'bg-cyan-500', bgLight: 'bg-cyan-50 border-cyan-200' },
  { id: 'qualifying', label: 'Qualifying', color: 'bg-amber-500', bgLight: 'bg-amber-50 border-amber-200' },
  { id: 'pitching', label: 'Pitching', color: 'bg-purple-500', bgLight: 'bg-purple-50 border-purple-200' },
  { id: 'closing', label: 'Closing', color: 'bg-green-500', bgLight: 'bg-green-50 border-green-200' },
  { id: 'converted', label: 'Convertido', color: 'bg-emerald-500', bgLight: 'bg-emerald-50 border-emerald-200' },
  { id: 'lost', label: 'Perdido', color: 'bg-red-500', bgLight: 'bg-red-50 border-red-200' },
];

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `$${value.toLocaleString()}`;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-slate-400';
  return (
    <span className={`text-[10px] font-mono ${color} flex items-center gap-0.5`}>
      <TrendingUp className="w-3 h-3" />
      {score}
    </span>
  );
}

export function ProspectKanban() {
  const [kanban, setKanban] = useState<Record<string, KanbanProspect[]>>({});
  const [stageTotals, setStageTotals] = useState<Record<string, { total: number; weighted: number; count: number }>>({});
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [pipelineWeighted, setPipelineWeighted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dragProspectId, setDragProspectId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchKanban = useCallback(async () => {
    try {
      const { data, error } = await callApi('crm/prospects/kanban', { body: {} });
      if (error) throw new Error(error);
      setKanban(data?.kanban || {});
      setStageTotals(data?.stageTotals || {});
      setPipelineTotal(data?.pipelineTotal || 0);
      setPipelineWeighted(data?.pipelineWeighted || 0);
    } catch (err: any) {
      toast.error(err.message || 'Error cargando pipeline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  const handleDragStart = (e: DragEvent, prospectId: string) => {
    e.dataTransfer.setData('text/plain', prospectId);
    e.dataTransfer.effectAllowed = 'move';
    setDragProspectId(prospectId);
  };

  const handleDragOver = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: DragEvent, newStage: string) => {
    e.preventDefault();
    const prospectId = e.dataTransfer.getData('text/plain');
    setDragProspectId(null);
    setDragOverStage(null);

    if (!prospectId) return;

    // Find current stage
    let fromStage = '';
    for (const [stage, prospects] of Object.entries(kanban)) {
      if (prospects.some((p) => p.id === prospectId)) {
        fromStage = stage;
        break;
      }
    }

    if (fromStage === newStage) return;

    // Optimistic update
    setKanban((prev) => {
      const updated = { ...prev };
      const prospect = updated[fromStage]?.find((p) => p.id === prospectId);
      if (!prospect) return prev;

      updated[fromStage] = updated[fromStage].filter((p) => p.id !== prospectId);
      updated[newStage] = [{ ...prospect, stage: newStage }, ...(updated[newStage] || [])];
      return updated;
    });

    try {
      const { error } = await callApi('crm/prospect/move-stage', {
        body: { prospect_id: prospectId, new_stage: newStage },
      });
      if (error) throw new Error(error);
      toast.success(`Movido a ${newStage}`);
    } catch (err: any) {
      toast.error(err.message || 'Error moviendo prospecto');
      fetchKanban(); // Revert on error
    }
  };

  const handleDragEnd = () => {
    setDragProspectId(null);
    setDragOverStage(null);
  };

  const handleDelete = async (e: React.MouseEvent, prospectId: string, prospectName: string) => {
    e.stopPropagation();
    if (!window.confirm(`¿Borrar a "${prospectName}"? Esta acción no se puede deshacer.`)) return;

    // Bug #80 fix: Route through backend API for server-side ownership check
    const { error } = await callApi('crm/prospect/delete', {
      body: { prospect_id: prospectId },
    });
    if (error) {
      toast.error(error || 'Error al borrar prospecto');
      return;
    }
    setKanban(prev => {
      const updated = { ...prev };
      for (const stage of Object.keys(updated)) {
        updated[stage] = updated[stage].filter(p => p.id !== prospectId);
      }
      return updated;
    });
    toast.success(`"${prospectName}" eliminado`);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#1E3A7B]" />
      </div>
    );
  }

  return (
    <>
      {/* Pipeline totals header */}
      {pipelineTotal > 0 && (
        <div className="mb-4 flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
          <DollarSign className="w-4 h-4 text-green-600" />
          <span className="text-sm font-semibold text-slate-700">
            Pipeline total: {formatCurrency(pipelineTotal)}
          </span>
          <span className="text-sm text-slate-400">|</span>
          <span className="text-sm text-slate-500">
            Ponderado: {formatCurrency(pipelineWeighted)}
          </span>
        </div>
      )}

      {/* Guide */}
      <div className="mb-4">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
          <span className="font-medium">Como funciona el pipeline</span>
          {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showGuide && (
          <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-700 text-sm">Etapas automaticas (Steve AI por WhatsApp)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <p><span className="font-mono bg-blue-50 px-1 rounded">Nuevo</span> — Primer mensaje recibido</p>
              <p><span className="font-mono bg-cyan-50 px-1 rounded">Discovery</span> — Score 0-19, recopilando info</p>
              <p><span className="font-mono bg-amber-50 px-1 rounded">Qualifying</span> — Score 20-49, tiene potencial</p>
              <p><span className="font-mono bg-purple-50 px-1 rounded">Pitching</span> — Score 50-74, presentando propuesta</p>
              <p><span className="font-mono bg-green-50 px-1 rounded">Closing</span> — Score 75+, listo para cerrar</p>
              <p><span className="font-mono bg-red-50 px-1 rounded">Perdido</span> — Descalificado o no interesado</p>
            </div>
            <hr className="border-slate-100" />
            <p className="font-semibold text-slate-700 text-sm">Reuniones</p>
            <div className="space-y-1">
              <p>Steve agenda reuniones automaticamente cuando el score es alto</p>
              <p>24h antes — Steve manda recordatorio por WhatsApp</p>
              <p>2h antes — Segundo recordatorio con link de Google Meet</p>
              <p>No-show — Si no confirma, Steve cancela y baja el score</p>
            </div>
            <hr className="border-slate-100" />
            <p className="font-semibold text-slate-700 text-sm">Manual</p>
            <div className="space-y-1">
              <p>Arrastra tarjetas entre columnas para cambiar etapa</p>
              <p>Click en tarjeta para abrir ficha CRM (timeline, tareas, propuestas)</p>
              <p><span className="font-mono bg-emerald-50 px-1 rounded">Convertido</span> — Mover manualmente cuando el prospecto paga</p>
            </div>
          </div>
        )}
      </div>

      {/* Calendar connections */}
      <div className="mb-4">
        <CalendarConnect />
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {STAGES.map((stage) => {
            const prospects = kanban[stage.id] || [];
            const isDragOver = dragOverStage === stage.id;
            const stTotal = stageTotals[stage.id];

            return (
              <div
                key={stage.id}
                className={`w-64 shrink-0 rounded-xl border transition-colors ${
                  isDragOver ? `${stage.bgLight} ring-2 ring-offset-1 ring-blue-400` : 'bg-slate-50 border-slate-200'
                }`}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                    <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                    <span className="text-xs text-slate-400 ml-auto">{prospects.length}</span>
                  </div>
                  {stTotal && stTotal.total > 0 && (
                    <div className="mt-1 text-[10px] text-slate-400">
                      {formatCurrency(stTotal.total)}
                      <span className="text-slate-300 mx-1">|</span>
                      pond: {formatCurrency(stTotal.weighted)}
                    </div>
                  )}
                </div>

                {/* Cards */}
                <div className="p-2 space-y-2 min-h-[100px] max-h-[calc(100vh-300px)] overflow-y-auto">
                  {prospects.map((p, idx) => {
                    const isRotting = p.is_rotting && stage.id !== 'converted' && stage.id !== 'lost';
                    const dealVal = Number(p.deal_value) || 0;

                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        draggable
                        onDragStart={(e) => handleDragStart(e as any, p.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedProspectId(p.id)}
                        className={`group bg-white rounded-lg border p-2.5 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all ${
                          dragProspectId === p.id ? 'opacity-40 scale-95' : ''
                        } ${isRotting ? 'border-orange-400 ring-1 ring-orange-200' : 'border-slate-200'}`}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {p.name || p.profile_name || p.phone}
                            </p>
                            {p.company && (
                              <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                                <Building2 className="w-3 h-3 shrink-0" /> {p.company}
                              </p>
                            )}
                          </div>
                          <ScoreBadge score={p.lead_score} />
                          <button
                            onClick={(e) => handleDelete(e, p.id, p.name || p.profile_name || p.phone)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400"
                            title="Eliminar prospecto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 flex-wrap">
                          {dealVal > 0 && (
                            <span className="flex items-center gap-0.5 text-green-600 font-medium">
                              <DollarSign className="w-3 h-3" /> {formatCurrency(dealVal)}
                            </span>
                          )}
                          {p.message_count > 0 && (
                            <span className="flex items-center gap-0.5">
                              <MessageSquare className="w-3 h-3" /> {p.message_count}
                            </span>
                          )}
                          {p.meeting_status === 'scheduled' && p.meeting_at && (
                            <span className="flex items-center gap-0.5 text-cyan-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(p.meeting_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {p.priority === 'urgent' && (
                            <Badge className="bg-red-100 text-red-600 text-[9px] px-1 py-0">urgent</Badge>
                          )}
                          {p.priority === 'high' && (
                            <Badge className="bg-orange-100 text-orange-600 text-[9px] px-1 py-0">high</Badge>
                          )}
                          {isRotting && (
                            <Badge className="bg-orange-100 text-orange-700 text-[9px] px-1 py-0 flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> Estancado
                            </Badge>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedProspectId && (
        <ProspectDetail
          prospectId={selectedProspectId}
          open={!!selectedProspectId}
          onOpenChange={(open) => !open && setSelectedProspectId(null)}
          onStageChanged={fetchKanban}
        />
      )}
    </>
  );
}
