import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, ExternalLink, Package, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProductWithDetails } from '@/hooks/useProducts';
import { CategoryPicker } from './CategoryPicker';
import { AttributeForm } from './AttributeForm';
import { PriceMarkupInput } from './PriceMarkupInput';
import { MarkupConfig, applyMarkup } from '@/lib/priceMarkup';
import { htmlToPlainText, truncateTitle } from '@/lib/htmlToPlainText';

interface PublishToMLDialogProps {
  open: boolean;
  onClose: () => void;
  product: ProductWithDetails;
  clientId: string;
  onSuccess: () => void;
}

type Step = 'category' | 'attributes' | 'price' | 'photos' | 'description' | 'review';
const STEPS: Step[] = ['category', 'attributes', 'price', 'photos', 'description', 'review'];
const STEP_LABELS: Record<Step, string> = {
  category: 'Categoría',
  attributes: 'Atributos',
  price: 'Precio',
  photos: 'Fotos',
  description: 'Descripción',
  review: 'Publicar',
};

export function PublishToMLDialog({ open, onClose, product, clientId, onSuccess }: PublishToMLDialogProps) {
  const [step, setStep] = useState<Step>('category');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ mlItemId: string; permalink: string } | null>(null);

  // Form state
  const [category, setCategory] = useState<{ id: string; name: string; path: string } | null>(null);
  const [attributes, setAttributes] = useState<{ id: string; valueName: string }[]>([]);
  const [title, setTitle] = useState(truncateTitle(product.name));
  const [markup, setMarkup] = useState<MarkupConfig>({ type: 'percent', value: 15 });
  const [condition, setCondition] = useState<'new' | 'used'>('new');
  const [listingType, setListingType] = useState('gold_special');
  const [selectedImages, setSelectedImages] = useState<number[]>(
    product.images.map((_, i) => i)
  );
  const [description, setDescription] = useState(htmlToPlainText(product.description || ''));
  const [mlConnectionId, setMlConnectionId] = useState<string | null>(null);
  const [stock, setStock] = useState(product.totalStock);

  // Load ML connection
  useEffect(() => {
    async function loadMLConnection() {
      const { data } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'mercadolibre')
        .eq('is_active', true)
        .limit(1)
        .single();
      if (data) setMlConnectionId(data.id);
    }
    if (open) {
      loadMLConnection();
      // Load saved category mapping
      if (product.category) {
        supabase
          .from('ml_category_mappings')
          .select('*')
          .eq('client_id', clientId)
          .eq('product_type', product.category)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setCategory({ id: data.ml_category_id, name: data.ml_category_name || '', path: '' });
              setCondition((data.default_condition as 'new' | 'used') || 'new');
              setListingType(data.default_listing_type || 'gold_special');
              if (data.default_markup_type && data.default_markup_value) {
                setMarkup({ type: data.default_markup_type as any, value: Number(data.default_markup_value) });
              }
            }
          });
      }
    }
  }, [open, clientId, product.category]);

  const stepIndex = STEPS.indexOf(step);
  const canGoNext = () => {
    switch (step) {
      case 'category': return !!category;
      case 'attributes': return true;
      case 'price': return title.length > 0 && title.length <= 60;
      case 'photos': return selectedImages.length > 0;
      case 'description': return true;
      case 'review': return !!mlConnectionId;
    }
  };

  function goNext() {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  }
  function goBack() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  }

  async function handlePublish() {
    if (!mlConnectionId || !category) return;
    setPublishing(true);

    const finalPrice = applyMarkup(product.basePrice, markup);

    const { data, error } = await supabase.functions.invoke('ml-create-item', {
      body: {
        connectionId: mlConnectionId,
        productId: product.id,
        categoryId: category.id,
        categoryName: category.name,
        title,
        price: finalPrice,
        condition,
        listingTypeId: listingType,
        attributes,
        description,
        markupConfig: markup,
      },
    });

    if (error || data?.error) {
      const msg = data?.error || error?.message || 'Error al publicar';
      const cause = data?.cause ? ` (${data.cause})` : '';
      toast.error(`${msg}${cause}`);
      setPublishing(false);
      return;
    }

    setResult({ mlItemId: data.mlItemId, permalink: data.permalink });
    setPublishing(false);
    toast.success('Producto publicado en MercadoLibre');
    onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Publicar en MercadoLibre
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        {!result && (
          <div className="flex gap-1 mb-4">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    i <= stepIndex ? 'bg-yellow-500' : 'bg-slate-200'
                  }`}
                />
                <p className={`text-[10px] mt-0.5 ${i === stepIndex ? 'text-yellow-700 font-medium' : 'text-muted-foreground'}`}>
                  {STEP_LABELS[s]}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Success */}
        {result && (
          <div className="py-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <div>
              <p className="font-medium text-lg">Publicado exitosamente</p>
              <p className="text-sm text-muted-foreground">ID: {result.mlItemId}</p>
            </div>
            <Button asChild>
              <a href={result.permalink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Ver en MercadoLibre
              </a>
            </Button>
            <Button variant="outline" onClick={onClose}>Cerrar</Button>
          </div>
        )}

        {/* Steps */}
        {!result && (
          <>
            <div className="py-2 min-h-[200px]">
              {/* Step: Category */}
              {step === 'category' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Busca y selecciona la categoría de MercadoLibre</p>
                  <CategoryPicker
                    selected={category}
                    onSelect={setCategory}
                    initialQuery={product.category || product.name.split(' ').slice(0, 3).join(' ')}
                  />
                </div>
              )}

              {/* Step: Attributes */}
              {step === 'attributes' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Completa los atributos requeridos por MercadoLibre</p>
                  <AttributeForm
                    categoryId={category?.id || null}
                    values={attributes}
                    onChange={setAttributes}
                    brand={product.brand}
                  />
                </div>
              )}

              {/* Step: Price */}
              {step === 'price' && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs">Título (máx 60 caracteres)</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value.substring(0, 60))}
                      maxLength={60}
                    />
                    <p className={`text-xs mt-1 ${title.length > 55 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {title.length}/60 caracteres
                    </p>
                  </div>

                  <PriceMarkupInput
                    basePrice={product.basePrice}
                    markup={markup}
                    onChange={setMarkup}
                  />

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Condición</Label>
                      <select
                        value={condition}
                        onChange={(e) => setCondition(e.target.value as 'new' | 'used')}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="new">Nuevo</option>
                        <option value="used">Usado</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Tipo publicación</Label>
                      <select
                        value={listingType}
                        onChange={(e) => setListingType(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="gold_special">Premium</option>
                        <option value="gold_pro">Clásica</option>
                        <option value="free">Gratis</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Stock</Label>
                      <Input
                        type="number"
                        value={stock}
                        onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                        className="mt-1"
                        min={0}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Photos */}
              {step === 'photos' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Selecciona las fotos (MercadoLibre acepta URLs de Shopify directamente)
                  </p>
                  {product.images.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Este producto no tiene imágenes</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {product.images.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSelectedImages((prev) =>
                              prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                            );
                          }}
                          className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                            selectedImages.includes(i) ? 'border-yellow-500' : 'border-transparent'
                          }`}
                        >
                          <img
                            src={img.src}
                            alt={img.alt}
                            className="w-full aspect-square object-cover"
                          />
                          {selectedImages.includes(i) && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs font-bold">{selectedImages.indexOf(i) + 1}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{selectedImages.length} de {product.images.length} seleccionadas (máx 10)</p>
                </div>
              )}

              {/* Step: Description */}
              {step === 'description' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Descripción en texto plano para MercadoLibre
                  </p>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={10}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">{description.length} caracteres</p>
                </div>
              )}

              {/* Step: Review */}
              {step === 'review' && (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Resumen de la publicación</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Título</p>
                      <p className="font-medium">{title}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Categoría</p>
                      <p className="font-medium">{category?.name}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Precio</p>
                      <p className="font-medium text-yellow-700">
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(applyMarkup(product.basePrice, markup))}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Condición / Tipo</p>
                      <p className="font-medium">{condition === 'new' ? 'Nuevo' : 'Usado'} / {listingType === 'gold_special' ? 'Premium' : listingType === 'gold_pro' ? 'Clásica' : 'Gratis'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Fotos</p>
                      <p className="font-medium">{selectedImages.length}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">Atributos</p>
                      <p className="font-medium">{attributes.length} completados</p>
                    </div>
                  </div>

                  {!mlConnectionId && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      No se encontró una conexión activa de MercadoLibre. Conéctala primero en Conexiones.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-2 border-t">
              <Button
                variant="outline"
                onClick={stepIndex === 0 ? onClose : goBack}
                disabled={publishing}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
              </Button>

              {step === 'review' ? (
                <Button
                  onClick={handlePublish}
                  disabled={publishing || !mlConnectionId}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {publishing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    'Publicar en MercadoLibre'
                  )}
                </Button>
              ) : (
                <Button onClick={goNext} disabled={!canGoNext()}>
                  Siguiente
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
