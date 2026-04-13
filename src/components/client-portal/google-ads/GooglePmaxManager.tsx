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
  Sparkles,
} from 'lucide-react';
import SteveRecommendation from './SteveRecommendation';

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
};

const adStrengthLabels: Record<string, string> = {
  EXCELLENT: 'Excelente',
  GOOD: 'Buena',
  AVERAGE: 'Promedio',
  POOR: 'Pobre',
  UNSPECIFIED: 'Sin datos',
};

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
};

export default function GooglePmaxManager({ connectionId, clientId }: GooglePmaxManagerProps) {
  const [assetGroups, setAssetGroups] = useState<AssetGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupDetails, setGroupDetails] = useState<Record<string, { assets: Record<string, AssetDetail[]>; count: number }>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: '',
    campaign_id: '',
    final_url: '',
    business_name: '',
    headlines: '',
    long_headlines: '',
    descriptions: '',
  });

  // Add asset dialog
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [addAssetGroupId, setAddAssetGroupId] = useState<string | null>(null);
  const [addAssetLoading, setAddAssetLoading] = useState(false);
  const [newAsset, setNewAsset] = useState({ field_type: 'HEADLINE', text: '' });

  const fetchAssetGroups = useCallback(async () => {
    setLoading(true);
    const { data, error } = await callApi('manage-google-pmax', {
      body: { action: 'list_asset_groups', connection_id: connectionId },
    });

    if (error) {
      toast.error('Error cargando asset groups: ' + error);
      setLoading(false);
      return;
    }

    setAssetGroups(data?.asset_groups || []);
    setLoading(false);
  }, [connectionId]);

  useEffect(() => {
    fetchAssetGroups();
  }, [fetchAssetGroups]);

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

  const handleCreate = async () => {
    if (!newGroup.name || !newGroup.campaign_id || !newGroup.final_url) {
      toast.error('Nombre, campana y URL final son requeridos');
      return;
    }

    setCreateLoading(true);
    const { error } = await callApi('manage-google-pmax', {
      body: {
        action: 'create_asset_group',
        connection_id: connectionId,
        campaign_id: newGroup.campaign_id,
        data: {
          name: newGroup.name,
          final_urls: [newGroup.final_url],
          business_name: newGroup.business_name || undefined,
          headlines: newGroup.headlines ? newGroup.headlines.split('\n').filter(Boolean) : undefined,
          long_headlines: newGroup.long_headlines ? newGroup.long_headlines.split('\n').filter(Boolean) : undefined,
          descriptions: newGroup.descriptions ? newGroup.descriptions.split('\n').filter(Boolean) : undefined,
        },
      },
    });
    setCreateLoading(false);

    if (error) {
      toast.error('Error creando asset group: ' + error);
      return;
    }

    toast.success('Asset group creado');
    setCreateOpen(false);
    setNewGroup({ name: '', campaign_id: '', final_url: '', business_name: '', headlines: '', long_headlines: '', descriptions: '' });
    fetchAssetGroups();
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

  const handleApplyRecommendation = (rec: any) => {
    if (rec?.headlines) {
      setNewGroup(prev => ({
        ...prev,
        headlines: rec.headlines.join('\n'),
        long_headlines: rec.long_headlines?.join('\n') || prev.long_headlines,
        descriptions: rec.descriptions?.join('\n') || prev.descriptions,
      }));
      toast.success('Sugerencias de Steve aplicadas');
    }
  };

  // Get unique PMAX campaign IDs for the create dialog
  const pmaxCampaigns = [...new Map(assetGroups.map(ag => [ag.campaign_id, { id: ag.campaign_id, name: ag.campaign_name }])).values()];

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
        <h3 className="text-sm font-medium text-muted-foreground">
          {assetGroups.length} asset group{assetGroups.length !== 1 ? 's' : ''} PMAX
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAssetGroups}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refrescar
          </Button>
          {pmaxCampaigns.length > 0 && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Crear Asset Group
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {assetGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay asset groups PMAX en esta cuenta.
            <br />
            <span className="text-xs">Crea una campana Performance Max primero.</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {assetGroups.map(group => (
            <Card key={group.id} className="overflow-hidden">
              {/* Group header */}
              <button
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                onClick={() => toggleGroup(group.id)}
              >
                {expandedGroup === group.id
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
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{groupDetails[group.id].count} assets</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setAddAssetGroupId(group.id); setAddAssetOpen(true); }}
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
          ))}
        </div>
      )}

      {/* Create Asset Group Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Asset Group PMAX</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={newGroup.name}
                onChange={e => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Mi Asset Group"
              />
            </div>

            <div className="space-y-2">
              <Label>Campana PMAX *</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={newGroup.campaign_id}
                onChange={e => setNewGroup(prev => ({ ...prev, campaign_id: e.target.value }))}
              >
                <option value="">Seleccionar campana...</option>
                {pmaxCampaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>URL Final *</Label>
              <Input
                value={newGroup.final_url}
                onChange={e => setNewGroup(prev => ({ ...prev, final_url: e.target.value }))}
                placeholder="https://mitienda.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Nombre del negocio</Label>
              <Input
                value={newGroup.business_name}
                onChange={e => setNewGroup(prev => ({ ...prev, business_name: e.target.value }))}
                placeholder="Mi Empresa"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Headlines (1 por linea, max 30 chars)</Label>
                <SteveRecommendation
                  connectionId={connectionId}
                  recommendationType="pmax_assets"
                  context={newGroup.business_name || newGroup.final_url}
                  onApply={handleApplyRecommendation}
                />
              </div>
              <Textarea
                value={newGroup.headlines}
                onChange={e => setNewGroup(prev => ({ ...prev, headlines: e.target.value }))}
                placeholder="Headline 1&#10;Headline 2&#10;Headline 3"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Headlines largos (1 por linea, max 90 chars)</Label>
              <Textarea
                value={newGroup.long_headlines}
                onChange={e => setNewGroup(prev => ({ ...prev, long_headlines: e.target.value }))}
                placeholder="Headline largo 1&#10;Headline largo 2"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Descripciones (1 por linea, max 90 chars)</Label>
              <Textarea
                value={newGroup.descriptions}
                onChange={e => setNewGroup(prev => ({ ...prev, descriptions: e.target.value }))}
                placeholder="Descripcion 1&#10;Descripcion 2"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Input
                value={newAsset.text}
                onChange={e => setNewAsset(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Texto del asset..."
                maxLength={newAsset.field_type === 'HEADLINE' ? 30 : 90}
              />
              <p className="text-xs text-muted-foreground">
                {newAsset.text.length}/{newAsset.field_type === 'HEADLINE' ? 30 : 90} chars
              </p>
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
