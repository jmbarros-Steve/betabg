import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  GitBranch, Plus, Play, Pause, Trash2, Edit, Loader2, Clock, Mail, ArrowLeft,
  Sparkles, ShoppingCart, UserPlus, Package, UserX, X, Save, Settings2,
  Cake, Eye, Search,
} from 'lucide-react';
import GrapesEmailEditor, { type UnlayerEditorRef } from './GrapesEmailEditor';
import { EmailTemplateGallery } from './EmailTemplateGallery';
import { UniversalBlocksPanel } from './UniversalBlocksPanel';
import { FlowCanvas } from './FlowCanvas';

interface FlowBuilderProps {
  clientId: string;
}

interface FlowStep {
  type?: 'email' | 'condition' | 'delay';
  subject?: string;
  preview_text?: string;
  html_content?: string;
  design_json?: any;
  delay_seconds: number;
  from_name?: string;
  conditions?: any;
  condition?: {
    type: string;
    field?: string;
    operator?: string;
    value?: string;
  };
  yes_steps?: FlowStep[];
  no_steps?: FlowStep[];
}

interface Flow {
  id: string;
  name: string;
  trigger_type: string;
  status: string;
  steps: FlowStep[];
  settings: any;
  active_enrollments?: number;
  total_enrollments?: number;
  total_sent?: number;
  created_at: string;
}

const TRIGGER_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: any;
  defaultName: string;
  defaultSteps: number;
  defaultDelays: number[];
}> = {
  abandoned_cart: {
    label: 'Carrito abandonado',
    description: 'Se activa cuando un cliente deja productos en el carrito sin comprar',
    icon: ShoppingCart,
    defaultName: 'Carrito abandonado',
    defaultSteps: 3,
    defaultDelays: [3600, 86400, 259200],
  },
  welcome: {
    label: 'Bienvenida',
    description: 'Se activa cuando un nuevo suscriptor se une a tu lista',
    icon: UserPlus,
    defaultName: 'Bienvenida',
    defaultSteps: 3,
    defaultDelays: [0, 172800, 604800],
  },
  customer_created: {
    label: 'Nuevo cliente',
    description: 'Se activa cuando alguien se registra como cliente en tu tienda',
    icon: UserPlus,
    defaultName: 'Nuevo cliente',
    defaultSteps: 2,
    defaultDelays: [0, 172800],
  },
  first_purchase: {
    label: 'Primera compra',
    description: 'Se activa cuando un cliente realiza su primera compra',
    icon: Package,
    defaultName: 'Primera compra',
    defaultSteps: 2,
    defaultDelays: [86400, 604800],
  },
  post_purchase: {
    label: 'Post-compra',
    description: 'Se activa despues de que un cliente realiza una compra',
    icon: Package,
    defaultName: 'Post-compra',
    defaultSteps: 2,
    defaultDelays: [86400, 604800],
  },
  winback: {
    label: 'Recuperar cliente inactivo',
    description: 'Se activa cuando un cliente lleva tiempo sin comprar en tu tienda',
    icon: UserX,
    defaultName: 'Recuperar cliente inactivo',
    defaultSteps: 3,
    defaultDelays: [0, 604800, 1209600],
  },
  birthday: {
    label: 'Cumpleaños',
    description: 'Envia un email especial cuando un suscriptor cumple años',
    icon: Cake,
    defaultName: 'Feliz cumpleaños',
    defaultSteps: 2,
    defaultDelays: [0, 86400],
  },
  browse_abandonment: {
    label: 'Navegación abandonada',
    description: 'Se activa cuando un visitante ve productos pero no agrega al carrito',
    icon: Search,
    defaultName: 'Navegación abandonada',
    defaultSteps: 2,
    defaultDelays: [3600, 86400],
  },
};

