import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { DollarSign, ShoppingCart, TrendingUp, Package } from 'lucide-react';

interface RevenueAttributionPanelProps {
  campaignId: string;
  clientId: string;
}

interface RevenueData {
  total_revenue: number;
  total_orders: number;
  aov: number;
  conversion_rate: number;
  conversions_by_day: Array<{ date: string; revenue: number; orders: number }>;
  top_products: Array<{ title: string; quantity: number; revenue: number }>;
  total_sent: number;
  attribution_window_days: number;
}

function formatCLP(value: number): string {
  return '$' + value.toLocaleString('es-CL');
}

function formatDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

export function RevenueAttributionPanel({ campaignId, clientId }: RevenueAttributionPanelProps) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: apiErr } = await callApi<RevenueData>('email-revenue-attribution', {
        body: { action: 'campaign_revenue', client_id: clientId, campaign_id: campaignId },
      });
      if (apiErr) {
        setError(apiErr);
        toast.error(apiErr);
        return;
      }
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId, clientId]);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-4">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <p>No se pudo cargar la atribucion de ingresos.</p>
          <p className="text-sm mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const revenueValues = data.conversions_by_day.map(d => d.revenue);
  const maxRevenue = revenueValues.length > 0 ? Math.max(...revenueValues, 1) : 1;

  const kpis = [
    {
      label: 'Ingresos Totales',
      value: formatCLP(data.total_revenue),
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Pedidos',
      value: data.total_orders.toLocaleString('es-CL'),
      icon: ShoppingCart,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Ticket Promedio',
      value: formatCLP(data.aov),
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Tasa de Conversion',
      value: `${data.conversion_rate}%`,
      icon: Package,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      subtitle: `${data.total_orders} de ${data.total_sent} enviados`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-emerald-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${kpi.bgColor}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
              {kpi.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue by Day Chart */}
      {data.conversions_by_day.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ingresos por Dia
            </CardTitle>
            <Badge variant="outline" className="w-fit text-xs text-emerald-600 border-emerald-200">
              Ventana de atribucion: {data.attribution_window_days} dias
            </Badge>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-end gap-2 h-40">
              {data.conversions_by_day.map((day) => {
                const heightPct = Math.max((day.revenue / maxRevenue) * 100, 4);
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                  >
                    <span className="text-[10px] text-muted-foreground font-medium truncate w-full text-center">
                      {formatCLP(day.revenue)}
                    </span>
                    <div
                      className="w-full bg-emerald-500 rounded-t-md transition-all hover:bg-emerald-400 cursor-default min-h-[4px]"
                      style={{ height: `${heightPct}%` }}
                      title={`${formatDate(day.date)}: ${formatCLP(day.revenue)} (${day.orders} pedidos)`}
                    />
                    <span className="text-[10px] text-muted-foreground">{formatDate(day.date)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Products Table */}
      {data.top_products.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Productos con Mayor Conversion
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Producto</th>
                    <th className="pb-2 font-medium text-right">Cantidad</th>
                    <th className="pb-2 font-medium text-right">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((product, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono w-5">
                            {idx + 1}.
                          </span>
                          <span className="truncate max-w-[250px]" title={product.title}>
                            {product.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <Badge variant="secondary" className="text-xs">
                          {product.quantity}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-medium text-emerald-600 tabular-nums">
                        {formatCLP(product.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data.total_orders === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin conversiones atribuidas</p>
            <p className="text-sm mt-1">
              No se encontraron pedidos de Shopify atribuibles a esta campana
              dentro de la ventana de {data.attribution_window_days} dias.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
