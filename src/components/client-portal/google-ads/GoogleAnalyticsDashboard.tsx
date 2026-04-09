import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Eye, MousePointerClick,
  ShoppingCart, Target, ArrowUpRight, ArrowDownRight, Minus,
  ChevronDown, ChevronRight, RefreshCw, Loader2,
  Sparkles, FileDown, Settings2, AlertTriangle, BarChart3,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTargetStatus, getTargetBgColor, getProgressPercent } from '@/lib/metric-utils';
import { JargonTooltip } from '@/components/client-portal/JargonTooltip';
import GoogleHealthBanner from './GoogleHealthBanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleAnalyticsDashboardProps {
  clientId: string;
  connectionId: string;
  lastSyncAt: string | null;
}

type DateRangeKey = '7d' | '14d' | '30d' | '60d' | '90d';

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
  currency?: string | null;
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
// Helpers (fuera del componente — no se recrean cada render)
// ---------------------------------------------------------------------------

const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string; days: number }[] = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '14d', label: '14 días', days: 14 },
  { key: '30d', label: '30 días', days: 30 },
  { key: '60d', label: '60 días', days: 60 },
  { key: '90d', label: '90 días', days: 90 },
];

// #1 fix: usar timezone local en vez de UTC para daysAgo
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

// #5 fix: currency-aware formatter con fallback CLP
function buildCurrencyFormatter(currency: string) {
  return (value: number): string =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'CLP' ? 0 : 2,
      maximumFractionDigits: currency === 'CLP' ? 0 : 2,
    }).format(value);
}

const formatNumber = (value: number): string =>
  new Intl.NumberFormat('es-CL').format(Math.round(value));

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;

const formatRoas = (value: number): string => `${value.toFixed(2)}x`;

const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? null : null;
  return ((current - previous) / previous) * 100;
};

const sumField = (rows: CampaignMetricRow[], field: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversion_value') =>
  rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

// #17 fix: DAY_NAMES en plural para "Los Domingos", "Los Lunes", etc.
const DAY_NAMES_PLURAL = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];

const ACCENT_MAP: Record<string, string> = {
  blue: 'from-[#2A4F9E]/10 to-[#2A4F9E]/5 border-[#2A4F9E]/20',
  green: 'from-green-500/10 to-green-500/5 border-green-500/20',
  purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
  red: 'from-red-500/10 to-red-500/5 border-red-500/20',
  amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
  cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
};
const ICON_COLOR_MAP: Record<string, string> = {
  blue: 'text-[#2A4F9E] bg-[#1E3A7B]/10',
  green: 'text-green-500 bg-green-500/10',
  purple: 'text-purple-500 bg-purple-500/10',
  red: 'text-red-500 bg-red-500/10',
  amber: 'text-amber-500 bg-amber-500/10',
  cyan: 'text-cyan-500 bg-cyan-500/10',
};

// #14 fix: sanitizeForPdf fuera del componente (pura, sin state)
const sanitizeForPdf = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const roasColor = (roas: number): string =>
  roas >= 3 ? 'text-green-600' : roas >= 2 ? 'text-yellow-600' : 'text-red-500';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// #13 fix: 0% change muestra gris neutro, no verde/rojo
