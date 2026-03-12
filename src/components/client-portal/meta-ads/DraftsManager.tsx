import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
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
  Target,
  Users,
  DollarSign,
  Zap,
  Lightbulb,
  Plus,
  Image as ImageIcon,
  FileText,
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
// Config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<DraftStatus, { label: string; color: string; icon: React.ElementType }> = {
  borrador: { label: 'Borrador', color: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30', icon: Clock },
  aprobado: { label: 'Aprobado', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', icon: CheckCircle },
  en_pauta: { label: 'Publicado', color: 'bg-green-500/15 text-green-600 border-green-500/30', icon: Megaphone },
  generando: { label: 'Generando', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30', icon: Loader2 },
};

const FUNNEL_INFO: Record<string, { label: string; color: string; explanation: string }> = {
  tofu: {
    label: 'TOFU',
    color: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
    explanation: 'Top of Funnel — Máximo alcance para nuevas audiencias. Se optimiza por impresiones y visitas.',
  },
  mofu: {
    label: 'MOFU',
    color: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    explanation: 'Middle of Funnel — Personas que ya conocen tu marca. Se busca engagement y consideración.',
  },
  bofu: {
    label: 'BOFU',
    color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    explanation: 'Bottom of Funnel — Alta intención de compra. Se buscan conversiones directas: ventas, leads.',
  },
};

const OBJECTIVE_WHY: Record<string, string> = {
  CONVERSIONS: 'Objetivo "Conversiones" = ventas directas → BOFU porque se buscan personas listas para comprar.',
  TRAFFIC: 'Objetivo "Tráfico" = visitas al sitio → TOFU porque se busca atraer nuevas audiencias.',
  AWARENESS: 'Objetivo "Reconocimiento" = máximo alcance → TOFU porque se busca awareness de marca.',
  ENGAGEMENT: 'Objetivo "Interacción" = likes/comentarios → MOFU porque se reimpacta a quienes ya conocen la marca.',
  CATALOG: 'Objetivo "Catálogo DPA" = retargeting dinámico → BOFU porque se reimpacta a visitantes previos.',
};

// ---------------------------------------------------------------------------
// Image with error handling
// ---------------------------------------------------------------------------

function SafeImage({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`bg-muted/60 flex flex-col items-center justify-center gap-1 ${className}`}>
        <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/50">Error al cargar</span>
      </div>
    );
  }
  return <img src={src} alt="" className={`object-cover ${className}`} onError={() => setFailed(true)} />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Objective & optimization mappings
// ---------------------------------------------------------------------------

const OBJECTIVE_MAP: Record<string, string> = {
  CONVERSIONS: 'OUTCOME_SALES',
  TRAFFIC: 'OUTCOME_TRAFFIC',
  AWARENESS: 'OUTCOME_AWARENESS',
  ENGAGEMENT: 'OUTCOME_ENGAGEMENT',
  CATALOG: 'OUTCOME_SALES',
};

const OPTIMIZATION_MAP: Record<string, string> = {
  CONVERSIONS: 'OFFSITE_CONVERSIONS',
  TRAFFIC: 'LINK_CLICKS',
  AWARENESS: 'REACH',
  ENGAGEMENT: 'POST_ENGAGEMENT',
  CATALOG: 'OFFSITE_CONVERSIONS',
};

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'hace unos segundos';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function DraftsManager({ clientId, onEditDraft }: DraftsManagerProps) {
  const { connectionId: ctxConnectionId } = useMetaBusiness();

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<DraftItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<DraftItem | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  // ── Fetch ──
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
      setLastFetched(new Date());
    } catch (err) {
      // Drafts fetch error handled via toast
      toast.error('Error cargando borradores');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('ad_creatives').delete().eq('id', deleteTarget.id).eq('client_id', clientId);
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

  // ── Publish ──
  const handlePublish = async (draft: DraftItem) => {
    setPublishTarget(null);
    setPublishing(draft.id);
    try {
      if (!ctxConnectionId) {
        toast.error('No hay conexión Meta Ads activa. Conecta Meta desde Conexiones.');
        return;
      }
      const bv = draft.brief_visual;
      const rawObjective = bv?.objective || 'CONVERSIONS';
      const objective = OBJECTIVE_MAP[rawObjective] || 'OUTCOME_SALES';
      const optimization_goal = OPTIMIZATION_MAP[rawObjective] || 'OFFSITE_CONVERSIONS';
      const dailyBudgetCLP = Number(
        bv?.plan_accion?.presupuesto_diario || bv?.adset_budget || bv?.campaign_budget || '10000'
      );
      const name = bv?.campaign_name || draft.titulo || `Campaña - ${new Date().toISOString().split('T')[0]}`;
      const { error } = await callApi('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: ctxConnectionId,
          data: {
            name,
            objective,
            status: 'PAUSED',
            daily_budget: dailyBudgetCLP * 100,
            billing_event: 'IMPRESSIONS',
            optimization_goal,
            adset_name: bv?.adset_name || `${name} - Ad Set 1`,
          },
        },
      });
      if (error) throw error;
      await supabase.from('ad_creatives').update({ estado: 'en_pauta' }).eq('id', draft.id);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success(`"${draft.titulo}" publicado en Meta como pausado. Activa cuando estés listo.`);
    } catch (err: any) {
      // Publish error handled via toast
      toast.error(err?.message || 'Error al publicar');
    } finally {
      setPublishing(null);
    }
  };

  // ── Helpers ──
  const filtered = filter === 'all' ? drafts : drafts.filter((d) => d.estado === filter);
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function getImages(draft: DraftItem): string[] {
    const imgs: string[] = [];
    if (draft.asset_url) imgs.push(draft.asset_url);
    if (Array.isArray(draft.dct_imagenes)) {
      for (const img of draft.dct_imagenes) {
        const url = typeof img === 'string' ? img : img?.url;
        if (url && !imgs.includes(url)) imgs.push(url);
      }
    }
    return imgs;
  }

  function getCopies(draft: DraftItem): string[] {
    const copies: string[] = [];
    if (Array.isArray(draft.dct_copies)) {
      for (const c of draft.dct_copies) {
        copies.push(typeof c === 'string' ? c : c?.texto || JSON.stringify(c));
      }
    }
    if (copies.length === 0 && draft.texto_principal) copies.push(draft.texto_principal);
    return copies;
  }

  function getHeadlines(draft: DraftItem): string[] {
    const hl: string[] = [];
    if (Array.isArray(draft.dct_titulos)) {
      for (const t of draft.dct_titulos) {
        hl.push(typeof t === 'string' ? t : JSON.stringify(t));
      }
    }
    if (hl.length === 0 && draft.titulo) hl.push(draft.titulo);
    return hl;
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Borradores</h2>
          <p className="text-muted-foreground text-sm">
            {drafts.length} borrador{drafts.length !== 1 ? 'es' : ''} &middot; Revisa estrategia y publica
          </p>
          {lastFetched && (
            <p className="text-muted-foreground text-xs mt-0.5">Actualizado: {relativeTime(lastFetched)}</p>
          )}
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

      {/* Pending drafts banner */}
      {(() => {
        const pendingCount = drafts.filter((d) => d.estado === 'borrador').length;
        return pendingCount > 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-700">
              Tienes {pendingCount} borrador{pendingCount !== 1 ? 'es' : ''} pendiente{pendingCount !== 1 ? 's' : ''} de revisión. Publícalos para comenzar a vender.
            </p>
          </div>
        ) : null;
      })()}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <FileImage className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold mb-1">Sin borradores</h3>
            <p className="text-muted-foreground text-sm">
              Crea anuncios desde "Crear" y guárdalos como borrador para revisarlos antes de publicar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filtered.map((draft) => {
            const statusConf = STATUS_CONFIG[draft.estado];
            const StatusIcon = statusConf.icon;
            const bv = draft.brief_visual as BriefVisual | null;
            const funnel = draft.funnel || 'mofu';
            const funnelInfo = FUNNEL_INFO[funnel];
            const images = getImages(draft);
            const copies = getCopies(draft);
            const headlines = getHeadlines(draft);
            const objectiveWhy = bv?.objective ? OBJECTIVE_WHY[bv.objective] : null;

            return (
              <Card key={draft.id} className="overflow-hidden border-l-4 border-l-primary/60">
                <CardContent className="p-0">

                  {/* ───── CAMPAIGN HEADER ───── */}
                  <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Target className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm font-medium text-muted-foreground">Campaña</span>
                        </div>
                        <h3 className="text-lg font-bold leading-tight mb-1">
                          {bv?.campaign_name || draft.titulo || 'Sin nombre'}
                        </h3>
                        {bv?.adset_name && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 shrink-0" />
                            Ad Set: {bv.adset_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <Badge className={`text-[10px] ${statusConf.color}`}>
                          <StatusIcon className={`w-3 h-3 mr-1 ${draft.estado === 'generando' ? 'animate-spin' : ''}`} />
                          {statusConf.label}
                        </Badge>
                        {funnelInfo && <Badge className={`text-[10px] ${funnelInfo.color}`}>{funnelInfo.label}</Badge>}
                        {bv?.budget_type && (
                          <Badge variant="outline" className="text-[10px]">
                            {bv.budget_type === 'ABO' ? 'ABO Testing' : 'CBO Escalar'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ───── WHY THIS STRATEGY ───── */}
                  <div className="mx-5 mb-4 rounded-lg bg-muted/40 border p-4 space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      ¿Por qué esta estrategia?
                    </h4>

                    {/* Objective → Funnel */}
                    <div className="flex items-start gap-2">
                      <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">
                          {bv?.objective_label || 'Conversiones'} → {funnelInfo?.label || 'BOFU'}
                        </p>
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {objectiveWhy || funnelInfo?.explanation || ''}
                        </p>
                      </div>
                    </div>

                    {/* Segmentation */}
                    {(bv?.audience_description || bv?.dolor) && (
                      <div className="flex items-start gap-2">
                        <Users className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium">Segmentación</p>
                          {bv?.dolor && bv.dolor !== 'Sin definir' && (
                            <p className="text-xs mt-0.5">
                              <span className="text-foreground font-medium">Dolor:</span>{' '}
                              <span className="text-muted-foreground">{bv.dolor}</span>
                            </p>
                          )}
                          {bv?.producto && bv.producto !== 'Sin definir' && (
                            <p className="text-xs mt-0.5">
                              <span className="text-foreground font-medium">Producto:</span>{' '}
                              <span className="text-muted-foreground">{bv.producto}</span>
                            </p>
                          )}
                          {bv?.audience_description && bv.audience_description !== bv.dolor && (
                            <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{bv.audience_description}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Budget */}
                    <div className="flex items-start gap-2">
                      <DollarSign className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">
                          {bv?.budget_type === 'CBO' ? 'CBO — Meta distribuye el presupuesto entre ad sets' : 'ABO — Presupuesto fijo por cada ad set (ideal para testing)'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          ${Number(bv?.plan_accion?.presupuesto_diario || bv?.adset_budget || bv?.campaign_budget || '0').toLocaleString('es-CL')} CLP/día
                          {bv?.budget_type === 'ABO' && ' por ad set'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ───── DCT 3:2:2 MATRIX ───── */}
                  <div className="mx-5 mb-4 rounded-lg border p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        <Zap className="w-4 h-4 text-violet-500" />
                        DCT 3:2:2 — Matriz de Variaciones
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        3 imágenes × 2 copies × 2 headlines = 12 combinaciones de anuncios para testear
                      </p>
                    </div>

                    {/* Images (3 slots) */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" />
                        Imágenes ({images.length}/3)
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="aspect-square rounded-lg overflow-hidden border-2 border-border">
                            {images[i] ? (
                              <SafeImage src={images[i]} className="w-full h-full" />
                            ) : (
                              <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center gap-1.5 p-2">
                                <Plus className="w-6 h-6 text-muted-foreground/25" />
                                <span className="text-[11px] text-muted-foreground/50 text-center">
                                  Imagen {i + 1}
                                </span>
                                <span className="text-[9px] text-muted-foreground/40">Pendiente</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Copies (2 slots) */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        Copies — Texto Principal ({copies.length}/2)
                      </p>
                      <div className="space-y-2">
                        {[0, 1].map((i) => (
                          <div key={i} className={`rounded-lg border p-3 ${copies[i] ? 'bg-background' : 'bg-muted/20 border-dashed'}`}>
                            {copies[i] ? (
                              <>
                                <span className="text-sm font-medium text-emerald-600">Copy {i + 1} ✓</span>
                                <p className="mt-1 text-xs leading-relaxed">{copies[i]}</p>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">
                                Copy {i + 1} — Pendiente. Crea otra variación desde "Crear".
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Headlines (2 slots) */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        Títulos ({headlines.length}/2)
                      </p>
                      <div className="space-y-2">
                        {[0, 1].map((i) => (
                          <div key={i} className={`rounded-lg border p-3 ${headlines[i] ? 'bg-background' : 'bg-muted/20 border-dashed'}`}>
                            {headlines[i] ? (
                              <>
                                <span className="text-sm font-medium text-emerald-600">Título {i + 1} ✓</span>
                                <p className="mt-1 text-sm font-semibold">{headlines[i]}</p>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">
                                Título {i + 1} — Pendiente. Crea otra variación desde "Crear".
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description if exists */}
                    {draft.descripcion && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          Descripción del enlace
                        </p>
                        <div className="rounded-lg border bg-background p-3">
                          <p className="text-xs text-muted-foreground italic">{draft.descripcion}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ───── METHODOLOGY NOTE ───── */}
                  <div className="mx-5 mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                    <Lightbulb className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                    <div className="text-xs leading-relaxed">
                      <span className="font-semibold">Metodología DCT 3:2:2 (Charles Tichener):</span>{' '}
                      Cada Ad Set tiene 1 solo anuncio para aislar variables. No tocar por 7 días.
                      Día 7, Steve clasifica en ganadores, potenciales y perdedores según Hook Rate ({'>'}25%), Hold Rate ({'>'}15%) y CTR ({'>'}1.5%).
                      {bv?.plan_accion?.regla_kill && (
                        <span className="block mt-1 text-muted-foreground">
                          Kill rule: {bv.plan_accion.regla_kill}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ───── ACTIONS FOOTER ───── */}
                  <div className="px-5 py-3 border-t bg-muted/10 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(draft.created_at)}
                      </span>
                      {draft.cta && (
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          CTA: {(draft.cta as string).replace(/_/g, ' ')}
                        </span>
                      )}
                      {bv?.destination_url && (
                        <span className="truncate max-w-[180px]">{bv.destination_url}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(draft.estado === 'borrador' || draft.estado === 'aprobado') && (
                        <Button variant="default" size="sm" className="h-8 text-xs" onClick={() => setPublishTarget(draft)} disabled={publishing === draft.id}>
                          {publishing === draft.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                          Publicar en Meta
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(draft)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Publish Confirmation Dialog */}
      <Dialog open={!!publishTarget} onOpenChange={() => setPublishTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Publicar en Meta</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <Send className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Tu campaña se publicará en Meta como PAUSADA.</p>
              <p className="text-xs text-muted-foreground mt-1">Podrás activarla cuando estés listo.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishTarget(null)}>Cancelar</Button>
            <Button onClick={() => publishTarget && handlePublish(publishTarget)}>
              <Send className="w-4 h-4 mr-2" />
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <p className="text-sm font-medium text-destructive">Esta acción no se puede deshacer</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Se eliminará permanentemente el borrador <strong>"{deleteTarget.titulo}"</strong>.
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
