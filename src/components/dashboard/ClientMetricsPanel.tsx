import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, ShoppingCart, DollarSign, Calendar, BarChart3, Megaphone, Target, Eye, Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, startOfYear, subDays, subMonths, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';

interface MetricData {
  metric_date: string;
  metric_type: string;
  metric_value: number;
  connection_id: string;
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
  shop_domain: string | null;
  is_active: boolean;
}

type DatePreset = 'last7days' | 'mtd' | 'last_month' | 'ytd';

const formatCLP = (value: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const formatNum = (value: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(value);

function getDateRange(preset: DatePreset) {
  const today = new Date();
  switch (preset) {
    case 'last7days': return { from: subDays(today, 7), to: today };
    case 'mtd': return { from: startOfMonth(today), to: today };
    case 'last_month': { const lm = subMonths(today, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
    case 'ytd': return { from: startOfYear(today), to: today };
  }
}

function KpiCard({ label, value, sub, icon: Icon, highlight }: {
  label: string; value: string; sub?: string; icon: any; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary/20 bg-primary/5' : ''}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className={`w-4 h-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div className={`text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function ClientMetricsPanel() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('mtd');

  // Load clients
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('clients').select('id, name, company').order('name');
      if (data && data.length > 0) {
        setClients(data);
        setSelectedClientId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  // Load connections + metrics when client or date changes
  useEffect(() => {
    if (!selectedClientId) return;
    (async () => {
      setMetricsLoading(true);

      // Get all connections for this client
      const { data: conns } = await supabase
        .from('platform_connections')
        .select('id, client_id, platform, shop_domain, is_active')
        .eq('client_id', selectedClientId)
        .eq('is_active', true);

      setConnections(conns || []);

      if (!conns || conns.length === 0) {
        setMetrics([]);
        setMetricsLoading(false);
        return;
      }

      const connIds = conns.map(c => c.id);
      const { from, to } = getDateRange(datePreset);

      const { data: metricsData } = await supabase
        .from('platform_metrics')
        .select('metric_date, metric_type, metric_value, connection_id')
        .in('connection_id', connIds)
        .gte('metric_date', format(from, 'yyyy-MM-dd'))
        .lte('metric_date', format(to, 'yyyy-MM-dd'))
        .order('metric_date', { ascending: true });

      setMetrics(metricsData || []);
      setMetricsLoading(false);
    })();
  }, [selectedClientId, datePreset]);

  // Connection maps
  const shopifyConnId = connections.find(c => c.platform === 'shopify')?.id;
  const metaConnId = connections.find(c => c.platform === 'meta')?.id;

  // Aggregate metrics
  const agg = useMemo(() => {
    const sum = (connId: string | undefined, type: string) =>
      metrics.filter(m => m.connection_id === connId && m.metric_type === type)
        .reduce((s, m) => s + m.metric_value, 0);

    const avg = (connId: string | undefined, type: string) => {
      const items = metrics.filter(m => m.connection_id === connId && m.metric_type === type);
      if (items.length === 0) return 0;
      return items.reduce((s, m) => s + m.metric_value, 0) / items.length;
    };

    const shopRevenue = sum(shopifyConnId, 'revenue');
    const shopOrders = sum(shopifyConnId, 'orders');
    const metaSpend = sum(metaConnId, 'ad_spend');
    const metaPurchases = sum(metaConnId, 'purchases');
    const metaPurchaseValue = sum(metaConnId, 'purchase_value');
    const metaImpressions = sum(metaConnId, 'impressions');
    const metaRoas = metaSpend > 0 ? metaPurchaseValue / metaSpend : 0;
    const metaCpp = metaPurchases > 0 ? metaSpend / metaPurchases : 0;
    const metaCpm = metaImpressions > 0 ? (metaSpend / metaImpressions) * 1000 : 0;

    return {
      shopRevenue, shopOrders,
      shopAvgTicket: shopOrders > 0 ? shopRevenue / shopOrders : 0,
      metaSpend, metaPurchases, metaPurchaseValue,
      metaImpressions, metaRoas, metaCpp, metaCpm,
    };
  }, [metrics, shopifyConnId, metaConnId]);

  // Chart data: daily revenue + ad spend
  const chartData = useMemo(() => {
    const grouped: Record<string, { date: string; revenue: number; adSpend: number; orders: number; purchases: number }> = {};

    metrics.forEach(m => {
      if (!grouped[m.metric_date]) {
        grouped[m.metric_date] = { date: m.metric_date, revenue: 0, adSpend: 0, orders: 0, purchases: 0 };
      }
      if (m.connection_id === shopifyConnId) {
        if (m.metric_type === 'revenue') grouped[m.metric_date].revenue = m.metric_value;
        if (m.metric_type === 'orders') grouped[m.metric_date].orders = m.metric_value;
      }
      if (m.connection_id === metaConnId) {
        if (m.metric_type === 'ad_spend') grouped[m.metric_date].adSpend = m.metric_value;
        if (m.metric_type === 'purchases') grouped[m.metric_date].purchases = m.metric_value;
      }
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [metrics, shopifyConnId, metaConnId]);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const platformBadges = connections.map(c => c.platform);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
        <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No hay clientes con conexiones activas</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">Métricas por Cliente</h2>
          <p className="text-sm text-muted-foreground">Resultados reales de todas las plataformas</p>
        </div>
        <div className="flex gap-3">
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={datePreset} onValueChange={(v: DatePreset) => setDatePreset(v)}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last7days">Últimos 7 días</SelectItem>
              <SelectItem value="mtd">Mes actual</SelectItem>
              <SelectItem value="last_month">Mes anterior</SelectItem>
              <SelectItem value="ytd">Año completo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Client + platforms */}
      {selectedClient && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-sm">{selectedClient.name}</Badge>
          {selectedClient.company && <Badge variant="secondary" className="text-sm">{selectedClient.company}</Badge>}
          {platformBadges.map(p => (
            <Badge key={p} className="text-xs capitalize bg-slate-100 text-slate-700">{p}</Badge>
          ))}
        </div>
      )}

      {metricsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : connections.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Este cliente no tiene plataformas conectadas</CardContent></Card>
      ) : (
        <>
          {/* Shopify KPIs */}
          {shopifyConnId && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Shopify
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiCard label="Ventas" value={formatCLP(agg.shopRevenue)} icon={DollarSign} highlight />
                <KpiCard label="Órdenes" value={formatNum(agg.shopOrders)} icon={ShoppingCart} />
                <KpiCard label="Ticket Promedio" value={formatCLP(agg.shopAvgTicket)} icon={BarChart3} />
              </div>
            </div>
          )}

          {/* Meta KPIs */}
          {metaConnId && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Megaphone className="w-4 h-4" /> Meta Ads
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KpiCard label="Gasto Ads" value={formatCLP(agg.metaSpend)} icon={DollarSign} />
                <KpiCard label="Compras Meta" value={formatNum(agg.metaPurchases)} icon={ShoppingCart} />
                <KpiCard label="Valor Compras" value={formatCLP(agg.metaPurchaseValue)} icon={TrendingUp} highlight />
                <KpiCard label="ROAS" value={`${agg.metaRoas.toFixed(2)}x`} sub={agg.metaRoas >= 3 ? 'Buen rendimiento' : agg.metaRoas >= 1 ? 'Rentable' : 'Bajo'} icon={Target} highlight={agg.metaRoas >= 3} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
                <KpiCard label="Costo por Compra" value={formatCLP(agg.metaCpp)} icon={DollarSign} />
                <KpiCard label="CPM" value={formatCLP(agg.metaCpm)} icon={Eye} />
                <KpiCard label="Impresiones" value={formatNum(agg.metaImpressions)} icon={Eye} />
              </div>
            </div>
          )}

          {/* Charts */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue vs Ad Spend */}
              <Card>
                <CardHeader><CardTitle className="text-base">Ventas vs Gasto Ads (diario)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={d => { try { return format(new Date(d + 'T12:00:00'), 'dd/MM'); } catch { return d; } }} className="text-xs" />
                        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                        <Tooltip
                          formatter={(value: number, name: string) => [formatCLP(value), name === 'revenue' ? 'Ventas' : 'Gasto Ads']}
                          labelFormatter={l => { try { return format(new Date(l + 'T12:00:00'), 'dd MMMM', { locale: es }); } catch { return l; } }}
                        />
                        {shopifyConnId && <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} name="revenue" dot={false} />}
                        {metaConnId && <Line type="monotone" dataKey="adSpend" stroke="#dc2626" strokeWidth={2} name="adSpend" dot={false} strokeDasharray="5 5" />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-2 justify-center text-xs text-muted-foreground">
                    {shopifyConnId && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-600 inline-block" /> Ventas</span>}
                    {metaConnId && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-600 inline-block border-dashed" /> Gasto Ads</span>}
                  </div>
                </CardContent>
              </Card>

              {/* Orders + Purchases */}
              <Card>
                <CardHeader><CardTitle className="text-base">Órdenes y Compras Meta (diario)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tickFormatter={d => { try { return format(new Date(d + 'T12:00:00'), 'dd/MM'); } catch { return d; } }} className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip
                          formatter={(value: number, name: string) => [formatNum(value), name === 'orders' ? 'Órdenes Shopify' : 'Compras Meta']}
                          labelFormatter={l => { try { return format(new Date(l + 'T12:00:00'), 'dd MMMM', { locale: es }); } catch { return l; } }}
                        />
                        {shopifyConnId && <Bar dataKey="orders" fill="#16a34a" radius={[4, 4, 0, 0]} name="orders" />}
                        {metaConnId && <Bar dataKey="purchases" fill="#3b82f6" radius={[4, 4, 0, 0]} name="purchases" />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-2 justify-center text-xs text-muted-foreground">
                    {shopifyConnId && <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-600 rounded-sm inline-block" /> Órdenes Shopify</span>}
                    {metaConnId && <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm inline-block" /> Compras Meta</span>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {chartData.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay datos para el período seleccionado</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
