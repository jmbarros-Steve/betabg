import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Check, X, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

export interface AbandonedCart {
  id: string;
  customerEmail: string;
  customerName: string;
  totalValue: number;
  itemCount: number;
  abandonedAt: string;
  contacted: boolean;
}

interface AbandonedCartsPanelProps {
  carts: AbandonedCart[];
  currency?: string;
  onUpdateContactStatus?: (cartId: string, contacted: boolean) => void;
}

export function AbandonedCartsPanel({ carts, currency = 'CLP', onUpdateContactStatus }: AbandonedCartsPanelProps) {
  const [localCarts, setLocalCarts] = useState(carts);
  const [filter, setFilter] = useState<'all' | 'contacted' | 'not_contacted'>('all');

  const handleToggleContacted = (cartId: string, contacted: boolean) => {
    setLocalCarts((prev) =>
      prev.map((c) => (c.id === cartId ? { ...c, contacted } : c))
    );
    onUpdateContactStatus?.(cartId, contacted);
    toast.success(contacted ? 'Marcado como contactado' : 'Marcado como no contactado');
  };

  const filteredCarts = localCarts.filter((cart) => {
    if (filter === 'contacted') return cart.contacted;
    if (filter === 'not_contacted') return !cart.contacted;
    return true;
  });

  const stats = {
    total: localCarts.length,
    contacted: localCarts.filter((c) => c.contacted).length,
    notContacted: localCarts.filter((c) => !c.contacted).length,
    totalValue: localCarts.reduce((acc, c) => acc + c.totalValue, 0),
  };

  return (
    <Card className="glow-box">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Carritos Abandonados
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className="text-xs h-7"
            >
              Todos ({stats.total})
            </Button>
            <Button
              variant={filter === 'not_contacted' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('not_contacted')}
              className="text-xs h-7"
            >
              <X className="w-3 h-3 mr-1" />
              Sin contactar ({stats.notContacted})
            </Button>
            <Button
              variant={filter === 'contacted' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('contacted')}
              className="text-xs h-7"
            >
              <Check className="w-3 h-3 mr-1" />
              Contactados ({stats.contacted})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Total carritos</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor total</p>
            <p className="text-xl font-bold">${stats.totalValue.toLocaleString('es-CL')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contactados</p>
            <p className="text-xl font-bold text-primary">{stats.contacted}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-xl font-bold text-destructive">{stats.notContacted}</p>
          </div>
        </div>

        {filteredCarts.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">
            No hay carritos abandonados en este filtro
          </p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {filteredCarts.map((cart) => (
              <div
                key={cart.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{cart.customerName}</p>
                      <Badge variant={cart.contacted ? 'default' : 'secondary'} className="text-xs">
                        {cart.contacted ? 'Contactado' : 'Pendiente'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{cart.customerEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      {cart.itemCount} items • Abandonado {new Date(cart.abandonedAt).toLocaleDateString('es-CL')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold">${cart.totalValue.toLocaleString('es-CL')}</p>
                    <p className="text-xs text-muted-foreground">{currency}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        window.open(`mailto:${cart.customerEmail}?subject=Tu carrito te espera`, '_blank');
                      }}
                      title="Enviar email"
                    >
                      <Mail className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={cart.contacted ? 'outline' : 'default'}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleToggleContacted(cart.id, !cart.contacted)}
                      title={cart.contacted ? 'Marcar como no contactado' : 'Marcar como contactado'}
                    >
                      {cart.contacted ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
