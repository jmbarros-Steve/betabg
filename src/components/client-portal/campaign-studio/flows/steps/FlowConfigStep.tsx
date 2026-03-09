import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  ArrowRight, ShoppingCart, Eye, TrendingUp, Tag, Loader2, Check, Clock, Mail, Info, Package,
} from 'lucide-react';
import { type FlowTemplate } from '../FlowTemplates';
import { type FlowWizardState, type ProductItem } from '../FlowWizard';

interface FlowConfigStepProps {
  template: FlowTemplate;
  clientId: string;
  state: FlowWizardState;
  updateState: (partial: Partial<FlowWizardState>) => void;
  onNext: () => void;
}

function formatDelay(hours: number): string {
  if (hours === 0) return 'Inmediato';
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function FlowConfigStep({ template, clientId, state, updateState, onNext }: FlowConfigStepProps) {
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(true);

  useEffect(() => {
    loadConnections();
  }, [clientId]);

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const { data: conns } = await supabase
        .from('platform_connections')
        .select('id, platform')
        .eq('client_id', clientId)
        .eq('is_active', true);

      const klaviyo = conns?.find((c) => c.platform === 'klaviyo');
      const shopify = conns?.find((c) => c.platform === 'shopify');

      updateState({
        klaviyoConnectionId: klaviyo?.id || '',
        shopifyConnectionId: shopify?.id || '',
      });

      // Auto-load products for most_viewed / best_sellers
      if (shopify && klaviyo && template.productStrategy !== 'none' && template.productStrategy !== 'cart_items') {
        loadProducts(klaviyo.id);
      }
    } catch (err) {
      console.error('Error loading connections:', err);
    } finally {
      setLoadingConnections(false);
    }
  };

  const loadProducts = async (connectionId: string) => {
    setLoadingProducts(true);
    try {
      const metric = template.productStrategy === 'most_viewed' ? 'viewed' : 'ordered';
      const { data, error } = await callApi('fetch-klaviyo-top-products', {
        body: { connectionId, metric, timeframe: '30d', limit: 6 },
      });

      if (error) throw error;
      if (data?.products) {
        updateState({ products: data.products });
      }
    } catch (err: any) {
      console.error('Error loading products:', err);
      toast.error('No se pudieron cargar productos. Puedes continuar sin ellos.');
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleCreateDiscount = async () => {
    if (!state.shopifyConnectionId) {
      toast.error('No hay conexion activa de Shopify');
      return;
    }
    setCreatingDiscount(true);
    try {
      const { data, error } = await callApi('create-shopify-discount', {
        body: {
          clientId,
          code: state.discountCode,
          discountType: state.discountType === 'free_shipping' ? 'percentage' : state.discountType,
          discountValue: state.discountType === 'free_shipping' ? 0 : state.discountValue,
          endsAt: state.discountExpiry ? new Date(state.discountExpiry).toISOString() : undefined,
          title: `Flujo ${template.nameEs} - ${state.discountCode}`,
        },
      });

      if (error) throw error;
      updateState({ shopifyDiscountId: data?.discountId || 'created' });
      toast.success(`Cupon "${state.discountCode}" creado en Shopify`);
    } catch (err: any) {
      console.error('Error creating discount:', err);
      toast.error(`Error al crear cupon: ${err.message || 'Intenta de nuevo'}`);
    } finally {
      setCreatingDiscount(false);
    }
  };

  const productStrategyIcon = {
    cart_items: <ShoppingCart className="w-5 h-5 text-orange-500" />,
    most_viewed: <Eye className="w-5 h-5 text-blue-500" />,
    best_sellers: <TrendingUp className="w-5 h-5 text-green-500" />,
    none: null,
  };

  const productStrategyLabel = {
    cart_items: 'Productos del carrito abandonado',
    most_viewed: 'Productos mas vistos',
    best_sellers: 'Productos mas vendidos',
    none: '',
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Flow summary */}
      <div>
        <h2 className="text-xl font-semibold mb-1">Configurar flujo</h2>
        <p className="text-sm text-muted-foreground">{template.description}</p>
      </div>

      {/* Email timeline overview */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Secuencia ({template.emails.length} emails)
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {template.emails.map((email, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50 border text-xs">
                <Mail className="w-3.5 h-3.5 text-primary" />
                <div>
                  <p className="font-medium truncate max-w-[200px]">{email.subject}</p>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDelay(email.delayHours)}
                    {template.discountEmail === idx && (
                      <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1 bg-amber-50 text-amber-700 border-amber-200">
                        <Tag className="w-2.5 h-2.5 mr-0.5" />Cupon
                      </Badge>
                    )}
                    {template.productStrategy !== 'none' && idx === 0 && (
                      <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1 bg-blue-50 text-blue-700 border-blue-200">
                        <Package className="w-2.5 h-2.5 mr-0.5" />Productos
                      </Badge>
                    )}
                  </p>
                </div>
              </div>
              {idx < template.emails.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Products section */}
      {template.productStrategy !== 'none' && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            {productStrategyIcon[template.productStrategy]}
            {productStrategyLabel[template.productStrategy]}
          </h3>

          {template.productStrategy === 'cart_items' ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Productos dinamicos del carrito</p>
                  <p className="text-sm text-orange-700 mt-1">
                    Los emails mostraran automaticamente los productos que el cliente dejo en su carrito,
                    incluyendo imagen, nombre, cantidad y precio. Esto se configura via Klaviyo con merge tags dinamicos.
                  </p>
                  <p className="text-xs text-orange-600 mt-2">
                    Tambien se incluira un boton directo para completar la compra con el carrito pre-cargado.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {loadingProducts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando productos...
                </div>
              ) : state.products.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {state.products.map((product, idx) => (
                    <div key={idx} className="border rounded-lg overflow-hidden bg-white">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.title}
                          className="w-full h-24 object-cover"
                        />
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium truncate">{product.title}</p>
                        {product.price && (
                          <p className="text-xs text-muted-foreground">${product.price}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No se encontraron productos. Se usaran los datos disponibles en Klaviyo.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Discount section */}
      {template.discountEmail !== null && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Tag className="w-4 h-4 text-amber-500" />
              Cupon de descuento (Email {(template.discountEmail || 0) + 1})
            </h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="discount-toggle" className="text-xs text-muted-foreground">
                {state.discountEnabled ? 'Habilitado' : 'Deshabilitado'}
              </Label>
              <Switch
                id="discount-toggle"
                checked={state.discountEnabled}
                onCheckedChange={(checked) => updateState({ discountEnabled: checked })}
              />
            </div>
          </div>

          {state.discountEnabled && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discount-type" className="text-xs">Tipo de descuento</Label>
                  <Select
                    value={state.discountType}
                    onValueChange={(v) => updateState({ discountType: v as any })}
                  >
                    <SelectTrigger id="discount-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                      <SelectItem value="fixed_amount">Monto fijo ($)</SelectItem>
                      <SelectItem value="free_shipping">Envio gratis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {state.discountType !== 'free_shipping' && (
                  <div>
                    <Label htmlFor="discount-value" className="text-xs">
                      {state.discountType === 'percentage' ? 'Porcentaje' : 'Monto'}
                    </Label>
                    <Input
                      id="discount-value"
                      type="number"
                      min={1}
                      max={state.discountType === 'percentage' ? 50 : 100000}
                      value={state.discountValue}
                      onChange={(e) => updateState({ discountValue: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discount-code" className="text-xs">Codigo del cupon</Label>
                  <Input
                    id="discount-code"
                    value={state.discountCode}
                    onChange={(e) => updateState({ discountCode: e.target.value.toUpperCase() })}
                    placeholder="BIENVENIDA10"
                  />
                </div>
                <div>
                  <Label htmlFor="discount-expiry" className="text-xs">Fecha de expiracion</Label>
                  <Input
                    id="discount-expiry"
                    type="date"
                    value={state.discountExpiry}
                    onChange={(e) => updateState({ discountExpiry: e.target.value })}
                  />
                </div>
              </div>

              {/* Create in Shopify button */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateDiscount}
                  disabled={creatingDiscount || !state.shopifyConnectionId || !!state.shopifyDiscountId}
                >
                  {creatingDiscount ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando...</>
                  ) : state.shopifyDiscountId ? (
                    <><Check className="w-4 h-4 mr-2 text-green-500" />Creado en Shopify</>
                  ) : (
                    <><Tag className="w-4 h-4 mr-2" />Crear cupon en Shopify</>
                  )}
                </Button>
                {!state.shopifyConnectionId && (
                  <p className="text-xs text-muted-foreground">Conecta Shopify primero para crear cupones</p>
                )}
                {state.shopifyDiscountId && (
                  <p className="text-xs text-green-600">Cupon listo para usar en emails</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Next button */}
      <div className="flex justify-end pt-4">
        <Button onClick={onNext} size="lg">
          Siguiente: Generar contenido
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
