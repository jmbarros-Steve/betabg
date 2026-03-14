import { useState, useEffect, useMemo } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick,
  ShoppingCart, Target, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronRight, Sparkles, RefreshCw,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaAnalyticsDashboardProps {
  clientId: string;
}

type DateRangeKey = 'today' | '7d' | '14d' | '30d' | '60d' | '90d' | 'custom';

interface CampaignMetricRow {
  id: string;
  connection_id: string;
  platform: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status?: string;
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

interface CampaignAggregate {
  campaign_id: string;
  campaign_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  dailyBreakdown: DailyRow[];
}

interface DailyRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
}

type SortField = keyof Omit<CampaignAggregate, 'campaign_id' | 'campaign_name' | 'status' | 'dailyBreakdown'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string; days: number }[] = [
  { key: 'today', label: 'Hoy', days: 1 },
  { key: '7d', label: '7 días', days: 7 },
  { key: '14d', label: '14 días', days: 14 },
  { key: '30d', label: '30 días', days: 30 },
  { key: '60d', label: '60 días', days: 60 },
  { key: '90d', label: '90 días', days: 90 },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const formatCLP = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('es-CL').format(Math.round(value));

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;

const formatRoas = (value: number): string => `${value.toFixed(2)}x`;

const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

const roasColor = (roas: number): string => {
  if (roas >= 3) return 'text-green-500';
  if (roas >= 2) return 'text-yellow-500';
  return 'text-red-500';
};

const roasBadgeVariant = (roas: number): string => {
  if (roas >= 3) return 'bg-green-500/15 text-green-600 border-green-500/30';
  if (roas >= 2) return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
  return 'bg-red-500/15 text-red-600 border-red-500/30';
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChangeIndicator({ value, invertColors = false }: { value: number | null; invertColors?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sin datos previos</span>;
  const isPositive = value >= 0;
  const isGood = invertColors ? !isPositive : isPositive;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${isGood ? 'text-green-600' : 'text-red-500'}`}>
      {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
      {Math.abs(value).toFixed(1)}% vs periodo anterior
    </span>
  );
}

function KpiCard({
  title,
  value,
  change,
  icon: Icon,
  prefix,
  accent = 'blue',
  invertColors = false,
}: {
  title: React.ReactNode;
  value: string;
  change: number | null;
  icon: React.ElementType;
  prefix?: string;
  accent?: string;
  invertColors?: boolean;
}) {
  const accentMap: Record<string, string> = {
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
    green: 'from-green-500/10 to-green-500/5 border-green-500/20',
    purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    red: 'text-red-500 bg-red-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    cyan: 'text-cyan-500 bg-cyan-500/10',
  };
  return (
    <Card className={`relative overflow-hidden border bg-gradient-to-br ${accentMap[accent] || accentMap.blue}`}>
      <CardContent className="pt-5 pb-5 px-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground leading-tight">{title}</span>
          <div className={`p-2 rounded-lg ${iconColorMap[accent] || iconColorMap.blue}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight leading-none mb-2">
          {prefix}{value}
        </p>
        <ChangeIndicator value={change} invertColors={invertColors} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MetaAnalyticsDashboard({ clientId }: MetaAnalyticsDashboardProps) {
  const { connectionId: ctxConnectionId, lastSyncAt } = useMetaBusiness();

  // State
  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [metrics, setMetrics] = useState<CampaignMetricRow[]>([]);
  const [prevMetrics, setPrevMetrics] = useState<CampaignMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Resolve date boundaries
  const { from, to, prevFrom, prevTo, days } = useMemo(() => {
    const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
    const numDays = opt?.days ?? 30;
    const today = new Date().toISOString().split('T')[0];

    if (dateRange === 'custom' && customFrom && customTo) {
      const diffMs = new Date(customTo).getTime() - new Date(customFrom).getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const prevEnd = new Date(new Date(customFrom).getTime() - 86400000);
      const prevStart = new Date(prevEnd.getTime() - diffDays * 86400000);
      return {
        from: customFrom,
        to: customTo,
        prevFrom: prevStart.toISOString().split('T')[0],
        prevTo: prevEnd.toISOString().split('T')[0],
        days: diffDays,
      };
    }

    return {
      from: daysAgo(numDays),
      to: today,
      prevFrom: daysAgo(numDays * 2),
      prevTo: daysAgo(numDays),
      days: numDays,
    };
  }, [dateRange, customFrom, customTo]);

  // ------ Data Fetching ------

  useEffect(() => {
    fetchData();
  }, [clientId, from, to, prevFrom, prevTo, lastSyncAt]);

  // Refresh when account changes (bg:sync-complete)
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [clientId, from, to, prevFrom, prevTo, lastSyncAt]);

  async function fetchData() {
    setLoading(true);
    try {
      // Use connectionId from MetaBusinessContext
      if (!ctxConnectionId) {
        setMetrics([]);
        setPrevMetrics([]);
        setLoading(false);
        return;
      }
      const connectionIds = [ctxConnectionId];

      // 2. Current period
      const { data: currentData, error: currentError } = await supabase
        .from('campaign_metrics')
        .select('*')
        .in('connection_id', connectionIds)
        .eq('platform', 'meta')
        .gte('metric_date', from)
        .lte('metric_date', to)
        .order('metric_date', { ascending: true });

      if (currentError) throw currentError;

      // 3. Previous period (for comparison)
      const { data: prevData, error: prevError } = await supabase
        .from('campaign_metrics')
        .select('*')
        .in('connection_id', connectionIds)
        .eq('platform', 'meta')
        .gte('metric_date', prevFrom)
        .lt('metric_date', from)
        .order('metric_date', { ascending: true });

      if (prevError) throw prevError;

      setMetrics((currentData as CampaignMetricRow[]) || []);
      setPrevMetrics((prevData as CampaignMetricRow[]) || []);
    } catch (err) {
      // Analytics fetch error handled via toast
      toast.error('Error al cargar datos de analytics');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      // Use connectionId from MetaBusinessContext
      if (!ctxConnectionId) return;
      await callApi('sync-campaign-metrics', {
        body: { connection_id: ctxConnectionId, platform: 'meta' },
      });

      toast.success('Datos sincronizados correctamente');
      await fetchData();
    } catch {
      toast.error('Error al sincronizar');
    } finally {
      setRefreshing(false);
    }
  }

  // ------ Aggregations ------

  const sumField = (rows: CampaignMetricRow[], field: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversion_value') =>
    rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

  // Current period totals
  const totals = useMemo(() => {
    const spend = sumField(metrics, 'spend');
    const impressions = sumField(metrics, 'impressions');
    const clicks = sumField(metrics, 'clicks');
    const conversions = sumField(metrics, 'conversions');
    const revenue = sumField(metrics, 'conversion_value');
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, conversions, revenue, roas };
  }, [metrics]);

  // Previous period totals
  const prevTotals = useMemo(() => {
    const spend = sumField(prevMetrics, 'spend');
    const impressions = sumField(prevMetrics, 'impressions');
    const clicks = sumField(prevMetrics, 'clicks');
    const conversions = sumField(prevMetrics, 'conversions');
    const revenue = sumField(prevMetrics, 'conversion_value');
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, conversions, revenue, roas };
  }, [prevMetrics]);

  // Daily chart data
  const dailyChartData = useMemo(() => {
    const map = new Map<string, { date: string; spend: number; revenue: number }>();
    for (const m of metrics) {
      const existing = map.get(m.metric_date) || { date: m.metric_date, spend: 0, revenue: 0 };
      existing.spend += Number(m.spend) || 0;
      existing.revenue += Number(m.conversion_value) || 0;
      map.set(m.metric_date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  // Campaign aggregates
  const campaigns = useMemo((): CampaignAggregate[] => {
    const map = new Map<string, { rows: CampaignMetricRow[]; name: string }>();
    for (const m of metrics) {
      const entry = map.get(m.campaign_id) || { rows: [], name: m.campaign_name };
      entry.rows.push(m);
      map.set(m.campaign_id, entry);
    }

    const result: CampaignAggregate[] = [];
    for (const [id, { rows, name }] of map) {
      const spend = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      const impressions = rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
      const clicks = rows.reduce((s, r) => s + (Number(r.clicks) || 0), 0);
      const conversions = rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0);
      const revenue = rows.reduce((s, r) => s + (Number(r.conversion_value) || 0), 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = conversions > 0 ? spend / conversions : 0;

      // Build daily breakdown
      const dailyMap = new Map<string, DailyRow>();
      for (const r of rows) {
        const d = dailyMap.get(r.metric_date) || {
          date: r.metric_date, spend: 0, impressions: 0, clicks: 0,
          conversions: 0, revenue: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0,
        };
        d.spend += Number(r.spend) || 0;
        d.impressions += Number(r.impressions) || 0;
        d.clicks += Number(r.clicks) || 0;
        d.conversions += Number(r.conversions) || 0;
        d.revenue += Number(r.conversion_value) || 0;
        dailyMap.set(r.metric_date, d);
      }
      // Recompute derived fields per day
      const dailyBreakdown = Array.from(dailyMap.values())
        .map((d) => ({
          ...d,
          ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
          cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
          cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
          roas: d.spend > 0 ? d.revenue / d.spend : 0,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      // Use real campaign status from Meta API (most recent row has latest status)
      const sortedByDate = [...rows].sort((a, b) => b.metric_date.localeCompare(a.metric_date));
      const realStatus = sortedByDate[0]?.campaign_status || '';
      const status = realStatus.toUpperCase() === 'ACTIVE' ? 'ACTIVE'
        : realStatus.toUpperCase() === 'PAUSED' ? 'PAUSED'
        : realStatus.toUpperCase() === 'ARCHIVED' ? 'ARCHIVED'
        : 'ACTIVE'; // fallback for old rows without campaign_status

      result.push({
        campaign_id: id, campaign_name: name, status,
        spend, impressions, clicks, ctr, cpc, cpm,
        conversions, revenue, roas, cpa, dailyBreakdown,
      });
    }
    return result;
  }, [metrics]);

  // Sorted campaigns
  const sortedCampaigns = useMemo(() => {
    const sorted = [...campaigns].sort((a, b) => {
      const av = a[sortField] as number;
      const bv = b[sortField] as number;
      return sortAsc ? av - bv : bv - av;
    });
    return sorted;
  }, [campaigns, sortField, sortAsc]);

  // Funnel data
  const funnelData = useMemo(() => {
    const impressions = totals.impressions;
    const clicks = totals.clicks;
    // Estimate landing page views as ~85% of clicks (common Meta benchmark)
    const landingPageViews = Math.round(clicks * 0.85);
    // Estimate add-to-cart as ~30% of landing page views
    const addToCart = Math.round(landingPageViews * 0.30);
    const purchases = totals.conversions;

    const steps = [
      { name: 'Impresiones', value: impressions },
      { name: 'Clics', value: clicks },
      { name: 'Vistas LP', value: landingPageViews },
      { name: 'Agregar al Carro', value: addToCart },
      { name: 'Compras', value: purchases },
    ];

    const maxVal = Math.max(...steps.map((s) => s.value), 1);
    return steps.map((step, i) => {
      const prev = i > 0 ? steps[i - 1].value : step.value;
      const convRate = prev > 0 ? ((step.value / prev) * 100).toFixed(1) : '0.0';
      return {
        ...step,
        pct: (step.value / maxVal) * 100,
        convRate: i === 0 ? null : `${convRate}%`,
      };
    });
  }, [totals]);

  // AI Optimization Insights
  const insights = useMemo(() => {
    if (campaigns.length === 0) return null;

    // Best performing campaign
    const bestCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0];

    // Worst performing ACTIVE campaign (don't recommend pausing already-paused campaigns)
    const worstCampaign = [...campaigns]
      .filter((c) => c.spend > 0 && c.status === 'ACTIVE')
      .sort((a, b) => a.roas - b.roas)[0];

    // Budget recommendation — only consider active campaigns
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
    const highRoasCampaigns = activeCampaigns.filter((c) => c.roas >= 3 && c.spend > 0);
    const lowRoasCampaigns = activeCampaigns.filter((c) => c.roas < 2 && c.roas > 0 && c.spend > 0);
    let budgetRec: string | null = null;
    if (highRoasCampaigns.length > 0 && lowRoasCampaigns.length > 0) {
      const shiftAmount = lowRoasCampaigns.reduce((s, c) => s + c.spend * 0.3, 0);
      budgetRec = `Redirigir ${formatCLP(shiftAmount)} desde ${lowRoasCampaigns.length} campaña(s) de bajo ROAS hacia "${highRoasCampaigns[0].campaign_name}" (ROAS ${formatRoas(highRoasCampaigns[0].roas)})`;
    }

    // Creative fatigue detection
    let creativeFatigue: string | null = null;
    for (const c of campaigns) {
      if (c.dailyBreakdown.length >= 7) {
        const sorted = [...c.dailyBreakdown].sort((a, b) => a.date.localeCompare(b.date));
        const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
        const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
        const avgCtrFirst = firstHalf.reduce((s, d) => s + d.ctr, 0) / firstHalf.length;
        const avgCtrSecond = secondHalf.reduce((s, d) => s + d.ctr, 0) / secondHalf.length;
        if (avgCtrFirst > 0 && avgCtrSecond < avgCtrFirst * 0.8) {
          creativeFatigue = `"${c.campaign_name}" muestra una caída de CTR del ${((1 - avgCtrSecond / avgCtrFirst) * 100).toFixed(0)}% en la segunda mitad del periodo. Considerar rotar creativos.`;
          break;
        }
      }
    }

    return { bestCampaign, worstCampaign, budgetRec, creativeFatigue };
  }, [campaigns]);

  // ------ Interaction Handlers ------

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  function toggleExpand(campaignId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  }

  const SortHeader = ({ field, label, className }: { field: SortField; label: React.ReactNode; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap ${className || ''}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-[10px]">{sortAsc ? '\u25B2' : '\u25BC'}</span>
        )}
      </span>
    </th>
  );

  // ------ Render ------

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Date Range Selector + Refresh                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            {DATE_RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                variant={dateRange === opt.key ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-7 px-3"
                onClick={() => setDateRange(opt.key)}
              >
                {opt.label}
              </Button>
            ))}
            <Button
              variant={dateRange === 'custom' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setDateRange('custom')}
            >
              Personalizado
            </Button>
          </div>
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-7 px-2 text-xs border rounded bg-background"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-7 px-2 text-xs border rounded bg-background"
              />
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Overview KPI Row                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Gasto Total"
          value={formatCLP(totals.spend)}
          change={pctChange(totals.spend, prevTotals.spend)}
          icon={DollarSign}
          accent="red"
          invertColors
        />
        <KpiCard
          title="Impresiones"
          value={formatNumber(totals.impressions)}
          change={pctChange(totals.impressions, prevTotals.impressions)}
          icon={Eye}
          accent="blue"
        />
        <KpiCard
          title="Clicks"
          value={formatNumber(totals.clicks)}
          change={pctChange(totals.clicks, prevTotals.clicks)}
          icon={MousePointerClick}
          accent="purple"
        />
        <KpiCard
          title={<JargonTooltip term="CTR" />}
          value={formatPercent(totals.ctr)}
          change={pctChange(totals.ctr, prevTotals.ctr)}
          icon={Target}
          accent="amber"
        />
        <KpiCard
          title="Ventas"
          value={formatNumber(totals.conversions)}
          change={pctChange(totals.conversions, prevTotals.conversions)}
          icon={ShoppingCart}
          accent="green"
        />
        <KpiCard
          title="Ingresos"
          value={formatCLP(totals.revenue)}
          change={pctChange(totals.revenue, prevTotals.revenue)}
          icon={DollarSign}
          accent="cyan"
        />
        <KpiCard
          title={<JargonTooltip term="ROAS" />}
          value={formatRoas(totals.roas)}
          change={pctChange(totals.roas, prevTotals.roas)}
          icon={TrendingUp}
          accent="green"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Spend & Revenue Chart                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gasto vs Ingresos Diario</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyChartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Sin datos para el periodo seleccionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v + 'T12:00:00');
                    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => formatCLP(v)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCLP(value),
                    name === 'revenue' ? 'Ingresos' : 'Gasto',
                  ]}
                  labelFormatter={(label: string) => {
                    const d = new Date(label + 'T12:00:00');
                    return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  formatter={(value: string) => (value === 'revenue' ? 'Ingresos' : 'Gasto')}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#22C55E"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="revenue"
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="spend"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Campaign Performance Table                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Rendimiento por Campaña ({sortedCampaigns.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sortedCampaigns.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Sin campañas en el periodo seleccionado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b-2 border-border bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[200px]">
                      Campaña
                    </th>
                    <SortHeader field="spend" label="Gasto" />
                    <SortHeader field="conversions" label="Ventas" />
                    <SortHeader field="revenue" label="Ingresos" />
                    <SortHeader field="roas" label={<JargonTooltip term="ROAS" />} />
                    <SortHeader field="ctr" label={<JargonTooltip term="CTR" />} />
                    <SortHeader field="cpa" label={<JargonTooltip term="CPA" />} />
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c) => {
                    const isExpanded = expandedRows.has(c.campaign_id);
                    return (
                      <CampaignRow
                        key={c.campaign_id}
                        campaign={c}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(c.campaign_id)}
                      />
                    );
                  })}
                </tbody>
                {/* Table footer with totals */}
                <tfoot className="border-t-2 border-border bg-muted/40">
                  <tr className="font-semibold text-sm">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3">Total ({sortedCampaigns.length})</td>
                    <td className="px-4 py-3 text-right">{formatCLP(totals.spend)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(totals.conversions)}</td>
                    <td className="px-4 py-3 text-right">{formatCLP(totals.revenue)}</td>
                    <td className={`px-4 py-3 text-right ${roasColor(totals.roas)}`}>{formatRoas(totals.roas)}</td>
                    <td className="px-4 py-3 text-right">{formatPercent(totals.ctr)}</td>
                    <td className="px-4 py-3 text-right">
                      {totals.conversions > 0 ? formatCLP(totals.spend / totals.conversions) : '--'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Funnel Visualization                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Embudo de Conversión</CardTitle>
        </CardHeader>
        <CardContent>
          {totals.impressions === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Sin datos de embudo para el periodo seleccionado
            </div>
          ) : (
            <div className="space-y-3">
              {funnelData.map((step, i) => (
                <div key={step.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium w-28">{step.name}</span>
                      {step.convRate && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          {step.convRate}
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-xs tabular-nums">
                      {formatNumber(step.value)}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(step.pct, 1)}%`,
                        background: `linear-gradient(90deg, hsl(${220 - i * 30}, 80%, 55%), hsl(${220 - i * 30}, 70%, 45%))`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 6. AI Optimization Insights                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Insights de Optimización
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!insights || campaigns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay suficientes datos para generar insights. Sincroniza tus campañas primero.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Best performing */}
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-medium text-green-600">
                    Mejor campaña
                  </span>
                </div>
                <p className="text-sm font-medium">{insights.bestCampaign.campaign_name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ROAS: <span className="text-green-500 font-semibold">{formatRoas(insights.bestCampaign.roas)}</span>
                  {' | '}Ingresos: {formatCLP(insights.bestCampaign.revenue)}
                  {' | '}Gasto: {formatCLP(insights.bestCampaign.spend)}
                </p>
              </div>

              {/* Worst performing — only show for active campaigns */}
              {insights.worstCampaign && insights.worstCampaign.campaign_id !== insights.bestCampaign.campaign_id && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-600">
                      Campaña a optimizar
                    </span>
                  </div>
                  <p className="text-sm font-medium">{insights.worstCampaign.campaign_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ROAS: <span className="text-red-500 font-semibold">{formatRoas(insights.worstCampaign.roas)}</span>
                    {' | '}Gasto: {formatCLP(insights.worstCampaign.spend)}
                    {insights.worstCampaign.conversions > 0 && <>{' | '}CPA: {formatCLP(insights.worstCampaign.cpa)}</>}
                  </p>
                  <p className="text-xs mt-2 text-red-600/80">
                    {insights.worstCampaign.roas < 1
                      ? `Esta campaña gasta más de lo que genera (ROAS ${formatRoas(insights.worstCampaign.roas)}). Considera pausarla y reasignar presupuesto a "${insights.bestCampaign.campaign_name}".`
                      : insights.worstCampaign.roas < 2
                        ? `ROAS bajo (${formatRoas(insights.worstCampaign.roas)}). Prueba nuevos creativos o audiencias antes de aumentar inversión.`
                        : `Es la de menor rendimiento activa. Revisa a quién le muestras los anuncios y prueba nuevas imágenes/videos.`
                    }
                  </p>
                </div>
              )}

              {/* Budget recommendation */}
              {insights.budgetRec && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-blue-600">
                      Recomendación de presupuesto
                    </span>
                  </div>
                  <p className="text-sm">{insights.budgetRec}</p>
                </div>
              )}

              {/* Creative fatigue */}
              {insights.creativeFatigue && (
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-600">
                      Fatiga creativa detectada
                    </span>
                  </div>
                  <p className="text-sm">{insights.creativeFatigue}</p>
                </div>
              )}

              {/* If no budget rec or fatigue, show a positive message */}
              {!insights.budgetRec && !insights.creativeFatigue && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-primary">
                      Estado general
                    </span>
                  </div>
                  <p className="text-sm">
                    Las campañas se ven estables. Sin alertas de fatiga creativa ni desbalances
                    de presupuesto detectados en este periodo.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign Table Row (extracted for readability)
// ---------------------------------------------------------------------------

function CampaignRow({
  campaign: c,
  isExpanded,
  onToggle,
}: {
  campaign: CampaignAggregate;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          {c.dailyBreakdown.length > 0 && (
            isExpanded
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-3 font-medium max-w-[240px] truncate" title={c.campaign_name}>
          {c.campaign_name}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{formatCLP(c.spend)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(c.conversions)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{formatCLP(c.revenue)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          <Badge variant="outline" className={`text-xs ${roasBadgeVariant(c.roas)}`}>
            {formatRoas(c.roas)}
          </Badge>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{formatPercent(c.ctr)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {c.conversions > 0 ? formatCLP(c.cpa) : '--'}
        </td>
      </tr>

      {/* Expanded daily breakdown */}
      {isExpanded && c.dailyBreakdown.length > 0 && (
        <tr>
          <td colSpan={8} className="p-0">
            <div className="bg-muted/20 border-b">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="px-4 py-1.5 text-left pl-12">Fecha</th>
                    <th className="px-4 py-1.5 text-right">Gasto</th>
                    <th className="px-4 py-1.5 text-right">Ventas</th>
                    <th className="px-4 py-1.5 text-right">Ingresos</th>
                    <th className="px-4 py-1.5 text-right"><JargonTooltip term="ROAS" /></th>
                    <th className="px-4 py-1.5 text-right"><JargonTooltip term="CTR" /></th>
                    <th className="px-4 py-1.5 text-right"><JargonTooltip term="CPA" /></th>
                  </tr>
                </thead>
                <tbody>
                  {c.dailyBreakdown.map((d) => (
                    <tr key={d.date} className="border-t border-border/30 hover:bg-muted/30">
                      <td className="px-4 py-1.5 pl-12 tabular-nums">
                        {new Date(d.date + 'T12:00:00').toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{formatCLP(d.spend)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{formatNumber(d.conversions)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{formatCLP(d.revenue)}</td>
                      <td className={`px-4 py-1.5 text-right tabular-nums font-medium ${roasColor(d.roas)}`}>
                        {formatRoas(d.roas)}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{formatPercent(d.ctr)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">
                        {d.conversions > 0 ? formatCLP(d.spend / d.conversions) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
