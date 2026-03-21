import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2, Search, ShoppingBag, Star, ShoppingCart, Package, Check, X,
  Zap, TrendingUp, RotateCcw, Eye, Bell,
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

// ─── Dynamic feed definitions ──────────────────────────────────────────────

interface DynamicFeed {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  productType: string;
}

const DYNAMIC_FEEDS: DynamicFeed[] = [
  {
    id: 'best_sellers',
    label: 'Best Sellers',
    description: 'Los productos más vendidos de tu tienda. Se actualiza automáticamente según ventas recientes.',
    icon: <TrendingUp className="w-5 h-5 text-amber-600" />,
    productType: 'best_sellers',
  },
  {
    id: 'recently_viewed',
    label: 'Últimos Vistos',
    description: 'Productos que cada contacto ha visto recientemente. Personalizado por suscriptor.',
    icon: <Eye className="w-5 h-5 text-blue-600" />,
    productType: 'recently_viewed',
  },
  {
    id: 'new_arrivals',
    label: 'Recomendados / Nuevos',
    description: 'Los productos más recientes de tu catálogo. Ideal para newsletters.',
    icon: <Star className="w-5 h-5 text-purple-600" />,
    productType: 'new_arrivals',
  },
  {
    id: 'back_in_stock',
    label: 'Back in Stock',
    description: 'Productos que volvieron a estar disponibles. Se personaliza según alertas del contacto.',
    icon: <Bell className="w-5 h-5 text-green-600" />,
    productType: 'back_in_stock',
  },
  {
    id: 'complementary',
    label: 'Complementarios',
    description: 'Productos relacionados con la última compra de cada contacto.',
    icon: <Zap className="w-5 h-5 text-orange-600" />,
    productType: 'complementary',
  },
  {
    id: 'abandoned_cart',
    label: 'Carrito Abandonado',
    description: 'Los productos que cada contacto dejó en su carrito. Personalizado automáticamente.',
    icon: <ShoppingCart className="w-5 h-5 text-red-600" />,
    productType: 'abandoned_cart',
  },
];

export function ProductBlockPanel({ clientId, isOpen, onClose, onInsert }: ProductBlockPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  // Config
  const [columns, setColumns] = useState('2');
  const [showPrice, setShowPrice] = useState(true);
  const [buttonText, setButtonText] = useState('Comprar');
  const [productCount, setProductCount] = useState('4');

  // Active tab
  const [activeTab, setActiveTab] = useState('dynamic');

  // Load products when panel opens
  useEffect(() => {
    if (!isOpen) return;
    setSelectedProducts([]);
    setSearchQuery('');
    setSearchResults([]);
    setActiveTab('dynamic');
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

  // Real-time search with debounce
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

  const getPopularProducts = (): Product[] => {
    return [...products].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price || '0');
    return num.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 });
  };

  // Generate static HTML for manual product selection
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

  // Handle insert for selected products (manual)
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

  // Handle insert for dynamic feed
  const handleInsertDynamic = (feed: DynamicFeed) => {
    const cols = parseInt(columns, 10) || 2;
    const count = parseInt(productCount, 10) || 4;

    const feedLabels: Record<string, string> = {
      best_sellers: 'Los más vendidos',
      recently_viewed: 'Últimos vistos',
      new_arrivals: 'Recomendados para ti',
      back_in_stock: 'De vuelta en stock',
      complementary: 'También te puede gustar',
      abandoned_cart: 'Olvidaste algo en tu carrito',
    };

    const html = `<div data-steve-products="true" data-product-type="${feed.productType}" data-product-count="${count}" data-columns="${cols}" data-show-price="${showPrice}" data-show-button="true" data-button-text="${buttonText}" data-button-color="#18181b" data-dynamic-feed="true" style="padding:16px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr><td style="padding:0 0 16px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">Productos dinámicos</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#18181b;">${feedLabels[feed.productType] || feed.label}</p>
    </td></tr>
    <tr><td style="padding:20px;text-align:center;background:#fafafa;border-radius:8px;border:1px dashed #d4d4d8;">
      <p style="margin:0 0 4px;font-size:14px;color:#71717a;">${count} productos · ${cols} columna${cols > 1 ? 's' : ''}</p>
      <p style="margin:0;font-size:12px;color:#a1a1aa;">Se personalizan automáticamente con datos de Shopify al enviar</p>
    </td></tr>
  </table>
</div>`;

    onInsert(html);
    onClose();
    toast.success(`Feed "${feed.label}" insertado — se personaliza al enviar`);
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
  const renderBottomBar = () => (
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

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            Insertar Productos
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shared config row */}
        <div className="flex items-center gap-4 pb-3 border-b flex-wrap">
          <ColumnSelector />
          <div className="flex items-center gap-2">
            <Label className="text-xs">Precio</Label>
            <Switch checked={showPrice} onCheckedChange={setShowPrice} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Botón</Label>
            <Input
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              className="h-8 w-24 text-xs"
              placeholder="Comprar"
            />
          </div>
          {activeTab === 'dynamic' && (
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Cantidad</Label>
              <Select value={productCount} onValueChange={setProductCount}>
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="6">6</SelectItem>
                  <SelectItem value="8">8</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="dynamic" className="text-xs gap-1">
              <Zap className="w-3 h-3" /> Feeds Dinámicos
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs gap-1">
              <Star className="w-3 h-3" /> Selección Manual
            </TabsTrigger>
            <TabsTrigger value="search" className="text-xs gap-1">
              <Search className="w-3 h-3" /> Buscar
            </TabsTrigger>
          </TabsList>

          {/* Dynamic Feeds */}
          <TabsContent value="dynamic" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Los feeds dinámicos se personalizan automáticamente con datos reales de Shopify en el momento del envío.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DYNAMIC_FEEDS.map((feed) => (
                <Card
                  key={feed.id}
                  className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md group"
                  onClick={() => handleInsertDynamic(feed)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">{feed.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{feed.label}</p>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Dinámico
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {feed.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-primary font-medium">Click para insertar →</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Manual Selection */}
          <TabsContent value="manual" className="mt-4 space-y-3">
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
                {renderProductGrid(getPopularProducts())}
                {renderBottomBar()}
              </>
            )}
          </TabsContent>

          {/* Search */}
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
                <p className="text-sm text-muted-foreground">No hay resultados para &apos;{searchQuery}&apos;</p>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                Escribe el nombre de un producto para buscar
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>,
    document.body
  );
}
