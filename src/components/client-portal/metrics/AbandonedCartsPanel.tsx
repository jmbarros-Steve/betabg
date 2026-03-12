import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Check, X, Mail, Phone, MessageCircle, ChevronDown, ChevronUp, AlertTriangle, Send, Copy } from 'lucide-react';
import { EmptyState } from '@/components/client-portal/EmptyState';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

/**
 * Formats a phone number for wa.me link.
 * Handles Chilean numbers (+56), numbers with leading 0, etc.
 */
function formatPhoneForWhatsApp(phone: string): string {
  // Remove everything except digits and leading +
  let clean = phone.replace(/[^0-9+]/g, '');
  // If it starts with +, keep it
  if (clean.startsWith('+')) {
    clean = clean.slice(1); // wa.me doesn't use +
  }
  // Chilean numbers: if starts with 9 and is 9 digits, prepend 56
  if (/^9\d{8}$/.test(clean)) {
    clean = '56' + clean;
  }
  // If starts with 0, remove leading 0 (common in some formats)
  if (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  return clean;
}

/**
 * Generates a friendly WhatsApp message including the products in the cart.
 */
function generateWhatsAppMessage(cart: AbandonedCart): string {
  const firstName = (cart.customerName || '').split(' ')[0] || 'cliente';
  const products = (cart.lineItems || [])
    .slice(0, 5)
    .map(item => {
      const name = item.title || 'Producto';
      const variant = item.variantTitle?.trim() ? ` (${item.variantTitle})` : '';
      return `  - ${name}${variant}`;
    })
    .join('\n');

  const hasMoreProducts = (cart.lineItems?.length ?? 0) > 5;
  const moreText = hasMoreProducts ? `\n  ...y ${(cart.lineItems?.length ?? 0) - 5} más` : '';

  const total = `$${Math.round(cart.totalValue).toLocaleString('es-CL')}`;

  if (products) {
    return `Hola ${firstName}! 👋

Vi que dejaste estos productos en tu carrito:
${products}${moreText}

Total: ${total}

¿Puedo ayudarte a completar tu compra? Si tienes alguna duda sobre tallas, envío o formas de pago, estoy aquí para ayudarte.`;
  }

  return `Hola ${firstName}! 👋

Vi que dejaste productos por ${total} en tu carrito. ¿Puedo ayudarte a completar tu compra? Si tienes alguna duda, estoy aquí para ayudarte.`;
}

// WhatsApp message preview popover
function WhatsAppPreview({ cart, onSend }: { cart: AbandonedCart; onSend: () => void }) {
  const defaultMessage = generateWhatsAppMessage(cart);
  const [message, setMessage] = useState(defaultMessage);
  const phone = formatPhoneForWhatsApp(cart.phone || '');

  const handleSend = () => {
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank');
    onSend();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    toast.success('Mensaje copiado');
  };

  return (
    <div className="w-80 space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-green-600" />
        <p className="font-semibold text-sm">Enviar WhatsApp</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Para: {cart.customerName}</p>
        <p className="text-xs text-muted-foreground font-mono">+{phone}</p>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full h-40 text-xs p-3 rounded-lg border border-border bg-muted/30 resize-none focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
        placeholder="Edita el mensaje o escribe el tuyo..."
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          onClick={handleSend}
        >
          <Send className="w-3.5 h-3.5 mr-1.5" />
          Abrir WhatsApp
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          title="Copiar mensaje"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center">
        Se abrirá WhatsApp Web en una nueva pestaña
      </p>
    </div>
  );
}

export function AbandonedCartsPanel({ carts, currency = 'CLP', onUpdateContactStatus }: AbandonedCartsPanelProps) {
  const [localCarts, setLocalCarts] = useState(carts);
  const [filter, setFilter] = useState<'all' | 'contacted' | 'not_contacted'>('all');
  const [expandedCarts, setExpandedCarts] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'recent' | 'value'>('recent');

  // Sync localCarts when prop changes (e.g. date range switch)
  useEffect(() => {
    setLocalCarts(carts);
  }, [carts]);

  const handleToggleContacted = (cartId: string, contacted: boolean) => {
    setLocalCarts((prev) =>
      prev.map((c) => (c.id === cartId ? { ...c, contacted } : c))
    );
    onUpdateContactStatus?.(cartId, contacted);
    toast.success(contacted ? 'Marcado como contactado' : 'Marcado como no contactado');
  };

  const filteredAndSortedCarts = useMemo(() => {
    let result = localCarts.filter((cart) => {
      if (filter === 'contacted') return cart.contacted;
      if (filter === 'not_contacted') return !cart.contacted;
      return true;
    });
    if (sortBy === 'value') {
      result = [...result].sort((a, b) => b.totalValue - a.totalValue);
    }
    // 'recent' is already the default sort from the API
    return result;
  }, [localCarts, filter, sortBy]);

  const toggleExpanded = (cartId: string) => {
    setExpandedCarts(prev => {
      const next = new Set(prev);
      if (next.has(cartId)) next.delete(cartId);
      else next.add(cartId);
      return next;
    });
  };

  const stats = useMemo(() => ({
    total: localCarts.length,
    contacted: localCarts.filter((c) => c.contacted).length,
    notContacted: localCarts.filter((c) => !c.contacted).length,
    totalValue: localCarts.reduce((acc, c) => acc + (c.totalValue ?? 0), 0),
  }), [localCarts]);

  // "Dinero sobre la mesa" — value of uncontacted carts with recovery estimate
  const uncontactedValue = useMemo(() =>
    localCarts.filter(c => !c.contacted).reduce((acc, c) => acc + (c.totalValue ?? 0), 0),
  [localCarts]);
  const estimatedRecovery = Math.round(uncontactedValue * 0.12); // ~12% avg e-commerce recovery rate

  return (
    <Card className="bg-card border border-border rounded-xl card-hover">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Carritos Abandonados
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
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

        {/* Sort */}
        {localCarts.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Ordenar:</span>
            <Button
              variant={sortBy === 'recent' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSortBy('recent')}
              className="text-xs h-6 px-2"
            >
              Más recientes
            </Button>
            <Button
              variant={sortBy === 'value' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSortBy('value')}
              className="text-xs h-6 px-2"
            >
              Mayor valor
            </Button>
          </div>
        )}

        {filteredAndSortedCarts.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Sin carritos abandonados"
            description="¡Buenas noticias! No hay carritos abandonados en este período"
          />
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {filteredAndSortedCarts.map((cart) => {
              const isExpanded = expandedCarts.has(cart.id);
              const hoursSinceAbandonment = Math.round(
                (Date.now() - new Date(cart.abandonedAt).getTime()) / (1000 * 60 * 60)
              );
              const isRecent = hoursSinceAbandonment <= 24;

              return (
                <div
                  key={cart.id}
                  className={`border rounded-lg hover:bg-muted/30 transition-colors ${
                    isRecent && !cart.contacted ? 'border-orange-300 bg-orange-50/30' : 'border-border'
                  }`}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{cart.customerName}</p>
                          <Badge variant={cart.contacted ? 'default' : 'secondary'} className="text-xs">
                            {cart.contacted ? 'Contactado' : 'Pendiente'}
                          </Badge>
                          {isRecent && !cart.contacted && (
                            <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">
                              Reciente
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{cart.customerEmail}</p>
                        {cart.phone && (
                          <p className="text-xs text-muted-foreground">{cart.phone}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {cart.itemCount} items • {
                            hoursSinceAbandonment < 1 ? 'Hace menos de 1 hora' :
                            hoursSinceAbandonment < 24 ? `Hace ${hoursSinceAbandonment}h` :
                            `Abandonado ${new Date(cart.abandonedAt).toLocaleDateString('es-CL')}`
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold">${cart.totalValue.toLocaleString('es-CL')}</p>
                        <p className="text-xs text-muted-foreground">{currency}</p>
                      </div>
                      <div className="flex gap-1">
                        {/* WhatsApp — primary action */}
                        {cart.phone && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Enviar WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent side="left" align="start" className="p-4">
                              <WhatsAppPreview
                                cart={cart}
                                onSend={() => handleToggleContacted(cart.id, true)}
                              />
                            </PopoverContent>
                          </Popover>
                        )}
                        {cart.phone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              if (/Mobi|Android/i.test(navigator.userAgent)) {
                                window.open(`tel:${cart.phone}`, '_blank');
                              } else {
                                navigator.clipboard.writeText(cart.phone!);
                                toast.success('Teléfono copiado');
                              }
                            }}
                            title="Llamar (móvil) / Copiar número (desktop)"
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
                              {item.variantTitle?.trim() && (
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
