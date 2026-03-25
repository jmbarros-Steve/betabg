import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Upload, FileText,
  Table2, Loader2, Eye, Edit2, RefreshCw, Check, X,
  Bot, Package, CheckSquare, Square, ExternalLink, Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { renderBlockToHtml } from './email-blocks/blockRenderer';
import EmailBlockEditor from './email-blocks/EmailBlockEditor';
import type { EmailBlock } from './email-blocks/blockTypes';

interface MassCampaignsWizardProps {
  clientId: string;
  onClose: () => void;
}

interface TemplateOption {
  id: string;
  name: string;
  content_blocks: EmailBlock[];
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  button_color: string;
  button_text_color: string;
  font_family: string;
  logo_url: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  subject: string;
  audienceId: string;
  audienceName: string;
  content: string;
}

interface GeneratedCampaign extends CampaignRow {
  blocks: EmailBlock[];
  status: 'pending' | 'generating' | 'done' | 'error';
  selected: boolean;
  errorMessage?: string;
}

interface AudienceOption {
  id: string;
  name: string;
  type: 'list' | 'segment';
  profileCount?: string;
}

function renderBlocksToHtml(blocks: EmailBlock[], template: TemplateOption): string {
  const colors = {
    primary: template.primary_color,
    secondary: template.secondary_color,
    accent: template.accent_color,
    button: template.button_color,
    buttonText: template.button_text_color,
    font: template.font_family,
  };
  const bodyHtml = blocks.map(b => renderBlockToHtml(b, colors)).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:${template.font_family};"><div style="max-width:600px;margin:0 auto;background:#ffffff;">${bodyHtml}</div></body></html>`;
}

