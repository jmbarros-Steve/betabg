import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
// Table imports removed — using card layout instead
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Package, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, ImageOff, Pencil, Save, Loader2,
  Sparkles, Camera, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronRight, ShoppingCart, Clock
} from 'lucide-react';
import { ShopifyPhotoStudio } from './ShopifyPhotoStudio';

interface SkuSale {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
}

interface ShopifyProductsPanelProps {
  clientId: string;
  allSkuSales?: SkuSale[];
  connectionId?: string | null;
  initialProducts?: ShopifyProduct[];
}

interface ProductVariant {
  id: number;
  title: string;
  sku: string;
  price: number;
  cost: number | null;
  inventory_quantity: number | null;
  inventory_item_id: number | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  product_type: string;
  image: string | null;
  body_html?: string;
  images?: Array<{ id: number; src: string; alt?: string }>;
  variants: ProductVariant[];
  [key: string]: any;
}

// F10: Price suggestion algorithm
function getSuggestedPrice(variant: ProductVariant, salesData: SkuSale | undefined, daysInPeriod: number): { price: number; reason: string; direction: 'up' | 'down' } | null {
  if (!variant.sku) return null;

  const inventory = variant.inventory_quantity;
  const velocity = salesData ? salesData.quantity / Math.max(daysInPeriod, 1) : 0;
  const daysOfStock = inventory !== null && velocity > 0 ? inventory / velocity : null;
  const margin = variant.cost !== null ? ((variant.price - variant.cost) / variant.price) * 100 : null;

  // Rule 1: Overstock >90 days — suggest 5-10% lower
  if (daysOfStock !== null && daysOfStock > 90) {
    const discount = Math.min(0.10, Math.max(0.05, (daysOfStock - 90) / 900));
    return { price: Math.round(variant.price * (1 - discount)), reason: `Sobrestock (${Math.round(daysOfStock)} días)`, direction: 'down' };
  }

  // Rule 2: Fast seller <15 days stock — suggest 7% higher
  if (daysOfStock !== null && daysOfStock < 15 && daysOfStock > 0) {
    return { price: Math.round(variant.price * 1.07), reason: `Alta demanda (${Math.round(daysOfStock)} días stock)`, direction: 'up' };
  }

  // Rule 3: Low margin <15% — suggest targeting 20%
  if (margin !== null && margin < 15 && variant.cost !== null && variant.cost > 0) {
    const targetPrice = Math.round(variant.cost / 0.80);
    if (targetPrice > variant.price) {
      return { price: targetPrice, reason: `Margen bajo (${margin.toFixed(0)}% → 20%)`, direction: 'up' };
    }
  }

  return null;
}

