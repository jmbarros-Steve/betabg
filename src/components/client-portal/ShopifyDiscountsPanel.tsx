import { useState, useEffect } from 'react';
import { Tag, RefreshCw, Trash2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  scheduled: 'bg-blue-100 text-blue-700',
};

function formatValue(type: string, value: string) {
  const v = Math.abs(parseFloat(value));
  return type === 'percentage' ? `${v}%` : `$${v.toLocaleString('es-CL')}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ShopifyDiscountsPanel({ clientId }: { clientId: string }) {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (clientId) fetchDiscounts();
  }, [clientId]);

  async function fetchDiscounts() {
    setLoading(true);
    const { data, error } = await callApi<any>('fetch-shopify-discounts', {
      body: { client_id: clientId },
    });
    if (!error && data?.discounts) {
      setDiscounts(data.discounts);
    }
    setLoading(false);
  }

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
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
                  <th className="pb-2 pr-3">Vence</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-mono font-medium text-sm">
                        {d.codes.length > 0 ? d.codes[0].code : d.title}
                      </div>
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
                    <td className="py-2 pr-3 text-xs">{formatDate(d.ends_at)}</td>
                    <td className="py-2">
                      <Badge className={`text-xs ${STATUS_COLORS[d.status] || ''}`}>
                        {d.status === 'active' ? 'Activo' : d.status === 'expired' ? 'Expirado' : 'Programado'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
