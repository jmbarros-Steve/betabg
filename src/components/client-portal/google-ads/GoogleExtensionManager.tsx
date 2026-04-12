import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { RefreshCw, Loader2, Plus, Link2, X, Trash2 } from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  type: string;
  // Sitelink
  link_text?: string;
  description1?: string;
  description2?: string;
  final_urls?: string[];
  // Callout
  callout_text?: string;
  // Snippet
  header?: string;
  values?: string[];
  // Call
  phone_number?: string;
  country_code?: string;
}

interface CampaignAsset {
  resource_name: string;
  status: string;
  field_type: string;
  campaign_id: string;
  campaign_name: string;
  asset_id: string;
  asset_type: string;
}

interface Campaign {
  id: string;
  name: string;
}

interface GoogleExtensionManagerProps {
  connectionId: string;
  clientId: string;
}

const SNIPPET_HEADERS = [
  'Brands', 'Courses', 'Degree programs', 'Destinations', 'Featured hotels',
  'Insurance coverage', 'Models', 'Neighborhoods', 'Service catalog',
  'Shows', 'Styles', 'Types',
];

export default function GoogleExtensionManager({ connectionId, clientId }: GoogleExtensionManagerProps) {
  const [tab, setTab] = useState('sitelinks');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [campaignAssets, setCampaignAssets] = useState<CampaignAsset[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Create dialogs
  const [createType, setCreateType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [creating, setCreating] = useState(false);

  // Link dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkAsset, setLinkAsset] = useState<Asset | null>(null);
  const [linkCampaignId, setLinkCampaignId] = useState('');
  const [linking, setLinking] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, campAssetsRes] = await Promise.all([
        callApi('manage-google-extensions', { body: { action: 'list_assets', connection_id: connectionId } }),
        callApi('manage-google-extensions', { body: { action: 'list_campaign_assets', connection_id: connectionId } }),
      ]);

      if (assetsRes.error) toast.error('Error cargando extensiones: ' + assetsRes.error);
      if (campAssetsRes.error) toast.error('Error cargando campañas: ' + campAssetsRes.error);

      if (assetsRes.data?.assets) setAssets(assetsRes.data.assets);
      if (campAssetsRes.data?.campaign_assets) {
        setCampaignAssets(campAssetsRes.data.campaign_assets);
        const campMap = new Map<string, string>();
        for (const ca of campAssetsRes.data.campaign_assets) {
          campMap.set(ca.campaign_id, ca.campaign_name);
        }
        setCampaigns(Array.from(campMap.entries()).map(([id, name]) => ({ id, name })));
      }

      // Also fetch campaigns from campaign manager if none from assets
      if (!campAssetsRes.data?.campaign_assets?.length) {
        const { data } = await callApi('manage-google-campaign', {
          body: { action: 'list_details', connection_id: connectionId },
        });
        if (data?.campaigns) {
          setCampaigns(data.campaigns.map((c: any) => ({ id: c.id, name: c.name })));
        }
      }
    } catch (err) {
      console.error('fetchAll error:', err);
      toast.error('Error inesperado cargando extensiones');
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getCampaignAssetResource = (assetId: string, campaignId: string) =>
    campaignAssets.find(ca => ca.asset_id === assetId && ca.campaign_id === campaignId)?.resource_name;

  const handleCreate = async () => {
    if (!createType) return;

    switch (createType) {
      case 'sitelink':
        if (!formData.link_text?.trim()) { toast.error('Link text requerido'); return; }
        if (!formData.final_url?.trim()) { toast.error('URL requerida'); return; }
        break;
      case 'callout':
        if (!formData.callout_text?.trim()) { toast.error('Callout text requerido'); return; }
        break;
      case 'snippet':
        if (!formData.header) { toast.error('Header requerido'); return; }
        if ((formData.values_text?.split('\n').filter((v: string) => v.trim()) || []).length < 3) { toast.error('Minimo 3 valores'); return; }
        break;
      case 'call':
        if (!formData.country_code) { toast.error('Codigo de pais requerido'); return; }
        if (!formData.phone_number?.trim()) { toast.error('Numero requerido'); return; }
        break;
    }

    setCreating(true);
    try {
      let actionName = '';
      let body: Record<string, any> = {};

      switch (createType) {
        case 'sitelink':
          actionName = 'create_sitelink';
          body = { link_text: formData.link_text, description1: formData.description1, description2: formData.description2, final_urls: [formData.final_url] };
          break;
        case 'callout':
          actionName = 'create_callout';
          body = { callout_text: formData.callout_text };
          break;
        case 'snippet':
          actionName = 'create_snippet';
          body = { header: formData.header, values: formData.values_text?.split('\n').filter((v: string) => v.trim()) };
          break;
        case 'call':
          actionName = 'create_call';
          body = { country_code: formData.country_code, phone_number: formData.phone_number };
          break;
      }

      // Auto-link to campaign if selected
      if (formData.campaign_id) body.campaign_id = formData.campaign_id;

      const { error } = await callApi('manage-google-extensions', {
        body: { action: actionName, connection_id: connectionId, data: body },
      });

      if (error) { toast.error('Error: ' + error); return; }
      toast.success(formData.campaign_id ? 'Extension creada y vinculada a campana' : 'Extension creada');
      setCreateType(null);
      setFormData({});
      fetchAll();
    } finally {
      setCreating(false);
    }
  };

  const handleLink = async () => {
    if (!linkAsset || !linkCampaignId) return;
    setLinking(true);
    try {
      const fieldTypeMap: Record<string, string> = {
        SITELINK: 'SITELINK', CALLOUT: 'CALLOUT', STRUCTURED_SNIPPET: 'STRUCTURED_SNIPPET', CALL: 'CALL',
      };

      const { error } = await callApi('manage-google-extensions', {
        body: {
          action: 'link_asset', connection_id: connectionId,
          data: { campaign_id: linkCampaignId, asset_id: linkAsset.id, field_type: fieldTypeMap[linkAsset.type] || linkAsset.type },
        },
      });

      if (error) { toast.error('Error vinculando: ' + error); return; }
      toast.success('Extension vinculada a campana');
      setLinkDialogOpen(false);
      fetchAll();
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (assetId: string, campaignId: string) => {
    const resourceName = getCampaignAssetResource(assetId, campaignId);
    if (!resourceName) return;

    const key = `unlink_${assetId}_${campaignId}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const { error } = await callApi('manage-google-extensions', {
        body: { action: 'unlink_asset', connection_id: connectionId, data: { resource_name: resourceName } },
      });

      if (error) { toast.error('Error: ' + error); return; }
      toast.success('Desvinculado');
      fetchAll();
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleRemove = async (assetId: string) => {
    const key = `rem_${assetId}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const { error } = await callApi('manage-google-extensions', {
        body: { action: 'remove_asset', connection_id: connectionId, data: { asset_id: assetId } },
      });

      if (error) { toast.error('Error eliminando: ' + error); return; }
      toast.success('Extension eliminada');
      setAssets(prev => prev.filter(a => a.id !== assetId));
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const filterByType = (type: string) => assets.filter(a => a.type === type);

  const renderLinkedBadges = (assetId: string) => {
    const linked = campaignAssets.filter(ca => ca.asset_id === assetId);
    if (linked.length === 0) return <span className="text-xs text-muted-foreground">Sin campanas</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {linked.map((ca, i) => (
          <Badge key={i} variant="secondary" className="text-xs flex items-center gap-0.5">
            {ca.campaign_name}
            <button
              className="ml-0.5 hover:text-red-500 disabled:opacity-50"
              disabled={actionLoading[`unlink_${assetId}_${ca.campaign_id}`]}
              onClick={(e) => { e.stopPropagation(); handleUnlink(assetId, ca.campaign_id); }}
              title="Desvincular"
            >
              {actionLoading[`unlink_${assetId}_${ca.campaign_id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            </button>
          </Badge>
        ))}
      </div>
    );
  };

  const renderAssetActions = (asset: Asset) => (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => { setLinkAsset(asset); setLinkCampaignId(''); setLinkDialogOpen(true); }} title="Vincular a campana">
        <Link2 className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" disabled={actionLoading[`rem_${asset.id}`]} onClick={() => handleRemove(asset.id)} title="Eliminar">
        {actionLoading[`rem_${asset.id}`] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
      </Button>
    </div>
  );

  if (loading && assets.length === 0) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="sitelinks">Sitelinks ({filterByType('SITELINK').length})</TabsTrigger>
            <TabsTrigger value="callouts">Callouts ({filterByType('CALLOUT').length})</TabsTrigger>
            <TabsTrigger value="snippets">Snippets ({filterByType('STRUCTURED_SNIPPET').length})</TabsTrigger>
            <TabsTrigger value="calls">Llamadas ({filterByType('CALL').length})</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll}><RefreshCw className="w-4 h-4 mr-1" /> Refrescar</Button>
            <Button size="sm" onClick={() => {
              const typeMap: Record<string, string> = { sitelinks: 'sitelink', callouts: 'callout', snippets: 'snippet', calls: 'call' };
              setFormData({});
              setCreateType(typeMap[tab]);
            }}><Plus className="w-4 h-4 mr-1" /> Crear</Button>
          </div>
        </div>

        {/* Sitelinks */}
        <TabsContent value="sitelinks" className="mt-4">
          {filterByType('SITELINK').length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No hay sitelinks</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Link Text</th>
                  <th className="text-left p-3 font-medium">Desc 1</th>
                  <th className="text-left p-3 font-medium">Desc 2</th>
                  <th className="text-left p-3 font-medium">URL</th>
                  <th className="text-left p-3 font-medium">Campanas</th>
                  <th className="text-right p-3 font-medium">Acciones</th>
                </tr></thead>
                <tbody>
                  {filterByType('SITELINK').map(a => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{a.link_text}</td>
                      <td className="p-3 text-muted-foreground text-xs">{a.description1 || '-'}</td>
                      <td className="p-3 text-muted-foreground text-xs">{a.description2 || '-'}</td>
                      <td className="p-3 text-xs truncate max-w-[150px]">{a.final_urls?.[0] || '-'}</td>
                      <td className="p-3">{renderLinkedBadges(a.id)}</td>
                      <td className="p-3 text-right">{renderAssetActions(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Callouts */}
        <TabsContent value="callouts" className="mt-4">
          {filterByType('CALLOUT').length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No hay callouts</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filterByType('CALLOUT').map(a => (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{a.callout_text}</p>
                      {renderAssetActions(a)}
                    </div>
                    {renderLinkedBadges(a.id)}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Snippets */}
        <TabsContent value="snippets" className="mt-4">
          {filterByType('STRUCTURED_SNIPPET').length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No hay structured snippets</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Header</th>
                  <th className="text-left p-3 font-medium">Values</th>
                  <th className="text-left p-3 font-medium">Campanas</th>
                  <th className="text-right p-3 font-medium">Acciones</th>
                </tr></thead>
                <tbody>
                  {filterByType('STRUCTURED_SNIPPET').map(a => (
                    <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3 font-medium">{a.header}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(a.values || []).map((v, i) => <Badge key={i} variant="outline" className="text-xs">{v}</Badge>)}
                        </div>
                      </td>
                      <td className="p-3">{renderLinkedBadges(a.id)}</td>
                      <td className="p-3 text-right">{renderAssetActions(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Calls */}
        <TabsContent value="calls" className="mt-4">
          {filterByType('CALL').length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No hay extensiones de llamada</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filterByType('CALL').map(a => (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{a.country_code} {a.phone_number}</p>
                      <div className="mt-1">{renderLinkedBadges(a.id)}</div>
                    </div>
                    {renderAssetActions(a)}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={!!createType} onOpenChange={v => { if (!v) setCreateType(null); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>
            Crear {createType === 'sitelink' ? 'Sitelink' : createType === 'callout' ? 'Callout' : createType === 'snippet' ? 'Structured Snippet' : 'Extension de Llamada'}
          </DialogTitle></DialogHeader>

          {/* Campaign selector — shared across all types */}
          <div className="space-y-1">
            <Label>Vincular a campana (opcional)</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={formData.campaign_id || ''}
              onChange={e => setFormData(p => ({ ...p, campaign_id: e.target.value }))}
            >
              <option value="">Sin campana (solo crear)</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {createType === 'sitelink' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Link Text (max 25)</Label>
                <Input maxLength={25} value={formData.link_text || ''} onChange={e => setFormData(p => ({ ...p, link_text: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Description 1 (max 35)</Label>
                <Input maxLength={35} value={formData.description1 || ''} onChange={e => setFormData(p => ({ ...p, description1: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Description 2 (max 35)</Label>
                <Input maxLength={35} value={formData.description2 || ''} onChange={e => setFormData(p => ({ ...p, description2: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>URL Final</Label>
                <Input placeholder="https://..." value={formData.final_url || ''} onChange={e => setFormData(p => ({ ...p, final_url: e.target.value }))} />
              </div>
            </div>
          )}

          {createType === 'callout' && (
            <div className="space-y-3">
              <Label>Callout Text (max 25)</Label>
              <Input maxLength={25} value={formData.callout_text || ''} onChange={e => setFormData(p => ({ ...p, callout_text: e.target.value }))} />
            </div>
          )}

          {createType === 'snippet' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Header</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.header || ''}
                  onChange={e => setFormData(p => ({ ...p, header: e.target.value }))}
                >
                  <option value="">Seleccionar header</option>
                  {SNIPPET_HEADERS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Values (uno por linea)</Label>
                <Textarea rows={5} placeholder="Valor 1\nValor 2\nValor 3" value={formData.values_text || ''} onChange={e => setFormData(p => ({ ...p, values_text: e.target.value }))} />
              </div>
            </div>
          )}

          {createType === 'call' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Codigo de Pais</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={formData.country_code || ''}
                  onChange={e => setFormData(p => ({ ...p, country_code: e.target.value }))}
                >
                  <option value="">Seleccionar pais</option>
                  <option value="CL">CL (+56)</option>
                  <option value="MX">MX (+52)</option>
                  <option value="CO">CO (+57)</option>
                  <option value="AR">AR (+54)</option>
                  <option value="PE">PE (+51)</option>
                  <option value="US">US (+1)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Numero de Telefono</Label>
                <Input placeholder="+56912345678" value={formData.phone_number || ''} onChange={e => setFormData(p => ({ ...p, phone_number: e.target.value }))} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateType(null)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Crear{formData.campaign_id ? ' y vincular' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Vincular a Campana</DialogTitle></DialogHeader>
          {linkAsset && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {linkAsset.type}: {linkAsset.link_text || linkAsset.callout_text || linkAsset.header || linkAsset.phone_number}
              </p>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={linkCampaignId}
                onChange={e => setLinkCampaignId(e.target.value)}
              >
                <option value="">Seleccionar campana</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleLink} disabled={linking || !linkCampaignId}>
              {linking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
