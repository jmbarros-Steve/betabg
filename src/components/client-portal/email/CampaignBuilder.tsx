import { useState, useEffect, useCallback, useRef } from 'react';
import EmailEditor, { EditorRef } from 'react-email-editor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Send, Plus, Edit, Trash2, Clock, Play, Loader2, Eye, X, Save,
  Sparkles, Smartphone, Monitor, CalendarClock, Users, FlaskConical, ShoppingBag,
} from 'lucide-react';
import { getSteveMailEditorOptions, registerSteveMailTools } from './steveMailEditorConfig';
import { htmlToUnlayerDesign, type UnlayerDesignJson } from '@/components/client-portal/klaviyo/htmlToUnlayerDesign';
import { EmailTemplateGallery } from './EmailTemplateGallery';
import { UniversalBlocksPanel } from './UniversalBlocksPanel';
import { ImageEditorPanel } from './ImageEditorPanel';

interface CampaignBuilderProps {
  clientId: string;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  html_content: string;
  design_json?: any;
  status: string;
  total_recipients: number;
  sent_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  audience_filter: any;
}

const CAMPAIGN_TYPES = [
  { value: 'promotional', label: 'Promocional' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'product_launch', label: 'Lanzamiento de producto' },
  { value: 'seasonal', label: 'Temporada / Holiday' },
  { value: 'announcement', label: 'Anuncio' },
  { value: 'restock', label: 'Restock / Back in stock' },
];

