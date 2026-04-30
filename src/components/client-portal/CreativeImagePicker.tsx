import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Upload, ShoppingBag, Link as LinkIcon, Loader2, Check, Sparkles, Images } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CreativosGallery } from '@/components/client-portal/creativos/CreativosGallery';

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
  const [tab, setTab] = useState<'gallery' | 'upload' | 'ai' | 'shopify' | 'url'>('gallery');
  const [uploading, setUploading] = useState(false);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPreviewUrl, setAiPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function generateWithAI() {
    const trimmed = aiPrompt.trim();
    if (trimmed.length < 20) {
      toast.error('Describí la imagen con más detalle (mínimo 20 caracteres). Ej: "vasos de cerámica gres color tierra sobre mesa de madera oscura, luz natural, estilo editorial".');
      return;
    }
    setAiGenerating(true);
    setAiPreviewUrl(null);
    try {
      const { data, error } = await callApi('generate-image', {
        body: { clientId, promptGeneracion: trimmed },
      });
      if (error || !data?.asset_url) {
        toast.error('Falló la generación: ' + (error?.message || 'unknown'));
        return;
      }
      setAiPreviewUrl(data.asset_url);
      toast.success('Imagen generada — revisala y confirmá si te gusta');
    } catch (err: any) {
      toast.error('Error: ' + (err?.message || 'unknown'));
    } finally {
      setAiGenerating(false);
    }
  }

  function confirmAIImage() {
    if (!aiPreviewUrl) return;
    onPick(aiPreviewUrl);
    setAiPreviewUrl(null);
    setAiPrompt('');
    onOpenChange(false);
    toast.success('Imagen IA seleccionada ✓');
  }

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
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="gallery"><Images className="h-4 w-4 mr-1" /> Mis creativos</TabsTrigger>
            <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" /> Subir</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="h-4 w-4 mr-1" /> IA</TabsTrigger>
            <TabsTrigger value="shopify"><ShoppingBag className="h-4 w-4 mr-1" /> Shopify</TabsTrigger>
            <TabsTrigger value="url"><LinkIcon className="h-4 w-4 mr-1" /> URL</TabsTrigger>
          </TabsList>

          <TabsContent value="gallery" className="mt-4">
            <CreativosGallery
              clientId={clientId}
              mode="picker"
              onSelectAsset={(url, type) => {
                if (type !== 'photo') {
                  toast.error('Para creativo de imagen elegí una foto, no un video.');
                  return;
                }
                onPick(url);
                onOpenChange(false);
                toast.success('Imagen seleccionada ✓');
              }}
            />
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <div className="space-y-3">
              <Label htmlFor="ai-prompt">Describí la imagen que querés generar</Label>
              <Textarea
                id="ai-prompt"
                rows={4}
                placeholder='Ej: "fotografía cenital de 3 vasos de cerámica gres color tierra sobre mesa de madera oscura con flores silvestres, luz natural cálida, estilo editorial revista de decoración"'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                disabled={aiGenerating}
              />
              <p className="text-xs text-muted-foreground">Mientras más específico, mejor. Mencioná: producto, fondo, iluminación, ángulo y mood. Mín. 20 caracteres.</p>
              {!aiPreviewUrl && (
                <Button onClick={generateWithAI} disabled={aiGenerating || aiPrompt.trim().length < 20}>
                  {aiGenerating ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generando…</>) : (<><Sparkles className="h-4 w-4 mr-1" /> Generar imagen</>)}
                </Button>
              )}
              {aiPreviewUrl && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                  <p className="text-xs text-muted-foreground">Preview:</p>
                  <img src={aiPreviewUrl} alt="generated" className="max-h-72 mx-auto rounded border" />
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => { setAiPreviewUrl(null); }}>Generar otra</Button>
                    <Button onClick={confirmAIImage}><Check className="h-4 w-4 mr-1" /> Usar esta imagen</Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

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
