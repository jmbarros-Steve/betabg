import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  Users,
  Mail,
  XCircle,
  DollarSign,
  Eye,
  MousePointerClick,
  Megaphone,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { SendTimeHeatmap } from './SendTimeHeatmap';

interface MetricsInsightsProps {
  clientId: string;
}

interface Insight {
  type: 'success' | 'warning' | 'critical' | 'info';
  title: string;
  message: string;
  icon: string;
}

interface GlobalStats {
  totalProfiles: number | string;
  newProfiles: number;
  totalFlows: number;
  activeFlows: number;
  totalCampaigns: number;
  sentCampaigns: number;
  totalRevenue: number;
  totalFlowRevenue: number;
  totalCampaignRevenue: number;
  totalConversions: number;
  avgOpenRate: number;
  avgClickRate: number;
}

interface KlaviyoCampaign {
  id: string;
  name: string;
  status: string;
  send_time: string | null;
}

const TIMEFRAME_OPTIONS = [
  { value: 'last_24_hours', label: 'Hoy' },
  { value: 'last_7_days', label: '7 días' },
  { value: 'last_30_days', label: '30 días' },
  { value: 'last_60_days', label: '60 días' },
  { value: 'last_90_days', label: '90 días' },
  { value: 'last_365_days', label: '12 meses' },
];

const BORDER_COLORS: Record<Insight['type'], string> = {
  success: 'border-l-green-500',
  warning: 'border-l-yellow-500',
  critical: 'border-l-red-500',
  info: 'border-l-blue-500',
};

const BG_COLORS: Record<Insight['type'], string> = {
  success: 'bg-green-50 dark:bg-green-950/20',
  warning: 'bg-yellow-50 dark:bg-yellow-950/20',
  critical: 'bg-red-50 dark:bg-red-950/20',
  info: 'bg-blue-50 dark:bg-blue-950/20',
};

const ICON_COLORS: Record<Insight['type'], string> = {
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  critical: 'text-red-600 dark:text-red-400',
  info: 'text-blue-600 dark:text-blue-400',
};

const ICON_MAP: Record<string, React.ElementType> = {
  trending_up: TrendingUp,
  check_circle: CheckCircle2,
  alert_triangle: AlertTriangle,
  info: Info,
  zap: Zap,
  users: Users,
  mail: Mail,
  x_circle: XCircle,
};

/* ---------- helpers ---------- */

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('es-CL');
}

