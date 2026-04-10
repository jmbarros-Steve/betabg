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
// jsPDF importado dinámicamente en handleExportPdf (#24 fix: -280KB del bundle)
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

// #3 fix: Intl.NumberFormat creado una sola vez por formatter (no por cada llamada)
function buildCurrencyFormatter(currency: string) {
  const fmt = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'CLP' ? 0 : 2,
    maximumFractionDigits: currency === 'CLP' ? 0 : 2,
  });
  return (value: number): string => isFinite(value) ? fmt.format(value) : '--';
}

// #86 fix: Intl.NumberFormat cacheado (no crear en cada llamada)
const _numberFmt = new Intl.NumberFormat('es-CL');
const formatNumber = (value: number): string =>
  isFinite(value) ? _numberFmt.format(Math.round(value)) : '--';

// #97 fix: conversiones fraccionarias (data-driven attribution)
const _convFmt = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const formatConversions = (value: number): string =>
  isFinite(value) ? (Number.isInteger(value) ? _numberFmt.format(value) : _convFmt.format(value)) : '--';

const formatPercent = (value: number): string => isFinite(value) ? `${value.toFixed(2)}%` : '--';

const formatRoas = (value: number): string => isFinite(value) ? `${value.toFixed(2)}x` : '--';

// #1 fix: retorna Infinity cuando prev=0 y curr>0, no null
const pctChange = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? null : Infinity;
  return ((current - previous) / previous) * 100;
};

const sumField = (rows: CampaignMetricRow[], field: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversion_value') =>
  rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

// #17 fix: DAY_NAMES en plural para "Los Domingos", "Los Lunes", etc.
const DAY_NAMES_PLURAL = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];

// #38 fix: reemplazar hex hardcodeados con Tailwind semántico para dark mode
const ACCENT_MAP: Record<string, string> = {
  blue: 'from-blue-500/10 to-blue-500/5 border-blue-500/20',
  green: 'from-green-500/10 to-green-500/5 border-green-500/20',
  purple: 'from-purple-500/10 to-purple-500/5 border-purple-500/20',
  red: 'from-red-500/10 to-red-500/5 border-red-500/20',
  amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/20',
  cyan: 'from-cyan-500/10 to-cyan-500/5 border-cyan-500/20',
};
const ICON_COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  green: 'text-green-600 dark:text-green-400 bg-green-500/10',
  purple: 'text-purple-600 dark:text-purple-400 bg-purple-500/10',
  red: 'text-red-600 dark:text-red-400 bg-red-500/10',
  amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  cyan: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10',
};

// #14 fix: sanitizeForPdf fuera del componente (pura, sin state)
const sanitizeForPdf = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// #34 fix: dark mode variants
const roasColor = (roas: number): string =>
  roas >= 3 ? 'text-green-600 dark:text-green-400' : roas >= 2 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// #115 fix: -Infinity → "Sin ref." en vez de "Nuevo"
