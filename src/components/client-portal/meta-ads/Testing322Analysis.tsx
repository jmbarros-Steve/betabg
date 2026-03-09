import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { useMetaBusiness } from './MetaBusinessContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  RefreshCw,
  Loader2,
  DollarSign,
  Target,
  TrendingUp,
  Zap,
  BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Testing322AnalysisProps {
  clientId: string;
}

interface CampaignOption {
  campaign_id: string;
  campaign_name: string;
}

interface AdsetMetricRow {
  id: string;
  connection_id: string;
  campaign_id: string;
  adset_id: string;
  adset_name: string;
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

interface AggregatedAdset {
  adset_id: string;
  adset_name: string;
  total_spend: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  total_conversion_value: number;
  cpa: number;
  roas: number;
  ctr: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCLP = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtRoas = (n: number) => `${n.toFixed(2)}x`;

const LINE_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Testing322Analysis({ clientId }: Testing322AnalysisProps) {
  const { connectionId } = useMetaBusiness();
  const ctxConnectionId = connectionId;

  // State
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [adsetRows, setAdsetRows] = useState<AdsetMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [escalating, setEscalating] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch campaigns
  // -----------------------------------------------------------------------

  const fetchCampaigns = useCallback(async () => {
    if (!ctxConnectionId) return;
    try {
      const { data, error } = await supabase
        .from('campaign_metrics')
        .select('campaign_id, campaign_name, metric_date')
        .eq('connection_id', ctxConnectionId)
        .eq('platform', 'meta')
        .order('metric_date', { ascending: false });

      if (error) throw error;

      // Deduplicate by campaign_id, keep most recent name
      const seen = new Map<string, CampaignOption>();
      for (const row of data || []) {
        if (!seen.has(row.campaign_id)) {
          seen.set(row.campaign_id, {
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
          });
        }
      }
      const unique = Array.from(seen.values());
      setCampaigns(unique);

      // Default to most recent campaign
      if (unique.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(unique[0].campaign_id);
      }
    } catch (err: any) {
      console.error('Error fetching campaigns:', err);
      toast.error('Error al cargar campañas');
    }
  }, [ctxConnectionId, selectedCampaignId]);

  // -----------------------------------------------------------------------
  // Fetch adset metrics
  // -----------------------------------------------------------------------

  const fetchAdsetMetrics = useCallback(async () => {
    if (!ctxConnectionId || !selectedCampaignId) {
      setAdsetRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('adset_metrics')
        .select('*')
        .eq('connection_id', ctxConnectionId)
        .eq('campaign_id', selectedCampaignId);

      if (error) throw error;
      setAdsetRows(data || []);
    } catch (err: any) {
      console.error('Error fetching adset metrics:', err);
      toast.error('Error al cargar métricas de ad sets');
    } finally {
      setLoading(false);
    }
  }, [ctxConnectionId, selectedCampaignId]);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    if (selectedCampaignId) {
      fetchAdsetMetrics();
    }
  }, [selectedCampaignId, fetchAdsetMetrics]);

  // -----------------------------------------------------------------------
  // Aggregated data
  // -----------------------------------------------------------------------

  const aggregated = useMemo((): AggregatedAdset[] => {
    const map = new Map<string, AggregatedAdset>();

    for (const row of adsetRows) {
      const existing = map.get(row.adset_id) || {
        adset_id: row.adset_id,
        adset_name: row.adset_name || row.adset_id,
        total_spend: 0,
        total_clicks: 0,
        total_impressions: 0,
        total_conversions: 0,
        total_conversion_value: 0,
        cpa: 0,
        roas: 0,
        ctr: 0,
      };

      existing.total_spend += row.spend || 0;
      existing.total_clicks += row.clicks || 0;
      existing.total_impressions += row.impressions || 0;
      existing.total_conversions += row.conversions || 0;
      existing.total_conversion_value += row.conversion_value || 0;

      map.set(row.adset_id, existing);
    }

    // Calculate derived metrics
    const result = Array.from(map.values()).map((a) => ({
      ...a,
      cpa: a.total_conversions > 0 ? a.total_spend / a.total_conversions : 0,
      roas: a.total_spend > 0 ? a.total_conversion_value / a.total_spend : 0,
      ctr: a.total_impressions > 0 ? (a.total_clicks / a.total_impressions) * 100 : 0,
    }));

    // Sort by ROAS descending
    result.sort((a, b) => b.roas - a.roas);
    return result;
  }, [adsetRows]);

  // -----------------------------------------------------------------------
  // Summary totals
  // -----------------------------------------------------------------------

  const summary = useMemo(() => {
    const totalSpend = aggregated.reduce((s, a) => s + a.total_spend, 0);
    const totalConversions = aggregated.reduce((s, a) => s + a.total_conversions, 0);
    const bestRoas = aggregated.length > 0 ? Math.max(...aggregated.map((a) => a.roas)) : 0;
    const bestCpa = aggregated.filter((a) => a.cpa > 0).length > 0
      ? Math.min(...aggregated.filter((a) => a.cpa > 0).map((a) => a.cpa))
      : 0;
    return { totalSpend, totalConversions, bestRoas, bestCpa };
  }, [aggregated]);

