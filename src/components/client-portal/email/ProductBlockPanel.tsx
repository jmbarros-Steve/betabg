import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2, Search, ShoppingBag, Star, ShoppingCart, Package, Check,
} from 'lucide-react';

interface Product {
  id: string;
  title: string;
  handle: string;
  product_type: string;
  image_url: string;
  price: string;
  url: string;
}

interface ProductBlockPanelProps {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}

export function ProductBlockPanel({ clientId, isOpen, onClose, onInsert }: ProductBlockPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  // Config — simplified
  const [columns, setColumns] = useState('2');
  const [showPrice, setShowPrice] = useState(true);
  const [buttonText, setButtonText] = useState('Comprar');

  // Active tab
  const [activeTab, setActiveTab] = useState('populares');

  // Load products when panel opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedProducts([]);
    setSearchQuery('');
    setSearchResults([]);
    setActiveTab('populares');
    loadProducts();
  }, [isOpen, clientId]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('email-product-recommendations', {
        body: { action: 'list_products', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setProducts(data?.products || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Real-time search with debounce via useEffect
  useEffect(() => {
    if (activeTab !== 'search') return;
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await callApi<any>('email-product-recommendations', {
        body: { action: 'search_products', client_id: clientId, query },
      });
      if (error) { toast.error(error); return; }
      setSearchResults(data?.products || []);
    } finally {
      setSearching(false);
    }
  };

  const toggleProduct = (product: Product) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.id === product.id);
      if (exists) return prev.filter(p => p.id !== product.id);
      return [...prev, product];
    });
  };

  const isSelected = (id: string) => selectedProducts.some(p => p.id === id);

  // Populares: merge best sellers + new arrivals sorted by relevance (price desc as proxy)
  const getPopularProducts = (): Product[] => {
    return [...products].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price || '0');
    return num.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 });
  };

  // Generate the HTML block — always shows button
  const generateHTML = (productsToRender: Product[]): string => {
    const cols = parseInt(columns, 10) || 2;
    const colWidth = Math.floor(100 / cols);

    if (productsToRender.length === 0) return '';

    let rows = '';
    for (let i = 0; i < productsToRender.length; i += cols) {
      let cells = '';
      for (let j = 0; j < cols; j++) {
        const p = productsToRender[i + j];
        if (!p) {
          cells += `<td style="width:${colWidth}%;padding:8px;"></td>`;
          continue;
        }
        cells += `<td style="width:${colWidth}%;padding:8px;vertical-align:top;text-align:center;">`;
        if (p.image_url) {
          cells += `<a href="${p.url}" style="text-decoration:none;"><img src="${p.image_url}" alt="${p.title}" style="width:100%;max-width:280px;border-radius:8px;display:block;margin:0 auto;" /></a>`;
        }
        cells += `<p style="margin:8px 0 4px;font-weight:600;font-size:14px;color:#18181b;"><a href="${p.url}" style="text-decoration:none;color:#18181b;">${p.title}</a></p>`;
        if (showPrice) {
          cells += `<p style="margin:0 0 8px;font-size:13px;color:#71717a;">${formatPrice(p.price)}</p>`;
        }
        cells += `<a href="${p.url}" style="display:inline-block;padding:8px 20px;background:#18181b;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">${buttonText}</a>`;
        cells += '</td>';
      }
      rows += `<tr>${cells}</tr>`;
    }

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">${rows}</table>`;
  };

  // Handle insert for selected products
  const handleInsert = () => {
    if (selectedProducts.length === 0) {
      toast.error('Selecciona al menos un producto');
      return;
    }
    const html = `<div data-steve-products="true" data-product-type="manual" data-product-count="${selectedProducts.length}" data-columns="${columns}">` +
      generateHTML(selectedProducts) +
    `</div>`;
    onInsert(html);
    onClose();
    setSelectedProducts([]);
    toast.success(`${selectedProducts.length} producto${selectedProducts.length !== 1 ? 's' : ''} insertado${selectedProducts.length !== 1 ? 's' : ''}`);
  };

  // Handle insert for abandoned cart (special dynamic block)
  const handleInsertCart = () => {
    const cols = parseInt(columns, 10) || 2;
    const html = `<div data-steve-products="true" data-product-type="abandoned_cart" data-columns="${cols}" style="padding:16px;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
        `<tr><td style="padding:0 0 12px;text-align:center;"><p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">Carrito abandonado</p></td></tr>` +
        `<tr><td style="padding:20px;text-align:center;background:#fafafa;border-radius:8px;border:1px dashed #d4d4d8;">` +
          `<p style="margin:0 0 4px;font-size:14px;color:#71717a;">Los productos del carrito de cada contacto</p>` +
          `<p style="margin:0;font-size:12px;color:#a1a1aa;">Se personalizan automáticamente al enviar</p>` +
        `</td></tr>` +
      `</table>` +
    `</div>`;
    onInsert(html);
    onClose();
    toast.success('Bloque de carrito abandonado insertado');
  };

  // Skeleton loading cards
  const renderSkeletons = () => (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-2">
            <div className="w-full h-32 bg-muted rounded-md mb-2" />
            <div className="h-3 bg-muted rounded w-3/4 mb-1.5" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // Product card grid with checkbox selection
  const renderProductGrid = (productList: Product[]) => (
    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
      {productList.map((product) => (
        <Card
          key={product.id}
          className={`cursor-pointer transition-all hover:border-primary/50 ${
            isSelected(product.id) ? 'border-primary ring-1 ring-primary bg-primary/5' : ''
          }`}
          onClick={() => toggleProduct(product)}
        >
          <CardContent className="p-2">
            <div className="relative">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full h-32 object-cover rounded-md mb-2"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-32 bg-muted rounded-md mb-2 flex items-center justify-center">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              {/* Checkbox indicator */}
              <div className={`absolute top-1 right-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSelected(product.id)
                  ? 'bg-primary border-primary'
                  : 'bg-white/80 border-gray-300'
              }`}>
                {isSelected(product.id) && <Check className="w-4 h-4 text-primary-foreground" />}
              </div>
            </div>
            <p className="text-xs font-medium truncate">{product.title}</p>
            <p className="text-xs text-muted-foreground">{formatPrice(product.price)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // Column visual selector
  const ColumnSelector = () => (
    <div className="flex items-center gap-2">
      <Label className="text-xs whitespace-nowrap">Columnas</Label>
      <div className="flex gap-1">
        {['1', '2', '3'].map((col) => (
          <button
            key={col}
            onClick={() => setColumns(col)}
            className={`w-8 h-8 rounded-md border text-xs font-medium transition-colors ${
              columns === col
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-input'
            }`}
          >
            {col}
          </button>
        ))}
      </div>
    </div>
  );

  // Bottom bar with selection count and insert button
  const renderBottomBar = () => {
    if (activeTab === 'cart') return null;
    return (
      <div className="flex items-center justify-between pt-3 border-t mt-3">
        <p className="text-sm text-muted-foreground">
          {selectedProducts.length} producto{selectedProducts.length !== 1 ? 's' : ''} seleccionado{selectedProducts.length !== 1 ? 's' : ''}
        </p>
        <Button
          onClick={handleInsert}
          disabled={selectedProducts.length === 0}
        >
          <ShoppingBag className="w-4 h-4 mr-2" />
          Insertar {selectedProducts.length} producto{selectedProducts.length !== 1 ? 's' : ''}
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Insertar Productos
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Cargando productos de Shopify...</p>
            {renderSkeletons()}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No se encontraron productos.</p>
            <p className="text-xs text-muted-foreground mt-1">Verifica tu conexión con Shopify.</p>
          </div>
        ) : (
          <>
            {/* Simplified config row */}
            <div className="flex items-center gap-4 pb-3 border-b flex-wrap">
              <ColumnSelector />
              <div className="flex items-center gap-2">
                <Label className="text-xs">Mostrar precio</Label>
                <Switch checked={showPrice} onCheckedChange={setShowPrice} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Texto del botón</Label>
                <Input
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  className="h-8 w-24 text-xs"
                  placeholder="Comprar"
                />
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="populares" className="text-xs gap-1">
                  <Star className="w-3 h-3" /> Populares
                </TabsTrigger>
                <TabsTrigger value="search" className="text-xs gap-1">
                  <Search className="w-3 h-3" /> Buscar
                </TabsTrigger>
                <TabsTrigger value="cart" className="text-xs gap-1">
                  <ShoppingCart className="w-3 h-3" /> Carrito abandonado
                </TabsTrigger>
              </TabsList>

              {/* Populares — merged best sellers + new arrivals */}
              <TabsContent value="populares" className="mt-4 space-y-3">
                {renderProductGrid(getPopularProducts())}
                {renderBottomBar()}
              </TabsContent>

              {/* Buscar */}
              <TabsContent value="search" className="mt-4 space-y-3">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, tipo..."
                  className="h-9"
                />
                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Buscando...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <>
                    {renderProductGrid(searchResults)}
                    {renderBottomBar()}
                  </>
                ) : searchQuery.trim() ? (
                  <div className="text-center py-8">
                    <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No hay resultados para '{searchQuery}'</p>
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Escribe el nombre de un producto para buscar
                  </p>
                )}
              </TabsContent>

              {/* Carrito abandonado */}
              <TabsContent value="cart" className="mt-4 space-y-4">
                <div className="rounded-lg border border-dashed p-6 text-center bg-muted/30">
                  <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Productos del Carrito Abandonado</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Este bloque se personaliza automáticamente con los productos que cada contacto dejó en su carrito.
                    En el editor verás un placeholder, pero al enviar se reemplazan con productos reales.
                  </p>
                  <Button onClick={handleInsertCart}>
                    <ShoppingCart className="w-4 h-4 mr-2" /> Insertar Bloque de Carrito
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
