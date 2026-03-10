import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  FileText, Plus, Edit, Trash2, Play, Pause, Loader2,
  Eye, MousePointerClick, ScrollText, Clock, Palette,
  Tag, Gift, X, BarChart3,
} from 'lucide-react';

interface FormBuilderProps {
  clientId: string;
}

interface SignupForm {
  id: string;
  name: string;
  form_type: 'popup' | 'slide_in' | 'inline' | 'full_page';
  status: 'draft' | 'active' | 'paused';
  total_views: number;
  total_submissions: number;
  design: FormDesign;
  trigger_rules: FormTriggers;
  incentive_type: 'none' | 'discount_code' | 'free_shipping';
  incentive_value: string;
  tags_to_apply: string[];
  created_at: string;
}

interface FormDesign {
  headline: string;
  description: string;
  button_text: string;
  button_color: string;
  background_color: string;
  text_color: string;
  show_name_field: boolean;
  show_phone_field: boolean;
}

interface FormTriggers {
  exit_intent: boolean;
  scroll_depth: number;
  time_on_page: number;
  page_url_filter: string;
  show_frequency: 'once' | 'session' | 'always';
}

const FORM_TYPES: { value: SignupForm['form_type']; label: string; description: string }[] = [
  { value: 'popup', label: 'Popup', description: 'Ventana centrada en pantalla' },
  { value: 'slide_in', label: 'Slide-in', description: 'Aparece desde una esquina' },
  { value: 'inline', label: 'Inline', description: 'Embebido en la pagina' },
  { value: 'full_page', label: 'Pagina completa', description: 'Cubre toda la pantalla' },
];

const FORM_TYPE_LABELS: Record<string, string> = {
  popup: 'Popup',
  slide_in: 'Slide-in',
  inline: 'Inline',
  full_page: 'Full Page',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-800' },
  active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-800' },
};

const FREQUENCY_OPTIONS = [
  { value: 'once', label: 'Una sola vez' },
  { value: 'session', label: 'Una vez por sesion' },
  { value: 'always', label: 'Siempre' },
];

const INCENTIVE_TYPES = [
  { value: 'none', label: 'Sin incentivo' },
  { value: 'discount_code', label: 'Codigo de descuento' },
  { value: 'free_shipping', label: 'Envio gratis' },
];

const DEFAULT_DESIGN: FormDesign = {
  headline: 'Suscribete a nuestro newsletter',
  description: 'Recibe ofertas exclusivas y novedades directo en tu email.',
  button_text: 'Suscribirme',
  button_color: '#7c3aed',
  background_color: '#ffffff',
  text_color: '#1f2937',
  show_name_field: false,
  show_phone_field: false,
};

const DEFAULT_TRIGGERS: FormTriggers = {
  exit_intent: true,
  scroll_depth: 0,
  time_on_page: 5,
  page_url_filter: '',
  show_frequency: 'once',
};

