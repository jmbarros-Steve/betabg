import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Check, X, Mail, Phone, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/client-portal/EmptyState';
import { toast } from 'sonner';

export interface CartLineItem {
  title: string;
  quantity: number;
  price: number;
  variantTitle: string;
}

export interface AbandonedCart {
  id: string;
  customerEmail: string;
  customerName: string;
  phone?: string | null;
  totalValue: number;
  itemCount: number;
  lineItems?: CartLineItem[];
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
  const [expandedCarts, setExpandedCarts] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (cartId: string) => {
    setExpandedCarts(prev => {
      const next = new Set(prev);
      if (next.has(cartId)) next.delete(cartId);
      else next.add(cartId);
      return next;
    });
  };

  const stats = {
    total: localCarts.length,
    contacted: localCarts.filter((c) => c.contacted).length,
    notContacted: localCarts.filter((c) => !c.contacted).length,
    totalValue: localCarts.reduce((acc, c) => acc + c.totalValue, 0),
  };

  // "Dinero sobre la mesa" — value of uncontacted carts with recovery estimate
  const uncontactedValue = localCarts.filter(c => !c.contacted).reduce((acc, c) => acc + c.totalValue, 0);
  const estimatedRecovery = Math.round(uncontactedValue * 0.12); // ~12% avg e-commerce recovery rate

  return (
    <Card className="bg-white border border-slate-200 rounded-xl card-hover">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
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
        {/* Dinero sobre la mesa */}
        {uncontactedValue > 0 && (
          <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <p className="font-semibold text-orange-800 dark:text-orange-300">Dinero sobre la mesa</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-orange-600 dark:text-orange-400">Valor sin contactar</p>
                <p className="text-2xl font-bold text-orange-800 dark:text-orange-200">${uncontactedValue.toLocaleString('es-CL')}</p>
              </div>
              <div>
                <p className="text-xs text-orange-600 dark:text-orange-400">Recuperable estimado (~12%)</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">${estimatedRecovery.toLocaleString('es-CL')}</p>
              </div>
            </div>
          </div>
        )}

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
          <EmptyState
            icon={ShoppingCart}
            title="Sin carritos abandonados"
            description="¡Buenas noticias! No hay carritos abandonados en este periodo"
          />
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {filteredCarts.map((cart) => {
              const isExpanded = expandedCarts.has(cart.id);
              return (
                <div
                  key={cart.id}
                  className="border border-border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <button
                        className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                        onClick={() => cart.lineItems && cart.lineItems.length > 0 && toggleExpanded(cart.id)}
                        title={cart.lineItems?.length ? (isExpanded ? 'Ocultar productos' : 'Ver productos') : ''}
                      >
                        {cart.lineItems?.length ? (
                          isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ShoppingCart className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{cart.customerName}</p>
                          <Badge variant={cart.contacted ? 'default' : 'secondary'} className="text-xs">
                            {cart.contacted ? 'Contactado' : 'Pendiente'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{cart.customerEmail}</p>
                        {cart.phone && (
                          <p className="text-xs text-muted-foreground">{cart.phone}</p>
                        )}
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
                        {cart.phone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              window.open(`tel:${cart.phone}`, '_blank');
                            }}
                            title="Llamar"
                          >
                            <Phone className="w-4 h-4" />
                          </Button>
                        )}
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
                  {/* Expandable line items */}
                  {isExpanded && cart.lineItems && cart.lineItems.length > 0 && (
                    <div className="border-t border-border px-3 pb-3 pt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Productos en el carrito:</p>
                      <div className="space-y-1">
                        {cart.lineItems.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1">
                            <div className="flex-1">
                              <span className="font-medium">{item.title}</span>
                              {item.variantTitle && (
                                <span className="text-muted-foreground ml-1">({item.variantTitle})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span>x{item.quantity}</span>
                              <span className="font-medium text-foreground">${(item.price * item.quantity).toLocaleString('es-CL')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
