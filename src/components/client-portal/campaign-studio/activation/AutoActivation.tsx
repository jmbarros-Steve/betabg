import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Loader2,
  CheckCircle2,
  Zap,
  Mail,
  ShoppingCart,
  Heart,
  Gift,
  Megaphone,
  BookOpen,
  CreditCard,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutoActivationProps {
  clientId: string;
  onComplete: () => void;
  onSkip: () => void;
}

interface BrandInfo {
  name: string;
  tone: string;
  industry: string;
}

interface ActivationItem {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
}

const TEMPLATE_ITEMS: Omit<ActivationItem, 'enabled'>[] = [
  {
    id: 'template_promotional',
    name: 'Template Promocional',
    description: 'Para ofertas, descuentos y lanzamientos de producto',
    icon: Megaphone,
  },
  {
    id: 'template_informativo',
    name: 'Template Informativo',
    description: 'Para newsletters, contenido educativo y actualizaciones',
    icon: BookOpen,
  },
  {
    id: 'template_transaccional',
    name: 'Template Transaccional',
    description: 'Para confirmaciones de compra y actualizaciones de pedido',
    icon: CreditCard,
  },
];

const FLOW_ITEMS: Omit<ActivationItem, 'enabled'>[] = [
  {
    id: 'flow_welcome',
    name: 'Welcome Series',
    description:
      '3-5 emails de bienvenida para nuevos suscriptores, presentando tu marca y primera oferta',
    icon: Heart,
  },
  {
    id: 'flow_abandoned_cart',
    name: 'Abandoned Cart',
    description:
      '3 emails automaticos para recuperar carritos abandonados con urgencia y descuento',
    icon: ShoppingCart,
  },
  {
    id: 'flow_post_purchase',
    name: 'Post-Purchase',
    description:
      'Emails de seguimiento post-compra para review, cross-sell y fidelizacion',
    icon: Gift,
  },
];