function ChangeIndicator({ value, invertColors = false, absoluteLabel }: { value: number | null; invertColors?: boolean; absoluteLabel?: string }) {
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
  const isInf = !isFinite(value);
  const infLabel = isPositive ? 'Nuevo' : 'Sin ref.';
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${isGood ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
      {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
      {isInf ? infLabel : `${Math.abs(value).toFixed(1)}%`} vs periodo anterior
      {absoluteLabel && <span className="text-xs text-muted-foreground ml-1">({absoluteLabel})</span>}
    </span>
  );
}

// #103 fix: React.memo para evitar re-renders innecesarios de 7 KPI cards
const KpiCard = memo(function KpiCard({
  title,
  value,
  change,
  icon: Icon,
  accent = 'blue',
  invertColors = false,
  absoluteLabel,
  children,
}: {
  title: React.ReactNode;
  value: string;
  change: number | null;
  icon: React.ElementType;
  accent?: string;
  invertColors?: boolean;
  absoluteLabel?: string;
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
          {value}
        </p>
        <ChangeIndicator value={change} invertColors={invertColors} absoluteLabel={absoluteLabel} />
        {children}
      </CardContent>
    </Card>
  );
});

// #113 fix: maneja REMOVED de Google Ads en español
function StatusBadge({ status }: { status: string }) {
  const s = (status || 'UNKNOWN').toUpperCase();
  if (s === 'ENABLED') return <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 text-xs">Activa</Badge>;
  if (s === 'PAUSED') return <Badge className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 text-xs">Pausada</Badge>;
  if (s === 'REMOVED') return <Badge className="bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-500/30 text-xs">Eliminada</Badge>;
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
  // #21 fix: error persistente después de fallo de fetch
  const [fetchError, setFetchError] = useState<string | null>(null);

  // #3 fix: AbortController para cancelar fetches en vuelo
  const abortRef = useRef<AbortController | null>(null);

  // #4 fix: detectar moneda y alertar si hay mezcla
  const { detectedCurrency, hasMultipleCurrencies } = useMemo(() => {
    const currencies = new Set<string>();
    for (const m of metrics) {
      if (m.currency) currencies.add(m.currency.toUpperCase());
    }
    const arr = Array.from(currencies);
    return { detectedCurrency: arr[0] || 'CLP', hasMultipleCurrencies: arr.length > 1 };
  }, [metrics]);

  const formatMoney = useMemo(() => buildCurrencyFormatter(detectedCurrency), [detectedCurrency]);

  // ------ Merchant Goals (localStorage) ------
  const goalsKey = `steve-google-goals-${clientId}`;
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalRoas, setGoalRoas] = useState('');
  const [goalCpa, setGoalCpa] = useState('');
  const [goalsVersion, setGoalsVersion] = useState(0);

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

  // #12 fix: committedGoals se lee de localStorage, no del input en vivo
  const committedGoals = useMemo(() => {
    try {
      const stored = localStorage.getItem(goalsKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const r = parseFloat(parsed.roas);
        const c = parseFloat(parsed.cpa);
        return { roas: r > 0 ? r : 0, cpa: c > 0 ? c : 0 };
      }
    } catch { /* ignore */ }
    return { roas: 0, cpa: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsKey, goalsVersion]);

  // #88 fix: useCallback para estabilizar ref + #111 fix: validación max
  const handleSaveGoals = useCallback(() => {
    const roas = parseFloat(goalRoas);
    const cpa = parseFloat(goalCpa);
    const data: Record<string, number> = {};
    if (!isNaN(roas) && roas > 0) {
      if (roas > 100) toast.warning('ROAS objetivo muy alto (típico: 2-10x)');
      data.roas = roas;
    }
    if (!isNaN(cpa) && cpa > 0) {
      if (cpa > 10_000_000) toast.warning('CPA máximo muy alto');
      data.cpa = cpa;
    }
    try {
      localStorage.setItem(goalsKey, JSON.stringify(data));
    } catch {
      toast.error('No se pudieron guardar las metas');
      return;
    }
    setGoalsVersion((v) => v + 1);
    setGoalsOpen(false);
    toast.success('Metas guardadas');
  }, [goalsKey, goalRoas, goalCpa]);

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

  // #87 fix: useCallback para fetchData (evita stale closures en bg:sync-complete)
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!connectionId) { setMetrics([]); setPrevMetrics([]); setLoading(false); return; }
    setLoading(true);
    setFetchError(null);
    try {
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
      setFetchError(err instanceof Error ? err.message : 'Error al cargar datos de Google Ads');
      toast.error('Error al cargar datos de Google Ads');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [connectionId, from, to, prevFrom, prevTo]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchData(controller.signal);
    return () => { abortRef.current?.abort(); };
  }, [fetchData, lastSyncAt]);

  // #87 fix: bg:sync-complete ahora usa fetchData estable
  useEffect(() => {
    const handler = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchData(controller.signal);
    };
    window.addEventListener('bg:sync-complete', handler);
    return () => window.removeEventListener('bg:sync-complete', handler);
  }, [fetchData]);

  // #96/#107 fix: limpiar expandedRows cuando cambia fuente de datos o sort
  useEffect(() => {
    setExpandedRows(new Set());
  }, [connectionId, dateRange, lastSyncAt, sortField, sortAsc]);

  // #99 fix: limpia fetchError + #91 fix: guard unmount en refreshing
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setFetchError(null);
    try {
      const { error } = await callApi('sync-campaign-metrics', {
        body: { connection_id: connectionId, platform: 'google' },
      });
      if (error) { toast.error(error); return; }
      toast.success('Datos Google Ads sincronizados');
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      await fetchData(controller.signal);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('Google Ads sync error:', err);
      toast.error('Error al sincronizar Google Ads');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, connectionId, fetchData]);

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

      // #102 fix: nombre y status del row más reciente por fecha (no por orden de iteración)
      const sortedByDate = [...rows].sort((a, b) => b.metric_date.localeCompare(a.metric_date));
      const latestName = sortedByDate[0]?.campaign_name || name;
      const rawStatus = sortedByDate[0]?.campaign_status;
      const realStatus = rawStatus ? rawStatus.toUpperCase() : 'UNKNOWN';

      result.push({
        campaign_id: id, campaign_name: latestName, status: realStatus,
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
    const purchases = totals.conversions;
    // #7 fix: garantizar monotonía descendente en el funnel
    const rawInteractions = Math.round(clicks * 0.85 * 0.30);
    const interactions = Math.max(rawInteractions, purchases);
    const landingPageViews = Math.max(Math.round(clicks * 0.85), interactions);

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
    // #14 fix: datos raw para evitar dep en formatMoney — se formatea en JSX
    let budgetRec: { shiftAmount: number; lowCount: number; highName: string; highRoas: number } | null = null;
    if (highRoasCampaigns.length > 0 && lowRoasCampaigns.length > 0) {
      budgetRec = {
        shiftAmount: lowRoasCampaigns.reduce((s, c) => s + c.spend * 0.3, 0),
        lowCount: lowRoasCampaigns.length,
        highName: highRoasCampaigns[0].campaign_name,
        highRoas: highRoasCampaigns[0].roas,
      };
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
  }, [campaigns]);

  // #93 fix: isFinite guard en roasChange + #100 fix: CPA prevCpa>0 guard + #90 fix: datos raw sin formatMoney
  const proactiveAlerts = useMemo(() => {
    const alerts: { key: string; title: string; description: string; variant: 'default' | 'destructive'; prevCpa?: number; currCpa?: number }[] = [];

    const roasChange = pctChange(totals.roas, prevTotals.roas);
    if (roasChange !== null && isFinite(roasChange) && roasChange <= -20 && prevTotals.roas >= 0.5) {
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
      if (prevCpa > 0 && currCpa > 0 && isFinite(currCpa / prevCpa) && currCpa >= prevCpa * 1.5) {
        alerts.push({
          key: 'cpa-spike',
          title: 'CPA subió significativamente',
          description: '',
          variant: 'destructive',
          prevCpa,
          currCpa,
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
  }, [totals, prevTotals, insights]);

  // Best day of week
  // #11 fix: solo mostrar si el mejor día es >20% mejor que el promedio
  const bestDayOfWeek = useMemo(() => {
    if (dailyChartData.length < 7) return null;
    const byDay: Record<number, { spend: number; revenue: number; count: number }> = {};
    for (const d of dailyChartData) {
      // #98 fix: extraer solo YYYY-MM-DD para evitar doble-timestamp
      const dateOnly = d.date.slice(0, 10);
      const dow = new Date(dateOnly + 'T12:00:00').getDay();
      if (isNaN(dow)) continue;
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
    // #11: solo mostrar si es significativamente mejor que el ROAS global
    const overallRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    if (overallRoas > 0 && bestRoas < overallRoas * 1.2) return null;
    return { day: DAY_NAMES_PLURAL[bestDay], roas: bestRoas };
  }, [dailyChartData, totals.spend, totals.revenue]);

  // #89 fix: solo proyectar si rango <= días transcurridos del mes (evita proyección multi-mes engañosa)
  const projection = useMemo(() => {
    if (days <= 0 || totals.revenue <= 0) return null;
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (days > dayOfMonth + 1) return null;
    const dailyRevenue = totals.revenue / days;
    const dailySpend = totals.spend / days;
    const projectedRevenue = dailyRevenue * daysInMonth;
    const projectedSpend = dailySpend * daysInMonth;
    const projectedRoas = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;
    return { revenue: projectedRevenue, roas: projectedRoas, daysInMonth, basedOnDays: days };
  }, [totals, days]);

  // #24 fix: dynamic import de jsPDF (evita 280KB en bundle)
  // #25 fix: async permite que React pinte el spinner antes del trabajo síncrono
  // #10 fix: top 5 filtra campañas con gasto mínimo significativo
  const handleExportPdf = useCallback(async () => {
    setGeneratingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      // Permite que React pinte el loading spinner
      await new Promise((r) => requestAnimationFrame(r));

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const w = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let y = 20;

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 15) { doc.addPage(); y = 20; }
      };

      // #95 fix: safeText retorna altura consumida (no muta y por side-effect)
      const safeText = (text: string, x: number, yPos: number, maxW?: number): number => {
        const clean = sanitizeForPdf(text);
        if (maxW) {
          const lines = doc.splitTextToSize(clean, maxW);
          doc.text(lines, x, yPos);
          return lines.length * 5;
        }
        doc.text(clean, x, yPos);
        return 5;
      };

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      y += safeText('Reporte Google Ads', 14, y) + 3;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      safeText(`Periodo: ${from} a ${to} (${days} dias)`, 14, y);
      const genDate = new Date().toLocaleDateString('es-CL');
      const genText = `Generado: ${genDate}`;
      const genWidth = doc.getTextWidth(sanitizeForPdf(genText));
      safeText(genText, w - genWidth - 14, y);
      y += 12;

      checkPage(80);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      y += safeText('KPIs', 14, y) + 2;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      // #112 fix: agregar Revenue, CPM y CPA al PDF
      const kpis = [
        ['Gasto', formatMoney(totals.spend)],
        ['Ingresos', formatMoney(totals.revenue)],
        ['Impresiones', formatNumber(totals.impressions)],
        ['Clicks', formatNumber(totals.clicks)],
        ['CTR', formatPercent(totals.ctr)],
        ['CPC', formatMoney(totals.cpc)],
        ['CPM', formatMoney(totals.cpm)],
        ['Conversiones', formatConversions(totals.conversions)],
        ['CPA', totals.conversions > 0 ? formatMoney(totals.spend / totals.conversions) : '--'],
        ['ROAS', formatRoas(totals.roas)],
      ];

      for (const [label, value] of kpis) {
        checkPage(6);
        y += safeText(`${label}: ${value}`, 14, y, w - 28) + 1;
      }
      y += 4;

      checkPage(40);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      y += safeText('Top 5 Campanas', 14, y) + 2;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const minSpend = totals.spend * 0.01;
      const topCamps = [...campaigns].filter((c) => c.spend >= minSpend).sort((a, b) => b.roas - a.roas).slice(0, 5);
      for (const c of topCamps) {
        // #101 fix: estimar largo real antes de checkPage
        const line = `${c.campaign_name.slice(0, 40)} - ROAS: ${c.roas.toFixed(2)}x | Gasto: ${formatMoney(c.spend)} | Conv: ${formatConversions(c.conversions)}`;
        const estLines = doc.splitTextToSize(sanitizeForPdf(line), w - 28).length;
        checkPage(estLines * 5 + 2);
        y += safeText(line, 14, y, w - 28);
      }
      y += 8;

      if (insights) {
        checkPage(30);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        y += safeText('AI Insights', 14, y) + 2;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        if (insights.bestCampaign) {
          checkPage(10);
          y += safeText(`Mejor campana: ${insights.bestCampaign.campaign_name} (ROAS ${insights.bestCampaign.roas.toFixed(2)}x)`, 14, y, w - 28);
        }
        if (insights.budgetRec) {
          const { shiftAmount, lowCount, highName, highRoas } = insights.budgetRec;
          const budgetText = `Recomendacion: Redirigir ${formatMoney(shiftAmount)} desde ${lowCount} campana(s) de bajo ROAS hacia "${highName}" (ROAS ${formatRoas(highRoas)})`;
          const sanitized = sanitizeForPdf(budgetText);
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

  // #17 fix: setSortAsc fuera del updater de setSortField
  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortAsc((a) => !a);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }, [sortField]);

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

  // Loading skeleton — #27 fix: 8 items (llena grid 2-col y 4-col sin huérfano)
  if (loading && metrics.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasData = metrics.length > 0;
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

      {/* #21 fix: error persistente después de fallo de fetch */}
      {fetchError && !loading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error al cargar datos</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      )}

      {/* #4 fix: alerta de monedas mixtas */}
      {hasMultipleCurrencies && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Monedas mixtas detectadas</AlertTitle>
          <AlertDescription>Esta cuenta tiene campañas en múltiples monedas. Los totales se muestran en {detectedCurrency}.</AlertDescription>
        </Alert>
      )}

      {/* 1. Proactive Alerts — #90 fix: CPA alert formateado en JSX (no en memo) */}
      {proactiveAlerts.length > 0 && (
        <div className="space-y-2">
          {proactiveAlerts.map((alert) => (
            <Alert key={alert.key} variant={alert.variant}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>
                {alert.key === 'cpa-spike' && alert.prevCpa != null && alert.currCpa != null
                  ? `Tu costo por conversión subió de ${formatMoney(alert.prevCpa)} a ${formatMoney(alert.currCpa)} (+${((alert.currCpa / alert.prevCpa - 1) * 100).toFixed(0)}%). Revisa segmentación o creativos.`
                  : alert.description}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* 2. Health Banner */}
      {/* #5 fix: pasar currency para evitar formatCLP hardcodeado */}
      <GoogleHealthBanner
        totals={{ spend: totals.spend, conversions: totals.conversions, revenue: totals.revenue, roas: totals.roas }}
        activeCampaignCount={activeCampaignCount}
        lastSyncAt={lastSyncAt}
        connectionActive={connectionActive}
        currency={detectedCurrency}
      />

      {/* 3. Date range + Sync + PDF + Settings */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* #33 fix: flex-wrap para no overflow en mobile; #40: aria-pressed + role=group */}
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Periodo de tiempo">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              variant={dateRange === opt.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange(opt.key)}
              disabled={generatingPdf}
              aria-pressed={dateRange === opt.key}
              className="text-xs min-h-[44px]"
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
            disabled={refreshing || loading}
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
            disabled={generatingPdf || refreshing || !hasData}
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
        {/* #15 fix: CTR muestra cambio absoluto en pp además del relativo */}
        <KpiCard
          title={<JargonTooltip term="CTR" />}
          value={formatPercent(totals.ctr)}
          change={pctChange(totals.ctr, prevTotals.ctr)}
          icon={Target}
          accent="purple"
          absoluteLabel={prevTotals.impressions > 0 ? `${(totals.ctr - prevTotals.ctr) >= 0 ? '+' : ''}${(totals.ctr - prevTotals.ctr).toFixed(1)}pp` : undefined}
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
          value={formatConversions(totals.conversions)}
          change={pctChange(totals.conversions, prevTotals.conversions)}
          icon={ShoppingCart}
          accent="green"
        >
          {/* #13 fix: CPA progress — 100% cuando CPA <= target, decrece cuando excede */}
          {committedGoals.cpa > 0 && totals.conversions > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>CPA máx: {formatMoney(committedGoals.cpa)}</span>
                <span>{formatMoney(currentCpa)}</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getTargetBgColor(getTargetStatus(currentCpa, committedGoals.cpa, false))}`}
                  style={{ width: `${Math.min(100, currentCpa > 0 ? (committedGoals.cpa / currentCpa) * 100 : 100)}%` }}
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
          {committedGoals.roas > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Meta: {committedGoals.roas.toFixed(1)}x</span>
                <span>{Math.min(100, Math.round(getProgressPercent(totals.roas, committedGoals.roas, true)))}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getTargetBgColor(getTargetStatus(totals.roas, committedGoals.roas, true))}`}
                  style={{ width: `${Math.min(100, getProgressPercent(totals.roas, committedGoals.roas, true))}%` }}
                />
              </div>
            </div>
          )}
        </KpiCard>
      </div>

      {/* 5. Best Day + Projection */}
      {(bestDayOfWeek || projection) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* #35 fix: dark mode variants */}
          {bestDayOfWeek && (
            <Card className="border-indigo-500/20 bg-indigo-500/[0.03]">
              <CardContent className="py-4 px-5">
                <p className="text-xs font-medium text-muted-foreground mb-1">Tu mejor día</p>
                <p className="text-lg font-bold">
                  Los <span className="text-indigo-600 dark:text-indigo-400">{bestDayOfWeek.day}</span> tienes ROAS {bestDayOfWeek.roas.toFixed(1)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">Considera aumentar presupuesto ese día</p>
              </CardContent>
            </Card>
          )}
          {/* #8 fix: label clarifica que proyección se basa en el periodo seleccionado */}
          {projection && (
            <Card className="border-cyan-500/20 bg-cyan-500/[0.03]">
              <CardContent className="py-4 px-5">
                <p className="text-xs font-medium text-muted-foreground mb-1">Al ritmo del periodo seleccionado...</p>
                <p className="text-lg font-bold">
                  Cerrarás el mes con <span className="text-cyan-600 dark:text-cyan-400">{formatMoney(projection.revenue)}</span> y ROAS {projection.roas.toFixed(1)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">Proyección a {projection.daysInMonth} días basada en promedio de {projection.basedOnDays} días</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* #105 fix: chart necesita min 2 puntos para dibujar línea */}
      {dailyChartData.length === 1 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Solo hay datos de 1 día. Se necesitan al menos 2 para graficar la tendencia.
          </CardContent>
        </Card>
      )}

      {/* 6. Chart: Daily Spend vs Revenue */}
      {dailyChartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gasto vs Ingresos diario</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                {/* #31 fix: minTickGap evita overlap en 60d/90d */}
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  minTickGap={30}
                  tickFormatter={(d: string) => {
                    const dt = new Date(d + 'T12:00:00');
                    return dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                  }}
                />
                {/* #6 fix: Y-axis usa formatMoney en vez de $ hardcodeado */}
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return formatMoney(Math.round(v / 1_000_000) * 1_000_000);
                    if (v >= 1_000) return formatMoney(Math.round(v / 1_000) * 1_000);
                    return formatMoney(v);
                  }}
                />
                {/* #22 fix: tooltip with dark mode compatible styles */}
                {/* #63 fix: tooltip usa nombre ya en español (no depende de dataKey) */}
                {/* #104 fix: fallback name español si Recharts pasa dataKey */}
                <Tooltip
                  formatter={(value: number, name: string) => [
                    typeof value === 'number' ? formatMoney(value) : '--',
                    name === 'spend' ? 'Gasto' : name === 'revenue' ? 'Ingresos' : name,
                  ]}
                  labelFormatter={(label: string) => {
                    const dt = new Date(label + 'T12:00:00');
                    return dt.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card, 0 0% 100%))',
                    borderColor: 'hsl(var(--border, 0 0% 90%))',
                    color: 'hsl(var(--card-foreground, 0 0% 9%))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                {/* #62 fix: name en español directo, sin formatter que flashea */}
                <Legend />
                <Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Gasto" />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Ingresos" />
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
                      {/* #30 fix: min 3% para visibilidad en mobile */}
                      <div className="w-full bg-muted rounded-full h-6 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(step.pct, 3)}%`,
                            background: ['#3B82F6','#6366F1','#8B5CF6','#EC4899','#F97316'][i] || '#3B82F6',
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
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">Mejor campaña</span>
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
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">Campaña a optimizar</span>
                      </div>
                      <p className="text-sm font-medium">{insights.worstCampaign.campaign_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ROAS: <span className="text-red-500 font-semibold">{formatRoas(insights.worstCampaign.roas)}</span>
                        {' | '}Gasto: {formatMoney(insights.worstCampaign.spend)}
                        {insights.worstCampaign.conversions > 0 && <>{' | '}<JargonTooltip term="CPA" />: {formatMoney(insights.worstCampaign.cpa)}</>}
                      </p>
                      {/* #37 fix: texto opaco, no translúcido */}
                      <p className="text-xs mt-2 text-red-600 dark:text-red-400">
                        {insights.worstCampaign.roas < 1
                          ? `Esta campaña gasta más de lo que genera (ROAS ${formatRoas(insights.worstCampaign.roas)}). Considera pausarla y reasignar presupuesto a "${insights.bestCampaign?.campaign_name}".`
                          : insights.worstCampaign.roas < 2
                            ? `ROAS bajo (${formatRoas(insights.worstCampaign.roas)}). Prueba nuevos creativos o audiencias antes de aumentar inversión.`
                            : `Es la de menor rendimiento activa. Revisa segmentación y prueba nuevas imágenes/videos.`
                        }
                      </p>
                    </div>
                  )}

                  {/* #14/#35 fix: budget rec con datos formateados en JSX + dark mode */}
                  {insights.budgetRec && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Recomendación de presupuesto</span>
                      </div>
                      <p className="text-sm">{`Redirigir ${formatMoney(insights.budgetRec.shiftAmount)} desde ${insights.budgetRec.lowCount} campaña(s) de bajo ROAS hacia "${insights.budgetRec.highName}" (ROAS ${formatRoas(insights.budgetRec.highRoas)})`}</p>
                    </div>
                  )}

                  {/* Creative fatigue */}
                  {insights.creativeFatigue && (
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-medium text-orange-600 dark:text-orange-400">Fatiga creativa detectada</span>
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
            <CardTitle id="campaign-table-title" className="text-base">Campañas ({sortedCampaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {/* #106 fix: aria-labelledby conectado al CardTitle */}
              <table className="w-full text-sm" aria-labelledby="campaign-table-title">
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
                    <td className="px-3 py-3 text-right">{formatConversions(totals.conversions)}</td>
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

  // #94 fix: sort memoizado (no re-sort en cada render)
  const sortedBreakdown = useMemo(
    () => [...c.dailyBreakdown].sort((a, b) => a.date.localeCompare(b.date)),
    [c.dailyBreakdown],
  );

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
            <span className="font-medium truncate max-w-[140px] sm:max-w-[200px] md:max-w-[300px] lg:max-w-[400px]" title={c.campaign_name}>{c.campaign_name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMoney(c.spend)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatMoney(c.revenue)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatConversions(c.conversions)}</td>
        <td className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${roasColor(c.roas)}`}>{formatRoas(c.roas)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatPercent(c.ctr)}</td>
        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{c.conversions > 0 ? formatMoney(c.cpa) : '--'}</td>
      </tr>
      {/* #110 fix: aria-label en daily rows para screen readers */}
      {expanded && sortedBreakdown.map((d) => (
        <tr key={d.date} className="border-b border-l-2 border-l-primary/30 bg-muted/15 text-xs text-muted-foreground" aria-label={`${c.campaign_name} - ${d.date}`}>
          <td className="px-4 py-1.5 pl-10 tabular-nums">
            {new Date(d.date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
          </td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(d.spend)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(d.revenue)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatConversions(d.conversions)}</td>
          <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${roasColor(d.roas)}`}>{formatRoas(d.roas)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatPercent(d.ctr)}</td>
          <td className="px-3 py-1.5 text-right font-mono tabular-nums">{d.conversions > 0 ? formatMoney(d.spend / d.conversions) : '--'}</td>
        </tr>
      ))}
    </>
  );
});
