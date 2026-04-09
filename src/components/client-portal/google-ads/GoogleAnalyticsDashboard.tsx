import { useState, useEffect, useMemo } from 'react';
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
  ShoppingCart, Target, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronRight, RefreshCw, Loader2,
  Sparkles, FileDown, Settings2, AlertTriangle,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTargetStatus, getTargetBgColor, getProgressPercent } from '@/lib/metric-utils';
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
  { key: '7d', label: '7 dias', days: 7 },
  { key: '14d', label: '14 dias', days: 14 },
  { key: '30d', label: '30 dias', days: 30 },
  { key: '60d', label: '60 dias', days: 60 },
  { key: '90d', label: '90 dias', days: 90 },
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

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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
        {children}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === 'ENABLED') return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">Activa</Badge>;
  if (s === 'PAUSED') return <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 text-xs">Pausada</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
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

  // Resolve date boundaries
  const { from, to, prevFrom, days } = useMemo(() => {
    const opt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRange);
    const numDays = opt?.days ?? 30;
    const today = new Date().toISOString().split('T')[0];
    return {
      from: daysAgo(numDays),
      to: today,
      prevFrom: daysAgo(numDays * 2),
      days: numDays,
    };
  }, [dateRange]);

  // Data fetching
  useEffect(() => { fetchData(); }, [connectionId, from, to, lastSyncAt]);

  async function fetchData() {
    if (!connectionId) { setMetrics([]); setPrevMetrics([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data: currentData, error: currentError } = await supabase
        .from('campaign_metrics')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('platform', 'google')
        .gte('metric_date', from)
        .lte('metric_date', to)
        .order('metric_date', { ascending: true });

      if (currentError) throw currentError;

      const { data: prevData, error: prevError } = await supabase
        .from('campaign_metrics')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('platform', 'google')
        .gte('metric_date', prevFrom)
        .lt('metric_date', from)
        .order('metric_date', { ascending: true });

      if (prevError) throw prevError;

      setMetrics((currentData as CampaignMetricRow[]) || []);
      setPrevMetrics((prevData as CampaignMetricRow[]) || []);
    } catch {
      toast.error('Error al cargar datos de Google Ads');
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await callApi('sync-campaign-metrics', {
        body: { connection_id: connectionId, platform: 'google' },
      });
      toast.success('Datos Google Ads sincronizados');
      await fetchData();
    } catch {
      toast.error('Error al sincronizar Google Ads');
    } finally {
      setRefreshing(false);
    }
  }

  // Aggregations
  const sumField = (rows: CampaignMetricRow[], field: 'impressions' | 'clicks' | 'spend' | 'conversions' | 'conversion_value') =>
    rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

  const totals = useMemo(() => {
    const spend = sumField(metrics, 'spend');
    const impressions = sumField(metrics, 'impressions');
    const clicks = sumField(metrics, 'clicks');
    const conversions = sumField(metrics, 'conversions');
    const revenue = sumField(metrics, 'conversion_value');
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, cpc, conversions, revenue, roas };
  }, [metrics]);

  const prevTotals = useMemo(() => {
    const spend = sumField(prevMetrics, 'spend');
    const impressions = sumField(prevMetrics, 'impressions');
    const clicks = sumField(prevMetrics, 'clicks');
    const conversions = sumField(prevMetrics, 'conversions');
    const revenue = sumField(prevMetrics, 'conversion_value');
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    return { spend, impressions, clicks, ctr, cpc, conversions, revenue, roas };
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

      // Daily breakdown
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
      const realStatus = sortedByDate[0]?.campaign_status || 'ENABLED';

      result.push({
        campaign_id: id, campaign_name: name, status: realStatus.toUpperCase(),
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

  // Funnel data
  const funnelData = useMemo(() => {
    const impressions = totals.impressions;
    const clicks = totals.clicks;
    const landingPageViews = Math.round(clicks * 0.85);
    const addToCart = Math.round(landingPageViews * 0.30);
    const purchases = totals.conversions;

    const steps = [
      { name: 'Impresiones', value: impressions },
      { name: 'Clics', value: clicks },
      { name: 'Vistas LP', value: landingPageViews },
      { name: 'Agregar al Carro', value: addToCart },
      { name: 'Conversiones', value: purchases },
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

    const bestCampaign = [...campaigns].sort((a, b) => b.roas - a.roas)[0];

    const worstCampaign = [...campaigns]
      .filter((c) => c.spend > 0 && c.status === 'ENABLED')
      .sort((a, b) => a.roas - b.roas)[0];

    const activeCampaignsAll = campaigns.filter((c) => c.status === 'ENABLED');
    const highRoasCampaigns = activeCampaignsAll.filter((c) => c.roas >= 3 && c.spend > 0);
    const lowRoasCampaigns = activeCampaignsAll.filter((c) => c.roas < 2 && c.roas > 0 && c.spend > 0);
    let budgetRec: string | null = null;
    if (highRoasCampaigns.length > 0 && lowRoasCampaigns.length > 0) {
      const shiftAmount = lowRoasCampaigns.reduce((s, c) => s + c.spend * 0.3, 0);
      budgetRec = `Redirigir ${formatCLP(shiftAmount)} desde ${lowRoasCampaigns.length} campaña(s) de bajo ROAS hacia "${highRoasCampaigns[0].campaign_name}" (ROAS ${formatRoas(highRoasCampaigns[0].roas)})`;
    }

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

  // Proactive Alerts
  const proactiveAlerts = useMemo(() => {
    const alerts: { key: string; title: string; description: string; variant: 'default' | 'destructive' }[] = [];

    const roasChange = pctChange(totals.roas, prevTotals.roas);
    if (roasChange !== null && roasChange <= -20) {
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
      if (prevCpa > 0 && currCpa >= prevCpa * 2) {
        alerts.push({
          key: 'cpa-spike',
          title: 'CPA se duplicó',
          description: `Tu costo por conversión subió de ${formatCLP(prevCpa)} a ${formatCLP(currCpa)}. Revisa segmentación o creativos.`,
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
  }, [totals, prevTotals, insights]);

  // Best day of week
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

  // Monthly projection
  const projection = useMemo(() => {
    if (days <= 0 || totals.revenue <= 0) return null;
    const dailyRevenue = totals.revenue / days;
    const dailySpend = totals.spend / days;
    const projectedRevenue = dailyRevenue * 30;
    const projectedSpend = dailySpend * 30;
    const projectedRoas = projectedSpend > 0 ? projectedRevenue / projectedSpend : 0;
    return { revenue: projectedRevenue, roas: projectedRoas };
  }, [totals, days]);

  // PDF Export
  const handleExportPdf = () => {
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

      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Reporte Google Ads', 14, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Periodo: ${dateRange}`, 14, y);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-CL')}`, w - 60, y);
      y += 12;

      checkPage(60);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('KPIs', 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const kpis = [
        ['Gasto', formatCLP(totals.spend)],
        ['Impresiones', formatNumber(totals.impressions)],
        ['Clicks', formatNumber(totals.clicks)],
        ['CTR', formatPercent(totals.ctr)],
        ['CPC', formatCLP(totals.cpc)],
        ['Conversiones', String(Math.round(totals.conversions))],
        ['ROAS', formatRoas(totals.roas)],
      ];

      for (const [label, value] of kpis) {
        checkPage(6);
        doc.text(`${label}: ${value}`, 14, y);
        y += 6;
      }
      y += 6;

      checkPage(40);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Top 5 Campañas', 14, y);
      y += 7;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const topCamps = [...campaigns].sort((a, b) => b.roas - a.roas).slice(0, 5);
      for (const c of topCamps) {
        checkPage(5);
        const line = `${c.campaign_name.slice(0, 40)} — ROAS: ${c.roas.toFixed(2)}x | Gasto: ${formatCLP(c.spend)} | Conv: ${Math.round(c.conversions)}`;
        doc.text(line, 14, y);
        y += 5;
      }
      y += 8;

      if (insights) {
        checkPage(30);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('AI Insights', 14, y);
        y += 7;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        if (insights.bestCampaign) {
          checkPage(5);
          doc.text(`Mejor campaña: ${insights.bestCampaign.campaign_name} (ROAS ${insights.bestCampaign.roas.toFixed(2)}x)`, 14, y);
          y += 5;
        }
        if (insights.budgetRec) {
          const lines = doc.splitTextToSize(`Recomendación: ${insights.budgetRec}`, w - 28);
          checkPage(lines.length * 5);
          doc.text(lines, 14, y);
          y += lines.length * 5;
        }
        if (insights.creativeFatigue) {
          const lines = doc.splitTextToSize(`Alerta: ${insights.creativeFatigue}`, w - 28);
          checkPage(lines.length * 5);
          doc.text(lines, 14, y);
          y += lines.length * 5;
        }
      }

      doc.save(`reporte-google-ads-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF descargado');
    } catch {
      toast.error('Error al generar PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Sort handler
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortAsc ? <TrendingUp className="w-3 h-3 inline ml-1" /> : <TrendingDown className="w-3 h-3 inline ml-1" />;
  };

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

  return (
    <div className="space-y-5">
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
        connectionActive={true}
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
            Sincronizar
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
            onClick={() => setGoalsOpen(true)}
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Metas
          </Button>
        </div>
      </div>

      {/* 4. KPI Cards with progress bar on ROAS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard
          title="Gasto"
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
          accent="cyan"
        />
        <KpiCard
          title="CTR"
          value={formatPercent(totals.ctr)}
          change={pctChange(totals.ctr, prevTotals.ctr)}
          icon={Target}
          accent="purple"
        />
        <KpiCard
          title="CPC"
          value={formatCLP(totals.cpc)}
          change={pctChange(totals.cpc, prevTotals.cpc)}
          icon={MousePointerClick}
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
                <span>CPA máx: {formatCLP(savedGoals.cpa)}</span>
                <span>{formatCLP(totals.spend / totals.conversions)}</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getTargetBgColor(getTargetStatus(totals.spend / totals.conversions, savedGoals.cpa, false))}`}
                  style={{ width: `${Math.min(100, getProgressPercent(totals.spend / totals.conversions, savedGoals.cpa, false))}%` }}
                />
              </div>
            </div>
          )}
        </KpiCard>
        <KpiCard
          title="ROAS"
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
                  Cerrarás el mes con <span className="text-cyan-600">{formatCLP(projection.revenue)}</span> y ROAS {projection.roas.toFixed(1)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">Proyección lineal basada en los últimos {days} días</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 6. Chart: Daily Spend vs Revenue */}
      {dailyChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gasto vs Revenue diario</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => {
                    const parts = d.split('-');
                    return `${parts[2]}/${parts[1]}`;
                  }}
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  className="text-xs"
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCLP(value),
                    name === 'spend' ? 'Gasto' : 'Revenue',
                  ]}
                  labelFormatter={(label) => {
                    const parts = label.split('-');
                    return `${parts[2]}/${parts[1]}/${parts[0]}`;
                  }}
                />
                <Legend formatter={(v) => (v === 'spend' ? 'Gasto' : 'Revenue')} />
                <Line type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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

      {/* 8. AI Insights */}
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
                  <span className="text-sm font-medium text-green-600">Mejor campaña</span>
                </div>
                <p className="text-sm font-medium">{insights.bestCampaign.campaign_name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ROAS: <span className="text-green-500 font-semibold">{formatRoas(insights.bestCampaign.roas)}</span>
                  {' | '}Ingresos: {formatCLP(insights.bestCampaign.revenue)}
                  {' | '}Gasto: {formatCLP(insights.bestCampaign.spend)}
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
                    {' | '}Gasto: {formatCLP(insights.worstCampaign.spend)}
                    {insights.worstCampaign.conversions > 0 && <>{' | '}CPA: {formatCLP(insights.worstCampaign.cpa)}</>}
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

      {/* 9. Campaign Table */}
      {sortedCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Campañas ({sortedCampaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium">Campaña</th>
                    <th className="text-left px-3 py-2.5 font-medium">Estado</th>
                    <th className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('spend')}>
                      Gasto<SortIcon field="spend" />
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('clicks')}>
                      Clicks<SortIcon field="clicks" />
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('ctr')}>
                      CTR<SortIcon field="ctr" />
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('conversions')}>
                      Conv.<SortIcon field="conversions" />
                    </th>
                    <th className="text-right px-3 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('roas')}>
                      ROAS<SortIcon field="roas" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map((c) => {
                    const expanded = expandedRows.has(c.campaign_id);
                    const roasClass = c.roas >= 3 ? 'text-green-600' : c.roas >= 2 ? 'text-yellow-600' : 'text-red-500';
                    return (
                      <CampaignRow
                        key={c.campaign_id}
                        campaign={c}
                        expanded={expanded}
                        roasClass={roasClass}
                        onToggle={() => toggleRow(c.campaign_id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 10. Empty state */}
      {!loading && metrics.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-3">No hay datos de campañas para este periodo.</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar ahora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 11. Goals Dialog */}
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
                Costo máximo aceptable por conversión
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
// Campaign row (extracted to avoid inline complexity)
// ---------------------------------------------------------------------------

function CampaignRow({
  campaign: c,
  expanded,
  roasClass,
  onToggle,
}: {
  campaign: CampaignAggregate;
  expanded: boolean;
  roasClass: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <span className="font-medium truncate max-w-[200px]">{c.campaign_name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
        <td className="px-3 py-2.5 text-right font-mono">{formatCLP(c.spend)}</td>
        <td className="px-3 py-2.5 text-right font-mono">{formatNumber(c.clicks)}</td>
        <td className="px-3 py-2.5 text-right font-mono">{formatPercent(c.ctr)}</td>
        <td className="px-3 py-2.5 text-right font-mono">{formatNumber(c.conversions)}</td>
        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${roasClass}`}>{formatRoas(c.roas)}</td>
      </tr>
      {expanded && c.dailyBreakdown.map((d) => (
        <tr key={d.date} className="border-b bg-muted/10 text-xs text-muted-foreground">
          <td className="px-4 py-1.5 pl-10">{d.date}</td>
          <td className="px-3 py-1.5" />
          <td className="px-3 py-1.5 text-right font-mono">{formatCLP(d.spend)}</td>
          <td className="px-3 py-1.5 text-right font-mono">{formatNumber(d.clicks)}</td>
          <td className="px-3 py-1.5 text-right font-mono">{formatPercent(d.ctr)}</td>
          <td className="px-3 py-1.5 text-right font-mono">{formatNumber(d.conversions)}</td>
          <td className="px-3 py-1.5 text-right font-mono">{formatRoas(d.roas)}</td>
        </tr>
      ))}
    </>
  );
}
