import { useEffect, useState } from 'react';
import { CreditCard, ArrowDown, ArrowUp, Gift, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  balance_after: number;
  created_at: string;
}

interface Props {
  clientId: string;
  credits: number;
  onRefresh: () => void;
}

const PACKAGES = [
  { messages: 250, price: 19900, label: '250 mensajes', priceLabel: '$19.900' },
  { messages: 500, price: 34900, label: '500 mensajes', priceLabel: '$34.900', popular: true },
  { messages: 1000, price: 59900, label: '1.000 mensajes', priceLabel: '$59.900' },
  { messages: 5000, price: 249900, label: '5.000 mensajes', priceLabel: '$249.900' },
];

const TYPE_ICONS: Record<string, { icon: typeof ArrowUp; color: string }> = {
  purchase: { icon: ShoppingCart, color: 'text-green-600' },
  usage: { icon: ArrowDown, color: 'text-red-500' },
  bonus: { icon: Gift, color: 'text-purple-600' },
  refund: { icon: ArrowUp, color: 'text-blue-600' },
};

export function WACredits({ clientId, credits, onRefresh }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, [clientId]);

  async function fetchTransactions() {
    setLoading(true);
    const { data } = await supabase
      .from('wa_credit_transactions' as any)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(30);

    setTransactions((data as any[]) || []);
    setLoading(false);
  }

  async function handlePurchase(messages: number, price: number) {
    // In production this would integrate with Stripe/Flow
    toast.info(`Redirigiendo al pago de ${messages} mensajes por $${(price / 1).toLocaleString('es-CL')}...`);
    // TODO: Integrate with payment gateway
  }

  const creditColor = credits > 100 ? 'text-green-600' : credits > 20 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Balance */}
      <Card className="border-green-200">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Creditos disponibles</p>
          <p className={`text-5xl font-bold ${creditColor}`}>{credits.toLocaleString()}</p>
          <p className="text-sm text-gray-400 mt-2">1 credito = 1 mensaje de WhatsApp</p>
        </CardContent>
      </Card>

      {/* Packages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Comprar creditos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {PACKAGES.map(pkg => (
              <button
                key={pkg.messages}
                onClick={() => handlePurchase(pkg.messages, pkg.price)}
                className={`relative border rounded-lg p-4 text-center hover:border-green-400 transition-colors ${
                  pkg.popular ? 'border-green-400 ring-1 ring-green-400' : ''
                }`}
              >
                {pkg.popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green-600 text-xs">
                    Mas vendido
                  </Badge>
                )}
                <p className="text-lg font-bold mt-1">{pkg.label}</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{pkg.priceLabel}</p>
                <p className="text-xs text-gray-400 mt-1">
                  ${Math.round(pkg.price / pkg.messages)} por mensaje
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-gray-400 py-6">No hay transacciones</p>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => {
                const info = TYPE_ICONS[tx.type] || TYPE_ICONS.usage;
                const Icon = info.icon;
                return (
                  <div key={tx.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <Icon className={`h-4 w-4 ${info.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{tx.description || tx.type}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(tx.created_at).toLocaleDateString('es-CL', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </p>
                      <p className="text-xs text-gray-400">Saldo: {tx.balance_after}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
