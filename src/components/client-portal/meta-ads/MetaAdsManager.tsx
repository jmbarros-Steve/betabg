import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logoMeta from '@/assets/logo-meta-clean.png';
import {
  LayoutDashboard,
  Megaphone,
  PlusCircle,
  Users,
  FolderOpen,
  BarChart3,
  MessageSquare,
  Zap,
  Swords,
  DollarSign,
  TrendingUp,
  Target,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Lightbulb,
  Eye,
  ShoppingCart,
  ListTree,
  FlaskConical,
  Wand2,
  FileCheck,
  Crosshair,
  Loader2,
} from 'lucide-react';

// Existing components
import { MetaAdCreator } from '@/components/client-portal/MetaAdCreator';
import { AdCreativesLibrary } from '@/components/client-portal/AdCreativesLibrary';
import { CompetitorAdsPanel } from '@/components/client-portal/CompetitorAdsPanel';

// Sub-module components
import MetaCampaignManager from './MetaCampaignManager';
import MetaAudienceManager from './MetaAudienceManager';
import MetaAnalyticsDashboard from './MetaAnalyticsDashboard';
import MetaSocialInbox from './MetaSocialInbox';
import MetaAutomatedRules from './MetaAutomatedRules';

// New professional components
import CampaignTreeView from './CampaignTreeView';
import TestingWizard322 from './TestingWizard322';
import CampaignCreateWizard from './CampaignCreateWizard';
import DraftsManager from './DraftsManager';
import PixelSetupWizard from './PixelSetupWizard';
import { MetaScopeStatusPanel } from './MetaScopeAlert';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaAdsManagerProps {
  clientId: string;
}

type SectionKey =
  | 'dashboard'
  | 'tree-view'
  | 'create-wizard'
  | 'testing-322'
  | 'campaigns'
  | 'create-ad'
  | 'audiences'
  | 'library'
  | 'analytics'
  | 'social-inbox'
  | 'rules'
  | 'competitors'
  | 'drafts'
  | 'pixel';

interface NavItem {
  key: SectionKey;
  label: string;
  icon: React.ElementType;
}

interface CampaignMetricRow {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  metric_date: string;
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  conversions: number | null;
  conversion_value: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
}

interface Recommendation {
  id: string;
  campaign_id: string;
  recommendation_type: string;
  recommendation_text: string;
  priority: string | null;
  is_dismissed: boolean | null;
}

interface CampaignAggregate {
  campaign_id: string;
  campaign_name: string;
  total_spend: number;
  total_conversions: number;
  total_revenue: number;
  total_clicks: number;
  total_impressions: number;
  avg_roas: number;
  avg_ctr: number;
}

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'tree-view', label: 'Campanas', icon: ListTree },
  { key: 'create-wizard', label: 'Crear', icon: Wand2 },
  { key: 'drafts', label: 'Borradores', icon: FileCheck },
  { key: 'testing-322', label: 'Test 3:2:2', icon: FlaskConical },
  { key: 'audiences', label: 'Audiencias', icon: Users },
  { key: 'pixel', label: 'Pixel', icon: Crosshair },
  { key: 'library', label: 'Biblioteca', icon: FolderOpen },
  { key: 'analytics', label: 'Analisis', icon: BarChart3 },
  { key: 'social-inbox', label: 'Social Inbox', icon: MessageSquare },
  { key: 'rules', label: 'Reglas', icon: Zap },
  { key: 'competitors', label: 'Competencia', icon: Swords },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('es-CL').format(Math.round(value));

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

// ---------------------------------------------------------------------------
// Dashboard Section (fully functional)
// ---------------------------------------------------------------------------

