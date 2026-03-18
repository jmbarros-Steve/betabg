import { useState, useEffect } from 'react';
import { Package, RefreshCw, ExternalLink, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';

interface Order {
  id: number;
  order_number?: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  customer: { first_name?: string; last_name?: string; email?: string } | null;
  line_items: Array<{ title: string; quantity: number; price: string }>;
  source_name: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  refunded: { label: 'Reembolsado', color: 'bg-red-100 text-red-700' },
  partially_refunded: { label: 'Reembolso parcial', color: 'bg-orange-100 text-orange-700' },
  voided: { label: 'Anulado', color: 'bg-slate-100 text-slate-600' },
  authorized: { label: 'Autorizado', color: 'bg-blue-100 text-blue-700' },
};

function formatCLP(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ShopifyOrdersPanel({ clientId }: { clientId: string }) {
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

    // fetch-shopify-analytics returns aggregated data, but we need raw orders
    // Use the rawOrders if available, otherwise fall back to what we get
    const rawOrders = data?.rawOrders || data?.orders || [];
    setOrders(rawOrders);
    setLoading(false);
  }

  // If fetch-shopify-analytics doesn't return raw orders, fetch directly
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

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" /> Pedidos ({filtered.length})
            </CardTitle>
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
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          #{o.order_number || o.id}
                        </td>
                        <td className="py-2 pr-3 text-xs whitespace-nowrap">
                          {formatDate(o.created_at)}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-sm truncate max-w-[150px]">{customerName}</div>
                          {o.customer?.email && (
                            <div className="text-xs text-muted-foreground truncate max-w-[150px]">{o.customer.email}</div>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs max-w-[200px]">
                          {o.line_items.slice(0, 2).map((item, i) => (
                            <div key={i} className="truncate">
                              {item.quantity}x {item.title}
                            </div>
                          ))}
                          {o.line_items.length > 2 && (
                            <span className="text-muted-foreground">+{o.line_items.length - 2} más</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">
                          {formatCLP(Number(o.total_price))}
                        </td>
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
      </Card>
    </div>
  );
}
