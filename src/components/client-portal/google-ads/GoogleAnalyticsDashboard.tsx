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
} from 'lucide-react';
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
      {/* Health Banner */}
      <GoogleHealthBanner
        totals={{ spend: totals.spend, conversions: totals.conversions, revenue: totals.revenue, roas: totals.roas }}
        activeCampaignCount={activeCampaignCount}
        lastSyncAt={lastSyncAt}
        connectionActive={true}
      />

      {/* Date range + Sync */}
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
      </div>

      {/* KPI Cards */}
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
        />
        <KpiCard
          title="ROAS"
          value={formatRoas(totals.roas)}
          change={pctChange(totals.roas, prevTotals.roas)}
          icon={TrendingUp}
          accent="green"
        />
      </div>

      {/* Chart: Daily Spend vs Revenue */}
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

      {/* Campaign Table */}
      {sortedCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Campanas ({sortedCampaigns.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium">Campana</th>
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

      {/* Empty state */}
      {!loading && metrics.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-3">No hay datos de campanas para este periodo.</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar ahora
            </Button>
          </CardContent>
        </Card>
      )}
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