function DashboardSection({ clientId }: { clientId: string }) {
  const [metrics, setMetrics] = useState<CampaignMetricRow[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get the active Meta connection with a selected ad account
      const { data: connections, error: connError } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .not('account_id', 'is', null)
        .limit(1);

      if (connError) throw connError;
      if (!connections || connections.length === 0) {
        setMetrics([]);
        setRecommendations([]);
        setConnectionIds([]);
        setLoading(false);
        return;
      }

      const connIds = connections.map((c) => c.id);
      setConnectionIds(connIds);

      // 2. Fetch last 30 days of campaign_metrics + recommendations in parallel
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const [metricsRes, recsRes] = await Promise.all([
        supabase
          .from('campaign_metrics')
          .select('*')
          .in('connection_id', connIds)
          .gte('metric_date', thirtyDaysAgo)
          .order('metric_date', { ascending: false }),
        supabase
          .from('campaign_recommendations')
          .select('*')
          .in('connection_id', connIds)
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (metricsRes.error) throw metricsRes.error;
      if (recsRes.error) throw recsRes.error;

      setMetrics((metricsRes.data as CampaignMetricRow[]) || []);
      setRecommendations((recsRes.data as Recommendation[]) || []);
    } catch (err) {
      console.error('[MetaAdsManager] Dashboard fetch error:', err);
      toast.error('Error cargando datos del dashboard');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchData();
    const handler = () => fetchData();
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [fetchData]);

  // Aggregated campaign data
  const aggregated = useMemo((): CampaignAggregate[] => {
    const map = new Map<string, CampaignAggregate>();
    for (const m of metrics) {
      const existing = map.get(m.campaign_id) || {
        campaign_id: m.campaign_id,
        campaign_name: m.campaign_name,
        total_spend: 0,
        total_conversions: 0,
        total_revenue: 0,
        total_clicks: 0,
        total_impressions: 0,
        avg_roas: 0,
        avg_ctr: 0,
      };
      existing.total_spend += Number(m.spend) || 0;
      existing.total_conversions += Number(m.conversions) || 0;
      existing.total_revenue += Number(m.conversion_value) || 0;
      existing.total_clicks += Number(m.clicks) || 0;
      existing.total_impressions += Number(m.impressions) || 0;
      map.set(m.campaign_id, existing);
    }
    for (const [, c] of map) {
      c.avg_roas = c.total_spend > 0 ? c.total_revenue / c.total_spend : 0;
      c.avg_ctr =
        c.total_impressions > 0
          ? (c.total_clicks / c.total_impressions) * 100
          : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total_spend - a.total_spend);
  }, [metrics]);

  // Totals
  const totals = useMemo(() => {
    return aggregated.reduce(
      (acc, c) => ({
        spend: acc.spend + c.total_spend,
        revenue: acc.revenue + c.total_revenue,
        conversions: acc.conversions + c.total_conversions,
        clicks: acc.clicks + c.total_clicks,
        impressions: acc.impressions + c.total_impressions,
      }),
      { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 },
    );
  }, [aggregated]);

  const overallRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const overallCpa =
    totals.conversions > 0 ? totals.spend / totals.conversions : 0;
  const overallCtr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  // Top 5 campaigns by spend
  const topCampaigns = aggregated.slice(0, 5);

  // Sync handler
  async function handleSync() {
    if (connectionIds.length === 0) return;
    setSyncing(true);
    try {
      for (const connId of connectionIds) {
        const { error } = await supabase.functions.invoke('sync-campaign-metrics', {
          body: { connection_id: connId, platform: 'meta' },
        });
        if (error) {
          console.error('Sync error:', error);
          toast.error('Error sincronizando Meta Ads');
        }
      }
      toast.success('Datos sincronizados');
      await fetchData();
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
    } catch {
      toast.error('Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  // Priority config for recommendation badges
  const priorityBadge = (priority: string | null) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive" className="text-xs">Critico</Badge>;
      case 'high':
        return <Badge className="bg-orange-500/15 text-orange-600 border-orange-500/30 text-xs">Alta</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">Media</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Baja</Badge>;
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-72 rounded-lg lg:col-span-2" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  // Empty state
  if (connectionIds.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">Sin conexion a Meta Ads</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Conecta tu cuenta de Meta Ads desde la pestana de <strong>Conexiones</strong> para comenzar
            a ver tus metricas y gestionar campanas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Meta Ads Dashboard</h2>
          <p className="text-muted-foreground text-sm">Ultimos 30 dias</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </div>

      {/* Scope status */}
      <MetaScopeStatusPanel clientId={clientId} />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Spend */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Gasto Total
              </span>
              <div className="p-1.5 rounded-md bg-red-500/10">
                <DollarSign className="w-4 h-4 text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totals.spend)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {aggregated.length} campana{aggregated.length !== 1 ? 's' : ''} activa{aggregated.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500/40 to-red-500/10" />
        </Card>

        {/* ROAS */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ROAS
              </span>
              <div className="p-1.5 rounded-md bg-green-500/10">
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
            </div>
            <p
              className={`text-2xl font-bold ${
                overallRoas >= 3
                  ? 'text-green-600'
                  : overallRoas >= 2
                    ? 'text-yellow-600'
                    : 'text-red-500'
              }`}
            >
              {overallRoas.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Revenue: {formatCurrency(totals.revenue)}
            </p>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500/40 to-green-500/10" />
        </Card>

        {/* CPA */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                CPA
              </span>
              <div className="p-1.5 rounded-md bg-blue-500/10">
                <Target className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <p className="text-2xl font-bold">
              {totals.conversions > 0 ? formatCurrency(overallCpa) : '--'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(totals.conversions)} conversion{totals.conversions !== 1 ? 'es' : ''}
            </p>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500/40 to-blue-500/10" />
        </Card>

        {/* CTR */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                CTR
              </span>
              <div className="p-1.5 rounded-md bg-purple-500/10">
                <MousePointerClick className="w-4 h-4 text-purple-500" />
              </div>
            </div>
            <p className="text-2xl font-bold">{formatPercent(overallCtr)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatNumber(totals.clicks)} clicks / {formatNumber(totals.impressions)} impresiones
            </p>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500/40 to-purple-500/10" />
        </Card>
      </div>

      {/* Bottom row: Top campaigns + AI Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top campaigns table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Campanas por Gasto</CardTitle>
            <CardDescription className="text-xs">
              Las 5 campanas con mayor inversion en los ultimos 30 dias
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topCampaigns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay campanas con datos. Sincroniza para cargar metricas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Campana
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Gasto
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        ROAS
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Conv.
                      </th>
                      <th className="text-right py-2 pl-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        CTR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.map((c) => (
                      <tr
                        key={c.campaign_id}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2.5 pr-4">
                          <span className="font-medium text-sm truncate block max-w-[260px]">
                            {c.campaign_name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {formatCurrency(c.total_spend)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span
                            className={`font-medium ${
                              c.avg_roas >= 3
                                ? 'text-green-600'
                                : c.avg_roas >= 2
                                  ? 'text-yellow-600'
                                  : 'text-red-500'
                            }`}
                          >
                            {c.avg_roas.toFixed(2)}x
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {formatNumber(c.total_conversions)}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {formatPercent(c.avg_ctr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Recommendations */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Recomendaciones IA</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Sugerencias basadas en el rendimiento de tus campanas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recommendations.length === 0 ? (
              <div className="text-center py-6">
                <Lightbulb className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground text-xs">
                  Sin recomendaciones pendientes.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Genera analisis desde la seccion de Analytics.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recommendations.slice(0, 5).map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/50"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {priorityBadge(rec.priority)}
                      </div>
                      <p className="text-xs text-foreground leading-relaxed line-clamp-3">
                        {rec.recommendation_text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Competitors — delegates to the real CompetitorAdsPanel (Meta Ad Library)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main MetaAdsManager component
// ---------------------------------------------------------------------------

interface MetaConnectionInfo {
  id: string;
  account_id: string | null;
  store_name: string | null;
}

interface AdAccountOption {
  account_id: string;
  name: string;
  currency: string;
  business_name: string;
}

export default function MetaAdsManager({ clientId }: MetaAdsManagerProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [visitedSections, setVisitedSections] = useState<Set<SectionKey>>(
    () => new Set(['dashboard']),
  );

  // --- Account context ---
  const [metaConnection, setMetaConnection] = useState<MetaConnectionInfo | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<AdAccountOption[]>([]);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountSwitching, setAccountSwitching] = useState(false);
  const [noConnection, setNoConnection] = useState(false);

  const fetchAccountContext = useCallback(async () => {
    setAccountLoading(true);
    try {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id, account_id, store_name')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!conn) {
        setNoConnection(true);
        setMetaConnection(null);
        setAccountLoading(false);
        return;
      }

      setNoConnection(false);
      setMetaConnection(conn);

      // Fetch available ad accounts from Meta API
      const { data } = await supabase.functions.invoke('fetch-meta-ad-accounts', {
        body: { connection_id: conn.id },
      });
      if (data?.accounts) {
        setAvailableAccounts(data.accounts);
      }
    } catch (err) {
      console.error('[MetaAdsManager] Account context error:', err);
    } finally {
      setAccountLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchAccountContext();
  }, [fetchAccountContext]);

  const handleAccountChange = useCallback(async (accountId: string) => {
    if (!metaConnection || accountId === metaConnection.account_id) return;
    setAccountSwitching(true);
    try {
      const account = availableAccounts.find((a) => a.account_id === accountId);
      const storeName = account?.name || accountId;

      // 1. Update connection in DB
      const { error: updateError } = await supabase
        .from('platform_connections')
        .update({ account_id: accountId, store_name: storeName })
        .eq('id', metaConnection.id);
      if (updateError) throw updateError;

      // 2. Update select value immediately so UI reflects the choice
      setMetaConnection((prev) =>
        prev ? { ...prev, account_id: accountId, store_name: storeName } : null,
      );

      console.log(`[MetaAdsManager] Switching to account: ${storeName} (${accountId})`);
      toast.loading('Sincronizando datos de la nueva cuenta...', { id: 'account-switch' });

      // 3. Purge old data + sync new data in parallel
      const [metricsRes, campaignsRes] = await Promise.allSettled([
        supabase.functions.invoke('sync-meta-metrics', {
          body: { connection_id: metaConnection.id, purge_stale: true },
        }),
        supabase.functions.invoke('sync-campaign-metrics', {
          body: { connection_id: metaConnection.id, platform: 'meta', purge_stale: true },
        }),
      ]);

      const ok =
        metricsRes.status === 'fulfilled' &&
        !metricsRes.value.error &&
        campaignsRes.status === 'fulfilled' &&
        !campaignsRes.value.error;

      if (ok) {
        toast.success(`Cuenta cambiada: ${storeName}`, { id: 'account-switch' });
      } else {
        toast.warning('Cuenta cambiada, sincronizacion parcial', { id: 'account-switch' });
      }

      // 4. Reset navigation — force all sections to unmount & remount fresh
      setActiveSection('dashboard');
      setVisitedSections(new Set(['dashboard']));

      // 5. Tell any external listeners to refresh
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
    } catch (err) {
      console.error('[MetaAdsManager] Account switch error:', err);
      toast.error('Error al cambiar cuenta', { id: 'account-switch' });
    } finally {
      setAccountSwitching(false);
    }
  }, [metaConnection, availableAccounts]);

  // Track which sections have been visited for lazy mounting
  const markVisited = useCallback(
    (key: SectionKey) => {
      setVisitedSections((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [],
  );

  const handleNavClick = useCallback(
    (key: SectionKey) => {
      setActiveSection(key);
      markVisited(key);
    },
    [markVisited],
  );

  // Responsive: collapse sidebar on small screens by default
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setSidebarCollapsed(e.matches);
    };
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Render a section only once it has been visited; keep it alive afterwards.
  const renderSection = (key: SectionKey) => {
    if (!visitedSections.has(key)) return null;

    const isActive = activeSection === key;

    return (
      <div
        key={key}
        className={isActive ? 'block' : 'hidden'}
        role="tabpanel"
        aria-hidden={!isActive}
      >
        {key === 'dashboard' && <DashboardSection clientId={clientId} />}
        {key === 'tree-view' && (
          <CampaignTreeView
            clientId={clientId}
            onCreateCampaign={() => handleNavClick('create-wizard')}
            onCreate322={() => handleNavClick('testing-322')}
          />
        )}
        {key === 'create-wizard' && (
          <CampaignCreateWizard
            clientId={clientId}
            onBack={() => handleNavClick('tree-view')}
            onComplete={() => handleNavClick('tree-view')}
          />
        )}
        {key === 'testing-322' && (
          <TestingWizard322
            clientId={clientId}
            onBack={() => handleNavClick('tree-view')}
            onComplete={() => handleNavClick('tree-view')}
          />
        )}
        {key === 'campaigns' && <MetaCampaignManager clientId={clientId} />}
        {key === 'create-ad' && (
          <MetaAdCreator
            clientId={clientId}
            onBack={() => handleNavClick('dashboard')}
            onGoToLibrary={() => handleNavClick('library')}
          />
        )}
        {key === 'audiences' && <MetaAudienceManager clientId={clientId} />}
        {key === 'library' && <AdCreativesLibrary clientId={clientId} />}
        {key === 'analytics' && <MetaAnalyticsDashboard clientId={clientId} />}
        {key === 'social-inbox' && <MetaSocialInbox clientId={clientId} />}
        {key === 'rules' && <MetaAutomatedRules clientId={clientId} />}
        {key === 'drafts' && <DraftsManager clientId={clientId} onEditDraft={(id) => { console.log('Edit draft:', id); handleNavClick('create-wizard'); }} />}
        {key === 'pixel' && <PixelSetupWizard clientId={clientId} />}
        {key === 'competitors' && <CompetitorAdsPanel clientId={clientId} />}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-[600px]">
      {/* ----------------------------------------------------------------- */}
      {/* Sidebar */}
      {/* ----------------------------------------------------------------- */}
      <aside
        className={`
          flex flex-col shrink-0 border-r border-border
          bg-muted/30 transition-all duration-200 ease-in-out
          ${sidebarCollapsed ? 'w-[56px]' : 'w-[200px]'}
        `}
      >
        {/* Collapse toggle */}
        <div className="flex items-center justify-end p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2 pb-4" role="tablist">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.key;
            const Icon = item.icon;

            return (
              <button
                key={item.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleNavClick(item.key)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`
                  group flex items-center gap-2.5 rounded-md px-2.5 py-2
                  text-sm font-medium transition-colors duration-150
                  outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }
                  ${sidebarCollapsed ? 'justify-center' : ''}
                `}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom branding */}
        {!sidebarCollapsed && (
          <div className="px-3 pb-3">
            <div className="text-[10px] text-muted-foreground/50 text-center">
              Meta Ads Manager
            </div>
          </div>
        )}
      </aside>

      {/* ----------------------------------------------------------------- */}
      {/* Main content area */}
      {/* ----------------------------------------------------------------- */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        {/* Account Context Bar */}
        {accountLoading ? (
          <div className="mb-4">
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : noConnection ? (
          <Card className="mb-4 border-dashed">
            <CardContent className="py-10 text-center">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin conexion a Meta Ads</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Conecta tu cuenta de Meta Ads desde la pestana de <strong>Conexiones</strong>.
              </p>
            </CardContent>
          </Card>
        ) : !metaConnection?.account_id ? (
          <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-700">
                    Selecciona una cuenta publicitaria
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Debes elegir una cuenta publicitaria de Meta para ver metricas, campanas y anuncios.
                  </p>
                  {availableAccounts.length > 0 && (
                    <Select onValueChange={handleAccountChange} disabled={accountSwitching}>
                      <SelectTrigger className="w-full max-w-md bg-background">
                        <SelectValue placeholder="Selecciona una cuenta publicitaria..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50 max-h-80">
                        {availableAccounts.map((acc) => (
                          <SelectItem key={acc.account_id} value={acc.account_id}>
                            <span className="font-medium">{acc.name}</span>
                            <span className="text-muted-foreground ml-2 text-xs">
                              ({acc.account_id}) - {acc.currency}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mb-4 p-3 rounded-lg border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={logoMeta} alt="Meta" className="h-8 w-8 object-contain" />
              <div>
                <p className="text-sm font-semibold">
                  {metaConnection.store_name || 'Cuenta Meta'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {metaConnection.account_id}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {accountSwitching && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
              <Select
                value={metaConnection.account_id}
                onValueChange={handleAccountChange}
                disabled={accountSwitching}
              >
                <SelectTrigger className="w-[280px] bg-background text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50 max-h-80">
                  {availableAccounts.map((acc) => (
                    <SelectItem key={acc.account_id} value={acc.account_id}>
                      <span className="font-medium">{acc.name}</span>
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({acc.account_id})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Only show sections if we have a connection with an account selected */}
        {accountSwitching ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cambiando cuenta publicitaria...</p>
          </div>
        ) : metaConnection?.account_id ? (
          <div key={`account-${metaConnection.account_id}`}>
            {NAV_ITEMS.map((item) => renderSection(item.key))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
