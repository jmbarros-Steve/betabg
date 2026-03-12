import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  TrendingUp, Eye, Layers, Sparkles, Megaphone, Paintbrush,
  PlusCircle, CalendarDays, BarChart3, Palette, Zap, MessageCircle,
  ArrowRight, LayoutTemplate, Upload,
} from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_LIST, type CampaignType } from './templates/TemplatePresets';
import type { BrandIdentity } from './templates/BrandHtmlGenerator';
import { CampaignCreationWizard } from './create/CampaignCreationWizard';
import { MonthlyCalendar } from './calendar/MonthlyCalendar';
import { MonthlyPlannerWizard } from './bulk/MonthlyPlannerWizard';
import { BulkUploadWizard } from './bulk/BulkUploadWizard';
import { FlowsPanel } from './flows/FlowsPanel';
import { MetricsInsights } from './insights/MetricsInsights';
import { SteveKlaviyoChat } from './chat/SteveKlaviyoChat';
import { AutoActivation } from './activation/AutoActivation';
import TemplatesPanel from './templates/TemplatesPanel';
import { Coachmark } from '@/components/client-portal/Coachmark';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  Eye,
  Layers,
  Sparkles,
  Megaphone,
  Paintbrush,
};

const DEFAULT_BRAND: BrandIdentity = {
  colors: {
    primary: '#1a1a2e', accent: '#e94560', secondaryBg: '#fef2f4',
    footerBg: '#f4f4f8', border: '#e5e7eb', text: '#1a1a2e', textLight: '#6b7280',
  },
  fonts: { heading: 'Inter', headingType: 'sans-serif', body: 'Inter', bodyType: 'sans-serif' },
  buttons: { borderRadius: 8, height: 44, style: 'rounded' },
  aesthetic: 'Modern Clean',
  logoUrl: '',
  shopUrl: '',
};

interface CampaignStudioProps {
  clientId: string;
}

