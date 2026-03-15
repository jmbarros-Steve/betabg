import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  GitBranch, Plus, Play, Pause, Trash2, Edit, Loader2, Clock, Mail, ArrowDown,
  Sparkles, ShoppingCart, UserPlus, Package, UserX, X, Save, Eye, Bell, TrendingDown,
} from 'lucide-react';
import { SteveMailEditor, type SteveMailEditorRef } from './SteveMailEditor';
import { EmailTemplateGallery } from './EmailTemplateGallery';
import { UniversalBlocksPanel } from './UniversalBlocksPanel';

interface FlowBuilderProps {
  clientId: string;
}

interface FlowStep {
  type?: 'email' | 'condition' | 'delay';
  // Email fields
  subject?: string;
  preview_text?: string;
  html_content?: string;
  design_json?: any;
  delay_seconds: number;
  from_name?: string;
  conditions?: any;
  // Condition fields
  condition?: {
    type: string;
    field?: string;
    operator?: string;
    value?: string;
  };
  yes_steps?: FlowStep[];
  no_steps?: FlowStep[];
}

const CONDITION_TYPES = [
  { value: 'opened_email', label: 'Abrió el email' },
  { value: 'clicked_email', label: 'Hizo clic en el email' },
  { value: 'has_purchased', label: 'Ha comprado' },
  { value: 'subscriber_property', label: 'Propiedad del suscriptor' },
];

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
    description: 'Se activa después de que un cliente realiza una compra',
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
};

const DELAY_OPTIONS = [
  { value: 0, label: 'Inmediato' },
  { value: 1800, label: '30 minutos' },
  { value: 3600, label: '1 hora' },
  { value: 7200, label: '2 horas' },
  { value: 14400, label: '4 horas' },
  { value: 43200, label: '12 horas' },
  { value: 86400, label: '1 día' },
  { value: 172800, label: '2 días' },
  { value: 259200, label: '3 días' },
  { value: 604800, label: '7 días' },
  { value: 1209600, label: '14 días' },
];

