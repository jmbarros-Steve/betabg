import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  RefreshCw,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Type,
  Video,
  X,
  Pause,
  Play,
  Pencil,
  Trash2,
} from 'lucide-react';
import CreateAssetGroupDialog from './CreateAssetGroupDialog';

interface AssetGroup {
  id: string;
  name: string;
  status: string;
  ad_strength: string;
  campaign_id: string;
  campaign_name: string;
}

interface AssetDetail {
  resource_name: string;
  field_type: string;
  status: string;
  name: string;
  type: string;
  text?: string;
  image_url?: string;
  youtube_video_id?: string;
}

interface GooglePmaxManagerProps {
  connectionId: string;
  clientId: string;
}

const adStrengthColors: Record<string, string> = {
  EXCELLENT: 'bg-green-500/10 text-green-600 border-green-500/20',
  GOOD: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  AVERAGE: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  POOR: 'bg-red-500/10 text-red-600 border-red-500/20',
  UNSPECIFIED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  SYNCING: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
};

const adStrengthLabels: Record<string, string> = {
  EXCELLENT: 'Excelente',
  GOOD: 'Buena',
  AVERAGE: 'Promedio',
  POOR: 'Pobre',
  UNSPECIFIED: 'Sin datos',
  SYNCING: 'Sincronizando...',
};

// Key local para identificar grupos de recursos optimistas (creados pero aún no visibles en GAQL)
type PendingGroup = AssetGroup & { __pendingKey: string; __createdAt: number };
const PENDING_TTL_MS = 2 * 60 * 1000; // 2 min — después de eso avisamos al user
const POLL_FAST_MS = 10_000;           // 10s mientras hay pending
const POLL_IDLE_MS = 30_000;           // 30s normal

const fieldTypeLabels: Record<string, string> = {
  HEADLINE: 'Headline',
  LONG_HEADLINE: 'Headline largo',
  DESCRIPTION: 'Descripcion',
  BUSINESS_NAME: 'Nombre negocio',
  MARKETING_IMAGE: 'Imagen landscape',
  SQUARE_MARKETING_IMAGE: 'Imagen cuadrada',
  PORTRAIT_MARKETING_IMAGE: 'Imagen portrait',
  LOGO: 'Logo',
  LANDSCAPE_LOGO: 'Logo landscape',
  YOUTUBE_VIDEO: 'Video YouTube',
  CALL_TO_ACTION_SELECTION: 'Call to Action',
};

// Configuración de strength: recomendado + peso por field_type.
// Basado en best practices de Google Ads PMAX (min/max/recommended por tipo).
const STRENGTH_CONFIG: Record<string, { recommended: number; weight: number; required?: boolean }> = {
  HEADLINE:                 { recommended: 5, weight: 3 },
  LONG_HEADLINE:            { recommended: 5, weight: 2 },
  DESCRIPTION:              { recommended: 5, weight: 3 },
  BUSINESS_NAME:            { recommended: 1, weight: 1, required: true },
  MARKETING_IMAGE:          { recommended: 3, weight: 3, required: true },
  SQUARE_MARKETING_IMAGE:   { recommended: 3, weight: 3, required: true },
  LOGO:                     { recommended: 1, weight: 2 },
  LANDSCAPE_LOGO:           { recommended: 1, weight: 1 },
  PORTRAIT_MARKETING_IMAGE: { recommended: 1, weight: 1 },
  YOUTUBE_VIDEO:            { recommended: 1, weight: 2 },
  CALL_TO_ACTION_SELECTION: { recommended: 1, weight: 1 },
};