// ── Trigger-specific settings definitions ─────────────────────
const TRIGGER_SETTINGS: Record<string, { key: string; label: string; type: 'number' | 'select'; unit?: string; options?: { value: string; label: string }[]; defaultValue: string | number }[]> = {
  abandoned_cart: [
    { key: 'wait_minutes', label: 'Esperar antes de enviar', type: 'select', options: [
      { value: '30', label: '30 minutos' }, { value: '60', label: '1 hora' }, { value: '120', label: '2 horas' },
      { value: '240', label: '4 horas' }, { value: '720', label: '12 horas' }, { value: '1440', label: '24 horas' },
    ], defaultValue: '60' },
    { key: 'min_cart_value', label: 'Valor mínimo del carrito ($)', type: 'number', defaultValue: 0 },
  ],
  winback: [
    { key: 'inactivity_days', label: 'Días sin comprar', type: 'select', options: [
      { value: '30', label: '30 días' }, { value: '60', label: '60 días' }, { value: '90', label: '90 días' },
      { value: '120', label: '120 días' }, { value: '180', label: '6 meses' }, { value: '365', label: '1 año' },
    ], defaultValue: '90' },
  ],
  birthday: [
    { key: 'days_before', label: 'Enviar antes del cumpleaños', type: 'select', options: [
      { value: '0', label: 'El mismo día' }, { value: '1', label: '1 día antes' },
      { value: '3', label: '3 días antes' }, { value: '7', label: '1 semana antes' },
    ], defaultValue: '0' },
    { key: 'include_discount', label: 'Incluir descuento', type: 'select', options: [
      { value: 'none', label: 'Sin descuento' }, { value: '10', label: '10% descuento' },
      { value: '15', label: '15% descuento' }, { value: '20', label: '20% descuento' },
    ], defaultValue: 'none' },
  ],
  browse_abandonment: [
    { key: 'min_products_viewed', label: 'Mínimo de productos vistos', type: 'number', defaultValue: 2 },
    { key: 'wait_minutes', label: 'Esperar antes de enviar', type: 'select', options: [
      { value: '30', label: '30 minutos' }, { value: '60', label: '1 hora' }, { value: '120', label: '2 horas' },
      { value: '240', label: '4 horas' },
    ], defaultValue: '60' },
  ],
  post_purchase: [
    { key: 'exclude_repeat', label: 'Excluir compradores recurrentes', type: 'select', options: [
      { value: 'false', label: 'No' }, { value: 'true', label: 'Sí' },
    ], defaultValue: 'false' },
  ],
};

