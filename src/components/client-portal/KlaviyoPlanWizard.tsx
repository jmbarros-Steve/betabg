import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, ShoppingCart, UserMinus, Megaphone, 
  ChevronRight, ChevronLeft, Loader2, Percent, 
  Package, Lightbulb, TrendingUp, Star, Check, Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShopifyDiscountDialog } from './ShopifyDiscountDialog';

type FlowType = 'welcome_series' | 'abandoned_cart' | 'customer_winback' | 'campaign';

interface EmailStep {
  id: string;
  subject: string;
  previewText: string;
  content: string;
  delayDays: number;
  delayHours: number;
  hasDiscount?: boolean;
  discountPercent?: number;
}

interface WizardData {
  name: string;
  emailCount: number;
  useDiscount: boolean;
  discountPercent: number;
  discountFromEmail: number;
  selectedProducts: string[];
  campaignDate?: string;
  notes: string;
}

interface TopProduct {
  title: string;
  sales: number;
  revenue: number;
}

interface KlaviyoPlanWizardProps {
  flowType: FlowType;
  clientId: string;
  onComplete: (data: { 
    name: string; 
    emails: EmailStep[]; 
    notes: string;
    campaignDate?: string;
    selectedProducts?: string[];
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

const flowTypeConfig = {
  welcome_series: {
    label: 'Serie de Bienvenida',
    icon: Mail,
    description: 'Emails automáticos para nuevos suscriptores',
    color: 'bg-blue-500/10 text-blue-600',
    emailSuggestions: [
      { count: 3, label: '3 emails (Recomendado)', description: 'Bienvenida + Productos + Descuento' },
      { count: 4, label: '4 emails', description: 'Más tiempo para generar confianza' },
      { count: 5, label: '5 emails', description: 'Secuencia completa con testimonios' },
    ],
    defaultDelays: [0, 1, 3, 5, 7],
    defaultSubjects: [
      'Bienvenido a [Marca] 🎉',
      'Conoce nuestros productos favoritos',
      '¡Tu descuento especial te espera!',
      'Lo que dicen nuestros clientes',
      'Última oportunidad: tu descuento expira pronto',
    ],
  },
  abandoned_cart: {
    label: 'Carrito Abandonado',
    icon: ShoppingCart,
    description: 'Recupera ventas de carritos abandonados',
    color: 'bg-amber-500/10 text-amber-600',
    emailSuggestions: [
      { count: 3, label: '3 emails (Recomendado)', description: 'Recordatorio + Urgencia + Descuento' },
      { count: 2, label: '2 emails', description: 'Solo lo esencial' },
      { count: 4, label: '4 emails', description: 'Secuencia más persistente' },
    ],
    defaultDelays: [0.04, 1, 3, 5], // 1 hora = 0.04 días
    defaultSubjects: [
      '¿Olvidaste algo? Tu carrito te espera 🛒',
      'Tus productos siguen disponibles',
      '10% de descuento para completar tu compra',
      'Última oportunidad: stock limitado',
    ],
  },
  customer_winback: {
    label: 'Reactivación de Clientes',
    icon: UserMinus,
    description: 'Recupera clientes inactivos',
    color: 'bg-purple-500/10 text-purple-600',
    emailSuggestions: [
      { count: 3, label: '3 emails (Recomendado)', description: 'Te extrañamos + Novedades + Oferta' },
      { count: 2, label: '2 emails', description: 'Mensaje directo' },
      { count: 4, label: '4 emails', description: 'Reenganche gradual' },
    ],
    defaultDelays: [30, 45, 60, 75],
    defaultSubjects: [
      'Te extrañamos 💔',
      'Mira lo nuevo que tenemos para ti',
      'Un regalo especial para que vuelvas',
      'Última oportunidad: oferta exclusiva',
    ],
  },
  campaign: {
    label: 'Campaña Puntual',
    icon: Megaphone,
    description: 'Emails promocionales y de temporada',
    color: 'bg-green-500/10 text-green-600',
    emailSuggestions: [
      { count: 1, label: '1 email', description: 'Anuncio único' },
      { count: 2, label: '2 emails', description: 'Anuncio + Recordatorio' },
      { count: 3, label: '3 emails (Recomendado)', description: 'Pre-lanzamiento + Lanzamiento + Última llamada' },
    ],
    defaultDelays: [0, 3, 7],
    defaultSubjects: [
      '¡Llega algo especial! 🎁',
      '¡Ya está aquí! No te lo pierdas',
      'Última oportunidad: termina pronto',
    ],
  },
};

const discountRecommendations: Record<FlowType, { recommended: number; fromEmail: number; reason: string }> = {
  welcome_series: {
    recommended: 10,
    fromEmail: 2,
    reason: 'Un 10% en el segundo email genera conversiones sin depreciar tu marca.',
  },
  abandoned_cart: {
    recommended: 10,
    fromEmail: 2,
    reason: 'Ofrece descuento solo si no convierten con el primer recordatorio.',
  },
  customer_winback: {
    recommended: 15,
    fromEmail: 2,
    reason: 'Clientes inactivos necesitan un incentivo mayor para volver.',
  },
  campaign: {
    recommended: 10,
    fromEmail: 1,
    reason: 'Las campañas promocionales suelen incluir descuento desde el inicio.',
  },
};

export function KlaviyoPlanWizard({ 
  flowType, 
  clientId, 
  onComplete, 
  onCancel, 
  saving 
}: KlaviyoPlanWizardProps) {
  const [step, setStep] = useState(1);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [hasShopifyConnection, setHasShopifyConnection] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [createdDiscountCode, setCreatedDiscountCode] = useState<string | null>(null);
  
  const [wizardData, setWizardData] = useState<WizardData>({
    name: '',
    emailCount: 3,
    useDiscount: true,
    discountPercent: discountRecommendations[flowType].recommended,
    discountFromEmail: discountRecommendations[flowType].fromEmail,
    selectedProducts: [],
    campaignDate: '',
    notes: '',
  });

  const config = flowTypeConfig[flowType];
  const Icon = config.icon;
  const discountRec = discountRecommendations[flowType];

  const totalSteps = flowType === 'campaign' ? 4 : 3;

  // Fetch top products from Shopify metrics
  useEffect(() => {
    async function fetchTopProducts() {
      setLoadingProducts(true);
      try {
        // Check if client has Shopify connection
        const { data: connections } = await supabase
          .from('platform_connections')
          .select('id, platform')
          .eq('client_id', clientId)
          .eq('platform', 'shopify')
          .eq('is_active', true);

        if (connections && connections.length > 0) {
          setHasShopifyConnection(true);
          
          // Fetch sales metrics to identify top products
          const { data: metrics } = await supabase
            .from('platform_metrics')
            .select('*')
            .eq('connection_id', connections[0].id)
            .order('metric_value', { ascending: false })
            .limit(20);

          // For demo purposes, we'll create sample top products
          // In production, this would come from actual Shopify product data
          const sampleProducts: TopProduct[] = [
            { title: 'Producto Estrella #1', sales: 150, revenue: 45000 },
            { title: 'Producto Popular #2', sales: 120, revenue: 36000 },
            { title: 'Producto Tendencia #3', sales: 95, revenue: 28500 },
            { title: 'Producto Clásico #4', sales: 80, revenue: 24000 },
            { title: 'Producto Nuevo #5', sales: 65, revenue: 19500 },
          ];
          setTopProducts(sampleProducts);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoadingProducts(false);
      }
    }

    fetchTopProducts();
  }, [clientId]);

  function handleNext() {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1);
    }
  }

  function handleComplete() {
    const emails: EmailStep[] = [];
    const delays = config.defaultDelays;
    const subjects = config.defaultSubjects;

    for (let i = 0; i < wizardData.emailCount; i++) {
      const hasDiscount = wizardData.useDiscount && i + 1 >= wizardData.discountFromEmail;
      const delayValue = delays[i] || (i * 2);
      
      emails.push({
        id: `email-${Date.now()}-${i}`,
        subject: subjects[i] || `Email ${i + 1}`,
        previewText: '',
        content: hasDiscount 
          ? `Incluir descuento del ${wizardData.discountPercent}%` 
          : '',
        delayDays: Math.floor(delayValue),
        delayHours: Math.round((delayValue % 1) * 24),
        hasDiscount,
        discountPercent: hasDiscount ? wizardData.discountPercent : undefined,
      });
    }

    // Build notes with all the wizard selections
    let notes = '';
    if (wizardData.useDiscount) {
      notes += `• Descuento: ${wizardData.discountPercent}% desde el email ${wizardData.discountFromEmail}\n`;
    }
    if (wizardData.selectedProducts.length > 0) {
      notes += `• Productos a promocionar:\n  - ${wizardData.selectedProducts.join('\n  - ')}\n`;
    }
    if (wizardData.notes) {
      notes += `• Notas adicionales: ${wizardData.notes}`;
    }

    onComplete({
      name: wizardData.name,
      emails,
      notes,
      campaignDate: wizardData.campaignDate || undefined,
      selectedProducts: wizardData.selectedProducts,
    });
  }

  function canProceed(): boolean {
    switch (step) {
      case 1:
        return wizardData.name.trim().length > 0;
      case 2:
        return wizardData.emailCount > 0;
      case 3:
        return true; // Discount is optional
      case 4:
        return flowType !== 'campaign' || wizardData.selectedProducts.length > 0;
      default:
        return true;
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>{config.label}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </div>
        </div>
        {/* Progress indicator */}
        <div className="flex gap-2 mt-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i + 1 <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </CardHeader>
      
      <CardContent>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Step 1: Name */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-base font-medium">
                    ¿Cómo quieres llamar este plan?
                  </Label>
                  <Input
                    id="name"
                    value={wizardData.name}
                    onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                    placeholder={flowType === 'campaign' ? 'Ej: Black Friday 2024' : 'Ej: Bienvenida Principal'}
                    className="text-lg"
                  />
                </div>
                
                {flowType === 'campaign' && (
                  <div className="space-y-2">
                    <Label htmlFor="date">Fecha de envío (opcional)</Label>
                    <Input
                      id="date"
                      type="date"
                      value={wizardData.campaignDate}
                      onChange={(e) => setWizardData({ ...wizardData, campaignDate: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Email Count */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-medium">
                    ¿Cuántos emails quieres en la secuencia?
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Recomendamos 3 emails para un balance óptimo entre conversión y frecuencia.
                  </p>
                </div>

                <RadioGroup
                  value={String(wizardData.emailCount)}
                  onValueChange={(v) => setWizardData({ ...wizardData, emailCount: parseInt(v) })}
                  className="space-y-3"
                >
                  {config.emailSuggestions.map((suggestion) => (
                    <div key={suggestion.count} className="relative">
                      <RadioGroupItem
                        value={String(suggestion.count)}
                        id={`email-${suggestion.count}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`email-${suggestion.count}`}
                        className="flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-all peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted/50"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold">
                          {suggestion.count}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{suggestion.label}</p>
                          <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                        </div>
                        {suggestion.count === 3 && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            Recomendado
                          </Badge>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>

                {/* Custom option */}
                <div className="flex items-center gap-3 pt-2">
                  <Label htmlFor="custom-count" className="text-sm">
                    O especifica otro número:
                  </Label>
                  <Input
                    id="custom-count"
                    type="number"
                    min={1}
                    max={10}
                    value={wizardData.emailCount}
                    onChange={(e) => setWizardData({ ...wizardData, emailCount: parseInt(e.target.value) || 1 })}
                    className="w-20"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Discount */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Percent className="w-5 h-5" />
                    ¿Quieres incluir un descuento?
                  </Label>
                </div>

                {/* Recommendation card */}
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex gap-3">
                  <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Nuestra recomendación</p>
                    <p className="text-sm text-muted-foreground">
                      {discountRec.reason}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <p className="font-medium">Incluir descuento</p>
                    <p className="text-sm text-muted-foreground">
                      Incentiva la conversión con una oferta especial
                    </p>
                  </div>
                  <Switch
                    checked={wizardData.useDiscount}
                    onCheckedChange={(checked) => setWizardData({ ...wizardData, useDiscount: checked })}
                  />
                </div>

                {wizardData.useDiscount && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 pl-4 border-l-2 border-primary/30"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="discount-percent">Porcentaje de descuento</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="discount-percent"
                            type="number"
                            min={5}
                            max={50}
                            value={wizardData.discountPercent}
                            onChange={(e) => setWizardData({ 
                              ...wizardData, 
                              discountPercent: parseInt(e.target.value) || 10 
                            })}
                            className="w-20"
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Recomendado: {discountRec.recommended}%
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="discount-from">Desde el email #</Label>
                        <Input
                          id="discount-from"
                          type="number"
                          min={1}
                          max={wizardData.emailCount}
                          value={wizardData.discountFromEmail}
                          onChange={(e) => setWizardData({ 
                            ...wizardData, 
                            discountFromEmail: parseInt(e.target.value) || 2 
                          })}
                          className="w-20"
                        />
                        <p className="text-xs text-muted-foreground">
                          Recomendado: desde el email {discountRec.fromEmail}
                        </p>
                      </div>
                    </div>

                    {/* Create discount in Shopify button */}
                    {hasShopifyConnection && (
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">¿Crear código en Shopify?</p>
                            <p className="text-xs text-muted-foreground">
                              Crea automáticamente el código de descuento en tu tienda
                            </p>
                          </div>
                          {createdDiscountCode ? (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {createdDiscountCode}
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setShowDiscountDialog(true)}
                            >
                              <Tag className="w-4 h-4 mr-1" />
                              Crear en Shopify
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {/* Shopify Discount Dialog */}
            <ShopifyDiscountDialog
              open={showDiscountDialog}
              onOpenChange={setShowDiscountDialog}
              clientId={clientId}
              suggestedCode={`WELCOME${wizardData.discountPercent}`}
              onSuccess={(code) => setCreatedDiscountCode(code)}
            />

            {/* Step 4: Products (campaigns only) */}
            {step === 4 && flowType === 'campaign' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    ¿Qué productos quieres promocionar?
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Selecciona los productos que destacarás en esta campaña.
                  </p>
                </div>

                {loadingProducts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : hasShopifyConnection && topProducts.length > 0 ? (
                  <>
                    {/* Recommendation based on sales */}
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex gap-3">
                      <TrendingUp className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">
                          Basado en tu mix de ventas de Shopify
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Te recomendamos promocionar tus productos más vendidos para maximizar conversiones.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {topProducts.map((product, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            id={`product-${idx}`}
                            checked={wizardData.selectedProducts.includes(product.title)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setWizardData({
                                  ...wizardData,
                                  selectedProducts: [...wizardData.selectedProducts, product.title],
                                });
                              } else {
                                setWizardData({
                                  ...wizardData,
                                  selectedProducts: wizardData.selectedProducts.filter(p => p !== product.title),
                                });
                              }
                            }}
                          />
                          <Label htmlFor={`product-${idx}`} className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{product.title}</span>
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>{product.sales} ventas</span>
                                <span>${product.revenue.toLocaleString()}</span>
                              </div>
                            </div>
                          </Label>
                          {idx < 3 && (
                            <Badge variant="outline" className="text-xs">
                              Top {idx + 1}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {hasShopifyConnection 
                        ? 'No hay datos de productos disponibles aún.'
                        : 'Conecta tu tienda Shopify para ver recomendaciones basadas en tus ventas.'}
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="manual-products">
                        Ingresa los productos manualmente:
                      </Label>
                      <Textarea
                        id="manual-products"
                        placeholder="Ej: Zapatillas Running Pro, Camiseta Deportiva, Shorts Fitness..."
                        value={wizardData.selectedProducts.join(', ')}
                        onChange={(e) => setWizardData({
                          ...wizardData,
                          selectedProducts: e.target.value.split(',').map(p => p == null ? '' : String(p).trim()).filter(Boolean),
                        })}
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Additional notes */}
                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor="notes">Notas adicionales (opcional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Describe el objetivo de la campaña, tono, ofertas especiales, etc."
                    value={wizardData.notes}
                    onChange={(e) => setWizardData({ ...wizardData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Notes for non-campaign flows */}
            {step === 3 && flowType !== 'campaign' && (
              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="notes">Notas adicionales (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Describe el objetivo, tono de comunicación, productos a destacar, etc."
                  value={wizardData.notes}
                  onChange={(e) => setWizardData({ ...wizardData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 1 ? onCancel : handleBack}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </Button>

          <div className="text-sm text-muted-foreground">
            Paso {step} de {totalSteps}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || saving}
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {step === totalSteps ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                Crear Plan
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
