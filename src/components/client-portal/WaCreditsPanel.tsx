import { useEffect, useState } from 'react';
import { MessageSquare, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface WaCreditRow {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  topup: { label: 'Recarga', color: 'bg-green-100 text-green-700' },
  message_sent: { label: 'Mensaje', color: 'bg-blue-100 text-blue-700' },
  adjustment: { label: 'Ajuste', color: 'bg-yellow-100 text-yellow-700' },
  refund: { label: 'Reembolso', color: 'bg-purple-100 text-purple-700' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function WaCreditsPanel({ clientId }: { clientId: string }) {
  const [transactions, setTransactions] = useState<WaCreditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId) fetchCredits();
  }, [clientId]);

  async function fetchCredits() {
    setLoading(true);
    const { data } = await supabase
      .from('wa_credits')
      .select('id, type, amount, balance_after, description, created_at')
      .eq('shop_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30);
    setTransactions((data || []) as WaCreditRow[]);
    setLoading(false);
  }

  const currentBalance = transactions.length > 0 ? transactions[0].balance_after : 0;
  const totalTopups = transactions
    .filter((t) => t.type === 'topup')
    .reduce((s, t) => s + t.amount, 0);
  const totalSent = transactions
    .filter((t) => t.type === 'message_sent')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Saldo Actual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{currentBalance}</div>
            <p className="text-xs text-muted-foreground">créditos WA disponibles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ArrowUpCircle className="w-4 h-4 text-green-600" /> Total Recargado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTopups}</div>
            <p className="text-xs text-muted-foreground">créditos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4 text-blue-600" /> Mensajes Enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSent}</div>
            <p className="text-xs text-muted-foreground">créditos usados</p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Transacciones</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchCredits}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sin transacciones de créditos WA
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3">Fecha</th>
                    <th className="pb-2 pr-3">Tipo</th>
                    <th className="pb-2 pr-3">Monto</th>
                    <th className="pb-2 pr-3">Saldo</th>
                    <th className="pb-2">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const typeInfo = TYPE_LABELS[t.type] || { label: t.type, color: '' };
                    return (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(t.created_at)}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge className={`text-xs ${typeInfo.color}`}>{typeInfo.label}</Badge>
                        </td>
                        <td className={`py-2 pr-3 font-medium ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {t.amount >= 0 ? '+' : ''}{t.amount}
                        </td>
                        <td className="py-2 pr-3 text-xs">{t.balance_after}</td>
                        <td className="py-2 text-xs text-muted-foreground truncate max-w-xs">
                          {t.description || '—'}
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
