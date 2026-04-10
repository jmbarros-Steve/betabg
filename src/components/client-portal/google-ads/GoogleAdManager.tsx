import { useState, useEffect, useCallback } from 'react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, RefreshCw, Loader2, Pause, Play, Plus, ChevronDown, ChevronUp, Sparkles, Trash2,
} from 'lucide-react';

interface RSAd {
  resource_name: string;
  ad_id: string;
  headlines: { text: string; pinned_field: string | null }[];
  descriptions: { text: string; pinned_field: string | null }[];
  path1: string;
  path2: string;
  final_urls: string[];
  approval_status: string;
  status: string;
  ad_strength: string;
  ad_group_id: string;
  ad_group_name: string;
  campaign_id: string;
  campaign_name: string;
  clicks: number;
  impressions: number;
  ctr: number;
}

interface AdGroup {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
}

interface GoogleAdManagerProps {
  connectionId: string;
  clientId: string;
}

const strengthColors: Record<string, string> = {
  EXCELLENT: 'bg-green-500/10 text-green-500 border-green-500/20',
  GOOD: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  AVERAGE: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  POOR: 'bg-red-500/10 text-red-500 border-red-500/20',
  UNSPECIFIED: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const approvalColors: Record<string, string> = {
  APPROVED: 'bg-green-500/10 text-green-500 border-green-500/20',
  APPROVED_LIMITED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  AREA_OF_INTEREST_ONLY: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  DISAPPROVED: 'bg-red-500/10 text-red-500 border-red-500/20',
  UNKNOWN: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

const statusColors: Record<string, string> = {
  ENABLED: 'bg-green-500/10 text-green-500 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export default function GoogleAdManager({ connectionId, clientId }: GoogleAdManagerProps) {
  const [ads, setAds] = useState<RSAd[]>([]);
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedAd, setExpandedAd] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Create RSA dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [selectedAdGroup, setSelectedAdGroup] = useState('');
  const [headlines, setHeadlines] = useState<string[]>(['', '', '']);
  const [descriptions, setDescriptions] = useState<string[]>(['', '']);
  const [finalUrl, setFinalUrl] = useState('');
  const [path1, setPath1] = useState('');
  const [path2, setPath2] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);

  const campaigns = Array.from(new Map(adGroups.map(ag => [ag.campaign_id, ag.campaign_name])).entries())
    .map(([id, name]) => ({ id, name }));

  const fetchAds = useCallback(async () => {
    setLoading(true);
    const body: any = { action: 'list_rsa', connection_id: connectionId };
    if (campaignFilter !== 'ALL') body.campaign_id = campaignFilter;

    const { data, error } = await callApi('manage-google-ads-content', { body });
    if (error) { toast.error('Error cargando anuncios: ' + error); setLoading(false); return; }
    setAds(data?.ads || []);
    setLoading(false);
  }, [connectionId, campaignFilter]);

  const fetchAdGroups = useCallback(async () => {
    const { data, error } = await callApi('manage-google-ads-content', {
      body: { action: 'list_ad_groups', connection_id: connectionId },
    });
    if (error) { toast.error('Error cargando ad groups: ' + error); return; }
    if (data?.ad_groups) setAdGroups(data.ad_groups);
  }, [connectionId]);

  useEffect(() => { fetchAdGroups(); }, [fetchAdGroups]);
  useEffect(() => { fetchAds(); }, [fetchAds]);

  const handlePauseResume = async (ad: RSAd) => {
    const action = ad.status === 'ENABLED' ? 'pause_ad' : 'enable_ad';
    setActionLoading(prev => ({ ...prev, [ad.ad_id]: true }));

    setAds(prev => prev.map(a => a.ad_id === ad.ad_id ? { ...a, status: action === 'pause_ad' ? 'PAUSED' : 'ENABLED' } : a));

    const { error } = await callApi('manage-google-ads-content', {
      body: { action, connection_id: connectionId, data: { resource_name: ad.resource_name } },
    });

    setActionLoading(prev => ({ ...prev, [ad.ad_id]: false }));
    if (error) {
      toast.error('Error: ' + error);
      setAds(prev => prev.map(a => a.ad_id === ad.ad_id ? { ...a, status: ad.status } : a));
      return;
    }
    toast.success(`Anuncio ${action === 'pause_ad' ? 'pausado' : 'activado'}`);
  };

  const handleCreateRSA = async () => {
    if (!selectedAdGroup) { toast.error('Selecciona un ad group'); return; }
    const validHeadlines = headlines.filter(h => h.trim());
    const validDescs = descriptions.filter(d => d.trim());

    if (validHeadlines.length < 3) { toast.error('Minimo 3 headlines'); return; }
    if (validDescs.length < 2) { toast.error('Minimo 2 descriptions'); return; }
    if (!finalUrl.trim()) { toast.error('URL final requerida'); return; }

    for (const h of validHeadlines) {
      if (h.length > 30) { toast.error(`Headline "${h.slice(0,20)}..." excede 30 caracteres`); return; }
    }
    for (const d of validDescs) {
      if (d.length > 90) { toast.error('Description excede 90 caracteres'); return; }
    }

    setCreating(true);
    const { error } = await callApi('manage-google-ads-content', {
      body: {
        action: 'create_rsa', connection_id: connectionId,
        data: {
          ad_group_id: selectedAdGroup,
          headlines: validHeadlines,
          descriptions: validDescs,
          final_urls: [finalUrl.trim()],
          path1: path1.trim() || undefined,
          path2: path2.trim() || undefined,
        },
      },
    });
    setCreating(false);
    if (error) { toast.error('Error creando RSA: ' + error); return; }
    toast.success('Anuncio RSA creado');
    setCreateOpen(false);
    resetCreateForm();
    fetchAds();
  };

  const handleGenerateAI = async () => {
    setGeneratingAI(true);
    const { data, error } = await callApi('generate-google-copy', {
      body: { client_id: clientId, campaign_type: 'search', custom_instructions: 'Genera headlines y descriptions para un RSA de Google Ads' },
    });
    setGeneratingAI(false);

    if (error || !data) { toast.error('Error generando copy: ' + (error || 'Sin datos')); return; }

    const aiHeadlines = (data.headlines || []).map((h: string) => h.slice(0, 30)).slice(0, 15);
    const aiDescriptions = (data.descriptions || []).map((d: string) => d.slice(0, 90)).slice(0, 4);

    if (aiHeadlines.length > 0) setHeadlines([...aiHeadlines, ...Array(Math.max(0, 3 - aiHeadlines.length)).fill('')]);
    if (aiDescriptions.length > 0) setDescriptions([...aiDescriptions, ...Array(Math.max(0, 2 - aiDescriptions.length)).fill('')]);

    toast.success('Copy generado con IA');
  };

  const resetCreateForm = () => {
    setCreateStep(1);
    setSelectedAdGroup('');
    setHeadlines(['', '', '']);
    setDescriptions(['', '']);
    setFinalUrl('');
    setPath1('');
    setPath2('');
  };

  const filteredAds = ads.filter(ad => {
    if (statusFilter !== 'ALL' && ad.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(ad.ad_group_name || '').toLowerCase().includes(q) && !(ad.campaign_name || '').toLowerCase().includes(q) &&
          !(ad.headlines || []).some(h => (h.text || '').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  if (loading && ads.length === 0) {
    return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar anuncio..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Campana" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las campanas</SelectItem>
            {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="ENABLED">Activos</SelectItem>
            <SelectItem value="PAUSED">Pausados</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchAds}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
        </Button>
        <Button size="sm" onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Crear RSA
        </Button>
      </div>

      {/* Ads list */}
      {filteredAds.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          {ads.length === 0 ? 'No se encontraron anuncios RSA' : 'Ningun anuncio coincide con los filtros'}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredAds.map(ad => (
            <Card key={ad.ad_id} className="overflow-hidden">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium truncate">{ad.campaign_name} &gt; {ad.ad_group_name}</CardTitle>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className={statusColors[ad.status] || ''}>
                        {ad.status === 'ENABLED' ? 'Activo' : 'Pausado'}
                      </Badge>
                      <Badge variant="outline" className={approvalColors[ad.approval_status] || approvalColors.UNKNOWN}>
                        {ad.approval_status}
                      </Badge>
                      <Badge variant="outline" className={strengthColors[ad.ad_strength] || strengthColors.UNSPECIFIED}>
                        {ad.ad_strength}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{(ad.clicks ?? 0).toLocaleString()} clicks</div>
                      <div>{(ad.impressions ?? 0).toLocaleString()} impr</div>
                      <div>{(ad.ctr ?? 0).toFixed(1)}% CTR</div>
                    </div>
                    <Button variant="ghost" size="sm" disabled={actionLoading[ad.ad_id]} onClick={() => handlePauseResume(ad)}>
                      {actionLoading[ad.ad_id] ? <Loader2 className="w-4 h-4 animate-spin" /> :
                        ad.status === 'ENABLED' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedAd(expandedAd === ad.ad_id ? null : ad.ad_id)}>
                      {expandedAd === ad.ad_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedAd === ad.ad_id && (
                <CardContent className="p-4 pt-0 border-t mt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Headlines ({(ad.headlines || []).length})</p>
                      <div className="space-y-1">
                        {(ad.headlines || []).map((h, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground text-xs w-4">{i+1}.</span>
                            <span className="truncate">{h.text || ''}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{(h.text || '').length}/30</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Descriptions ({(ad.descriptions || []).length})</p>
                      <div className="space-y-1">
                        {(ad.descriptions || []).map((d, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground text-xs w-4 mt-0.5">{i+1}.</span>
                            <span className="flex-1">{d.text || ''}</span>
                            <span className="text-xs text-muted-foreground">{(d.text || '').length}/90</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {ad.final_urls.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground">URL: {ad.final_urls[0]}</p>
                      {(ad.path1 || ad.path2) && (
                        <p className="text-xs text-muted-foreground">Path: /{ad.path1}{ad.path2 ? `/${ad.path2}` : ''}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{filteredAds.length} anuncio{filteredAds.length !== 1 ? 's' : ''} RSA</p>

      {/* Create RSA Dialog */}
      <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) resetCreateForm(); }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Anuncio RSA</DialogTitle></DialogHeader>

          {createStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ad Group</Label>
                <Select value={selectedAdGroup} onValueChange={setSelectedAdGroup}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {adGroups.map(ag => <SelectItem key={ag.id} value={ag.id}>{ag.campaign_name} &gt; {ag.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                <Button onClick={() => { if (!selectedAdGroup) { toast.error('Selecciona un ad group'); return; } setCreateStep(2); }}>Siguiente</Button>
              </DialogFooter>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Headlines (min 3, max 15 — 30 chars c/u)</Label>
                <Button variant="outline" size="sm" onClick={handleGenerateAI} disabled={generatingAI}>
                  {generatingAI ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Generar con IA
                </Button>
              </div>
              {headlines.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={h} maxLength={30}
                    onChange={e => { const arr = [...headlines]; arr[i] = e.target.value; setHeadlines(arr); }}
                    placeholder={`Headline ${i+1}`}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">{h.length}/30</span>
                  {headlines.length > 3 && (
                    <Button variant="ghost" size="sm" onClick={() => setHeadlines(headlines.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              {headlines.length < 15 && (
                <Button variant="outline" size="sm" onClick={() => setHeadlines([...headlines, ''])}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar headline
                </Button>
              )}

              <Label>Descriptions (min 2, max 4 — 90 chars c/u)</Label>
              {descriptions.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Textarea
                    value={d} maxLength={90} rows={2}
                    onChange={e => { const arr = [...descriptions]; arr[i] = e.target.value; setDescriptions(arr); }}
                    placeholder={`Description ${i+1}`}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right mt-2">{d.length}/90</span>
                  {descriptions.length > 2 && (
                    <Button variant="ghost" size="sm" className="mt-1" onClick={() => setDescriptions(descriptions.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
              {descriptions.length < 4 && (
                <Button variant="outline" size="sm" onClick={() => setDescriptions([...descriptions, ''])}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar description
                </Button>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateStep(1)}>Atras</Button>
                <Button onClick={() => {
                  const validH = headlines.filter(h => h.trim());
                  const validD = descriptions.filter(d => d.trim());
                  if (validH.length < 3) { toast.error('Minimo 3 headlines con texto'); return; }
                  if (validD.length < 2) { toast.error('Minimo 2 descriptions con texto'); return; }
                  setCreateStep(3);
                }}>Siguiente</Button>
              </DialogFooter>
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>URL Final</Label>
                <Input placeholder="https://ejemplo.com/landing" value={finalUrl} onChange={e => setFinalUrl(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Display Path 1 (15 chars)</Label>
                  <Input maxLength={15} placeholder="productos" value={path1} onChange={e => setPath1(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Display Path 2 (15 chars)</Label>
                  <Input maxLength={15} placeholder="oferta" value={path2} onChange={e => setPath2(e.target.value)} />
                </div>
              </div>

              {/* Preview */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Vista previa</p>
                <p className="text-sm text-blue-600 font-medium">
                  {headlines.filter(h => h).slice(0, 3).join(' | ') || 'Headlines aqui...'}
                </p>
                <p className="text-xs text-green-700">
                  {finalUrl || 'https://...'}{path1 ? `/${path1}` : ''}{path2 ? `/${path2}` : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {descriptions.filter(d => d).slice(0, 2).join(' ') || 'Descriptions aqui...'}
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateStep(2)}>Atras</Button>
                <Button onClick={handleCreateRSA} disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Crear Anuncio
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
