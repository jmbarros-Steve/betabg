import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  FileImage,
  Trash2,
  Loader2,
  Send,
  Clock,
  CheckCircle,
  Megaphone,
  AlertCircle,
  RefreshCw,
  Video,
  Target,
  Users,
  DollarSign,
  Link as LinkIcon,
  Zap,
  ChevronDown,
  ChevronUp,
  Flame,
  ShoppingBag,
  BarChart3,
  Lightbulb,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftsManagerProps {
  clientId: string;
  onEditDraft?: (draftId: string) => void;
}

type DraftStatus = 'borrador' | 'aprobado' | 'en_pauta' | 'generando';

interface BriefVisual {
  type?: string;
  campaign_name?: string;
  budget_type?: string;
  objective?: string;
  objective_label?: string;
  campaign_budget?: string;
  adset_name?: string;
  audience_description?: string;
  adset_budget?: string;
  destination_url?: string;
  start_date?: string;
  dolor?: string;
  producto?: string;
  metodologia?: string;
  plan_accion?: {
    tipo_campana?: string;
    presupuesto_diario?: string;
    duracion?: string;
    regla_kill?: string;
    metricas_dia3?: string;
  };
}

interface DraftItem {
  id: string;
  titulo: string;
  texto_principal: string | null;
  descripcion: string | null;
  cta: string | null;
  asset_url: string | null;
  formato: string | null;
  funnel: string | null;
  angulo: string | null;
  estado: DraftStatus;
  created_at: string;
  updated_at: string;
  brief_visual: BriefVisual | null;
  dct_copies: any[] | null;
  dct_titulos: any[] | null;
  dct_descripciones: any[] | null;
  dct_imagenes: any[] | null;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<DraftStatus, { label: string; color: string; icon: React.ElementType }> = {
  borrador: { label: 'Borrador', color: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30', icon: Clock },
  aprobado: { label: 'Aprobado', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', icon: CheckCircle },
  en_pauta: { label: 'Publicado', color: 'bg-green-500/15 text-green-600 border-green-500/30', icon: Megaphone },
  generando: { label: 'Generando', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30', icon: Loader2 },
};

const FUNNEL_CONFIG: Record<string, { label: string; color: string }> = {
  tofu: { label: 'TOFU', color: 'bg-sky-500/15 text-sky-600 border-sky-500/30' },
  mofu: { label: 'MOFU', color: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  bofu: { label: 'BOFU', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DraftsManager({ clientId, onEditDraft }: DraftsManagerProps) {
  const { connectionId: ctxConnectionId } = useMetaBusiness();

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<DraftItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ad_creatives')
        .select('id, titulo, texto_principal, descripcion, cta, asset_url, formato, funnel, angulo, estado, created_at, updated_at, brief_visual, dct_copies, dct_titulos, dct_descripciones, dct_imagenes')
        .eq('client_id', clientId)
        .in('estado', ['borrador', 'aprobado', 'generando'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrafts((data as DraftItem[]) || []);
    } catch (err) {
      console.error('[DraftsManager] Error:', err);
      toast.error('Error cargando borradores');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('ad_creatives')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('client_id', clientId);
      if (error) throw error;
      setDrafts((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success('Borrador eliminado');
      setDeleteTarget(null);
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const handlePublish = async (draft: DraftItem) => {
    setPublishing(draft.id);
    try {
      if (!ctxConnectionId) {
        toast.error('No hay conexion Meta Ads activa. Conecta Meta desde Conexiones.');
        return;
      }
      const name = draft.brief_visual?.campaign_name || draft.titulo || `Campana - ${new Date().toISOString().split('T')[0]}`;
      const { error } = await supabase.functions.invoke('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: ctxConnectionId,
          data: {
            name,
            objective: 'OUTCOME_SALES',
            status: 'PAUSED',
            daily_budget: 100 * 100,
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'OFFSITE_CONVERSIONS',
            adset_name: draft.brief_visual?.adset_name || `${name} - Ad Set 1`,
          },
        },
      });
      if (error) throw error;
      await supabase.from('ad_creatives').update({ estado: 'en_pauta' }).eq('id', draft.id);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success(`"${draft.titulo}" publicado en Meta como PAUSED.`);
    } catch (err: any) {
      console.error('[DraftsManager] Publish error:', err);
      toast.error(err?.message || 'Error al publicar');
    } finally {
      setPublishing(null);
    }
  };

  const handleApprove = async (draft: DraftItem) => {
    try {
      await supabase.from('ad_creatives').update({ estado: 'aprobado' }).eq('id', draft.id);
      setDrafts((prev) => prev.map((d) => d.id === draft.id ? { ...d, estado: 'aprobado' as DraftStatus } : d));
      toast.success('Borrador aprobado. Listo para publicar.');
    } catch {
      toast.error('Error al aprobar');
    }
  };

  const filtered = filter === 'all' ? drafts : drafts.filter((d) => d.estado === filter);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Borradores</h2>
          <p className="text-muted-foreground text-sm">
            {drafts.length} borrador{drafts.length !== 1 ? 'es' : ''} pendiente{drafts.length !== 1 ? 's' : ''} &middot; Metodologia DCT 3:2:2 (Charles Tichener)
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchDrafts}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {(['all', 'borrador', 'aprobado', 'generando'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? `Todos (${drafts.length})` : `${STATUS_CONFIG[f].label} (${drafts.filter(d => d.estado === f).length})`}
          </button>
        ))}
      </div>

      {/* Drafts list */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileImage className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold mb-1">Sin borradores</h3>
            <p className="text-muted-foreground text-sm">
              Crea anuncios desde "Crear" y guardalos como borrador para revisarlos antes de publicar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((draft) => {
            const statusConf = STATUS_CONFIG[draft.estado];
            const StatusIcon = statusConf.icon;
            const funnelConf = draft.funnel ? FUNNEL_CONFIG[draft.funnel] : null;
            const bv = draft.brief_visual as BriefVisual | null;
            const isExpanded = expandedId === draft.id;
            const hasDct = Array.isArray(draft.dct_copies) && draft.dct_copies.length > 0;

            return (
              <Card key={draft.id} className="hover:shadow-md transition-shadow overflow-hidden">
                <CardContent className="p-0">
                  {/* Main row */}
                  <div className="flex gap-0">
                    {/* Image / Creative */}
                    <div className="w-48 min-h-[200px] bg-muted shrink-0 relative">
                      {draft.asset_url ? (
                        draft.formato === 'video' ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                            <Video className="w-10 h-10 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Video</span>
                          </div>
                        ) : (
                          <img src={draft.asset_url} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                          <FileImage className="w-10 h-10 text-muted-foreground/30" />
                          <span className="text-xs text-muted-foreground/50">Sin creativo</span>
                        </div>
                      )}
                      {/* Format badge overlay */}
                      {draft.formato && (
                        <Badge className="absolute top-2 left-2 text-[10px] bg-black/60 text-white border-0">
                          {draft.formato === 'video' ? 'VIDEO' : 'IMAGEN'}
                        </Badge>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-5 min-w-0">
                      {/* Title + badges */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base mb-1.5">{draft.titulo || 'Sin titulo'}</h3>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className={`text-[10px] ${statusConf.color}`}>
                              <StatusIcon className={`w-3 h-3 mr-1 ${draft.estado === 'generando' ? 'animate-spin' : ''}`} />
                              {statusConf.label}
                            </Badge>
                            {funnelConf && <Badge className={`text-[10px] ${funnelConf.color}`}>{funnelConf.label}</Badge>}
                            {hasDct && <Badge className="text-[10px] bg-violet-500/15 text-violet-600 border-violet-500/30">DCT 3:2:2</Badge>}
                            {bv?.budget_type && <Badge variant="outline" className="text-[10px]">{bv.budget_type}</Badge>}
                          </div>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {draft.estado === 'borrador' && (
                            <Button variant="outline" size="sm" className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50" onClick={() => handleApprove(draft)}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1" /> Aprobar
                            </Button>
                          )}
                          {(draft.estado === 'borrador' || draft.estado === 'aprobado') && (
                            <Button variant="default" size="sm" className="h-8 text-xs" onClick={() => handlePublish(draft)} disabled={publishing === draft.id}>
                              {publishing === draft.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                              Publicar
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(draft)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Angulo / Dolor */}
                      {draft.angulo && draft.angulo !== 'campana-draft' && (
                        <div className="flex items-center gap-2 mb-2 text-sm">
                          <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          <span className="text-muted-foreground">Angulo:</span>
                          <span className="font-medium">{draft.angulo}</span>
                        </div>
                      )}

                      {/* Producto */}
                      {bv?.producto && bv.producto !== 'Sin definir' && (
                        <div className="flex items-center gap-2 mb-2 text-sm">
                          <ShoppingBag className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-muted-foreground">Producto:</span>
                          <span className="font-medium">{bv.producto}</span>
                        </div>
                      )}

                      {/* Primary Text (full) */}
                      {draft.texto_principal && (
                        <div className="mt-3 p-3 rounded-lg bg-muted/50 border">
                          <p className="text-sm leading-relaxed">{draft.texto_principal}</p>
                        </div>
                      )}

                      {/* Headline + Description */}
                      {(draft.titulo || draft.descripcion) && (
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          {draft.descripcion && (
                            <span className="text-muted-foreground italic">{draft.descripcion}</span>
                          )}
                        </div>
                      )}

                      {/* Meta row: date, CTA, URL */}
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(draft.created_at)}</span>
                        {draft.cta && <span className="flex items-center gap-1"><Zap className="w-3 h-3" />CTA: {(draft.cta as string).replace(/_/g, ' ')}</span>}
                        {bv?.destination_url && (
                          <span className="flex items-center gap-1"><LinkIcon className="w-3 h-3" />{bv.destination_url}</span>
                        )}
                        {bv?.adset_budget && (
                          <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${Number(bv.adset_budget).toLocaleString('es-CL')} CLP/dia</span>
                        )}
                      </div>

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                        className="flex items-center gap-1 mt-3 text-xs text-primary hover:underline"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {isExpanded ? 'Ocultar detalles' : 'Ver detalles DCT completos'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t px-5 py-4 bg-muted/20 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Campaign info */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5" /> Campana
                          </h4>
                          <div className="text-sm space-y-1">
                            {bv?.campaign_name && <p><span className="text-muted-foreground">Nombre:</span> {bv.campaign_name}</p>}
                            {bv?.objective_label && <p><span className="text-muted-foreground">Objetivo:</span> {bv.objective_label}</p>}
                            {bv?.budget_type && <p><span className="text-muted-foreground">Tipo:</span> {bv.budget_type === 'ABO' ? 'ABO (Testing)' : 'CBO (Escalamiento)'}</p>}
                            {bv?.start_date && <p><span className="text-muted-foreground">Inicio:</span> {bv.start_date}</p>}
                          </div>
                        </div>

                        {/* Audience */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" /> Audiencia
                          </h4>
                          <div className="text-sm space-y-1">
                            {bv?.adset_name && <p><span className="text-muted-foreground">Ad Set:</span> {bv.adset_name}</p>}
                            {bv?.audience_description && <p className="leading-relaxed">{bv.audience_description}</p>}
                          </div>
                        </div>

                        {/* Plan DCT */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5" /> Plan DCT
                          </h4>
                          {bv?.plan_accion ? (
                            <div className="text-sm space-y-1">
                              <p><span className="text-muted-foreground">Tipo:</span> {bv.plan_accion.tipo_campana}</p>
                              <p><span className="text-muted-foreground">Budget:</span> ${Number(bv.plan_accion.presupuesto_diario).toLocaleString('es-CL')}/dia</p>
                              <p><span className="text-muted-foreground">Duracion:</span> {bv.plan_accion.duracion}</p>
                              <p><span className="text-muted-foreground">Kill rule:</span> {bv.plan_accion.regla_kill}</p>
                              <p><span className="text-muted-foreground">Dia 3:</span> {bv.plan_accion.metricas_dia3}</p>
                            </div>
                          ) : (
                            <div className="text-sm space-y-1">
                              <p className="text-muted-foreground">Metodologia: DCT 3:2:2</p>
                              <p className="text-muted-foreground">7 dias sin tocar</p>
                              <p className="text-muted-foreground">Dia 7: Steve clasifica ganadores</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* DCT Copies/Titles if available */}
                      {hasDct && (
                        <div className="pt-3 border-t space-y-2">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5" /> Variaciones DCT
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {Array.isArray(draft.dct_copies) && draft.dct_copies.map((c: any, i: number) => (
                              <div key={i} className="p-2 rounded bg-background border text-xs">
                                <span className="font-medium text-primary">Copy {i + 1}:</span> {typeof c === 'string' ? c : c?.texto || JSON.stringify(c)}
                              </div>
                            ))}
                            {Array.isArray(draft.dct_titulos) && draft.dct_titulos.map((t: any, i: number) => (
                              <div key={`t-${i}`} className="p-2 rounded bg-background border text-xs">
                                <span className="font-medium text-primary">Headline {i + 1}:</span> {typeof t === 'string' ? t : JSON.stringify(t)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Metodologia note */}
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-foreground leading-relaxed">
                          {bv?.metodologia || 'DCT 3:2:2 (Charles Tichener)'}: Cada Ad Set tiene 1 solo ad.
                          No tocar por 7 dias. Dia 7 Steve clasifica ganadores, potenciales y perdedores.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Eliminar Borrador</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Esta accion no se puede deshacer</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Se eliminara permanentemente el borrador <strong>"{deleteTarget.titulo}"</strong>.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Eliminando...</> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