  // -----------------------------------------------------------------------
  // Best / worst for color coding
  // -----------------------------------------------------------------------

  const bestRoasId = useMemo(() => {
    if (aggregated.length === 0) return null;
    return aggregated[0].adset_id; // already sorted by ROAS desc
  }, [aggregated]);

  const worstCpaId = useMemo(() => {
    const withCpa = aggregated.filter((a) => a.cpa > 0);
    if (withCpa.length === 0) return null;
    return withCpa.reduce((worst, a) => (a.cpa > worst.cpa ? a : worst), withCpa[0]).adset_id;
  }, [aggregated]);

  // -----------------------------------------------------------------------
  // Timeline chart data
  // -----------------------------------------------------------------------

  const chartData = useMemo(() => {
    // Pick top 4 adsets by total spend
    const topAdsets = [...aggregated]
      .sort((a, b) => b.total_spend - a.total_spend)
      .slice(0, 4);

    const topAdsetIds = new Set(topAdsets.map((a) => a.adset_id));

    // Group by date
    const dateMap = new Map<string, Record<string, number>>();
    for (const row of adsetRows) {
      if (!topAdsetIds.has(row.adset_id)) continue;
      const dateEntry = dateMap.get(row.metric_date) || {};
      const spend = row.spend || 0;
      const convValue = row.conversion_value || 0;
      const dailyRoas = spend > 0 ? convValue / spend : 0;
      dateEntry[row.adset_id] = dailyRoas;
      dateMap.set(row.metric_date, dateEntry);
    }

    // Convert to array sorted by date
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date: new Date(date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
        ...values,
      }));
  }, [adsetRows, aggregated]);

  const topAdsetNames = useMemo(() => {
    const top = [...aggregated]
      .sort((a, b) => b.total_spend - a.total_spend)
      .slice(0, 4);
    return top.map((a) => ({ id: a.adset_id, name: a.adset_name }));
  }, [aggregated]);

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  async function handleSync() {
    if (!ctxConnectionId) return;
    setSyncing(true);
    try {
      const { error } = await callApi('sync-campaign-metrics', {
        body: {
          connection_id: ctxConnectionId,
          platform: 'meta',
          sync_adsets: true,
        },
      });
      if (error) throw new Error(typeof error === 'string' ? error : 'Error de sincronización');
      toast.success('Métricas sincronizadas');
      await fetchCampaigns();
      await fetchAdsetMetrics();
    } catch (err: any) {
      toast.error(err.message || 'Error al sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  // -----------------------------------------------------------------------
  // Escalar ganador
  // -----------------------------------------------------------------------

  async function handleEscalar() {
    if (!ctxConnectionId || !selectedCampaignId) return;
    setEscalating(true);
    try {
      const { error } = await callApi('manage-meta-campaign', {
        body: {
          action: 'duplicate',
          connection_id: ctxConnectionId,
          campaign_id: selectedCampaignId,
          data: {},
        },
      });
      if (error) throw new Error(typeof error === 'string' ? error : 'Error al escalar');
      toast.success('Campaña duplicada exitosamente');
    } catch (err: any) {
      toast.error(err.message || 'Error al escalar campaña');
    } finally {
      setEscalating(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header row: campaign selector + sync button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar campaña" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.campaign_id} value={c.campaign_id}>
                  {c.campaign_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sincronizar
        </Button>

        <Button
          size="sm"
          onClick={handleEscalar}
          disabled={aggregated.length === 0 || escalating}
        >
          {escalating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Escalar Ganador
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              Total Gasto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{fmtCLP(summary.totalSpend)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              Total Conversiones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {Math.round(summary.totalConversions).toLocaleString('es-CL')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Mejor ROAS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">{fmtRoas(summary.bestRoas)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Mejor CPA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-blue-600">
              {summary.bestCpa > 0 ? fmtCLP(summary.bestCpa) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline chart */}
      {chartData.length > 0 && topAdsetNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">ROAS Diario — Top 4 Ad Sets</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => fmtRoas(value)}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Legend />
                {topAdsetNames.map((adset, idx) => (
                  <Line
                    key={adset.id}
                    type="monotone"
                    dataKey={adset.id}
                    name={adset.name}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Adset metrics table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Cargando métricas...</span>
        </div>
      ) : aggregated.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay datos de ad sets para esta campaña. Presiona "Sincronizar" para importar métricas.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Rendimiento por Ad Set</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad Set</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">CPA</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.map((a) => {
                  let rowClass = '';
                  if (a.adset_id === bestRoasId) rowClass = 'bg-green-50';
                  if (a.adset_id === worstCpaId) rowClass = 'bg-red-50';
                  return (
                    <TableRow key={a.adset_id} className={rowClass}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {a.adset_name}
                      </TableCell>
                      <TableCell className="text-right">{fmtCLP(a.total_spend)}</TableCell>
                      <TableCell className="text-right">
                        {Math.round(a.total_conversions).toLocaleString('es-CL')}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.cpa > 0 ? fmtCLP(a.cpa) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={a.roas >= 1 ? 'default' : 'secondary'}>
                          {fmtRoas(a.roas)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtPct(a.ctr)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