export function CampaignBuilder({ clientId }: CampaignBuilderProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
  const [editorStep, setEditorStep] = useState<'setup' | 'design' | 'review'>('setup');

  // Unlayer
  const emailEditorRef = useRef<EditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [designJson, setDesignJson] = useState<UnlayerDesignJson | null>(null);

  // AI generation
  const [generating, setGenerating] = useState(false);
  const [campaignType, setCampaignType] = useState('promotional');
  const [aiInstructions, setAiInstructions] = useState('');

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // A/B Testing
  const [abEnabled, setAbEnabled] = useState(false);
  const [abSubjectB, setAbSubjectB] = useState('');
  const [abTestPercent, setAbTestPercent] = useState(20);
  const [abWinningMetric, setAbWinningMetric] = useState('open_rate');
  const [abDurationHours, setAbDurationHours] = useState(4);

  // Product Recommendations
  const [recEnabled, setRecEnabled] = useState(false);
  const [recType, setRecType] = useState('best_sellers');
  const [recCount, setRecCount] = useState(4);

  // Template Gallery & Universal Blocks
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showUniversalBlocks, setShowUniversalBlocks] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [brandInfo, setBrandInfo] = useState<Record<string, string>>({});

  // Schedule
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleCampaignId, setScheduleCampaignId] = useState('');

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('manage-email-campaigns', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setCampaigns(data?.campaigns || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const loadSubscriberCount = useCallback(async () => {
    const { data } = await callApi<any>('query-email-subscribers', {
      body: { action: 'list', client_id: clientId, limit: 1 },
    });
    setSubscriberCount(data?.total || 0);
  }, [clientId]);

  useEffect(() => { loadSubscriberCount(); }, [loadSubscriberCount]);

  // Load brand info for editor designTags
  useEffect(() => {
    (async () => {
      try {
        const { data } = await callApi<any>('manage-email-campaigns', {
          body: { action: 'get_client_brand', client_id: clientId },
        });
        if (data) setBrandInfo(data);
      } catch { /* Brand info is optional */ }
    })();
  }, [clientId]);

  // Close sub-dialogs when editor closes to prevent orphan Radix portals
  useEffect(() => {
    if (!showEditor) {
      setShowTemplateGallery(false);
      setShowUniversalBlocks(false);
      setShowImageEditor(false);
    }
  }, [showEditor]);

  // Force Unlayer inner divs to fill container height
  useEffect(() => {
    if (!editorReady || !editorContainerRef.current) return;
    const container = editorContainerRef.current;
    const root = container.querySelector(':scope > div');
    if (root instanceof HTMLElement) {
      root.style.height = '100%';
      const inner = root.querySelector(':scope > div');
      if (inner instanceof HTMLElement) inner.style.height = '100%';
    }
  }, [editorReady]);

  // Load design when editor becomes ready or designJson changes
  useEffect(() => {
    if (editorReady && designJson) {
      emailEditorRef.current?.editor?.loadDesign(designJson as any);
    }
  }, [editorReady, designJson]);

  const handleGenerateWithAI = async () => {
    setGenerating(true);
    try {
      const { data, error } = await callApi<any>('generate-steve-mail-content', {
        body: {
          action: 'generate_campaign_html',
          client_id: clientId,
          campaign_type: campaignType,
          subject: editingCampaign?.subject || undefined,
          instructions: aiInstructions || undefined,
        },
      });
      if (error) { toast.error(error); return; }

      const subject = data?.subject || editingCampaign?.subject || '';
      const previewText = data?.preview_text || '';
      const html = data?.html || '';

      setEditingCampaign(prev => ({
        ...prev,
        subject: subject,
        preview_text: previewText,
        html_content: html,
      }));

      // Convert to Unlayer design and load
      const design = htmlToUnlayerDesign(html);
      setDesignJson(design);
      if (editorReady) {
        emailEditorRef.current?.editor?.loadDesign(design as any);
      }

      toast.success('Email generado con Steve AI');
    } catch (err) {
      toast.error('Error generando contenido');
    } finally {
      setGenerating(false);
    }
  };

  const exportEditorHtml = (): Promise<{ html: string; design: any }> => {
    return new Promise((resolve) => {
      const editor = emailEditorRef.current?.editor;
      if (!editor) {
        resolve({ html: editingCampaign?.html_content || '', design: designJson });
        return;
      }
      editor.saveDesign((design: any) => {
        editor.exportHtml(({ html }: { html: string }) => {
          resolve({ html, design });
        });
      });
    });
  };

  const handleSaveCampaign = async () => {
    if (!editingCampaign?.name) { toast.error('Nombre es requerido'); return; }

    let htmlContent = editingCampaign.html_content || '';
    let savedDesign = designJson;

    // If on design step, export from Unlayer
    if (editorStep === 'design' || editorStep === 'review') {
      const { html, design } = await exportEditorHtml();
      htmlContent = html;
      savedDesign = design;
    }

    const action = editingCampaign.id ? 'update' : 'create';
    const { data, error } = await callApi<any>('manage-email-campaigns', {
      body: {
        action,
        client_id: clientId,
        campaign_id: editingCampaign.id,
        name: editingCampaign.name,
        subject: editingCampaign.subject,
        preview_text: editingCampaign.preview_text,
        from_name: editingCampaign.from_name,
        from_email: editingCampaign.from_email,
        html_content: htmlContent,
        design_json: savedDesign,
        audience_filter: editingCampaign.audience_filter || {},
        recommendation_config: recEnabled ? { type: recType, count: recCount } : null,
      },
    });

    if (error) { toast.error(error); return; }
    toast.success(action === 'create' ? 'Campaña creada' : 'Campaña guardada');

    // If new, update the editing campaign ID
    if (!editingCampaign.id && data?.campaign?.id) {
      setEditingCampaign(prev => ({ ...prev, id: data.campaign.id }));
    }

    loadCampaigns();
  };

  const handleSend = async (campaignId: string) => {
    setSending(true);
    try {
      const abConfig = abEnabled ? {
        variant_b_subject: abSubjectB,
        test_percentage: abTestPercent,
        winning_metric: abWinningMetric,
        test_duration_hours: abDurationHours,
      } : undefined;

      const { data, error } = await callApi<any>('manage-email-campaigns', {
        body: { action: 'send', client_id: clientId, campaign_id: campaignId, ab_test: abConfig },
      });
      if (error) { toast.error(error); return; }
      const msg = data?.ab_test
        ? `Test A/B iniciado: ${data.variant_a_sent + data.variant_b_sent} enviados, ${data.remaining} esperan ganador`
        : `Enviado a ${data?.sent_count || 0} contactos`;
      toast.success(msg);
      setShowEditor(false);
      loadCampaigns();
    } finally {
      setSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate) { toast.error('Fecha es requerida'); return; }
    const { error } = await callApi('manage-email-campaigns', {
      body: { action: 'schedule', client_id: clientId, campaign_id: scheduleCampaignId, scheduled_at: scheduleDate },
    });
    if (error) { toast.error(error); return; }
    toast.success('Campaña programada');
    setShowSchedule(false);
    setShowEditor(false);
    loadCampaigns();
  };

  const handleDelete = async (campaignId: string) => {
    const { error } = await callApi('manage-email-campaigns', {
      body: { action: 'delete', client_id: clientId, campaign_id: campaignId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Campaña eliminada');
    loadCampaigns();
  };

  const openEditor = (campaign?: Campaign) => {
    const c = campaign || {
      name: '',
      subject: '',
      preview_text: '',
      from_name: '',
      from_email: '',
      html_content: '',
      audience_filter: {},
    };
    setEditingCampaign(c);
    setDesignJson(campaign?.design_json ? campaign.design_json : campaign?.html_content ? htmlToUnlayerDesign(campaign.html_content) : null);
    setEditorStep('setup');
    setEditorReady(false);
    setCampaignType('promotional');
    setAiInstructions('');
    setShowEditor(true);
  };

  const goToDesignStep = () => {
    if (!editingCampaign?.name) { toast.error('Nombre es requerido'); return; }
    // Show template gallery for new campaigns (no existing design)
    if (!designJson && !editingCampaign?.html_content) {
      setShowTemplateGallery(true);
    }
    setEditorStep('design');
  };

  const handleTemplateSelect = (templateDesign: any) => {
    setShowTemplateGallery(false);
    if (templateDesign) {
      // Store in state — useEffect will load when editor is ready
      setDesignJson(templateDesign);
      // Also load immediately if editor is already ready
      if (editorReady && emailEditorRef.current?.editor) {
        emailEditorRef.current.editor.loadDesign(templateDesign);
      }
    }
  };

  const goToReviewStep = async () => {
    const { html, design } = await exportEditorHtml();
    setEditingCampaign(prev => ({ ...prev, html_content: html }));
    setDesignJson(design);
    setPreviewHtml(html);
    setEditorStep('review');
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-800' },
    scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-800' },
    sending: { label: 'Enviando', color: 'bg-yellow-100 text-yellow-800' },
    sent: { label: 'Enviada', color: 'bg-green-100 text-green-800' },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  };

  // =============== FULLSCREEN EDITOR ===============
  if (showEditor) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setShowEditor(false)}>
              <X className="w-4 h-4 mr-1" /> Cerrar
            </Button>
            <span className="text-sm font-medium">
              {editingCampaign?.name || 'Nueva Campaña'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <div className="flex items-center gap-1 mr-4">
              {['setup', 'design', 'review'].map((step, i) => (
                <div key={step} className="flex items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                    editorStep === step ? 'bg-primary text-primary-foreground' :
                    ['setup', 'design', 'review'].indexOf(editorStep) > i ? 'bg-green-100 text-green-800' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1}
                  </div>
                  {i < 2 && <div className="w-6 h-px bg-muted-foreground/20 mx-0.5" />}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleSaveCampaign}>
              <Save className="w-4 h-4 mr-1" /> Guardar
            </Button>
          </div>
        </div>

        {/* Step: Setup */}
        {editorStep === 'setup' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Configurar Campaña</h2>
                <p className="text-sm text-muted-foreground">Define los datos básicos y genera el contenido con AI</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Nombre de la campaña *</Label>
                  <Input
                    value={editingCampaign?.name || ''}
                    onChange={(e) => setEditingCampaign(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Promoción Black Friday"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Asunto del email</Label>
                    <Input
                      value={editingCampaign?.subject || ''}
                      onChange={(e) => setEditingCampaign(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Ej: 30% de descuento solo hoy"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Máx 50 caracteres. Déjalo vacío para que AI lo genere.</p>
                  </div>
                  <div>
                    <Label>Preview text</Label>
                    <Input
                      value={editingCampaign?.preview_text || ''}
                      onChange={(e) => setEditingCampaign(prev => ({ ...prev, preview_text: e.target.value }))}
                      placeholder="Texto que se ve en la bandeja"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nombre del remitente</Label>
                    <Input
                      value={editingCampaign?.from_name || ''}
                      onChange={(e) => setEditingCampaign(prev => ({ ...prev, from_name: e.target.value }))}
                      placeholder="Tu Tienda"
                    />
                  </div>
                  <div>
                    <Label>Email del remitente</Label>
                    <Input
                      value={editingCampaign?.from_email || ''}
                      onChange={(e) => setEditingCampaign(prev => ({ ...prev, from_email: e.target.value }))}
                      placeholder="noreply@tudominio.com"
                    />
                  </div>
                </div>
              </div>

              {/* AI Generation */}
              <Card className="border-dashed border-2">
                <CardContent className="py-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold">Generar con Steve AI</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Steve genera el email completo con tu branding, productos y tono de marca.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Tipo de campaña</Label>
                      <Select value={campaignType} onValueChange={setCampaignType}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CAMPAIGN_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Instrucciones (opcional)</Label>
                      <Input
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        placeholder="Ej: Enfócate en el descuento del 30%"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleGenerateWithAI}
                    disabled={generating}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    {generating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando email...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Generar Email con AI</>
                    )}
                  </Button>
                  {editingCampaign?.html_content && (
                    <p className="text-xs text-green-600 font-medium">Email generado. Continúa al editor para personalizarlo.</p>
                  )}
                </CardContent>
              </Card>

              {/* A/B Testing */}
              <Card className="border">
                <CardContent className="py-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="w-5 h-5 text-orange-600" />
                      <h3 className="font-semibold">Test A/B</h3>
                    </div>
                    <Switch checked={abEnabled} onCheckedChange={setAbEnabled} />
                  </div>
                  {abEnabled && (
                    <div className="space-y-3 pt-1">
                      <div>
                        <Label className="text-xs">Asunto variante B</Label>
                        <Input
                          value={abSubjectB}
                          onChange={(e) => setAbSubjectB(e.target.value)}
                          placeholder="Ej: ¡No te lo pierdas! 30% OFF"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Porcentaje de prueba: {abTestPercent}%</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          {Math.round(subscriberCount * abTestPercent / 100)} contactos por variante · {subscriberCount - Math.round(subscriberCount * abTestPercent / 100) * 2} reciben la ganadora
                        </p>
                        <Slider
                          value={[abTestPercent]}
                          onValueChange={(v) => setAbTestPercent(v[0])}
                          min={5} max={50} step={5}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Métrica ganadora</Label>
                          <Select value={abWinningMetric} onValueChange={setAbWinningMetric}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open_rate">Tasa de apertura</SelectItem>
                              <SelectItem value="click_rate">Tasa de clics</SelectItem>
                              <SelectItem value="revenue">Ingresos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Duración del test</Label>
                          <Select value={String(abDurationHours)} onValueChange={(v) => setAbDurationHours(Number(v))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 hora</SelectItem>
                              <SelectItem value="2">2 horas</SelectItem>
                              <SelectItem value="4">4 horas</SelectItem>
                              <SelectItem value="8">8 horas</SelectItem>
                              <SelectItem value="12">12 horas</SelectItem>
                              <SelectItem value="24">24 horas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Product Recommendations */}
              <Card className="border">
                <CardContent className="py-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold">Productos Dinámicos</h3>
                    </div>
                    <Switch checked={recEnabled} onCheckedChange={setRecEnabled} />
                  </div>
                  {recEnabled && (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs text-muted-foreground">
                        Usa el merge tag <code className="bg-muted px-1 rounded">{'{{ product_recommendations }}'}</code> en el diseño para insertar productos personalizados.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Tipo de recomendación</Label>
                          <Select value={recType} onValueChange={setRecType}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="best_sellers">Más vendidos</SelectItem>
                              <SelectItem value="new_arrivals">Nuevos</SelectItem>
                              <SelectItem value="complementary">Complementarios</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Cantidad de productos</Label>
                          <Select value={String(recCount)} onValueChange={(v) => setRecCount(Number(v))}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="2">2 productos</SelectItem>
                              <SelectItem value="4">4 productos</SelectItem>
                              <SelectItem value="6">6 productos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Audience */}
              <Card className="bg-muted/50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Audiencia</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se enviará a todos los contactos suscritos ({subscriberCount} contactos)
                  </p>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEditor(false)}>Cancelar</Button>
                <Button onClick={goToDesignStep}>
                  Continuar al Editor
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Design (Unlayer) */}
        {editorStep === 'design' && (
          <>
            {/* Subject bar */}
            <div className="flex items-center gap-4 px-4 py-2 border-b shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setEditorStep('setup')}>
                Volver
              </Button>
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-xs whitespace-nowrap">Asunto:</Label>
                <Input
                  value={editingCampaign?.subject || ''}
                  onChange={(e) => setEditingCampaign(prev => ({ ...prev, subject: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="Asunto del email"
                />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <Label className="text-xs whitespace-nowrap">Preview:</Label>
                <Input
                  value={editingCampaign?.preview_text || ''}
                  onChange={(e) => setEditingCampaign(prev => ({ ...prev, preview_text: e.target.value }))}
                  className="h-8 text-sm"
                  placeholder="Preview text"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowTemplateGallery(true)}>
                Templates
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowUniversalBlocks(true)}>
                Bloques
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowImageEditor(true)}>
                Editar Imagen
              </Button>
              <Button size="sm" onClick={goToReviewStep}>
                Revisar y Enviar
              </Button>
            </div>

            {/* Unlayer editor */}
            <div className="flex-1 min-h-0 relative">
              <div ref={editorContainerRef} className="absolute inset-0">
                <EmailEditor
                  ref={emailEditorRef}
                  onReady={() => {
                    setEditorReady(true);
                    registerSteveMailTools(emailEditorRef.current?.editor);
                  }}
                  options={getSteveMailEditorOptions({
                    designTags: Object.keys(brandInfo).length > 0 ? brandInfo : undefined,
                  })}
                  style={{ height: '100%' }}
                />
              </div>
            </div>

            {/* Template Gallery */}
            <EmailTemplateGallery
              clientId={clientId}
              isOpen={showTemplateGallery}
              onClose={() => setShowTemplateGallery(false)}
              onSelect={handleTemplateSelect}
            />

            {/* Universal Blocks Panel */}
            <UniversalBlocksPanel
              clientId={clientId}
              editor={emailEditorRef.current?.editor}
              isOpen={showUniversalBlocks}
              onClose={() => setShowUniversalBlocks(false)}
            />

            {/* Image Editor (Gemini AI) */}
            <ImageEditorPanel
              clientId={clientId}
              isOpen={showImageEditor}
              onClose={() => setShowImageEditor(false)}
              onImageReady={(url) => {
                // Insert the edited image into the editor
                toast.success('Imagen lista — arrástrala al canvas desde la URL copiada');
              }}
              brandColor={brandInfo.brand_color}
              brandSecondaryColor={brandInfo.brand_secondary_color}
            />
          </>
        )}

        {/* Step: Review */}
        {editorStep === 'review' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditorStep('design')}>
                  Volver al Editor
                </Button>
                <h2 className="text-xl font-semibold">Revisar y Enviar</h2>
              </div>

              {/* Summary */}
              <Card>
                <CardContent className="py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Asunto</p>
                      <p className="font-medium">{editingCampaign?.subject || 'Sin asunto'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Preview</p>
                      <p className="text-sm">{editingCampaign?.preview_text || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Remitente</p>
                      <p className="text-sm">{editingCampaign?.from_name || 'Default'} &lt;{editingCampaign?.from_email || 'noreply@mail.steveads.com'}&gt;</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Audiencia</p>
                      <p className="text-sm">{subscriberCount} contactos suscritos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Preview toggles */}
              <div className="flex items-center gap-2">
                <Button
                  variant={previewDevice === 'desktop' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewDevice('desktop')}
                >
                  <Monitor className="w-4 h-4 mr-1" /> Desktop
                </Button>
                <Button
                  variant={previewDevice === 'mobile' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPreviewDevice('mobile')}
                >
                  <Smartphone className="w-4 h-4 mr-1" /> Mobile
                </Button>
              </div>

              {/* Preview iframe */}
              <div className="flex justify-center">
                <div
                  className={`border rounded-lg overflow-hidden bg-white transition-all ${
                    previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'
                  }`}
                >
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full min-h-[600px]"
                    title="Email Preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => setEditorStep('design')}>
                  Volver al Editor
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await handleSaveCampaign();
                      if (editingCampaign?.id) {
                        setScheduleCampaignId(editingCampaign.id);
                        setShowSchedule(true);
                      }
                    }}
                  >
                    <CalendarClock className="w-4 h-4 mr-1.5" /> Programar
                  </Button>
                  <Button
                    onClick={async () => {
                      await handleSaveCampaign();
                      if (editingCampaign?.id) {
                        handleSend(editingCampaign.id);
                      } else {
                        toast.info('Guarda la campaña primero');
                      }
                    }}
                    disabled={sending || !editingCampaign?.subject || !editingCampaign?.html_content}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1.5" />
                    )}
                    Enviar Ahora ({subscriberCount})
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =============== CAMPAIGN LIST VIEW ===============
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Campañas de Email</h3>
          <p className="text-sm text-muted-foreground">Crea y envía campañas a tus contactos</p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus className="w-4 h-4 mr-1.5" /> Nueva Campaña
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Send className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No hay campañas. Crea tu primera campaña de email.</p>
            <Button className="mt-4" onClick={() => openEditor()}>
              <Plus className="w-4 h-4 mr-1.5" /> Crear Campaña
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{campaign.name}</h4>
                      <Badge className={statusConfig[campaign.status]?.color || 'bg-gray-100'}>
                        {statusConfig[campaign.status]?.label || campaign.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {campaign.subject || 'Sin asunto'}
                    </p>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                      {campaign.sent_at && (
                        <span>Enviada: {new Date(campaign.sent_at).toLocaleDateString()}</span>
                      )}
                      {campaign.scheduled_at && campaign.status === 'scheduled' && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Programada: {new Date(campaign.scheduled_at).toLocaleString()}
                        </span>
                      )}
                      {campaign.status === 'sent' && (
                        <span>
                          Enviada a {campaign.sent_count}/{campaign.total_recipients} contactos
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {campaign.html_content && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setPreviewHtml(campaign.html_content); setShowPreview(true); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    {campaign.status === 'draft' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEditor(campaign)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSend(campaign.id)}
                          disabled={sending || !campaign.subject || !campaign.html_content}
                        >
                          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                          Enviar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(campaign.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Preview del Email</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant={previewDevice === 'desktop' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewDevice('desktop')}
            >
              <Monitor className="w-4 h-4 mr-1" /> Desktop
            </Button>
            <Button
              variant={previewDevice === 'mobile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreviewDevice('mobile')}
            >
              <Smartphone className="w-4 h-4 mr-1" /> Mobile
            </Button>
          </div>
          <div className="flex justify-center">
            <div className={`border rounded-lg overflow-hidden bg-white transition-all ${
              previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'
            }`}>
              <iframe
                srcDoc={previewHtml}
                className="w-full min-h-[500px]"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Programar Envío</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Fecha y hora de envío</Label>
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancelar</Button>
            <Button onClick={handleSchedule}>
              <CalendarClock className="w-4 h-4 mr-1.5" /> Programar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
