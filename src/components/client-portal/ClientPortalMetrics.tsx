import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, DollarSign, ShoppingCart, Target } from 'lucide-react';
import { MetricsCharts } from './metrics/MetricsCharts';
import { TopSkusPanel, SkuData } from './metrics/TopSkusPanel';
import { AbandonedCartsPanel, AbandonedCart } from './metrics/AbandonedCartsPanel';
import { ConversionLtvPanel } from './metrics/ConversionLtvPanel';
import { MetricsDateFilter, DateRange } from './metrics/MetricsDateFilter';

interface ClientPortalMetricsProps {
  clientId: string;
}

interface MetricRow {
  metric_type: string;
  metric_value: number;
  metric_date: string;
}

interface MetricSummary {
  totalRevenue: number;
  totalSpend: number;
  totalOrders: number;
  avgRoas: number;
}

function getDateRangeStart(range: DateRange): Date {
  const now = new Date();
  switch (range) {
    case '7d':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case '30d':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    case '90d':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    case 'mtd':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  }
}

export function ClientPortalMetrics({ clientId }: ClientPortalMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [rawMetrics, setRawMetrics] = useState<MetricRow[]>([]);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);

  useEffect(() => {
    async function fetchMetrics() {
      setLoading(true);
      try {
        // Get connections for this client
        const { data: connections, error: connError } = await supabase
          .from('platform_connections')
          .select('id, platform')
          .eq('client_id', clientId);

        if (connError) throw connError;

        if (!connections || connections.length === 0) {
          setRawMetrics([]);
          setConnectionIds([]);
          setLoading(false);
          return;
        }

        const connIds = connections.map((c) => c.id);
        setConnectionIds(connIds);

        const startDate = getDateRangeStart(dateRange);

        const { data: metricsData, error: metricsError } = await supabase
          .from('platform_metrics')
          .select('metric_type, metric_value, metric_date')
          .in('connection_id', connIds)
          .gte('metric_date', startDate.toISOString().split('T')[0])
          .order('metric_date', { ascending: true });

        if (metricsError) throw metricsError;

        setRawMetrics(
          (metricsData ?? []).map((m) => ({
            metric_type: m.metric_type,
            metric_value: Number(m.metric_value),
            metric_date: m.metric_date,
          }))
        );
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, [clientId, dateRange]);

  // Compute aggregated metrics
  const metrics: MetricSummary = useMemo(() => {
    let totalRevenue = 0;
    let totalSpend = 0;
    let totalOrders = 0;
    const roasValues: number[] = [];

    rawMetrics.forEach((m) => {
      switch (m.metric_type) {
        case 'revenue':
        case 'purchase_value':
        case 'gross_revenue':
          totalRevenue += m.metric_value;
          break;
        case 'orders':
        case 'purchases':
        case 'orders_count':
          totalOrders += m.metric_value;
          break;
        case 'spend':
          totalSpend += m.metric_value;
          break;
        case 'roas':
          roasValues.push(m.metric_value);
          break;
      }
    });

    const avgRoas =
      roasValues.length > 0
        ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
        : totalSpend > 0
          ? totalRevenue / totalSpend
          : 0;

    return { totalRevenue, totalSpend, totalOrders, avgRoas };
  }, [rawMetrics]);

  // Chart data grouped by date
  const chartData = useMemo(() => {
    const byDate: Record<string, { revenue: number; orders: number }> = {};
    rawMetrics.forEach((m) => {
      if (!byDate[m.metric_date]) {
        byDate[m.metric_date] = { revenue: 0, orders: 0 };
      }
      if (['revenue', 'gross_revenue', 'purchase_value'].includes(m.metric_type)) {
        byDate[m.metric_date].revenue += m.metric_value;
      }
      if (['orders', 'orders_count', 'purchases'].includes(m.metric_type)) {
        byDate[m.metric_date].orders += m.metric_value;
      }
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }, [rawMetrics]);

  // Demo SKU data (would come from Shopify orders in production)
  const skuData: SkuData[] = useMemo(() => {
    // Generate realistic demo SKUs
    const demoSkus: SkuData[] = [
      { sku: 'TSH-BLK-M', name: 'Polera Negra Talla M', quantity: 245, revenue: 7350000 },
      { sku: 'JNS-AZL-32', name: 'Jeans Azul Talla 32', quantity: 189, revenue: 9450000 },
      { sku: 'ZPT-WHT-42', name: 'Zapatillas Blancas 42', quantity: 156, revenue: 11700000 },
      { sku: 'CHQ-GRS-L', name: 'Chaqueta Gris Talla L', quantity: 134, revenue: 13400000 },
      { sku: 'PLR-RJO-S', name: 'Polar Rojo Talla S', quantity: 98, revenue: 4900000 },
      { sku: 'CMS-NEG-M', name: 'Camisa Negra Talla M', quantity: 87, revenue: 3480000 },
      { sku: 'SHT-BLC-L', name: 'Short Blanco Talla L', quantity: 76, revenue: 1900000 },
      { sku: 'VES-VRD-M', name: 'Vestido Verde Talla M', quantity: 65, revenue: 3250000 },
    ];
    return demoSkus;
  }, []);

  // Demo abandoned carts
  const abandonedCarts: AbandonedCart[] = useMemo(() => {
    const now = new Date();
    return [
      {
        id: 'cart-1',
        customerEmail: 'maria.gonzalez@gmail.com',
        customerName: 'María González',
        totalValue: 89900,
        itemCount: 3,
        abandonedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        contacted: false,
      },
      {
        id: 'cart-2',
        customerEmail: 'carlos.perez@outlook.com',
        customerName: 'Carlos Pérez',
        totalValue: 156000,
        itemCount: 5,
        abandonedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
        contacted: true,
      },
      {
        id: 'cart-3',
        customerEmail: 'ana.martinez@yahoo.com',
        customerName: 'Ana Martínez',
        totalValue: 45000,
        itemCount: 2,
        abandonedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        contacted: false,
      },
      {
        id: 'cart-4',
        customerEmail: 'pedro.sanchez@gmail.com',
        customerName: 'Pedro Sánchez',
        totalValue: 234500,
        itemCount: 7,
        abandonedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
        contacted: true,
      },
      {
        id: 'cart-5',
        customerEmail: 'lucia.diaz@hotmail.com',
        customerName: 'Lucía Díaz',
        totalValue: 67800,
        itemCount: 4,
        abandonedAt: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(),
        contacted: false,
      },
    ];
  }, []);

  // Demo conversion/LTV metrics
  const conversionMetrics = useMemo(() => {
    const totalCustomers = Math.round(metrics.totalOrders * 0.85);
    return {
      conversionRate: 3.42,
      averageLtv: totalCustomers > 0 ? Math.round(metrics.totalRevenue / totalCustomers) : 0,
      totalCustomers,
      repeatCustomerRate: 28.5,
    };
  }, [metrics]);

  if (loading) {
    return (
      <div className="space-y-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[350px]" />
          <Skeleton className="h-[350px]" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Ingresos Totales',
      value: `$${metrics.totalRevenue.toLocaleString('es-CL')}`,
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'Inversión Publicitaria',
      value: `$${metrics.totalSpend.toLocaleString('es-CL')}`,
      icon: Target,
      color: 'text-blue-600',
    },
    {
      title: 'Pedidos',
      value: metrics.totalOrders.toLocaleString('es-CL'),
      icon: ShoppingCart,
      color: 'text-purple-600',
    },
    {
      title: 'ROAS Promedio',
      value: `${metrics.avgRoas.toFixed(2)}x`,
      icon: TrendingUp,
      color: 'text-orange-600',
    },
  ];

  const hasData = metrics.totalRevenue > 0 || metrics.totalSpend > 0 || metrics.totalOrders > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Resumen de Rendimiento</h2>
          <p className="text-muted-foreground text-sm">Dashboard integrado de métricas</p>
        </div>
        <MetricsDateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI Cards */}
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

      {hasData ? (
        <>
          {/* Charts */}
          <MetricsCharts revenueData={chartData} currency="CLP" />

          {/* Conversion & LTV */}
          <ConversionLtvPanel
            conversionRate={conversionMetrics.conversionRate}
            averageLtv={conversionMetrics.averageLtv}
            totalCustomers={conversionMetrics.totalCustomers}
            repeatCustomerRate={conversionMetrics.repeatCustomerRate}
            currency="CLP"
          />

          {/* SKUs & Abandoned Carts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopSkusPanel skus={skuData} currency="CLP" />
            <AbandonedCartsPanel carts={abandonedCarts} currency="CLP" />
          </div>
        </>
      ) : (
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
