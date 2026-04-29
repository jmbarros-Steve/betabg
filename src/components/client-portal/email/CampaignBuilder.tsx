import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import GrapesEmailEditor, { type UnlayerEditorRef } from './GrapesEmailEditor';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Send, Plus, Edit, Trash2, Clock, Loader2, Eye, X, Save,
  Sparkles, Smartphone, Monitor, CalendarClock, Users, FlaskConical, ShoppingBag, MailCheck,
  ArrowLeft, ChevronRight, ChevronLeft, LayoutTemplate, AlertTriangle, Filter, List,
} from 'lucide-react';
import { EmailTemplateGallery } from './EmailTemplateGallery';
import { ConditionalBlockPanel, serializeConditionsToAttr, type BlockCondition } from './ConditionalBlockPanel';
import { ABTestResultsPanel } from './ABTestResultsPanel';
import { ProductBlockPanel } from './ProductBlockPanel';
// Tipos y constantes extraídos a ./campaign-builder/ — ver README.md en esa carpeta
// para el plan de refactor gradual del componente.
import type { Campaign, CampaignBuilderProps } from './campaign-builder/types';
import { CAMPAIGN_TYPES, GMAIL_CLIP_LIMIT } from './campaign-builder/constants';

export function CampaignBuilder({ clientId }: CampaignBuilderProps) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState(0);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<Campaign> | null>(null);
  const [editorStep, setEditorStep] = useState<'setup' | 'design' | 'audience' | 'review'>('setup');

  // Email editor
  const emailEditorRef = useRef<UnlayerEditorRef>(null);
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
  // Device toggle is handled by Unlayer internally

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

  // Template Gallery & Conditional Blocks
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showConditionalPanel, setShowConditionalPanel] = useState(false);
  const [showProductPanel, setShowProductPanel] = useState(false);
  const [blockConditions, setBlockConditions] = useState<BlockCondition[]>([]);
  const [brandInfo, setBrandInfo] = useState<Record<string, string>>({});

  // Save as Template
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Audience selection
  const [audienceType, setAudienceType] = useState<'all' | 'specific'>('all');
  const [emailLists, setEmailLists] = useState<Array<{ id: string; name: string; type: string; subscriber_count: number; filters: any[] }>>([]);
  const [listsLoading, setListsLoading] = useState(false);

  // Unsaved changes protection
  const [isDirty, setIsDirty] = useState(false);

  // Email weight tracking (Gmail clips at 102KB)
  const [emailSizeBytes, setEmailSizeBytes] = useState(0);

  // Concurrency: optimistic locking
  const lastKnownUpdatedAt = useRef<string | null>(null);

  // Dirty tracking is handled via onChange callback on GrapesEmailEditor

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
      void (async () => {
        const html = (await emailEditorRef.current?.getHtml?.()) || '';
        setEmailSizeBytes(new Blob([html]).size);
      })();
    }, 3000);
    return () => clearInterval(interval);
  }, [showEditor, editorReady, editorStep]);

  // CRITERIO pre-flight check
  const [criterioLoading, setCriterioLoading] = useState(false);
  const [criterioResult, setCriterioResult] = useState<{
    can_publish: boolean;
    score: number;
    reason?: string;
    failed_rules: Array<{ rule_id: string; severity: string; details: string }>;
    warnings?: Array<{ rule_id: string; severity: string; details: string }>;
  } | null>(null);

  // Send/Schedule unified dialog
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState('');

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    try {
      const { data, error } = await callApi<any>('query-email-subscribers', {
        body: { action: 'list', client_id: clientId, limit: 1 },
      });
      if (error) {
        console.error('[CampaignBuilder] Failed to load subscriber count:', error);
      }
      setSubscriberCount(data?.total || 0);
    } catch (err) {
      console.error('[CampaignBuilder] loadSubscriberCount error:', err);
      setSubscriberCount(0);
    }
  }, [clientId]);

  useEffect(() => { loadSubscriberCount(); }, [loadSubscriberCount]);

  const loadEmailLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const { data, error } = await callApi<any>('manage-email-lists', {
        body: { action: 'list', client_id: clientId },
      });
      if (!error) setEmailLists(data?.lists || []);
    } finally {
      setListsLoading(false);
    }
  }, [clientId]);

  // Load brand info for editor designTags
  useEffect(() => {
    (async () => {
      try {
        const { data } = await callApi<any>('manage-email-campaigns', {
          body: { action: 'get_client_brand', client_id: clientId },
        });
        if (data) {
          setBrandInfo(data);
          // Prefill from_name on the editing campaign if still empty
          const storeName = data.store_name || data.brand_name || data.name || '';
          setEditingCampaign(prev => {
            if (!prev) return prev;
            const updates: Record<string, string> = {};
            if (!prev.from_name && storeName) updates.from_name = storeName;
            return Object.keys(updates).length ? { ...prev, ...updates } : prev;
          });
        }
      } catch { /* Brand info is optional */ }
    })();
  }, [clientId]);

  // Close sub-dialogs when editor closes to prevent orphan Radix portals
  useEffect(() => {
    if (!showEditor) {
      setShowTemplateGallery(false);
      setShowConditionalPanel(false);
      setShowProductPanel(false);
    }
  }, [showEditor]);

  // Load design when designJson changes (e.g., template selected while editor is mounted)
  // handleReady in GrapesEmailEditor already handles initial load, so we only watch designJson
  useEffect(() => {
    if (!editorReady || !designJson || typeof designJson !== 'object') return;
    emailEditorRef.current?.loadDesign(designJson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designJson]);

  // Reset editorReady when leaving design step so useEffects re-trigger on return
  useEffect(() => {
    if (editorStep !== 'design') {
      setEditorReady(false);
    }
  }, [editorStep]);

  // Load stored AI MJML when editor becomes ready
  useEffect(() => {
    if (!editorReady || !emailEditorRef.current) return;
    if (designJson) return; // design_json from existing campaign takes priority
    const storedMjml = editingCampaign?.html_content;
    if (storedMjml && storedMjml.includes('<mjml')) {
      emailEditorRef.current.setHtml(storedMjml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady]);

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
        timeoutMs: 120000,
      });
      if (error) { toast.error(error); return; }

      const name = data?.name || editingCampaign?.name || '';
      const subject = data?.subject || editingCampaign?.subject || '';
      const previewText = data?.preview_text || '';
      // AI returns email-compatible HTML directly. Fallback a mjml legacy.
      const html = data?.html || data?.mjml || '';

      setEditingCampaign(prev => ({
        ...prev,
        name: name,
        subject: subject,
        preview_text: previewText,
      }));

      // Load HTML into editor if ready, otherwise persist for later load.
      if (editorReady && html && emailEditorRef.current) {
        emailEditorRef.current.setHtml(html);
        setEditingCampaign(prev => ({ ...prev, html_content: html }));
        toast.success('Email generado con Steve AI — puedes editarlo en el editor');
      } else if (html) {
        setEditingCampaign(prev => ({ ...prev, html_content: html }));
        toast.success('Email generado con Steve AI');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.error('El servidor tardó demasiado. Inténtalo de nuevo.');
      } else {
        toast.error(`Error al generar el email: ${err?.message || 'Inténtalo de nuevo.'}`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const exportEditorHtml = async (): Promise<{ html: string; design: any }> => {
    const editorRef = emailEditorRef.current;
    if (!editorRef) {
      return { html: editingCampaign?.html_content || '', design: designJson };
    }
    let html = (await editorRef.getHtml()) || '';
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

  const handleSaveCampaign = async (): Promise<string | null> => {
    if (!editingCampaign?.name) { toast.error('Nombre es requerido'); return null; }

    let htmlContent = editingCampaign.html_content || '';
    let savedDesign = designJson;

    // If on design step or later, export from blocks editor
    if (editorStep === 'design' || editorStep === 'audience' || editorStep === 'review') {
      const { html, design } = await exportEditorHtml();
      htmlContent = html;
      savedDesign = design;
    }

    // Validate content is not empty before saving
    const strippedHtml = htmlContent.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
    if (!strippedHtml && !savedDesign) {
      toast.error('El email está vacío. Diseña el contenido antes de guardar.');
      return null;
    }

    const action = editingCampaign.id ? 'update' : 'create';
    let data: any = null;
    try {
      const res = await callApi<any>('manage-email-campaigns', {
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
      data = res.data;
      const { error } = res;
      if (error) { toast.error(error); return null; }
    } catch (err: any) {
      console.error('[SteveMail] handleSaveCampaign callApi failed:', err);
      toast.error('Error al guardar la campaña. Inténtalo de nuevo.');
      return null;
    }

    // Handle concurrency conflict
    if (data?.conflict) {
      toast.error('Otro usuario modificó esta campaña. Recarga para ver los cambios.');
      return null;
    }

    toast.success(action === 'create' ? 'Campaña creada' : 'Campaña guardada');
    setIsDirty(false);

    // Track the updated_at for optimistic locking
    if (data?.campaign?.updated_at) {
      lastKnownUpdatedAt.current = data.campaign.updated_at;
    }

    const campaignId = data?.campaign?.id || editingCampaign.id || null;

    // If new, update the editing campaign ID
    if (!editingCampaign.id && data?.campaign?.id) {
      setEditingCampaign(prev => ({ ...prev, id: data.campaign.id }));
    }

    loadCampaigns();
    return campaignId;
  };

  const confirmSend = async () => {
    if (sending) return;
    // CRITERIO pre-flight check
    setCriterioLoading(true);
    setCriterioResult(null);
    try {
      const { html } = await exportEditorHtml();
      const { data: criterio, error: criterioError } = await callApi<any>('criterio-email', {
        body: {
          email_data: {
            id: editingCampaign?.id,
            subject: editingCampaign?.subject,
            preview_text: editingCampaign?.preview_text,
            html: html || editingCampaign?.html_content,
            send_hour: sendMode === 'schedule' && scheduleDate ? new Date(scheduleDate).getHours() : new Date().getHours(),
            timezone: 'America/Santiago',
            segment_size: subscriberCount,
            segment_excludes_unsubscribed: true,
          },
          shop_id: clientId,
        },
      });

      if (criterioError) {
        toast.error(`Error en CRITERIO: ${criterioError}`);
        setCriterioLoading(false);
        return;
      }

      if (criterio && !criterio.can_publish) {
        setCriterioResult(criterio);
        setCriterioLoading(false);
        return;
      }

      setCriterioResult(criterio);
    } catch {
      toast.error('Error al evaluar CRITERIO');
      setCriterioLoading(false);
      return;
    }
    setCriterioLoading(false);

    // CRITERIO passed — proceed with send/schedule
    if (sendMode === 'schedule') {
      if (!scheduleDate) { toast.error('Selecciona una fecha'); return; }
      setSending(true);
      try {
        const savedId = await handleSaveCampaign();
        const campaignId = savedId || editingCampaign?.id;
        if (!campaignId) { toast.error('Guarda la campaña primero'); return; }
        const { error } = await callApi('manage-email-campaigns', {
          body: { action: 'schedule', client_id: clientId, campaign_id: campaignId, scheduled_at: scheduleDate },
        });
        if (error) { toast.error(error); return; }
        toast.success('Campaña programada');
        setShowSendDialog(false);
        setShowEditor(false);
        loadCampaigns();
      } catch (err: any) {
        toast.error(err?.message || 'Error al programar campaña');
      } finally {
        setSending(false);
      }
      return;
    }

    // Send now
    const savedId = await handleSaveCampaign();
    const campaignId = savedId || editingCampaign?.id;
    if (!campaignId) { toast.error('Guarda la campaña primero'); return; }
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
        body: { action: 'send', client_id: clientId, campaign_id: campaignId, ab_test: abConfig },
      });
      if (error) { toast.error(error); return; }
      const smartSuffix = data?.smart_send_count > 0
        ? ` (${data.smart_send_count} diferidos a su hora óptima)`
        : '';
      const msg = data?.ab_test
        ? `Test A/B iniciado: ${data.enqueued || 0} encolados, ${data.remaining || 0} esperan ganador`
        : `Encolados ${data?.queued_count || 0} de ${data?.total_recipients || 0} contactos${smartSuffix}`;
      toast.success(msg);
      setShowEditor(false);
      loadCampaigns();
    } catch (err: any) {
      toast.error(err?.message || 'Error al enviar campaña');
    } finally {
      setSending(false);
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      // Export fresh HTML from the editor instead of using stale state
      const { html: freshHtml } = await exportEditorHtml();
      const htmlToSend = freshHtml || editingCampaign?.html_content || '';
      if (!htmlToSend) { toast.error('Diseña el email primero'); setSendingTest(false); return; }
      await handleSaveCampaign();
      const testRecipient = user?.email || '';
      if (!testRecipient) { toast.error('No se pudo obtener tu email. Inicia sesión de nuevo.'); setSendingTest(false); return; }
      const { error } = await callApi<any>('send-email', {
        body: {
          action: 'send-test',
          to: testRecipient,
          subject: `[TEST] ${editingCampaign?.subject || 'Sin asunto'}`,
          html_content: htmlToSend,
          from_email: editingCampaign?.from_email || 'noreply@steve.cl',
          from_name: editingCampaign?.from_name || 'Steve',
          client_id: clientId,
        },
      });
      if (error) { toast.error(error); return; }
      toast.success('Email de prueba enviado a ' + testRecipient);
    } catch {
      toast.error('Error enviando test');
    } finally {
      setSendingTest(false);
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await callApi('manage-email-campaigns', {
        body: { action: 'delete', client_id: clientId, campaign_id: campaignId },
      });
      if (error) { toast.error(error); return; }
      toast.success('Campaña eliminada');
      setDeleteConfirmId(null);
      loadCampaigns();
    } catch (err: any) {
      toast.error(err?.message || 'Error al eliminar campaña');
    } finally {
      setDeleting(false);
    }
  };

  const openEditor = (campaign?: Campaign) => {
    const c = campaign || {
      name: '',
      subject: '',
      preview_text: '',
      from_name: brandInfo.store_name || brandInfo.brand_name || brandInfo.name || '',
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
    setAudienceType(c.audience_filter?.type === 'list' || c.audience_filter?.type === 'segment' ? 'specific' : 'all');
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

  const goToAudienceStep = async () => {
    // Save current design state
    const { html, design } = await exportEditorHtml();
    setEditingCampaign(prev => ({ ...prev, html_content: html }));
    setDesignJson(design);
    // Load lists for audience selection
    loadEmailLists();
    // Restore audience type from existing filter
    const af = editingCampaign?.audience_filter;
    if (af?.type === 'list' || af?.type === 'segment') {
      setAudienceType('specific');
    } else {
      setAudienceType('all');
    }
    setEditorStep('audience');
  };

  // Convert Unlayer design objects (body.rows) to MJML strings for GrapeJS
  const unlayerToMjml = (design: any): string => {
    const bgColor = design.body?.values?.backgroundColor || '#f4f4f5';
    let out = `<mjml><mj-body background-color="${bgColor}">`;

    for (const row of design.body?.rows || []) {
      const sectionBg = row.values?.columnsBackgroundColor || '#ffffff';
      const columns = row.columns || [];
      const colCount = columns.length;

      out += `<mj-section background-color="${sectionBg}" padding="0">`;

      for (const col of columns) {
        const w = colCount > 1 ? ` width="${Math.floor(100 / colCount)}%"` : '';
        out += `<mj-column${w}>`;

        for (const c of col.contents || []) {
          const pad = c.values?.containerPadding || '16px';

          switch (c.type) {
            case 'heading': {
              const fs = c.values?.fontSize || '28px';
              const al = c.values?.textAlign || 'center';
              const cl = c.values?.color || '#18181b';
              out += `<mj-text padding="${pad}" font-size="${fs}" align="${al}" color="${cl}" font-weight="bold">${c.values?.text || ''}</mj-text>`;
              break;
            }
            case 'text':
              out += `<mj-text padding="${pad}">${c.values?.text || ''}</mj-text>`;
              break;
            case 'button': {
              const bc = c.values?.buttonColors || {};
              const href = c.values?.href?.values?.href || '#';
              out += `<mj-button padding="${pad}" background-color="${bc.backgroundColor || '#18181b'}" color="${bc.color || '#ffffff'}" border-radius="${c.values?.borderRadius || '6px'}" href="${href}" font-size="14px" font-weight="bold" inner-padding="14px 28px">${c.values?.text || ''}</mj-button>`;
              break;
            }
            case 'image': {
              const src = typeof c.values?.src === 'string' ? c.values.src : c.values?.src?.url || '';
              const alt = c.values?.altText || '';
              out += `<mj-image src="${src}" alt="${alt}" padding="${pad}" />`;
              break;
            }
            case 'divider': {
              const b = c.values?.border || {};
              out += `<mj-divider border-color="${b.borderTopColor || '#e4e4e7'}" border-width="${b.borderTopWidth || '1px'}" padding="${pad}" />`;
              break;
            }
            case 'social': {
              const icons = c.values?.icons?.icons || [];
              const els = icons.map((ic: any) =>
                `<mj-social-element name="${(ic.name || '').toLowerCase()}" href="${ic.url || '#'}">${ic.name || ''}</mj-social-element>`
              ).join('');
              out += `<mj-social padding="${pad}" mode="horizontal" icon-size="24px">${els}</mj-social>`;
              break;
            }
          }
        }

        out += '</mj-column>';
      }

      out += '</mj-section>';
    }

    out += '</mj-body></mjml>';
    return out;
  };

  /** Converts a table-based HTML email template into MJML with one mj-section per row,
   *  so each row is independently editable/movable in GrapeJS Studio. */
  const htmlToMjmlSections = (html: string): string => {
    // Strip outer wrapper table — keep only content of the inner 600px table
    const innerMatch = html.match(/<table[^>]*max-width:600px[^>]*>([\s\S]*?)<\/table>\s*<\/td>/i)
      || html.match(/<table[^>]*width="600"[^>]*>([\s\S]*?)<\/table>/i);
    const inner = innerMatch?.[1] || html;

    // Extract each <tr>...</tr> block
    const rowMatches = [...inner.matchAll(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/gi)];

    if (rowMatches.length === 0) {
      // Fallback: one section with entire HTML
      return `<mjml><mj-body background-color="#f4f4f5"><mj-section background-color="#ffffff" padding="0"><mj-column><mj-raw>${html}</mj-raw></mj-column></mj-section></mj-body></mjml>`;
    }

    let mjml = '<mjml><mj-body background-color="#f4f4f5">';
    for (const match of rowMatches) {
      const row = match[0];
      // Extract td content (inner HTML of first <td>)
      const tdMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
      const content = tdMatch?.[1]?.trim() || '';
      if (!content) continue;
      // Extract background-color from td or tr style
      const bgMatch = (row.match(/background-color:\s*(#[0-9a-fA-F]{3,6})/i) || row.match(/bgcolor="(#[0-9a-fA-F]{3,6})"/i));
      const bg = bgMatch?.[1] || '#ffffff';
      mjml += `\n<mj-section background-color="${bg}" padding="0"><mj-column><mj-raw>${content}</mj-raw></mj-column></mj-section>`;
    }
    mjml += '\n</mj-body></mjml>';
    return mjml;
  };

  const handleTemplateSelect = (templateDesign: any) => {
    setShowTemplateGallery(false);
    if (!templateDesign) return;

    // String template (HTML from emailTemplates.ts or MJML string)
    if (typeof templateDesign === 'string') {
      const mjml = templateDesign.includes('<mjml')
        ? templateDesign
        : htmlToMjmlSections(templateDesign);
      if (editorReady && emailEditorRef.current) {
        emailEditorRef.current.setHtml(mjml);
      } else {
        setEditingCampaign(prev => ({ ...prev, html_content: mjml }));
      }
      return;
    }

    // Unlayer format (system templates with body.rows) → convert to MJML
    if (templateDesign?.body?.rows) {
      const mjml = unlayerToMjml(templateDesign);
      if (editorReady && emailEditorRef.current) {
        emailEditorRef.current.setHtml(mjml);
      } else {
        setEditingCampaign(prev => ({ ...prev, html_content: mjml }));
      }
      return;
    }

    // GrapeJS project data (saved templates from getProjectData)
    setDesignJson(templateDesign);
    if (editorReady && emailEditorRef.current) {
      emailEditorRef.current.loadDesign(templateDesign);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!saveTemplateName.trim()) {
      toast.error('Ingresa un nombre para la plantilla');
      return;
    }
    setSavingTemplate(true);
    try {
      const { html, design } = await exportEditorHtml();
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
      console.error('[SteveMail] handleSaveAsTemplate failed:', err);
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

  const goToReviewStep = async () => {
    const { html, design } = await exportEditorHtml();
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
    scheduled: { label: 'Programada', color: 'bg-[#D6E0F0] text-[#132448]' },
    sending: { label: 'Enviando', color: 'bg-yellow-100 text-yellow-800' },
    sent: { label: 'Enviada', color: 'bg-green-100 text-green-800' },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  };

  // Render template gallery as portal OUTSIDE any conditional returns
  const templateGalleryPortal = showTemplateGallery ? createPortal(
    <EmailTemplateGallery
      clientId={clientId}
      isOpen={showTemplateGallery}
      onClose={() => setShowTemplateGallery(false)}
      onSelect={handleTemplateSelect}
    />,
    document.body
  ) : null;

  // =============== FULLSCREEN EDITOR ===============
  const editorView = (
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
                <Button variant="outline" size="sm" onClick={() => {
                  const existing = document.getElementById('save-template-overlay');
                  if (existing) existing.remove();
  
                  const overlay = document.createElement('div');
                  overlay.id = 'save-template-overlay';
                  overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
                  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  
                  overlay.innerHTML = `
                    <div style="background:white;padding:20px;border-radius:12px;width:400px;max-width:90vw;" onclick="event.stopPropagation()">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="font-weight:600;font-size:16px;">Guardar como Plantilla</h3>
                        <button id="stp-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:#666;">✕</button>
                      </div>
                      <div style="margin-bottom:12px;">
                        <label style="font-size:14px;display:block;margin-bottom:4px;">Nombre de la plantilla</label>
                        <input id="stp-name" placeholder="Ej: Mi plantilla de bienvenida" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;" />
                      </div>
                      <p style="font-size:12px;color:#888;margin-bottom:16px;">La plantilla quedará guardada y disponible en tu galería para reutilizarla en futuras campañas.</p>
                      <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="stp-cancel" style="padding:8px 16px;border:1px solid #ddd;border-radius:6px;background:white;cursor:pointer;font-size:14px;">Cancelar</button>
                        <button id="stp-save" style="padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Guardar</button>
                      </div>
                    </div>
                  `;
  
                  document.body.appendChild(overlay);
  
                  document.getElementById('stp-close')!.onclick = () => overlay.remove();
                  document.getElementById('stp-cancel')!.onclick = () => overlay.remove();
                  document.getElementById('stp-save')!.onclick = async () => {
                    const name = (document.getElementById('stp-name') as HTMLInputElement).value.trim();
                    if (!name) { alert('Ingresa un nombre'); return; }
                    const btn = document.getElementById('stp-save')!;
                    btn.textContent = 'Guardando...';
                    btn.setAttribute('disabled', 'true');
                    setSaveTemplateName(name);
                    try {
                      const { html, design } = await exportEditorHtml();
                      const { error } = await callApi('email-templates', {
                        body: {
                          action: 'create',
                          client_id: clientId,
                          name,
                          description: 'Plantilla guardada desde campaña',
                          category: 'custom',
                          design_json: design,
                          html_preview: html,
                        },
                      });
                      if (error) throw new Error(String(error));
                      overlay.remove();
                      toast.success('Plantilla guardada');
                    } catch (err: any) {
                      console.error('[SteveMail] Save template failed:', err);
                      toast.error('Error al guardar: ' + (err.message || err));
                      btn.textContent = 'Guardar';
                      btn.removeAttribute('disabled');
                    }
                  };
                }}>
                  <Save className="w-4 h-4 mr-1" /> Guardar Plantilla
                </Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const { html } = await exportEditorHtml();
                    setPreviewHtml(replaceMergeTagsForPreview(html));
                    setShowPreview(true);
                  } catch (err) {
                    console.error('[SteveMail] Preview error:', err);
                    toast.error('Error al generar vista previa');
                  }
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

        {/* Step 1: Setup - AI primero, campos manuales abajo */}
        {editorStep === 'setup' && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Paso 1: Cuéntale a Steve sobre tu campaña</h2>
                <p className="text-sm text-muted-foreground">Steve genera nombre, asunto, preview y email completo desde tu contexto.</p>
              </div>

              {/* AI Generation - principal */}
              <Card className="border-dashed border-2 border-purple-300">
                <CardContent className="py-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold">Generar con Steve AI</h3>
                  </div>

                  <div>
                    <Label>Tipo de campaña *</Label>
                    <Select value={campaignType} onValueChange={setCampaignType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Cuéntale a Steve sobre tu campaña *</Label>
                    <Textarea
                      value={aiInstructions}
                      onChange={(e) => setAiInstructions(e.target.value)}
                      placeholder="Ej: Quiero promocionar mi nueva colección de invierno con 30% off el primer pedido. Mi audiencia son mujeres 25-45 que ya compraron antes. Tono cercano y emocional. Incluir urgencia (oferta válida hasta domingo)."
                      rows={6}
                      className="resize-y"
                    />
                    <p className={`text-xs mt-1 ${aiInstructions.trim().length < 30 ? 'text-amber-600' : 'text-green-600'}`}>
                      {aiInstructions.trim().length < 30
                        ? `Mínimo 30 caracteres (${aiInstructions.trim().length}/30)`
                        : `${aiInstructions.trim().length} caracteres ✓`}
                    </p>
                  </div>

                  <Button
                    onClick={handleGenerateWithAI}
                    disabled={generating || aiInstructions.trim().length < 30}
                    size="lg"
                    className="w-full bg-gradient-to-r from-purple-600 to-[#1E3A7B] hover:from-purple-700 hover:to-[#162D5F]"
                  >
                    {generating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando email...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Generar Email con Steve AI</>
                    )}
                  </Button>
                  {editingCampaign?.html_content && (
                    <p className="text-xs text-green-600 font-medium text-center">
                      ✓ Email generado. Revisa los datos abajo y continúa al editor.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Campos manuales - editables (auto-rellenos por IA o manualmente) */}
              <details className="group" open={!!editingCampaign?.html_content}>
                <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground py-2 list-none">
                  <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                  {editingCampaign?.html_content ? 'Datos de la campaña (rellenados por Steve)' : 'Editar manualmente (avanzado)'}
                </summary>
                <div className="space-y-4 mt-3 pl-6">
                  <div>
                    <Label>Nombre de la campaña</Label>
                    <Input
                      value={editingCampaign?.name || ''}
                      onChange={(e) => setEditingCampaign(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Lo rellena Steve, o escríbelo tú"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Asunto del email</Label>
                      <Input
                        value={editingCampaign?.subject || ''}
                        onChange={(e) => setEditingCampaign(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Lo rellena Steve, o escríbelo tú"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Máx 50 caracteres recomendado.</p>
                    </div>
                    <div>
                      <Label>Preview text</Label>
                      <Input
                        value={editingCampaign?.preview_text || ''}
                        onChange={(e) => setEditingCampaign(prev => ({ ...prev, preview_text: e.target.value }))}
                        placeholder="Lo rellena Steve, o escríbelo tú"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Nombre del remitente</Label>
                      <Input
                        value={editingCampaign?.from_name || ''}
                        onChange={(e) => setEditingCampaign(prev => ({ ...prev, from_name: e.target.value }))}
                        placeholder="Nombre de tu tienda o marca"
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
              </details>

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

        {/* Step 2: Design (BlocksEditor) */}
        {editorStep === 'design' && (
          <>
            {/* Editor toolbar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-zinc-50 shrink-0">
              <Button
                size="sm"
                variant={showConditionalPanel ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setShowConditionalPanel(!showConditionalPanel)}
                title="Contenido condicional"
              >
                <Eye className="w-3.5 h-3.5 mr-1" /> Condicional
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setShowProductPanel(true)}
                title="Insertar productos de Shopify"
              >
                <ShoppingBag className="w-3.5 h-3.5 mr-1" /> Productos
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

            {/* GrapeJS email editor */}
            <div className="flex-1 min-h-0 relative">
              <div className="absolute inset-0">
                <GrapesEmailEditor
                  ref={emailEditorRef}
                  onReady={() => setEditorReady(true)}
                  onChange={() => setIsDirty(true)}
                  initialDesign={designJson}
                  clientId={clientId}
                  brandColor={brandInfo?.brand_color}
                />
              </div>
            </div>

            {/* Product Block Panel */}
            <ProductBlockPanel
              clientId={clientId}
              isOpen={showProductPanel}
              onClose={() => setShowProductPanel(false)}
              onInsert={(html) => {
                emailEditorRef.current?.insertHtml(html);
                setIsDirty(true);
              }}
            />

            {/* Conditional Block Panel */}
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

              {/* Radio: All vs Specific */}
              <div className="space-y-3">
                <Card
                  className={`cursor-pointer transition-all ${audienceType === 'all' ? 'border-primary ring-1 ring-primary/20' : 'hover:bg-muted/30'}`}
                  onClick={() => {
                    setAudienceType('all');
                    setEditingCampaign(prev => ({ ...prev, audience_filter: { type: 'all' } }));
                  }}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${audienceType === 'all' ? 'border-primary' : 'border-muted-foreground/40'}`}>
                        {audienceType === 'all' && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Todos los suscritos</p>
                        <p className="text-sm text-muted-foreground">{subscriberCount} contactos recibirán esta campaña</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className={`cursor-pointer transition-all ${audienceType === 'specific' ? 'border-primary ring-1 ring-primary/20' : 'hover:bg-muted/30'}`}
                  onClick={() => setAudienceType('specific')}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${audienceType === 'specific' ? 'border-primary' : 'border-muted-foreground/40'}`}>
                        {audienceType === 'specific' && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-[#F0F4FA] flex items-center justify-center">
                        <Filter className="w-5 h-5 text-[#1E3A7B]" />
                      </div>
                      <div>
                        <p className="font-medium">Lista o segmento específico</p>
                        <p className="text-sm text-muted-foreground">Enviar solo a un grupo de contactos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* List/Segment selector */}
              {audienceType === 'specific' && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Selecciona una lista o segmento</h4>
                  {listsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : emailLists.length === 0 ? (
                    <Card>
                      <CardContent className="py-6 text-center">
                        <List className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">No tienes listas ni segmentos creados</p>
                        <p className="text-xs text-muted-foreground mt-1">Ve a la sección "Listas" para crear una</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid gap-2">
                      {emailLists.map(list => {
                        const isSelected =
                          (editingCampaign?.audience_filter?.type === 'list' && editingCampaign?.audience_filter?.list_id === list.id) ||
                          (editingCampaign?.audience_filter?.type === 'segment' && editingCampaign?.audience_filter?.segment_id === list.id);
                        return (
                          <Card
                            key={list.id}
                            className={`cursor-pointer transition-all ${isSelected ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'hover:bg-muted/30'}`}
                            onClick={() => {
                              const filterType = list.type === 'segment' ? 'segment' : 'list';
                              const idKey = filterType === 'segment' ? 'segment_id' : 'list_id';
                              setEditingCampaign(prev => ({
                                ...prev,
                                audience_filter: { type: filterType, [idKey]: list.id, name: list.name },
                              }));
                            }}
                          >
                            <CardContent className="py-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {list.type === 'segment' ? (
                                    <Filter className="w-4 h-4 text-[#2A4F9E]" />
                                  ) : (
                                    <List className="w-4 h-4 text-muted-foreground" />
                                  )}
                                  <div>
                                    <p className="text-sm font-medium">{list.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Badge variant="outline" className="text-[10px]">
                                        {list.type === 'segment' ? 'Segmento' : 'Lista'}
                                      </Badge>
                                      {list.filters?.length > 0 && list.filters.map((f: any, i: number) => (
                                        <Badge key={i} variant="secondary" className="text-[10px]">
                                          {f.field} {f.operator} {f.value}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="outline">
                                  <Users className="w-3 h-3 mr-1" /> {list.subscriber_count}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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
                      {editingCampaign?.audience_filter?.type === 'list' || editingCampaign?.audience_filter?.type === 'segment' ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {editingCampaign.audience_filter.type === 'segment' ? 'Segmento' : 'Lista'}
                          </Badge>
                          <p className="text-sm font-medium">{editingCampaign.audience_filter.name || 'Seleccionado'}</p>
                          {(() => {
                            const selectedId = editingCampaign.audience_filter.list_id || editingCampaign.audience_filter.segment_id;
                            const match = emailLists.find(l => l.id === selectedId);
                            return match ? (
                              <span className="text-xs text-muted-foreground">({match.subscriber_count} contactos)</span>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        <p className="text-sm">{subscriberCount} contactos suscritos</p>
                      )}
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
                    sandbox="allow-same-origin"
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
                      const savedId = await handleSaveCampaign();
                      const cId = savedId || editingCampaign?.id;
                      if (cId) {
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
        <Dialog open={showSendDialog} onOpenChange={(open) => { setShowSendDialog(open); if (!open) { setCriterioResult(null); setCriterioLoading(false); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Campaña</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* CRITERIO evaluation status */}
              {criterioLoading && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-[#F0F4FA] border border-[#B5C8E0]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#1E3A7B]" />
                  <div>
                    <p className="font-medium text-[#0F1F3D]">CRITERIO evaluando...</p>
                    <p className="text-sm text-[#162D5F]">Verificando reglas de calidad del email</p>
                  </div>
                </div>
              )}

              {criterioResult && !criterioResult.can_publish && (
                <div className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <p className="font-medium text-red-900">CRITERIO rechazó el email</p>
                  </div>
                  <p className="text-sm text-red-700">Score: {criterioResult.score}% — {criterioResult.reason}</p>
                  {/* Render BLOQUEAR (red) + Rechazar/Advertencia (yellow) side-by-side. */}
                  {((criterioResult.failed_rules?.length ?? 0) + (criterioResult.warnings?.length ?? 0)) > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {[
                        ...(criterioResult.failed_rules || []),
                        ...(criterioResult.warnings || []),
                      ].map((rule, i) => (
                        <div
                          key={`${rule.rule_id}-${i}`}
                          className={
                            rule.severity === 'BLOQUEAR'
                              ? 'text-xs p-2 rounded bg-red-100 text-red-800'
                              : 'text-xs p-2 rounded bg-yellow-100 text-yellow-900'
                          }
                        >
                          <span className="font-medium">[{rule.severity}]</span> {rule.rule_id} — {rule.details || 'Regla no cumplida'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {criterioResult && criterioResult.can_publish && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                    <MailCheck className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">CRITERIO aprobado — Score {criterioResult.score}%</p>
                      <p className="text-sm text-green-700">El email cumple las reglas de calidad</p>
                    </div>
                  </div>
                  {/* Even when can_publish=true, Rechazar/Advertencia warnings should be surfaced in yellow. */}
                  {(criterioResult.warnings?.length ?? 0) > 0 && (
                    <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 space-y-1.5 max-h-40 overflow-y-auto">
                      <p className="text-xs font-medium text-yellow-900 mb-1">Advertencias (no bloquean publicación):</p>
                      {criterioResult.warnings!.map((rule, i) => (
                        <div
                          key={`${rule.rule_id}-${i}`}
                          className="text-xs p-2 rounded bg-yellow-100 text-yellow-900"
                        >
                          <span className="font-medium">[{rule.severity}]</span> {rule.rule_id} — {rule.details || 'Regla con observación'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!criterioLoading && !criterioResult && (
                <>
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
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendDialog(false)}>Cancelar</Button>
              {criterioResult && !criterioResult.can_publish ? (
                <Button variant="outline" onClick={() => { setCriterioResult(null); }}>
                  Volver a intentar
                </Button>
              ) : (
                <Button onClick={confirmSend} disabled={sending || criterioLoading}>
                  {(sending || criterioLoading) && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {sendMode === 'now' ? 'Confirmar Envío' : 'Programar Envío'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );

  // =============== CAMPAIGN LIST VIEW ===============
  return (
    <>
      {showEditor ? editorView : (
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
              disabled={deleting}
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* A/B Test Results Panel */}
      <ABTestResultsPanel
        campaignId={abResultsCampaignId || ''}
        clientId={clientId}
        isOpen={!!abResultsCampaignId}
        onClose={() => setAbResultsCampaignId(null)}
      />
    </div>
      )}
      {/* Quick Preview Overlay (manual, fixed) */}
      {showPreview && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Vista previa</h3>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
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
              <div
                className={`border rounded-lg overflow-hidden bg-white transition-all ${
                  previewDevice === 'mobile' ? 'w-[375px]' : 'w-full'
                }`}
              >
                <iframe
                  srcDoc={previewHtml}
                  className="w-full min-h-[500px]"
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {templateGalleryPortal}

      {/* (Save template modal removed: handled with DOM overlay) */}
    </>
  );
}
