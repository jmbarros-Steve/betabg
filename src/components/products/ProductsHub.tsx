import { useState } from 'react';
import { Package, ShoppingBag, Download, RefreshCw, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useProducts, ProductWithDetails } from '@/hooks/useProducts';
import { ProductTable } from './ProductTable';
import { ImportDialog } from './ImportDialog';
import { PublishToMLDialog } from './PublishToMLDialog';
import { formatCLP } from '@/lib/priceMarkup';

interface ProductsHubProps {
  clientId: string;
}

export function ProductsHub({ clientId }: ProductsHubProps) {
  const { products, loading, error, refetch, stats } = useProducts(clientId);
  const [importPlatform, setImportPlatform] = useState<'shopify' | 'mercadolibre' | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);
  const [publishProduct, setPublishProduct] = useState<ProductWithDetails | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setFilterPlatform(null)}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-slate-500" />
              <span className="text-xs text-muted-foreground">Total Productos</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => setFilterPlatform(filterPlatform === 'shopify' ? null : 'shopify')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">En Shopify</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{stats.inShopify}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-yellow-500/50 transition-colors" onClick={() => setFilterPlatform(filterPlatform === 'mercadolibre' ? null : 'mercadolibre')}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-4 h-4 text-yellow-600 font-bold text-xs flex items-center justify-center">ML</span>
              <span className="text-xs text-muted-foreground">En MercadoLibre</span>
            </div>
            <p className="text-2xl font-bold text-yellow-700">{stats.inML}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Stock Total</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{stats.totalStock.toLocaleString('es-CL')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setImportPlatform('shopify')} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-1" />
          Importar Shopify
        </Button>
        <Button onClick={() => setImportPlatform('mercadolibre')} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-1" />
          Importar MercadoLibre
        </Button>
        <Button onClick={refetch} variant="ghost" size="sm">
          <RefreshCw className="w-4 h-4 mr-1" />
          Actualizar
        </Button>

        {filterPlatform && (
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setFilterPlatform(null)}
          >
            Filtro: {filterPlatform === 'shopify' ? 'Shopify' : 'ML'} &times;
          </Badge>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
          Error cargando productos: {error}
        </div>
      )}

      {/* Product table */}
      <ProductTable
        products={products}
        onPublishML={(p) => setPublishProduct(p)}
        filterPlatform={filterPlatform}
      />

      {/* Import dialog */}
      {importPlatform && (
        <ImportDialog
          open={!!importPlatform}
          onClose={() => setImportPlatform(null)}
          platform={importPlatform}
          clientId={clientId}
          onSuccess={refetch}
        />
      )}

      {/* Publish to ML dialog */}
      {publishProduct && (
        <PublishToMLDialog
          open={!!publishProduct}
          onClose={() => setPublishProduct(null)}
          product={publishProduct}
          clientId={clientId}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}
