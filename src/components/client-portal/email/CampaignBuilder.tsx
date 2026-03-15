import { useState, useEffect, useCallback, useRef } from 'react';
import { SteveMailEditor, type SteveMailEditorRef } from './SteveMailEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Send, Plus, Edit, Trash2, Clock, Loader2, Eye, X, Save,
  Sparkles, Smartphone, Monitor, CalendarClock, Users, FlaskConical, ShoppingBag, MailCheck,
  ArrowLeft, ChevronRight, ChevronLeft, LayoutTemplate, Blocks, Undo2, Redo2, AlertTriangle,
} from 'lucide-react';
import { EmailTemplateGallery } from './EmailTemplateGallery';
import { UniversalBlocksPanel } from './UniversalBlocksPanel';
import { ImageEditorPanel } from './ImageEditorPanel';
import { ConditionalBlockPanel, serializeConditionsToAttr, type BlockCondition } from './ConditionalBlockPanel';
import { ProductBlockPanel } from './ProductBlockPanel';
import { GlobalStylesPanel } from './GlobalStylesPanel';
import { ABTestResultsPanel } from './ABTestResultsPanel';

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

const GMAIL_CLIP_LIMIT = 102 * 1024;

export function CampaignBuilder({ clientId }: CampaignBuilderProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
  const [editorStep, setEditorStep] = useState<'setup' | 'design' | 'audience' | 'review'>('setup');

  // GrapeJS editor
  const emailEditorRef = useRef<SteveMailEditorRef>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [designJson, setDesignJson] = useState<any>(null);

  // AI generation
  const [generating, setGenerating] = useState(false);
  const [campaignType, setCampaignType] = useState('promotional');
  const [aiInstructions, setAiInstructions] = useState('');

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editorDevice, setEditorDevice] = useState<'Desktop' | 'Mobile'>('Desktop');

  // A/B Testing (hidden behind advanced options)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [abEnabled, setAbEnabled] = useState(false);
  const [abSubjectB, setAbSubjectB] = useState('');
  const [abTestPercent, setAbTestPercent] = useState(20);
  const [abWinningMetric, setAbWinningMetric] = useState('open_rate');
  const [abDurationHours, setAbDurationHours] = useState(4);

  // A/B Results
  const [abResultsCampaignId, setAbResultsCampaignId] = useState<string | null>(null);

  // Product Recommendations
  const [recEnabled, setRecEnabled] = useState(false);
  const [recType, setRecType] = useState('best_sellers');
  const [recCount, setRecCount] = useState(4);

  // Template Gallery & Universal Blocks
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showUniversalBlocks, setShowUniversalBlocks] = useState(false);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [showConditionalPanel, setShowConditionalPanel] = useState(false);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [blockConditions, setBlockConditions] = useState<BlockCondition[]>([]);
  const [brandInfo, setBrandInfo] = useState<Record<string, string>>({});

  // Save as Template
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Unsaved changes protection
  const [isDirty, setIsDirty] = useState(false);

  // Email weight tracking (Gmail clips at 102KB)
  const [emailSizeBytes, setEmailSizeBytes] = useState(0);

  // Concurrency: optimistic locking
  const lastKnownUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!showEditor || !editorReady) { return; }
    const editor = emailEditorRef.current?.getEditor();
    if (!editor) return;
    const markDirty = () => setIsDirty(true);
    editor.on('component:add', markDirty);
    editor.on('component:remove', markDirty);
    editor.on('component:update', markDirty);
    editor.on('style:change', markDirty);
    return () => {
      editor.off('component:add', markDirty);
      editor.off('component:remove', markDirty);
      editor.off('component:update', markDirty);
      editor.off('style:change', markDirty);
    };
  }, [showEditor, editorReady]);

  useEffect(() => {
    if (!showEditor || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [showEditor, isDirty]);

  // Poll email size every 3s while editor is open
  useEffect(() => {
    if (!showEditor || !editorReady || editorStep !== 'design') return;
    const interval = setInterval(() => {
      const html = emailEditorRef.current?.getHtml() || '';
      setEmailSizeBytes(new Blob([html]).size);
    }, 3000);
    return () => clearInterval(interval);
  }, [showEditor, editorReady, editorStep]);

  // Send/Schedule unified dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState('');

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
      setShowConditionalPanel(false);
      setShowProductPanel(false);
    }
  }, [showEditor]);

  // Load design when editor becomes ready or designJson/editingCampaign changes
  useEffect(() => {
    if (!editorReady) return;
    if (designJson) {
      if (typeof designJson === 'string') {
        // GrapeJS HTML template
        emailEditorRef.current?.loadDesign(designJson);
      } else {
        // Unlayer design_json
        emailEditorRef.current?.loadDesign(editingCampaign?.html_content || '', designJson);
      }
    } else if (editingCampaign?.html_content) {
      emailEditorRef.current?.loadDesign(editingCampaign.html_content);
    }
  }, [editorReady, designJson, editingCampaign?.html_content]);

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

      // Load HTML into GrapeJS editor
      setDesignJson(null);
      if (editorReady) {
        emailEditorRef.current?.loadDesign(html);
      }

      toast.success('Email generado con Steve AI');
    } catch (err) {
      toast.error('Error generando contenido');
    } finally {
      setGenerating(false);
    }
  };

  const exportEditorHtml = (): { html: string; design: any } => {
    const editorRef = emailEditorRef.current;
    if (!editorRef) {
      return { html: editingCampaign?.html_content || '', design: designJson };
    }
    let html = editorRef.getHtml() || '';
    const design = editorRef.getProjectData();

    // Embed conditional block conditions into the HTML body
    if (blockConditions.length > 0) {
      const condAttr = serializeConditionsToAttr(blockConditions);
      html = html.replace(
        /(<body[^>]*>)/i,
        `$1<div ${condAttr}>`
      ).replace(
        /(<\/body>)/i,
        '</div>$1'
      );
    }
    return { html, design };
  };

  const handleSaveCampaign = async () => {
    if (!editingCampaign?.name) { toast.error('Nombre es requerido'); return; }

    let htmlContent = editingCampaign.html_content || '';
    let savedDesign = designJson;

    // If on design step or later, export from GrapeJS
    if (editorStep === 'design' || editorStep === 'audience' || editorStep === 'review') {
      const { html, design } = exportEditorHtml();
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
        expected_updated_at: lastKnownUpdatedAt.current,
      },
    });

    if (error) { toast.error(error); return; }

    // Handle concurrency conflict
    if (data?.conflict) {
      toast.error('Otro usuario modificó esta campaña. Recarga para ver los cambios.');
      return;
    }

    toast.success(action === 'create' ? 'Campaña creada' : 'Campaña guardada');
    setIsDirty(false);

    // Track the updated_at for optimistic locking
    if (data?.campaign?.updated_at) {
      lastKnownUpdatedAt.current = data.campaign.updated_at;
    }

    // If new, update the editing campaign ID
    if (!editingCampaign.id && data?.campaign?.id) {
      setEditingCampaign(prev => ({ ...prev, id: data.campaign.id }));
    }

    loadCampaigns();
  };

  const confirmSend = async () => {
    if (sendMode === 'schedule') {
      if (!scheduleDate) { toast.error('Selecciona una fecha'); return; }
      // Save first
      await handleSaveCampaign();
      if (!editingCampaign?.id) { toast.error('Guarda la campaña primero'); return; }
      const { error } = await callApi('manage-email-campaigns', {
        body: { action: 'schedule', client_id: clientId, campaign_id: editingCampaign.id, scheduled_at: scheduleDate },
      });
      if (error) { toast.error(error); return; }
      toast.success('Campaña programada');
      setShowSendDialog(false);
      setShowEditor(false);
      loadCampaigns();
      return;
    }

    // Send now
    await handleSaveCampaign();
    if (!editingCampaign?.id) { toast.error('Guarda la campaña primero'); return; }
    setShowSendDialog(false);

    setSending(true);
    try {
      const abConfig = abEnabled ? {
        variant_b_subject: abSubjectB,
        test_percentage: abTestPercent,
        winning_metric: abWinningMetric,
        test_duration_hours: abDurationHours,
      } : undefined;

      const { data, error } = await callApi<any>('manage-email-campaigns', {
        body: { action: 'send', client_id: clientId, campaign_id: editingCampaign.id, ab_test: abConfig },
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

  const handleSendTest = async () => {
    if (!editingCampaign?.html_content) { toast.error('Diseña el email primero'); return; }
    setSendingTest(true);
    try {
      await handleSaveCampaign();
      const { error } = await callApi<any>('send-email', {
        body: {
          action: 'send-test',
          to: editingCampaign?.from_email || 'noreply@steve.cl',
          subject: `[TEST] ${editingCampaign?.subject || 'Sin asunto'}`,
          html_content: editingCampaign.html_content,
          from_email: editingCampaign?.from_email || 'noreply@steve.cl',
          from_name: editingCampaign?.from_name || 'Steve',
          client_id: clientId,
        },
      });
      if (error) { toast.error(error); return; }
      toast.success('Email de prueba enviado a ' + (editingCampaign?.from_email || 'noreply@steve.cl'));
    } catch {
      toast.error('Error enviando test');
    } finally {
      setSendingTest(false);
    }
  };

  const handleDelete = async (campaignId: string) => {
    const { error } = await callApi('manage-email-campaigns', {
      body: { action: 'delete', client_id: clientId, campaign_id: campaignId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Campaña eliminada');
    setDeleteConfirmId(null);
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
    setDesignJson(campaign?.design_json || null);
    setEditorStep('setup');
    setEditorReady(false);
    setCampaignType('promotional');
    setAiInstructions('');
    setShowAdvanced(false);
    setAbEnabled(false);
    setSendMode('now');
    setScheduleDate('');
    setShowEditor(true);
  };

  const goToDesignStep = () => {
    if (!editingCampaign?.name) { toast.error('Nombre es requerido'); return; }
    if (!editingCampaign?.subject) { toast.error('Asunto es requerido'); return; }
    // Show template gallery for new campaigns (no existing design)
    if (!designJson && !editingCampaign?.html_content) {
      setShowTemplateGallery(true);
    }
    setEditorStep('design');
  };

  const goToAudienceStep = () => {
    // Save current design state
    const { html, design } = exportEditorHtml();
    setEditingCampaign(prev => ({ ...prev, html_content: html }));
    setDesignJson(design);
    setEditorStep('audience');
  };

  const handleTemplateSelect = (templateDesign: any) => {
    setShowTemplateGallery(false);
    if (templateDesign) {
      // Store in state - useEffect will load when editor is ready
      setDesignJson(templateDesign);
      // Also load immediately if editor is already ready
      if (editorReady && emailEditorRef.current) {
        if (typeof templateDesign === 'string') {
          // GrapeJS HTML template — load as raw HTML
          emailEditorRef.current.loadDesign(templateDesign);
        } else {
          // Unlayer design_json — load as project data
          emailEditorRef.current.loadDesign('', templateDesign);
        }
      }
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!saveTemplateName.trim()) {
      toast.error('Ingresa un nombre para la plantilla');
      return;
    }
    setSavingTemplate(true);
    try {
      const { html, design } = exportEditorHtml();
      const { error } = await callApi<any>('email-templates', {
        body: {
          action: 'create',
          client_id: clientId,
          name: saveTemplateName.trim(),
          description: `Plantilla guardada desde campaña${editingCampaign?.name ? ': ' + editingCampaign.name : ''}`,
          category: 'custom',
          design_json: design,
          html_preview: html,
        },
      });
      if (error) throw new Error(String(error));
      toast.success('Plantilla guardada');
      setShowSaveTemplate(false);
      setSaveTemplateName('');
    } catch (err: any) {
      toast.error('Error al guardar plantilla: ' + (err.message || err));
    } finally {
      setSavingTemplate(false);
    }
  };

  const replaceMergeTagsForPreview = (html: string): string => {
    const sampleData: Record<string, string> = {
      '{{ first_name }}': 'María',
      '{{ last_name }}': 'González',
      '{{ full_name }}': 'María González',
      '{{ email }}': 'maria@ejemplo.com',
      '{{ brand_name }}': brandInfo.name || 'Tu Marca',
      '{{ shop_url }}': brandInfo.shop_url || 'https://tutienda.com',
      '{{ brand_color }}': brandInfo.brand_color || '#18181b',
      '{{ total_orders }}': '5',
      '{{ total_spent }}': '$125.990',
      '{{ last_order_date }}': '10 Mar 2026',
      '{{ days_since_last_order }}': '2',
      '{{ cart_url }}': '#',
      '{{ cart_total }}': '$49.990',
      '{{ cart_items_count }}': '3',
      '{{ cart_first_item_name }}': 'Polera Básica',
      '{{ cart_first_item_image }}': 'https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto',
      '{{ discount_code }}': 'STEVE20',
      '{{ shopify_discount_code }}': 'STEVE-20%OFF',
      '{{ product_name }}': 'Producto Ejemplo',
      '{{ product_price }}': '$29.990',
      '{{ product_image }}': 'https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto',
      '{{ product_url }}': '#',
      '{{ product_recommendations }}': '<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td colspan="2" style="padding:0 8px 12px;font-size:18px;font-weight:bold;color:#1a1a1a;">Productos recomendados para ti</td></tr><tr><td style="width:50%;padding:8px;vertical-align:top;text-align:center;"><img src="https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto+1" style="width:100%;max-width:280px;border-radius:8px;" /><p style="margin:8px 0 4px;font-weight:600;font-size:14px;">Producto 1</p><p style="margin:0;font-size:13px;color:#71717a;">$29.990</p></td><td style="width:50%;padding:8px;vertical-align:top;text-align:center;"><img src="https://placehold.co/280x280/f4f4f5/a1a1aa?text=Producto+2" style="width:100%;max-width:280px;border-radius:8px;" /><p style="margin:8px 0 4px;font-weight:600;font-size:14px;">Producto 2</p><p style="margin:0;font-size:13px;color:#71717a;">$39.990</p></td></tr></table>',
      '{{ unsubscribe_url }}': '#',
      '{{ subscriber_tags }}': 'vip, frecuente',
      '{{ subscribed_date }}': '1 Ene 2026',
      '{{ current_date }}': '12 Mar 2026',
      '{{ current_month }}': 'Marzo',
      '{{ current_year }}': '2026',
      '{{ fecha }}': '15 Mar 2026',
      '{{ preferences_url }}': '#',
      '{{ checkout_url }}': '#',
      // Spanish aliases
      '{{ nombre }}': 'María',
      '{{ apellido }}': 'González',
      '{{ nombre_completo }}': 'María González',
      '{{ empresa }}': brandInfo.name || 'Tu Marca',
      '{{ tienda_url }}': brandInfo.shop_url || 'https://tutienda.com',
      '{{ color_marca }}': brandInfo.brand_color || '#18181b',
    };
    let result = html;
    for (const [tag, value] of Object.entries(sampleData)) {
      result = result.replaceAll(tag, value);
    }
    return result;
  };

  const goToReviewStep = () => {
    const { html, design } = exportEditorHtml();
    setEditingCampaign(prev => ({ ...prev, html_content: html }));
    setDesignJson(design);
    setPreviewHtml(replaceMergeTagsForPreview(html));
    setEditorStep('review');
  };

  const stepLabels = ['Datos', 'Diseño', 'Audiencia', 'Revisar y Enviar'];
  const stepKeys: Array<'setup' | 'design' | 'audience' | 'review'> = ['setup', 'design', 'audience', 'review'];
  const currentStepIndex = stepKeys.indexOf(editorStep);

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
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => {
              if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Seguro que quieres salir?')) return;
              setShowEditor(false);
            }}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver
            </Button>
            {editorStep === 'design' ? (
              <Input
                value={editingCampaign?.name || ''}
                onChange={(e) => setEditingCampaign(prev => ({ ...prev, name: e.target.value }))}
                className="h-8 text-sm font-medium w-64"
                placeholder="Nombre de la campaña"
              />
            ) : (
              <span className="text-sm font-medium">
                {editingCampaign?.name || 'Nueva Campaña'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <div className="hidden md:flex items-center gap-1 mr-4">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStepIndex === i ? 'bg-primary text-primary-foreground' :
                    currentStepIndex > i ? 'bg-green-100 text-green-800' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-xs ml-1 ${currentStepIndex === i ? 'font-medium' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                  {i < stepLabels.length - 1 && <div className="w-4 h-px bg-muted-foreground/20 mx-1" />}
                </div>
              ))}
            </div>
            {editorStep === 'design' && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowTemplateGallery(true)}>
                  <LayoutTemplate className="w-4 h-4 mr-1" /> Plantillas
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowUniversalBlocks(true)}>
                  <Blocks className="w-4 h-4 mr-1" /> Bloques
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowSaveTemplate(true)}>
                  <Save className="w-4 h-4 mr-1" /> Guardar Plantilla
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const { html } = exportEditorHtml();
                  setPreviewHtml(replaceMergeTagsForPreview(html));
                  setShowPreview(true);
                }}>
                  <Eye className="w-4 h-4 mr-1" /> Vista previa
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handleSaveCampaign}>
              <Save className="w-4 h-4 mr-1" /> Guardar
            </Button>
            {editorStep === 'design' && (
              <Button size="sm" onClick={goToAudienceStep}>
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* Step 1: Setup - Name + Subject */}
        {editorStep === 'setup' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Paso 1: Datos de la campaña</h2>
                <p className="text-sm text-muted-foreground">Define el nombre, asunto y remitente</p>
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
                    <Label>Asunto del email *</Label>
                    <Input
                      value={editingCampaign?.subject || ''}
                      onChange={(e) => setEditingCampaign(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Ej: 30% de descuento solo hoy"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Máx 50 caracteres recomendado.</p>
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
                              <SelectItem value="recently_viewed">Últimos vistos</SelectItem>
                              <SelectItem value="abandoned_cart">Carrito abandonado</SelectItem>
                              <SelectItem value="complementary">Complementarios</SelectItem>
                              <SelectItem value="all">Todos los productos</SelectItem>
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

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setShowEditor(false)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button size="lg" onClick={goToDesignStep}>
                  Siguiente: Diseñar Email <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Design (GrapeJS) */}
        {editorStep === 'design' && (
          <>
            {/* Editor toolbar: device toggle + undo/redo */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-zinc-50 shrink-0">
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button
                  size="sm"
                  variant={editorDevice === 'Desktop' ? 'default' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => { setEditorDevice('Desktop'); emailEditorRef.current?.setDevice('Desktop'); }}
                >
                  <Monitor className="w-3.5 h-3.5 mr-1" /> Desktop
                </Button>
                <Button
                  size="sm"
                  variant={editorDevice === 'Mobile' ? 'default' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => { setEditorDevice('Mobile'); emailEditorRef.current?.setDevice('Mobile'); }}
                >
                  <Smartphone className="w-3.5 h-3.5 mr-1" /> Mobile
                </Button>
              </div>
              <div className="w-px h-5 bg-zinc-200" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => emailEditorRef.current?.undo()}
                title="Deshacer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => emailEditorRef.current?.redo()}
                title="Rehacer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
              <div className="w-px h-5 bg-zinc-200" />
              <GlobalStylesPanel editorRef={emailEditorRef} />
              <div className="w-px h-5 bg-zinc-200" />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setShowProductPanel(true)}
                title="Insertar productos"
              >
                <ShoppingBag className="w-3.5 h-3.5 mr-1" /> Productos
              </Button>
              <Button
                size="sm"
                variant={showConditionalPanel ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setShowConditionalPanel(!showConditionalPanel)}
                title="Contenido condicional"
              >
                <Eye className="w-3.5 h-3.5 mr-1" /> Condicional
              </Button>
              {emailSizeBytes > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  emailSizeBytes > GMAIL_CLIP_LIMIT ? 'bg-red-100 text-red-700 font-medium'
                  : emailSizeBytes > GMAIL_CLIP_LIMIT * 0.8 ? 'bg-yellow-100 text-yellow-700'
                  : 'text-zinc-500'
                }`}>
                  {emailSizeBytes > GMAIL_CLIP_LIMIT && <AlertTriangle className="w-3 h-3" />}
                  {(emailSizeBytes / 1024).toFixed(0)}KB
                  {emailSizeBytes > GMAIL_CLIP_LIMIT && ' — Gmail cortará este email'}
                </span>
              )}
            </div>

            {/* GrapeJS editor */}
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0">
                <SteveMailEditor
                  ref={emailEditorRef}
                  onReady={() => setEditorReady(true)}
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
              editor={emailEditorRef.current}
              isOpen={showUniversalBlocks}
              onClose={() => setShowUniversalBlocks(false)}
            />

            {/* Image Editor (Gemini AI) - kept functional but not in toolbar */}
            <ImageEditorPanel
              clientId={clientId}
              isOpen={showImageEditor}
              onClose={() => setShowImageEditor(false)}
              onImageReady={(url) => {
                if (!emailEditorRef.current) {
                  toast.info('Copia la URL: ' + url);
                  return;
                }
                const imgHtml = `<div style="text-align:center;padding:10px;"><img src="${url}" alt="Imagen editada" style="max-width:100%;width:600px;" /></div>`;
                emailEditorRef.current.addComponents(imgHtml);
                toast.success('Imagen insertada al final del email');
              }}
              brandColor={brandInfo.brand_color}
              brandSecondaryColor={brandInfo.brand_secondary_color}
            />

            {/* Product Block Panel - accessible from blocks panel */}
            <ProductBlockPanel
              clientId={clientId}
              isOpen={showProductPanel}
              onClose={() => setShowProductPanel(false)}
              onInsert={(html) => {
                if (!emailEditorRef.current) return;
                emailEditorRef.current.addComponents(html);
              }}
            />

            {/* Conditional Block Panel - kept functional but hidden from toolbar */}
            {showConditionalPanel && (
              <div className="fixed right-0 top-[88px] bottom-0 w-80 bg-background border-l shadow-lg z-50 overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm">Contenido Condicional</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowConditionalPanel(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Define condiciones para mostrar/ocultar bloques según datos del suscriptor.
                  Selecciona un bloque en el editor y aplica condiciones.
                </p>
                <ConditionalBlockPanel
                  conditions={blockConditions}
                  onChange={setBlockConditions}
                />
              </div>
            )}
          </>
        )}

        {/* Step 3: Audience */}
        {editorStep === 'audience' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Paso 3: Audiencia</h2>
                <p className="text-sm text-muted-foreground">Define a quién enviar esta campaña</p>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="py-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Todos los contactos suscritos</p>
                      <p className="text-sm text-muted-foreground">{subscriberCount} contactos recibirán esta campaña</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setEditorStep('design')}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior: Editor
                </Button>
                <Button size="lg" onClick={goToReviewStep}>
                  Siguiente: Revisar <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review & Send */}
        {editorStep === 'review' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Paso 4: Revisar y Enviar</h2>
                <p className="text-sm text-muted-foreground">Revisa tu campaña antes de enviarla</p>
              </div>

              {/* Summary */}
              <Card>
                <CardContent className="py-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Campaña</p>
                      <p className="font-medium">{editingCampaign?.name || 'Sin nombre'}</p>
                    </div>
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
                      <p className="text-sm">{editingCampaign?.from_name || 'Default'} &lt;{editingCampaign?.from_email || 'noreply@steve.cl'}&gt;</p>
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
                <span className="text-sm font-medium mr-2">Vista previa:</span>
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
                    sandbox="allow-same-origin allow-popups"
                  />
                </div>
              </div>

              {/* Advanced options (A/B testing hidden here) */}
              <div className="border rounded-lg">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  Opciones avanzadas
                  <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                </button>
                {showAdvanced && (
                  <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    {/* A/B Testing */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="w-4 h-4 text-orange-600" />
                          <span className="text-sm font-medium">Test A/B</span>
                        </div>
                        <Switch checked={abEnabled} onCheckedChange={setAbEnabled} />
                      </div>
                      {abEnabled && (
                        <div className="space-y-3 pl-6">
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
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" onClick={() => setEditorStep('audience')}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSendTest}
                    disabled={sendingTest || !editingCampaign?.html_content}
                  >
                    {sendingTest ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <MailCheck className="w-4 h-4 mr-1.5" />
                    )}
                    Enviar Test
                  </Button>
                  <Button
                    size="lg"
                    className="px-8"
                    onClick={async () => {
                      await handleSaveCampaign();
                      if (editingCampaign?.id) {
                        setSendMode('now');
                        setShowSendDialog(true);
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
                    Enviar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Unified Send/Schedule Dialog */}
        <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Campaña</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Esta campaña se enviará a <span className="font-medium text-foreground">{subscriberCount} contactos</span>. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <Button
                  variant={sendMode === 'now' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSendMode('now')}
                >
                  <Send className="w-4 h-4 mr-1.5" /> Enviar ahora
                </Button>
                <Button
                  variant={sendMode === 'schedule' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSendMode('schedule')}
                >
                  <CalendarClock className="w-4 h-4 mr-1.5" /> Programar
                </Button>
              </div>
              {sendMode === 'schedule' && (
                <div>
                  <Label>Fecha y hora de envío</Label>
                  <Input
                    type="datetime-local"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendDialog(false)}>Cancelar</Button>
              <Button onClick={confirmSend} disabled={sending}>
                {sending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {sendMode === 'now' ? 'Confirmar Envío' : 'Programar Envío'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog (from design step) */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Vista previa del Email</DialogTitle>
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
                  sandbox="allow-same-origin allow-popups"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
        <Button size="lg" className="px-6" onClick={() => openEditor()}>
          <Plus className="w-5 h-5 mr-2" /> Nueva Campaña
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
            <p className="text-muted-foreground mb-1">No hay campañas todavía</p>
            <p className="text-sm text-muted-foreground mb-4">Crea tu primera campaña de email</p>
            <Button size="lg" className="px-6" onClick={() => openEditor()}>
              <Plus className="w-5 h-5 mr-2" /> Crear Campaña
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="hover:shadow-sm transition-shadow">
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
                      <span>
                        Creada: {new Date(campaign.created_at).toLocaleDateString()}
                      </span>
                      {campaign.sent_at && (
                        <span>Enviada: {new Date(campaign.sent_at).toLocaleDateString()}</span>
                      )}
                      {campaign.scheduled_at && campaign.status === 'scheduled' && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Programada: {new Date(campaign.scheduled_at).toLocaleString()}
                        </span>
                      )}
                      {campaign.total_recipients > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {campaign.status === 'sent'
                            ? `${campaign.sent_count}/${campaign.total_recipients} enviados`
                            : `${campaign.total_recipients} destinatarios`
                          }
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {campaign.status === 'draft' && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEditor(campaign)} title="Editar">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmId(campaign.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {campaign.status === 'sent' && campaign.html_content && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setPreviewHtml(campaign.html_content); setShowPreview(true); }}
                          title="Vista previa"
                        >
                          <Eye className="w-4 h-4 mr-1" /> Ver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAbResultsCampaignId(campaign.id)}
                          title="Resultados A/B"
                        >
                          <FlaskConical className="w-4 h-4 mr-1" /> A/B
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
            <DialogTitle>Vista previa del Email</DialogTitle>
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
                sandbox="allow-same-origin allow-popups"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar campaña</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la campaña permanentemente. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save as Template Dialog */}
      <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar como Plantilla</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">Nombre de la plantilla</Label>
              <Input
                placeholder="Ej: Mi plantilla de bienvenida"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              La plantilla quedara guardada y disponible en tu galeria para reutilizarla en futuras campañas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplate(false)}>Cancelar</Button>
            <Button onClick={handleSaveAsTemplate} disabled={savingTemplate}>
              {savingTemplate ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A/B Test Results Panel */}
      <ABTestResultsPanel
        campaignId={abResultsCampaignId || ''}
        clientId={clientId}
        isOpen={!!abResultsCampaignId}
        onClose={() => setAbResultsCampaignId(null)}
      />
    </div>
  );
}