export function ShopifyProductsPanel({ clientId, allSkuSales = [], connectionId: externalConnectionId, initialProducts }: ShopifyProductsPanelProps) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(externalConnectionId || null);
  const [hasConnection, setHasConnection] = useState(!!externalConnectionId);

  // Edit modal state
  const [editProduct, setEditProduct] = useState<ShopifyProduct | null>(null);
  const [editVariantIndex, setEditVariantIndex] = useState(0);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editStock, setEditStock] = useState('');
  const [saving, setSaving] = useState(false);

  // F5: AI Description
  const [descProduct, setDescProduct] = useState<ShopifyProduct | null>(null);
  const [generatedDesc, setGeneratedDesc] = useState('');
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);

  // F6: Photo Studio
  const [photoProduct, setPhotoProduct] = useState<ShopifyProduct | null>(null);

  // F8: Cross-sell
  const [crossSellData, setCrossSellData] = useState<Record<number, Array<{ productId: number; name: string; count: number; percentage: number }>>>({});
  const [loadingCrossSell, setLoadingCrossSell] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);

  // Update connectionId from external prop
  useEffect(() => {
    if (externalConnectionId) {
      setConnectionId(externalConnectionId);
      setHasConnection(true);
    }
  }, [externalConnectionId]);

  const openEditModal = (product: ShopifyProduct, variantIdx: number, prefilledPrice?: number) => {
    setEditProduct(product);
    setEditVariantIndex(variantIdx);
    setEditTitle(product.title);
    setEditPrice(prefilledPrice !== undefined ? String(prefilledPrice) : String(product.variants[variantIdx].price));
    setEditStock(product.variants[variantIdx].inventory_quantity !== null ? String(product.variants[variantIdx].inventory_quantity) : '');
  };

  const saveProductEdit = async () => {
    if (!editProduct || !connectionId) return;
    setSaving(true);
    const variant = editProduct.variants[editVariantIndex];
    try {
      const body: Record<string, any> = {
        connectionId,
        productId: editProduct.id,
        variant_id: variant.id,
      };
      if (editTitle !== editProduct.title) body.title = editTitle;
      if (editPrice !== String(variant.price)) body.price = parseFloat(editPrice);
      if (variant.inventory_quantity !== null && editStock !== String(variant.inventory_quantity) && variant.inventory_item_id) {
        body.inventory_quantity = parseInt(editStock, 10);
        body.inventory_item_id = variant.inventory_item_id;
      }

      const { error } = await callApi('update-shopify-product', { body });
      if (error) {
        toast.error('Error al actualizar: ' + error);
        return;
      }
      toast.success('Producto actualizado');
      setEditProduct(null);
      fetchProducts();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // F5: Generate AI description
  const generateDescription = async (product: ShopifyProduct) => {
    if (!connectionId) return;
    setDescProduct(product);
    setGeneratingDesc(true);
    setGeneratedDesc('');
    try {
      const { data, error } = await callApi<any>('generate-product-description', {
        body: { connectionId, productId: product.id, title: product.title, body_html: product.body_html },
      });
      if (error) {
        toast.error('Error: ' + error);
        return;
      }
      setGeneratedDesc(data?.generated_html || '');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setGeneratingDesc(false);
    }
  };

  const saveDescription = async () => {
    if (!descProduct || !connectionId || !generatedDesc) return;
    setSavingDesc(true);
    try {
      const { error } = await callApi('update-shopify-product', {
        body: { connectionId, productId: descProduct.id, body_html: generatedDesc },
      });
      if (error) {
        toast.error('Error: ' + error);
        return;
      }
      toast.success('Descripción actualizada en Shopify');
      setDescProduct(null);
      setGeneratedDesc('');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingDesc(false);
    }
  };

  // F8: Cross-sell
  const fetchCrossSell = async () => {
    if (!connectionId) return;
    setLoadingCrossSell(true);
    try {
      const { data, error } = await callApi<any>('compute-cross-sell', {
        body: { connectionId },
      });
      if (error) {
        toast.error('Error cross-sell: ' + error);
        return;
      }
      setCrossSellData(data?.crossSell || {});
      toast.success(`Combos frecuentes calculados (${data?.ordersAnalyzed || 0} pedidos analizados)`);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoadingCrossSell(false);
    }
  };

  // Use initialProducts from dashboard if available (avoids duplicate API call)
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0 && products.length === 0) {
      setProducts(initialProducts as ShopifyProduct[]);
    }
  }, [initialProducts]);

  useEffect(() => {
    if (!externalConnectionId) checkShopifyConnection();
  }, [clientId]);

  const checkShopifyConnection = async () => {
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data) {
      setConnectionId(data.id);
      setHasConnection(true);
    }
  };

  const fetchProducts = async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const { data, error } = await callApi('fetch-shopify-products', {
        body: { connectionId },
      });

      if (error) {
        toast.error('Error al cargar productos: ' + error);
        return;
      }

      if (data?.products) {
        setProducts(data.products);
        toast.success(`${data.count} productos cargados desde Shopify`);
      } else if (data?.error) {
        toast.error('Error: ' + data.error);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // F2: Restock alerts
  const restockAlerts = useMemo(() => {
    if (!products.length || !allSkuSales.length) return [];
    const salesMap = new Map(allSkuSales.map(s => [s.sku, s]));
    const alerts: Array<{ product: string; sku: string; daysOfStock: number; inventory: number }> = [];

    for (const product of products) {
      for (const variant of product.variants) {
        if (!variant.sku || variant.inventory_quantity === null || variant.inventory_quantity <= 0) continue;
        const sales = salesMap.get(variant.sku);
        if (!sales || sales.quantity === 0) continue;
        const velocity = sales.quantity / 30; // Assume 30-day period
        const daysOfStock = variant.inventory_quantity / velocity;
        if (daysOfStock < 14) {
          alerts.push({
            product: product.title,
            sku: variant.sku,
            daysOfStock: Math.round(daysOfStock),
            inventory: variant.inventory_quantity,
          });
        }
      }
    }
    return alerts.sort((a, b) => a.daysOfStock - b.daysOfStock);
  }, [products, allSkuSales]);

  // Build sales map for F10 and F2
  const salesMap = useMemo(() => new Map(allSkuSales.map(s => [s.sku, s])), [allSkuSales]);

  if (!hasConnection) {
    return (
      <Card className="bg-card border border-border rounded-xl card-hover">
        <CardContent className="py-8 text-center">
          <Package className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Conecta Shopify en la pestaña "Conexiones" para ver tus productos
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals
  const totalProducts = products.length;
  const variantsWithCost = products.flatMap(p => p.variants).filter(v => v.cost !== null);
  const variantsWithoutCost = products.flatMap(p => p.variants).filter(v => v.cost === null);
  const avgMargin = variantsWithCost.length > 0
    ? variantsWithCost.reduce((acc, v) => acc + ((v.price - (v.cost || 0)) / v.price) * 100, 0) / variantsWithCost.length
    : 0;

  return (
    <Card className="bg-card border border-border rounded-xl card-hover">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4" />
              Productos de Shopify
            </CardTitle>
            <CardDescription>
              Catálogo con márgenes, alertas de restock, precio sugerido y herramientas IA
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {products.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchCrossSell}
                disabled={loadingCrossSell}
              >
                {loadingCrossSell ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-1" />}
                Combos frecuentes
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProducts}
              disabled={loading}
            >
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {products.length > 0 ? 'Actualizar' : 'Cargar Productos'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {products.length === 0 && !loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Haz clic en "Cargar Productos" para importar tu catálogo</p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* F2: Restock alert banner */}
            {restockAlerts.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-red-700 dark:text-red-300 font-medium">
                  {restockAlerts.length} producto{restockAlerts.length !== 1 ? 's' : ''} con stock crítico
                </span>
                <span className="text-red-600/70 dark:text-red-400/70 text-xs">
                  ({restockAlerts.filter(a => a.daysOfStock < 7).length} con menos de 7 días)
                </span>
              </div>
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Productos</p>
                <p className="text-lg font-bold">{totalProducts}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Con costo</p>
                <p className="text-lg font-bold text-green-600">{variantsWithCost.length}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Sin costo</p>
                <p className="text-lg font-bold text-orange-500">{variantsWithoutCost.length}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Margen prom.</p>
                <p className="text-lg font-bold">{avgMargin.toFixed(1)}%</p>
              </div>
            </div>

            {variantsWithoutCost.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg mb-4 text-sm">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="text-orange-700 dark:text-orange-300">
                  {variantsWithoutCost.length} variantes sin costo definido en Shopify.
                </span>
              </div>
            )}

            {/* Products list — card-based layout */}
            <div className="space-y-2">
              {products.map((product) => {
                const mainVariant = product.variants[0];
                const margin = mainVariant?.cost !== null && mainVariant
                  ? ((mainVariant.price - (mainVariant.cost || 0)) / mainVariant.price * 100)
                  : null;
                const sales = mainVariant?.sku ? salesMap.get(mainVariant.sku) : undefined;
                const velocity = sales ? sales.quantity / 30 : 0;
                const daysOfStock = mainVariant?.inventory_quantity !== null && velocity > 0
                  ? Math.round((mainVariant.inventory_quantity ?? 0) / velocity)
                  : null;
                const suggestion = mainVariant ? getSuggestedPrice(mainVariant, sales, 30) : null;
                const crossSell = crossSellData[product.id];

                return (
                  <div key={product.id} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Image */}
                      <div className="shrink-0">
                        {product.image ? (
                          <img src={product.image} alt={product.title} className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <ImageOff className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm line-clamp-1">{product.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {mainVariant?.sku && (
                                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{mainVariant.sku}</span>
                              )}
                              {product.variants.length > 1 && (
                                <span className="text-[10px] text-muted-foreground">{product.variants.length} variantes</span>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditModal(product, 0)} title="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => generateDescription(product)} title="Descripción IA">
                              <Sparkles className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPhotoProduct(product)} title="Fotos IA">
                              <Camera className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Metrics row */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-sm font-semibold">${mainVariant?.price.toLocaleString('es-CL')}</span>

                          {margin !== null && (
                            <Badge
                              variant={margin >= 30 ? 'default' : margin >= 15 ? 'secondary' : 'destructive'}
                              className="font-mono text-[10px] px-1.5 py-0"
                            >
                              {margin.toFixed(0)}%
                            </Badge>
                          )}

                          {mainVariant?.inventory_quantity !== null && (
                            <span className="text-xs text-muted-foreground">
                              Stock: {mainVariant.inventory_quantity}
                              {daysOfStock !== null && (
                                <span className={`ml-1 font-medium ${
                                  daysOfStock < 7 ? 'text-red-600' : daysOfStock < 14 ? 'text-orange-600' : 'text-green-600'
                                }`}>
                                  ({daysOfStock}d)
                                </span>
                              )}
                            </span>
                          )}

                          {/* F10: Suggested price */}
                          {suggestion && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => openEditModal(product, 0, suggestion.price)}
                                    className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded cursor-pointer ${
                                      suggestion.direction === 'up'
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                                    }`}
                                  >
                                    {suggestion.direction === 'up' ? (
                                      <ArrowUpRight className="w-3 h-3" />
                                    ) : (
                                      <ArrowDownRight className="w-3 h-3" />
                                    )}
                                    ${suggestion.price.toLocaleString('es-CL')}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="font-medium">{suggestion.reason}</p>
                                  <p className="text-xs mt-1">Clic para aplicar</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* F8: Combos frecuentes — se muestra directo */}
                    {crossSell && crossSell.length > 0 && (
                      <div className="mt-2 pt-2 border-t flex items-center gap-2 text-xs flex-wrap">
                        <ShoppingCart className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-muted-foreground font-medium">Combo:</span>
                        {crossSell.map((cs, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {cs.name} <span className="ml-1 opacity-70">({cs.percentage}%)</span>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      {/* Edit Product Modal */}
      <Dialog open={!!editProduct} onOpenChange={open => !open && setEditProduct(null)}>
        <DialogContent className="max-w-md">
          {editProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  Editar Producto
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nombre del producto</label>
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Precio {editProduct.variants.length > 1 ? `(${editProduct.variants[editVariantIndex].title})` : ''}
                  </label>
                  <Input type="number" min="0" step="1" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                </div>
                {editProduct.variants[editVariantIndex].inventory_quantity !== null && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Stock {editProduct.variants.length > 1 ? `(${editProduct.variants[editVariantIndex].title})` : ''}
                    </label>
                    <Input type="number" min="0" step="1" value={editStock} onChange={e => setEditStock(e.target.value)} />
                  </div>
                )}
                <Button className="w-full" onClick={saveProductEdit} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* F5: AI Description Dialog */}
      <Dialog open={!!descProduct} onOpenChange={open => !open && setDescProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {descProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Descripción IA — {descProduct.title}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-sm font-medium mb-2">Antes</p>
                  <div className="p-3 rounded-lg border bg-muted/30 text-sm prose prose-sm max-w-none min-h-[100px]"
                    dangerouslySetInnerHTML={{ __html: descProduct.body_html || '<p class="text-muted-foreground">Sin descripción</p>' }}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Después (IA)</p>
                  {generatingDesc ? (
                    <div className="p-3 rounded-lg border text-center py-8">
                      <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground mt-2">Generando...</p>
                    </div>
                  ) : generatedDesc ? (
                    <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 text-sm prose prose-sm max-w-none min-h-[100px]"
                      dangerouslySetInnerHTML={{ __html: generatedDesc }}
                    />
                  ) : (
                    <div className="p-3 rounded-lg border text-sm text-muted-foreground text-center py-8">
                      Haz clic en "Regenerar" para generar
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => generateDescription(descProduct)} disabled={generatingDesc}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  {generatedDesc ? 'Regenerar' : 'Generar'}
                </Button>
                {generatedDesc && (
                  <Button onClick={saveDescription} disabled={savingDesc}>
                    {savingDesc ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    Aplicar en Shopify
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* F6: Photo Studio */}
      {photoProduct && connectionId && (
        <ShopifyPhotoStudio
          open={!!photoProduct}
          onOpenChange={(open) => !open && setPhotoProduct(null)}
          product={photoProduct}
          connectionId={connectionId}
          onSaved={fetchProducts}
        />
      )}
    </Card>
  );
}
