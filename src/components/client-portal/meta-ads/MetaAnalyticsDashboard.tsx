import { useState, useEffect, useMemo } from 'react';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick,
  ShoppingCart, Target, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronRight, Sparkles, RefreshCw,
  FileDown, CalendarClock, Loader2, Settings2, AlertTriangle,
  Users,
} from 'lucide-react';
import { useMetaBusiness } from './MetaBusinessContext';
import { getTargetStatus, getTargetBgColor, getProgressPercent } from '@/lib/metric-utils';
import MetaHealthBanner from './MetaHealthBanner';

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
  reach: number | null;
  frequency: number | null;
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
    blue: 'from-[#2A4F9E]/10 to-[#2A4F9E]/5 border-[#2A4F9E]/20',
    green: 'from-green-500/10 to-green-500/5 border-green-500/20',
    purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
    red: 'from-red-500/10 to-red-500/5 border-red-500/20',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
  };
  const iconColorMap: Record<string, string> = {
    blue: 'text-[#2A4F9E] bg-[#1E3A7B]/10',
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
  // Tier 1 multi-account: toggle "ver todas las cuentas Meta del cliente"
  // junta métricas de OAuth + Leadsie + cualquier conexión Meta activa,
  // útil para clientes con BM Partner + cuenta personal o múltiples ad
  // accounts. Default off → mantiene comportamiento previo (cuenta única).
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [allMetaConnectionIds, setAllMetaConnectionIds] = useState<string[]>([]);
  // Tier 2B Breakdowns on-demand: el cliente elige un tipo de desglose
  // (edad, género, país, dispositivo, placement, hora) y pegamos a Meta
  // /insights con `breakdowns=X`. Lazy load — solo si abre la sección.
  type BreakdownType = 'age,gender' | 'age' | 'gender' | 'country' | 'device_platform' | 'publisher_platform' | 'platform_position' | 'hourly_stats_aggregated_by_advertiser_time_zone';
  type BreakdownRow = { label: string; impressions: number; reach: number; clicks: number; spend: number; conversions: number; conversion_value: number };
  const [breakdownType, setBreakdownType] = useState<BreakdownType>('age,gender');
  const [breakdownRows, setBreakdownRows] = useState<BreakdownRow[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownLoaded, setBreakdownLoaded] = useState(false);
  // Tier 3 paginación campañas — 50 rows por página, default 1.
  const [campaignPage, setCampaignPage] = useState(1);
  const CAMPAIGNS_PER_PAGE = 50;

  // Reset paginación al cambiar el sort, rango o cuentas (sino podría quedar
  // en una página vacía cuando bajan los datos disponibles).
  useEffect(() => {
    setCampaignPage(1);
  }, [sortField, sortAsc, from, to, showAllAccounts]);

  // Resolve date boundaries
  const { from, to, prevFrom, prevTo, days } = useMemo(() => {
    const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
    const numDays = opt?.days ?? 30;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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

  // Cargar TODAS las conexiones Meta activas del cliente una vez al montar.
  // Permite agregar métricas de varias cuentas cuando showAllAccounts=true.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'meta')
        .eq('is_active', true);
      if (cancelled) return;
      const ids = (data || []).map((c: any) => c.id).filter(Boolean);
      setAllMetaConnectionIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    fetchData();
  }, [clientId, from, to, prevFrom, prevTo, lastSyncAt, showAllAccounts]);

  // Refresh when account changes (bg:sync-complete)
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [clientId, from, to, prevFrom, prevTo, lastSyncAt]);

  async function fetchData() {
    setLoading(true);
    try {
      // Determine which Meta connections to fetch metrics for:
      // - Default (showAllAccounts=false): solo la cuenta seleccionada en
      //   MetaBusinessContext (la que el cliente está viendo en sidebar).
      // - Toggle on (showAllAccounts=true): TODAS las conexiones Meta activas
      //   del cliente — agregamos métricas de OAuth + Leadsie + cualquier BM
      //   Partner. Útil para clientes con varios ad accounts.
      const connectionIds = showAllAccounts && allMetaConnectionIds.length > 0
        ? allMetaConnectionIds
        : ctxConnectionId ? [ctxConnectionId] : [];

      if (connectionIds.length === 0) {
        setMetrics([]);
        setPrevMetrics([]);
        setLoading(false);
        return;
      }

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

  // Fetch breakdowns on-demand. No persiste en DB — pega directo a Meta.
  // Re-fetch cada vez que cambia el rango de fechas o el tipo de breakdown.
  async function fetchBreakdowns() {
    if (!ctxConnectionId) return;
    setBreakdownLoading(true);
    try {
      const { data, error } = await callApi('get-meta-breakdowns', {
        body: {
          connection_id: ctxConnectionId,
          breakdown: breakdownType,
          date_from: from,
          date_to: to,
        },
        timeoutMs: 60_000,
      });
      if (error) {
        const msg = typeof error === 'string' ? error : (error as any)?.message || 'Error desconocido';
        toast.error(`Error al cargar desglose: ${msg}`);
        setBreakdownRows([]);
        return;
      }
      const rows = (data?.rows || []) as BreakdownRow[];
      setBreakdownRows(rows);
      setBreakdownLoaded(true);
    } catch (err: any) {
      toast.error(`Error al cargar desglose: ${err?.message || 'desconocido'}`);
      setBreakdownRows([]);
    } finally {
      setBreakdownLoading(false);
    }
  }

  // Re-fetch breakdowns automáticamente cuando cambia el tipo (si ya cargó
  // una vez) o el rango. Si todavía no abrió la sección, no hacemos nada.
  useEffect(() => {
    if (!breakdownLoaded) return;
    fetchBreakdowns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownType, from, to, ctxConnectionId]);

  // ------ Aggregations ------

  const sumField = (rows: CampaignMetricRow[], field: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversion_value' | 'reach') =>
    rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

  // Frecuencia ponderada por impresiones — más preciso que avg simple porque
  // pondera campañas grandes. Si una campaña tiene 1000 imps con freq 5 y
  // otra tiene 100 imps con freq 1, el promedio simple daría 3 pero la
  // realidad ponderada es ≈4.6 (la audiencia grande sí ve mucha repetición).
  const weightedFrequency = (rows: CampaignMetricRow[]): number => {
    let totalImpressions = 0;
    let weightedSum = 0;
    for (const r of rows) {
      const imp = Number(r.impressions) || 0;
      const freq = Number(r.frequency) || 0;
      if (imp > 0 && freq > 0) {
        totalImpressions += imp;
        weightedSum += freq * imp;
      }
    }
    return totalImpressions > 0 ? weightedSum / totalImpressions : 0;
  };

  // Current period totals
  const totals = useMemo(() => {
    const spend = sumField(metrics, 'spend');
    const impressions = sumField(metrics, 'impressions');
    const clicks = sumField(metrics, 'clicks');
    const conversions = sumField(metrics, 'conversions');
    const revenue = sumField(metrics, 'conversion_value');
    const reach = sumField(metrics, 'reach');
    const frequency = weightedFrequency(metrics);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, conversions, revenue, roas, reach, frequency };
  }, [metrics]);

  // Previous period totals
  const prevTotals = useMemo(() => {
    const spend = sumField(prevMetrics, 'spend');
    const impressions = sumField(prevMetrics, 'impressions');
    const clicks = sumField(prevMetrics, 'clicks');
    const conversions = sumField(prevMetrics, 'conversions');
    const revenue = sumField(prevMetrics, 'conversion_value');
    const reach = sumField(prevMetrics, 'reach');
    const frequency = weightedFrequency(prevMetrics);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, conversions, revenue, roas, reach, frequency };
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

  // ------ Merchant Goals (localStorage) ------

  const goalsKey = `steve-meta-goals-${clientId}`;
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalRoas, setGoalRoas] = useState('');
  const [goalCpa, setGoalCpa] = useState('');

  // Load goals from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(goalsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.roas) setGoalRoas(String(parsed.roas));
        if (parsed.cpa) setGoalCpa(String(parsed.cpa));
      }
    } catch { /* ignore */ }
  }, [goalsKey]);

  const savedGoals = useMemo(() => {
    const roas = parseFloat(goalRoas);
    const cpa = parseFloat(goalCpa);
    return {
      roas: isNaN(roas) || roas <= 0 ? 0 : roas,
      cpa: isNaN(cpa) || cpa <= 0 ? 0 : cpa,
    };
  }, [goalRoas, goalCpa]);

  function handleSaveGoals() {
    const roas = parseFloat(goalRoas);
    const cpa = parseFloat(goalCpa);
    const data: Record<string, number> = {};
    if (!isNaN(roas) && roas > 0) data.roas = roas;
    if (!isNaN(cpa) && cpa > 0) data.cpa = cpa;
    try { localStorage.setItem(goalsKey, JSON.stringify(data)); } catch { /* storage full or unavailable */ }
    setGoalsOpen(false);
    toast.success('Metas guardadas');
  }

  // ------ Proactive Alerts ------

  const activeCampaignCount = useMemo(
    () => campaigns.filter((c) => c.status === 'ACTIVE').length,
    [campaigns],
  );

  const proactiveAlerts = useMemo(() => {
    const alerts: { key: string; title: string; description: string; variant: 'default' | 'destructive' }[] = [];

    // ROAS dropped 20%+
    const roasChange = pctChange(totals.roas, prevTotals.roas);
    if (roasChange !== null && roasChange <= -20) {
      alerts.push({
        key: 'roas-drop',
        title: 'ROAS en caída',
        description: `Tu ROAS bajó ${Math.abs(roasChange).toFixed(0)}% vs el periodo anterior (${prevTotals.roas.toFixed(2)}x → ${totals.roas.toFixed(2)}x).`,
        variant: 'destructive',
      });
    }

    // CPA doubled
    if (prevTotals.conversions > 0 && totals.conversions > 0) {
      const prevCpa = prevTotals.spend / prevTotals.conversions;
      const currCpa = totals.spend / totals.conversions;
      if (prevCpa > 0 && currCpa >= prevCpa * 2) {
        alerts.push({
          key: 'cpa-spike',
          title: 'CPA se duplicó',
          description: `Tu costo por venta subió de ${formatCLP(prevCpa)} a ${formatCLP(currCpa)}. Revisa segmentación o creativos.`,
          variant: 'destructive',
        });
      }
    }

    // Creative fatigue
    if (insights?.creativeFatigue) {
      alerts.push({
        key: 'fatigue',
        title: 'Fatiga creativa detectada',
        description: insights.creativeFatigue,
        variant: 'default',
      });
    }

    return alerts.slice(0, 3);
  }, [totals, prevTotals, insights]);

  // ------ Best Day of Week ------

  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const bestDayOfWeek = useMemo(() => {
    if (dailyChartData.length < 7) return null;
    const byDay: Record<number, { spend: number; revenue: number; count: number }> = {};
    for (const d of dailyChartData) {
      const dow = new Date(d.date + 'T12:00:00').getDay();
      const entry = byDay[dow] || { spend: 0, revenue: 0, count: 0 };
      entry.spend += d.spend;
      entry.revenue += d.revenue;
      entry.count++;
      byDay[dow] = entry;
    }
    let bestDay = -1;
    let bestRoas = 0;
    for (const [day, data] of Object.entries(byDay)) {
      const roas = data.spend > 0 ? data.revenue / data.spend : 0;
      if (roas > bestRoas) {
        bestRoas = roas;
        bestDay = Number(day);
      }
    }
    if (bestDay < 0 || bestRoas === 0) return null;
    return { day: DAY_NAMES[bestDay], roas: bestRoas };
  }, [dailyChartData]);

  // ------ Conversion Velocity ------

  const conversionVelocity = useMemo(() => {
    if (totals.conversions <= 0 || days <= 0) return null;
    const totalHours = days * 24;
    const hoursPerConversion = totalHours / totals.conversions;
    if (hoursPerConversion < 1) {
      const minsPerConv = Math.round(hoursPerConversion * 60);
      return `1 venta cada ${minsPerConv} min`;
    }
    if (hoursPerConversion < 24) {
      return `1 venta cada ${hoursPerConversion.toFixed(1)}h`;
    }
    const daysPerConv = hoursPerConversion / 24;
    return `1 venta cada ${daysPerConv.toFixed(1)} días`;
  }, [totals.conversions, days]);

  // ------ Month Projection ------

  const projection = useMemo(() => {
    if (days <= 0 || totals.revenue <= 0) return null;
    const dailyRevenue = totals.revenue / days;
    const dailySpend = totals.spend / days;
    const projectedRevenue = dailyRevenue * 30;
    const projectedSpend = dailySpend * 30;
    const projectedRoas = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;
    return { revenue: projectedRevenue, roas: projectedRoas };
  }, [totals, days]);

  // ------ PDF Export ------

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleExportPdf = () => {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = doc.internal.pageSize.getWidth();
      let y = 20;

      // Title
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Reporte Meta Ads', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Periodo: ${dateRange === 'custom' ? `${customFrom} - ${customTo}` : dateRange}`, 14, y);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, w - 60, y);
      y += 12;

      // KPIs
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('KPIs', 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const kpis = [
        ['Gasto', formatCLP(totals.spend)],
        ['Conversiones', String(Math.round(totals.conversions))],
        ['Ingresos', formatCLP(totals.revenue)],
        ['ROAS', `${totals.roas.toFixed(2)}x`],
        ['CTR', `${totals.ctr.toFixed(2)}%`],
        ['CPA', totals.conversions > 0 ? formatCLP(totals.spend / totals.conversions) : '--'],
      ];

      for (const [label, value] of kpis) {
        doc.text(`${label}: ${value}`, 14, y);
        y += 6;
      }
      y += 6;

      // Top 5 campaigns
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Top 5 Campañas', 14, y);
      y += 7;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const topCamps = [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 5);
      for (const c of topCamps) {
        const line = `${c.campaign_name.slice(0, 40)} — ROAS: ${c.roas.toFixed(2)}x | Gasto: ${formatCLP(c.spend)} | Conv: ${Math.round(c.conversions)}`;
        doc.text(line, 14, y);
        y += 5;
      }
      y += 8;

      // AI Insights
      if (insights) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('AI Insights', 14, y);
        y += 7;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        if (insights.bestCampaign) {
          doc.text(`Mejor campaña: ${insights.bestCampaign.campaign_name} (ROAS ${insights.bestCampaign.roas.toFixed(2)}x)`, 14, y);
          y += 5;
        }
        if (insights.budgetRec) {
          const lines = doc.splitTextToSize(`Recomendación: ${insights.budgetRec}`, w - 28);
          doc.text(lines, 14, y);
          y += lines.length * 5;
        }
        if (insights.creativeFatigue) {
          const lines = doc.splitTextToSize(`Alerta: ${insights.creativeFatigue}`, w - 28);
          doc.text(lines, 14, y);
          y += lines.length * 5;
        }
      }

      doc.save(`reporte-meta-ads-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF descargado');
    } catch {
      toast.error('Error al generar PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // ------ Report Schedule ------

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [scheduleDay, setScheduleDay] = useState('1');
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const handleSaveSchedule = async () => {
    if (!scheduleEmail.trim() || !scheduleEmail.includes('@')) {
      toast.error('Ingresa un email válido');
      return;
    }
    setScheduleSaving(true);
    try {
      const { error } = await callApi('manage-report-schedule', {
        body: {
          action: 'save',
          client_id: clientId,
          report_type: 'meta_analytics',
          frequency: scheduleFrequency,
          day_of_week: scheduleFrequency === 'weekly' ? Number(scheduleDay) : undefined,
          day_of_month: scheduleFrequency === 'monthly' ? Number(scheduleDay) : undefined,
          recipient_email: scheduleEmail.trim(),
        },
      });
      if (error) throw new Error(error);
      toast.success('Programación guardada');
      setScheduleOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Error al guardar programación');
    } finally {
      setScheduleSaving(false);
    }
  };

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
      {/* 0. Health Banner (semaphore + sync time + summary)                  */}
      {/* ------------------------------------------------------------------ */}
      <MetaHealthBanner totals={totals} activeCampaignCount={activeCampaignCount} />

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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGoalsOpen(true)}
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Metas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={generatingPdf || metrics.length === 0}
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Exportar PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScheduleOpen(true)}
          >
            <CalendarClock className="w-4 h-4 mr-2" />
            Programar
          </Button>
          {allMetaConnectionIds.length > 1 && (
            <Button
              variant={showAllAccounts ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAllAccounts((v) => !v)}
              title={showAllAccounts
                ? `Agregando métricas de las ${allMetaConnectionIds.length} cuentas Meta del cliente`
                : 'Mostrar métricas combinadas de todas las cuentas Meta del cliente'}
            >
              <Users className="w-4 h-4 mr-2" />
              {showAllAccounts
                ? `Todas (${allMetaConnectionIds.length})`
                : 'Solo esta cuenta'}
            </Button>
          )}
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
        <Card className="relative overflow-hidden border bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-5 pb-5 px-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground leading-tight">Ventas</span>
              <div className="p-2 rounded-lg text-green-500 bg-green-500/10">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight leading-none mb-2">
              {formatNumber(totals.conversions)}
            </p>
            <ChangeIndicator value={pctChange(totals.conversions, prevTotals.conversions)} />
            {conversionVelocity && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {conversionVelocity}
              </p>
            )}
          </CardContent>
        </Card>
        <KpiCard
          title="Ingresos"
          value={formatCLP(totals.revenue)}
          change={pctChange(totals.revenue, prevTotals.revenue)}
          icon={DollarSign}
          accent="cyan"
        />
        {/* ROAS KPI with optional progress bar */}
        <Card className="relative overflow-hidden border bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-5 pb-5 px-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground leading-tight">
                <JargonTooltip term="ROAS" />
              </span>
              <div className="p-2 rounded-lg text-green-500 bg-green-500/10">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight leading-none mb-2">
              {formatRoas(totals.roas)}
            </p>
            <ChangeIndicator value={pctChange(totals.roas, prevTotals.roas)} />
            {savedGoals.roas > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Meta: {savedGoals.roas.toFixed(1)}x</span>
                  <span>{Math.min(100, Math.round(getProgressPercent(totals.roas, savedGoals.roas, true)))}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getTargetBgColor(getTargetStatus(totals.roas, savedGoals.roas, true))}`}
                    style={{ width: `${Math.min(100, getProgressPercent(totals.roas, savedGoals.roas, true))}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2.3 Reach + Frequency Row (Tier 2: fatiga creativa)                 */}
      {/* ------------------------------------------------------------------ */}
      {(totals.reach > 0 || totals.frequency > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            title="Reach (personas alcanzadas)"
            value={formatNumber(totals.reach)}
            change={pctChange(totals.reach, prevTotals.reach)}
            icon={Users}
            accent="indigo"
          />
          <Card className={`relative overflow-hidden border ${
            totals.frequency > 3
              ? 'bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30'
              : totals.frequency > 2
                ? 'bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/30'
                : 'bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20'
          }`}>
            <CardContent className="pt-5 pb-5 px-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground leading-tight">
                  Frecuencia (impresiones por persona)
                </span>
                <div className={`p-2 rounded-lg ${
                  totals.frequency > 3 ? 'text-red-500 bg-red-500/10'
                    : totals.frequency > 2 ? 'text-amber-500 bg-amber-500/10'
                    : 'text-green-500 bg-green-500/10'
                }`}>
                  <Eye className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight leading-none mb-2">
                {totals.frequency.toFixed(2)}
              </p>
              <ChangeIndicator value={pctChange(totals.frequency, prevTotals.frequency)} invertColors />
              <p className="text-xs text-muted-foreground mt-2 leading-snug">
                {totals.frequency > 3
                  ? '⚠️ Fatiga alta: tu audiencia ya vio el ad >3 veces. Refresca creativos.'
                  : totals.frequency > 2
                    ? 'Frecuencia subiendo: planificá nuevos creativos pronto.'
                    : 'Frecuencia saludable. La audiencia aún tiene espacio.'}
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden border bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border-indigo-500/20">
            <CardContent className="pt-5 pb-5 px-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground leading-tight">
                  Costo por mil personas únicas (CPMu)
                </span>
                <div className="p-2 rounded-lg text-indigo-500 bg-indigo-500/10">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight leading-none mb-2">
                {totals.reach > 0 ? formatCLP((totals.spend / totals.reach) * 1000) : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-2 leading-snug">
                Cuánto te cuesta llegar a 1.000 personas distintas (no impresiones).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2.5 Proactive Alerts                                               */}
      {/* ------------------------------------------------------------------ */}
      {proactiveAlerts.length > 0 && (
        <div className="space-y-2">
          {proactiveAlerts.map((alert) => (
            <Alert key={alert.key} variant={alert.variant}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2.7 Quick Insights: Best Day + Projection                          */}
      {/* ------------------------------------------------------------------ */}
      {(bestDayOfWeek || projection) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {bestDayOfWeek && (
            <Card className="border-indigo-500/20 bg-indigo-500/[0.03]">
              <CardContent className="py-4 px-5">
                <p className="text-xs font-medium text-muted-foreground mb-1">Tu mejor día</p>
                <p className="text-lg font-bold">
                  Los <span className="text-indigo-600">{bestDayOfWeek.day}</span> tienes ROAS {bestDayOfWeek.roas.toFixed(1)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">Considera aumentar presupuesto ese día</p>
              </CardContent>
            </Card>
          )}
          {projection && (
            <Card className="border-cyan-500/20 bg-cyan-500/[0.03]">
              <CardContent className="py-4 px-5">
                <p className="text-xs font-medium text-muted-foreground mb-1">Si mantienes este ritmo...</p>
                <p className="text-lg font-bold">
                  Cerrarás el mes con <span className="text-cyan-600">{formatCLP(projection.revenue)}</span> y ROAS {projection.roas.toFixed(1)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">Proyección lineal basada en los últimos {days} días</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-20">
                      Tendencia
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns
                    .slice((campaignPage - 1) * CAMPAIGNS_PER_PAGE, campaignPage * CAMPAIGNS_PER_PAGE)
                    .map((c) => {
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
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {/* Pagination controls — solo si hay más de una página */}
          {sortedCampaigns.length > CAMPAIGNS_PER_PAGE && (
            <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Mostrando {(campaignPage - 1) * CAMPAIGNS_PER_PAGE + 1}–
                {Math.min(campaignPage * CAMPAIGNS_PER_PAGE, sortedCampaigns.length)} de{' '}
                {sortedCampaigns.length} campañas
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={campaignPage === 1}
                  onClick={() => setCampaignPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <span className="text-xs px-2 tabular-nums">
                  {campaignPage} / {Math.ceil(sortedCampaigns.length / CAMPAIGNS_PER_PAGE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={campaignPage * CAMPAIGNS_PER_PAGE >= sortedCampaigns.length}
                  onClick={() => setCampaignPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 4.5 Breakdowns (Tier 2B) — desglose por edad, género, país, etc.   */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Desglose por segmento</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quién está viendo tus ads y dónde convierten mejor.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={breakdownType} onValueChange={(v) => setBreakdownType(v as BreakdownType)}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="age,gender">Edad + Género</SelectItem>
                  <SelectItem value="age">Solo Edad</SelectItem>
                  <SelectItem value="gender">Solo Género</SelectItem>
                  <SelectItem value="country">País</SelectItem>
                  <SelectItem value="device_platform">Dispositivo (mobile/desktop)</SelectItem>
                  <SelectItem value="publisher_platform">Plataforma (FB/IG/Audience Network)</SelectItem>
                  <SelectItem value="platform_position">Placement (feed/stories/reels)</SelectItem>
                  <SelectItem value="hourly_stats_aggregated_by_advertiser_time_zone">Hora del día</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={breakdownLoaded ? 'outline' : 'default'}
                onClick={fetchBreakdowns}
                disabled={breakdownLoading || !ctxConnectionId}
                className="h-8 text-xs"
              >
                {breakdownLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Cargando...</>
                ) : breakdownLoaded ? (
                  <><RefreshCw className="w-3.5 h-3.5 mr-1" />Actualizar</>
                ) : (
                  <>Cargar desglose</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!breakdownLoaded && !breakdownLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Click en "Cargar desglose" para ver performance segmentada.
            </div>
          ) : breakdownLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : breakdownRows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Sin datos para este desglose en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Segmento</th>
                    <th className="text-right py-2 px-2 font-medium">Gasto</th>
                    <th className="text-right py-2 px-2 font-medium">Imp.</th>
                    <th className="text-right py-2 px-2 font-medium">Reach</th>
                    <th className="text-right py-2 px-2 font-medium">Clicks</th>
                    <th className="text-right py-2 px-2 font-medium">CTR</th>
                    <th className="text-right py-2 px-2 font-medium">Ventas</th>
                    <th className="text-right py-2 px-2 font-medium">Ingresos</th>
                    <th className="text-right py-2 px-2 font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.slice(0, 50).map((row) => {
                    const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
                    const roas = row.spend > 0 ? row.conversion_value / row.spend : 0;
                    const isBestRoas = roas >= 3;
                    return (
                      <tr key={row.label} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-2 font-medium">{row.label}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{formatCLP(row.spend)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{formatNumber(row.impressions)}</td>
                        <td className="text-right py-2 px-2 tabular-nums text-muted-foreground">
                          {row.reach > 0 ? formatNumber(row.reach) : '—'}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">{formatNumber(row.clicks)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{ctr.toFixed(2)}%</td>
                        <td className="text-right py-2 px-2 tabular-nums">{formatNumber(row.conversions)}</td>
                        <td className="text-right py-2 px-2 tabular-nums">{formatCLP(row.conversion_value)}</td>
                        <td className={`text-right py-2 px-2 tabular-nums font-medium ${
                          isBestRoas ? 'text-green-600' : roas > 0 ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {row.spend > 0 ? formatRoas(roas) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {breakdownRows.length > 50 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Mostrando los 50 segmentos con mayor gasto de {breakdownRows.length} totales.
                </p>
              )}
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
                <div className="rounded-lg border border-[#2A4F9E]/20 bg-[#1E3A7B]/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-[#2A4F9E]" />
                    <span className="text-sm font-medium text-[#1E3A7B]">
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

      {/* ------------------------------------------------------------------ */}
      {/* Report Schedule Dialog                                              */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Programar Envío de Reporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Frecuencia</Label>
              <Select value={scheduleFrequency} onValueChange={(v) => setScheduleFrequency(v as 'weekly' | 'monthly')}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{scheduleFrequency === 'weekly' ? 'Día de la semana' : 'Día del mes'}</Label>
              {scheduleFrequency === 'weekly' ? (
                <Select value={scheduleDay} onValueChange={setScheduleDay}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Lunes</SelectItem>
                    <SelectItem value="2">Martes</SelectItem>
                    <SelectItem value="3">Miércoles</SelectItem>
                    <SelectItem value="4">Jueves</SelectItem>
                    <SelectItem value="5">Viernes</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={scheduleDay}
                  onChange={(e) => setScheduleDay(e.target.value)}
                  className="mt-1"
                  placeholder="1-28"
                />
              )}
            </div>
            <div>
              <Label>Email destinatario</Label>
              <Input
                type="email"
                value={scheduleEmail}
                onChange={(e) => setScheduleEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={scheduleSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSchedule} disabled={scheduleSaving}>
              {scheduleSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goals Dialog */}
      <Dialog open={goalsOpen} onOpenChange={setGoalsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Metas de Rendimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>ROAS objetivo (ej: 3)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={goalRoas}
                onChange={(e) => setGoalRoas(e.target.value)}
                placeholder="3.0"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Retorno deseado por cada $1 invertido
              </p>
            </div>
            <div>
              <Label>CPA máximo (ej: 15000)</Label>
              <Input
                type="number"
                min={0}
                step={100}
                value={goalCpa}
                onChange={(e) => setGoalCpa(e.target.value)}
                placeholder="15000"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Costo máximo aceptable por venta
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setGoalsOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGoals}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        <td className="px-4 py-3">
          {c.dailyBreakdown.length >= 3 && (() => {
            const sorted = [...c.dailyBreakdown].sort((a, b) => a.date.localeCompare(b.date));
            const values = sorted.map((d) => d.roas);
            const max = Math.max(...values, 0.01);
            const min = Math.min(...values, 0);
            const range = max - min || 1;
            const w = 60;
            const h = 20;
            const points = values
              .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
              .join(' ');
            const lastVal = values[values.length - 1];
            const firstVal = values[0];
            const color = lastVal >= firstVal ? '#22c55e' : '#ef4444';
            return (
              <svg width={w} height={h} className="mx-auto">
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          })()}
        </td>
      </tr>

      {/* Expanded daily breakdown */}
      {isExpanded && c.dailyBreakdown.length > 0 && (
        <tr>
          <td colSpan={9} className="p-0">
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
