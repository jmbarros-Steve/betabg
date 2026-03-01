import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronRight,
  ChevronDown,
  Megaphone,
  FolderOpen,
  FileImage,
  Pause,
  Play,
  DollarSign,
  TrendingUp,
  Target,
  MousePointerClick,
  Search,
  RefreshCw,
  Loader2,
  Users,
  Eye,
  Layers,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignTreeViewProps {
  clientId: string;
  onCreateCampaign?: () => void;
  onCreate322?: () => void;
}

interface AdSetNode {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  ads: AdNode[];
}

interface AdNode {
  id: string;
  name: string;
  status: string;
  format: string;
  image_url: string | null;
  primary_text: string;
  headline: string;
}

interface CampaignNode {
  campaign_id: string;
  campaign_name: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  budget_type: 'ABO' | 'CBO';
  daily_budget: number;
  objective: string;
  spend_30d: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversions: number;
  impressions: number;
  clicks: number;
  revenue: number;
  adset_count: number;
  adsets: AdSetNode[];
  adsets_loaded: boolean;
  adsets_loading: boolean;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCLP = (v: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const fmtNum = (v: number) => new Intl.NumberFormat('es-CL').format(Math.round(v));

const fmtPct = (v: number) => `${v.toFixed(2)}%`;

const fmtRoas = (v: number) => `${v.toFixed(2)}x`;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: 'Activa', cls: 'bg-green-500/15 text-green-700 border-green-500/30' },
    PAUSED: { label: 'Pausada', cls: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
    COMPLETED: { label: 'Completada', cls: 'bg-gray-500/15 text-gray-600 border-gray-500/30' },
    ARCHIVED: { label: 'Archivada', cls: 'bg-gray-400/10 text-gray-400 border-gray-400/20' },
  };
  const c = map[status] || map.ACTIVE;
  return <Badge variant="outline" className={`text-[10px] font-medium ${c.cls}`}>{c.label}</Badge>;
}

