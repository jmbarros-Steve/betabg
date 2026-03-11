import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2, Eraser, Palette, Sparkles, Wand2, ImagePlus, Copy, X, Check,
} from 'lucide-react';

interface ImageEditorPanelProps {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
  onImageReady: (imageUrl: string) => void;
  currentImageUrl?: string;
  brandColor?: string;
  brandSecondaryColor?: string;
}

const ACTIONS = [
  {
    id: 'remove_background',
    label: 'Quitar Fondo',
    description: 'Elimina el fondo y deja solo el producto',
    icon: Eraser,
    needsImage: true,
    credits: 1,
  },
  {
    id: 'apply_brand_colors',
    label: 'Colores de Marca',
    description: 'Aplica tu paleta de colores a la imagen',
    icon: Palette,
    needsImage: true,
    credits: 1,
  },
  {
    id: 'enhance',
    label: 'Mejorar Calidad',
    description: 'Mejora iluminación, nitidez y colores',
    icon: Sparkles,
    needsImage: true,
    credits: 1,
  },
  {
    id: 'variation',
    label: 'Generar Variación',
    description: 'Crea una versión alternativa de la imagen',
    icon: Copy,
    needsImage: true,
    credits: 2,
  },
  {
    id: 'custom_edit',
    label: 'Edición Libre',
    description: 'Describe qué quieres cambiar',
    icon: Wand2,
    needsImage: true,
    credits: 1,
    needsPrompt: true,
  },
  {
    id: 'generate_email_banner',
    label: 'Generar Banner',
    description: 'Crea un banner para tu email desde cero',
    icon: ImagePlus,
    needsImage: false,
    credits: 2,
    needsPrompt: true,
  },
];

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
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handleAction = async (actionId: string) => {
    const action = ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    if (action.needsImage && !imageUrlInput && !currentImageUrl) {
      toast.error('Necesitas una imagen para esta acción');
      return;
    }

    if (action.needsPrompt && !customPrompt) {
      setSelectedAction(actionId);
      return;
    }

    setProcessing(true);
    setResultUrl(null);

    try {
      const { data, error } = await callApi<any>('edit-image-gemini', {
        body: {
          clientId,
          action: actionId,
          imageUrl: imageUrlInput || currentImageUrl,
          prompt: customPrompt || undefined,
          brandColor,
          brandSecondaryColor,
          width: actionId === 'generate_email_banner' ? 600 : undefined,
          height: actionId === 'generate_email_banner' ? 300 : undefined,
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
      setSelectedAction(null);
      setCustomPrompt('');
    }
  };

  const useResult = () => {
    if (resultUrl) {
      onImageReady(resultUrl);
      setResultUrl(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            Editor de Imágenes — Gemini AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image URL input */}
          <div className="space-y-2">
            <Label className="text-sm">URL de la imagen</Label>
            <Input
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://... o pega la URL de una imagen del editor"
              className="text-sm"
            />
            {(imageUrlInput || currentImageUrl) && (
              <div className="rounded-lg overflow-hidden border bg-muted/30 max-h-48 flex items-center justify-center">
                <img
                  src={imageUrlInput || currentImageUrl}
                  alt="Imagen original"
                  className="max-h-48 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          {/* Actions grid */}
          <div className="grid grid-cols-2 gap-3">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              const disabled = processing || (action.needsImage && !imageUrlInput && !currentImageUrl);

              return (
                <Card
                  key={action.id}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${
                    disabled ? 'opacity-40 cursor-not-allowed' : ''
                  } ${selectedAction === action.id ? 'border-primary ring-1 ring-primary' : ''}`}
                  onClick={() => !disabled && !processing && handleAction(action.id)}
                >
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{action.credits} crédito{action.credits > 1 ? 's' : ''}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Prompt input for actions that need it */}
          {selectedAction && ACTIONS.find(a => a.id === selectedAction)?.needsPrompt && (
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <Label className="text-sm">
                {selectedAction === 'generate_email_banner'
                  ? 'Describe el banner que quieres'
                  : 'Describe qué quieres cambiar'}
              </Label>
              <Input
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={
                  selectedAction === 'generate_email_banner'
                    ? 'Ej: Banner minimalista con degradado azul para venta de verano'
                    : 'Ej: Cambiar el fondo a un estudio con luces cálidas'
                }
                className="text-sm"
                onKeyDown={(e) => e.key === 'Enter' && customPrompt && handleAction(selectedAction)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleAction(selectedAction)} disabled={!customPrompt || processing}>
                  {processing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Generar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedAction(null); setCustomPrompt(''); }}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {processing && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Procesando con Gemini AI...</p>
            </div>
          )}

          {/* Result preview */}
          {resultUrl && (
            <div className="space-y-3 p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Resultado</p>
              <div className="rounded-lg overflow-hidden border max-h-64 flex items-center justify-center bg-white">
                <img src={resultUrl} alt="Resultado" className="max-h-64 object-contain" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={useResult}>
                  <Check className="w-4 h-4 mr-1" /> Usar esta imagen
                </Button>
                <Button size="sm" variant="outline" onClick={() => setResultUrl(null)}>
                  Descartar
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
