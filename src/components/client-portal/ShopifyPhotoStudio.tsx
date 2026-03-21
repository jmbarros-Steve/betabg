import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Camera, Eraser, Sparkles, Image as ImageIcon, Wand2, Loader2, Save, X, Upload } from 'lucide-react';

interface ShopifyPhotoStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: number;
    title: string;
    image: string | null;
    images?: Array<{ id: number; src: string; alt?: string }>;
  };
  connectionId: string;
  onSaved?: () => void;
}

type EditAction = 'remove_background' | 'variation' | 'enhance' | 'lifestyle';

const ACTIONS: { key: EditAction; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'remove_background', label: 'Quitar Fondo', icon: Eraser, desc: 'Fondo blanco limpio' },
  { key: 'lifestyle', label: 'Lifestyle', icon: ImageIcon, desc: 'Ambientación lifestyle' },
  { key: 'variation', label: 'Variación', icon: Wand2, desc: 'Nueva versión creativa' },
  { key: 'enhance', label: 'Mejorar', icon: Sparkles, desc: 'Calidad profesional' },
];

export function ShopifyPhotoStudio({ open, onOpenChange, product, connectionId, onSaved }: ShopifyPhotoStudioProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeAction, setActiveAction] = useState<EditAction | null>(null);

  const images = product.images?.length ? product.images : product.image ? [{ id: 0, src: product.image }] : [];

  const handleAction = async (action: EditAction) => {
    const imgSrc = selectedImage || images[0]?.src;
    if (!imgSrc) {
      toast.error('No hay imagen seleccionada');
      return;
    }

    setProcessing(true);
    setActiveAction(action);
    setResultImage(null);

    try {
      const editType = action === 'lifestyle' ? 'custom_edit' : action;
      const body: Record<string, any> = {
        imageUrl: imgSrc,
        editType,
      };

      if (action === 'lifestyle') {
        body.prompt = `Crea una ambientación lifestyle profesional para el producto "${product.title}". Mantén el producto como foco central, agrega un entorno atractivo y natural.`;
      }

      const { data, error } = await callApi<any>('edit-image-gemini', { body });

      if (error) {
        toast.error('Error al procesar imagen: ' + error);
        return;
      }

      if (data?.imageUrl || data?.resultUrl) {
        setResultImage(data.imageUrl || data.resultUrl);
        toast.success('Imagen procesada');
      } else {
        toast.error('No se pudo generar la imagen');
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setProcessing(false);
      setActiveAction(null);
    }
  };

  const handlePublish = async () => {
    if (!resultImage) return;
    setSaving(true);

    try {
      const { data, error } = await callApi<any>('update-shopify-product', {
        body: {
          connectionId,
          productId: product.id,
          images: [{ src: resultImage }],
        },
      });

      if (error) {
        toast.error('Error al publicar: ' + error);
        return;
      }

      toast.success('Imagen publicada en Shopify');
      setResultImage(null);
      onSaved?.();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Estudio Fotográfico — {product.title}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Original images */}
          <div>
            <p className="text-sm font-medium mb-2">Fotos actuales</p>
            {images.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin imágenes</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img.src)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage === img.src || (!selectedImage && img.src === images[0]?.src)
                        ? 'border-primary'
                        : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                  >
                    <img src={img.src} alt={product.title} className="w-full aspect-square object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Result */}
          <div>
            <p className="text-sm font-medium mb-2">Resultado</p>
            {processing ? (
              <div className="border rounded-lg p-8 text-center">
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Procesando imagen...</p>
                <Badge className="mt-2">{ACTIONS.find(a => a.key === activeAction)?.label}</Badge>
              </div>
            ) : resultImage ? (
              <div className="space-y-2">
                <div className="rounded-lg overflow-hidden border">
                  <img src={resultImage} alt="Resultado" className="w-full aspect-square object-cover" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setResultImage(null)}>
                    <X className="w-4 h-4 mr-1" /> Descartar
                  </Button>
                  <Button size="sm" className="flex-1" onClick={handlePublish} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                    Publicar en Shopify
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Selecciona una acción para generar</p>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                variant="outline"
                className="h-auto py-3 flex flex-col items-center gap-1"
                onClick={() => handleAction(action.key)}
                disabled={processing || images.length === 0}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{action.label}</span>
                <span className="text-[10px] text-muted-foreground">{action.desc}</span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