function formatProfileCount(n: number): string {
  if (n >= 100000) return '100,000+';
  if (n >= 50000) return '50,000+';
  if (n >= 25000) return '25,000+';
  if (n >= 10000) return '10,000+';
  return Math.round(n).toLocaleString('es-CL');
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

/* ---------- AI insight generation ---------- */

function generateInsights(
  globalStats: GlobalStats,
  campaigns: KlaviyoCampaign[]
): Insight[] {
  const insights: Insight[] = [];

  // Open Rate
  const openRatePct = (globalStats.avgOpenRate * 100).toFixed(1);
  if (globalStats.avgOpenRate < 0.15) {
    insights.push({
      type: 'warning',
      title: 'Open Rate Bajo',
      message: `Tu open rate (${openRatePct}%) está por debajo del promedio. Prueba subjects más cortos y personalizados.`,
      icon: 'mail',
    });
  } else if (globalStats.avgOpenRate > 0.25) {
    insights.push({
      type: 'success',
      title: 'Excelente Open Rate',
      message: `Excelente open rate (${openRatePct}%). Tu audiencia esta engaged.`,
      icon: 'check_circle',
    });
  } else {
    insights.push({
      type: 'info',
      title: 'Open Rate',
      message: `Open rate en ${openRatePct}%. Hay espacio para mejorar con A/B testing.`,
      icon: 'info',
    });
  }

  // Click Rate
  const clickRatePct = (globalStats.avgClickRate * 100).toFixed(2);
  if (globalStats.avgClickRate < 0.02) {
    insights.push({
      type: 'warning',
      title: 'Click Rate Bajo',
      message: `Click rate bajo (${clickRatePct}%). Revisa tus CTAs y asegurate de tener uno solo y claro.`,
      icon: 'alert_triangle',
    });
  } else if (globalStats.avgClickRate > 0.04) {
    insights.push({
      type: 'success',
      title: 'Gran Click Rate',
      message: `Gran click rate (${clickRatePct}%). Tus CTAs estan funcionando.`,
      icon: 'trending_up',
    });
  }

  // Revenue
  if (globalStats.totalRevenue > 0) {
    insights.push({
      type: 'success',
      title: 'Ingresos por Email',
      message: `Has generado $${Math.round(globalStats.totalRevenue).toLocaleString('es-CL')} en los últimos 30 días via email.`,
      icon: 'trending_up',
    });
  } else {
    insights.push({
      type: 'warning',
      title: 'Sin Ingresos por Email',
      message: 'Sin ingresos por email aun. Activa flujos de abandoned cart y post-purchase.',
      icon: 'alert_triangle',
    });
  }

  // Active Flows
  if (globalStats.activeFlows === 0) {
    insights.push({
      type: 'critical',
      title: 'Sin Flujos Activos',
      message: 'No tienes flujos activos. Los flujos generan 30-50% del revenue por email. Activalos ya.',
      icon: 'x_circle',
    });
  } else if (globalStats.activeFlows < 3) {
    insights.push({
      type: 'warning',
      title: 'Pocos Flujos Activos',
      message: `Solo ${globalStats.activeFlows} flujos activos. Recomendamos minimo 5 flujos core.`,
      icon: 'zap',
    });
  } else if (globalStats.activeFlows >= 5) {
    insights.push({
      type: 'success',
      title: 'Flujos Activos',
      message: `${globalStats.activeFlows} flujos activos. Buen trabajo.`,
      icon: 'zap',
    });
  }

  // List Health
  const profileStr = String(globalStats.totalProfiles);
  if (profileStr.includes('+')) {
    insights.push({
      type: 'info',
      title: 'Lista de Suscriptores',
      message: `Tu lista tiene ${profileStr} suscriptores activos.`,
      icon: 'users',
    });
  } else {
    const profileCount =
      typeof globalStats.totalProfiles === 'number'
        ? globalStats.totalProfiles
        : parseInt(profileStr, 10) || 0;
    if (profileCount > 0) {
      insights.push({
        type: 'info',
        title: 'Lista de Suscriptores',
        message: `Tu lista tiene ${profileCount.toLocaleString('es-CL')} suscriptores activos.`,
        icon: 'users',
      });
    }
  }

  // Campaign Frequency
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCampaigns = campaigns.filter(
    (c) => c.send_time && new Date(c.send_time) >= thirtyDaysAgo
  );
  if (recentCampaigns.length < 2) {
    insights.push({
      type: 'warning',
      title: 'Frecuencia de Envio',
      message: `Solo ${recentCampaigns.length} campanas enviadas este mes. Manten 2-3 por semana para engaged subscribers.`,
      icon: 'mail',
    });
  }

  return insights;
}

/* ---------- sub-components ---------- */

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex flex-col gap-1 p-4 bg-muted/50 rounded-xl border border-border/50">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-[11px] uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <span className="text-xl font-bold">{value}</span>
      {subtitle && (
        <span className="text-[10px] text-muted-foreground leading-tight">
          {subtitle}
        </span>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const IconComponent = ICON_MAP[insight.icon] || Info;

  return (
    <Card
      className={`border-l-4 ${BORDER_COLORS[insight.type]} ${BG_COLORS[insight.type]} shadow-sm`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 shrink-0 ${ICON_COLORS[insight.type]}`}
          >
            <IconComponent className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              {insight.title}
            </p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {insight.message}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- main component ---------- */

export function MetricsInsights({ clientId }: MetricsInsightsProps) {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [flows, setFlows] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<'overview' | 'campaigns' | 'flows' | 'horarios'>('overview');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [timeframe, setTimeframe] = useState('last_30_days');
  const [error, setError] = useState<string | null>(null);

  // Step 1: check if there is an active Klaviyo connection
  useEffect(() => {
    let cancelled = false;

    async function checkConnection() {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        setConnectionId(data.id);
        setHasConnection(true);
      } else {
        setHasConnection(false);
        setLoading(false);
      }
    }

    checkConnection();
    return () => { cancelled = true; };
  }, [clientId]);

  // Step 2: once we have a connectionId, auto-fetch metrics
  useEffect(() => {
    if (connectionId) {
      fetchMetrics(timeframe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const fetchMetrics = async (tf: string) => {
    if (!connectionId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await callApi(
        'sync-klaviyo-metrics',
        {
          body: { connectionId, timeframe: tf },
        }
      );

      if (fnError) {
        console.error('Error fetching Klaviyo metrics:', fnError);
        setError(fnError || 'Error al cargar metricas');
        toast.error('Error al cargar metricas de Klaviyo');
        return;
      }

      if (!data) {
        setError('No se recibieron datos de Klaviyo');
        return;
      }

      if (data.globalStats) {
        const stats = data.globalStats as GlobalStats;
        setGlobalStats(stats);

        const generated = generateInsights(
          stats,
          (data.campaigns || []) as KlaviyoCampaign[]
        );
        setInsights(generated);
      } else {
        setError('Respuesta sin metricas globales');
      }

      if (data.flows) setFlows(data.flows);
      if (data.campaigns) setCampaigns(data.campaigns);
    } catch (err: any) {
      console.error('Error generating insights:', err);
      setError(err.message || 'Error inesperado');
      toast.error('Error al generar insights');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeframeChange = (value: string) => {
    setTimeframe(value);
    fetchMetrics(value);
  };

  const handleRefresh = () => {
    fetchMetrics(timeframe);
  };

  // --- No connection state ---
  if (hasConnection === false) {
    return (
      <Card className="glow-box">
        <CardContent className="py-8 text-center">
          <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Conecta Klaviyo en la pestana "Conexiones" para ver tus metricas de email
          </p>
        </CardContent>
      </Card>
    );
  }

  // --- Still checking connection ---
  if (hasConnection === null) {
    return (
      <Card className="glow-box">
        <CardContent className="py-8">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
            <p className="text-xs text-muted-foreground text-center">
              Verificando conexion...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const timeframeLabel =
    TIMEFRAME_OPTIONS.find((o) => o.value === timeframe)?.label || '30 dias';

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <Card className="glow-box">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Metricas de Klaviyo
              </CardTitle>
              <CardDescription>
                Rendimiento de los últimos {timeframeLabel}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeframe} onValueChange={handleTimeframeChange}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Loading state */}
          {loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-sm font-medium text-muted-foreground">
                  Steve esta analizando tus metricas...
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="text-center py-8">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-yellow-500" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reintentar
              </Button>
            </div>
          )}

          {/* Metrics loaded */}
          {!loading && !error && globalStats && (
            <div className="space-y-6">
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  label="Total Perfiles"
                  value={
                    typeof globalStats.totalProfiles === 'string'
                      ? globalStats.totalProfiles
                      : formatProfileCount(globalStats.totalProfiles)
                  }
                  subtitle={
                    globalStats.newProfiles > 0
                      ? `+${formatNumber(globalStats.newProfiles)} nuevos`
                      : undefined
                  }
                  icon={Users}
                />
                <StatCard
                  label="Open Rate"
                  value={`${(globalStats.avgOpenRate * 100).toFixed(1)}%`}
                  icon={Eye}
                />
                <StatCard
                  label="Click Rate"
                  value={`${(globalStats.avgClickRate * 100).toFixed(1)}%`}
                  icon={MousePointerClick}
                />
                <StatCard
                  label="Ingresos Totales"
                  value={formatCurrency(globalStats.totalRevenue)}
                  subtitle={`Flujos: ${formatCurrency(globalStats.totalFlowRevenue)} | Camp: ${formatCurrency(globalStats.totalCampaignRevenue)}`}
                  icon={DollarSign}
                />
                <StatCard
                  label="Flujos Activos"
                  value={`${globalStats.activeFlows}/${globalStats.totalFlows}`}
                  icon={Zap}
                />
                <StatCard
                  label="Campanas Enviadas"
                  value={`${globalStats.sentCampaigns}`}
                  subtitle={`de ${globalStats.totalCampaigns} totales`}
                  icon={Megaphone}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section Tabs */}
      {!loading && !error && globalStats && (
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          {(['overview', 'campaigns', 'flows', 'horarios'] as const).map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeSection === section
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {section === 'overview' ? 'Resumen' : section === 'campaigns' ? `Campañas (${campaigns.filter(c => c.metrics).length})` : section === 'flows' ? `Flujos (${flows.filter(f => f.metrics).length})` : 'Horarios'}
            </button>
          ))}
        </div>
      )}

      {/* AI Insights Section */}
      {activeSection === 'overview' && !loading && insights.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Insights de Steve
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      {activeSection === 'campaigns' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Campaña</th>
                    <th className="text-left p-3 font-medium">Estado</th>
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-right p-3 font-medium">Enviados</th>
                    <th className="text-right p-3 font-medium">Open Rate</th>
                    <th className="text-right p-3 font-medium">Click Rate</th>
                    <th className="text-right p-3 font-medium">Ingresos</th>
                    <th className="text-right p-3 font-medium">Conversiones</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns
                    .filter(c => c.metrics)
                    .sort((a, b) => {
                      const dateA = a.send_time ? new Date(a.send_time).getTime() : 0;
                      const dateB = b.send_time ? new Date(b.send_time).getTime() : 0;
                      return dateB - dateA;
                    })
                    .map(campaign => (
                      <tr key={campaign.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-medium max-w-[200px] truncate">{campaign.name}</td>
                        <td className="p-3">
                          <Badge variant={campaign.status === 'sent' ? 'default' : campaign.status === 'draft' ? 'secondary' : 'outline'}
                            className="text-[10px]">
                            {campaign.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {campaign.send_time ? new Date(campaign.send_time).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="p-3 text-right tabular-nums">{formatNumber(campaign.metrics?.delivered || 0)}</td>
                        <td className="p-3 text-right tabular-nums">{((campaign.metrics?.open_rate || 0) * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">{((campaign.metrics?.click_rate || 0) * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(campaign.metrics?.revenue || 0)}</td>
                        <td className="p-3 text-right tabular-nums">{formatNumber(campaign.metrics?.conversions || 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {campaigns.filter(c => c.metrics).length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No hay campañas con métricas en este periodo
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flows Table */}
      {activeSection === 'flows' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Flujo</th>
                    <th className="text-left p-3 font-medium">Estado</th>
                    <th className="text-right p-3 font-medium">Enviados</th>
                    <th className="text-right p-3 font-medium">Open Rate</th>
                    <th className="text-right p-3 font-medium">Click Rate</th>
                    <th className="text-right p-3 font-medium">Ingresos</th>
                    <th className="text-right p-3 font-medium">Conversiones</th>
                  </tr>
                </thead>
                <tbody>
                  {flows
                    .filter(f => f.metrics)
                    .sort((a, b) => (b.metrics?.revenue || 0) - (a.metrics?.revenue || 0))
                    .map(flow => (
                      <tr key={flow.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-medium max-w-[200px] truncate">{flow.name}</td>
                        <td className="p-3">
                          <Badge
                            variant={flow.status === 'live' ? 'default' : flow.status === 'draft' ? 'secondary' : 'outline'}
                            className={cn('text-[10px]', flow.status === 'live' && 'bg-green-600')}
                          >
                            {flow.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums">{formatNumber(flow.metrics?.delivered || 0)}</td>
                        <td className="p-3 text-right tabular-nums">{((flow.metrics?.open_rate || 0) * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">{((flow.metrics?.click_rate || 0) * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(flow.metrics?.revenue || 0)}</td>
                        <td className="p-3 text-right tabular-nums">{formatNumber(flow.metrics?.conversions || 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {flows.filter(f => f.metrics).length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No hay flujos con métricas en este periodo
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send Time Heatmap */}
      {activeSection === 'horarios' && (
        <SendTimeHeatmap clientId={clientId} />
      )}
    </div>
  );
}
