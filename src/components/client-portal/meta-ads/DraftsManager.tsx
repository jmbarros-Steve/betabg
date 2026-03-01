import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Pencil,
  Send,
  Eye,
  Clock,
  CheckCircle,
  Megaphone,
  Pause,
  AlertCircle,
  RefreshCw,
  Video,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftsManagerProps {
  clientId: string;
  onEditDraft?: (draftId: string) => void;
}

type DraftStatus = 'borrador' | 'aprobado' | 'en_pauta' | 'generando';

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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DraftsManager({ clientId, onEditDraft }: DraftsManagerProps) {
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DraftStatus | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<DraftItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ad_creatives')
        .select('id, titulo, texto_principal, descripcion, cta, asset_url, formato, funnel, angulo, estado, created_at, updated_at')
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
      // Get Meta connection
      const { data: conns } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1);

      if (!conns || conns.length === 0) {
        toast.error('No hay conexion Meta Ads activa. Conecta Meta desde Conexiones.');
        return;
      }

      const name = draft.titulo || `Campana - ${new Date().toISOString().split('T')[0]}`;

      const { error } = await supabase.functions.invoke('manage-meta-campaign', {
        body: {
          action: 'create',
          connection_id: conns[0].id,
          data: {
            name,
            objective: 'OUTCOME_SALES',
            status: 'PAUSED',
            daily_budget: 100 * 100,
            billing_event: 'IMPRESSIONS',
            optimization_goal: 'OFFSITE_CONVERSIONS',
            adset_name: `${name} - Ad Set 1`,
          },
        },
      });

      if (error) throw error;

      // Update draft status
      await supabase
        .from('ad_creatives')
        .update({ estado: 'en_pauta' })
        .eq('id', draft.id);

      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      toast.success(`"${draft.titulo}" publicado en Meta como PAUSED. Activa cuando estes listo.`);
    } catch (err: any) {
      console.error('[DraftsManager] Publish error:', err);
      toast.error(err?.message || 'Error al publicar');
    } finally {
      setPublishing(null);
    }
  };

  const handleApprove = async (draft: DraftItem) => {
    try {
      await supabase
        .from('ad_creatives')
        .update({ estado: 'aprobado' })
        .eq('id', draft.id);
      setDrafts((prev) => prev.map((d) => d.id === draft.id ? { ...d, estado: 'aprobado' as DraftStatus } : d));
      toast.success('Borrador aprobado. Listo para publicar.');
    } catch {
      toast.error('Error al aprobar');
    }
  };

  const filtered = filter === 'all' ? drafts : drafts.filter((d) => d.estado === filter);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Loading
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
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
            {drafts.length} borrador{drafts.length !== 1 ? 'es' : ''} pendiente{drafts.length !== 1 ? 's' : ''}
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
        <div className="space-y-3">
          {filtered.map((draft) => {
            const statusConf = STATUS_CONFIG[draft.estado];
            const StatusIcon = statusConf.icon;

            return (
              <Card key={draft.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden shrink-0">
                      {draft.asset_url ? (
                        draft.formato === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Video className="w-6 h-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <img src={draft.asset_url} alt="" className="w-full h-full object-cover" />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileImage className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-medium text-sm truncate max-w-[300px]">{draft.titulo}</h4>
                        <Badge className={`text-[10px] ${statusConf.color}`}>
                          <StatusIcon className={`w-3 h-3 mr-1 ${draft.estado === 'generando' ? 'animate-spin' : ''}`} />
                          {statusConf.label}
                        </Badge>
                        {draft.funnel && <Badge variant="outline" className="text-[10px]">{draft.funnel.toUpperCase()}</Badge>}
                        {draft.formato && <Badge variant="outline" className="text-[10px]">{draft.formato}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{draft.texto_principal || 'Sin copy'}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{formatDate(draft.created_at)}</span>
                        {draft.cta && <span>CTA: {(draft.cta as string).replace(/_/g, ' ')}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {draft.estado === 'borrador' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Aprobar" onClick={() => handleApprove(draft)}>
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      )}
                      {(draft.estado === 'borrador' || draft.estado === 'aprobado') && (
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8" title="Publicar en Meta"
                          onClick={() => handlePublish(draft)}
                          disabled={publishing === draft.id}
                        >
                          {publishing === draft.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-primary" />}
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Eliminar"
                        onClick={() => setDeleteTarget(draft)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
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
