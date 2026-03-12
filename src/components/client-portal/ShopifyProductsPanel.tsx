import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Package, RefreshCw, AlertTriangle, TrendingUp, ImageOff } from 'lucide-react';

interface ShopifyProductsPanelProps {
  clientId: string;
}

interface ProductVariant {
  id: number;
  title: string;
  sku: string;
  price: number;
  cost: number | null;
  inventory_quantity: number | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  product_type: string;
  image: string | null;
  variants: ProductVariant[];
}

export function ShopifyProductsPanel({ clientId }: ShopifyProductsPanelProps) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState(false);

  useEffect(() => {
    checkShopifyConnection();
  }, [clientId]);

  const checkShopifyConnection = async () => {
    const { data, error } = await supabase
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
        // Error handled by toast below
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

  if (!hasConnection) {
    return (
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
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
    <Card className="bg-white border border-slate-200 rounded-xl card-hover">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="w-4 h-4" />
              Productos de Shopify
            </CardTitle>
            <CardDescription>
              Importa tus productos para calcular márgenes reales basados en el costo de Shopify
            </CardDescription>
          </div>
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
                  {variantsWithoutCost.length} variantes sin costo definido en Shopify. Se usará el margen por defecto.
                </span>
              </div>
            )}

            {/* Products table */}
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) =>
                    product.variants.map((variant, vi) => {
                      const margin = variant.cost !== null
                        ? ((variant.price - variant.cost) / variant.price * 100)
                        : null;
                      const isFirstVariant = vi === 0;
                      return (
                        <TableRow key={`${product.id}-${variant.id}`}>
                          <TableCell className="p-2">
                            {isFirstVariant && (
                              product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.title}
                                  className="w-10 h-10 rounded object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                                  <ImageOff className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              {isFirstVariant && (
                                <p className="font-medium text-sm line-clamp-1">{product.title}</p>
                              )}
                              {product.variants.length > 1 && (
                                <p className="text-xs text-muted-foreground">{variant.title}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">
                              {variant.sku || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${variant.price.toLocaleString('es-CL')}
                          </TableCell>
                          <TableCell className="text-right">
                            {variant.cost !== null ? (
                              <span className="font-medium">${variant.cost.toLocaleString('es-CL')}</span>
                            ) : (
                              <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/30">
                                Sin costo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {margin !== null ? (
                              <Badge
                                variant={margin >= 30 ? 'default' : margin >= 15 ? 'secondary' : 'destructive'}
                                className="font-mono"
                              >
                                <TrendingUp className="w-3 h-3 mr-1" />
                                {margin.toFixed(1)}%
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {variant.inventory_quantity !== null ? variant.inventory_quantity : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