function computeStrength(assets: Record<string, AssetDetail[]>) {
  let earned = 0;
  let total = 0;
  const missing: Array<{ fieldType: string; label: string; current: number; recommended: number; required: boolean; weight: number }> = [];
  for (const [fieldType, config] of Object.entries(STRENGTH_CONFIG)) {
    const current = (assets[fieldType] || []).length;
    total += config.weight;
    const coverage = Math.min(current / config.recommended, 1);
    earned += config.weight * coverage;
    if (current < config.recommended) {
      missing.push({
        fieldType,
        label: fieldTypeLabels[fieldType] || fieldType,
        current,
        recommended: config.recommended,
        required: !!config.required,
        weight: config.weight,
      });
    }
  }
  const score = Math.round((earned / total) * 100);
  return { score, missing: missing.sort((a, b) => (b.required === a.required ? b.weight - a.weight : (b.required ? 1 : -1))) };
}

function scoreColor(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

// El add-asset dialog actual solo soporta campos de texto. Para el resto,
// el "+ Agregar" no puede resolverlo y linkeamos al user a Google Ads.
const TEXT_ADDABLE_FIELDS = new Set(['HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'BUSINESS_NAME']);

export default function GooglePmaxManager({ connectionId, clientId }: GooglePmaxManagerProps) {
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupDetails, setGroupDetails] = useState<Record<string, { assets: Record<string, AssetDetail[]>; count: number }>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  // Create dialog (ahora manejado por CreateAssetGroupDialog shared component)
  const [createOpen, setCreateOpen] = useState(false);

  // Add asset dialog
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [addAssetGroupId, setAddAssetGroupId] = useState<string | null>(null);
  const [addAssetLoading, setAddAssetLoading] = useState(false);
  const [newAsset, setNewAsset] = useState({ field_type: 'HEADLINE', text: '' });

  const fetchAssetGroups = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setRefreshing(true);
    const { data, error } = await callApi('manage-google-pmax', {
      body: { action: 'list_asset_groups', connection_id: connectionId },
    });

    setRefreshing(false);
    if (error) {
      if (!opts?.silent) toast.error('Error cargando grupos de recursos: ' + error);
      setLoading(false);
      return;
    }

    const groups: AssetGroup[] = data?.asset_groups || [];
    setAssetGroups(groups);
    setLoading(false);

    // Limpiar pending groups cuyo nombre+campaña ya apareció en el fetch real
    // o que ya superaron el TTL (timeout — Google no procesó aún).
    setPendingGroups(prev => {
      const kept: PendingGroup[] = [];
      const expired: PendingGroup[] = [];
      for (const p of prev) {
        const matched = groups.some(g => g.name === p.name && g.campaign_id === p.campaign_id);
        if (matched) continue; // apareció en Google → drop
        const aged = Date.now() - p.__createdAt > PENDING_TTL_MS;
        if (aged) expired.push(p); else kept.push(p);
      }
      if (expired.length > 0) {
        expired.forEach(p => toast.warning(
          `"${p.name}" aún no aparece en Google tras 2 min. Verificalo directamente en Google Ads.`,
          { duration: 8_000 }
        ));
      }
      return kept;
    });
  }, [connectionId]);

  // Auto-refresh: al mount + interval (rápido si hay pending, lento si no) + al volver a la tab.
  useEffect(() => {
    fetchAssetGroups();
  }, [fetchAssetGroups]);

  // isVisible: pausamos el poll cuando la tab está oculta para no quemar cuota de Google Ads API.
  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );

  useEffect(() => {
    const onFocus = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) fetchAssetGroups({ silent: true });
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAssetGroups]);

  useEffect(() => {
    if (!isVisible) return; // no pollear si la tab no está visible
    const hasPending = pendingGroups.length > 0;
    const ms = hasPending ? POLL_FAST_MS : POLL_IDLE_MS;
    const interval = setInterval(() => fetchAssetGroups({ silent: true }), ms);
    return () => clearInterval(interval);
  }, [fetchAssetGroups, pendingGroups.length, isVisible]);

  const toggleGroup = async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      return;
    }

    setExpandedGroup(groupId);

    // Fetch details if not cached
    if (!groupDetails[groupId]) {
      setDetailLoading(prev => ({ ...prev, [groupId]: true }));
      const { data, error } = await callApi('manage-google-pmax', {
        body: { action: 'get_asset_group_detail', connection_id: connectionId, asset_group_id: groupId },
      });

      setDetailLoading(prev => ({ ...prev, [groupId]: false }));

      if (error) {
        toast.error('Error cargando detalle: ' + error);
        return;
      }

      setGroupDetails(prev => ({
        ...prev,
        [groupId]: { assets: data?.assets || {}, count: data?.asset_count || 0 },
      }));
    }
  };

  // Callback post-create del shared dialog: optimistic update + refresh silencioso.
  const handleAssetGroupCreated = (result: { campaign_id: string; name: string }) => {
    const pmaxMatch = pmaxCampaigns.find(c => c.id === result.campaign_id);
    setPendingGroups(prev => [
      ...prev,
      {
        __pendingKey: `pending-${Date.now()}`,
        __createdAt: Date.now(),
        id: `pending-${Date.now()}`,
        name: result.name,
        status: 'ENABLED',
        ad_strength: 'SYNCING',
        campaign_id: result.campaign_id,
        campaign_name: pmaxMatch?.name || '',
      },
    ]);
    fetchAssetGroups({ silent: true });
  };

  // Acciones por grupo de recursos: pause/resume/rename/delete (todos via update_asset_group del backend).
  const handleUpdateAssetGroup = async (groupId: string, updates: Record<string, any>, successMsg: string) => {
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'update_asset_group',
        connection_id: connectionId,
        asset_group_id: groupId,
        data: updates,
      },
    });
    if (error) {
      toast.error('Error: ' + error);
      return false;
    }
    toast.success(successMsg);
    fetchAssetGroups({ silent: true });
    return true;
  };

  const handleToggleStatus = async (group: AssetGroup) => {
    const nextStatus = group.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    await handleUpdateAssetGroup(
      group.id,
      { status: nextStatus },
      nextStatus === 'PAUSED' ? 'Grupo de recursos pausado' : 'Grupo de recursos activado'
    );
  };

  const handleRename = async (group: AssetGroup) => {
    const newName = window.prompt('Nuevo nombre del grupo de recursos:', group.name);
    if (!newName || newName.trim() === '' || newName === group.name) return;
    await handleUpdateAssetGroup(group.id, { name: newName.trim() }, 'Nombre actualizado');
  };

  const handleDelete = async (group: AssetGroup) => {
    const ok = window.confirm(`¿Eliminar el grupo de recursos "${group.name}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    await handleUpdateAssetGroup(group.id, { status: 'REMOVED' }, 'Grupo de recursos eliminado');
  };

  const handleAddAsset = async () => {
    if (!addAssetGroupId || !newAsset.text) return;

    setAddAssetLoading(true);
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'add_asset',
        connection_id: connectionId,
        asset_group_id: addAssetGroupId,
        data: { field_type: newAsset.field_type, text: newAsset.text },
      },
    });
    setAddAssetLoading(false);

    if (error) {
      toast.error('Error agregando asset: ' + error);
      return;
    }

    toast.success('Asset agregado');
    setAddAssetOpen(false);
    setNewAsset({ field_type: 'HEADLINE', text: '' });

    // Refresh details
    setGroupDetails(prev => {
      const copy = { ...prev };
      delete copy[addAssetGroupId];
      return copy;
    });
    if (expandedGroup === addAssetGroupId) {
      toggleGroup(addAssetGroupId);
    }
  };

  const handleRemoveAsset = async (groupId: string, asset: AssetDetail) => {
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'remove_asset',
        connection_id: connectionId,
        asset_group_id: groupId,
        data: { asset_resource_name: asset.resource_name, field_type: asset.field_type },
      },
    });

    if (error) {
      toast.error('Error eliminando asset: ' + error);
      return;
    }

    toast.success('Asset eliminado');
    // Refresh
    setGroupDetails(prev => {
      const copy = { ...prev };
      delete copy[groupId];
      return copy;
    });
    toggleGroup(groupId);
  };


  // Get unique PMAX campaign IDs for the create dialog
  const pmaxCampaigns = [...new Map(assetGroups.map(ag => [ag.campaign_id, { id: ag.campaign_id, name: ag.campaign_name }])).values()];

  // Merge real grupos de recursos con los pending (optimistic) — los pending quedan primero para visibilidad.
  const displayGroups: (AssetGroup | PendingGroup)[] = [...pendingGroups, ...assetGroups];

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-muted-foreground">
            {displayGroups.length} grupo{displayGroups.length !== 1 ? 's' : ''} de recursos PMAX
            {pendingGroups.length > 0 && (
              <span className="ml-2 text-xs text-blue-600">
                ({pendingGroups.length} sincronizando)
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            Auto-refresco {pendingGroups.length > 0 ? 'cada 10s' : 'cada 30s'}. Los grupos de recursos recién creados tardan unos minutos en aparecer desde Google.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchAssetGroups()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Actualizando...' : 'Refrescar'}
          </Button>
          {pmaxCampaigns.length > 0 && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Crear Grupo de recursos
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {displayGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay grupos de recursos PMAX en esta cuenta.
            <br />
            <span className="text-xs">Crea una campana Performance Max primero.</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayGroups.map(group => {
            const isPending = '__pendingKey' in group;
            return (
            <Card key={isPending ? (group as PendingGroup).__pendingKey : group.id} className={`overflow-hidden ${isPending ? 'opacity-70 border-blue-500/30' : ''}`}>
              {/* Group header: área clickeable a la izquierda + acciones a la derecha */}
              <div className={`w-full flex items-center gap-3 p-4 transition-colors ${isPending ? '' : 'hover:bg-muted/30'}`}>
                <button
                  className={`flex-1 flex items-center gap-3 text-left min-w-0 ${isPending ? 'cursor-wait' : ''}`}
                  onClick={() => !isPending && toggleGroup(group.id)}
                  disabled={isPending}
                >
                  {isPending
                    ? <Loader2 className="w-4 h-4 text-blue-500 shrink-0 animate-spin" />
                    : expandedGroup === group.id
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{group.campaign_name}</p>
                  </div>
                  <Badge variant="outline" className={adStrengthColors[group.ad_strength] || adStrengthColors.UNSPECIFIED}>
                    {adStrengthLabels[group.ad_strength] || group.ad_strength}
                  </Badge>
                  <Badge variant="outline" className={group.status === 'ENABLED' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}>
                    {group.status === 'ENABLED' ? 'Activo' : group.status}
                  </Badge>
                </button>
                {!isPending && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleToggleStatus(group)}
                      title={group.status === 'ENABLED' ? 'Pausar' : 'Activar'}
                    >
                      {group.status === 'ENABLED'
                        ? <Pause className="w-4 h-4" />
                        : <Play className="w-4 h-4" />
                      }
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleRename(group)}
                      title="Renombrar"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={() => handleDelete(group)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Expanded detail */}
              {expandedGroup === group.id && (
                <div className="border-t p-4 space-y-4">
                  {detailLoading[group.id] ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Cargando assets...
                    </div>
                  ) : groupDetails[group.id] ? (
                    <>
                      {(() => {
                        const { score, missing } = computeStrength(groupDetails[group.id].assets);
                        return (
                          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">Calidad del grupo de recursos</span>
                              <span className="text-muted-foreground">
                                Google: <span className="font-semibold">{adStrengthLabels[group.ad_strength] || group.ad_strength}</span>
                                {' '}· Steve: <span className="font-semibold">{score}%</span>
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full transition-all ${scoreColor(score)}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            {missing.length > 0 && (
                              <div className="space-y-1 pt-2 border-t border-border/50">
                                <p className="text-xs font-medium text-muted-foreground">Qué mejorar:</p>
                                <ul className="space-y-1 text-xs">
                                  {missing.slice(0, 6).map(m => {
                                    const canAddInline = TEXT_ADDABLE_FIELDS.has(m.fieldType);
                                    return (
                                    <li key={m.fieldType} className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5">
                                        {m.required && <span className="text-red-500" title="Requerido">●</span>}
                                        <span>
                                          {m.label}: <span className="font-medium">{m.current}/{m.recommended}</span>
                                        </span>
                                      </span>
                                      {canAddInline ? (
                                        <button
                                          className="text-blue-600 hover:underline"
                                          onClick={() => {
                                            setAddAssetGroupId(group.id);
                                            setNewAsset({ field_type: m.fieldType, text: '' });
                                            setAddAssetOpen(true);
                                          }}
                                        >
                                          + Agregar
                                        </button>
                                      ) : (
                                        <span className="text-muted-foreground/60 text-[11px]" title="Por ahora solo texto se agrega desde acá. Imágenes/videos: agregalos desde Google Ads.">
                                          desde Google Ads
                                        </span>
                                      )}
                                    </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{groupDetails[group.id].count} assets</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAddAssetGroupId(group.id);
                            setNewAsset({ field_type: 'HEADLINE', text: '' });
                            setAddAssetOpen(true);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Agregar asset
                        </Button>
                      </div>

                      {/* Assets by type */}
                      {Object.entries(groupDetails[group.id].assets).map(([fieldType, assets]) => (
                        <div key={fieldType}>
                          <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            {fieldType.includes('IMAGE') || fieldType.includes('LOGO')
                              ? <ImageIcon className="w-3 h-3" />
                              : fieldType.includes('VIDEO')
                              ? <Video className="w-3 h-3" />
                              : <Type className="w-3 h-3" />
                            }
                            {fieldTypeLabels[fieldType] || fieldType}
                            <span className="text-muted-foreground/60">({(assets as AssetDetail[]).length})</span>
                          </p>

                          <div className="space-y-1">
                            {(assets as AssetDetail[]).map((asset, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm group">
                                {asset.image_url ? (
                                  <img
                                    src={asset.image_url}
                                    alt={asset.name}
                                    className="w-10 h-10 rounded object-cover border"
                                  />
                                ) : asset.youtube_video_id ? (
                                  <a
                                    href={`https://youtube.com/watch?v=${asset.youtube_video_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline truncate"
                                  >
                                    youtube.com/watch?v={asset.youtube_video_id}
                                  </a>
                                ) : (
                                  <span className="truncate flex-1">{asset.text || asset.name}</span>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"
                                  onClick={() => handleRemoveAsset(group.id, asset)}
                                  title="Eliminar"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {Object.keys(groupDetails[group.id].assets).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">Sin assets</p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* Create Asset Group Dialog (shared component) */}
      <CreateAssetGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        connectionId={connectionId}
        pmaxCampaigns={pmaxCampaigns}
        onCreated={handleAssetGroupCreated}
      />

      {/* Add Asset Dialog */}
      <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Agregar Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={newAsset.field_type}
                onChange={e => setNewAsset(prev => ({ ...prev, field_type: e.target.value }))}
              >
                <option value="HEADLINE">Headline (max 30 chars)</option>
                <option value="LONG_HEADLINE">Headline largo (max 90 chars)</option>
                <option value="DESCRIPTION">Descripcion (max 90 chars)</option>
                <option value="BUSINESS_NAME">Nombre negocio</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Texto</Label>
              {(() => {
                const MAX_BY_TYPE: Record<string, number> = { HEADLINE: 30, LONG_HEADLINE: 90, DESCRIPTION: 90, BUSINESS_NAME: 25 };
                const max = MAX_BY_TYPE[newAsset.field_type] ?? 90;
                return (
                  <>
                    <Input
                      value={newAsset.text}
                      onChange={e => setNewAsset(prev => ({ ...prev, text: e.target.value }))}
                      placeholder="Texto del asset..."
                      maxLength={max}
                    />
                    <p className="text-xs text-muted-foreground">
                      {newAsset.text.length}/{max} chars
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAssetOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddAsset} disabled={addAssetLoading || !newAsset.text}>
              {addAssetLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