export function CampaignStudio({ clientId }: CampaignStudioProps) {
  const [brand, setBrand] = useState<BrandIdentity>(DEFAULT_BRAND);
  const [activeTab, setActiveTab] = useState('plantillas');
  const [selectedType, setSelectedType] = useState<CampaignType | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showActivation, setShowActivation] = useState(false);
  const [hasKlaviyoConnection, setHasKlaviyoConnection] = useState<boolean | null>(null);

  useEffect(() => {
    async function loadBrandAndCheckConnection() {
      const [brandResult, connResult] = await Promise.all([
        supabase
          .from('clients')
          .select('brand_identity, name, company')
          .eq('id', clientId)
          .maybeSingle(),
        supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'klaviyo')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!brandResult.error && brandResult.data?.brand_identity) {
        const bi = brandResult.data.brand_identity as unknown as BrandIdentity;
        setBrand(prev => ({ ...prev, ...bi }));
      }

      const connected = !!connResult.data;
      setHasKlaviyoConnection(connected);

      if (connected) {
        const activationKey = `bg_klaviyo_activated_${clientId}`;
        if (!localStorage.getItem(activationKey)) {
          setShowActivation(true);
        }
      }
    }
    loadBrandAndCheckConnection();
  }, [clientId]);

  const handleTypeSelect = useCallback((type: CampaignType) => {
    setSelectedType(type);
    setWizardOpen(true);
  }, []);

  const handleWizardClose = useCallback(() => {
    setWizardOpen(false);
    setSelectedType(null);
  }, []);

  const handleCampaignCreated = useCallback(() => {
    setWizardOpen(false);
    setSelectedType(null);
    setRefreshKey(k => k + 1);
    toast.success('Campaña creada');
  }, []);

  const handleActivationComplete = useCallback(() => {
    localStorage.setItem(`bg_klaviyo_activated_${clientId}`, 'true');
    setShowActivation(false);
    toast.success('Email marketing activado');
  }, [clientId]);

  return (
    <div className="space-y-6">
      <Coachmark id="klaviyo_intro" message="Crea campañas de email, diseña plantillas y configura flujos automáticos para tu tienda. Empieza en Plantillas para diseñar tu primer email." />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Palette className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Campaign Studio</h2>
            <p className="text-sm text-muted-foreground">
              Email marketing inteligente — crea, envía y analiza tus campañas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setBulkUploadOpen(true)}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Carga Masiva
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlannerOpen(true)}
            className="flex items-center gap-2"
          >
            <CalendarDays className="w-4 h-4" />
            Planificar Mes
          </Button>
        </div>
      </div>

      {/* Connection status */}
      {hasKlaviyoConnection === false && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="py-4 px-5 flex items-center gap-3">
            <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-100">
              Sin conexión
            </Badge>
            <span className="text-sm text-yellow-800">
              Conecta tu cuenta de Klaviyo en la pestaña "Conexiones" para activar el email marketing.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Templates | Campañas | Flujos | Calendario | Métricas | Steve */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 max-w-3xl">
          <TabsTrigger value="plantillas" className="flex items-center gap-1.5 text-xs">
            <LayoutTemplate className="w-3.5 h-3.5" />
            Plantillas
          </TabsTrigger>
          <TabsTrigger value="campanas" className="flex items-center gap-1.5 text-xs">
            <PlusCircle className="w-3.5 h-3.5" />
            Campañas
          </TabsTrigger>
          <TabsTrigger value="flujos" className="flex items-center gap-1.5 text-xs">
            <Zap className="w-3.5 h-3.5" />
            Flujos
          </TabsTrigger>
          <TabsTrigger value="calendario" className="flex items-center gap-1.5 text-xs">
            <CalendarDays className="w-3.5 h-3.5" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="metricas" className="flex items-center gap-1.5 text-xs">
            <BarChart3 className="w-3.5 h-3.5" />
            Métricas
          </TabsTrigger>
          <TabsTrigger value="steve" className="flex items-center gap-1.5 text-xs">
            <MessageCircle className="w-3.5 h-3.5" />
            Steve
          </TabsTrigger>
        </TabsList>

        {/* Breadcrumb */}
        <Breadcrumb className="mt-4 mb-2 px-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">Klaviyo</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {{ plantillas: 'Plantillas', campanas: 'Campañas', flujos: 'Flujos', calendario: 'Calendario', metricas: 'Métricas', steve: 'Steve' }[activeTab] ?? activeTab}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* TAB: Plantillas — Editor drag & drop, CRUD de templates */}
        <TabsContent value="plantillas" className="mt-6">
          <TemplatesPanel clientId={clientId} brand={brand} />
        </TabsContent>

        {/* TAB: Campañas — Crear campañas seleccionando tipo */}
        <TabsContent value="campanas" className="mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAMPAIGN_TYPE_LIST.map((type) => {
              const template = CAMPAIGN_TEMPLATES[type];
              const Icon = ICON_MAP[template.icon] || Sparkles;
              return (
                <Card
                  key={type}
                  className="cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] group border-2"
                  style={{ borderColor: 'transparent' }}
                  onClick={() => handleTypeSelect(type)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = brand.colors.accent;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                  }}
                >
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${brand.colors.accent}15` }}
                      >
                        <Icon className="w-5 h-5" style={{ color: brand.colors.accent }} />
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{template.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      <Badge variant="secondary" className="text-[10px]">
                        {template.dataSource === 'klaviyo_ordered' && 'Klaviyo Orders'}
                        {template.dataSource === 'klaviyo_viewed' && 'Klaviyo Views'}
                        {template.dataSource === 'shopify_collection' && 'Shopify'}
                        {template.dataSource === 'shopify_newest' && 'Novedades'}
                        {template.dataSource === 'manual' && 'Manual'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/60">
                        {template.sections.filter(s => s.type === 'product_grid').length > 0
                          ? `${template.defaultProductCount} productos`
                          : 'Sin productos'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB: Flujos */}
        <TabsContent value="flujos" className="mt-6">
          <FlowsPanel clientId={clientId} />
        </TabsContent>

        {/* TAB: Calendario */}
        <TabsContent value="calendario" className="mt-6">
          <MonthlyCalendar
            clientId={clientId}
            brand={brand}
            onCreateCampaign={(type) => {
              setSelectedType(type);
              setWizardOpen(true);
            }}
            onEditCampaign={(campaignId) => {
              console.log('Edit campaign:', campaignId);
            }}
            key={refreshKey}
          />
        </TabsContent>

        {/* TAB: Métricas — Solo datos y análisis */}
        <TabsContent value="metricas" className="mt-6">
          <MetricsInsights clientId={clientId} />
        </TabsContent>

        {/* TAB: Steve Chat — Persistente */}
        <TabsContent value="steve" className="mt-6">
          <SteveKlaviyoChat clientId={clientId} />
        </TabsContent>
      </Tabs>

      {/* Campaign Creation Wizard */}
      {selectedType && (
        <CampaignCreationWizard
          clientId={clientId}
          brand={brand}
          campaignType={selectedType}
          open={wizardOpen}
          onClose={handleWizardClose}
          onCreated={handleCampaignCreated}
        />
      )}

      {/* Monthly Planner */}
      {plannerOpen && (
        <MonthlyPlannerWizard
          clientId={clientId}
          brand={brand}
          open={plannerOpen}
          onClose={() => setPlannerOpen(false)}
          onCreated={() => {
            setPlannerOpen(false);
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Bulk Upload Wizard */}
      {bulkUploadOpen && (
        <BulkUploadWizard
          clientId={clientId}
          brand={brand}
          open={bulkUploadOpen}
          onClose={() => setBulkUploadOpen(false)}
          onCreated={() => {
            setBulkUploadOpen(false);
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Auto Activation (first time Klaviyo connected) */}
      {showActivation && (
        <AutoActivation
          clientId={clientId}
          onComplete={handleActivationComplete}
          onSkip={() => {
            localStorage.setItem(`bg_klaviyo_activated_${clientId}`, 'true');
            setShowActivation(false);
          }}
        />
      )}
    </div>
  );
}
