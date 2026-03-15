import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  FileText, Plus, Edit, Trash2, Play, Pause, Loader2,
  Eye, MousePointerClick, Clock, Tag, Gift, X, BarChart3,
  ChevronDown, ChevronUp, Layers, SlidersHorizontal,
  PanelTop, PanelRight, Minus, Maximize,
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

const FORM_TYPE_LABELS: Record<string, string> = {
  popup: 'Popup',
  slide_in: 'Slide-in',
  inline: 'Barra',
  full_page: 'Pagina completa',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Inactivo', color: 'bg-gray-100 text-gray-800' },
  active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
  paused: { label: 'Inactivo', color: 'bg-yellow-100 text-yellow-800' },
};

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

const FORM_TYPE_CARDS: { value: SignupForm['form_type']; label: string; description: string; Icon: typeof PanelTop }[] = [
  { value: 'popup', label: 'Popup', description: 'Ventana centrada en pantalla', Icon: Layers },
  { value: 'slide_in', label: 'Slide-in', description: 'Aparece desde una esquina', Icon: PanelRight },
  { value: 'inline', label: 'Barra', description: 'Embebido en la pagina', Icon: Minus },
  { value: 'full_page', label: 'Pagina completa', description: 'Cubre toda la pantalla', Icon: Maximize },
];

