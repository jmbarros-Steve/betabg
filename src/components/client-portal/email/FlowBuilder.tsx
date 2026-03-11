import { useState, useEffect, useCallback, useRef } from 'react';
import EmailEditor, { EditorRef } from 'react-email-editor';
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
  Sparkles, ShoppingCart, UserPlus, Package, UserX, X, Save, Eye, Bell, TrendingDown, Split,
} from 'lucide-react';
import { getSteveMailEditorOptions, registerSteveMailTools } from './steveMailEditorConfig';
import { htmlToUnlayerDesign, type UnlayerDesignJson } from '@/components/client-portal/klaviyo/htmlToUnlayerDesign';
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
    label: 'Carrito Abandonado',
    description: 'Se activa cuando un cliente deja productos en el carrito sin comprar',
    icon: ShoppingCart,
    defaultName: 'Carrito Abandonado',
    defaultSteps: 3,
    defaultDelays: [3600, 86400, 259200],
  },
  welcome: {
    label: 'Bienvenida',
    description: 'Se activa cuando un nuevo cliente se registra',
    icon: UserPlus,
    defaultName: 'Bienvenida',
    defaultSteps: 3,
    defaultDelays: [0, 172800, 604800],
  },
  post_purchase: {
    label: 'Post-Compra',
    description: 'Se activa después de que un cliente realiza una compra',
    icon: Package,
    defaultName: 'Post-Compra',
    defaultSteps: 2,
    defaultDelays: [86400, 604800],
  },
  winback: {
    label: 'Winback',
    description: 'Se activa cuando un cliente no compra en X días',
    icon: UserX,
    defaultName: 'Recuperar Clientes',
    defaultSteps: 3,
    defaultDelays: [0, 604800, 1209600],
  },
  back_in_stock: {
    label: 'Back in Stock',
    description: 'Se activa cuando un producto vuelve a tener inventario',
    icon: Bell,
    defaultName: 'Back in Stock',
    defaultSteps: 1,
    defaultDelays: [0],
  },
  price_drop: {
    label: 'Price Drop',
    description: 'Se activa cuando un producto baja de precio',
    icon: TrendingDown,
    defaultName: 'Price Drop',
    defaultSteps: 1,
    defaultDelays: [0],
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

  // Unlayer for individual email editing
  const [showEmailEditor, setShowEmailEditor] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const emailEditorRef = useRef<EditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorReady, setEditorReady] = useState(false);

  // AI generation
  const [generating, setGenerating] = useState(false);

  // Preview
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Template Gallery & Universal Blocks
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showUniversalBlocks, setShowUniversalBlocks] = useState(false);

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
      setShowEditor(true);
      toast.success(`Flujo de ${config.label} generado con AI`);
    } catch (err) {
      toast.error('Error generando flujo');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!editingFlow?.name || !editingFlow?.trigger_type) {
      toast.error('Nombre y trigger son requeridos');
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
    toast.success(action === 'create' ? 'Flujo creado' : 'Flujo actualizado');
    setShowEditor(false);
    setEditingFlow(null);
    loadFlows();
  };

  const handleActivate = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', {
      body: { action: 'activate', client_id: clientId, flow_id: flowId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Flujo activado');
    loadFlows();
  };

  const handlePause = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', {
      body: { action: 'pause', client_id: clientId, flow_id: flowId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Flujo pausado');
    loadFlows();
  };

  const handleDelete = async (flowId: string) => {
    const { error } = await callApi('manage-email-flows', {
      body: { action: 'delete', client_id: clientId, flow_id: flowId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Flujo eliminado');
    loadFlows();
  };

  const openEditor = (flow?: Flow) => {
    setEditingFlow(flow || {
      name: '',
      trigger_type: 'abandoned_cart',
      steps: [{ subject: '', html_content: '', delay_seconds: 3600 }],
      settings: { exit_on_purchase: true, quiet_hours_start: '22', quiet_hours_end: '8' },
    });
    setShowEditor(true);
  };

  const addStep = () => {
    if (!editingFlow) return;
    setEditingFlow({
      ...editingFlow,
      steps: [...(editingFlow.steps || []), { type: 'email', subject: '', html_content: '', delay_seconds: 86400 }],
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

  const openStepInUnlayer = (index: number) => {
    setEditingStepIndex(index);
    setEditorReady(false);
    setShowEmailEditor(true);
  };

  const saveStepFromUnlayer = () => {
    const editor = emailEditorRef.current?.editor;
    if (!editor || editingStepIndex === null) return;

    editor.saveDesign((design: any) => {
      editor.exportHtml(({ html }: { html: string }) => {
        updateStep(editingStepIndex, { html_content: html, design_json: design });
        setShowEmailEditor(false);
        setEditingStepIndex(null);
        toast.success('Email guardado');
      });
    });
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
    return `${Math.round(seconds / 86400)} días`;
  };

  // =============== UNLAYER EMAIL EDITOR (FULLSCREEN) ===============
  if (showEmailEditor && editingStepIndex !== null) {
    const currentStep = editingFlow?.steps?.[editingStepIndex];

    return (
      <div className="fixed inset-0 z-[100] bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setShowEmailEditor(false); setEditingStepIndex(null); }}>
              <X className="w-4 h-4 mr-1" /> Cerrar
            </Button>
            <span className="text-sm font-medium">
              Email {editingStepIndex + 1}: {currentStep?.subject || 'Sin asunto'}
            </span>
          </div>
          <Button size="sm" onClick={saveStepFromUnlayer}>
            <Save className="w-4 h-4 mr-1" /> Guardar Email
          </Button>
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
          <div className="flex items-center gap-2 flex-1">
            <Label className="text-xs whitespace-nowrap">Preview:</Label>
            <Input
              value={currentStep?.preview_text || ''}
              onChange={(e) => updateStep(editingStepIndex, { preview_text: e.target.value })}
              className="h-8 text-sm"
              placeholder="Preview text"
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
          <div ref={editorContainerRef} className="absolute inset-0">
            <EmailEditor
              ref={emailEditorRef}
              onReady={() => {
                setEditorReady(true);
                registerSteveMailTools(emailEditorRef.current?.editor);
                // Load existing design
                const step = editingFlow?.steps?.[editingStepIndex];
                if (step?.design_json) {
                  emailEditorRef.current?.editor?.loadDesign(step.design_json as any);
                } else if (step?.html_content) {
                  const design = htmlToUnlayerDesign(step.html_content);
                  emailEditorRef.current?.editor?.loadDesign(design as any);
                }
              }}
              options={getSteveMailEditorOptions()}
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
            if (design && emailEditorRef.current?.editor) {
              emailEditorRef.current.editor.loadDesign(design);
            }
          }}
        />

        {/* Universal Blocks Panel */}
        <UniversalBlocksPanel
          clientId={clientId}
          editor={emailEditorRef.current?.editor}
          isOpen={showUniversalBlocks}
          onClose={() => setShowUniversalBlocks(false)}
        />
      </div>
    );
  }

  // =============== FLOW EDITOR DIALOG ===============
  // =============== MAIN VIEW ===============
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Flujos Automáticos</h3>
          <p className="text-sm text-muted-foreground">Automatiza emails según el comportamiento del cliente</p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo Flujo
        </Button>
      </div>

      {/* Quick-create templates */}
      {flows.length === 0 && !loading && (
        <div>
          <p className="text-sm font-medium mb-3">Comienza con un template generado por AI:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(TRIGGER_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Card
                  key={key}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleGenerateFlowWithAI(key)}
                >
                  <CardContent className="py-4 flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      {generating ? (
                        <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                      ) : (
                        <Icon className="w-5 h-5 text-purple-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{config.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{config.defaultSteps} emails</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      <Sparkles className="w-3 h-3 mr-1" /> AI
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <GitBranch className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Selecciona un template arriba o crea un flujo desde cero.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => {
            const TriggerIcon = TRIGGER_CONFIG[flow.trigger_type]?.icon || GitBranch;
            return (
              <Card key={flow.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <TriggerIcon className="w-4.5 h-4.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-medium truncate">{flow.name}</h4>
                          <Badge className={statusConfig[flow.status]?.color || 'bg-gray-100'}>
                            {statusConfig[flow.status]?.label || flow.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{flow.steps?.length || 0} emails</span>
                          <span>{flow.active_enrollments || 0} activos</span>
                          <span>{flow.total_sent || 0} enviados</span>
                          <span className="text-muted-foreground/60">
                            {TRIGGER_CONFIG[flow.trigger_type]?.label || flow.trigger_type}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => openEditor(flow)}>
                        <Edit className="w-4 h-4" />
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
                      {flow.status !== 'active' && (
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(flow.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add more flows */}
          <div className="pt-2">
            <p className="text-sm font-medium mb-2">Agregar flujo con AI:</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(TRIGGER_CONFIG).map(([key, config]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerateFlowWithAI(key)}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                  {config.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Flow Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFlow?.id ? 'Editar Flujo' : 'Nuevo Flujo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
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
                <Label>Trigger *</Label>
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
                  <Label className="text-sm">Salir del flujo si compra</Label>
                  <Switch
                    checked={editingFlow?.settings?.exit_on_purchase ?? true}
                    onCheckedChange={(v) => setEditingFlow(prev =>
                      prev ? { ...prev, settings: { ...prev.settings, exit_on_purchase: v } } : prev
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Hora silenciosa inicio (UTC)</Label>
                    <Input
                      type="number" min="0" max="23"
                      value={editingFlow?.settings?.quiet_hours_start || '22'}
                      onChange={(e) => setEditingFlow(prev =>
                        prev ? { ...prev, settings: { ...prev.settings, quiet_hours_start: e.target.value } } : prev
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Hora silenciosa fin (UTC)</Label>
                    <Input
                      type="number" min="0" max="23"
                      value={editingFlow?.settings?.quiet_hours_end || '8'}
                      onChange={(e) => setEditingFlow(prev =>
                        prev ? { ...prev, settings: { ...prev.settings, quiet_hours_end: e.target.value } } : prev
                      )}
                    />
                  </div>
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

            {/* Flow Steps */}
            <div>
              <Label className="text-sm font-medium">Pasos del flujo</Label>
              <div className="space-y-3 mt-2">
                {(editingFlow?.steps || []).map((step, index) => {
                  const isCondition = step.type === 'condition';

                  return (
                    <div key={index}>
                      {index > 0 && !isCondition && (
                        <div className="flex items-center justify-center my-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                            <Clock className="w-3 h-3" />
                            Esperar: {delayLabel(step.delay_seconds)}
                          </div>
                        </div>
                      )}
                      {index > 0 && isCondition && (
                        <div className="flex items-center justify-center my-2">
                          <ArrowDown className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}

                      {/* Email step */}
                      {!isCondition && (
                        <Card className={step.html_content ? 'border-green-200' : ''}>
                          <CardContent className="py-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5" /> Email {index + 1}
                                {step.html_content && (
                                  <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                                    Contenido listo
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
                            {index > 0 && (
                              <div>
                                <Label className="text-xs">Delay antes de enviar</Label>
                                <Select
                                  value={String(step.delay_seconds)}
                                  onValueChange={(v) => updateStep(index, { delay_seconds: Number(v) })}
                                >
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {DELAY_OPTIONS.map(opt => (
                                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div>
                              <Label className="text-xs">Asunto</Label>
                              <Input
                                className="h-8 text-sm"
                                value={step.subject || ''}
                                onChange={(e) => updateStep(index, { subject: e.target.value })}
                                placeholder={`Ej: ${index === 0 ? 'Olvidaste algo en tu carrito' : index === 1 ? 'Tus productos te esperan' : 'Última oportunidad'}`}
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => openStepInUnlayer(index)}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1.5" />
                              {step.html_content ? 'Editar en Editor Visual' : 'Diseñar Email'}
                            </Button>
                          </CardContent>
                        </Card>
                      )}

                      {/* Condition step */}
                      {isCondition && (
                        <Card className="border-purple-200">
                          <CardContent className="py-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium flex items-center gap-1.5">
                                <Split className="w-3.5 h-3.5 text-purple-600" /> Condici&oacute;n (YES/NO Split)
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => removeStep(index)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <div>
                              <Label className="text-xs">Tipo de condici&oacute;n</Label>
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
                                <span className="text-xs font-semibold text-green-700">YES</span>
                                {(step.yes_steps || []).map((subStep, subIdx) => (
                                  <Card key={subIdx} className={`${subStep.html_content ? 'border-green-200' : ''}`}>
                                    <CardContent className="py-2 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium flex items-center gap-1">
                                          {subStep.type === 'condition' ? (
                                            <><Split className="w-3 h-3 text-purple-600" /> Condici&oacute;n</>
                                          ) : (
                                            <><Mail className="w-3 h-3" /> Email</>
                                          )}
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSubStep(index, 'yes_steps', subIdx)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      {subStep.type !== 'condition' && (
                                        <>
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
                                        </>
                                      )}
                                      {subStep.type === 'condition' && (
                                        <Select
                                          value={subStep.condition?.type || 'opened_email'}
                                          onValueChange={(v) => updateSubStep(index, 'yes_steps', subIdx, { condition: { ...subStep.condition, type: v } })}
                                        >
                                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {CONDITION_TYPES.map(ct => (
                                              <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" onClick={() => addSubStep(index, 'yes_steps', 'email')}>
                                    <Mail className="w-3 h-3 mr-1" /> Email
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" onClick={() => addSubStep(index, 'yes_steps', 'condition')}>
                                    <Split className="w-3 h-3 mr-1" /> Split
                                  </Button>
                                </div>
                              </div>

                              {/* NO branch */}
                              <div className="border-l-2 border-red-400 pl-3 space-y-2">
                                <span className="text-xs font-semibold text-red-700">NO</span>
                                {(step.no_steps || []).map((subStep, subIdx) => (
                                  <Card key={subIdx} className={`${subStep.html_content ? 'border-green-200' : ''}`}>
                                    <CardContent className="py-2 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-medium flex items-center gap-1">
                                          {subStep.type === 'condition' ? (
                                            <><Split className="w-3 h-3 text-purple-600" /> Condici&oacute;n</>
                                          ) : (
                                            <><Mail className="w-3 h-3" /> Email</>
                                          )}
                                        </span>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeSubStep(index, 'no_steps', subIdx)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      {subStep.type !== 'condition' && (
                                        <>
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
                                        </>
                                      )}
                                      {subStep.type === 'condition' && (
                                        <Select
                                          value={subStep.condition?.type || 'opened_email'}
                                          onValueChange={(v) => updateSubStep(index, 'no_steps', subIdx, { condition: { ...subStep.condition, type: v } })}
                                        >
                                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {CONDITION_TYPES.map(ct => (
                                              <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" onClick={() => addSubStep(index, 'no_steps', 'email')}>
                                    <Mail className="w-3 h-3 mr-1" /> Email
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" onClick={() => addSubStep(index, 'no_steps', 'condition')}>
                                    <Split className="w-3 h-3 mr-1" /> Split
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" className="flex-1" onClick={addStep}>
                  <Plus className="w-4 h-4 mr-1.5" /> Agregar Email
                </Button>
                <Button variant="outline" className="flex-1" onClick={addConditionStep}>
                  <Split className="w-4 h-4 mr-1.5" /> Condici&oacute;n (YES/NO Split)
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>Cancelar</Button>
            <Button onClick={handleSave}>
              {editingFlow?.id ? 'Guardar cambios' : 'Crear flujo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Preview del Email</DialogTitle>
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
