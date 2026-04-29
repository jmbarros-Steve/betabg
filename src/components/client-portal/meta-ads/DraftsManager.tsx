import { useState, useEffect, useCallback } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
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
  Film,
  Sparkles,
  Camera,
  Pencil,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// BriefVisual helpers — drafts are saved by CampaignCreateWizard with a snapshot
// of every field. We read it back here and rebuild the full payload that
// manage-meta-campaign.ts expects, instead of the stripped-down version we
// had before (which was publishing empty campaigns with no creative).
// ---------------------------------------------------------------------------

function pickString(v: any): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v;
  return undefined;
}

function pickArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') return x.texto || x.text || x.url || '';
      return '';
    })
    .filter((x) => typeof x === 'string' && x.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftsManagerProps {
  clientId: string;
  onEditDraft?: (draftId: string) => void;
  // Navegación al wizard de Crear (los assets se reusan automáticamente
  // desde la galería interna del wizard, no hace falta pasar nada).
  onGoToCreate?: () => void;
}

type DraftStatus = 'borrador' | 'aprobado' | 'en_pauta' | 'generando';
type MainTab = 'anuncios' | 'videos' | 'fotos';

interface AssetItem {
  url: string;
  type: 'image' | 'video';
  creativeId: string;
  creativeTitle: string;
  funnel: string | null;
  angulo: string | null;
  estado: DraftStatus;
  createdAt: string;
}

const isVideoUrl = (u: string): boolean => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);

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
  aprobado: { label: 'Aprobado', color: 'bg-[#1E3A7B]/15 text-[#1E3A7B] border-[#2A4F9E]/30', icon: CheckCircle },
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

