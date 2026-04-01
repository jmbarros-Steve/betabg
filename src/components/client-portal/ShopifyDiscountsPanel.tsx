import { useState, useEffect, useMemo } from 'react';
import { Tag, RefreshCw, Search, DollarSign, TrendingUp, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { ShopifyDiscountDialog } from './ShopifyDiscountDialog';
import { useUserPlan } from '@/hooks/useUserPlan';

interface DiscountCode {
  id: number;
  code: string;
  usage_count: number;
}

interface Discount {
  id: number;
  title: string;
  value_type: string;
  value: string;
  usage_limit: number | null;
  times_used: number;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  codes: DiscountCode[];
}

interface DiscountPerformance {
  code: string;
  orders: number;
  revenue: number;
  discountAmount: number;
}

interface ShopifyDiscountsPanelProps {
  clientId: string;
  connectionId?: string | null;
  discountPerformance?: DiscountPerformance[];
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  scheduled: 'bg-[#D6E0F0] text-[#162D5F]',
};

function formatValue(type: string, value: string) {
  const v = Math.abs(parseFloat(value));
  return type === 'percentage' ? `${v}%` : `$${v.toLocaleString('es-CL')}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ShopifyDiscountsPanel({ clientId, connectionId, discountPerformance = [] }: ShopifyDiscountsPanelProps) {
  const { canAccess } = useUserPlan();
  const canCreateDiscount = canAccess('shopify.discounts');
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (clientId) fetchDiscounts();
  }, [clientId]);

  async function fetchDiscounts() {
    setLoading(true);
    const { data, error } = await callApi<any>('fetch-shopify-discounts', {
      body: { client_id: clientId, connection_id: connectionId || undefined },
    });
    if (!error && data?.discounts) {
      setDiscounts(data.discounts);
    }
    setLoading(false);
  }

  // F3: Build performance map by code
  const perfMap = useMemo(() => {
    const map = new Map<string, DiscountPerformance>();
    for (const dp of discountPerformance) {
      map.set(dp.code.toUpperCase(), dp);
    }
    return map;
  }, [discountPerformance]);

  // F3: Summary stats
  const totalDiscountRevenue = discountPerformance.reduce((s, d) => s + d.revenue, 0);
  const totalDiscountAmount = discountPerformance.reduce((s, d) => s + d.discountAmount, 0);
  const overallROI = totalDiscountAmount > 0 ? ((totalDiscountRevenue - totalDiscountAmount) / totalDiscountAmount) * 100 : 0;

  const filtered = discounts.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const codes = d.codes.map((c) => c.code).join(' ').toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !codes.includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="w-4 h-4" /> Descuentos ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-[180px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={fetchDiscounts}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)} disabled={!canCreateDiscount} title={!canCreateDiscount ? 'Requiere plan Full' : 'Crear descuento'}>
              <Plus className="w-4 h-4 mr-1" />
              Crear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* F3: ROI Summary */}
        {discountPerformance.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <DollarSign className="w-4 h-4 mx-auto mb-1 text-green-500" />
              <p className="text-lg font-bold">${Math.round(totalDiscountRevenue).toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">Ingresos con descuento</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <Tag className="w-4 h-4 mx-auto mb-1 text-orange-500" />
              <p className="text-lg font-bold">${Math.round(totalDiscountAmount).toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">Descuento otorgado</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <TrendingUp className="w-4 h-4 mx-auto mb-1 text-[#2A4F9E]" />
              <p className={`text-lg font-bold ${overallROI >= 200 ? 'text-green-600' : overallROI >= 100 ? 'text-yellow-600' : 'text-red-600'}`}>
                {overallROI.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">ROI global</p>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin descuentos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3">Código</th>
                  <th className="pb-2 pr-3">Tipo</th>
                  <th className="pb-2 pr-3">Valor</th>
                  <th className="pb-2 pr-3">Usos</th>
                  {discountPerformance.length > 0 && (
                    <>
                      <th className="pb-2 pr-3 text-right">Ingresos</th>
                      <th className="pb-2 pr-3 text-right">Desc.</th>
                      <th className="pb-2 pr-3 text-right">ROI</th>
                    </>
                  )}
                  <th className="pb-2 pr-3">Vence</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const mainCode = d.codes.length > 0 ? d.codes[0].code : d.title;
                  const perf = perfMap.get(mainCode.toUpperCase());
                  const roi = perf && perf.discountAmount > 0
                    ? ((perf.revenue - perf.discountAmount) / perf.discountAmount) * 100
                    : null;

                  return (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-mono font-medium text-sm">{mainCode}</div>
                        {d.codes.length > 1 && (
                          <span className="text-xs text-muted-foreground">+{d.codes.length - 1} códigos</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {d.value_type === 'percentage' ? 'Porcentaje' : 'Monto fijo'}
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        {formatValue(d.value_type, d.value)}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {d.times_used}{d.usage_limit ? ` / ${d.usage_limit}` : ''}
                      </td>
                      {discountPerformance.length > 0 && (
                        <>
                          <td className="py-2 pr-3 text-right text-xs font-medium">
                            {perf ? `$${Math.round(perf.revenue).toLocaleString('es-CL')}` : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right text-xs">
                            {perf ? `$${Math.round(perf.discountAmount).toLocaleString('es-CL')}` : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {roi !== null ? (
                              <Badge variant="outline" className={`text-xs font-mono ${
                                roi >= 200 ? 'text-green-600 border-green-300' :
                                roi >= 100 ? 'text-yellow-600 border-yellow-300' :
                                'text-red-600 border-red-300'
                              }`}>
                                {roi.toFixed(0)}%
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2 pr-3 text-xs">{formatDate(d.ends_at)}</td>
                      <td className="py-2">
                        <Badge className={`text-xs ${STATUS_COLORS[d.status] || ''}`}>
                          {d.status === 'active' ? 'Activo' : d.status === 'expired' ? 'Expirado' : 'Programado'}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <ShopifyDiscountDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        clientId={clientId}
        onSuccess={() => fetchDiscounts()}
      />
    </Card>
  );
}
