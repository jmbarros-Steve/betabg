import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShoppingBag, Eye, FolderOpen, Package } from 'lucide-react';
import { useBestSellers, type Product } from './useBestSellers';
import { useMostViewed } from './useMostViewed';
import { useShopifyCollections, type CollectionProduct } from './useShopifyCollections';

interface ProductBlockSelectorProps {
  clientId: string;
  selectedProducts: Product[];
  onProductsChange: (products: Product[]) => void;
  maxProducts?: number;
}

function formatPrice(price: string): string {
  if (!price) return '';
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `$${num.toLocaleString('es-CL')}`;
}

function ProductCard({
  product,
  isSelected,
  onToggle,
  disabled,
}: {
  product: Product;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary border-primary' : ''
      } ${disabled && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={() => { if (!disabled || isSelected) onToggle(); }}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => { if (!disabled || isSelected) onToggle(); }}
            className="mt-1 shrink-0"
          />
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title}
                className="w-12 h-12 object-cover rounded-md shrink-0"
              />
            ) : (
              <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{product.title}</p>
              <div className="flex items-center gap-2 mt-1">
                {product.price && (
                  <span className="text-xs text-muted-foreground">{formatPrice(product.price)}</span>
                )}
                {product.count > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {product.count}x
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Package className="w-10 h-10 mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Cargando productos...</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-destructive">
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function ProductBlockSelector({
  clientId,
  selectedProducts,
  onProductsChange,
  maxProducts = 6,
}: ProductBlockSelectorProps) {
  const bestSellers = useBestSellers(clientId);
  const mostViewed = useMostViewed(clientId);
  const shopifyCollections = useShopifyCollections(clientId);

  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [collectionProducts, setCollectionProducts] = useState<Product[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const isSelected = (product: Product) =>
    selectedProducts.some((p) => p.title === product.title && p.handle === product.handle);

  const toggleProduct = (product: Product) => {
    if (isSelected(product)) {
      onProductsChange(selectedProducts.filter((p) => !(p.title === product.title && p.handle === product.handle)));
    } else if (selectedProducts.length < maxProducts) {
      onProductsChange([...selectedProducts, product]);
    }
  };

  const atLimit = selectedProducts.length >= maxProducts;

  const handleCollectionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value ? Number(e.target.value) : null;
    setSelectedCollectionId(id);

    if (!id) {
      setCollectionProducts([]);
      return;
    }

    setCollectionLoading(true);
    setCollectionError(null);
    try {
      const products = await shopifyCollections.fetchProducts(id);
      setCollectionProducts(
        products.map((p: CollectionProduct) => ({
          title: p.title,
          image_url: p.image_url,
          price: p.price,
          handle: p.handle,
          url: p.url,
          count: 0,
        })),
      );
    } catch (err) {
      setCollectionError(err instanceof Error ? err.message : 'Error al cargar productos');
      setCollectionProducts([]);
    } finally {
      setCollectionLoading(false);
    }
  };

  const renderProductList = (products: Product[], loading: boolean, error: string | null) => {
    if (loading) return <LoadingState />;
    if (error) return <ErrorState message={error} />;
    if (products.length === 0) return <EmptyState message="No se encontraron productos" />;

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
        {products.map((product, idx) => (
          <ProductCard
            key={`${product.handle || product.title}-${idx}`}
            product={product}
            isSelected={isSelected(product)}
            onToggle={() => toggleProduct(product)}
            disabled={atLimit}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Seleccionar productos</h4>
        <Badge variant="outline" className="text-xs">
          {selectedProducts.length}/{maxProducts}
        </Badge>
      </div>

      <Tabs defaultValue="best-sellers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="best-sellers" className="text-xs gap-1">
            <ShoppingBag className="w-3.5 h-3.5" />
            Mas vendidos
          </TabsTrigger>
          <TabsTrigger value="most-viewed" className="text-xs gap-1">
            <Eye className="w-3.5 h-3.5" />
            Mas vistos
          </TabsTrigger>
          <TabsTrigger value="collection" className="text-xs gap-1">
            <FolderOpen className="w-3.5 h-3.5" />
            Coleccion
          </TabsTrigger>
        </TabsList>

        <TabsContent value="best-sellers" className="mt-3">
          {renderProductList(bestSellers.products, bestSellers.loading, bestSellers.error)}
        </TabsContent>

        <TabsContent value="most-viewed" className="mt-3">
          {renderProductList(mostViewed.products, mostViewed.loading, mostViewed.error)}
        </TabsContent>

        <TabsContent value="collection" className="mt-3 space-y-3">
          {shopifyCollections.loading ? (
            <LoadingState />
          ) : shopifyCollections.error ? (
            <ErrorState message={shopifyCollections.error} />
          ) : (
            <>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedCollectionId ?? ''}
                onChange={handleCollectionChange}
              >
                <option value="">Seleccionar coleccion...</option>
                {shopifyCollections.collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title} ({col.products_count} productos)
                  </option>
                ))}
              </select>

              {selectedCollectionId && renderProductList(collectionProducts, collectionLoading, collectionError)}
              {!selectedCollectionId && (
                <EmptyState message="Selecciona una coleccion para ver sus productos" />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
