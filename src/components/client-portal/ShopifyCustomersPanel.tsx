import { useState, useEffect } from 'react';
import { Users, RefreshCw, Search, X, ShoppingBag, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';

interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  total_spent: number;
  orders_count: number;
  last_order_date: string | null;
  created_at: string;
  currency: string;
  tags: string;
}

interface CustomerOrder {
  id: number;
  order_number: number;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: Array<{ title: string; quantity: number; price: string }>;
}

function formatCLP(value: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(value);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  refunded: { label: 'Reembolsado', color: 'bg-red-100 text-red-700' },
  partially_refunded: { label: 'Reembolso parcial', color: 'bg-orange-100 text-orange-700' },
  authorized: { label: 'Autorizado', color: 'bg-[#D6E0F0] text-[#162D5F]' },
};

export function ShopifyCustomersPanel({ clientId }: { clientId: string }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Customer detail modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    if (clientId) loadConnection();
  }, [clientId]);

  async function loadConnection() {
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      setConnectionId(data.id);
      fetchCustomers(data.id);
    } else {
      setLoading(false);
      setError('No hay conexión Shopify activa');
    }
  }

  async function fetchCustomers(connId: string) {
    setLoading(true);
    setError(null);
    const { data, error: apiError } = await callApi<any>('fetch-shopify-customers', {
      body: { connectionId: connId },
    });

    if (apiError) {
      setError(apiError);
      setLoading(false);
      return;
    }

    setCustomers(data?.customers || []);
    setLoading(false);
  }

  async function openCustomerDetail(customer: Customer) {
    setSelectedCustomer(customer);
    setOrdersLoading(true);
    setCustomerOrders([]);

    if (!connectionId) return;

    const { data } = await callApi<any>('fetch-shopify-customers', {
      body: { connectionId, action: 'orders', customerId: customer.id },
    });

    setCustomerOrders(data?.orders || []);
    setOrdersLoading(false);
  }

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  const totalRevenue = customers.reduce((s, c) => s + c.total_spent, 0);
  const avgSpent = customers.length > 0 ? totalRevenue / customers.length : 0;
  const repeatCustomers = customers.filter(c => c.orders_count > 1).length;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              Clientes
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {customers.length} clientes · {repeatCustomers} recurrentes · Ticket prom. {formatCLP(avgSpent)}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => connectionId && fetchCustomers(connectionId)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 mb-4">{error}</p>
          )}

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {search ? 'No se encontraron clientes' : 'Sin clientes'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-muted-foreground">Nombre</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right">Total gastado</th>
                    <th className="py-2 pr-4 font-medium text-muted-foreground text-right hidden md:table-cell">Pedidos</th>
                    <th className="py-2 font-medium text-muted-foreground hidden lg:table-cell">Cliente desde</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map(customer => (
                    <tr
                      key={customer.id}
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => openCustomerDetail(customer)}
                    >
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">
                          {customer.first_name} {customer.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground sm:hidden">{customer.email}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground hidden sm:table-cell">
                        {customer.email}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium tabular-nums">
                        {formatCLP(customer.total_spent)}
                      </td>
                      <td className="py-2.5 pr-4 text-right hidden md:table-cell">
                        <Badge variant="secondary" className="font-normal">
                          {customer.orders_count}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-muted-foreground hidden lg:table-cell">
                        {formatDate(customer.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Mostrando 100 de {filtered.length} clientes
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Detail Modal */}
      <Dialog open={!!selectedCustomer} onOpenChange={open => !open && setSelectedCustomer(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Customer stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total gastado</p>
                    <p className="text-lg font-bold tabular-nums">{formatCLP(selectedCustomer.total_spent)}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Pedidos</p>
                    <p className="text-lg font-bold">{selectedCustomer.orders_count}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Ticket prom.</p>
                    <p className="text-lg font-bold tabular-nums">
                      {selectedCustomer.orders_count > 0
                        ? formatCLP(selectedCustomer.total_spent / selectedCustomer.orders_count)
                        : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {selectedCustomer.email}
                </div>

                {/* Orders */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    Historial de pedidos
                  </h4>
                  {ordersLoading ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                      ))}
                    </div>
                  ) : customerOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin pedidos</p>
                  ) : (
                    <div className="space-y-2">
                      {customerOrders.map(order => {
                        const status = STATUS_LABELS[order.financial_status] || { label: order.financial_status, color: 'bg-slate-100 text-slate-600' };
                        return (
                          <div key={order.id} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">#{order.order_number}</span>
                              <Badge className={`${status.color} text-xs`}>{status.label}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <span>{formatDate(order.created_at)}</span>
                              <span className="font-medium text-foreground tabular-nums">
                                {formatCLP(parseFloat(order.total_price))}
                              </span>
                            </div>
                            {order.line_items.length > 0 && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                {order.line_items.map((li, i) => (
                                  <span key={i}>
                                    {li.title} x{li.quantity}
                                    {i < order.line_items.length - 1 ? ' · ' : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
