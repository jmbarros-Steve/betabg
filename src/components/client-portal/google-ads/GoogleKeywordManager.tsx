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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, RefreshCw, Loader2, Pause, Play, Trash2, Plus, Ban, DollarSign,
} from 'lucide-react';

interface Keyword {
  criterion_id: string;
  keyword_text: string;
  match_type: string;
  status: string;
  cpc_bid_currency: number;
  cpc_bid_clp: number;
  quality_score: number | null;
  ad_group_id: string;
  ad_group_name: string;
  campaign_id: string;
  campaign_name: string;
  clicks: number;
  impressions: number;
  ctr: number;
  cost_clp: number;
  conversions: number;
  currency: string;
}

interface SearchTerm {
  search_term: string;
  status: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  clicks: number;
  impressions: number;
  ctr: number;
  cost_clp: number;
  conversions: number;
  currency: string;
}

interface AdGroup {
  id: string;
  name: string;
  campaign_id: string;
  campaign_name: string;
}

interface GoogleKeywordManagerProps {
  connectionId: string;
  clientId: string;
}

const matchTypeColors: Record<string, string> = {
  EXACT: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  PHRASE: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  BROAD: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

const statusColors: Record<string, string> = {
  ENABLED: 'bg-green-500/10 text-green-500 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

function qualityScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 7) return 'text-green-500';
  if (score >= 4) return 'text-yellow-500';
  return 'text-red-500';
}