export function MassCampaignsWizard({ clientId, onClose }: MassCampaignsWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1 - Template selection
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateOption | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Step 2 - Campaign rows
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([
    { id: crypto.randomUUID(), name: '', subject: '', audienceId: '', audienceName: '', content: '' }
  ]);
  const [bulkText, setBulkText] = useState('');
  const [audiences, setAudiences] = useState<AudienceOption[]>([]);
  const [loadingAudiences, setLoadingAudiences] = useState(false);

  // Step 3 - Generation
  const [generatedCampaigns, setGeneratedCampaigns] = useState<GeneratedCampaign[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genCurrentName, setGenCurrentName] = useState('');

  // Step 4 - Preview
  const [previewCampaign, setPreviewCampaign] = useState<GeneratedCampaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<GeneratedCampaign | null>(null);
  const [editBlocks, setEditBlocks] = useState<EmailBlock[]>([]);

  // Step 5 - Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCurrentName, setUploadCurrentName] = useState('');
  const [uploadResults, setUploadResults] = useState<{ name: string; success: boolean; error?: string }[]>([]);
  const [uploadDone, setUploadDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load templates with content_blocks
  useEffect(() => {
    loadTemplates();
    loadAudiences();
  }, [clientId]);

  async function loadTemplates() {
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from('email_templates')
      .select('id, name, content_blocks, primary_color, secondary_color, accent_color, button_color, button_text_color, font_family, logo_url')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false });

    if (error) { toast.error('Error cargando plantillas'); /* Error handled by toast */ }
    else {
      const valid = (data || [])
        .filter((t: any) => Array.isArray(t.content_blocks) && t.content_blocks.length > 0)
        .map((t: any) => ({
          ...t,
          content_blocks: t.content_blocks as EmailBlock[],
        }));
      setTemplates(valid);
    }
    setLoadingTemplates(false);
  }

  async function loadAudiences() {
    setLoadingAudiences(true);
    try {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (!conn) { setLoadingAudiences(false); return; }

      const { data, error } = await supabase.functions.invoke('sync-klaviyo-metrics', {
        body: { connectionId: conn.id, timeframe: '90d' },
      });

      if (error) { /* Error handled by toast */ return; }

      const listItems: AudienceOption[] = (data?.lists || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        type: 'list' as const,
        profileCount: l.profile_count,
      }));
      const segmentItems: AudienceOption[] = (data?.segments || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        type: 'segment' as const,
        profileCount: s.profile_count,
      }));
      setAudiences([...listItems, ...segmentItems]);
    } catch {
      // Error handled silently
    } finally {
      setLoadingAudiences(false);
    }
  }

  // Campaign row helpers
  function addRows(count: number) {
    const newRows = Array.from({ length: count }, () => ({
      id: crypto.randomUUID(),
      name: '', subject: '', audienceId: '', audienceName: '', content: '',
    }));
    setCampaigns(prev => [...prev, ...newRows].slice(0, 30));
  }

  function updateRow(id: string, field: keyof CampaignRow, value: string) {
    setCampaigns(prev => prev.map(c => {
      if (c.id !== id) return c;
      if (field === 'audienceId') {
        const aud = audiences.find(a => a.id === value);
        return { ...c, audienceId: value, audienceName: aud?.name || '' };
      }
      return { ...c, [field]: value };
    }));
  }

  function removeRow(id: string) {
    setCampaigns(prev => prev.filter(c => c.id !== id));
  }

  function parseBulkText() {
    const entries = bulkText.split('---').filter(s => s.trim());
    const parsed: CampaignRow[] = entries.map(entry => {
      const lines = entry.trim().split('\n');
      const getValue = (prefix: string) => {
        const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
        return line ? line.substring(line.indexOf(':') + 1).trim() : '';
      };
      // Content can be multi-line: grab everything after "Contenido:" until end
      const getMultiLineValue = (prefix: string) => {
        const idx = lines.findIndex(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
        if (idx === -1) return '';
        const firstLine = lines[idx].substring(lines[idx].indexOf(':') + 1).trim();
        const extraLines: string[] = [];
        for (let i = idx + 1; i < lines.length; i++) {
          // Stop if we hit another known field
          if (/^(nombre|asunto|audiencia|contenido)\s*:/i.test(lines[i])) break;
          extraLines.push(lines[i].trim());
        }
        return [firstLine, ...extraLines].filter(Boolean).join(' ');
      };
      const name = getValue('Nombre');
      const subject = getValue('Asunto');
      const content = getMultiLineValue('Contenido');
      const audienceName = getValue('Audiencia');
      const aud = audiences.find(a => a.name.toLowerCase().includes(audienceName.toLowerCase()));
      return {
        id: crypto.randomUUID(),
        name: name || subject || `Campaña ${Date.now()}`,
        subject: subject || name || '',
        audienceId: aud?.id || '',
        audienceName: aud?.name || audienceName,
        content: content || '',
      };
    }).filter(c => c.name || c.subject || c.content);

    if (parsed.length === 0) {
      toast.error('No se pudieron parsear mails. Revisa el formato.');
      return;
    }
    // Parsed bulk text successfully
    setCampaigns(parsed.slice(0, 30));
    toast.success(`${parsed.length} mail(s) parseados`);
  }

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV vacío o sin datos'); return; }
      
      const parsed: CampaignRow[] = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const audienceName = cols[2] || '';
        const aud = audiences.find(a => a.name.toLowerCase().includes(audienceName.toLowerCase()));
        return {
          id: crypto.randomUUID(),
          name: cols[0] || '',
          subject: cols[1] || '',
          audienceId: aud?.id || '',
          audienceName: aud?.name || audienceName,
          content: cols[3] || '',
        };
      }).filter(c => c.name || c.subject);

      setCampaigns(parsed.slice(0, 30));
      toast.success(`${parsed.length} mail(s) importados desde CSV`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // Step 3 - Generate with Claude
  async function generateAll() {
    if (!selectedTemplate) { toast.error('Selecciona una plantilla primero'); return; }
    // Accept campaigns with name OR content (either is enough to generate)
    const validCampaigns = campaigns.filter(c => (c.name?.trim()) || (c.content?.trim()));
    // Generate all valid campaigns
    if (validCampaigns.length === 0) { toast.error('Agrega al menos un mail con nombre o contenido'); return; }

    setGenerating(true);
    setGenProgress(0);

    // Fetch previous campaigns for tone reference
    const { data: prevCampaigns } = await supabase
      .from('email_campaigns')
      .select('name, subject, final_html')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(3);

    const previousEmails = prevCampaigns?.map(c =>
      `--- Mail: ${c.name} (Asunto: ${c.subject}) ---\n${c.final_html?.substring(0, 2000) || 'Sin HTML'}`
    ).join('\n\n') || '';

    // Get shop URL
    const { data: clientInfo } = await supabase
      .from('clients')
      .select('shop_domain, website_url')
      .eq('id', clientId)
      .single();
    const shopUrl = clientInfo?.shop_domain
      ? `https://${clientInfo.shop_domain}`
      : clientInfo?.website_url || 'https://tu-tienda.myshopify.com';

    const results: GeneratedCampaign[] = validCampaigns.map(c => ({
      ...c,
      blocks: [],
      status: 'pending' as const,
      selected: true,
    }));
    setGeneratedCampaigns(results);
    setStep(3);

    for (let i = 0; i < results.length; i++) {
      const campaign = results[i];
      setGenCurrentName(campaign.name);
      setGenProgress(((i) / results.length) * 100);

      // Update status to generating
      setGeneratedCampaigns(prev => prev.map((c, idx) =>
        idx === i ? { ...c, status: 'generating' } : c
      ));

      try {
        const { data, error } = await callApi('generate-mass-campaigns', {
          body: {
            templateBlocks: selectedTemplate.content_blocks,
            campaign: {
              name: campaign.name,
              subject: campaign.subject,
              content: campaign.content,
            },
            shopUrl,
            colors: {
              primary: selectedTemplate.primary_color,
              button: selectedTemplate.button_color,
              buttonText: selectedTemplate.button_text_color,
            },
            logoUrl: selectedTemplate.logo_url || '',
            fontFamily: selectedTemplate.font_family || 'Arial, sans-serif',
            previousEmails,
          },
        });

        // Process generate response
        if (error) {
          let errorDetail = error.message || 'Error desconocido';
          try {
            if (error.context && typeof error.context.json === 'function') {
              const errBody = await error.context.json();
              errorDetail = errBody?.error || errBody?.details || JSON.stringify(errBody).substring(0, 300);
            }
          } catch (_) {}
          // Generate error detail captured for throw
          throw new Error(errorDetail);
        }
        const blocks = data?.blocks || [];

        setGeneratedCampaigns(prev => prev.map((c, idx) =>
          idx === i ? { ...c, blocks, status: 'done' } : c
        ));
      } catch (err: any) {
        // Error handled by per-campaign error state
        setGeneratedCampaigns(prev => prev.map((c, idx) =>
          idx === i ? { ...c, status: 'error', errorMessage: err.message } : c
        ));
      }

      // Delay between calls
      if (i < results.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setGenProgress(100);
    setGenerating(false);
    toast.success(`${results.length} mails generados`);
    setStep(4);
  }

  // Regenerate single campaign
  async function regenerateCampaign(idx: number) {
    if (!selectedTemplate) return;
    const campaign = generatedCampaigns[idx];

    setGeneratedCampaigns(prev => prev.map((c, i) =>
      i === idx ? { ...c, status: 'generating' } : c
    ));

    try {
      const { data: clientInfo } = await supabase
        .from('clients')
        .select('shop_domain, website_url')
        .eq('id', clientId)
        .single();
      const shopUrl = clientInfo?.shop_domain
        ? `https://${clientInfo.shop_domain}`
        : clientInfo?.website_url || 'https://tu-tienda.myshopify.com';

      const { data, error } = await callApi('generate-mass-campaigns', {
        body: {
          templateBlocks: selectedTemplate.content_blocks,
          campaign: { name: campaign.name, subject: campaign.subject, content: campaign.content },
          shopUrl,
          colors: {
            primary: selectedTemplate.primary_color,
            button: selectedTemplate.button_color,
            buttonText: selectedTemplate.button_text_color,
          },
          previousEmails: '',
        },
      });

      if (error) throw new Error(error.message);
      setGeneratedCampaigns(prev => prev.map((c, i) =>
        i === idx ? { ...c, blocks: data?.blocks || [], status: 'done' } : c
      ));
      toast.success(`"${campaign.name}" regenerado`);
    } catch (err: any) {
      setGeneratedCampaigns(prev => prev.map((c, i) =>
        i === idx ? { ...c, status: 'error', errorMessage: err.message } : c
      ));
      toast.error(`Error regenerando: ${err.message}`);
    }
  }

  // Toggle selection
  function toggleSelect(idx: number) {
    setGeneratedCampaigns(prev => prev.map((c, i) =>
      i === idx ? { ...c, selected: !c.selected } : c
    ));
  }

  function toggleSelectAll() {
    const allSelected = generatedCampaigns.every(c => c.selected);
    setGeneratedCampaigns(prev => prev.map(c => ({ ...c, selected: !allSelected })));
  }

  // Save edit
  function saveEdit() {
    if (!editingCampaign) return;
    setGeneratedCampaigns(prev => prev.map(c =>
      c.id === editingCampaign.id ? { ...c, blocks: editBlocks } : c
    ));
    setEditingCampaign(null);
    toast.success('Bloques actualizados');
  }

  // Step 5 - Upload to Klaviyo
  async function uploadToKlaviyo() {
    if (!selectedTemplate) return;
    const selected = generatedCampaigns.filter(c => c.selected && c.status === 'done');
    if (selected.length === 0) { toast.error('Selecciona al menos un mail'); return; }

    setUploading(true);
    setUploadProgress(0);
    setUploadResults([]);
    setStep(5);

    const results: { name: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < selected.length; i++) {
      const campaign = selected[i];
      setUploadCurrentName(campaign.name);
      setUploadProgress(((i) / selected.length) * 100);

      try {
        const finalHtml = renderBlocksToHtml(campaign.blocks, selectedTemplate);

        const { data: conn } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'klaviyo')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!conn) throw new Error('No hay conexión activa de Klaviyo');

        const { data, error } = await supabase.functions.invoke('upload-klaviyo-drafts', {
          body: {
            connectionId: conn.id,
            campaign: {
              name: campaign.name,
              subject: campaign.subject,
              audienceId: campaign.audienceId,
              previewText: '',
              html: finalHtml,
            },
          },
        });

        // Process upload response
        if (error) {
          // Try to read body from FunctionsHttpError context
          let errorDetail = error.message || 'Error desconocido';
          try {
            if (error.context && typeof error.context.json === 'function') {
              const errBody = await error.context.json();
              errorDetail = errBody?.error || errBody?.details || JSON.stringify(errBody).substring(0, 300);
            }
          } catch (_) {}
          // Error detail captured above
          throw new Error(errorDetail);
        }

        // Save to local DB
        await supabase.from('email_campaigns').insert({
          client_id: clientId,
          template_id: selectedTemplate.id,
          name: campaign.name,
          subject: campaign.subject,
          content_blocks: campaign.blocks as any,
          final_html: finalHtml,
          klaviyo_campaign_id: data?.campaignId || null,
          klaviyo_list_id: campaign.audienceId || null,
          status: 'draft',
        } as any);

        results.push({ name: campaign.name, success: true });
      } catch (err: any) {
        // Error handled by per-campaign result state
        results.push({ name: campaign.name, success: false, error: err.message });
      }

      setUploadResults([...results]);
      if (i < selected.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setUploadProgress(100);
    setUploading(false);
    setUploadDone(true);
    const successCount = results.filter(r => r.success).length;
    toast.success(`${successCount} borrador(es) subidos a Klaviyo`);
  }

  // Save drafts locally only
  async function saveDraftsLocally() {
    if (!selectedTemplate) return;
    const selected = generatedCampaigns.filter(c => c.selected && c.status === 'done');
    if (selected.length === 0) { toast.error('Selecciona al menos un mail'); return; }

    for (const campaign of selected) {
      const finalHtml = renderBlocksToHtml(campaign.blocks, selectedTemplate);
      await supabase.from('email_campaigns').insert({
        client_id: clientId,
        template_id: selectedTemplate.id,
        name: campaign.name,
        subject: campaign.subject,
        content_blocks: campaign.blocks as any,
        final_html: finalHtml,
        status: 'draft',
      } as any);
    }
    toast.success(`${selected.length} borrador(es) guardados en Steve`);
  }

  const selectedCount = generatedCampaigns.filter(c => c.selected).length;
  const doneCount = generatedCampaigns.filter(c => c.status === 'done').length;
  const validCampaignCount = campaigns.filter(c => c.name.trim() || c.content.trim()).length;

  return (
    <div className="space-y-6">
      {/* Header with step indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">📦 Campañas Masivas</h2>
            <p className="text-sm text-muted-foreground">
              Paso {step} de 5
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`w-8 h-1.5 rounded-full transition-colors ${
              s <= step ? 'bg-primary' : 'bg-muted'
            }`} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 1 - Select Template */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 1 — Elegir plantilla base</CardTitle>
                <CardDescription>Selecciona una plantilla que tenga bloques editables</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground font-medium">No hay plantillas con bloques</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Primero importa y convierte una plantilla en el tab 🎨 Plantillas
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {templates.map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTemplate(t)}
                        className={`border rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                          selectedTemplate?.id === t.id ? 'ring-2 ring-primary border-primary' : 'border-border'
                        }`}
                      >
                        <div className="h-[160px] bg-white overflow-hidden">
                          <iframe
                            srcDoc={renderBlocksToHtml(t.content_blocks, t)}
                            className="w-[600px] h-[600px] origin-top-left pointer-events-none"
                            style={{ transform: 'scale(0.35)', transformOrigin: 'top left' }}
                            sandbox="allow-same-origin allow-scripts"
                            title={t.name}
                          />
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.content_blocks.length} bloques</p>
                        </div>
                        {selectedTemplate?.id === t.id && (
                          <div className="bg-primary text-primary-foreground text-center py-1 text-xs font-medium">
                            ✓ Seleccionada
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end mt-6">
                  <Button onClick={() => setStep(2)} disabled={!selectedTemplate}>
                    Siguiente <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 2 - Input campaigns */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 2 — Definir los mails</CardTitle>
                <CardDescription>Agrega hasta 30 mails por lote</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="table">
                  <TabsList className="mb-4">
                    <TabsTrigger value="table" className="text-xs">
                      <Table2 className="w-3.5 h-3.5 mr-1" /> Tabla editable
                    </TabsTrigger>
                    <TabsTrigger value="text" className="text-xs">
                      <FileText className="w-3.5 h-3.5 mr-1" /> Texto masivo
                    </TabsTrigger>
                    <TabsTrigger value="csv" className="text-xs">
                      <Upload className="w-3.5 h-3.5 mr-1" /> CSV
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="table">
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                      {campaigns.map((c, idx) => (
                        <div key={c.id} className="border rounded-lg p-3 space-y-2 bg-card">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs shrink-0">#{idx + 1}</Badge>
                            <Input
                              placeholder="Nombre campaña"
                              value={c.name}
                              onChange={e => updateRow(c.id, 'name', e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => removeRow(c.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input
                              placeholder="Asunto del email"
                              value={c.subject}
                              onChange={e => updateRow(c.id, 'subject', e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Select
                              value={c.audienceId}
                              onValueChange={v => updateRow(c.id, 'audienceId', v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Audiencia" />
                              </SelectTrigger>
                              <SelectContent>
                                {loadingAudiences ? (
                                  <SelectItem value="_loading" disabled>Cargando...</SelectItem>
                                ) : audiences.length === 0 ? (
                                  <SelectItem value="_none" disabled>Sin audiencias</SelectItem>
                                ) : (
                                  audiences.map(a => (
                                    <SelectItem key={a.id} value={a.id}>
                                      {a.type === 'segment' ? '🎯' : '📋'} {a.name}
                                      {a.profileCount ? ` (${a.profileCount})` : ''}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <Textarea
                            placeholder="Contenido / Instrucciones para Steve (ej: Mail de bienvenida. Título 'Hola'. Agradecer compra. Productos cross-sell. Botón 'Ver más'...)"
                            value={c.content}
                            onChange={e => updateRow(c.id, 'content', e.target.value)}
                            className="min-h-[60px] text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => addRows(1)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar fila
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addRows(5)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Agregar 5 filas
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="text">
                    <Textarea
                      placeholder={`Nombre: Bienvenida nuevos\nAsunto: ¡Bienvenido! 🏠\nAudiencia: Hot List\nContenido: Mail de bienvenida...\n---\nNombre: Carrito abandonado\nAsunto: ¿Olvidaste algo? 🛒\nAudiencia: Carrito abandonado\nContenido: Recordar productos...`}
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      className="min-h-[300px] text-sm font-mono"
                    />
                    <Button variant="outline" size="sm" onClick={parseBulkText} className="mt-3">
                      📋 Parsear
                    </Button>
                  </TabsContent>

                  <TabsContent value="csv">
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">Sube un CSV con columnas:</p>
                      <p className="text-xs text-muted-foreground font-mono mb-4">nombre, asunto, audiencia, contenido</p>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        Seleccionar archivo
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleCSVUpload}
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                {/* DEBUG — ver qué bloquea el botón */}
                <pre className="text-xs bg-red-50 border border-red-200 p-2 rounded mb-2 overflow-auto mt-4">
                  {JSON.stringify({
                    campaignsLength: campaigns?.length,
                    validCampaignCount,
                    selectedTemplate: !!selectedTemplate,
                    selectedTemplateId: selectedTemplate?.id,
                    templateBlocksCount: selectedTemplate?.content_blocks?.length,
                    generating,
                    currentStep: step,
                    isDisabled_OLD: validCampaignCount === 0 || generating,
                    isDisabled_NEW: generating,
                  }, null, 2)}
                </pre>

                <div className="flex justify-between mt-2">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" /> Atrás
                  </Button>
                  <Button onClick={generateAll} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                    Steve, genera los {campaigns?.length || 0} mails
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 3 - Generating */}
        {step === 3 && generating && (
          <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 3 — Steve está generando los mails</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={genProgress} className="h-2" />
                <div className="space-y-2">
                  {generatedCampaigns.map((c, idx) => (
                    <div key={c.id} className="flex items-center gap-3 text-sm">
                      {c.status === 'pending' && <span className="text-muted-foreground">⏳</span>}
                      {c.status === 'generating' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                      {c.status === 'done' && <Check className="w-4 h-4 text-green-600" />}
                      {c.status === 'error' && <X className="w-4 h-4 text-destructive" />}
                      <span className={c.status === 'generating' ? 'font-medium' : ''}>
                        {c.status === 'generating' ? `Generando: "${c.name}"...` :
                         c.status === 'done' ? `✅ ${c.name} (${c.blocks.length} bloques)` :
                         c.status === 'error' ? `❌ ${c.name}: ${c.errorMessage}` :
                         `⏳ ${c.name}`}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 4 - Preview & review */}
        {step === 4 && (
          <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Paso 4 — Preview y revisión</CardTitle>
                    <CardDescription>{selectedCount} de {generatedCampaigns.length} seleccionados</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                    {generatedCampaigns.every(c => c.selected) ? (
                      <><CheckSquare className="w-4 h-4 mr-1.5" /> Deseleccionar todos</>
                    ) : (
                      <><Square className="w-4 h-4 mr-1.5" /> Seleccionar todos</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                  {generatedCampaigns.map((c, idx) => (
                    <div key={c.id} className={`border rounded-lg overflow-hidden transition-all ${
                      c.selected ? 'border-primary/50 bg-primary/5' : 'border-border opacity-60'
                    }`}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={c.selected}
                            onCheckedChange={() => toggleSelect(idx)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{c.name}</span>
                              {c.status === 'done' && <Badge variant="secondary" className="text-xs">{c.blocks.length} bloques</Badge>}
                              {c.status === 'error' && <Badge variant="destructive" className="text-xs">Error</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Asunto: {c.subject}
                              {c.audienceName && ` • Audiencia: ${c.audienceName}`}
                            </p>
                          </div>
                        </div>

                        {c.status === 'done' && selectedTemplate && (
                          <div className="mt-3 border rounded-lg overflow-hidden bg-white">
                            <iframe
                              srcDoc={renderBlocksToHtml(c.blocks, selectedTemplate)}
                              className="w-full h-[200px] pointer-events-none"
                              sandbox="allow-same-origin allow-scripts"
                              title={c.name}
                            />
                          </div>
                        )}

                        <div className="flex gap-2 mt-3">
                          {c.status === 'done' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => setPreviewCampaign(c)}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> Ver completo
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => {
                                setEditingCampaign(c);
                                setEditBlocks([...c.blocks]);
                              }}>
                                <Edit2 className="w-3.5 h-3.5 mr-1" /> Editar bloques
                              </Button>
                            </>
                          )}
                          <Button variant="outline" size="sm" onClick={() => regenerateCampaign(idx)}
                            disabled={c.status === 'generating'}
                          >
                            {c.status === 'generating'
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                            Regenerar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setGeneratedCampaigns(prev => prev.filter((_, i) => i !== idx));
                          }}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom bar */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{selectedCount} mail(s) seleccionados</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={saveDraftsLocally}>
                      💾 Guardar borradores en Steve
                    </Button>
                    <Button onClick={uploadToKlaviyo} disabled={selectedCount === 0 || uploading}>
                      {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                      📤 Subir borradores a Klaviyo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* STEP 5 - Upload progress & results */}
        {step === 5 && (
          <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {uploadDone ? '🎉 Borradores subidos a Klaviyo' : 'Subiendo borradores...'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!uploadDone && <Progress value={uploadProgress} className="h-2" />}

                <div className="space-y-2">
                  {uploadResults.map((r, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-sm">
                      {r.success ? <Check className="w-4 h-4 text-green-600" /> : <X className="w-4 h-4 text-destructive" />}
                      <span>
                        {r.success ? `✅ ${r.name} → borrador en Klaviyo` : `❌ ${r.name}: ${r.error}`}
                      </span>
                    </div>
                  ))}
                  {uploading && (
                    <div className="flex items-center gap-3 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>⏳ Subiendo: "{uploadCurrentName}"...</span>
                    </div>
                  )}
                </div>

                {uploadDone && (
                  <div className="space-y-4 pt-4">
                    <div className="flex items-start gap-3 p-4 bg-[#F0F4FA] dark:bg-[#0A1628]/30 border border-[#B5C8E0] dark:border-[#132448] rounded-xl">
                      <span className="text-lg shrink-0">💡</span>
                      <p className="text-sm text-[#162D5F] dark:text-[#7B9BCF]">
                        Tus borradores están en Klaviyo. Revísalos ahí y programa el envío cuando estés listo.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" asChild>
                        <a href="https://www.klaviyo.com/email/campaigns" target="_blank" rel="noopener">
                          <ExternalLink className="w-4 h-4 mr-2" /> Abrir Klaviyo
                        </a>
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setStep(1);
                        setGeneratedCampaigns([]);
                        setCampaigns([{ id: crypto.randomUUID(), name: '', subject: '', audienceId: '', audienceName: '', content: '' }]);
                        setUploadResults([]);
                        setUploadDone(false);
                        setSelectedTemplate(null);
                      }}>
                        📦 Crear otro lote
                      </Button>
                      <Button onClick={onClose}>Cerrar</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full preview dialog */}
      <Dialog open={!!previewCampaign} onOpenChange={open => !open && setPreviewCampaign(null)}>
        <DialogContent className="max-w-[660px] max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-sm">{previewCampaign?.name}</DialogTitle>
            <p className="text-xs text-muted-foreground">Asunto: {previewCampaign?.subject}</p>
          </DialogHeader>
          {previewCampaign && selectedTemplate && (
            <div className="bg-gray-100 p-4">
              <iframe
                srcDoc={renderBlocksToHtml(previewCampaign.blocks, selectedTemplate)}
                className="w-[600px] mx-auto bg-white shadow-lg"
                style={{ minHeight: '600px' }}
                sandbox="allow-same-origin allow-scripts"
                title={previewCampaign.name}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit blocks dialog */}
      <Dialog open={!!editingCampaign} onOpenChange={open => !open && setEditingCampaign(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b">
              <p className="text-sm font-medium">✏️ Editando: {editingCampaign?.name}</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingCampaign(null)}>Cancelar</Button>
                <Button size="sm" onClick={saveEdit}>
                  <Check className="w-4 h-4 mr-1" /> Guardar cambios
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {editingCampaign && (
                <EmailBlockEditor
                  blocks={editBlocks}
                  onChange={setEditBlocks}
                  clientId={clientId}
                  templateColors={selectedTemplate ? {
                    primary: selectedTemplate.primary_color,
                    secondary: selectedTemplate.secondary_color,
                    accent: selectedTemplate.accent_color,
                    button: selectedTemplate.button_color,
                    buttonText: selectedTemplate.button_text_color,
                    font: selectedTemplate.font_family,
                  } : undefined}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
