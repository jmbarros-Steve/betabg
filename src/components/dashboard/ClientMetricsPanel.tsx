import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  ShoppingCart, 
  Truck, 
  DollarSign, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, subDays, subMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

interface MetricData {
  metric_date: string;
  metric_type: string;
  metric_value: number;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface Connection {
  id: string;
  client_id: string;
  platform: string;
  store_name: string | null;
  clients?: Client;
}

type DateRangePreset = 'today' | 'yesterday' | 'last7days' | 'mtd' | 'last_month' | 'ytd' | 'custom';

const IVA_FACTOR = 1.19;

const formatCLP = (value: number) => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('es-CL').format(Math.round(value));
};

export function ClientMetricsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangePreset>('mtd');
  const [customDateRange, setCustomDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });

  // Calculate date range based on preset
  const getDateRange = useMemo(() => {
    const today = new Date();
    
    switch (dateRange) {
      case 'today':
        return { from: today, to: today };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { from: yesterday, to: yesterday };
      case 'last7days':
        return { from: subDays(today, 7), to: today };
      case 'mtd':
        return { from: startOfMonth(today), to: today };
      case 'last_month':
        const lastMonth = subMonths(today, 1);
        return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
      case 'ytd':
        return { from: startOfYear(today), to: today };
      case 'custom':
        return { 
          from: customDateRange.from || startOfMonth(today), 
          to: customDateRange.to || today 
        };
      default:
        return { from: startOfMonth(today), to: today };
    }
  }, [dateRange, customDateRange]);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchMetrics();
    }
  }, [selectedConnection, getDateRange]);

  const fetchConnections = async () => {
    const { data, error } = await supabase
      .from('platform_connections')
      .select('id, client_id, platform, store_name, clients(id, name, company)')
      .eq('platform', 'shopify')
      .eq('is_active', true);

    if (!error && data) {
      setConnections(data);
      if (data.length > 0) {
        setSelectedConnection(data[0].id);
      }
    }
    setLoading(false);
  };

  const fetchMetrics = async () => {
    if (!selectedConnection) return;
    
    const { from, to } = getDateRange;
    
    const { data, error } = await supabase
      .from('platform_metrics')
      .select('metric_date, metric_type, metric_value')
      .eq('connection_id', selectedConnection)
      .gte('metric_date', format(from, 'yyyy-MM-dd'))
      .lte('metric_date', format(to, 'yyyy-MM-dd'))
      .order('metric_date', { ascending: true });

    if (!error) {
      setMetrics(data || []);
    }
  };

  // Calculate aggregated metrics
  const aggregatedMetrics = useMemo(() => {
    const grossRevenue = metrics
      .filter(m => m.metric_type === 'gross_revenue')
      .reduce((sum, m) => sum + m.metric_value, 0);
    
    const ordersCount = metrics
      .filter(m => m.metric_type === 'orders_count')
      .reduce((sum, m) => sum + m.metric_value, 0);
    
    const shippingRevenue = metrics
      .filter(m => m.metric_type === 'shipping_revenue')
      .reduce((sum, m) => sum + m.metric_value, 0);

    // Net sales (without IVA)
    const netSales = grossRevenue / IVA_FACTOR;
    
    // Average ticket (gross)
    const avgTicket = ordersCount > 0 ? grossRevenue / ordersCount : 0;
    
    // Average shipping per order
    const avgShipping = ordersCount > 0 ? shippingRevenue / ordersCount : 0;
    
    // Net sales without shipping
    const netSalesWithoutShipping = (grossRevenue - shippingRevenue) / IVA_FACTOR;
    
    // Net average ticket without shipping
    const netAvgTicketWithoutShipping = ordersCount > 0 
      ? netSalesWithoutShipping / ordersCount 
      : 0;

    return {
      grossRevenue,
      netSales,
      ordersCount,
      shippingRevenue,
      avgTicket,
      avgShipping,
      netSalesWithoutShipping,
      netAvgTicketWithoutShipping,
    };
  }, [metrics]);

  // Prepare chart data
  const chartData = useMemo(() => {
    const grouped: Record<string, { date: string; revenue: number; orders: number }> = {};
    
    metrics.forEach(m => {
      if (!grouped[m.metric_date]) {
        grouped[m.metric_date] = { date: m.metric_date, revenue: 0, orders: 0 };
      }
      if (m.metric_type === 'gross_revenue') {
        grouped[m.metric_date].revenue = m.metric_value / IVA_FACTOR; // Net
      }
      if (m.metric_type === 'orders_count') {
        grouped[m.metric_date].orders = m.metric_value;
      }
    });
    
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics]);

  const selectedClient = connections.find(c => c.id === selectedConnection)?.clients;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-32 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
        <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No hay conexiones de Shopify activas</p>
        <p className="text-sm text-muted-foreground mt-1">
          Agrega una conexión en la pestaña "Plataformas" para ver métricas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-xl font-medium">Métricas de Rendimiento</h2>
          <p className="text-sm text-muted-foreground">
            Análisis de ventas y rendimiento de Shopify
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {/* Client/Connection selector */}
          <Select value={selectedConnection} onValueChange={setSelectedConnection}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((conn) => (
                <SelectItem key={conn.id} value={conn.id}>
                  {conn.clients?.name || conn.store_name || 'Sin nombre'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range selector */}
          <Select value={dateRange} onValueChange={(v: DateRangePreset) => setDateRange(v)}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="yesterday">Ayer</SelectItem>
              <SelectItem value="last7days">Últimos 7 días</SelectItem>
              <SelectItem value="mtd">Mes hasta hoy</SelectItem>
              <SelectItem value="last_month">Mes anterior</SelectItem>
              <SelectItem value="ytd">Año hasta hoy</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom date picker */}
          {dateRange === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  {customDateRange.from && customDateRange.to
                    ? `${format(customDateRange.from, 'dd/MM/yy')} - ${format(customDateRange.to, 'dd/MM/yy')}`
                    : 'Seleccionar fechas'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarComponent
                  mode="range"
                  selected={{ from: customDateRange.from, to: customDateRange.to }}
                  onSelect={(range) => setCustomDateRange({ from: range?.from, to: range?.to })}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Client badge */}
      {selectedClient && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {selectedClient.name}
          </Badge>
          {selectedClient.company && (
            <Badge variant="secondary" className="text-sm">
              {selectedClient.company}
            </Badge>
          )}
          <Badge className="bg-green-500/10 text-green-600 text-sm">
            Shopify
          </Badge>
        </div>
      )}

      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ventas Brutas
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCLP(aggregatedMetrics.grossRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Con IVA incluido</p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ventas Netas
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCLP(aggregatedMetrics.netSales)}</div>
            <p className="text-xs text-muted-foreground mt-1">Sin IVA (÷ 1.19)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Órdenes
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(aggregatedMetrics.ordersCount)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total de pedidos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Promedio
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCLP(aggregatedMetrics.avgTicket)}</div>
            <p className="text-xs text-muted-foreground mt-1">Venta bruta / Órdenes</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ingresos por Despacho
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCLP(aggregatedMetrics.shippingRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total cobrado por envíos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Despacho Promedio
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCLP(aggregatedMetrics.avgShipping)}</div>
            <p className="text-xs text-muted-foreground mt-1">Por orden</p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Venta Neta sin Despacho
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCLP(aggregatedMetrics.netSalesWithoutShipping)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Solo productos, sin IVA</p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Neto sin Despacho
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCLP(aggregatedMetrics.netAvgTicketWithoutShipping)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Promedio por orden</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas Netas por Día</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(d) => format(parseISO(d), 'dd/MM', { locale: es })}
                      className="text-xs"
                    />
                    <YAxis 
                      tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                      className="text-xs"
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatCLP(value), 'Ventas Netas']}
                      labelFormatter={(label) => format(parseISO(label), 'dd MMMM yyyy', { locale: es })}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Orders Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Órdenes por Día</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(d) => format(parseISO(d), 'dd/MM', { locale: es })}
                      className="text-xs"
                    />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => [formatNumber(value), 'Órdenes']}
                      labelFormatter={(label) => format(parseISO(label), 'dd MMMM yyyy', { locale: es })}
                    />
                    <Bar 
                      dataKey="orders" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No data message */}
      {chartData.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay datos para el período seleccionado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Intenta seleccionar un rango de fechas diferente
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
