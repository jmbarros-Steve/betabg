import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, DollarSign, ShoppingCart, Target } from 'lucide-react';

interface ClientPortalMetricsProps {
  clientId: string;
}

interface MetricSummary {
  totalRevenue: number;
  totalSpend: number;
  totalOrders: number;
  avgRoas: number;
}

export function ClientPortalMetrics({ clientId }: ClientPortalMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricSummary | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        // Get connections for this client
        const { data: connections, error: connError } = await supabase
          .from('platform_connections')
          .select('id, platform')
          .eq('client_id', clientId);

        if (connError) throw connError;

        if (!connections || connections.length === 0) {
          setMetrics({ totalRevenue: 0, totalSpend: 0, totalOrders: 0, avgRoas: 0 });
          setLoading(false);
          return;
        }

        const connectionIds = connections.map(c => c.id);

        // Get metrics for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: metricsData, error: metricsError } = await supabase
          .from('platform_metrics')
          .select('metric_type, metric_value')
          .in('connection_id', connectionIds)
          .gte('metric_date', thirtyDaysAgo.toISOString().split('T')[0]);

        if (metricsError) throw metricsError;

        // Aggregate metrics
        let totalRevenue = 0;
        let totalSpend = 0;
        let totalOrders = 0;
        let roasValues: number[] = [];

        metricsData?.forEach(m => {
          switch (m.metric_type) {
            case 'revenue':
            case 'purchase_value':
            case 'gross_revenue':
              totalRevenue += Number(m.metric_value);
              break;
            case 'orders':
            case 'purchases':
            case 'orders_count':
              totalOrders += Number(m.metric_value);
              break;
            case 'spend':
              totalSpend += Number(m.metric_value);
              break;
            case 'roas':
              roasValues.push(Number(m.metric_value));
              break;
          }
        });

        const avgRoas = roasValues.length > 0 
          ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length 
          : totalSpend > 0 ? totalRevenue / totalSpend : 0;

        setMetrics({ totalRevenue, totalSpend, totalOrders, avgRoas });
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [clientId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Ingresos Totales',
      value: `$${metrics?.totalRevenue.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || '0'}`,
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'Inversión Publicitaria',
      value: `$${metrics?.totalSpend.toLocaleString('es-AR', { minimumFractionDigits: 2 }) || '0'}`,
      icon: Target,
      color: 'text-blue-600',
    },
    {
      title: 'Pedidos',
      value: metrics?.totalOrders.toLocaleString('es-AR') || '0',
      icon: ShoppingCart,
      color: 'text-purple-600',
    },
    {
      title: 'ROAS Promedio',
      value: `${metrics?.avgRoas.toFixed(2) || '0'}x`,
      icon: TrendingUp,
      color: 'text-orange-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Resumen de Rendimiento</h2>
        <p className="text-muted-foreground">Últimos 30 días</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <Card key={stat.title} className="glow-box">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {metrics?.totalRevenue === 0 && metrics?.totalSpend === 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No hay métricas disponibles. Conecta tus plataformas para ver tus datos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
