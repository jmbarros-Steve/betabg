import { useState, useEffect } from 'react';
import { Package, RefreshCw, ExternalLink, Search, Truck, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { callApi } from '@/lib/api';

interface Order {
  id: number;
  order_number?: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status?: string;
  customer: { first_name?: string; last_name?: string; email?: string } | null;
  line_items: Array<{ title: string; quantity: number; price: string }>;
  source_name: string;
  fulfillments?: Array<{
    id: number;
    status: string;
    created_at: string;
    tracking_number?: string | null;
    tracking_url?: string | null;
  }>;
}

interface FulfillmentMetrics {
  avgFulfillmentHours: number;
  pendingCount: number;
  overdueCount: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  refunded: { label: 'Reembolsado', color: 'bg-red-100 text-red-700' },
  partially_refunded: { label: 'Reembolso parcial', color: 'bg-orange-100 text-orange-700' },
  voided: { label: 'Anulado', color: 'bg-slate-100 text-slate-600' },
  authorized: { label: 'Autorizado', color: 'bg-blue-100 text-blue-700' },
};

const FULFILLMENT_LABELS: Record<string, { label: string; color: string }> = {
  fulfilled: { label: 'Enviado', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Parcial', color: 'bg-blue-100 text-blue-700' },
  unfulfilled: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  restocked: { label: 'Restocked', color: 'bg-slate-100 text-slate-600' },
};

function formatCLP(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface ShopifyOrdersPanelProps {
  clientId: string;
  fulfillmentMetrics?: FulfillmentMetrics | null;
}

export function ShopifyOrdersPanel({ clientId, fulfillmentMetrics }: ShopifyOrdersPanelProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) fetchOrders();
  }, [clientId]);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    const { data, error: apiError } = await callApi<any>('fetch-shopify-analytics', {
      body: { client_id: clientId, days_back: 30 },
    });

    if (apiError) {
      setError(apiError);
      setLoading(false);
      return;
    }

    const rawOrders = data?.rawOrders || data?.orders || [];
    setOrders(rawOrders);
    setLoading(false);
  }

  useEffect(() => {
    if (!loading && orders.length === 0 && !error) {
      fetchOrdersDirect();
    }
  }, [loading, orders.length]);

  async function fetchOrdersDirect() {
    setLoading(true);
    const { data, error: apiError } = await callApi<any>('fetch-shopify-analytics', {
      body: { client_id: clientId, days_back: 30, include_orders: true },
    });
    if (!apiError && data?.rawOrders) {
      setOrders(data.rawOrders);
    }
    setLoading(false);
  }

  const filtered = orders.filter((o) => {
    if (statusFilter !== 'all' && o.financial_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const customerName = `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.toLowerCase();
      const email = (o.customer?.email || '').toLowerCase();
      const items = o.line_items.map((i) => i.title).join(' ').toLowerCase();
      if (!customerName.includes(q) && !email.includes(q) && !items.includes(q) && !String(o.order_number || o.id).includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totalRevenue = filtered.reduce((s, o) => s + Number(o.total_price || 0), 0);

  // F7: Fulfillment data
  const pendingOrders = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled');
  const overdueOrders = pendingOrders.filter(o => {
    const age = (Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return age > 3;
  });
  const fulfilledOrders = orders.filter(o => o.fulfillment_status === 'fulfilled');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-red-500 text-sm">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchOrders}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{orders.length}</div>
            <p className="text-xs text-muted-foreground">Pedidos (30 días)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{formatCLP(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">Ingresos filtrados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {orders.length > 0 ? formatCLP(totalRevenue / filtered.length) : '$0'}
            </div>
            <p className="text-xs text-muted-foreground">Ticket promedio</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Pedidos | Envíos (F7) */}
      <Card>
        <Tabs defaultValue="orders">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <TabsList>
                <TabsTrigger value="orders" className="flex items-center gap-1">
                  <Package className="w-4 h-4" /> Pedidos ({filtered.length})
                </TabsTrigger>
                <TabsTrigger value="fulfillment" className="flex items-center gap-1">
                  <Truck className="w-4 h-4" /> Envíos
                  {pendingOrders.length > 0 && (
                    <Badge variant="destructive" className="ml-1 text-[10px] px-1">{pendingOrders.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente, email, producto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 w-[220px]"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pagado</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="refunded">Reembolsado</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={fetchOrders}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          {/* Tab: Pedidos */}
          <TabsContent value="orders">
            <CardContent>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin pedidos en este período</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3">#</th>
                        <th className="pb-2 pr-3">Fecha</th>
                        <th className="pb-2 pr-3">Cliente</th>
                        <th className="pb-2 pr-3">Productos</th>
                        <th className="pb-2 pr-3">Total</th>
                        <th className="pb-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((o) => {
                        const status = STATUS_LABELS[o.financial_status] || { label: o.financial_status, color: '' };
                        const customerName = o.customer
                          ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim()
                          : 'Sin nombre';
                        return (
                          <tr key={o.id} className="border-b last:border-0">
                            <td className="py-2 pr-3 text-xs text-muted-foreground">#{o.order_number || o.id}</td>
                            <td className="py-2 pr-3 text-xs whitespace-nowrap">{formatDate(o.created_at)}</td>
                            <td className="py-2 pr-3">
                              <div className="font-medium text-sm truncate max-w-[150px]">{customerName}</div>
                              {o.customer?.email && (
                                <div className="text-xs text-muted-foreground truncate max-w-[150px]">{o.customer.email}</div>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-xs max-w-[200px]">
                              {o.line_items.slice(0, 2).map((item, i) => (
                                <div key={i} className="truncate">{item.quantity}x {item.title}</div>
                              ))}
                              {o.line_items.length > 2 && (
                                <span className="text-muted-foreground">+{o.line_items.length - 2} más</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-medium whitespace-nowrap">{formatCLP(Number(o.total_price))}</td>
                            <td className="py-2">
                              <Badge className={`text-xs ${status.color}`}>{status.label}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </TabsContent>

          {/* Tab: Envíos (F7) */}
          <TabsContent value="fulfillment">
            <CardContent>
              {/* Fulfillment KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3 rounded-lg border bg-muted/30 text-center">
                  <Clock className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                  <p className="text-lg font-bold">
                    {fulfillmentMetrics?.avgFulfillmentHours
                      ? `${Math.round(fulfillmentMetrics.avgFulfillmentHours)}h`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Tiempo prom. envío</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30 text-center">
                  <Package className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
                  <p className="text-lg font-bold">{pendingOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Pendientes de envío</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30 text-center">
                  <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-red-500" />
                  <p className="text-lg font-bold text-red-600">{overdueOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Atrasados (&gt;3 días)</p>
                </div>
              </div>

              {/* Fulfillment orders table */}
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin pedidos</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3">#</th>
                        <th className="pb-2 pr-3">Fecha</th>
                        <th className="pb-2 pr-3">Cliente</th>
                        <th className="pb-2 pr-3">Total</th>
                        <th className="pb-2 pr-3">Estado Envío</th>
                        <th className="pb-2">Tracking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders
                        .sort((a, b) => {
                          // Show unfulfilled first, then by date
                          const aUnfulfilled = !a.fulfillment_status || a.fulfillment_status === 'unfulfilled';
                          const bUnfulfilled = !b.fulfillment_status || b.fulfillment_status === 'unfulfilled';
                          if (aUnfulfilled && !bUnfulfilled) return -1;
                          if (!aUnfulfilled && bUnfulfilled) return 1;
                          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                        })
                        .map((o) => {
                          const fStatus = o.fulfillment_status || 'unfulfilled';
                          const fLabel = FULFILLMENT_LABELS[fStatus] || { label: fStatus, color: '' };
                          const customerName = o.customer
                            ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim()
                            : 'Sin nombre';
                          const latestFulfillment = o.fulfillments?.length ? o.fulfillments[o.fulfillments.length - 1] : null;
                          const isOverdue = fStatus === 'unfulfilled' &&
                            (Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24) > 3;

                          return (
                            <tr key={o.id} className={`border-b last:border-0 ${isOverdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
                              <td className="py-2 pr-3 text-xs text-muted-foreground">#{o.order_number || o.id}</td>
                              <td className="py-2 pr-3 text-xs whitespace-nowrap">{formatDate(o.created_at)}</td>
                              <td className="py-2 pr-3">
                                <div className="font-medium text-sm truncate max-w-[150px]">{customerName}</div>
                              </td>
                              <td className="py-2 pr-3 font-medium whitespace-nowrap">{formatCLP(Number(o.total_price))}</td>
                              <td className="py-2 pr-3">
                                <Badge className={`text-xs ${fLabel.color}`}>
                                  {fLabel.label}
                                </Badge>
                                {isOverdue && (
                                  <Badge variant="destructive" className="text-[10px] ml-1">Atrasado</Badge>
                                )}
                              </td>
                              <td className="py-2">
                                {latestFulfillment?.tracking_number ? (
                                  latestFulfillment.tracking_url ? (
                                    <a
                                      href={latestFulfillment.tracking_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-primary hover:underline flex items-center gap-1"
                                    >
                                      {latestFulfillment.tracking_number}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-xs font-mono">{latestFulfillment.tracking_number}</span>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
