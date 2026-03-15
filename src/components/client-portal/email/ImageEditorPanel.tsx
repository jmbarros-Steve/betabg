import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Eraser, Sparkles, Wand2, Check, X } from 'lucide-react';

interface ImageEditorPanelProps {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
  onImageReady: (imageUrl: string) => void;
  currentImageUrl?: string;
  brandColor?: string;
  brandSecondaryColor?: string;
}

export function ImageEditorPanel({
  clientId,
  isOpen,
  onClose,
  onImageReady,
  currentImageUrl,
  brandColor = '#18181b',
  brandSecondaryColor = '#6366f1',
}: ImageEditorPanelProps) {
  const [processing, setProcessing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [imageUrlInput, setImageUrlInput] = useState(currentImageUrl || '');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const imageUrl = imageUrlInput || currentImageUrl;

  const handleAction = async (actionId: string, prompt?: string) => {
    if (actionId !== 'custom_edit' && !imageUrl) {
      toast.error('Primero ingresa la URL de una imagen');
      return;
    }

    setProcessing(true);
    setResultUrl(null);

    try {
      const { data, error } = await callApi<any>('edit-image-gemini', {
        body: {
          clientId,
          action: actionId,
          imageUrl,
          prompt: prompt || undefined,
          brandColor,
          brandSecondaryColor,
        },
      });

      if (error) {
        toast.error(error);
        return;
      }

      if (data?.asset_url) {
        setResultUrl(data.asset_url);
        toast.success('Imagen procesada');
      }
    } catch {
      toast.error('Error procesando la imagen');
    } finally {
      setProcessing(false);
    }
  };

  const useResult = () => {
    if (resultUrl) {
      onImageReady(resultUrl);
      setResultUrl(null);
      onClose();
    }
  };

  const discard = () => {
    setResultUrl(null);
  };

  const hasImage = !!imageUrl;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            Editor de Imagenes
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image URL input */}
          <div className="space-y-2">
            <Label className="text-sm">URL de la imagen</Label>
            <Input
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://... pega la URL de tu imagen"
              className="text-sm"
            />
            {hasImage && (
              <div className="rounded-lg overflow-hidden border bg-muted/30 max-h-40 flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt="Imagen original"
                  className="max-h-40 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          {/* Processing indicator */}
          {processing && (
            <div className="flex items-center justify-center py-6 gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Procesando...</p>
            </div>
          )}

          {/* Result preview */}
          {resultUrl && (
            <div className="space-y-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Resultado
              </p>
              <div className="rounded-lg overflow-hidden border max-h-48 flex items-center justify-center bg-white">
                <img
                  src={resultUrl}
                  alt="Resultado"
                  className="max-h-48 object-contain"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={useResult}>
                  <Check className="w-4 h-4 mr-1" /> Usar
                </Button>
                <Button size="sm" variant="outline" onClick={discard}>
                  <X className="w-4 h-4 mr-1" /> Descartar
                </Button>
              </div>
            </div>
          )}

          {/* Actions — only show when not processing and no result */}
          {!processing && !resultUrl && (
            <div className="space-y-3">
              {/* Action 1: Remove background */}
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4"
                disabled={!hasImage}
                onClick={() => handleAction('remove_background')}
              >
                <Eraser className="w-5 h-5 mr-3 shrink-0 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium">Quitar fondo</p>
                  <p className="text-xs text-muted-foreground">
                    Elimina el fondo y deja solo el producto
                  </p>
                </div>
              </Button>

              {/* Action 2: Enhance quality */}
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3 px-4"
                disabled={!hasImage}
                onClick={() => handleAction('enhance')}
              >
                <Sparkles className="w-5 h-5 mr-3 shrink-0 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium">Mejorar calidad</p>
                  <p className="text-xs text-muted-foreground">
                    Mejora iluminacion, nitidez y colores
                  </p>
                </div>
              </Button>

              {/* Action 3: Custom AI edit */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Editar con IA</p>
                    <p className="text-xs text-muted-foreground">
                      Describe que quieres cambiar
                    </p>
                  </div>
                </div>
                <Input
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Ej: Cambiar el fondo a un estudio con luces calidas"
                  className="text-sm"
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    customPrompt &&
                    hasImage &&
                    handleAction('custom_edit', customPrompt)
                  }
                />
                <Button
                  size="sm"
                  disabled={!customPrompt || !hasImage}
                  onClick={() => handleAction('custom_edit', customPrompt)}
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Generar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
