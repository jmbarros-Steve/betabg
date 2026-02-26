import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  TrendingUp, Eye, Layers, Sparkles, Megaphone, Paintbrush,
  PlusCircle, CalendarDays, BarChart3, Palette,
} from 'lucide-react';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_LIST, type CampaignType } from './templates/TemplatePresets';
import type { BrandIdentity } from './templates/BrandHtmlGenerator';
import { CampaignCreationWizard } from './create/CampaignCreationWizard';
import { MonthlyCalendar } from './calendar/MonthlyCalendar';
import { MonthlyPlannerWizard } from './bulk/MonthlyPlannerWizard';
import { KlaviyoMetricsPanel } from '../KlaviyoMetricsPanel';

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
    primary: '#193a43', accent: '#ff5b00', secondaryBg: '#ffece1',
    footerBg: '#f4f4f8', border: '#e0e6f4', text: '#193a43', textLight: '#6b7280',
  },
  fonts: { heading: 'Kaisei Tokumin', headingType: 'serif', body: 'Anonymous Pro', bodyType: 'monospace' },
  buttons: { borderRadius: 24, height: 48, style: 'pill' },
  aesthetic: 'Modern Botanical Artisan',
  logoUrl: '',
  shopUrl: '',
};

interface CampaignStudioProps {
  clientId: string;
}

export function CampaignStudio({ clientId }: CampaignStudioProps) {
  const [brand, setBrand] = useState<BrandIdentity>(DEFAULT_BRAND);
  const [activeTab, setActiveTab] = useState('crear');
  const [selectedType, setSelectedType] = useState<CampaignType | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function loadBrand() {
      const { data, error } = await supabase
        .from('clients')
        .select('brand_identity')
        .eq('id', clientId)
        .maybeSingle();

      if (!error && data?.brand_identity) {
        const bi = data.brand_identity as unknown as BrandIdentity;
        setBrand({ ...DEFAULT_BRAND, ...bi });
      }
    }
    loadBrand();
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
    toast.success('Campana creada exitosamente');
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Palette className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">Campaign Studio</h2>
            <p className="text-sm text-muted-foreground">
              Crea, programa y mide campanas de email con tu identidad de marca
            </p>
          </div>
        </div>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="crear" className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Crear
          </TabsTrigger>
          <TabsTrigger value="calendario" className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="metricas" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Metricas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="crear" className="mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAMPAIGN_TYPE_LIST.map((type) => {
              const template = CAMPAIGN_TEMPLATES[type];
              const Icon = ICON_MAP[template.icon] || Sparkles;
              return (
                <Card
                  key={type}
                  className="cursor-pointer transition-all duration-200 hover:shadow-md group"
                  style={{
                    borderColor: 'transparent',
                  }}
                  onClick={() => handleTypeSelect(type)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = brand.colors.accent;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                  }}
                >
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${brand.colors.accent}15` }}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: brand.colors.accent }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{template.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {template.description}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/70 mt-auto">
                      {template.dataSource === 'klaviyo_ordered' && 'Klaviyo Orders'}
                      {template.dataSource === 'klaviyo_viewed' && 'Klaviyo Views'}
                      {template.dataSource === 'shopify_collection' && 'Shopify Collection'}
                      {template.dataSource === 'shopify_newest' && 'Shopify Newest'}
                      {template.dataSource === 'manual' && 'Manual'}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="calendario" className="mt-6">
          <MonthlyCalendar
            clientId={clientId}
            brand={brand}
            onCreateCampaign={(type, date) => {
              setSelectedType(type);
              setWizardOpen(true);
            }}
            onEditCampaign={(campaignId) => {
              // Future: open editor for existing campaign
              console.log('Edit campaign:', campaignId);
            }}
            key={refreshKey}
          />
        </TabsContent>

        <TabsContent value="metricas" className="mt-6">
          <KlaviyoMetricsPanel clientId={clientId} />
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
