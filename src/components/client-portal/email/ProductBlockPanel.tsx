import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2, Search, ShoppingBag, Star, Sparkles, ShoppingCart, Package, Check, X, Plus,
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

  // Selection state for "Fijos" tab
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  // Config
  const [columns, setColumns] = useState('2');
  const [showPrice, setShowPrice] = useState(true);
  const [showButton, setShowButton] = useState(true);
  const [buttonText, setButtonText] = useState('Comprar');
  const [buttonColor, setButtonColor] = useState('#18181b');

  // Active tab
  const [activeTab, setActiveTab] = useState('best_sellers');

  // Load products when panel opens
  useEffect(() => {
    if (!isOpen) return;
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await callApi<any>('email-product-recommendations', {
        body: { action: 'search_products', client_id: clientId, query: searchQuery },
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

  // Get products for current tab
  const getTabProducts = (): Product[] => {
    switch (activeTab) {
      case 'best_sellers':
        // Sort by price desc as proxy for popularity
        return [...products].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
      case 'new_arrivals':
        // Already sorted by recency from Shopify
        return products;
      case 'search':
        return searchResults;
      case 'fixed':
        return selectedProducts;
      default:
        return products;
    }
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price || '0');
    return num.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 });
  };

  // Generate the HTML block
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
        if (showButton) {
          cells += `<a href="${p.url}" style="display:inline-block;padding:8px 20px;background:${buttonColor};color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">${buttonText}</a>`;
        }
        cells += '</td>';
      }
      rows += `<tr>${cells}</tr>`;
    }

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">${rows}</table>`;
  };

  // Handle insert for dynamic types (best_sellers, new_arrivals, cart)
  const handleInsertDynamic = (type: string) => {
    const typeLabels: Record<string, string> = {
      best_sellers: 'Más vendidos',
      new_arrivals: 'Nuevos',
      abandoned_cart: 'Carrito abandonado',
    };
    const tabProducts = getTabProducts().slice(0, 6);

    if (type === 'abandoned_cart') {
      // Cart items are per-subscriber — insert a merge tag placeholder with real styling
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
      return;
    }

    if (tabProducts.length === 0) {
      toast.error('No hay productos para insertar');
      return;
    }

    const label = typeLabels[type] || 'Productos';
    const html = `<div data-steve-products="true" data-product-type="${type}" data-product-count="${tabProducts.length}" data-columns="${columns}">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
        `<tr><td colspan="${columns}" style="padding:0 0 8px;text-align:center;"><p style="margin:0;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">${label}</p></td></tr>` +
      `</table>` +
      generateHTML(tabProducts) +
    `</div>`;

    onInsert(html);
    onClose();
    toast.success(`${tabProducts.length} productos insertados`);
  };

  // Handle insert for fixed/manual selection
  const handleInsertFixed = () => {
    if (selectedProducts.length === 0) {
      toast.error('Selecciona al menos un producto');
      return;
    }
    const html = generateHTML(selectedProducts);
    onInsert(html);
    onClose();
    setSelectedProducts([]);
    toast.success(`${selectedProducts.length} productos insertados`);
  };

  const renderProductGrid = (productList: Product[], selectable: boolean) => (
    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
      {productList.map((product) => (
        <Card
          key={product.id}
          className={`cursor-pointer transition-all hover:border-primary/50 ${
            selectable && isSelected(product.id) ? 'border-primary ring-1 ring-primary bg-primary/5' : ''
          }`}
          onClick={() => selectable && toggleProduct(product)}
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
              {selectable && isSelected(product.id) && (
                <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
            <p className="text-xs font-medium truncate">{product.title}</p>
            <p className="text-xs text-muted-foreground">{formatPrice(product.price)}</p>
            {product.product_type && (
              <Badge variant="outline" className="text-[10px] mt-1">{product.product_type}</Badge>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

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
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Cargando productos de Shopify...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No se encontraron productos en Shopify</p>
            <p className="text-xs text-muted-foreground mt-1">Verifica que la tienda esté conectada</p>
          </div>
        ) : (
          <>
            {/* Config row */}
            <div className="flex items-center gap-4 pb-3 border-b">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Columnas:</Label>
                <Select value={columns} onValueChange={setColumns}>
                  <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Precio</Label>
                <Switch checked={showPrice} onCheckedChange={setShowPrice} />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Botón</Label>
                <Switch checked={showButton} onCheckedChange={setShowButton} />
              </div>
              {showButton && (
                <>
                  <Input
                    value={buttonText}
                    onChange={(e) => setButtonText(e.target.value)}
                    className="h-8 w-24 text-xs"
                    placeholder="Comprar"
                  />
                  <Input
                    type="color"
                    value={buttonColor}
                    onChange={(e) => setButtonColor(e.target.value)}
                    className="h-8 w-10 p-0.5 cursor-pointer"
                  />
                </>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-5">
                <TabsTrigger value="best_sellers" className="text-xs gap-1">
                  <Star className="w-3 h-3" /> Más vendidos
                </TabsTrigger>
                <TabsTrigger value="new_arrivals" className="text-xs gap-1">
                  <Sparkles className="w-3 h-3" /> Nuevos
                </TabsTrigger>
                <TabsTrigger value="abandoned_cart" className="text-xs gap-1">
                  <ShoppingCart className="w-3 h-3" /> Carrito
                </TabsTrigger>
                <TabsTrigger value="search" className="text-xs gap-1">
                  <Search className="w-3 h-3" /> Buscar
                </TabsTrigger>
                <TabsTrigger value="fixed" className="text-xs gap-1">
                  <Plus className="w-3 h-3" /> Elegir
                </TabsTrigger>
              </TabsList>

              {/* Más vendidos */}
              <TabsContent value="best_sellers" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Productos ordenados por precio/popularidad. Se actualizan al enviar el email.
                </p>
                {renderProductGrid(
                  [...products].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, 8),
                  false
                )}
                <Button className="w-full" onClick={() => handleInsertDynamic('best_sellers')}>
                  <ShoppingBag className="w-4 h-4 mr-2" /> Insertar Más Vendidos
                </Button>
              </TabsContent>

              {/* Nuevos */}
              <TabsContent value="new_arrivals" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Los productos más recientes de tu tienda.
                </p>
                {renderProductGrid(products.slice(0, 8), false)}
                <Button className="w-full" onClick={() => handleInsertDynamic('new_arrivals')}>
                  <Sparkles className="w-4 h-4 mr-2" /> Insertar Productos Nuevos
                </Button>
              </TabsContent>

              {/* Carrito abandonado */}
              <TabsContent value="abandoned_cart" className="mt-4 space-y-4">
                <div className="rounded-lg border border-dashed p-6 text-center bg-muted/30">
                  <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Productos del Carrito Abandonado</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Este bloque se personaliza automáticamente con los productos que cada contacto dejó en su carrito.
                    En el editor verás un placeholder, pero al enviar se reemplazan con productos reales.
                  </p>
                  <Button onClick={() => handleInsertDynamic('abandoned_cart')}>
                    <ShoppingCart className="w-4 h-4 mr-2" /> Insertar Bloque de Carrito
                  </Button>
                </div>
              </TabsContent>

              {/* Buscar */}
              <TabsContent value="search" className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nombre, tipo..."
                    className="h-9"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button size="sm" onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {searchResults.length > 0 ? (
                  <>
                    {renderProductGrid(searchResults, true)}
                    {selectedProducts.length > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <p className="text-xs text-muted-foreground">
                          {selectedProducts.length} producto{selectedProducts.length !== 1 ? 's' : ''} seleccionado{selectedProducts.length !== 1 ? 's' : ''}
                        </p>
                        <Button size="sm" onClick={handleInsertFixed}>
                          Insertar Seleccionados
                        </Button>
                      </div>
                    )}
                  </>
                ) : searchQuery ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Sin resultados para "{searchQuery}"</p>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">Escribe el nombre de un producto y presiona Enter</p>
                )}
              </TabsContent>

              {/* Elegir (Fijos) */}
              <TabsContent value="fixed" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Selecciona los productos exactos que quieres mostrar. Haz clic para agregar o quitar.
                </p>

                {/* Selected products summary */}
                {selectedProducts.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
                    {selectedProducts.map((p) => (
                      <Badge key={p.id} variant="secondary" className="gap-1 cursor-pointer hover:bg-destructive/20" onClick={() => toggleProduct(p)}>
                        {p.image_url && <img src={p.image_url} alt="" className="w-4 h-4 rounded object-cover" />}
                        {p.title.length > 20 ? p.title.slice(0, 20) + '...' : p.title}
                        <X className="w-3 h-3" />
                      </Badge>
                    ))}
                  </div>
                )}

                {/* All products grid - selectable */}
                {renderProductGrid(products, true)}

                {selectedProducts.length > 0 && (
                  <Button className="w-full" onClick={handleInsertFixed}>
                    <Check className="w-4 h-4 mr-2" /> Insertar {selectedProducts.length} Producto{selectedProducts.length !== 1 ? 's' : ''}
                  </Button>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
