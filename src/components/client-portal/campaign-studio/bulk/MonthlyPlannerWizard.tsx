import { useState, useCallback } from 'react';
import { Calendar, ChevronRight, Loader2, Sparkles, Trash2, Plus, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BulkPreviewGallery } from './BulkPreviewGallery';
import { generateBrandEmail, type BrandIdentity, type ProductItem } from '../templates/BrandHtmlGenerator';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_LIST, CAMPAIGN_TYPE_COLORS, type CampaignType } from '../templates/TemplatePresets';

interface PlannedCampaign {
  id: string;
  name: string;
  subject: string;
  campaignType: CampaignType;
  week: number;
  dayOfWeek: number; // 0=Mon
  html: string;
  scheduledDate: string;
  products: ProductItem[];
}

interface MonthlyPlannerWizardProps {
  clientId: string;
  brand: BrandIdentity;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const DEFAULT_PLAN: Array<{ week: number; type: CampaignType; label: string }> = [
  { week: 1, type: 'best_sellers', label: 'Best Sellers del mes' },
  { week: 2, type: 'most_viewed', label: 'Más vistos de la semana' },
  { week: 3, type: 'collection', label: 'Colección Spotlight' },
  { week: 4, type: 'promotional', label: 'Promo de cierre de mes' },
];

function getWeekDate(year: number, month: number, week: number, dayOfWeek: number): Date {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const offset = (week - 1) * 7 + dayOfWeek - firstDayOfWeek;
  const date = new Date(year, month, Math.max(1, offset + 1), 10, 0, 0);
  // Clamp to the month
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (date.getDate() > lastDay) date.setDate(lastDay);
  if (date.getMonth() !== month) date.setMonth(month, Math.min(date.getDate(), lastDay));
  return date;
}

export function MonthlyPlannerWizard({ clientId, brand, open, onClose, onCreated }: MonthlyPlannerWizardProps) {
  const now = new Date();
  const [step, setStep] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1 > 11 ? 0 : now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(selectedMonth === 0 ? now.getFullYear() + 1 : now.getFullYear());
  const [plannedCampaigns, setPlannedCampaigns] = useState<PlannedCampaign[]>(() =>
    DEFAULT_PLAN.map((p, i) => ({
      id: crypto.randomUUID(),
      name: p.label,
      subject: CAMPAIGN_TEMPLATES[p.type].defaultSubject,
      campaignType: p.type,
      week: p.week,
      dayOfWeek: 1, // Tuesday default
      html: '',
      scheduledDate: '',
      products: [],
    }))
  );
  const [generating, setGenerating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState<Array<{ name: string; success: boolean }>>([]);

  const updateCampaign = (id: string, updates: Partial<PlannedCampaign>) => {
    setPlannedCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCampaign = (id: string) => {
    setPlannedCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const addCampaign = () => {
    const nextWeek = Math.max(...plannedCampaigns.map(c => c.week), 0) + 1;
    setPlannedCampaigns(prev => [...prev, {
      id: crypto.randomUUID(),
      name: 'Nueva campaña',
      subject: '',
      campaignType: 'custom' as CampaignType,
      week: Math.min(nextWeek, 5),
      dayOfWeek: 1,
      html: '',
      scheduledDate: '',
      products: [],
    }]);
  };

  const generateAllHtml = useCallback(async () => {
    setGenerating(true);
    const updated = plannedCampaigns.map(c => {
      const template = CAMPAIGN_TEMPLATES[c.campaignType];
      const date = getWeekDate(selectedYear, selectedMonth, c.week, c.dayOfWeek);
      const html = generateBrandEmail({
        brand,
        sections: template.sections,
        products: c.products,
        title: c.name,
        introText: template.defaultIntro,
        ctaText: template.defaultCtaText,
        ctaUrl: brand.shopUrl,
      });
      return { ...c, html, scheduledDate: date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) };
    });
    setPlannedCampaigns(updated);
    setGenerating(false);
    toast.success(`${updated.length} previews generados`);
  }, [plannedCampaigns, brand, selectedYear, selectedMonth]);

  const pushAllToKlaviyo = useCallback(async () => {
    setPushing(true);
    const results: Array<{ name: string; success: boolean }> = [];

    for (const campaign of plannedCampaigns) {
      try {
        const date = getWeekDate(selectedYear, selectedMonth, campaign.week, campaign.dayOfWeek);
        // Save to email_campaigns
        const { error } = await supabase
          .from('email_campaigns')
          .insert({
            client_id: clientId,
            name: campaign.name,
            subject: campaign.subject || CAMPAIGN_TEMPLATES[campaign.campaignType].defaultSubject,
            final_html: campaign.html,
            status: 'draft',
            scheduled_at: date.toISOString(),
            campaign_type: campaign.campaignType,
            data_source: CAMPAIGN_TEMPLATES[campaign.campaignType].dataSource,
          } as any);

        results.push({ name: campaign.name, success: !error });
        if (error) console.error('Error saving campaign:', error);
      } catch (err) {
        results.push({ name: campaign.name, success: false });
      }
    }

    setPushResults(results);
    const successCount = results.filter(r => r.success).length;
    toast.success(`${successCount}/${results.length} campañas creadas como borradores`);
    setPushing(false);
    onCreated?.();
  }, [plannedCampaigns, clientId, selectedYear, selectedMonth, onCreated]);

  const steps = ['Mes', 'Campañas', 'Preview', 'Crear'];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Planificar mes completo
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  i <= step ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-xs hidden sm:inline ${i <= step ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {s}
              </span>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step 0: Select month */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Selecciona el mes para planificar tus campañas de email.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mes</Label>
                <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Año</Label>
                <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2025, 2026, 2027].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">Plan sugerido para {MONTH_NAMES[selectedMonth]} {selectedYear}</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {DEFAULT_PLAN.map(p => (
                    <li key={p.week} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[p.type] }} />
                      Semana {p.week}: {p.label}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 1: Configure campaigns */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Configura las campañas del mes. Puedes agregar, quitar o modificar cada una.</p>
            {plannedCampaigns.map((c, idx) => (
              <Card key={c.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[c.campaignType] }} />
                      <span className="text-sm font-medium">Semana {c.week}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeCampaign(c.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nombre</Label>
                      <Input
                        value={c.name}
                        onChange={e => updateCampaign(c.id, { name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select value={c.campaignType} onValueChange={v => updateCampaign(c.id, { campaignType: v as CampaignType })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CAMPAIGN_TYPE_LIST.map(t => (
                            <SelectItem key={t} value={t}>{CAMPAIGN_TEMPLATES[t].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Asunto</Label>
                    <Input
                      value={c.subject}
                      onChange={e => updateCampaign(c.id, { subject: e.target.value })}
                      placeholder={CAMPAIGN_TEMPLATES[c.campaignType].defaultSubject}
                      className="h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button variant="outline" size="sm" onClick={addCampaign} className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar campaña
            </Button>
          </div>
        )}

        {/* Step 2: Preview gallery */}
        {step === 2 && (
          <div className="space-y-3">
            {plannedCampaigns.some(c => !c.html) ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-3">Genera los previews de todas las campañas</p>
                <Button onClick={generateAllHtml} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generar {plannedCampaigns.length} previews
                </Button>
              </div>
            ) : (
              <BulkPreviewGallery campaigns={plannedCampaigns} />
            )}
          </div>
        )}

        {/* Step 3: Push */}
        {step === 3 && (
          <div className="space-y-4">
            {pushResults.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-600 flex items-center gap-2">
                  <Check className="w-4 h-4" /> Campañas creadas
                </p>
                {pushResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {r.success ? <Check className="w-3.5 h-3.5 text-green-500" /> : <span className="w-3.5 h-3.5 text-red-500">✗</span>}
                    {r.name}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-4">
                  Las campañas se guardaron como borradores. Puedes programarlas desde el calendario.
                </p>
              </div>
            ) : (
              <div className="text-center py-8 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Se crearán {plannedCampaigns.length} campañas como borradores para {MONTH_NAMES[selectedMonth]} {selectedYear}.
                </p>
                <div className="space-y-1">
                  {plannedCampaigns.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm justify-center">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[c.campaignType] }} />
                      {c.name}
                    </div>
                  ))}
                </div>
                <Button onClick={pushAllToKlaviyo} disabled={pushing} size="lg">
                  {pushing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Crear {plannedCampaigns.length} borradores
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}>
            {step === 0 ? 'Cancelar' : 'Atrás'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(s => s + 1)}>
              Siguiente <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : pushResults.length > 0 ? (
            <Button onClick={onClose}>Cerrar</Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
