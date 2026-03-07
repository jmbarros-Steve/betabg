import { useState, useCallback, useEffect } from 'react';
import { Calendar, ChevronRight, Loader2, Sparkles, Trash2, Plus, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { BulkPreviewGallery } from './BulkPreviewGallery';
import { generateBrandEmail, type BrandIdentity, type ProductItem } from '../templates/BrandHtmlGenerator';
import { CAMPAIGN_TEMPLATES, CAMPAIGN_TYPE_LIST, CAMPAIGN_TYPE_COLORS, type CampaignType } from '../templates/TemplatePresets';
import { renderBlockToHtml } from '../../email-blocks/blockRenderer';
import type { EmailBlock } from '../../email-blocks/blockTypes';

interface PlannedCampaign {
  id: string;
  name: string;
  subject: string;
  campaignType: CampaignType;
  week: number;
  dayOfWeek: number; // 0=Mon
  exactDate: string; // yyyy-mm-dd
  sendTime: string; // HH:mm
  templateId: string | null;
  segmentId: string | null;
  segmentName: string;
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

function formatDateToYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function MonthlyPlannerWizard({ clientId, brand, open, onClose, onCreated }: MonthlyPlannerWizardProps) {
  const now = new Date();
  const [step, setStep] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1 > 11 ? 0 : now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(selectedMonth === 0 ? now.getFullYear() + 1 : now.getFullYear());

  const buildInitialCampaigns = (year: number, month: number): PlannedCampaign[] =>
    DEFAULT_PLAN.map((p) => {
      const date = getWeekDate(year, month, p.week, 1);
      return {
        id: crypto.randomUUID(),
        name: p.label,
        subject: CAMPAIGN_TEMPLATES[p.type].defaultSubject,
        campaignType: p.type,
        week: p.week,
        dayOfWeek: 1,
        exactDate: formatDateToYMD(date),
        sendTime: '10:00',
        templateId: null,
        segmentId: null,
        segmentName: '',
        html: '',
        scheduledDate: '',
        products: [],
      };
    });

  const [plannedCampaigns, setPlannedCampaigns] = useState<PlannedCampaign[]>(() =>
    buildInitialCampaigns(selectedYear, selectedMonth)
  );
  const [generating, setGenerating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState<Array<{ name: string; success: boolean }>>([]);

  // Data loading state
  const [clientTemplates, setClientTemplates] = useState<{ id: string; name: string }[]>([]);
  const [klaviyoSegments, setKlaviyoSegments] = useState<{ id: string; name: string; type: string; count: string | number }[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Load templates and segments when the dialog opens
  useEffect(() => {
    if (!open || !clientId) return;

    let cancelled = false;

    async function loadData() {
      setLoadingData(true);

      // Load email templates
      const { data: templates } = await supabase
        .from('email_templates')
        .select('id, name')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false });

      if (!cancelled && templates) {
        setClientTemplates(templates.map(t => ({ id: t.id, name: t.name })));
      }

      // Load Klaviyo segments/lists
      try {
        const { data: conn } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'klaviyo')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (conn && !cancelled) {
          const { data, error } = await callApi('sync-klaviyo-metrics', {
            body: { connectionId: conn.id, timeframe: 'last_30_days' },
          });

          if (!error && data && !cancelled) {
            const listItems = (data.lists || []).map((l: any) => ({
              id: l.id,
              name: l.name,
              type: 'list',
              count: l.profile_count ?? 0,
            }));
            const segmentItems = (data.segments || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              type: 'segment',
              count: s.profile_count ?? 0,
            }));
            setKlaviyoSegments([...listItems, ...segmentItems]);
          }
        }
      } catch (e) {
        console.error('Error loading Klaviyo segments:', e);
      }

      if (!cancelled) setLoadingData(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [open, clientId]);

  // Recalculate dates when month/year changes
  useEffect(() => {
    setPlannedCampaigns(prev =>
      prev.map(c => {
        const date = getWeekDate(selectedYear, selectedMonth, c.week, c.dayOfWeek);
        return { ...c, exactDate: formatDateToYMD(date) };
      })
    );
  }, [selectedMonth, selectedYear]);

  const updateCampaign = (id: string, updates: Partial<PlannedCampaign>) => {
    setPlannedCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCampaign = (id: string) => {
    setPlannedCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const addCampaign = () => {
    const nextWeek = Math.max(...plannedCampaigns.map(c => c.week), 0) + 1;
    const week = Math.min(nextWeek, 5);
    const date = getWeekDate(selectedYear, selectedMonth, week, 1);
    setPlannedCampaigns(prev => [...prev, {
      id: crypto.randomUUID(),
      name: 'Nueva campaña',
      subject: '',
      campaignType: 'custom' as CampaignType,
      week,
      dayOfWeek: 1,
      exactDate: formatDateToYMD(date),
      sendTime: '10:00',
      templateId: null,
      segmentId: null,
      segmentName: '',
      html: '',
      scheduledDate: '',
      products: [],
    }]);
  };

  const generateAllHtml = useCallback(async () => {
    setGenerating(true);

    const updatedCampaigns: PlannedCampaign[] = [];

    for (const c of plannedCampaigns) {
      let html = '';

      if (c.templateId) {
        // Load blocks from email_templates and render
        try {
          const { data: tmpl } = await supabase
            .from('email_templates')
            .select('content_blocks')
            .eq('id', c.templateId)
            .maybeSingle();

          if (tmpl?.content_blocks && Array.isArray(tmpl.content_blocks)) {
            const blocks = tmpl.content_blocks as unknown as EmailBlock[];
            const templateColors = {
              primary: brand.colors.primary,
              secondary: brand.colors.secondaryBg,
              accent: brand.colors.accent,
              button: brand.colors.accent,
              buttonText: '#ffffff',
              font: `'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}`,
            };
            const bodyHtml = blocks.map(b => renderBlockToHtml(b, templateColors)).join('\n');
            html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin:0; padding:0; background-color:#f6f6f9; font-family:'${brand.fonts.body}', ${brand.fonts.bodyType || 'sans-serif'}; }
    table { border-spacing:0; }
    td { padding:0; }
    img { border:0; display:block; max-width:100%; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f6f9;">
    <tr><td align="center" style="padding:24px 0;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td>
${bodyHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
          }
        } catch (err) {
          console.error('Error loading template blocks for', c.name, err);
        }
      }

      // Fallback: generate with brand email if no template or template load failed
      if (!html) {
        const template = CAMPAIGN_TEMPLATES[c.campaignType];
        html = generateBrandEmail({
          brand,
          sections: template.sections,
          products: c.products,
          title: c.name,
          introText: template.defaultIntro,
          ctaText: template.defaultCtaText,
          ctaUrl: brand.shopUrl,
        });
      }

      // Format display date from exactDate and sendTime
      const dateParts = c.exactDate.split('-');
      const displayDate = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2])
      );
      const scheduledDate = displayDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) + ` ${c.sendTime}`;

      updatedCampaigns.push({ ...c, html, scheduledDate });
    }

    setPlannedCampaigns(updatedCampaigns);
    setGenerating(false);
    toast.success(`${updatedCampaigns.length} previews generados`);
  }, [plannedCampaigns, brand]);

  const pushAllToKlaviyo = useCallback(async () => {
    setPushing(true);
    const results: Array<{ name: string; success: boolean }> = [];

    for (const campaign of plannedCampaigns) {
      try {
        // Build ISO scheduled_at from exactDate + sendTime
        const scheduledAt = new Date(`${campaign.exactDate}T${campaign.sendTime}:00`).toISOString();

        const insertPayload: Record<string, any> = {
          client_id: clientId,
          name: campaign.name,
          subject: campaign.subject || CAMPAIGN_TEMPLATES[campaign.campaignType].defaultSubject,
          final_html: campaign.html,
          status: 'draft',
          scheduled_at: scheduledAt,
        };

        if (campaign.templateId) {
          insertPayload.template_id = campaign.templateId;
        }

        if (campaign.segmentId) {
          // Determine if it's a list or segment by checking the loaded data
          const seg = klaviyoSegments.find(s => s.id === campaign.segmentId);
          if (seg?.type === 'list') {
            insertPayload.klaviyo_list_id = campaign.segmentId;
          } else {
            insertPayload.klaviyo_segment_id = campaign.segmentId;
          }
        }

        const { error } = await supabase
          .from('email_campaigns')
          .insert(insertPayload as any);

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
  }, [plannedCampaigns, clientId, klaviyoSegments, onCreated]);

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
            <p className="text-sm text-muted-foreground">
              Configura las campañas del mes. Puedes agregar, quitar o modificar cada una.
              {loadingData && <span className="ml-2 text-xs text-orange-500">(Cargando templates y segmentos...)</span>}
            </p>
            {plannedCampaigns.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4 space-y-3">
                  {/* Header with color dot + delete */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[c.campaignType] }} />
                      <span className="text-sm font-medium">Semana {c.week}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeCampaign(c.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>

                  {/* Row 1: Name + Type */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
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

                  {/* Row 2: Date + Time + Template */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Fecha</Label>
                      <Input
                        type="date"
                        value={c.exactDate}
                        onChange={e => updateCampaign(c.id, { exactDate: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Hora</Label>
                      <Input
                        type="time"
                        value={c.sendTime}
                        onChange={e => updateCampaign(c.id, { sendTime: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Template</Label>
                      <Select
                        value={c.templateId || 'none'}
                        onValueChange={v => updateCampaign(c.id, { templateId: v === 'none' ? null : v })}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sin template" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin template (auto-generado)</SelectItem>
                          {clientTemplates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Row 3: Segment + Subject */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Segmento / Lista</Label>
                      <Select
                        value={c.segmentId || 'none'}
                        onValueChange={v => {
                          const seg = klaviyoSegments.find(s => s.id === v);
                          updateCampaign(c.id, {
                            segmentId: v === 'none' ? null : v,
                            segmentName: seg?.name || '',
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Toda la lista" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Toda la lista</SelectItem>
                          {klaviyoSegments.map(s => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} ({s.count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <span className="text-xs text-muted-foreground">
                        ({c.exactDate} {c.sendTime})
                      </span>
                      {c.segmentName && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{c.segmentName}</Badge>
                      )}
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