export default function DraftsManager({ clientId, onEditDraft, onGoToCreate }: DraftsManagerProps) {
  const { connectionId: ctxConnectionId } = useMetaBusiness();

  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<MainTab>('anuncios');
  const [filter, setFilter] = useState<DraftStatus | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<DraftItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<DraftItem | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  // Edición inline de borradores: dialog con los campos de copy + targeting
  // que el cliente edita más seguido (título, copy, headline, descripción,
  // CTA, URL, nombre de campaña, presupuesto). Para edits estructurales
  // mayores (formato, audiencia compleja, segmentación) hay un botón que
  // lleva al wizard completo.
  const [editTarget, setEditTarget] = useState<DraftItem | null>(null);
  const [editForm, setEditForm] = useState<{
    titulo: string;
    texto_principal: string;
    descripcion: string;
    cta: string;
    campaign_name: string;
    destination_url: string;
    presupuesto_diario: string;
  }>({ titulo: '', texto_principal: '', descripcion: '', cta: '', campaign_name: '', destination_url: '', presupuesto_diario: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // ── Fetch ──
  // Antes filtrábamos por estado IN ('borrador','aprobado','generando') para
  // mostrar solo "borradores en proceso". Ahora la pestaña unifica también
  // Videos y Fotos reusables — esos pueden venir de creativos en pauta —
  // así que traemos TODOS los estados y filtramos en el frontend según tab.
  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ad_creatives')
        .select('id, titulo, texto_principal, descripcion, cta, asset_url, formato, funnel, angulo, estado, created_at, updated_at, brief_visual, dct_copies, dct_titulos, dct_descripciones, dct_imagenes')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDrafts((data as DraftItem[]) || []);
      setLastFetched(new Date());
    } catch (err) {
      toast.error('Error cargando biblioteca');
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
  // Rebuilds the full manage-meta-campaign payload from the draft's
  // brief_visual snapshot (saved by CampaignCreateWizard). Previously we only
  // sent name + objective + budget, which caused Meta to create empty
  // campaigns with no creative. Now we pass images, copy, CTAs, targeting,
  // funnel, angle, pixel, UTM — everything the wizard pushes at submit.
  const handlePublish = async (draft: DraftItem) => {
    setPublishTarget(null);
    setPublishing(draft.id);
    try {
      if (!ctxConnectionId) {
        toast.error('No hay conexión Meta Ads activa. Conecta Meta desde Conexiones.');
        return;
      }
      const bv = (draft.brief_visual || {}) as Record<string, any>;
      const rawObjective = bv.objective || 'CONVERSIONS';
      const objective = OBJECTIVE_MAP[rawObjective] || 'OUTCOME_SALES';
      const optimization_goal = OPTIMIZATION_MAP[rawObjective] || 'OFFSITE_CONVERSIONS';
      const dailyBudgetCLP = Number(
        bv?.plan_accion?.presupuesto_diario || bv?.adset_budget || bv?.campaign_budget || '10000'
      );
      const name = bv.campaign_name || draft.titulo || `Campaña - ${new Date().toISOString().split('T')[0]}`;
      const adSetFormat = pickString(bv.ad_set_format) || draft.formato || 'flexible';
      const isDpa = adSetFormat === 'catalog' || rawObjective === 'CATALOG' || bv.budget_type === 'ADVANTAGE';

      // Collect media + copy arrays from the draft
      const images = getImages(draft);
      const headlines = getHeadlines(draft);
      const copies = getCopies(draft);
      const descriptions = pickArray(draft.dct_descripciones);
      if (descriptions.length === 0 && draft.descripcion) descriptions.push(draft.descripcion);

      // Refuse to publish if critical pieces are missing
      const issues: string[] = [];
      if (!isDpa && images.length === 0) issues.push('agrega al menos 1 imagen');
      if (headlines.length === 0) issues.push('el título');
      if (copies.length === 0) issues.push('el texto principal');
      if (!bv.destination_url) issues.push('la URL de destino');
      if (isDpa && (!bv.product_catalog_id || !bv.product_set_id)) {
        issues.push('catálogo + set de productos (edita el borrador)');
      }
      if (issues.length > 0) {
        toast.error(`Completa antes de publicar: ${issues.join(', ')}`);
        return;
      }

      // Fetch the client's default page/IG/pixel from platform_connections as
      // fallback when the draft doesn't carry them.
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('page_id, ig_account_id, pixel_id')
        .eq('id', ctxConnectionId)
        .maybeSingle();

      const payload: Record<string, any> = {
        name,
        objective,
        status: 'PAUSED',
        daily_budget: dailyBudgetCLP,
        billing_event: 'IMPRESSIONS',
        optimization_goal,
        is_advantage_sales: bv.budget_type === 'ADVANTAGE',
        adset_name: bv.adset_name || `${name} - Ad Set 1`,
        ad_set_format: adSetFormat,
        // Creative content
        primary_text: copies[0] || undefined,
        headline: headlines[0] || undefined,
        description: descriptions[0] || undefined,
        image_url: images[0] || undefined,
        images: images.length > 0 ? images : undefined,
        texts: copies.length > 0 ? copies : undefined,
        headlines: headlines.length > 0 ? headlines : undefined,
        descriptions: descriptions.length > 0 ? descriptions : undefined,
        cta: draft.cta || 'SHOP_NOW',
        destination_url: pickString(bv.destination_url),
        // Targeting + placements (best effort — falls back to broad CL 18-65)
        page_id: pickString(bv.page_id) || conn?.page_id || undefined,
        instagram_user_id: pickString(bv.ig_account_id) || conn?.ig_account_id || undefined,
        pixel_id: rawObjective === 'CONVERSIONS' ? (pickString(bv.pixel_id) || conn?.pixel_id || undefined) : undefined,
        custom_event_type: rawObjective === 'CONVERSIONS' ? (pickString(bv.custom_event_type) || 'PURCHASE') : undefined,
        // DPA specifics
        product_catalog_id: isDpa ? pickString(bv.product_catalog_id) : undefined,
        product_set_id: isDpa ? pickString(bv.product_set_id) : undefined,
        // Funnel + angle → CRITERIO picks them up for ángulo-no-repetido / creative variety
        angle: pickString(draft.angulo || bv.angle),
        funnel_stage: pickString(draft.funnel || bv.funnel_stage),
        // Content source (manual uploads vs advantage catalog template)
        content_source: isDpa ? 'advantage_catalog' : (pickString(bv.content_source) || 'manual'),
        ad_name: pickString(bv.ad_name) || draft.titulo || undefined,
        // Advantage+ Creative features (saved with the draft if present)
        creative_features: bv.creative_features && typeof bv.creative_features === 'object' ? bv.creative_features : undefined,
      };

      const { error } = await callApi('manage-meta-campaign', {
        body: { action: 'create', connection_id: ctxConnectionId, data: payload },
      });
      if (error) {
        throw new Error(typeof error === 'string' ? error : (error as any)?.message || 'Error al publicar');
      }
      await supabase.from('ad_creatives').update({ estado: 'en_pauta' }).eq('id', draft.id);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success(`"${draft.titulo}" publicado en Meta como pausado. Activa desde Meta Ads Manager cuando estés listo.`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al publicar');
    } finally {
      setPublishing(null);
    }
  };

  // ── Edit draft ──
  const openEdit = (draft: DraftItem) => {
    const bv = draft.brief_visual || {};
    setEditTarget(draft);
    setEditForm({
      titulo: draft.titulo || '',
      texto_principal: draft.texto_principal || '',
      descripcion: draft.descripcion || '',
      cta: draft.cta || 'SHOP_NOW',
      campaign_name: bv.campaign_name || '',
      destination_url: bv.destination_url || '',
      presupuesto_diario: String(bv.plan_accion?.presupuesto_diario || bv.adset_budget || bv.campaign_budget || ''),
    });
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      // Mergeamos el brief_visual existente para no perder campos no editables
      // acá (objective, funnel, ángulo, dolor, plan_accion completo, etc.).
      const oldBv = (editTarget.brief_visual || {}) as Record<string, any>;
      const newBv = {
        ...oldBv,
        campaign_name: editForm.campaign_name.trim() || oldBv.campaign_name,
        destination_url: editForm.destination_url.trim() || oldBv.destination_url,
        plan_accion: {
          ...(oldBv.plan_accion || {}),
          presupuesto_diario: editForm.presupuesto_diario.trim() || oldBv.plan_accion?.presupuesto_diario,
        },
      };
      const { error } = await supabase
        .from('ad_creatives')
        .update({
          titulo: editForm.titulo.trim() || null,
          texto_principal: editForm.texto_principal.trim() || null,
          descripcion: editForm.descripcion.trim() || null,
          cta: editForm.cta.trim() || null,
          brief_visual: newBv,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editTarget.id)
        .eq('client_id', clientId);
      if (error) throw error;
      setDrafts((prev) =>
        prev.map((d) =>
          d.id === editTarget.id
            ? {
                ...d,
                titulo: editForm.titulo.trim() || d.titulo,
                texto_principal: editForm.texto_principal.trim() || null,
                descripcion: editForm.descripcion.trim() || null,
                cta: editForm.cta.trim() || null,
                brief_visual: newBv,
              }
            : d,
        ),
      );
      toast.success('Cambios guardados');
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAdvancedEdit = () => {
    if (!editTarget) return;
    // 1. Persistimos el draft en sessionStorage por si el wizard se monta
    //    fresh (primera vez que el cliente entra a Crear en esta sesión).
    try {
      sessionStorage.setItem(
        'betabg:edit-meta-draft',
        JSON.stringify({
          id: editTarget.id,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch { /* sessionStorage may fail in strict-incognito */ }
    const draftId = editTarget.id;
    if (onEditDraft) {
      onEditDraft(draftId);
    }
    setEditTarget(null);
    // 2. CRÍTICO: MetaAdsManager usa lazy-mount + keep-alive — si el wizard
    //    ya fue visitado antes, NO se re-monta al volver, solo cambia
    //    display:none→block. El useEffect mount del wizard no vuelve a
    //    correr. Disparamos un CustomEvent en window para que el wizard
    //    (montado o no) escuche y precargue el draft.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('bg:edit-meta-draft', { detail: { id: draftId } }));
    }, 50);
  };

  // ── Go to create wizard ──
  // Todos los assets generados/subidos viven automáticamente en la galería
  // del wizard de Crear (CampaignCreateWizard tab "Galería"). El usuario no
  // necesita seleccionar nada acá — solo navegar y elegir desde adentro.
  const handleGoCreate = () => {
    if (onGoToCreate) {
      onGoToCreate();
    } else {
      toast.info('Ve a "Crear" y selecciona desde el tab "Galería" del wizard.');
    }
  };

  // ── Helpers ──
  // Anuncios: solo creativos con copy + título (campañas DCT completas) en
  // estado borrador/aprobado/generando. Los publicados (en_pauta) ya están
  // vivos en Meta — no son borradores para "publicar de nuevo".
  const draftAds = drafts.filter(
    (d) => ['borrador', 'aprobado', 'generando'].includes(d.estado),
  );
  const filtered = filter === 'all' ? draftAds : draftAds.filter((d) => d.estado === filter);

  // Videos y Fotos: extraemos todos los assets únicos de TODOS los creativos
  // (incluso los publicados) para que el cliente pueda reusarlos.
  const allAssets: AssetItem[] = (() => {
    const seen = new Set<string>();
    const out: AssetItem[] = [];
    for (const d of drafts) {
      const collect = (url: string | null | undefined) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        out.push({
          url,
          type: isVideoUrl(url) ? 'video' : 'image',
          creativeId: d.id,
          creativeTitle: d.titulo || 'Sin nombre',
          funnel: d.funnel,
          angulo: d.angulo,
          estado: d.estado,
          createdAt: d.created_at,
        });
      };
      collect(d.asset_url);
      if (Array.isArray(d.dct_imagenes)) {
        for (const img of d.dct_imagenes) {
          collect(typeof img === 'string' ? img : (img as { url?: string })?.url);
        }
      }
    }
    return out;
  })();

  const videoAssets = allAssets.filter((a) => a.type === 'video');
  const photoAssets = allAssets.filter((a) => a.type === 'image');

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
          <h2 className="text-2xl font-bold tracking-tight">Borradores y Biblioteca</h2>
          <p className="text-muted-foreground text-sm">
            Tus campañas en borrador, videos y fotos. Reusá lo que ya tenés para crear nuevas campañas.
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

      {/* Main tabs: Anuncios | Videos | Fotos */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {([
          { key: 'anuncios', label: 'Anuncios', icon: Sparkles, count: draftAds.length },
          { key: 'videos', label: 'Videos', icon: Film, count: videoAssets.length },
          { key: 'fotos', label: 'Fotos', icon: Camera, count: photoAssets.length },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mainTab === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className="text-xs text-muted-foreground/70">({t.count})</span>
            </button>
          );
        })}
      </div>

      {/* Status filter tabs — solo en pestaña Anuncios */}
      {mainTab === 'anuncios' && (
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          {(['all', 'borrador', 'aprobado', 'generando'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? `Todos (${draftAds.length})` : `${STATUS_CONFIG[f].label} (${draftAds.filter(d => d.estado === f).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Pending drafts banner — solo en pestaña Anuncios */}
      {mainTab === 'anuncios' && (() => {
        const pendingCount = draftAds.filter((d) => d.estado === 'borrador').length;
        return pendingCount > 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-700">
              Tienes {pendingCount} borrador{pendingCount !== 1 ? 'es' : ''} pendiente{pendingCount !== 1 ? 's' : ''} de revisión. Publícalos para comenzar a vender.
            </p>
          </div>
        ) : null;
      })()}

      {/* Banner informativo para Videos/Fotos */}
      {(mainTab === 'videos' || mainTab === 'fotos') && (mainTab === 'videos' ? videoAssets.length : photoAssets.length) > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[#1E3A7B]/5 border border-[#2A4F9E]/20">
          <Lightbulb className="w-5 h-5 text-[#2A4F9E] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Estos {mainTab === 'videos' ? 'videos' : 'fotos'} están disponibles automáticamente en el wizard de Crear.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cuando crees una nueva campaña, ve al tab "Galería" en el step de creativos y elegí cualquiera de estos sin tener que volver a generar/subir.
            </p>
          </div>
          <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={handleGoCreate}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Crear campaña
          </Button>
        </div>
      )}

      {/* ════════ VIDEOS TAB ════════ */}
      {mainTab === 'videos' && (
        videoAssets.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Film className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="text-base font-semibold mb-1">Sin videos en tu biblioteca</h3>
              <p className="text-muted-foreground text-sm">
                Genera videos desde "Crear" usando el Estudio Creativo. Aparecerán aquí para reusar en futuras campañas.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {videoAssets.map((asset) => (
              <Card key={`${asset.creativeId}-${asset.url}`} className="overflow-hidden group">
                <div className="aspect-square relative bg-black">
                  <video src={asset.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  <span className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded">VIDEO</span>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button size="sm" className="text-xs" onClick={handleGoCreate}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Usar en campaña
                    </Button>
                  </div>
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <p className="text-sm font-medium line-clamp-1">{asset.creativeTitle}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {asset.funnel && FUNNEL_INFO[asset.funnel] && (
                      <Badge className={`text-[9px] ${FUNNEL_INFO[asset.funnel].color}`}>
                        {FUNNEL_INFO[asset.funnel].label}
                      </Badge>
                    )}
                    <Badge className={`text-[9px] ${STATUS_CONFIG[asset.estado].color}`}>
                      {STATUS_CONFIG[asset.estado].label}
                    </Badge>
                  </div>
                  {asset.angulo && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{asset.angulo}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* ════════ FOTOS TAB ════════ */}
      {mainTab === 'fotos' && (
        photoAssets.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Camera className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="text-base font-semibold mb-1">Sin fotos en tu biblioteca</h3>
              <p className="text-muted-foreground text-sm">
                Sube fotos o generá imágenes con IA desde "Crear". Aparecerán acá para reusar en cualquier campaña nueva.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {photoAssets.map((asset) => (
              <Card key={`${asset.creativeId}-${asset.url}`} className="overflow-hidden group">
                <div className="aspect-square relative">
                  <SafeImage src={asset.url} className="w-full h-full" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button size="sm" className="text-xs" onClick={handleGoCreate}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Usar en campaña
                    </Button>
                  </div>
                </div>
                <CardContent className="p-3 space-y-1.5">
                  <p className="text-sm font-medium line-clamp-1">{asset.creativeTitle}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {asset.funnel && FUNNEL_INFO[asset.funnel] && (
                      <Badge className={`text-[9px] ${FUNNEL_INFO[asset.funnel].color}`}>
                        {FUNNEL_INFO[asset.funnel].label}
                      </Badge>
                    )}
                    <Badge className={`text-[9px] ${STATUS_CONFIG[asset.estado].color}`}>
                      {STATUS_CONFIG[asset.estado].label}
                    </Badge>
                  </div>
                  {asset.angulo && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{asset.angulo}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* ════════ ANUNCIOS TAB (default) ════════ */}
      {mainTab === 'anuncios' && (filtered.length === 0 ? (
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
                        <Users className="w-4 h-4 text-[#2A4F9E] shrink-0 mt-0.5" />
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
                        <JargonTooltip term="DCT" label="DCT 3:2:2" /> — Matriz de Variaciones
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        3 imágenes × 2 copies × 2 headlines = 12 combinaciones de anuncios para testear
                      </p>
                    </div>

                    {/* Creatives (3 slots) — detects video vs image per slot */}
                    {(() => {
                      const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
                      const videoCount = images.filter((u) => u && isVideo(u)).length;
                      const imgCount = images.filter((u) => u && !isVideo(u)).length;
                      const label = videoCount > 0 && imgCount > 0
                        ? `Creativos (${imgCount} img + ${videoCount} video)`
                        : videoCount > 0
                          ? `Videos (${videoCount}/3)`
                          : `Imágenes (${imgCount}/3)`;
                      return (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" />
                            {label}
                          </p>
                          <div className="grid grid-cols-3 gap-3">
                            {[0, 1, 2].map((i) => {
                              const url = images[i];
                              const slotIsVideo = !!url && isVideo(url);
                              return (
                                <div key={i} className="aspect-square rounded-lg overflow-hidden border-2 border-border relative">
                                  {url ? (
                                    slotIsVideo ? (
                                      <>
                                        <video src={url} className="w-full h-full object-cover" muted playsInline />
                                        <span className="absolute top-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded">VIDEO</span>
                                      </>
                                    ) : (
                                      <SafeImage src={url} className="w-full h-full" />
                                    )
                                  ) : (
                                    <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center gap-1.5 p-2">
                                      <Plus className="w-6 h-6 text-muted-foreground/25" />
                                      <span className="text-[11px] text-muted-foreground/50 text-center">
                                        Slot {i + 1}
                                      </span>
                                      <span className="text-[9px] text-muted-foreground/40">Pendiente</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

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
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openEdit(draft)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Eliminar borrador" onClick={() => setDeleteTarget(draft)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Publish Confirmation Dialog */}
      <Dialog open={!!publishTarget} onOpenChange={() => setPublishTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Publicar en Meta</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#1E3A7B]/5 border border-[#2A4F9E]/20">
            <Send className="w-5 h-5 text-[#2A4F9E] shrink-0 mt-0.5" />
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

      {/* Edit Draft Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => !savingEdit && setEditTarget(null)}>
        <DialogContent
          className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Editar borrador</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="edit-campaign-name">Nombre de campaña</Label>
                <Input
                  id="edit-campaign-name"
                  value={editForm.campaign_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, campaign_name: e.target.value }))}
                  placeholder="Ej: Black Friday 2026 - Retargeting"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-titulo">Título del anuncio (headline)</Label>
                <Input
                  id="edit-titulo"
                  value={editForm.titulo}
                  onChange={(e) => setEditForm((p) => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ej: Lo hecho a mano no se consigue en el mall"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-texto">Texto principal (copy del anuncio)</Label>
                <Textarea
                  id="edit-texto"
                  value={editForm.texto_principal}
                  onChange={(e) => setEditForm((p) => ({ ...p, texto_principal: e.target.value }))}
                  placeholder="El cuerpo del anuncio que ve el cliente"
                  className="mt-1 min-h-[80px]"
                />
              </div>
              <div>
                <Label htmlFor="edit-descripcion">Descripción del enlace</Label>
                <Input
                  id="edit-descripcion"
                  value={editForm.descripcion}
                  onChange={(e) => setEditForm((p) => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Descripción corta debajo del título"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="edit-cta">Botón CTA</Label>
                  <Input
                    id="edit-cta"
                    value={editForm.cta}
                    onChange={(e) => setEditForm((p) => ({ ...p, cta: e.target.value }))}
                    placeholder="SHOP_NOW"
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Ej: SHOP_NOW, LEARN_MORE, BUY_NOW, SIGN_UP
                  </p>
                </div>
                <div>
                  <Label htmlFor="edit-budget">Presupuesto diario (CLP)</Label>
                  <Input
                    id="edit-budget"
                    type="number"
                    value={editForm.presupuesto_diario}
                    onChange={(e) => setEditForm((p) => ({ ...p, presupuesto_diario: e.target.value }))}
                    placeholder="10000"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-url">URL de destino</Label>
                <Input
                  id="edit-url"
                  type="url"
                  value={editForm.destination_url}
                  onChange={(e) => setEditForm((p) => ({ ...p, destination_url: e.target.value }))}
                  placeholder="https://tu-tienda.com/productos"
                  className="mt-1"
                />
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border border-border/60">
                <Lightbulb className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Para cambiar imágenes, audiencia, formato (DPA/carrusel/single), funnel u objetivo, usá el botón <strong>"Edición avanzada"</strong> abajo — abre el wizard completo.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
              Cancelar
            </Button>
            {onEditDraft && (
              <Button variant="outline" onClick={handleAdvancedEdit} disabled={savingEdit}>
                Edición avanzada (wizard)
              </Button>
            )}
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
              ) : (
                'Guardar cambios'
              )}
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