export function FlowBuilder({ clientId }: FlowBuilderProps) {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingFlow, setEditingFlow] = useState<Partial<Flow> | null>(null);

  // GrapeJS for individual email editing
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const emailEditorRef = useRef<SteveMailEditorRef>(null);
  const [editorReady, setEditorReady] = useState(false);

  // AI generation
  const [generating, setGenerating] = useState(false);

  // Preview
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Template Gallery & Universal Blocks
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showUniversalBlocks, setShowUniversalBlocks] = useState(false);

  // Trigger selection step
  const [showTriggerPicker, setShowTriggerPicker] = useState(false);

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
        body: {
          action: 'generate_flow_emails',
          client_id: clientId,
          flow_type: triggerType,
          email_count: config.defaultSteps,
        },
      });
      if (error) { toast.error(error); return; }

      const emails = data?.emails || [];
      const steps: FlowStep[] = emails.map((email: any, i: number) => ({
        subject: email.subject || `Email ${i + 1}`,
        preview_text: email.preview_text || '',
        html_content: email.html_content || '',
        delay_seconds: email.delay_seconds || config.defaultDelays[i] || 86400,
      }));

      setEditingFlow({
        name: config.defaultName,
        trigger_type: triggerType,
        steps: steps.length > 0 ? steps : [{ subject: '', html_content: '', delay_seconds: config.defaultDelays[0] }],
        settings: { exit_on_purchase: true, quiet_hours_start: '22', quiet_hours_end: '8' },
      });
      setShowTriggerPicker(false);
      setShowEditor(true);
      toast.success(`Automatización de ${config.label} generada con AI`);
    } catch (err) {
      toast.error('Error generando automatización');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!editingFlow?.name || !editingFlow?.trigger_type) {
      toast.error('Nombre y tipo de automatización son requeridos');
      return;
    }

    const action = editingFlow.id ? 'update' : 'create';
    const { error } = await callApi('manage-email-flows', {
      body: {
        action,
        client_id: clientId,
        flow_id: editingFlow.id,
        name: editingFlow.name,
        trigger_type: editingFlow.trigger_type,
        steps: editingFlow.steps || [],
        settings: editingFlow.settings || {},
      },
    });

    if (error) { toast.error(error); return; }
    toast.success(action === 'create' ? 'Automatización creada' : 'Automatización actualizada');
    setShowEditor(false);
    setEditingFlow(null);
    loadFlows();
  };

  const handleActivate = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', {
      body: { action: 'activate', client_id: clientId, flow_id: flowId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Automatización activada');
    loadFlows();
  };

  const handlePause = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', {
      body: { action: 'pause', client_id: clientId, flow_id: flowId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Automatización pausada');
    loadFlows();
  };

  const handleDelete = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', {
      body: { action: 'delete', client_id: clientId, flow_id: flowId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Automatización eliminada');
    loadFlows();
  };

  const openNewFlowPicker = () => {
    setShowTriggerPicker(true);
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

  const openEditor = (flow: Flow) => {
    setEditingFlow(flow);
    setShowEditor(true);
  };

  const addEmailStep = () => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      steps: [...(editingFlow.steps || []), { type: 'email', subject: '', html_content: '', delay_seconds: 86400 }],
    });
  };

  const addDelayStep = () => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      steps: [...(editingFlow.steps || []), { type: 'delay', delay_seconds: 86400 }],
    });
  };

  const addConditionStep = () => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      steps: [...(editingFlow.steps || []), { type: 'condition', delay_seconds: 0, condition: { type: 'opened_email' }, yes_steps: [], no_steps: [] }],
    });
  };

  const addSubStep = (parentIndex: number, branch: 'yes_steps' | 'no_steps', stepType: 'email' | 'condition') => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    const parent = { ...steps[parentIndex] };
    const branchSteps = [...(parent[branch] || [])];
    if (stepType === 'email') {
      branchSteps.push({ type: 'email', subject: '', html_content: '', delay_seconds: 0 });
    } else {
      branchSteps.push({ type: 'condition', delay_seconds: 0, condition: { type: 'opened_email' }, yes_steps: [], no_steps: [] });
    }
    parent[branch] = branchSteps;
    steps[parentIndex] = parent;
    setEditingFlow({ ...editingFlow, steps });
  };

  const updateSubStep = (parentIndex: number, branch: 'yes_steps' | 'no_steps', subIndex: number, updates: Partial<FlowStep>) => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    const parent = { ...steps[parentIndex] };
    const branchSteps = [...(parent[branch] || [])];
    branchSteps[subIndex] = { ...branchSteps[subIndex], ...updates };
    parent[branch] = branchSteps;
    steps[parentIndex] = parent;
    setEditingFlow({ ...editingFlow, steps });
  };

  const removeSubStep = (parentIndex: number, branch: 'yes_steps' | 'no_steps', subIndex: number) => {
    if (!editingFlow) return;
    const steps = [...(editingFlow.steps || [])];
    const parent = { ...steps[parentIndex] };
    parent[branch] = (parent[branch] || []).filter((_, i) => i !== subIndex);
    steps[parentIndex] = parent;
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
    const steps = (editingFlow.steps || []).filter((_, i) => i !== index);
    setEditingFlow({ ...editingFlow, steps });
  };

  const openStepInEditor = (index: number) => {
    setEditingStepIndex(index);
    setEditorReady(false);
    setShowEmailEditor(true);
  };

  const saveStepFromEditor = () => {
    if (!emailEditorRef.current || editingStepIndex === null) return;

    const html = emailEditorRef.current.getHtml();
    const projectData = emailEditorRef.current.getProjectData();
    updateStep(editingStepIndex, { html_content: html, design_json: projectData });
    setShowEmailEditor(false);
    setEditingStepIndex(null);
    toast.success('Email guardado');
  };

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-800' },
    active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
    paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-800' },
  };

  const delayLabel = (seconds: number) => {
    const opt = DELAY_OPTIONS.find(o => o.value === seconds);
    if (opt) return opt.label;
    if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} horas`;
    return `${Math.round(seconds / 86400)} dias`;
  };

  const triggerLabel = (triggerType: string) => {
    return TRIGGER_CONFIG[triggerType]?.label || triggerType;
  };

  // =============== FULLSCREEN EMAIL EDITOR ===============
  if (showEmailEditor && editingStepIndex !== null) {
    const currentStep = editingFlow?.steps?.[editingStepIndex];

    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={saveStepFromEditor}>
              <Save className="w-4 h-4 mr-1" /> Guardar y volver
            </Button>
            <span className="text-sm font-medium">
              Email {editingStepIndex + 1}: {currentStep?.subject || 'Sin asunto'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowEmailEditor(false); setEditingStepIndex(null); }}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Label className="text-xs whitespace-nowrap">Asunto:</Label>
            <Input
              value={currentStep?.subject || ''}
              onChange={(e) => updateStep(editingStepIndex, { subject: e.target.value })}
              className="h-8 text-sm"
              placeholder="Asunto del email"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowTemplateGallery(true)}>
              Templates
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowUniversalBlocks(true)}>
              Bloques
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0">
            <SteveMailEditor
              ref={emailEditorRef}
              onReady={() => {
                setEditorReady(true);
                const step = editingFlow?.steps?.[editingStepIndex];
                if (step?.html_content || step?.design_json) {
                  emailEditorRef.current?.loadDesign(step.html_content || '', step.design_json);
                }
              }}
              style={{ height: '100%' }}
            />
          </div>
        </div>

        {/* Template Gallery */}
        <EmailTemplateGallery
          clientId={clientId}
          isOpen={showTemplateGallery}
          onClose={() => setShowTemplateGallery(false)}
          onSelect={(design) => {
            setShowTemplateGallery(false);
            if (design) {
              const tryLoad = () => {
                if (emailEditorRef.current) {
                  const htmlContent = typeof design === 'string' ? design : (design as any).html || '';
                  emailEditorRef.current.loadDesign(htmlContent);
                } else {
                  setTimeout(tryLoad, 200);
                }
              };
              tryLoad();
            }
          }}
        />

        {/* Universal Blocks Panel */}
        <UniversalBlocksPanel
          clientId={clientId}
          editor={emailEditorRef.current}
          isOpen={showUniversalBlocks}
          onClose={() => setShowUniversalBlocks(false)}
        />
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
        <Button size="lg" onClick={openNewFlowPicker} className="gap-2">
          <Plus className="w-5 h-5" /> Nueva Automatización
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : flows.length === 0 ? (
        /* ===== EMPTY STATE ===== */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-purple-600" />
            </div>
            <h4 className="text-lg font-semibold mb-2">Automatiza tus emails</h4>
            <p className="text-muted-foreground max-w-md mb-6">
              Las automatizaciones envían emails automáticamente cuando algo ocurre en tu tienda. Crea tu primera automatización para empezar.
            </p>
            <Button size="lg" onClick={openNewFlowPicker} className="gap-2">
              <Plus className="w-5 h-5" /> Crear automatización
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ===== FLOW LIST ===== */
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
                          <Badge className={status?.color || 'bg-gray-100'}>
                            {status?.label || flow.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TriggerIcon className="w-3 h-3" />
                            {triggerLabel(flow.trigger_type)}
                          </span>
                          <span>{flow.total_sent || 0} emails enviados</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => openEditor(flow)}>
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

      {/* ===== TRIGGER PICKER DIALOG ===== */}
      <Dialog open={showTriggerPicker} onOpenChange={setShowTriggerPicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Automatización</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">Elige cuando se activará esta automatización:</p>
          <div className="space-y-2">
            {Object.entries(TRIGGER_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div
                  key={key}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                  onClick={() => selectTriggerAndOpen(key)}
                >
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
            <p className="text-xs text-muted-foreground text-center mb-2">O genera todos los emails automáticamente con AI</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TRIGGER_CONFIG).map(([key, config]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleGenerateFlowWithAI(key)}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1 text-purple-600" />}
                  {config.label}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== FLOW EDITOR DIALOG ===== */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFlow?.id ? 'Editar automatización' : 'Nueva automatización'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Name & Trigger */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={editingFlow?.name || ''}
                  onChange={(e) => setEditingFlow(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  placeholder="Ej: Carrito abandonado"
                />
              </div>
              <div>
                <Label>Se activa cuando *</Label>
                <Select
                  value={editingFlow?.trigger_type || 'abandoned_cart'}
                  onValueChange={(v) => setEditingFlow(prev => prev ? { ...prev, trigger_type: v } : prev)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_CONFIG).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editingFlow?.trigger_type && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                {TRIGGER_CONFIG[editingFlow.trigger_type]?.description}
              </p>
            )}

            {/* Settings */}
            <Card className="bg-muted/30">
              <CardContent className="py-3 space-y-3">
                <p className="text-sm font-medium">Configuración</p>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Salir del flujo si el cliente compra</Label>
                  <Switch
                    checked={editingFlow?.settings?.exit_on_purchase ?? true}
                    onCheckedChange={(v) => setEditingFlow(prev =>
                      prev ? { ...prev, settings: { ...prev.settings, exit_on_purchase: v } } : prev
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* AI Generate Button */}
            {!editingFlow?.id && editingFlow?.trigger_type && (
              <Button
                variant="outline"
                className="w-full border-dashed border-2"
                onClick={() => handleGenerateFlowWithAI(editingFlow.trigger_type!)}
                disabled={generating}
              >
                {generating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando emails con AI...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2 text-purple-600" /> Generar todos los emails con Steve AI</>
                )}
              </Button>
            )}

            {/* ===== FLOW STEPS (VISUAL) ===== */}
            <div>
              <Label className="text-sm font-medium">Pasos de la automatización</Label>
              <div className="space-y-0 mt-3">
                {(editingFlow?.steps || []).map((step, index) => {
                  const isCondition = step.type === 'condition';
                  const isDelay = step.type === 'delay';
                  const isEmail = !isCondition && !isDelay;

                  return (
                    <div key={index}>
                      {/* Vertical connector */}
                      {index > 0 && (
                        <div className="flex items-center justify-center py-1">
                          <ArrowDown className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}

                      {/* ---- EMAIL STEP ---- */}
                      {isEmail && (
                        <Card className={step.html_content ? 'border-green-200' : ''}>
                          <CardContent className="py-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-blue-600" /> Email
                                {step.html_content && (
                                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 ml-1">
                                    Listo
                                  </Badge>
                                )}
                              </span>
                              <div className="flex items-center gap-1">
                                {step.html_content && (
                                  <Button variant="ghost" size="sm" onClick={() => { setPreviewHtml(step.html_content || ''); setShowPreview(true); }}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {(editingFlow?.steps?.length || 0) > 1 && (
                                  <Button variant="ghost" size="sm" onClick={() => removeStep(index)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Asunto</Label>
                              <Input
                                className="h-8 text-sm"
                                value={step.subject || ''}
                                onChange={(e) => updateStep(index, { subject: e.target.value })}
                                placeholder="Ej: Olvidaste algo en tu carrito"
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => openStepInEditor(index)}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1.5" />
                              {step.html_content ? 'Editar diseño' : 'Diseñar email'}
                            </Button>
                          </CardContent>
                        </Card>
                      )}

                      {/* ---- DELAY STEP ---- */}
                      {isDelay && (
                        <Card className="border-orange-200">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-orange-600" /> Esperar
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => removeStep(index)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <div className="mt-2">
                              <Select
                                value={String(step.delay_seconds)}
                                onValueChange={(v) => updateStep(index, { delay_seconds: Number(v) })}
                              >
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {DELAY_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* ---- CONDITION STEP ---- */}
                      {isCondition && (
                        <Card className="border-purple-200">
                          <CardContent className="py-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium flex items-center gap-1.5">
                                <GitBranch className="w-3.5 h-3.5 text-purple-600" /> Condición
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => removeStep(index)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <div>
                              <Label className="text-xs">Si el cliente...</Label>
                              <Select
                                value={step.condition?.type || 'opened_email'}
                                onValueChange={(v) => updateStep(index, { condition: { ...step.condition, type: v } })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {CONDITION_TYPES.map(ct => (
                                    <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* YES / NO Branches */}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                              {/* YES branch */}
                              <div className="border-l-2 border-green-400 pl-3 space-y-2">
                                <span className="text-xs font-semibold text-green-700">Si</span>
                                {(step.yes_steps || []).map((subStep, subIdx) => (
                                  <Card key={subIdx} className={`${subStep.html_content ? 'border-green-200' : ''}`}>
                                    <CardContent className="py-2 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium flex items-center gap-1">
                                          <Mail className="w-3 h-3" /> Email
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSubStep(index, 'yes_steps', subIdx)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <Input
                                        className="h-7 text-xs"
                                        value={subStep.subject || ''}
                                        onChange={(e) => updateSubStep(index, 'yes_steps', subIdx, { subject: e.target.value })}
                                        placeholder="Asunto"
                                      />
                                      <Select
                                        value={String(subStep.delay_seconds)}
                                        onValueChange={(v) => updateSubStep(index, 'yes_steps', subIdx, { delay_seconds: Number(v) })}
                                      >
                                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {DELAY_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </CardContent>
                                  </Card>
                                ))}
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] w-full" onClick={() => addSubStep(index, 'yes_steps', 'email')}>
                                  <Mail className="w-3 h-3 mr-1" /> Agregar email
                                </Button>
                              </div>

                              {/* NO branch */}
                              <div className="border-l-2 border-red-400 pl-3 space-y-2">
                                <span className="text-xs font-semibold text-red-700">No</span>
                                {(step.no_steps || []).map((subStep, subIdx) => (
                                  <Card key={subIdx} className={`${subStep.html_content ? 'border-green-200' : ''}`}>
                                    <CardContent className="py-2 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium flex items-center gap-1">
                                          <Mail className="w-3 h-3" /> Email
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSubStep(index, 'no_steps', subIdx)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <Input
                                        className="h-7 text-xs"
                                        value={subStep.subject || ''}
                                        onChange={(e) => updateSubStep(index, 'no_steps', subIdx, { subject: e.target.value })}
                                        placeholder="Asunto"
                                      />
                                      <Select
                                        value={String(subStep.delay_seconds)}
                                        onValueChange={(v) => updateSubStep(index, 'no_steps', subIdx, { delay_seconds: Number(v) })}
                                      >
                                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {DELAY_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </CardContent>
                                  </Card>
                                ))}
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] w-full" onClick={() => addSubStep(index, 'no_steps', 'email')}>
                                  <Mail className="w-3 h-3 mr-1" /> Agregar email
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Inline delay for old email steps that have delay_seconds (backward compat) */}
                      {isEmail && index > 0 && step.delay_seconds > 0 && (
                        <div className="flex items-center justify-center my-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                            <Clock className="w-3 h-3" />
                            Esperar: {delayLabel(step.delay_seconds)}
                            <Select
                              value={String(step.delay_seconds)}
                              onValueChange={(v) => updateStep(index, { delay_seconds: Number(v) })}
                            >
                              <SelectTrigger className="h-6 text-[10px] border-0 bg-transparent w-auto min-w-0 px-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DELAY_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add step buttons -- 3 clear options */}
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={addEmailStep}>
                  <Mail className="w-4 h-4 mr-1.5" /> Email
                </Button>
                <Button variant="outline" className="flex-1" onClick={addDelayStep}>
                  <Clock className="w-4 h-4 mr-1.5" /> Esperar
                </Button>
                <Button variant="outline" className="flex-1" onClick={addConditionStep}>
                  <GitBranch className="w-4 h-4 mr-1.5" /> Condición
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>Cancelar</Button>
            <Button onClick={handleSave}>
              {editingFlow?.id ? 'Guardar cambios' : 'Crear automatización'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Vista previa del email</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <iframe
              srcDoc={previewHtml}
              className="w-full min-h-[500px]"
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