function BudgetTypeBadge({ type }: { type: 'ABO' | 'CBO' }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-bold ${type === 'CBO' ? 'bg-purple-500/15 text-purple-700 border-purple-500/30' : 'bg-blue-500/15 text-blue-700 border-blue-500/30'}`}>
      {type}
    </Badge>
  );
}

function ClassificationBadge({ roas, cpa, ctr, cpaTarget }: { roas: number; cpa: number; ctr: number; cpaTarget: number }) {
  if (cpaTarget <= 0) return null;
  const isWinner = roas >= 2 && cpa <= cpaTarget && ctr >= 1;
  const isLoser = cpa > cpaTarget * 2 || ctr < 0.5;
  if (isWinner) return <Badge className="bg-green-600 text-white text-[10px]">Ganador</Badge>;
  if (isLoser) return <Badge variant="destructive" className="text-[10px]">Perdedor</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Potencial</Badge>;
}

// ---------------------------------------------------------------------------
// Ad Set Row (level 2)
// ---------------------------------------------------------------------------

function AdSetRow({ adset, depth = 1 }: { adset: AdSetNode; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasAds = adset.ads.length > 0;
  const cpa = adset.conversions > 0 ? adset.spend / adset.conversions : 0;

  return (
    <>
      <button
        onClick={() => hasAds && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors border-b border-border/30 ${expanded ? 'bg-muted/20' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {hasAds ? (
          expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <FolderOpen className="w-3.5 h-3.5 text-orange-500 shrink-0" />
        <span className="text-sm font-medium truncate max-w-[220px]">{adset.name}</span>
        <StatusBadge status={adset.status} />
        <span className="ml-auto flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span title="Gasto">{fmtCLP(adset.spend)}</span>
          <span title="ROAS" className={adset.roas >= 2 ? 'text-green-600 font-medium' : adset.roas >= 1 ? 'text-yellow-600' : 'text-red-500'}>{fmtRoas(adset.roas)}</span>
          <span title="CPA">{cpa > 0 ? fmtCLP(cpa) : '--'}</span>
          <span title="CTR">{fmtPct(adset.ctr)}</span>
          <span title="Conv.">{fmtNum(adset.conversions)}</span>
          <span title="Ads" className="flex items-center gap-1"><FileImage className="w-3 h-3" />{adset.ads.length}</span>
        </span>
      </button>
      {expanded && adset.ads.map((ad) => (
        <div
          key={ad.id}
          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors border-b border-border/20"
          style={{ paddingLeft: `${(depth + 1) * 24 + 12}px` }}
        >
          <span className="w-3.5 shrink-0" />
          {ad.image_url ? (
            <img src={ad.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
          ) : (
            <FileImage className="w-3.5 h-3.5 text-pink-500 shrink-0" />
          )}
          <span className="text-sm truncate max-w-[200px]">{ad.name || ad.headline || 'Ad'}</span>
          <StatusBadge status={ad.status} />
          <Badge variant="outline" className="text-[10px]">{ad.format || 'image'}</Badge>
          {ad.primary_text && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden lg:block">{ad.primary_text}</span>
          )}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Campaign Row (level 1)
// ---------------------------------------------------------------------------

function CampaignRow({
  campaign,
  connectionIds,
  onToggleExpand,
}: {
  campaign: CampaignNode;
  connectionIds: string[];
  onToggleExpand: (campaignId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !campaign.adsets_loaded) {
      onToggleExpand(campaign.campaign_id);
    }
  };

  const handleToggleStatus = async () => {
    if (connectionIds.length === 0) return;
    setToggling(true);
    try {
      const action = campaign.status === 'ACTIVE' ? 'pause' : 'resume';
      await supabase.functions.invoke('manage-meta-campaign', {
        body: { action, campaign_id: campaign.campaign_id, connection_id: connectionIds[0] },
      });
      toast.success(action === 'pause' ? 'Campana pausada' : 'Campana reanudada');
    } catch {
      toast.error('Error al cambiar estado');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden mb-2 bg-background">
      {/* Campaign header */}
      <button
        onClick={handleExpand}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${expanded ? 'bg-muted/20 border-b border-border/40' : ''}`}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        <Megaphone className="w-4 h-4 text-primary shrink-0" />
        <span className="font-semibold text-sm truncate max-w-[260px]">{campaign.campaign_name}</span>
        <StatusBadge status={campaign.status} />
        <BudgetTypeBadge type={campaign.budget_type} />

        <span className="ml-auto flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span className="flex items-center gap-1" title="Gasto 30d"><DollarSign className="w-3 h-3" />{fmtCLP(campaign.spend_30d)}</span>
          <span className={`font-medium ${campaign.roas >= 3 ? 'text-green-600' : campaign.roas >= 2 ? 'text-yellow-600' : 'text-red-500'}`} title="ROAS">{fmtRoas(campaign.roas)}</span>
          <span title="CPA">{campaign.cpa > 0 ? fmtCLP(campaign.cpa) : '--'}</span>
          <span title="CTR">{fmtPct(campaign.ctr)}</span>
          <span title="Conv.">{fmtNum(campaign.conversions)}</span>
          <span className="flex items-center gap-1 text-muted-foreground" title="Ad Sets"><Layers className="w-3 h-3" />{campaign.adset_count}</span>
        </span>
      </button>

      {/* Expanded content — ad sets */}
      {expanded && (
        <div className="bg-muted/10">
          {campaign.adsets_loading && (
            <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />Cargando Ad Sets...
            </div>
          )}
          {!campaign.adsets_loading && campaign.adsets_loaded && campaign.adsets.length === 0 && (
            <div className="px-6 py-4 text-sm text-muted-foreground">Sin Ad Sets encontrados para esta campana.</div>
          )}
          {campaign.adsets.map((adset) => (
            <AdSetRow key={adset.id} adset={adset} />
          ))}
          {/* Inline actions */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); handleToggleStatus(); }}
              disabled={toggling}
            >
              {campaign.status === 'ACTIVE' ? <><Pause className="w-3 h-3 mr-1" />Pausar</> : <><Play className="w-3 h-3 mr-1" />Reanudar</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CampaignTreeView({ clientId, onCreateCampaign, onCreate322 }: CampaignTreeViewProps) {
  const { connectionId: ctxConnectionId } = useMetaBusiness();

  const [campaigns, setCampaigns] = useState<CampaignNode[]>([]);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // ---------- Fetch campaigns ----------
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      // Use connectionId from MetaBusinessContext
      if (!ctxConnectionId) {
        setCampaigns([]);
        setConnectionIds([]);
        setLoading(false);
        return;
      }
      const connIds = [ctxConnectionId];
      setConnectionIds(connIds);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const { data: metrics, error } = await supabase
        .from('campaign_metrics')
        .select('*')
        .in('connection_id', connIds)
        .gte('metric_date', thirtyDaysAgo)
        .order('metric_date', { ascending: false });

      if (error) throw error;

      // Aggregate by campaign
      const map = new Map<string, CampaignNode>();
      for (const m of metrics || []) {
        const existing = map.get(m.campaign_id);
        if (existing) {
          existing.spend_30d += Number(m.spend) || 0;
          existing.conversions += Number(m.conversions) || 0;
          existing.revenue += Number(m.conversion_value) || 0;
          existing.clicks += Number(m.clicks) || 0;
          existing.impressions += Number(m.impressions) || 0;
        } else {
          map.set(m.campaign_id, {
            campaign_id: m.campaign_id,
            campaign_name: m.campaign_name,
            status: 'ACTIVE',
            budget_type: m.campaign_name?.includes('CBO') || m.campaign_name?.includes('Ganador') ? 'CBO' : 'ABO',
            daily_budget: 0,
            objective: 'CONVERSIONS',
            spend_30d: Number(m.spend) || 0,
            roas: 0,
            cpa: 0,
            ctr: 0,
            conversions: Number(m.conversions) || 0,
            impressions: Number(m.impressions) || 0,
            clicks: Number(m.clicks) || 0,
            revenue: Number(m.conversion_value) || 0,
            adset_count: 0,
            adsets: [],
            adsets_loaded: false,
            adsets_loading: false,
          });
        }
      }

      // Compute derived metrics
      for (const [, c] of map) {
        c.roas = c.spend_30d > 0 ? c.revenue / c.spend_30d : 0;
        c.cpa = c.conversions > 0 ? c.spend_30d / c.conversions : 0;
        c.ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
        // Infer status: no recent data → PAUSED
        const recent = (metrics || []).filter(
          (m) => m.campaign_id === c.campaign_id && m.metric_date >= new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
        );
        if (recent.length === 0) c.status = 'PAUSED';
        const uniqueDays = new Set((metrics || []).filter((m) => m.campaign_id === c.campaign_id).map((m) => m.metric_date));
        c.daily_budget = uniqueDays.size > 0 ? Math.round(c.spend_30d / uniqueDays.size) : 0;
      }

      setCampaigns(Array.from(map.values()).sort((a, b) => b.spend_30d - a.spend_30d));
    } catch (err) {
      console.error('[CampaignTreeView] Error:', err);
      toast.error('Error cargando campanas');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  // Refresh when account changes (bg:sync-complete)
  useEffect(() => {
    const handler = () => fetchCampaigns();
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [fetchCampaigns]);

  // ---------- Fetch ad sets for a campaign ----------
  const fetchAdSets = useCallback(async (campaignId: string) => {
    if (connectionIds.length === 0) return;
    setCampaigns((prev) => prev.map((c) => c.campaign_id === campaignId ? { ...c, adsets_loading: true } : c));

    try {
      const { data, error } = await supabase.functions.invoke('fetch-campaign-adsets', {
        body: { connection_id: connectionIds[0], campaign_id: campaignId, platform: 'meta' },
      });
      if (error) throw error;

      const adSets: AdSetNode[] = (data?.ad_sets || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status || 'ACTIVE',
        spend: parseFloat(a.spend || '0'),
        impressions: parseInt(a.impressions || '0', 10),
        clicks: parseInt(a.clicks || '0', 10),
        ctr: parseFloat(a.ctr || '0'),
        conversions: a.conversions || 0,
        conversion_value: a.conversion_value || 0,
        roas: a.roas || 0,
        ads: [],
      }));

      setCampaigns((prev) => prev.map((c) =>
        c.campaign_id === campaignId
          ? { ...c, adsets: adSets, adsets_loaded: true, adsets_loading: false, adset_count: adSets.length }
          : c,
      ));
    } catch (err) {
      console.error('[CampaignTreeView] Error fetching ad sets:', err);
      setCampaigns((prev) => prev.map((c) => c.campaign_id === campaignId ? { ...c, adsets_loading: false, adsets_loaded: true } : c));
    }
  }, [connectionIds]);

  // ---------- Sync ----------
  const handleSync = async () => {
    if (connectionIds.length === 0) return;
    setSyncing(true);
    try {
      for (const connId of connectionIds) {
        await supabase.functions.invoke('sync-campaign-metrics', { body: { connection_id: connId, platform: 'meta' } });
      }
      toast.success('Datos sincronizados');
      await fetchCampaigns();
    } catch {
      toast.error('Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  // ---------- Filtering ----------
  const filtered = useMemo(() => {
    let result = [...campaigns];
    if (statusFilter !== 'ALL') result = result.filter((c) => c.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.campaign_name.toLowerCase().includes(q));
    }
    return result;
  }, [campaigns, statusFilter, searchQuery]);

  // ---------- Summary stats ----------
  const stats = useMemo(() => {
    const active = campaigns.filter((c) => c.status === 'ACTIVE');
    return {
      total: campaigns.length,
      active: active.length,
      spend: campaigns.reduce((s, c) => s + c.spend_30d, 0),
      avgRoas: campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length : 0,
    };
  }, [campaigns]);

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  if (connectionIds.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin conexion a Meta Ads</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">Conecta tu cuenta desde la pestana <strong>Conexiones</strong> para gestionar campanas.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Campanas</h2>
          <p className="text-muted-foreground text-sm">Jerarquia: Campana &gt; Ad Set &gt; Anuncio</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          {onCreate322 && (
            <Button size="sm" variant="secondary" onClick={onCreate322}>
              <Zap className="w-4 h-4 mr-2" />Testing 3:2:2
            </Button>
          )}
          {onCreateCampaign && (
            <Button size="sm" onClick={onCreateCampaign}>
              <Megaphone className="w-4 h-4 mr-2" />Nueva Campana
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Campanas</p>
            <p className="text-xl font-bold mt-0.5">{stats.total}</p>
            <p className="text-xs text-muted-foreground">{stats.active} activas</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/40 to-primary/10" />
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Gasto 30d</p>
            <p className="text-xl font-bold mt-0.5">{fmtCLP(stats.spend)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500/40 to-red-500/10" />
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">ROAS Promedio</p>
            <p className={`text-xl font-bold mt-0.5 ${stats.avgRoas >= 3 ? 'text-green-600' : stats.avgRoas >= 2 ? 'text-yellow-600' : 'text-red-500'}`}>{fmtRoas(stats.avgRoas)}</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500/40 to-green-500/10" />
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Conversiones</p>
            <p className="text-xl font-bold mt-0.5">{fmtNum(campaigns.reduce((s, c) => s + c.conversions, 0))}</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500/40 to-blue-500/10" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {(['ALL', 'ACTIVE', 'PAUSED'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f === 'ALL' ? 'Todas' : f === 'ACTIVE' ? 'Activas' : 'Pausadas'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar campana..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><Megaphone className="w-3 h-3 text-primary" />Campana</span>
        <span className="flex items-center gap-1"><FolderOpen className="w-3 h-3 text-orange-500" />Ad Set</span>
        <span className="flex items-center gap-1"><FileImage className="w-3 h-3 text-pink-500" />Anuncio</span>
        <span className="ml-auto">Haz click en una campana para expandir su jerarquia</span>
      </div>

      {/* Campaign tree */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-semibold mb-1">{campaigns.length === 0 ? 'Sin campanas' : 'Sin resultados'}</h3>
            <p className="text-muted-foreground text-sm">
              {campaigns.length === 0 ? 'Sincroniza tus datos o crea tu primera campana.' : 'Intenta con otro filtro o busqueda.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0">
          {filtered.map((campaign) => (
            <CampaignRow
              key={campaign.campaign_id}
              campaign={campaign}
              connectionIds={connectionIds}
              onToggleExpand={fetchAdSets}
            />
          ))}
        </div>
      )}
    </div>
  );
}