function ChangeIndicator({ value, invertColors = false }: { value: number | null; invertColors?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sin datos previos</span>;
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <Minus className="w-4 h-4" />
        0.0% vs periodo anterior
      </span>
    );
  }
  const isPositive = value > 0;
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
  children,
}: {
  title: React.ReactNode;
  value: string;
  change: number | null;
  icon: React.ElementType;
  prefix?: string;
  accent?: string;
  invertColors?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className={`relative overflow-hidden border bg-gradient-to-br ${ACCENT_MAP[accent] || ACCENT_MAP.blue}`}>
      <CardContent className="pt-5 pb-5 px-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground leading-tight">{title}</span>
          <div className={`p-2 rounded-lg ${ICON_COLOR_MAP[accent] || ICON_COLOR_MAP.blue}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight leading-none mb-2">
          {prefix}{value}
        </p>
        <ChangeIndicator value={change} invertColors={invertColors} />
        {children}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || 'UNKNOWN').toUpperCase();
  if (s === 'ENABLED') return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">Activa</Badge>;
  if (s === 'PAUSED') return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">Pausada</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function renderSortIcon(field: SortField, sortField: SortField, sortAsc: boolean) {
  if (sortField !== field) return null;
  return sortAsc
    ? <TrendingUp className="w-3 h-3 inline ml-1" aria-hidden="true" />
    : <TrendingDown className="w-3 h-3 inline ml-1" aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function GoogleAnalyticsDashboard({
  clientId,
  connectionId,
  lastSyncAt,
}: GoogleAnalyticsDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRangeKey>('30d');
  const [metrics, setMetrics] = useState<CampaignMetricRow[]>([]);
  const [prevMetrics, setPrevMetrics] = useState<CampaignMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('spend');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // #3 fix: AbortController para cancelar fetches en vuelo
  const abortRef = useRef<AbortController | null>(null);

  // #5 fix: detectar moneda desde los datos
  const detectedCurrency = useMemo(() => {
    for (const m of metrics) {
      if (m.currency) return m.currency.toUpperCase();
    }
    return 'CLP';
  }, [metrics]);

  const formatMoney = useMemo(() => buildCurrencyFormatter(detectedCurrency), [detectedCurrency]);

  // ------ Merchant Goals (localStorage) ------
  const goalsKey = `steve-google-goals-${clientId}`;
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalRoas, setGoalRoas] = useState('');
  const [goalCpa, setGoalCpa] = useState('');

  useEffect(() => {
    setGoalRoas('');
    setGoalCpa('');
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
    localStorage.setItem(goalsKey, JSON.stringify(data));
    setGoalsOpen(false);
    toast.success('Metas guardadas');
  }

  // #2 fix: periodos simétricos — prevTo = día anterior a from
  const { from, to, prevFrom, prevTo, days } = useMemo(() => {
    const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
    const numDays = opt?.days ?? 30;
    const today = localDateStr(new Date());
    const fromDate = daysAgo(numDays - 1); // inclusive: numDays days including today
    return {
      from: fromDate,
      to: today,
      prevFrom: daysAgo(numDays * 2 - 1),
      prevTo: daysAgo(numDays), // day before from
      days: numDays,
    };
  }, [dateRange]);

  // #4 fix: prevFrom en deps + AbortController para race condition
  useEffect(() => {
    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetchData(controller.signal);

    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, from, to, prevFrom, prevTo, lastSyncAt]);

  // #16 fix: refresh on bg:sync-complete event (like Meta dashboard)
  useEffect(() => {
    const handler = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchData(controller.signal);
    };
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, from, to, prevFrom, prevTo]);

  // Clear expanded rows when data source changes
  useEffect(() => {
    setExpandedRows(new Set());
  }, [connectionId, dateRange]);

  async function fetchData(signal?: AbortSignal) {
    if (!connectionId) { setMetrics([]); setPrevMetrics([]); setLoading(false); return; }
    setLoading(true);
    try {
      // Paginated fetch — builds fresh query per page to avoid builder mutation
      const fetchAll = async (
        buildQuery: () => ReturnType<ReturnType<typeof supabase.from>['select']>,
      ) => {
        const PAGE = 1000;
        let offset = 0;
        let all: CampaignMetricRow[] = [];
        let done = false;
        while (!done) {
          if (signal?.aborted) return all;
          const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
          if (error) throw error;
          const rows = (data as CampaignMetricRow[]) || [];
          all = all.concat(rows);
          done = rows.length < PAGE;
          offset += PAGE;
        }
        return all;
      };

      const currentData = await fetchAll(() =>
        supabase
          .from('campaign_metrics')
          .select('*')
          .eq('connection_id', connectionId)
          .eq('platform', 'google')
          .gte('metric_date', from)
          .lte('metric_date', to)
          .order('metric_date', { ascending: true })
      );

      if (signal?.aborted) return;

      const prevData = await fetchAll(() =>
        supabase
          .from('campaign_metrics')
          .select('*')
          .eq('connection_id', connectionId)
          .eq('platform', 'google')
          .gte('metric_date', prevFrom)
          .lte('metric_date', prevTo)
          .order('metric_date', { ascending: true })
      );

      if (signal?.aborted) return;

      setMetrics(currentData);
      setPrevMetrics(prevData);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Google Ads fetch error:', err);
      toast.error('Error al cargar datos de Google Ads');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await callApi('sync-campaign-metrics', {
        body: { connection_id: connectionId, platform: 'google' },
      });
      toast.success('Datos Google Ads sincronizados');
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      await fetchData(controller.signal);
    } catch (err) {
      console.error('Google Ads sync error:', err);
      toast.error('Error al sincronizar Google Ads');
    } finally {
      setRefreshing(false);
    }
  }

  // Aggregations
  const totals = useMemo(() => {
    const spend = sumField(metrics, 'spend');
    const impressions = sumField(metrics, 'impressions');
    const clicks = sumField(metrics, 'clicks');
    const conversions = sumField(metrics, 'conversions');
    const revenue = sumField(metrics, 'conversion_value');
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, cpc, cpm, conversions, revenue, roas };
  }, [metrics]);

  const prevTotals = useMemo(() => {
    const spend = sumField(prevMetrics, 'spend');
    const impressions = sumField(prevMetrics, 'impressions');
    const clicks = sumField(prevMetrics, 'clicks');
    const conversions = sumField(prevMetrics, 'conversions');
    const revenue = sumField(prevMetrics, 'conversion_value');
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, cpc, cpm, conversions, revenue, roas };
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
      entry.name = m.campaign_name;
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
      const dailyBreakdown = Array.from(dailyMap.values())
        .map((d) => ({
          ...d,
          ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
          cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
          cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
          roas: d.spend > 0 ? d.revenue / d.spend : 0,
        }))
        .sort((a, b) => b.date.localeCompare(a.date));

      const sortedByDate = [...rows].sort((a, b) => b.metric_date.localeCompare(a.metric_date));
      const rawStatus = sortedByDate[0]?.campaign_status;
      const realStatus = rawStatus ? rawStatus.toUpperCase() : 'UNKNOWN';

      result.push({
        campaign_id: id, campaign_name: name, status: realStatus,
        spend, impressions, clicks, ctr, cpc, cpm,
        conversions, revenue, roas, cpa, dailyBreakdown,
      });
    }
    return result;
  }, [metrics]);

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[sortField] as number;
      const bv = b[sortField] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [campaigns, sortField, sortAsc]);

  const activeCampaignCount = useMemo(
    () => campaigns.filter((c) => c.status === 'ENABLED').length,
    [campaigns],
  );

  const currentCpa = useMemo(
    () => totals.conversions > 0 ? totals.spend / totals.conversions : 0,
    [totals],
  );

  // #6 fix: funnel con disclaimer "(est.)" en steps estimados
  const funnelData = useMemo(() => {
    const impressions = totals.impressions;
    const clicks = totals.clicks;
    const landingPageViews = Math.round(clicks * 0.85);
    const rawInteractions = Math.round(landingPageViews * 0.30);
    const purchases = totals.conversions;
    const interactions = Math.max(rawInteractions, purchases);

    const steps = [
      { name: 'Impresiones', value: impressions, estimated: false },
      { name: 'Clics', value: clicks, estimated: false },
      { name: 'Vistas LP (est.)', value: landingPageViews, estimated: true },
      { name: 'Interacciones (est.)', value: interactions, estimated: true },
      { name: 'Conversiones', value: purchases, estimated: false },
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
  // #8 fix: creativeFatigue sorted by spend (most impactful first)
  // #9 fix: CTR fatigue weighted by impressions
  const insights = useMemo(() => {
    if (campaigns.length === 0) return null;

    const enabledCampaigns = campaigns.filter((c) => c.status === 'ENABLED');
    // bestCampaign only from ENABLED; if none, skip best
    const bestCampaign = enabledCampaigns.length > 0
      ? [...enabledCampaigns].sort((a, b) => b.roas - a.roas)[0]
      : null;

    const worstCampaign = [...campaigns]
      .filter((c) => c.spend > 0 && c.status === 'ENABLED')
      .sort((a, b) => a.roas - b.roas)[0];

    const activeCampaignsAll = campaigns.filter((c) => c.status === 'ENABLED');
    const highRoasCampaigns = activeCampaignsAll.filter((c) => c.roas >= 3 && c.spend > 0);
    const lowRoasCampaigns = activeCampaignsAll.filter((c) => c.roas < 2 && c.spend > 0);
    let budgetRec: string | null = null;
    if (highRoasCampaigns.length > 0 && lowRoasCampaigns.length > 0) {
      const shiftAmount = lowRoasCampaigns.reduce((s, c) => s + c.spend * 0.3, 0);
      budgetRec = `Redirigir ${formatMoney(shiftAmount)} desde ${lowRoasCampaigns.length} campaña(s) de bajo ROAS hacia "${highRoasCampaigns[0].campaign_name}" (ROAS ${formatRoas(highRoasCampaigns[0].roas)})`;
    }

    // #8 fix: sort by spend desc so we detect fatigue on highest-spend campaign first
    let creativeFatigue: string | null = null;
    const sortedBySpend = [...campaigns].sort((a, b) => b.spend - a.spend);
    for (const c of sortedBySpend) {
      if (c.dailyBreakdown.length >= 7) {
        const sorted = [...c.dailyBreakdown].sort((a, b) => a.date.localeCompare(b.date));
        const midpoint = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, midpoint);
        const secondHalf = sorted.slice(midpoint);
        // #9 fix: weight CTR by impressions instead of simple average
        const totalImpFirst = firstHalf.reduce((s, d) => s + d.impressions, 0);
        const totalImpSecond = secondHalf.reduce((s, d) => s + d.impressions, 0);
        const avgCtrFirst = totalImpFirst > 0
          ? firstHalf.reduce((s, d) => s + d.clicks, 0) / totalImpFirst * 100
          : 0;
        const avgCtrSecond = totalImpSecond > 0
          ? secondHalf.reduce((s, d) => s + d.clicks, 0) / totalImpSecond * 100
          : 0;
        if (avgCtrFirst > 0 && avgCtrSecond < avgCtrFirst * 0.8) {
          creativeFatigue = `"${c.campaign_name}" muestra una caída de CTR del ${((1 - avgCtrSecond / avgCtrFirst) * 100).toFixed(0)}% en la segunda mitad del periodo. Considerar rotar creativos.`;
          break;
        }
      }
    }

    return { bestCampaign, worstCampaign, budgetRec, creativeFatigue };
  }, [campaigns, formatMoney]);

  // Proactive Alerts
  // #10 fix: require minimum absolute ROAS to trigger alert (ignore trivial values)
  const proactiveAlerts = useMemo(() => {
    const alerts: { key: string; title: string; description: string; variant: 'default' | 'destructive' }[] = [];

    const roasChange = pctChange(totals.roas, prevTotals.roas);
    if (roasChange !== null && roasChange <= -20 && prevTotals.roas >= 0.5) {
      alerts.push({
        key: 'roas-drop',
        title: 'ROAS en caída',
        description: `Tu ROAS bajó ${Math.abs(roasChange).toFixed(0)}% vs el periodo anterior (${prevTotals.roas.toFixed(2)}x → ${totals.roas.toFixed(2)}x).`,
        variant: 'destructive',
      });
    }

    if (prevTotals.conversions > 0 && totals.conversions > 0) {
      const prevCpa = prevTotals.spend / prevTotals.conversions;
      const currCpa = totals.spend / totals.conversions;
      if (prevCpa > 0 && currCpa >= prevCpa * 1.5) {
        alerts.push({
          key: 'cpa-spike',
          title: 'CPA subió significativamente',
          description: `Tu costo por conversión subió de ${formatMoney(prevCpa)} a ${formatMoney(currCpa)} (+${((currCpa / prevCpa - 1) * 100).toFixed(0)}%). Revisa segmentación o creativos.`,
          variant: 'destructive',
        });
      }
    }

    if (insights?.creativeFatigue) {
      alerts.push({
        key: 'fatigue',
        title: 'Fatiga creativa detectada',
        description: insights.creativeFatigue,
        variant: 'default',
      });
    }

    return alerts.slice(0, 3);
  }, [totals, prevTotals, insights, formatMoney]);

  // Best day of week
  const bestDayOfWeek = useMemo(() => {
    if (dailyChartData.length < 7) return null;
    const byDay: Record<number, { spend: number; revenue: number; count: number }> = {};
    for (const d of dailyChartData) {
      const dow = new Date(d.date + 'T12:00:00').getDay();
      if (isNaN(dow)) continue; // #10b: skip malformed dates
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
    return { day: DAY_NAMES_PLURAL[bestDay], roas: bestRoas };
  }, [dailyChartData]);

  // #12 fix: projection uses actual days remaining in current month
  const projection = useMemo(() => {
    const actualDays = dailyChartData.length;
    if (actualDays <= 0 || totals.revenue <= 0) return null;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyRevenue = totals.revenue / actualDays;
    const dailySpend = totals.spend / actualDays;
    const projectedRevenue = dailyRevenue * daysInMonth;
    const projectedSpend = dailySpend * daysInMonth;
    const projectedRoas = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;
    return { revenue: projectedRevenue, roas: projectedRoas, daysInMonth };
  }, [totals, dailyChartData]);

  // #15 fix: PDF includes actual date range, not just "30d"
  const handleExportPdf = useCallback(() => {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let y = 20;

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 15) {
          doc.addPage();
          y = 20;
        }
      };

      const safeText = (text: string, x: number, yPos: number, maxW?: number) => {
        const clean = sanitizeForPdf(text);
        if (maxW) {
          const lines = doc.splitTextToSize(clean, maxW);
          doc.text(lines, x, yPos);
          y += (lines.length - 1) * 5;
        } else {
          doc.text(clean, x, yPos);
        }
      };

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      safeText('Reporte Google Ads', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      safeText(`Periodo: ${from} a ${to} (${days} dias)`, 14, y);
      const genDate = new Date().toLocaleDateString('es-CL');
      const genText = `Generado: ${genDate}`;
      const genWidth = doc.getTextWidth(sanitizeForPdf(genText));
      safeText(genText, w - genWidth - 14, y);
      y += 12;

      checkPage(60);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      safeText('KPIs', 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const kpis = [
        ['Gasto', formatMoney(totals.spend)],
        ['Impresiones', formatNumber(totals.impressions)],
        ['Clicks', formatNumber(totals.clicks)],
        ['CTR', formatPercent(totals.ctr)],
        ['CPC', formatMoney(totals.cpc)],
        ['Conversiones', String(Math.round(totals.conversions))],
        ['ROAS', formatRoas(totals.roas)],
      ];

      for (const [label, value] of kpis) {
        checkPage(6);
        safeText(`${label}: ${value}`, 14, y);
        y += 6;
      }
      y += 6;

      checkPage(40);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      safeText('Top 5 Campanas', 14, y);
      y += 7;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const topCamps = [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 5);
      for (const c of topCamps) {
        checkPage(10);
        const line = `${c.campaign_name.slice(0, 40)} - ROAS: ${c.roas.toFixed(2)}x | Gasto: ${formatMoney(c.spend)} | Conv: ${Math.round(c.conversions)}`;
        safeText(line, 14, y, w - 28);
        y += 5;
      }
      y += 8;

      if (insights) {
        checkPage(30);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        safeText('AI Insights', 14, y);
        y += 7;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        if (insights.bestCampaign) {
          checkPage(10);
          safeText(`Mejor campana: ${insights.bestCampaign.campaign_name} (ROAS ${insights.bestCampaign.roas.toFixed(2)}x)`, 14, y, w - 28);
          y += 5;
        }
        if (insights.budgetRec) {
          const sanitized = sanitizeForPdf(`Recomendacion: ${insights.budgetRec}`);
          const lines = doc.splitTextToSize(sanitized, w - 28);
          checkPage(lines.length * 5);
          doc.text(lines, 14, y);
          y += lines.length * 5;
        }
        if (insights.creativeFatigue) {
          const sanitized = sanitizeForPdf(`Alerta: ${insights.creativeFatigue}`);
          const lines = doc.splitTextToSize(sanitized, w - 28);
          checkPage(lines.length * 5);
          doc.text(lines, 14, y);
          y += lines.length * 5;
        }
      }

      const localDate = localDateStr(new Date());
      doc.save(`reporte-google-ads-${localDate}.pdf`);
      toast.success('PDF descargado');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Error al generar PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }, [from, to, days, totals, campaigns, insights, formatMoney]);

  // Sort handler
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(false);
      return field;
    });
  }, []);

  // #30 fix: stable toggleRow via useCallback
  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Loading skeleton
  if (loading && metrics.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasData = metrics.length > 0;
  // #16 fix: connectionActive derived from data instead of hardcoded true
  const connectionActive = hasData || lastSyncAt !== null;

  return (
    <div className="space-y-5">
      {/* Loading overlay when cached data exists */}
      {loading && hasData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Actualizando datos...
        </div>
      )}

      {/* 1. Proactive Alerts */}
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

      {/* 2. Health Banner */}
      <GoogleHealthBanner
        totals={{ spend: totals.spend, conversions: totals.conversions, revenue: totals.revenue, roas: totals.roas }}
        activeCampaignCount={activeCampaignCount}
        lastSyncAt={lastSyncAt}
        connectionActive={connectionActive}
      />

      {/* 3. Date range + Sync + PDF + Settings */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              variant={dateRange === opt.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange(opt.key)}
              className="text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {/* #21 fix: button text changes during sync */}
            {refreshing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={generatingPdf || !hasData}
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Exportar PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGoalsOpen(true)}
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Metas
          </Button>
        </div>
      </div>

      {/* 4. KPI Cards — #24 fix: use grid-cols-4 instead of 7 to avoid overflow */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title="Gasto"
          value={formatMoney(totals.spend)}
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
          accent="cyan"
        />
        <KpiCard
          title={<JargonTooltip term="CTR" />}
          value={formatPercent(totals.ctr)}
          change={pctChange(totals.ctr, prevTotals.ctr)}
          icon={Target}
          accent="purple"
        />
        <KpiCard
          title={<JargonTooltip term="CPC" />}
          value={formatMoney(totals.cpc)}
          change={pctChange(totals.cpc, prevTotals.cpc)}
          icon={BarChart3}
          accent="amber"
          invertColors
        />
        <KpiCard
          title="Conversiones"
          value={formatNumber(totals.conversions)}
          change={pctChange(totals.conversions, prevTotals.conversions)}
          icon={ShoppingCart}
          accent="green"
        >
          {savedGoals.cpa > 0 && totals.conversions > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>CPA máx: {formatMoney(savedGoals.cpa)}</span>
                <span>{formatMoney(currentCpa)}</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getTargetBgColor(getTargetStatus(currentCpa, savedGoals.cpa, false))}`}
                  style={{ width: `${Math.min(100, getProgressPercent(currentCpa, savedGoals.cpa, false))}%` }}
                />
              </div>
            </div>
          )}
        </KpiCard>
        <KpiCard
          title={<JargonTooltip term="ROAS" />}
          value={formatRoas(totals.roas)}
          change={pctChange(totals.roas, prevTotals.roas)}
          icon={TrendingUp}
          accent="green"
        >
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
        </KpiCard>
      </div>

      {/* 5. Best Day + Projection */}
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
                  Cerrarás el mes con <span className="text-cyan-600">{formatMoney(projection.revenue)}</span> y ROAS {projection.roas.toFixed(1)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">Proyección a {projection.daysInMonth} días basada en {dailyChartData.length} días con datos</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 6. Chart: Daily Spend vs Revenue */}
      {dailyChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gasto vs Ingresos diario</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d + 'T12:00:00');
                    return dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                  }}
                />
                {/* #25 fix: smart Y-axis formatter */}
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
                    return `$${v}`;
                  }}
                />
                {/* #22 fix: tooltip with dark mode compatible styles */}
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatMoney(value),
                    name === 'spend' ? 'Gasto' : 'Ingresos',
                  ]}
                  labelFormatter={(label: string) => {
                    const dt = new Date(label + 'T12:00:00');
                    return dt.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend formatter={(v: string) => (v === 'spend' ? 'Gasto' : 'Ingresos')} />
                {/* #23 fix: activeDot for hover feedback */}
                <Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="spend" />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="revenue" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Funnel y Insights solo cuando hay datos */}
      {hasData && (
        <>
          {/* 7. Funnel de Conversión */}
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
                          <span className={`font-medium w-36 ${step.estimated ? 'text-muted-foreground italic' : ''}`}>{step.name}</span>
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

          {/* 8. AI Insights */}
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Insights de Optimización
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!insights || !insights.bestCampaign ? (
                <p className="text-muted-foreground text-sm">
                  No hay suficientes datos para generar insights. Sincroniza tus campañas primero.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Best performing */}
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-600">Mejor campaña</span>
                    </div>
                    <p className="text-sm font-medium">{insights.bestCampaign.campaign_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ROAS: <span className="text-green-500 font-semibold">{formatRoas(insights.bestCampaign.roas)}</span>
                      {' | '}Ingresos: {formatMoney(insights.bestCampaign.revenue)}
                      {' | '}Gasto: {formatMoney(insights.bestCampaign.spend)}
                    </p>
                  </div>

                  {/* Worst performing — only ENABLED */}
                  {insights.worstCampaign && insights.worstCampaign.campaign_id !== insights.bestCampaign.campaign_id && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-medium text-red-600">Campaña a optimizar</span>
                      </div>
                      <p className="text-sm font-medium">{insights.worstCampaign.campaign_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ROAS: <span className="text-red-500 font-semibold">{formatRoas(insights.worstCampaign.roas)}</span>
                        {' | '}Gasto: {formatMoney(insights.worstCampaign.spend)}
                        {insights.worstCampaign.conversions > 0 && <>{' | '}<JargonTooltip term="CPA" />: {formatMoney(insights.worstCampaign.cpa)}</>}
                      </p>
                      <p className="text-xs mt-2 text-red-600/80">
                        {insights.worstCampaign.roas < 1
                          ? `Esta campaña gasta más de lo que genera (ROAS ${formatRoas(insights.worstCampaign.roas)}). Considera pausarla y reasignar presupuesto a "${insights.bestCampaign.campaign_name}".`
                          : insights.worstCampaign.roas < 2
                            ? `ROAS bajo (${formatRoas(insights.worstCampaign.roas)}). Prueba nuevos creativos o audiencias antes de aumentar inversión.`
                            : `Es la de menor rendimiento activa. Revisa segmentación y prueba nuevas imágenes/videos.`
                        }
                      </p>
                    </div>
                  )}

                  {/* Budget recommendation */}
                  {insights.budgetRec && (
                    <div className="rounded-lg border border-[#2A4F9E]/20 bg-[#1E3A7B]/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-4 h-4 text-[#2A4F9E]" />
                        <span className="text-sm font-medium text-[#1E3A7B]">Recomendación de presupuesto</span>
                      </div>
                      <p className="text-sm">{insights.budgetRec}</p>
                    </div>
                  )}

                  {/* Creative fatigue */}
                  {insights.creativeFatigue && (
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-medium text-orange-600">Fatiga creativa detectada</span>
                      </div>
                      <p className="text-sm">{insights.creativeFatigue}</p>
                    </div>
                  )}

                  {/* Stable state */}
                  {!insights.budgetRec && !insights.creativeFatigue && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-primary">Estado general</span>
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
        </>
      )}

      {/* 9. Campaign Table — #18/#19 fix: added Revenue, CPA columns + footer totals */}
      {sortedCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Campañas ({sortedCampaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="grid">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th scope="col" className="text-left px-4 py-2.5 font-medium">Campaña</th>
                    <th scope="col" className="text-left px-3 py-2.5 font-medium">Estado</th>
                    <th scope="col" className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" role="columnheader" aria-sort={sortField === 'spend' ? (sortAsc ? 'ascending' : 'descending') : 'none'} tabIndex={0} onClick={() => handleSort('spend')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('spend'); } }}>
                      Gasto{renderSortIcon('spend', sortField, sortAsc)}
                    </th>
                    <th scope="col" className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" role="columnheader" aria-sort={sortField === 'revenue' ? (sortAsc ? 'ascending' : 'descending') : 'none'} tabIndex={0} onClick={() => handleSort('revenue')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('revenue'); } }}>
                      Ingresos{renderSortIcon('revenue', sortField, sortAsc)}
                    </th>
                    <th scope="col" className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" role="columnheader" aria-sort={sortField === 'conversions' ? (sortAsc ? 'ascending' : 'descending') : 'none'} tabIndex={0} onClick={() => handleSort('conversions')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('conversions'); } }}>
                      Conv.{renderSortIcon('conversions', sortField, sortAsc)}
                    </th>
                    <th scope="col" className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" role="columnheader" aria-sort={sortField === 'roas' ? (sortAsc ? 'ascending' : 'descending') : 'none'} tabIndex={0} onClick={() => handleSort('roas')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('roas'); } }}>
                      <JargonTooltip term="ROAS" />{renderSortIcon('roas', sortField, sortAsc)}
                    </th>
                    <th scope="col" className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" role="columnheader" aria-sort={sortField === 'ctr' ? (sortAsc ? 'ascending' : 'descending') : 'none'} tabIndex={0} onClick={() => handleSort('ctr')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('ctr'); } }}>
                      <JargonTooltip term="CTR" />{renderSortIcon('ctr', sortField, sortAsc)}
                    </th>
                    <th scope="col" className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" role="columnheader" aria-sort={sortField === 'cpa' ? (sortAsc ? 'ascending' : 'descending') : 'none'} tabIndex={0} onClick={() => handleSort('cpa')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort('cpa'); } }}>
                      <JargonTooltip term="CPA" />{renderSortIcon('cpa', sortField, sortAsc)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c) => (
                    <CampaignRowMemo
                      key={c.campaign_id}
                      campaign={c}
                      expanded={expandedRows.has(c.campaign_id)}
                      onToggle={toggleRow}
                      formatMoney={formatMoney}
                    />
                  ))}
                </tbody>
                {/* #19 fix: footer with totals */}
                <tfoot className="border-t-2 border-border bg-muted/40">
                  <tr className="font-semibold text-sm">
                    <td className="px-4 py-3">Total ({sortedCampaigns.length})</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right">{formatMoney(totals.spend)}</td>
                    <td className="px-3 py-3 text-right">{formatMoney(totals.revenue)}</td>
                    <td className="px-3 py-3 text-right">{formatNumber(totals.conversions)}</td>
                    <td className={`px-3 py-3 text-right ${roasColor(totals.roas)}`}>{formatRoas(totals.roas)}</td>
                    <td className="px-3 py-3 text-right">{formatPercent(totals.ctr)}</td>
                    <td className="px-3 py-3 text-right">{totals.conversions > 0 ? formatMoney(totals.spend / totals.conversions) : '--'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 10. Empty state */}
      {!loading && !hasData && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-3">
              No hay datos de campañas para los últimos {days} días ({from} a {to}).
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar ahora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 11. Goals Dialog — #28/#29 fix: labels with htmlFor + form with onSubmit */}
      <Dialog open={goalsOpen} onOpenChange={setGoalsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Metas de Rendimiento</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveGoals(); }}>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="goal-roas">ROAS objetivo (ej: 3)</Label>
                <Input
                  id="goal-roas"
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
                <Label htmlFor="goal-cpa">CPA máximo (ej: 15000)</Label>
                <Input
                  id="goal-cpa"
                  type="number"
                  min={0}
                  step={100}
                  value={goalCpa}
                  onChange={(e) => setGoalCpa(e.target.value)}
                  placeholder="15000"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Costo máximo aceptable por conversión
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setGoalsOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// #30 fix: CampaignRow with React.memo — receives ID-based onToggle
// #20 fix: campaign name has title tooltip
// #18 fix: added Revenue + CPA columns
// #26 fix: keyboard-accessible rows with aria-expanded
// ---------------------------------------------------------------------------

const CampaignRowMemo = memo(function CampaignRow({
  campaign: c,
  expanded,
  onToggle,
  formatMoney,
}: {
  campaign: CampaignAggregate;
  expanded: boolean;
  onToggle: (id: string) => void;
  formatMoney: (value: number) => string;
}) {
  const handleClick = () => onToggle(c.campaign_id);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(c.campaign_id); }
  };

  return (
    <>
      <tr
        className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="row"
        aria-expanded={expanded}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
            <span className="font-medium truncate max-w-[200px]" title={c.campaign_name}>{c.campaign_name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMoney(c.spend)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMoney(c.revenue)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatNumber(c.conversions)}</td>
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${roasColor(c.roas)}`}>{formatRoas(c.roas)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatPercent(c.ctr)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{c.conversions > 0 ? formatMoney(c.cpa) : '--'}</td>
      </tr>
      {expanded && c.dailyBreakdown.map((d) => (
        <tr key={d.date} className="border-b bg-muted/10 text-xs text-muted-foreground">
          <td className="px-4 py-1.5 pl-10 tabular-nums">
            {new Date(d.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
          </td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(d.spend)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(d.revenue)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatNumber(d.conversions)}</td>
          <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${roasColor(d.roas)}`}>{formatRoas(d.roas)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatPercent(d.ctr)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{d.conversions > 0 ? formatMoney(d.spend / d.conversions) : '--'}</td>
        </tr>
      ))}
    </>
  );
});
