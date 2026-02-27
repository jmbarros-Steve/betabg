import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  Users,
  Mail,
  XCircle,
} from 'lucide-react';
import { KlaviyoMetricsPanel } from '@/components/client-portal/KlaviyoMetricsPanel';

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
      message: `Tu open rate (${openRatePct}%) esta por debajo del promedio. Prueba subjects mas cortos y personalizados.`,
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
      title: 'Revenue por Email',
      message: `Has generado $${Math.round(globalStats.totalRevenue).toLocaleString('es-CL')} en los ultimos 30 dias via email.`,
      icon: 'trending_up',
    });
  } else {
    insights.push({
      type: 'warning',
      title: 'Sin Revenue por Email',
      message: 'Sin revenue por email aun. Activa flujos de abandoned cart y post-purchase.',
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

export function MetricsInsights({ clientId }: MetricsInsightsProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState(false);
  const [metricsLoaded, setMetricsLoaded] = useState(false);

  useEffect(() => {
    checkConnection();
  }, [clientId]);

  useEffect(() => {
    if (connectionId) {
      fetchAndAnalyze();
    }
  }, [connectionId]);

  const checkConnection = async () => {
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'klaviyo')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data) {
      setConnectionId(data.id);
      setHasConnection(true);
    }
  };

  const fetchAndAnalyze = async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'sync-klaviyo-metrics',
        {
          body: { connectionId, timeframe: 'last_30_days' },
        }
      );

      if (error) {
        console.error('Error fetching metrics for insights:', error);
        return;
      }

      if (data?.globalStats) {
        const generated = generateInsights(
          data.globalStats as GlobalStats,
          (data.campaigns || []) as KlaviyoCampaign[]
        );
        setInsights(generated);
        setMetricsLoaded(true);
      }
    } catch (err: any) {
      console.error('Error generating insights:', err);
      toast.error('Error al generar insights');
    } finally {
      setLoading(false);
    }
  };

  if (!hasConnection) {
    return <KlaviyoMetricsPanel clientId={clientId} />;
  }

  return (
    <div className="space-y-6">
      {/* AI Insights Section */}
      {loading ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-sm font-medium text-muted-foreground">
              Steve esta analizando tus metricas...
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : insights.length > 0 ? (
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
      ) : null}

      {/* Klaviyo Metrics Panel */}
      <KlaviyoMetricsPanel clientId={clientId} />
    </div>
  );
}