export function FlowBuilder({ clientId }: FlowBuilderProps) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFlow, setEditingFlow] = useState<Partial<Flow> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const emailEditorRef = useRef<UnlayerEditorRef>(null);
  const [, setEditorReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showUniversalBlocks, setShowUniversalBlocks] = useState(false);
  const [showTriggerPicker, setShowTriggerPicker] = useState(false);
  const [editingSubStep, setEditingSubStep] = useState<{ pi: number; branch: 'yes_steps' | 'no_steps'; si: number } | null>(null);

  const loadFlows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('manage-email-flows', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setFlows(data?.flows || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadFlows(); }, [loadFlows]);

  const handleGenerateFlowWithAI = async (triggerType: string) => {
    setGenerating(true);
    try {
      const config = TRIGGER_CONFIG[triggerType];
      const { data, error } = await callApi<any>('generate-steve-mail-content', {
        body: { action: 'generate_flow_emails', client_id: clientId, flow_type: triggerType, email_count: config.defaultSteps },
      });
      if (error) { toast.error(`Error al generar: ${error}`); return; }
      const emails = data?.emails || [];
      const steps: FlowStep[] = emails.map((email: any, i: number) => ({
        type: 'email' as const,
        subject: email.subject || `Email ${i + 1}`,
        preview_text: email.preview_text || '',
        html_content: email.html_content || '',
        delay_seconds: email.delay_seconds || config.defaultDelays[i] || 86400,
      }));
      setEditingFlow({
        name: config.defaultName,
        trigger_type: triggerType,
        steps: steps.length > 0 ? steps : [{ type: 'email', subject: '', html_content: '', delay_seconds: config.defaultDelays[0] }],
        settings: { exit_on_purchase: true, quiet_hours_start: '22', quiet_hours_end: '8' },
      });
      setShowTriggerPicker(false);
      setShowEditor(true);
      toast.success(`Automatizacion de ${config.label} generada con AI`);
    } catch {
      toast.error('Error al generar la automatización. Inténtalo de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!editingFlow?.name || !editingFlow?.trigger_type) { toast.error('Nombre y tipo son requeridos'); return; }
    const action = editingFlow.id ? 'update' : 'create';
    const { error } = await callApi('manage-email-flows', {
      body: {
        action, client_id: clientId, flow_id: editingFlow.id, name: editingFlow.name,
        trigger_type: editingFlow.trigger_type, steps: editingFlow.steps || [], settings: editingFlow.settings || {},
      },
    });
    if (error) { toast.error(error); return; }
    toast.success(action === 'create' ? 'Automatizacion creada' : 'Automatizacion actualizada');
    setShowEditor(false);
    setEditingFlow(null);
    loadFlows();
  };

  const handleActivate = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', { body: { action: 'activate', client_id: clientId, flow_id: flowId } });
    if (error) { toast.error(error); return; }
    toast.success('Activada');
    loadFlows();
  };

  const handlePause = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', { body: { action: 'pause', client_id: clientId, flow_id: flowId } });
    if (error) { toast.error(error); return; }
    toast.success('Pausada');
    loadFlows();
  };

  const handleDelete = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', { body: { action: 'delete', client_id: clientId, flow_id: flowId } });
    if (error) { toast.error(error); return; }
    toast.success('Eliminada');
    loadFlows();
  };

  const selectTriggerAndOpen = (triggerType: string) => {
    const config = TRIGGER_CONFIG[triggerType];
    setEditingFlow({
      name: config.defaultName,
      trigger_type: triggerType,
      steps: [{ type: 'email', subject: '', html_content: '', delay_seconds: config.defaultDelays[0] }],
      settings: { exit_on_purchase: true, quiet_hours_start: '22', quiet_hours_end: '8' },
    });
    setShowTriggerPicker(false);
    setShowEditor(true);
  };

  const addStep = (type: 'email' | 'delay' | 'condition') => {
    if (!editingFlow) return;
    const s: FlowStep = type === 'email'
      ? { type: 'email', subject: '', html_content: '', delay_seconds: 86400 }
      : type === 'delay'
        ? { type: 'delay', delay_seconds: 86400 }
        : { type: 'condition', delay_seconds: 0, condition: { type: 'opened_email' }, yes_steps: [], no_steps: [] };
    setEditingFlow({ ...editingFlow, steps: [...(editingFlow.steps || []), s] });
  };

  const addSubStep = (pi: number, branch: 'yes_steps' | 'no_steps', st: 'email' | 'condition') => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    const parent = { ...steps[pi] };
    const bs = [...(parent[branch] || [])];
    bs.push(st === 'email'
      ? { type: 'email', subject: '', html_content: '', delay_seconds: 0 }
      : { type: 'condition', delay_seconds: 0, condition: { type: 'opened_email' }, yes_steps: [], no_steps: [] });
    parent[branch] = bs;
    steps[pi] = parent;
    setEditingFlow({ ...editingFlow, steps });
  };

  const updateSubStep = (pi: number, branch: 'yes_steps' | 'no_steps', si: number, updates: Partial<FlowStep>) => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    const parent = { ...steps[pi] };
    const bs = [...(parent[branch] || [])];
    bs[si] = { ...bs[si], ...updates };
    parent[branch] = bs;
    steps[pi] = parent;
    setEditingFlow({ ...editingFlow, steps });
  };

  const removeSubStep = (pi: number, branch: 'yes_steps' | 'no_steps', si: number) => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    const parent = { ...steps[pi] };
    parent[branch] = (parent[branch] || []).filter((_: any, i: number) => i !== si);
    steps[pi] = parent;
    setEditingFlow({ ...editingFlow, steps });
  };

  const updateStep = (index: number, updates: Partial<FlowStep>) => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    steps[index] = { ...steps[index], ...updates };
    setEditingFlow({ ...editingFlow, steps });
  };

  const removeStep = (index: number) => {
    if (!editingFlow) return;
    setEditingFlow({ ...editingFlow, steps: (editingFlow.steps || []).filter((_: any, i: number) => i !== index) });
  };

  const openStepInEditor = (index: number) => {
    setEditingStepIndex(index);
    setEditingSubStep(null);
    setEditorReady(false);
    setShowEmailEditor(true);
  };

  const openSubStepInEditor = (pi: number, branch: 'yes_steps' | 'no_steps', si: number) => {
    setEditingSubStep({ pi, branch, si });
    setEditingStepIndex(null);
    setEditorReady(false);
    setShowEmailEditor(true);
  };

  const saveStepFromEditor = async () => {
    if (!emailEditorRef.current) return;
    const html = await emailEditorRef.current.getHtml();
    const design = emailEditorRef.current.getProjectData();

    if (editingSubStep) {
      updateSubStep(editingSubStep.pi, editingSubStep.branch, editingSubStep.si, {
        html_content: html,
        design_json: design,
      });
    } else if (editingStepIndex !== null) {
      updateStep(editingStepIndex, {
        html_content: html,
        design_json: design,
      });
    }
    setShowEmailEditor(false);
    setEditingStepIndex(null);
    setEditingSubStep(null);
    toast.success('Email guardado');
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-800' },
    active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
    paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-800' },
  };

  const triggerLabel = (t: string) => TRIGGER_CONFIG[t]?.label || t;

  // =============== FULLSCREEN EMAIL EDITOR ===============
  if (showEmailEditor && (editingStepIndex !== null || editingSubStep !== null)) {
    const currentStep = editingSubStep
      ? editingFlow?.steps?.[editingSubStep.pi]?.[editingSubStep.branch]?.[editingSubStep.si]
      : editingFlow?.steps?.[editingStepIndex!];
    const editorLabel = editingSubStep
      ? `Sub-email (${editingSubStep.branch === 'yes_steps' ? 'Sí' : 'No'} #${editingSubStep.si + 1})`
      : `Email ${(editingStepIndex ?? 0) + 1}`;
    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { void saveStepFromEditor(); }}>
              <Save className="w-4 h-4 mr-1" /> Guardar y volver
            </Button>
            <span className="text-sm font-medium">
              {editorLabel}: {currentStep?.subject || 'Sin asunto'}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setShowEmailEditor(false); setEditingStepIndex(null); setEditingSubStep(null); }}>
            <X className="w-4 h-4 mr-1" /> Cancelar
          </Button>
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Label className="text-xs whitespace-nowrap">Asunto:</Label>
            <Input
              value={currentStep?.subject || ''}
              onChange={(e) => {
                if (editingSubStep) {
                  updateSubStep(editingSubStep.pi, editingSubStep.branch, editingSubStep.si, { subject: e.target.value });
                } else if (editingStepIndex !== null) {
                  updateStep(editingStepIndex, { subject: e.target.value });
                }
              }}
              className="h-8 text-sm"
              placeholder="Asunto del email"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTemplateGallery(true)}>Templates</Button>
            <Button variant="outline" size="sm" onClick={() => setShowUniversalBlocks(true)}>Bloques</Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0">
            <GrapesEmailEditor
              ref={emailEditorRef}
              clientId={clientId}
              onReady={() => {
                setEditorReady(true);
                const step = editingSubStep
                  ? editingFlow?.steps?.[editingSubStep.pi]?.[editingSubStep.branch]?.[editingSubStep.si]
                  : editingFlow?.steps?.[editingStepIndex!];
                if (step?.design_json) {
                  emailEditorRef.current?.loadDesign(step.design_json);
                } else if (step?.html_content) {
                  emailEditorRef.current?.setHtml(step.html_content);
                }
              }}
            />
          </div>
        </div>
        <EmailTemplateGallery
          clientId={clientId}
          isOpen={showTemplateGallery}
          onClose={() => setShowTemplateGallery(false)}
          onSelect={(design) => {
            setShowTemplateGallery(false);
            if (design && emailEditorRef.current) {
              const mjml = typeof design === 'string' ? design : (design as any).html || '';
              emailEditorRef.current.setHtml(mjml);
            }
          }}
        />
        <UniversalBlocksPanel
          clientId={clientId}
          editor={emailEditorRef.current}
          isOpen={showUniversalBlocks}
          onClose={() => setShowUniversalBlocks(false)}
        />
      </div>
    );
  }

  // =============== FULLSCREEN VISUAL FLOW EDITOR ===============
  if (showEditor && editingFlow) {
    const TriggerIcon = TRIGGER_CONFIG[editingFlow.trigger_type || '']?.icon || GitBranch;
    const emailCount = (editingFlow.steps || []).filter(s => s.type !== 'delay' && s.type !== 'condition').length;
    const conditionCount = (editingFlow.steps || []).filter(s => s.type === 'condition').length;

    return (
      <div className="fixed inset-0 z-[90] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setShowEditor(false); setEditingFlow(null); }}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Volver
            </Button>
            <div className="h-5 w-px bg-border" />
            <TriggerIcon className="w-4 h-4 text-purple-600" />
            <Input
              value={editingFlow.name || ''}
              onChange={(e) => setEditingFlow(prev => prev ? { ...prev, name: e.target.value } : prev)}
              className="h-8 text-sm font-medium w-64 border-transparent hover:border-input focus:border-input"
              placeholder="Nombre de la automatizacion"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 mr-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {emailCount} emails</span>
              {conditionCount > 0 && (
                <span className="flex items-center gap-1"><GitBranch className="w-3.5 h-3.5" /> {conditionCount} condiciones</span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
              <Settings2 className="w-4 h-4 mr-1" /> Config
            </Button>
            {!editingFlow.id && editingFlow.trigger_type && (
              <Button variant="outline" size="sm" onClick={() => handleGenerateFlowWithAI(editingFlow.trigger_type!)} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1 text-purple-600" />}
                Generar con AI
              </Button>
            )}
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-1" /> {editingFlow.id ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </div>

        {showSettings && (
          <div className="border-b bg-muted/30 px-4 py-3">
            <div className="max-w-xl mx-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Se activa cuando</Label>
                  <Select value={editingFlow.trigger_type || 'abandoned_cart'} onValueChange={(v) => setEditingFlow(prev => prev ? { ...prev, trigger_type: v } : prev)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_CONFIG).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-5">
                  <Label className="text-xs">Salir si el cliente compra</Label>
                  <Switch
                    checked={editingFlow.settings?.exit_on_purchase ?? true}
                    onCheckedChange={(v) => setEditingFlow(prev =>
                      prev ? { ...prev, settings: { ...prev.settings, exit_on_purchase: v } } : prev
                    )}
                  />
                </div>
              </div>
              {editingFlow.trigger_type && (
                <p className="text-xs text-muted-foreground">{TRIGGER_CONFIG[editingFlow.trigger_type]?.description}</p>
              )}
              {/* Trigger-specific settings */}
              {editingFlow.trigger_type && TRIGGER_SETTINGS[editingFlow.trigger_type] && (
                <div className="border-t pt-3 mt-2">
                  <p className="text-xs font-medium mb-2">Configuración del trigger</p>
                  <div className="grid grid-cols-2 gap-3">
                    {TRIGGER_SETTINGS[editingFlow.trigger_type].map((setting) => (
                      <div key={setting.key}>
                        <Label className="text-xs">{setting.label}</Label>
                        {setting.type === 'select' ? (
                          <Select
                            value={String(editingFlow.settings?.trigger_config?.[setting.key] ?? setting.defaultValue)}
                            onValueChange={(v) => setEditingFlow(prev => prev ? {
                              ...prev, settings: {
                                ...prev.settings,
                                trigger_config: { ...prev.settings?.trigger_config, [setting.key]: v },
                              },
                            } : prev)}
                          >
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {setting.options?.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            className="h-8 text-sm"
                            value={editingFlow.settings?.trigger_config?.[setting.key] ?? setting.defaultValue}
                            onChange={(e) => setEditingFlow(prev => prev ? {
                              ...prev, settings: {
                                ...prev.settings,
                                trigger_config: { ...prev.settings?.trigger_config, [setting.key]: e.target.value },
                              },
                            } : prev)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <Label className="text-xs">Horas silenciosas (inicio)</Label>
                  <Select
                    value={editingFlow.settings?.quiet_hours_start || '22'}
                    onValueChange={(v) => setEditingFlow(prev => prev ? {
                      ...prev, settings: { ...prev.settings, quiet_hours_start: v },
                    } : prev)}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Horas silenciosas (fin)</Label>
                  <Select
                    value={editingFlow.settings?.quiet_hours_end || '8'}
                    onValueChange={(v) => setEditingFlow(prev => prev ? {
                      ...prev, settings: { ...prev.settings, quiet_hours_end: v },
                    } : prev)}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            <FlowCanvas
              triggerType={editingFlow.trigger_type || 'welcome'}
              steps={editingFlow.steps || []}
              onUpdateStep={updateStep}
              onRemoveStep={removeStep}
              onAddStep={addStep}
              onOpenStepEditor={openStepInEditor}
              onPreviewStep={(html) => { setPreviewHtml(html); setShowPreview(true); }}
              onAddSubStep={addSubStep}
              onUpdateSubStep={updateSubStep}
              onRemoveSubStep={removeSubStep}
              onOpenSubStepEditor={openSubStepInEditor}
            />
          </div>
        </div>

        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader><DialogTitle>Vista previa del email</DialogTitle></DialogHeader>
            <div className="border rounded-lg overflow-hidden bg-white">
              <iframe srcDoc={previewHtml} className="w-full min-h-[500px]" title="Email Preview" sandbox="allow-same-origin allow-scripts" />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // =============== MAIN VIEW ===============
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Automatizaciones</h3>
          <p className="text-sm text-muted-foreground">Envía emails automáticamente según el comportamiento del cliente</p>
        </div>
        <Button size="lg" onClick={() => setShowTriggerPicker(true)} className="gap-2">
          <Plus className="w-5 h-5" /> Nueva Automatización
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-purple-600" />
            </div>
            <h4 className="text-lg font-semibold mb-2">Automatiza tus emails</h4>
            <p className="text-muted-foreground max-w-md mb-6">
              Las automatizaciones envían emails automáticamente cuando algo ocurre en tu tienda.
            </p>
            <Button size="lg" onClick={() => setShowTriggerPicker(true)} className="gap-2">
              <Plus className="w-5 h-5" /> Crear automatización
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => {
            const TriggerIcon = TRIGGER_CONFIG[flow.trigger_type]?.icon || GitBranch;
            const status = statusConfig[flow.status];
            return (
              <Card key={flow.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <TriggerIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-medium truncate">{flow.name}</h4>
                          <Badge className={status?.color || 'bg-gray-100'}>{status?.label || flow.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TriggerIcon className="w-3 h-3" /> {triggerLabel(flow.trigger_type)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {(flow.steps || []).filter(s => s.type !== 'delay' && s.type !== 'condition').length} emails
                          </span>
                          <span>{flow.total_sent || 0} enviados</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => { setEditingFlow(flow); setShowEditor(true); }}>
                        <Edit className="w-4 h-4 mr-1" /> Editar
                      </Button>
                      {flow.status === 'draft' || flow.status === 'paused' ? (
                        <Button size="sm" onClick={() => handleActivate(flow.id)}>
                          <Play className="w-4 h-4 mr-1" /> Activar
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => handlePause(flow.id)}>
                          <Pause className="w-4 h-4 mr-1" /> Pausar
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(flow.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showTriggerPicker} onOpenChange={setShowTriggerPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva Automatización</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">Elige cuando se activara:</p>
          <div className="space-y-2">
            {Object.entries(TRIGGER_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors" onClick={() => selectTriggerAndOpen(key)}>
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{config.label}</p>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t pt-3 mt-2">
            <p className="text-xs text-muted-foreground text-center mb-2">O genera todos los emails automaticamente con AI</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TRIGGER_CONFIG).map(([key, config]) => (
                <Button key={key} variant="outline" size="sm" className="text-xs" onClick={() => handleGenerateFlowWithAI(key)} disabled={generating}>
                  {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-purple-600" />}
                  {config.label}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Vista previa</DialogTitle></DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <iframe srcDoc={previewHtml} className="w-full min-h-[500px]" title="Preview" sandbox="allow-same-origin allow-scripts" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