export function FormBuilder({ clientId }: FormBuilderProps) {
  const [forms, setForms] = useState<SignupForm[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor dialog
  const [showEditor, setShowEditor] = useState(false);
  const [editingForm, setEditingForm] = useState<Partial<SignupForm> | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('email-signup-forms', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setForms(data?.forms || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadForms(); }, [loadForms]);

  const openEditor = (form?: SignupForm) => {
    if (form) {
      setEditingForm({ ...form });
    } else {
      setEditingForm({
        name: '',
        form_type: 'popup',
        design: { ...DEFAULT_DESIGN },
        trigger_rules: { ...DEFAULT_TRIGGERS },
        incentive_type: 'none',
        incentive_value: '',
        tags_to_apply: [],
      });
    }
    setTagInput('');
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!editingForm?.name) {
      toast.error('El nombre es requerido');
      return;
    }

    setSaving(true);
    try {
      const action = editingForm.id ? 'update' : 'create';
      const { error } = await callApi('email-signup-forms', {
        body: {
          action,
          client_id: clientId,
          form_id: editingForm.id,
          name: editingForm.name,
          form_type: editingForm.form_type,
          design: editingForm.design,
          trigger_rules: editingForm.trigger_rules,
          incentive_type: editingForm.incentive_type || 'none',
          incentive_value: editingForm.incentive_value || '',
          tags_to_apply: editingForm.tags_to_apply || [],
        },
      });

      if (error) { toast.error(error); return; }
      toast.success(action === 'create' ? 'Formulario creado' : 'Formulario actualizado');
      setShowEditor(false);
      setEditingForm(null);
      loadForms();
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (formId: string) => {
    const { error } = await callApi('email-signup-forms', {
      body: { action: 'activate', client_id: clientId, form_id: formId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Formulario activado (ScriptTag instalado en Shopify)');
    loadForms();
  };

  const handlePause = async (formId: string) => {
    const { error } = await callApi('email-signup-forms', {
      body: { action: 'pause', client_id: clientId, form_id: formId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Formulario pausado (ScriptTag removido)');
    loadForms();
  };

  const handleDelete = async (formId: string) => {
    const { error } = await callApi('email-signup-forms', {
      body: { action: 'delete', client_id: clientId, form_id: formId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Formulario eliminado');
    loadForms();
  };

  const updateDesign = (updates: Partial<FormDesign>) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      design: { ...(editingForm.design || DEFAULT_DESIGN), ...updates },
    });
  };

  const updateTriggers = (updates: Partial<FormTriggers>) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      trigger_rules: { ...(editingForm.trigger_rules || DEFAULT_TRIGGERS), ...updates },
    });
  };

  const updateIncentive = (field: 'incentive_type' | 'incentive_value', value: string) => {
    if (!editingForm) return;
    setEditingForm({ ...editingForm, [field]: value });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || !editingForm) return;
    const existing = editingForm.tags_to_apply || [];
    if (existing.includes(tag)) {
      toast.error('El tag ya existe');
      return;
    }
    setEditingForm({ ...editingForm, tags_to_apply: [...existing, tag] });
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    if (!editingForm) return;
    setEditingForm({
      ...editingForm,
      tags_to_apply: (editingForm.tags_to_apply || []).filter(t => t !== tag),
    });
  };

  const conversionRate = (views: number, submissions: number): string => {
    if (!views || views === 0) return '0%';
    return ((submissions / views) * 100).toFixed(1) + '%';
  };

  // =============== MAIN VIEW ===============
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Formularios de Registro</h3>
          <p className="text-sm text-muted-foreground">Captura suscriptores con popups y formularios en tu tienda</p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus className="w-4 h-4 mr-1.5" /> Nuevo Formulario
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No hay formularios. Crea tu primer formulario de registro.</p>
            <Button className="mt-4" onClick={() => openEditor()}>
              <Plus className="w-4 h-4 mr-1.5" /> Crear Formulario
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <Card key={form.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-4.5 h-4.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="font-medium truncate">{form.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {FORM_TYPE_LABELS[form.form_type] || form.form_type}
                        </Badge>
                        <Badge className={STATUS_CONFIG[form.status]?.color || 'bg-gray-100'}>
                          {STATUS_CONFIG[form.status]?.label || form.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {form.total_views || 0} vistas
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="w-3 h-3" /> {form.total_submissions || 0} registros
                        </span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" /> {conversionRate(form.total_views, form.total_submissions)} conversion
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="outline" size="sm" onClick={() => openEditor(form)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    {form.status === 'draft' || form.status === 'paused' ? (
                      <Button size="sm" onClick={() => handleActivate(form.id)}>
                        <Play className="w-4 h-4 mr-1" /> Activar
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handlePause(form.id)}>
                        <Pause className="w-4 h-4 mr-1" /> Pausar
                      </Button>
                    )}
                    {form.status !== 'active' && (
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(form.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Form Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingForm?.id ? 'Editar Formulario' : 'Nuevo Formulario'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Name + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={editingForm?.name || ''}
                  onChange={(e) => setEditingForm(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  placeholder="Ej: Popup de bienvenida"
                />
              </div>
              <div>
                <Label>Tipo de formulario</Label>
                <Select
                  value={editingForm?.form_type || 'popup'}
                  onValueChange={(v) => setEditingForm(prev =>
                    prev ? { ...prev, form_type: v as SignupForm['form_type'] } : prev
                  )}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORM_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <span>{t.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">- {t.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tabs for design, triggers, incentive, tags */}
            <Tabs defaultValue="design" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="design" className="text-xs">
                  <Palette className="w-3.5 h-3.5 mr-1.5" /> Diseno
                </TabsTrigger>
                <TabsTrigger value="triggers" className="text-xs">
                  <MousePointerClick className="w-3.5 h-3.5 mr-1.5" /> Triggers
                </TabsTrigger>
                <TabsTrigger value="incentive" className="text-xs">
                  <Gift className="w-3.5 h-3.5 mr-1.5" /> Incentivo
                </TabsTrigger>
                <TabsTrigger value="tags" className="text-xs">
                  <Tag className="w-3.5 h-3.5 mr-1.5" /> Tags
                </TabsTrigger>
              </TabsList>

              {/* Tab: Diseno */}
              <TabsContent value="design" className="space-y-4 mt-4">
                <div>
                  <Label>Titular</Label>
                  <Input
                    value={editingForm?.design?.headline || ''}
                    onChange={(e) => updateDesign({ headline: e.target.value })}
                    placeholder="Suscribete a nuestro newsletter"
                  />
                </div>
                <div>
                  <Label>Descripcion</Label>
                  <Input
                    value={editingForm?.design?.description || ''}
                    onChange={(e) => updateDesign({ description: e.target.value })}
                    placeholder="Recibe ofertas exclusivas..."
                  />
                </div>
                <div>
                  <Label>Texto del boton</Label>
                  <Input
                    value={editingForm?.design?.button_text || ''}
                    onChange={(e) => updateDesign({ button_text: e.target.value })}
                    placeholder="Suscribirme"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Color del boton</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={editingForm?.design?.button_color || '#7c3aed'}
                        onChange={(e) => updateDesign({ button_color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border"
                      />
                      <Input
                        value={editingForm?.design?.button_color || '#7c3aed'}
                        onChange={(e) => updateDesign({ button_color: e.target.value })}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Color de fondo</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={editingForm?.design?.background_color || '#ffffff'}
                        onChange={(e) => updateDesign({ background_color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border"
                      />
                      <Input
                        value={editingForm?.design?.background_color || '#ffffff'}
                        onChange={(e) => updateDesign({ background_color: e.target.value })}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Color de texto</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={editingForm?.design?.text_color || '#1f2937'}
                        onChange={(e) => updateDesign({ text_color: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border"
                      />
                      <Input
                        value={editingForm?.design?.text_color || '#1f2937'}
                        onChange={(e) => updateDesign({ text_color: e.target.value })}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Mostrar campo de nombre</Label>
                      <p className="text-xs text-muted-foreground">Pedir nombre ademas del email</p>
                    </div>
                    <Switch
                      checked={editingForm?.design?.show_name_field ?? false}
                      onCheckedChange={(v) => updateDesign({ show_name_field: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Mostrar campo de telefono</Label>
                      <p className="text-xs text-muted-foreground">Pedir telefono para SMS marketing</p>
                    </div>
                    <Switch
                      checked={editingForm?.design?.show_phone_field ?? false}
                      onCheckedChange={(v) => updateDesign({ show_phone_field: v })}
                    />
                  </div>
                </div>

                {/* Live preview */}
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="py-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Vista previa</p>
                    <div
                      className="rounded-lg p-6 text-center max-w-sm mx-auto shadow-sm border"
                      style={{
                        backgroundColor: editingForm?.design?.background_color || '#ffffff',
                        color: editingForm?.design?.text_color || '#1f2937',
                      }}
                    >
                      <h4 className="text-lg font-bold mb-1">
                        {editingForm?.design?.headline || 'Titular'}
                      </h4>
                      <p className="text-sm mb-4 opacity-80">
                        {editingForm?.design?.description || 'Descripcion'}
                      </p>
                      {editingForm?.design?.show_name_field && (
                        <div className="mb-2 rounded border px-3 py-2 text-left text-xs text-gray-400 bg-white">
                          Nombre
                        </div>
                      )}
                      <div className="mb-2 rounded border px-3 py-2 text-left text-xs text-gray-400 bg-white">
                        Email
                      </div>
                      {editingForm?.design?.show_phone_field && (
                        <div className="mb-2 rounded border px-3 py-2 text-left text-xs text-gray-400 bg-white">
                          Telefono
                        </div>
                      )}
                      <button
                        className="w-full rounded-md py-2 text-sm font-semibold text-white mt-1"
                        style={{ backgroundColor: editingForm?.design?.button_color || '#7c3aed' }}
                        type="button"
                        disabled
                      >
                        {editingForm?.design?.button_text || 'Suscribirme'}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab: Triggers */}
              <TabsContent value="triggers" className="space-y-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Exit Intent</Label>
                    <p className="text-xs text-muted-foreground">Mostrar cuando el usuario intenta salir de la pagina</p>
                  </div>
                  <Switch
                    checked={editingForm?.trigger_rules?.exit_intent ?? true}
                    onCheckedChange={(v) => updateTriggers({ exit_intent: v })}
                  />
                </div>

                <div>
                  <Label className="text-sm flex items-center gap-1.5">
                    <ScrollText className="w-3.5 h-3.5" /> Profundidad de scroll (%)
                  </Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Mostrar cuando el usuario ha scrolleado este porcentaje. 0 = desactivado.
                  </p>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={editingForm?.trigger_rules?.scroll_depth ?? 0}
                    onChange={(e) => updateTriggers({ scroll_depth: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label className="text-sm flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Tiempo en pagina (segundos)
                  </Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Mostrar despues de este tiempo en la pagina. 0 = inmediato.
                  </p>
                  <Input
                    type="number"
                    min="0"
                    value={editingForm?.trigger_rules?.time_on_page ?? 5}
                    onChange={(e) => updateTriggers({ time_on_page: Number(e.target.value) })}
                    placeholder="5"
                  />
                </div>

                <div>
                  <Label className="text-sm">Filtro de URL de pagina</Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Solo mostrar en paginas que contengan esta URL. Vacio = todas las paginas.
                  </p>
                  <Input
                    value={editingForm?.trigger_rules?.page_url_filter || ''}
                    onChange={(e) => updateTriggers({ page_url_filter: e.target.value })}
                    placeholder="Ej: /collections/ o /products/"
                  />
                </div>

                <div>
                  <Label className="text-sm">Frecuencia de muestra</Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Con que frecuencia mostrar el formulario al mismo visitante.
                  </p>
                  <Select
                    value={editingForm?.trigger_rules?.show_frequency || 'once'}
                    onValueChange={(v) => updateTriggers({ show_frequency: v as FormTriggers['show_frequency'] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              {/* Tab: Incentivo */}
              <TabsContent value="incentive" className="space-y-4 mt-4">
                <div>
                  <Label className="text-sm">Tipo de incentivo</Label>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    Ofrece algo a cambio del registro para aumentar la conversion.
                  </p>
                  <Select
                    value={editingForm?.incentive_type || 'none'}
                    onValueChange={(v) => updateIncentive('incentive_type', v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCENTIVE_TYPES.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {editingForm?.incentive_type && editingForm.incentive_type !== 'none' && (
                  <div>
                    <Label className="text-sm">
                      {editingForm.incentive_type === 'discount_code' ? 'Codigo de descuento' : 'Mensaje de envio gratis'}
                    </Label>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      {editingForm.incentive_type === 'discount_code'
                        ? 'El codigo que recibira el suscriptor (ej: BIENVENIDO10)'
                        : 'El texto que se mostrara (ej: Envio gratis en tu primera compra)'
                      }
                    </p>
                    <Input
                      value={editingForm?.incentive_value || ''}
                      onChange={(e) => updateIncentive('incentive_value', e.target.value)}
                      placeholder={
                        editingForm.incentive_type === 'discount_code'
                          ? 'BIENVENIDO10'
                          : 'Envio gratis en tu primera compra'
                      }
                    />
                  </div>
                )}

                {editingForm?.incentive_type === 'none' && (
                  <Card className="bg-muted/30">
                    <CardContent className="py-4 text-center">
                      <Gift className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Los formularios con incentivo tienen hasta 3x mas conversion.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Tab: Tags */}
              <TabsContent value="tags" className="space-y-4 mt-4">
                <div>
                  <Label className="text-sm">Tags a aplicar al suscribirse</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Estos tags se asignaran automaticamente a cada nuevo suscriptor de este formulario.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="Ej: popup-bienvenida"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    />
                    <Button variant="outline" size="sm" onClick={addTag} disabled={!tagInput.trim()}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {(editingForm?.tags_to_apply || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(editingForm?.tags_to_apply || []).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-sm py-1 px-2.5">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-1.5 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <Card className="bg-muted/30">
                    <CardContent className="py-4 text-center">
                      <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Agrega tags para segmentar a los suscriptores de este formulario.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editingForm?.id ? 'Guardar cambios' : 'Crear formulario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