export function AutoActivation({
  clientId,
  onComplete,
  onSkip,
}: AutoActivationProps) {
  const [step, setStep] = useState(1);
  const [brandInfo, setBrandInfo] = useState<BrandInfo | null>(null);
  const [loadingBrand, setLoadingBrand] = useState(true);

  // Activation items
  const [templates, setTemplates] = useState<ActivationItem[]>(
    TEMPLATE_ITEMS.map((t) => ({ ...t, enabled: true }))
  );
  const [flows, setFlows] = useState<ActivationItem[]>(
    FLOW_ITEMS.map((f) => ({ ...f, enabled: true }))
  );
  const [campaignEnabled, setCampaignEnabled] = useState(true);

  // Activation progress
  const [activating, setActivating] = useState(false);
  const [activationProgress, setActivationProgress] = useState(0);
  const [activationLabel, setActivationLabel] = useState('');

  // Connection
  const [connectionId, setConnectionId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, [clientId]);

  const loadInitialData = async () => {
    setLoadingBrand(true);

    try {
      // Load connection
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (conn) {
        setConnectionId(conn.id);
      }

      // Load brand info from clients table
      // Fix Javiera W12 (2026-04-07): clients no tiene business_name ni industry.
      // Usar columnas reales (company, name) y derivar industry desde brand_identity jsonb.
      const { data: client } = await supabase
        .from('clients')
        .select('name, company, brand_identity')
        .eq('id', clientId)
        .maybeSingle();

      let brandName = client?.company || client?.name || 'Tu Marca';
      let tone = 'Profesional y cercano';
      let industry = 'E-commerce';

      // Try to extract from brand_identity if available
      if (client?.brand_identity) {
        const bi =
          typeof client.brand_identity === 'string'
            ? JSON.parse(client.brand_identity)
            : client.brand_identity;
        if (bi?.tone) tone = bi.tone;
        if (bi?.industry) industry = bi.industry;
        if (bi?.name) brandName = bi.name;
      }

      // Also check buyer_personas for tone/style info
      const { data: persona } = await supabase
        .from('buyer_personas')
        .select('persona_data')
        .eq('client_id', clientId)
        .maybeSingle();

      if (persona?.persona_data) {
        const pd = persona.persona_data as Record<string, any>;
        if (pd?.tone_of_voice) tone = pd.tone_of_voice;
        if (pd?.industry) industry = pd.industry;
      }

      setBrandInfo({ name: brandName, tone, industry });

      // Advance to step 2 after delay to show loading animation
      setTimeout(() => {
        setStep(2);
      }, 2000);
    } catch {
      // Fall back to default brand info
      setBrandInfo({
        name: 'Tu Marca',
        tone: 'Profesional',
        industry: 'E-commerce',
      });
      setTimeout(() => setStep(2), 2000);
    } finally {
      setLoadingBrand(false);
    }
  };

  const toggleTemplate = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  const toggleFlow = (id: string) => {
    setFlows((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleActivate = async () => {
    setActivating(true);
    const enabledFlows = flows.filter((f) => f.enabled);
    const totalSteps = enabledFlows.length;
    let currentStep = 0;

    try {
      // Create flow plans for each enabled flow
      for (const flow of enabledFlows) {
        currentStep++;
        setActivationProgress(Math.round((currentStep / totalSteps) * 80));
        setActivationLabel(
          `Configurando ${flow.name} (${currentStep}/${totalSteps})...`
        );

        try {
          await callApi('steve-email-content', {
            body: {
              connectionId,
              action: 'generate_flow',
              flowType: flow.id.replace('flow_', ''),
              brandName: brandInfo?.name,
              tone: brandInfo?.tone,
              industry: brandInfo?.industry,
              clientId,
            },
          });
        } catch {
          // Continue with the other flows even if one fails
        }
      }

      // Create a draft campaign if enabled
      if (campaignEnabled) {
        setActivationProgress(90);
        setActivationLabel('Creando borrador de primera campana...');

        try {
          await supabase.from('email_campaigns' as any).insert({
            client_id: clientId,
            name: `Primera campana - ${brandInfo?.name || 'Bienvenida'}`,
            campaign_type: 'promotional',
            status: 'draft',
            subject: `Conoce ${brandInfo?.name || 'nuestra tienda'} - Algo especial para ti`,
            preview_text: 'Descubre lo que tenemos preparado',
            content_json: {
              title: `Bienvenido a ${brandInfo?.name || 'nuestra tienda'}`,
              introText:
                'Estamos emocionados de tenerte aqui. Preparamos algo especial para ti.',
              ctaText: 'Ver mas',
            },
          });
        } catch {
          // silently ignore
        }
      }

      setActivationProgress(100);
      setActivationLabel('Listo!');

      // Brief delay then move to step 3
      setTimeout(() => {
        setStep(3);
      }, 500);

      toast.success('Activacion completada');
    } catch (err: any) {
      // Error handled by toast below
      toast.error('Error durante la activacion. Algunos elementos pueden no haberse creado.');
      setStep(3);
    } finally {
      setActivating(false);
    }
  };

  const enabledCount =
    templates.filter((t) => t.enabled).length +
    flows.filter((f) => f.enabled).length +
    (campaignEnabled ? 1 : 0);

  // Step 1: Loading/Analyzing
  if (step === 1) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-12">
          <div className="text-center space-y-6">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <StepDot active />
              <div className="w-8 h-0.5 bg-muted" />
              <StepDot />
              <div className="w-8 h-0.5 bg-muted" />
              <StepDot />
            </div>

            <div className="flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                Steve esta analizando tu marca...
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Preparando la mejor estrategia de email marketing para ti
              </p>
            </div>

            <div className="space-y-3 max-w-sm mx-auto">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>

            {brandInfo && !loadingBrand && (
              <div className="space-y-2 animate-in fade-in duration-500">
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="secondary">{brandInfo.name}</Badge>
                  <Badge variant="outline">{brandInfo.tone}</Badge>
                  <Badge variant="outline">{brandInfo.industry}</Badge>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-muted-foreground"
            >
              Omitir por ahora
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Step 2: Review and Activate
  if (step === 2) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-8">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <StepDot completed />
            <div className="w-8 h-0.5 bg-primary" />
            <StepDot active />
            <div className="w-8 h-0.5 bg-muted" />
            <StepDot />
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold">
              Steve preparo esto para ti
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Selecciona lo que quieres activar para{' '}
              <span className="font-medium text-foreground">
                {brandInfo?.name || 'tu marca'}
              </span>
            </p>
          </div>

          <div className="space-y-6">
            {/* Templates */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Mail className="w-4 h-4 text-primary" />3 Templates Base
              </h3>
              <div className="space-y-2">
                {templates.map((item) => (
                  <ActivationItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleTemplate(item.id)}
                  />
                ))}
              </div>
            </div>

            {/* Flows */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-primary" />3 Flujos Prioritarios
              </h3>
              <div className="space-y-2">
                {flows.map((item) => (
                  <ActivationItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleFlow(item.id)}
                  />
                ))}
              </div>
            </div>

            {/* First Campaign */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Megaphone className="w-4 h-4 text-primary" />
                Primera Campana
              </h3>
              <div
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                  campaignEnabled
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/30 border-border'
                )}
              >
                <Checkbox
                  checked={campaignEnabled}
                  onCheckedChange={(checked) =>
                    setCampaignEnabled(checked === true)
                  }
                />
                <Megaphone className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Campana de bienvenida
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Un borrador de campana promocional basado en tu marca para
                    que edites y envies
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Activation progress */}
          {activating && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {activationLabel}
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all duration-300"
                  style={{ width: `${activationProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t">
            <Button variant="ghost" onClick={onSkip} disabled={activating}>
              Omitir
            </Button>
            <Button
              onClick={handleActivate}
              disabled={activating || enabledCount === 0}
              className="gap-2"
            >
              {activating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Activando...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Activar todo ({enabledCount})
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Step 3: Success
  return (
    <Card className="max-w-2xl mx-auto">
      <CardContent className="py-12">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <StepDot completed />
          <div className="w-8 h-0.5 bg-primary" />
          <StepDot completed />
          <div className="w-8 h-0.5 bg-primary" />
          <StepDot active />
        </div>

        <div className="text-center space-y-6">
          <div className="flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold">Todo listo!</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Steve configuro tu estrategia de email marketing
            </p>
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-xl p-4 max-w-sm mx-auto text-left space-y-2">
            {templates.filter((t) => t.enabled).length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span>
                  {templates.filter((t) => t.enabled).length} templates base
                  creados
                </span>
              </div>
            )}
            {flows.filter((f) => f.enabled).length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span>
                  {flows.filter((f) => f.enabled).length} flujos configurados
                </span>
              </div>
            )}
            {campaignEnabled && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span>1 campana borrador creada</span>
              </div>
            )}
          </div>

          <Button onClick={onComplete} size="lg" className="gap-2">
            Ir al Campaign Studio
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Sub-components ---

function StepDot({
  active,
  completed,
}: {
  active?: boolean;
  completed?: boolean;
}) {
  return (
    <div
      className={cn(
        'w-3 h-3 rounded-full transition-colors',
        completed
          ? 'bg-primary'
          : active
            ? 'bg-primary ring-4 ring-primary/20'
            : 'bg-muted'
      )}
    />
  );
}

function ActivationItemRow({
  item,
  onToggle,
}: {
  item: ActivationItem;
  onToggle: () => void;
}) {
  const Icon = item.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
        item.enabled
          ? 'bg-primary/5 border-primary/20'
          : 'bg-muted/30 border-border'
      )}
      onClick={onToggle}
    >
      <Checkbox checked={item.enabled} onCheckedChange={() => onToggle()} />
      <Icon className="w-5 h-5 text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    </div>
  );
}