export default function GoogleKeywordManager({ connectionId, clientId }: GoogleKeywordManagerProps) {
  const [tab, setTab] = useState('keywords');
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
  const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('ALL');
  const [adGroupFilter, setAdGroupFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Add keyword dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState({ text: '', match_type: 'EXACT', ad_group_id: '', cpc_bid: '' });
  const [addingKeyword, setAddingKeyword] = useState(false);

  // Edit bid dialog
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [bidKeyword, setBidKeyword] = useState<Keyword | null>(null);
  const [newBid, setNewBid] = useState('');
  const [savingBid, setSavingBid] = useState(false);

  // Negative keyword dialog
  const [negDialogOpen, setNegDialogOpen] = useState(false);
  const [negTerm, setNegTerm] = useState<SearchTerm | null>(null);
  const [negMatchType, setNegMatchType] = useState('EXACT');
  const [addingNeg, setAddingNeg] = useState(false);

  const campaigns = Array.from(new Map(adGroups.map(ag => [ag.campaign_id, ag.campaign_name])).entries())
    .map(([id, name]) => ({ id, name }));

  const filteredAdGroups = campaignFilter === 'ALL' ? adGroups : adGroups.filter(ag => ag.campaign_id === campaignFilter);

  const fetchAdGroups = useCallback(async () => {
    const { data, error } = await callApi('manage-google-keywords', {
      body: { action: 'list_ad_groups', connection_id: connectionId },
    });
    if (!error && data?.ad_groups) setAdGroups(data.ad_groups);
  }, [connectionId]);

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    const body: any = { action: 'list_keywords', connection_id: connectionId };
    if (campaignFilter !== 'ALL') body.campaign_id = campaignFilter;
    if (adGroupFilter !== 'ALL') body.ad_group_id = adGroupFilter;

    const { data, error } = await callApi('manage-google-keywords', { body });
    if (error) {
      toast.error('Error cargando keywords: ' + error);
      setLoading(false);
      return;
    }
    setKeywords(data?.keywords || []);
    setLoading(false);
  }, [connectionId, campaignFilter, adGroupFilter]);

  const fetchSearchTerms = useCallback(async () => {
    setLoading(true);
    const body: any = { action: 'list_search_terms', connection_id: connectionId };
    if (campaignFilter !== 'ALL') body.campaign_id = campaignFilter;

    const { data, error } = await callApi('manage-google-keywords', { body });
    if (error) {
      toast.error('Error cargando search terms: ' + error);
      setLoading(false);
      return;
    }
    setSearchTerms(data?.search_terms || []);
    setLoading(false);
  }, [connectionId, campaignFilter]);

  useEffect(() => { fetchAdGroups(); }, [fetchAdGroups]);
  useEffect(() => {
    if (tab === 'keywords') fetchKeywords();
    else fetchSearchTerms();
  }, [tab, fetchKeywords, fetchSearchTerms]);

  const handlePauseResume = async (kw: Keyword) => {
    const newStatus = kw.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    const key = `${kw.ad_group_id}_${kw.criterion_id}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));

    setKeywords(prev => prev.map(k =>
      k.criterion_id === kw.criterion_id && k.ad_group_id === kw.ad_group_id
        ? { ...k, status: newStatus } : k
    ));

    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'update_keyword', connection_id: connectionId,
        data: { ad_group_id: kw.ad_group_id, criterion_id: kw.criterion_id, status: newStatus },
      },
    });

    setActionLoading(prev => ({ ...prev, [key]: false }));
    if (error) {
      toast.error('Error: ' + error);
      setKeywords(prev => prev.map(k =>
        k.criterion_id === kw.criterion_id && k.ad_group_id === kw.ad_group_id
          ? { ...k, status: kw.status } : k
      ));
      return;
    }
    toast.success(`Keyword ${newStatus === 'PAUSED' ? 'pausada' : 'activada'}`);
  };

  const handleDelete = async (kw: Keyword) => {
    const key = `del_${kw.ad_group_id}_${kw.criterion_id}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));

    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'remove_keyword', connection_id: connectionId,
        data: { ad_group_id: kw.ad_group_id, criterion_id: kw.criterion_id },
      },
    });

    setActionLoading(prev => ({ ...prev, [key]: false }));
    if (error) { toast.error('Error eliminando: ' + error); return; }
    toast.success('Keyword eliminada');
    setKeywords(prev => prev.filter(k => !(k.criterion_id === kw.criterion_id && k.ad_group_id === kw.ad_group_id)));
  };

  const handleSaveBid = async () => {
    if (!bidKeyword || !newBid) return;
    setSavingBid(true);
    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'update_keyword', connection_id: connectionId,
        data: { ad_group_id: bidKeyword.ad_group_id, criterion_id: bidKeyword.criterion_id, cpc_bid: Number(newBid) },
      },
    });
    setSavingBid(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success('Bid actualizado');
    setBidDialogOpen(false);
    fetchKeywords();
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.text || !newKeyword.ad_group_id) {
      toast.error('Completa keyword y ad group');
      return;
    }
    setAddingKeyword(true);
    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'add_keyword', connection_id: connectionId,
        data: {
          ad_group_id: newKeyword.ad_group_id,
          keyword_text: newKeyword.text,
          match_type: newKeyword.match_type,
          cpc_bid: newKeyword.cpc_bid ? Number(newKeyword.cpc_bid) : undefined,
        },
      },
    });
    setAddingKeyword(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success('Keyword agregada');
    setAddDialogOpen(false);
    setNewKeyword({ text: '', match_type: 'EXACT', ad_group_id: '', cpc_bid: '' });
    fetchKeywords();
  };

  const handleAddNegative = async () => {
    if (!negTerm) return;
    setAddingNeg(true);
    const { error } = await callApi('manage-google-keywords', {
      body: {
        action: 'add_negative_keyword', connection_id: connectionId,
        data: { campaign_id: negTerm.campaign_id, keyword_text: negTerm.search_term, match_type: negMatchType },
      },
    });
    setAddingNeg(false);
    if (error) { toast.error('Error: ' + error); return; }
    toast.success('Negativa agregada');
    setNegDialogOpen(false);
  };

  const filteredKeywords = keywords.filter(kw => {
    if (statusFilter !== 'ALL' && kw.status !== statusFilter) return false;
    if (searchQuery && !kw.keyword_text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredSearchTerms = searchTerms.filter(st => {
    if (searchQuery && !st.search_term.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading && keywords.length === 0 && searchTerms.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="keywords">Keywords</TabsTrigger>
          <TabsTrigger value="search_terms">Terminos de Busqueda</TabsTrigger>
        </TabsList>

        {/* Shared filters */}
        <div className="flex flex-wrap gap-3 items-center mt-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={campaignFilter} onValueChange={v => { setCampaignFilter(v); setAdGroupFilter('ALL'); }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Campana" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las campanas</SelectItem>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {tab === 'keywords' && (
            <>
              <Select value={adGroupFilter} onValueChange={setAdGroupFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ad Group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los grupos</SelectItem>
                  {filteredAdGroups.map(ag => <SelectItem key={ag.id} value={ag.id}>{ag.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="ENABLED">Activas</SelectItem>
                  <SelectItem value="PAUSED">Pausadas</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => tab === 'keywords' ? fetchKeywords() : fetchSearchTerms()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refrescar
          </Button>
          {tab === 'keywords' && (
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Agregar Keyword
            </Button>
          )}
        </div>

        {/* Keywords tab */}
        <TabsContent value="keywords" className="mt-4">
          {loading ? <Skeleton className="h-64 w-full" /> : filteredKeywords.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              {keywords.length === 0 ? 'No se encontraron keywords' : 'Ninguna keyword coincide con los filtros'}
            </CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Keyword</th>
                    <th className="text-left p-3 font-medium">Match</th>
                    <th className="text-left p-3 font-medium">Estado</th>
                    <th className="text-right p-3 font-medium">CPC Bid</th>
                    <th className="text-center p-3 font-medium">QS</th>
                    <th className="text-right p-3 font-medium">Clicks</th>
                    <th className="text-right p-3 font-medium">Impr</th>
                    <th className="text-right p-3 font-medium">CTR</th>
                    <th className="text-right p-3 font-medium">Costo</th>
                    <th className="text-right p-3 font-medium">Conv</th>
                    <th className="text-right p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeywords.map(kw => {
                    const key = `${kw.ad_group_id}_${kw.criterion_id}`;
                    return (
                      <tr key={key} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 max-w-[200px]">
                          <div className="font-medium truncate" title={kw.keyword_text}>{kw.keyword_text}</div>
                          <div className="text-xs text-muted-foreground truncate">{kw.ad_group_name}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={matchTypeColors[kw.match_type] || ''}>{kw.match_type}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={statusColors[kw.status] || ''}>
                            {kw.status === 'ENABLED' ? 'Activa' : 'Pausada'}
                          </Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums">${(kw.cpc_bid_clp ?? 0).toLocaleString('es-CL')}</td>
                        <td className="p-3 text-center">
                          <span className={`font-bold ${qualityScoreColor(kw.quality_score)}`}>
                            {kw.quality_score ?? '-'}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{(kw.clicks ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{(kw.impressions ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{(kw.ctr ?? 0).toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">${(kw.cost_clp ?? 0).toLocaleString('es-CL')}</td>
                        <td className="p-3 text-right tabular-nums">{(kw.conversions ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm" disabled={actionLoading[key]}
                              onClick={() => handlePauseResume(kw)}
                              title={kw.status === 'ENABLED' ? 'Pausar' : 'Activar'}>
                              {actionLoading[key] ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                kw.status === 'ENABLED' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setBidKeyword(kw); setNewBid(String(kw.cpc_bid_currency ?? '')); setBidDialogOpen(true); }} title="Editar Bid">
                              <DollarSign className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" disabled={actionLoading[`del_${key}`]}
                              onClick={() => handleDelete(kw)} title="Eliminar">
                              {actionLoading[`del_${key}`] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">{filteredKeywords.length} keyword{filteredKeywords.length !== 1 ? 's' : ''} (30 dias)</p>
        </TabsContent>

        {/* Search Terms tab */}
        <TabsContent value="search_terms" className="mt-4">
          {loading ? <Skeleton className="h-64 w-full" /> : filteredSearchTerms.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No se encontraron terminos de busqueda
            </CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Termino</th>
                    <th className="text-left p-3 font-medium">Campana</th>
                    <th className="text-right p-3 font-medium">Clicks</th>
                    <th className="text-right p-3 font-medium">Impr</th>
                    <th className="text-right p-3 font-medium">CTR</th>
                    <th className="text-right p-3 font-medium">Costo</th>
                    <th className="text-right p-3 font-medium">Conv</th>
                    <th className="text-right p-3 font-medium">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSearchTerms.map((st, i) => {
                    const isHighCostNoConv = st.cost_clp > 5000 && st.conversions === 0;
                    return (
                      <tr key={`${st.search_term}_${st.campaign_id}_${i}`} className={`border-b last:border-0 hover:bg-muted/30 ${isHighCostNoConv ? 'bg-red-500/5' : ''}`}>
                        <td className="p-3 font-medium max-w-[250px] truncate" title={st.search_term}>{st.search_term}</td>
                        <td className="p-3 text-muted-foreground text-xs truncate max-w-[150px]">{st.campaign_name}</td>
                        <td className="p-3 text-right tabular-nums">{(st.clicks ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{(st.impressions ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right tabular-nums">{(st.ctr ?? 0).toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">${(st.cost_clp ?? 0).toLocaleString('es-CL')}</td>
                        <td className="p-3 text-right tabular-nums">{(st.conversions ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => { setNegTerm(st); setNegMatchType('EXACT'); setNegDialogOpen(true); }} title="Agregar como negativa">
                            <Ban className="w-4 h-4 text-red-500" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">{filteredSearchTerms.length} terminos (30 dias)</p>
        </TabsContent>
      </Tabs>

      {/* Add Keyword Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader><DialogTitle>Agregar Keyword</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ad Group</Label>
              <Select value={newKeyword.ad_group_id} onValueChange={v => setNewKeyword(prev => ({ ...prev, ad_group_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ad group" /></SelectTrigger>
                <SelectContent>
                  {adGroups.map(ag => <SelectItem key={ag.id} value={ag.id}>{ag.campaign_name} &gt; {ag.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Keyword</Label>
              <Input placeholder="Ej: zapatos deportivos" value={newKeyword.text} onChange={e => setNewKeyword(prev => ({ ...prev, text: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Match Type</Label>
              <Select value={newKeyword.match_type} onValueChange={v => setNewKeyword(prev => ({ ...prev, match_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXACT">Exact</SelectItem>
                  <SelectItem value="PHRASE">Phrase</SelectItem>
                  <SelectItem value="BROAD">Broad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CPC Bid (opcional, moneda de cuenta)</Label>
              <Input type="number" min="0" step="any" placeholder="Ej: 500" value={newKeyword.cpc_bid} onChange={e => setNewKeyword(prev => ({ ...prev, cpc_bid: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddKeyword} disabled={addingKeyword}>
              {addingKeyword && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bid Dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Editar CPC Bid</DialogTitle></DialogHeader>
          {bidKeyword && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground truncate">{bidKeyword.keyword_text}</p>
              <div className="space-y-2">
                <Label>Nuevo bid ({bidKeyword.currency})</Label>
                <Input type="number" min="0" step="any" value={newBid} onChange={e => setNewBid(e.target.value)} />
                <p className="text-xs text-muted-foreground">Actual: {bidKeyword.currency} {bidKeyword.cpc_bid_currency}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBidDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveBid} disabled={savingBid}>
              {savingBid && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Negative Keyword Dialog */}
      <Dialog open={negDialogOpen} onOpenChange={setNegDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Agregar como Negativa</DialogTitle></DialogHeader>
          {negTerm && (
            <div className="space-y-4">
              <p className="text-sm font-medium">"{negTerm.search_term}"</p>
              <p className="text-xs text-muted-foreground">Campana: {negTerm.campaign_name}</p>
              <div className="space-y-2">
                <Label>Match Type</Label>
                <Select value={negMatchType} onValueChange={setNegMatchType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXACT">Exact</SelectItem>
                    <SelectItem value="PHRASE">Phrase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNegDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleAddNegative} disabled={addingNeg}>
              {addingNeg && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Agregar Negativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