export function FormBuilder({ clientId }: FormBuilderProps) {
  const [forms, setForms] = useState<SignupForm[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor dialog
  const [showEditor, setShowEditor] = useState(false);
  const [editingForm, setEditingForm] = useState<Partial<SignupForm> | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

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
    setOptionsOpen(false);
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
    toast.success('Formulario activado - se instalara automaticamente en tu tienda');
    loadForms();
  };

  const handlePause = async (formId: string) => {
    const { error } = await callApi('email-signup-forms', {
      body: { action: 'pause', client_id: clientId, form_id: formId },
    });
    if (error) { toast.error(error); return; }
    toast.success('Formulario desactivado');
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

  const hasIncentive = editingForm?.incentive_type === 'discount_code' || editingForm?.incentive_type === 'free_shipping';

  // =============== MAIN VIEW ===============
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Formularios de Registro</h3>
          <p className="text-sm text-muted-foreground">Captura suscriptores con popups y formularios en tu tienda</p>
        </div>
        <Button size="lg" onClick={() => openEditor()} className="shadow-sm">
          <Plus className="w-5 h-5 mr-2" /> Nuevo Formulario
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 px-8">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h4 className="font-semibold text-lg mb-2">Empieza a crecer tu lista</h4>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Los formularios capturan emails de visitantes de tu tienda. Crea tu primer formulario para empezar a crecer tu lista.
            </p>
            <Button size="lg" onClick={() => openEditor()} className="shadow-sm">
              <Plus className="w-5 h-5 mr-2" /> Crear Formulario
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => {
            const isActive = form.status === 'active';
            return (
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
                            <MousePointerClick className="w-3 h-3" /> {form.total_submissions || 0} suscripciones
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> {conversionRate(form.total_views, form.total_submissions)} conversion
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="outline" size="sm" onClick={() => openEditor(form)}>
                        <Edit className="w-4 h-4 mr-1" /> Editar
                      </Button>
                      {isActive ? (
                        <Button variant="outline" size="sm" onClick={() => handlePause(form.id)}>
                          <Pause className="w-4 h-4 mr-1" /> Desactivar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleActivate(form.id)}
                          title="Se instalara automaticamente en tu tienda Shopify"
                        >
                          <Play className="w-4 h-4 mr-1" /> Activar
                        </Button>
                      )}
                      {!isActive && (
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(form.id)}>
                          <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* =============== CREATE / EDIT DIALOG =============== */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingForm?.id ? 'Editar Formulario' : 'Nuevo Formulario'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Form name */}
            <div>
              <Label>Nombre del formulario *</Label>
              <Input
                value={editingForm?.name || ''}
                onChange={(e) => setEditingForm(prev => prev ? { ...prev, name: e.target.value } : prev)}
                placeholder="Ej: Popup de bienvenida"
                className="mt-1"
              />
            </div>

            {/* ---- FORM TYPE: Visual cards ---- */}
            <div>
              <Label className="mb-2 block">Tipo de formulario</Label>
              <div className="grid grid-cols-4 gap-3">
                {FORM_TYPE_CARDS.map(({ value, label, description, Icon }) => {
                  const selected = editingForm?.form_type === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditingForm(prev => prev ? { ...prev, form_type: value } : prev)}
                      className={`
                        rounded-lg border-2 p-4 text-center transition-all cursor-pointer
                        ${selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'
                        }
                      `}
                    >
                      <Icon className={`w-8 h-8 mx-auto mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <p className={`text-sm font-medium ${selected ? 'text-primary' : ''}`}>{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ---- DESIGN SECTION ---- */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left: form fields */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4" /> Diseno
                </h4>
                <div>
                  <Label className="text-sm">Titular</Label>
                  <Input
                    value={editingForm?.design?.headline || ''}
                    onChange={(e) => updateDesign({ headline: e.target.value })}
                    placeholder="Suscribete a nuestro newsletter"
                  />
                </div>
                <div>
                  <Label className="text-sm">Descripcion</Label>
                  <Input
                    value={editingForm?.design?.description || ''}
                    onChange={(e) => updateDesign({ description: e.target.value })}
                    placeholder="Recibe ofertas exclusivas..."
                  />
                </div>
                <div>
                  <Label className="text-sm">Texto del boton</Label>
                  <Input
                    value={editingForm?.design?.button_text || ''}
                    onChange={(e) => updateDesign({ button_text: e.target.value })}
                    placeholder="Suscribirme"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                </div>
              </div>

              {/* Right: live preview */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Vista previa</h4>
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="py-4">
                    <div
                      className="rounded-lg p-6 text-center max-w-xs mx-auto shadow-sm border"
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
                      <div className="mb-2 rounded border px-3 py-2 text-left text-xs text-gray-400 bg-white">
                        Email
                      </div>
                      <button
                        className="w-full rounded-md py-2 text-sm font-semibold text-white mt-1"
                        style={{ backgroundColor: editingForm?.design?.button_color || '#7c3aed' }}
                        type="button"
                        disabled
                      >
                        {editingForm?.design?.button_text || 'Suscribirme'}
                      </button>
                      {hasIncentive && editingForm?.incentive_value && (
                        <p className="text-xs mt-3 opacity-70">
                          Recibiras: {editingForm.incentive_value}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ---- OPTIONS ACCORDION ---- */}
            <div className="border rounded-lg">
              <button
                type="button"
                onClick={() => setOptionsOpen(!optionsOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  Opciones avanzadas
                  <span className="text-xs text-muted-foreground font-normal">(descuento, cuando mostrar, tags)</span>
                </span>
                {optionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {optionsOpen && (
                <div className="px-4 pb-4 space-y-6 border-t pt-4">

                  {/* -- Incentive section -- */}
                  <div className="space-y-3">
                    <h5 className="text-sm font-semibold flex items-center gap-1.5">
                      <Gift className="w-4 h-4" /> Descuento
                    </h5>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Ofrecer descuento</Label>
                        <p className="text-xs text-muted-foreground">Los formularios con descuento tienen hasta 3x mas conversion</p>
                      </div>
                      <Switch
                        checked={hasIncentive}
                        onCheckedChange={(checked) => {
                          if (!editingForm) return;
                          setEditingForm({
                            ...editingForm,
                            incentive_type: checked ? 'discount_code' : 'none',
                            incentive_value: checked ? editingForm.incentive_value || '' : '',
                          });
                        }}
                      />
                    </div>
                    {hasIncentive && (
                      <div>
                        <Label className="text-sm">Codigo de descuento</Label>
                        <Input
                          value={editingForm?.incentive_value || ''}
                          onChange={(e) => {
                            if (!editingForm) return;
                            setEditingForm({ ...editingForm, incentive_value: e.target.value });
                          }}
                          placeholder="Ej: BIENVENIDO10"
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">El codigo que recibira el suscriptor despues de registrarse</p>
                      </div>
                    )}
                  </div>

                  {/* -- Triggers section -- */}
                  <div className="space-y-3">
                    <h5 className="text-sm font-semibold flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> Cuando mostrar
                    </h5>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm">Mostrar al intentar salir</Label>
                        <p className="text-xs text-muted-foreground">Aparece cuando el visitante mueve el mouse hacia arriba</p>
                      </div>
                      <Switch
                        checked={editingForm?.trigger_rules?.exit_intent ?? true}
                        onCheckedChange={(v) => updateTriggers({ exit_intent: v })}
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Esperar (segundos)</Label>
                      <p className="text-xs text-muted-foreground mb-1">Cuanto esperar antes de mostrar el formulario</p>
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={editingForm?.trigger_rules?.time_on_page ?? 5}
                        onChange={(e) => updateTriggers({ time_on_page: Number(e.target.value) })}
                        className="w-24"
                      />
                    </div>
                  </div>

                  {/* -- Tags section -- */}
                  <div className="space-y-3">
                    <h5 className="text-sm font-semibold flex items-center gap-1.5">
                      <Tag className="w-4 h-4" /> Etiquetar nuevos suscriptores como...
                    </h5>
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
                    {(editingForm?.tags_to_apply || []).length > 0 && (
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
                    )}
                  </div>
                </div>
              )}
            </div>
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
