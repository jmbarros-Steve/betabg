import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ArrowUpDown, ExternalLink, Package } from 'lucide-react';
import { ProductWithDetails } from '@/hooks/useProducts';
import { formatCLP } from '@/lib/priceMarkup';

interface ProductTableProps {
  products: ProductWithDetails[];
  onPublishML: (product: ProductWithDetails) => void;
  filterPlatform: string | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  shopify: 'bg-green-100 text-green-800',
  mercadolibre: 'bg-yellow-100 text-yellow-800',
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  mercadolibre: 'ML',
};

type SortKey = 'name' | 'basePrice' | 'totalStock' | 'updated_at';

export function ProductTable({ products, onPublishML, filterPlatform }: ProductTableProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = products
    .filter((p) => {
      if (filterPlatform && !p.platforms.includes(filterPlatform)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'basePrice': cmp = a.basePrice - b.basePrice; break;
        case 'totalStock': cmp = a.totalStock - b.totalStock; break;
        default: cmp = 0;
      }
      return sortAsc ? cmp : -cmp;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const isInML = (p: ProductWithDetails) => p.platforms.includes('mercadolibre');

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, SKU, marca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16"></TableHead>
              <TableHead>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground">
                  Producto <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-center">Variantes</TableHead>
              <TableHead>
                <button onClick={() => toggleSort('basePrice')} className="flex items-center gap-1 hover:text-foreground">
                  Precio <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('totalStock')} className="flex items-center gap-1 hover:text-foreground">
                  Stock <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead>Plataformas</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  {search ? 'No se encontraron productos' : 'Sin productos. Importa desde Shopify o MercadoLibre.'}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  {product.images[0]?.src ? (
                    <img
                      src={product.images[0].src}
                      alt={product.name}
                      className="w-12 h-12 rounded-md object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-md bg-slate-100 flex items-center justify-center">
                      <Package className="w-5 h-5 text-slate-400" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                    {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {product.sku?.replace('shopify-', 'S-').replace('ml-', 'ML-') || '—'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary">{product.variants.length}</Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm space-y-0.5">
                    {product.shopifyPrice != null && (
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        <span>{formatCLP(product.shopifyPrice)}</span>
                      </div>
                    )}
                    {product.mlPrice != null && (
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                        <span>{formatCLP(product.mlPrice)}</span>
                      </div>
                    )}
                    {product.shopifyPrice == null && product.mlPrice == null && (
                      <span className="text-muted-foreground">{formatCLP(product.basePrice)}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`font-medium ${product.totalStock <= 0 ? 'text-red-600' : product.totalStock < 5 ? 'text-amber-600' : 'text-foreground'}`}>
                    {product.totalStock}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {product.platforms.map((p) => (
                      <Badge key={p} className={`text-xs ${PLATFORM_COLORS[p] || 'bg-slate-100 text-slate-800'}`}>
                        {PLATFORM_LABELS[p] || p}
                      </Badge>
                    ))}
                    {product.platforms.length === 0 && (
                      <Badge variant="outline" className="text-xs">Local</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {!isInML(product) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onPublishML(product)}
                        className="text-xs h-7"
                      >
                        Publicar en ML
                      </Button>
                    )}
                    {isInML(product) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => {
                          const mlListing = product.variants.flatMap(v => v.listings).find(l => l.platform === 'mercadolibre');
                          if (mlListing?.platformUrl) window.open(mlListing.platformUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Ver en ML
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} de {products.length} productos
      </p>
    </div>
  );
}
