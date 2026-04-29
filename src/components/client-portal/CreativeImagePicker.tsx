import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Upload, ShoppingBag, Link as LinkIcon, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ShopifyProduct {
  shopify_product_id: string;
  title: string;
  image_url: string | null;
  price_min: number | null;
  status: string;
}

interface CreativeImagePickerProps {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (url: string) => void;
}

export function CreativeImagePicker({ clientId, open, onOpenChange, onPick }: CreativeImagePickerProps) {
  const [tab, setTab] = useState<'upload' | 'shopify' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && tab === 'shopify' && products.length === 0) {
      loadProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  async function loadProducts() {
    setProductsLoading(true);
    try {
      const { data, error } = await supabase
        .from('shopify_products')
        .select('shopify_product_id, title, image_url, price_min, status')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .not('image_url', 'is', null)
        .order('price_max', { ascending: false })
        .limit(50);
      if (error) {
        toast.error('No se pudo cargar el catálogo Shopify');
        return;
      }
      setProducts((data || []) as any);
    } finally {
      setProductsLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Archivo muy grande. Máximo 10 MB para imágenes.');
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = String(reader.result);
          const { data, error } = await callApi('upload-creative-asset', {
            body: {
              client_id: clientId,
              filename: file.name,
              content_base64: base64,
              content_type: file.type,
            },
          });
          if (error || !data?.url) {
            toast.error('Falló la subida: ' + (error?.message || 'unknown'));
            return;
          }
          toast.success('Imagen subida ✓');
          onPick(data.url);
          onOpenChange(false);
        } catch (err: any) {
          toast.error('Error: ' + (err?.message || 'unknown'));
        } finally {
          setUploading(false);
        }
      };
      reader.onerror = () => { toast.error('Error leyendo el archivo'); setUploading(false); };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error('Error: ' + (err?.message || 'unknown'));
      setUploading(false);
    }
  }

  function pickFromShopify(url: string) {
    onPick(url);
    onOpenChange(false);
    toast.success('Imagen del catálogo seleccionada ✓');
  }

  function pickFromUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error('La URL debe empezar con http:// o https://');
      return;
    }
    onPick(trimmed);
    setUrlInput('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Elegir imagen del creativo</DialogTitle>
          <DialogDescription>Subí un archivo, elegí del catálogo Shopify, o pegá una URL.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" /> Subir archivo</TabsTrigger>
            <TabsTrigger value="shopify"><ShoppingBag className="h-4 w-4 mr-1" /> Catálogo Shopify</TabsTrigger>
            <TabsTrigger value="url"><LinkIcon className="h-4 w-4 mr-1" /> URL externa</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            <div className="border-2 border-dashed rounded-lg p-10 text-center bg-muted/30">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Arrastrá un archivo o hacé click para elegir</p>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WebP, GIF · máx 10 MB</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="mt-4"
                variant="default"
              >
                {uploading ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Subiendo...</>) : 'Elegir archivo'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="shopify" className="mt-4">
            {productsLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-square w-full" />)}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ShoppingBag className="h-10 w-10 mx-auto opacity-30" />
                <p className="mt-3 text-sm">No hay productos activos con imagen en tu catálogo Shopify.</p>
                <p className="text-xs mt-1">Sincronizá tu catálogo desde Conexiones.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1">
                {products.map((p) => (
                  <button
                    key={p.shopify_product_id}
                    onClick={() => p.image_url && pickFromShopify(p.image_url)}
                    className="group relative border rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all bg-card"
                  >
                    {p.image_url && (
                      <img src={p.image_url} alt={p.title} className="w-full aspect-square object-cover" loading="lazy" />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Check className="h-8 w-8 text-white opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="p-2 text-left">
                      <p className="text-xs font-medium line-clamp-1">{p.title}</p>
                      {p.price_min && (
                        <p className="text-xs text-muted-foreground">${Number(p.price_min).toLocaleString('es-CL')} CLP</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="url" className="mt-4">
            <div className="space-y-3">
              <Label htmlFor="img-url">URL de la imagen</Label>
              <Input
                id="img-url"
                type="url"
                placeholder="https://ejemplo.com/imagen.jpg"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') pickFromUrl(); }}
              />
              <p className="text-xs text-muted-foreground">Pegá una URL pública directa a la imagen (PNG, JPG, WebP).</p>
              {urlInput && /^https?:\/\//i.test(urlInput) && (
                <div className="border rounded-lg p-2 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <img src={urlInput} alt="preview" className="max-h-48 rounded border" />
                </div>
              )}
              <Button onClick={pickFromUrl} disabled={!urlInput.trim()}>Usar esta URL</Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
