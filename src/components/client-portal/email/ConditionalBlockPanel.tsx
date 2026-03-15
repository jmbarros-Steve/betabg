import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Plus, X, Filter, ShoppingCart, MapPin, Tag, User } from 'lucide-react';

export interface BlockCondition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionalBlockPanelProps {
  conditions: BlockCondition[];
  onChange: (conditions: BlockCondition[]) => void;
}

/**
 * Serialize conditions to a data-attribute string for embedding in HTML.
 */
export function serializeConditionsToAttr(conditions: BlockCondition[]): string {
  if (conditions.length === 0) return '';
  const json = JSON.stringify(conditions)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `data-steve-condition="${json}"`;
}

// ─── Condition presets ─────────────────────────────────────────────────────

interface ConditionPreset {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  category: 'segment' | 'purchase' | 'location' | 'custom';
  field: string;
  operator: string;
  defaultValue: string;
  valuePlaceholder?: string;
  valueType: 'none' | 'text' | 'number' | 'select';
  selectOptions?: { value: string; label: string }[];
}

const CONDITION_PRESETS: ConditionPreset[] = [
  // ── Segmento ──
  {
    id: 'has_tag',
    icon: <Tag className="w-4 h-4" />,
    label: 'Tiene la etiqueta',
    description: 'Contactos con una etiqueta específica',
    category: 'segment',
    field: 'person.tags',
    operator: 'contains',
    defaultValue: '',
    valuePlaceholder: 'VIP, mayorista, recurrente',
    valueType: 'text',
  },
  {
    id: 'not_tag',
    icon: <Tag className="w-4 h-4" />,
    label: 'No tiene la etiqueta',
    description: 'Excluir contactos con esta etiqueta',
    category: 'segment',
    field: 'person.tags',
    operator: 'not_contains',
    defaultValue: '',
    valuePlaceholder: 'unsubscribed, inactivo',
    valueType: 'text',
  },
  {
    id: 'subscriber_source',
    icon: <User className="w-4 h-4" />,
    label: 'Fuente de suscripción',
    description: 'Según cómo se registró',
    category: 'segment',
    field: 'person.source',
    operator: 'equals',
    defaultValue: 'shopify_customer',
    valueType: 'select',
    selectOptions: [
      { value: 'shopify_customer', label: 'Cliente Shopify' },
      { value: 'shopify_order', label: 'Compra Shopify' },
      { value: 'form', label: 'Formulario' },
      { value: 'manual', label: 'Importación manual' },
      { value: 'shopify_abandoned', label: 'Carrito abandonado' },
    ],
  },

  // ── Historial de compra ──
  {
    id: 'has_purchased',
    icon: <ShoppingCart className="w-4 h-4" />,
    label: 'Ha comprado antes',
    description: 'Contactos con al menos 1 pedido',
    category: 'purchase',
    field: 'person.total_orders',
    operator: 'greater_than',
    defaultValue: '0',
    valueType: 'none',
  },
  {
    id: 'is_new',
    icon: <ShoppingCart className="w-4 h-4" />,
    label: 'Es cliente nuevo',
    description: 'Sin ningún pedido',
    category: 'purchase',
    field: 'person.total_orders',
    operator: 'equals',
    defaultValue: '0',
    valueType: 'none',
  },
  {
    id: 'spent_more',
    icon: <ShoppingCart className="w-4 h-4" />,
    label: 'Ha gastado más de',
    description: 'Clientes de alto valor',
    category: 'purchase',
    field: 'person.total_spent',
    operator: 'greater_than',
    defaultValue: '',
    valuePlaceholder: '50000',
    valueType: 'number',
  },
  {
    id: 'spent_less',
    icon: <ShoppingCart className="w-4 h-4" />,
    label: 'Ha gastado menos de',
    description: 'Clientes de bajo gasto',
    category: 'purchase',
    field: 'person.total_spent',
    operator: 'less_than',
    defaultValue: '',
    valuePlaceholder: '10000',
    valueType: 'number',
  },
  {
    id: 'orders_more',
    icon: <ShoppingCart className="w-4 h-4" />,
    label: 'Más de N pedidos',
    description: 'Clientes recurrentes',
    category: 'purchase',
    field: 'person.total_orders',
    operator: 'greater_than',
    defaultValue: '',
    valuePlaceholder: '3',
    valueType: 'number',
  },

  // ── Ubicación ──
  {
    id: 'city',
    icon: <MapPin className="w-4 h-4" />,
    label: 'Ciudad',
    description: 'Contactos de una ciudad específica',
    category: 'location',
    field: 'person.custom_fields.city',
    operator: 'equals',
    defaultValue: '',
    valuePlaceholder: 'Santiago, Valparaíso',
    valueType: 'text',
  },
  {
    id: 'region',
    icon: <MapPin className="w-4 h-4" />,
    label: 'Región / Estado',
    description: 'Contactos de una región',
    category: 'location',
    field: 'person.custom_fields.region',
    operator: 'equals',
    defaultValue: '',
    valuePlaceholder: 'Metropolitana',
    valueType: 'text',
  },
  {
    id: 'country',
    icon: <MapPin className="w-4 h-4" />,
    label: 'País',
    description: 'Contactos de un país',
    category: 'location',
    field: 'person.custom_fields.country',
    operator: 'equals',
    defaultValue: '',
    valuePlaceholder: 'Chile, Argentina',
    valueType: 'text',
  },

  // ── Custom property ──
  {
    id: 'custom_equals',
    icon: <Filter className="w-4 h-4" />,
    label: 'Propiedad personalizada es',
    description: 'Campo custom = valor',
    category: 'custom',
    field: '',
    operator: 'equals',
    defaultValue: '',
    valuePlaceholder: 'valor',
    valueType: 'text',
  },
  {
    id: 'custom_contains',
    icon: <Filter className="w-4 h-4" />,
    label: 'Propiedad personalizada contiene',
    description: 'Campo custom contiene valor',
    category: 'custom',
    field: '',
    operator: 'contains',
    defaultValue: '',
    valuePlaceholder: 'valor',
    valueType: 'text',
  },
  {
    id: 'custom_exists',
    icon: <Filter className="w-4 h-4" />,
    label: 'Propiedad personalizada existe',
    description: 'El campo custom tiene algún valor',
    category: 'custom',
    field: '',
    operator: 'exists',
    defaultValue: '',
    valueType: 'none',
  },
];

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  segment: { label: 'Segmento', icon: <Tag className="w-3.5 h-3.5" /> },
  purchase: { label: 'Historial de compra', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  location: { label: 'Ubicación', icon: <MapPin className="w-3.5 h-3.5" /> },
  custom: { label: 'Propiedad personalizada', icon: <Filter className="w-3.5 h-3.5" /> },
};

// ─── Active condition row ──────────────────────────────────────────────────

interface ActiveCondition {
  presetId: string;
  field: string;
  operator: string;
  value: string;
  customFieldName?: string;
}

function conditionToBlockCondition(ac: ActiveCondition): BlockCondition {
  const field = ac.customFieldName
    ? `person.custom_fields.${ac.customFieldName}`
    : ac.field;
  return { field, operator: ac.operator, value: ac.value };
}

function blockConditionToActive(bc: BlockCondition): ActiveCondition | null {
  // Try to match against presets
  for (const preset of CONDITION_PRESETS) {
    if (preset.id.startsWith('custom_')) continue;
    if (preset.field === bc.field && preset.operator === bc.operator) {
      return { presetId: preset.id, field: bc.field, operator: bc.operator, value: bc.value };
    }
  }
  // Check if it's a custom_fields condition
  if (bc.field.startsWith('person.custom_fields.')) {
    const customFieldName = bc.field.replace('person.custom_fields.', '');
    const presetId = bc.operator === 'exists' ? 'custom_exists'
      : bc.operator === 'contains' ? 'custom_contains'
      : 'custom_equals';
    return { presetId, field: bc.field, operator: bc.operator, value: bc.value, customFieldName };
  }
  // Fallback: generic custom
  return { presetId: 'custom_equals', field: bc.field, operator: bc.operator, value: bc.value };
}

function buildPreviewText(conditions: BlockCondition[]): string {
  if (conditions.length === 0) return 'Este bloque se mostrará siempre a todos los contactos.';

  const parts: string[] = [];
  for (const c of conditions) {
    if (c.field === 'person.total_orders' && c.operator === 'greater_than' && c.value === '0') {
      parts.push('han comprado antes');
    } else if (c.field === 'person.total_orders' && c.operator === 'equals' && c.value === '0') {
      parts.push('son clientes nuevos');
    } else if (c.field === 'person.total_orders' && c.operator === 'greater_than') {
      parts.push(`tienen más de ${c.value} pedidos`);
    } else if (c.field === 'person.total_spent' && c.operator === 'greater_than') {
      parts.push(`han gastado más de $${c.value}`);
    } else if (c.field === 'person.total_spent' && c.operator === 'less_than') {
      parts.push(`han gastado menos de $${c.value}`);
    } else if (c.field === 'person.tags' && c.operator === 'contains') {
      parts.push(`tienen la etiqueta "${c.value}"`);
    } else if (c.field === 'person.tags' && c.operator === 'not_contains') {
      parts.push(`no tienen la etiqueta "${c.value}"`);
    } else if (c.field === 'person.source' && c.operator === 'equals') {
      parts.push(`vienen de "${c.value}"`);
    } else if (c.field.startsWith('person.custom_fields.')) {
      const fname = c.field.replace('person.custom_fields.', '');
      if (c.operator === 'exists') {
        parts.push(`tienen "${fname}" definido`);
      } else {
        parts.push(`"${fname}" ${c.operator === 'contains' ? 'contiene' : 'es'} "${c.value}"`);
      }
    } else {
      parts.push(`${c.field} ${c.operator} ${c.value}`);
    }
  }

  return `Solo se muestra a contactos que ${parts.join(' y ')}.`;
}

// ─── Main component ────────────────────────────────────────────────────────

export function ConditionalBlockPanel({
  conditions,
  onChange,
}: ConditionalBlockPanelProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Convert existing conditions to active conditions
  const activeConditions: ActiveCondition[] = conditions
    .map(blockConditionToActive)
    .filter(Boolean) as ActiveCondition[];

  const updateCondition = (index: number, updates: Partial<ActiveCondition>) => {
    const updated = [...activeConditions];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated.map(conditionToBlockCondition));
  };

  const removeCondition = (index: number) => {
    const updated = [...activeConditions];
    updated.splice(index, 1);
    onChange(updated.map(conditionToBlockCondition));
  };

  const addConditionFromPreset = (preset: ConditionPreset) => {
    const newCondition: ActiveCondition = {
      presetId: preset.id,
      field: preset.field,
      operator: preset.operator,
      value: preset.defaultValue,
    };
    const updated = [...activeConditions, newCondition];
    onChange(updated.map(conditionToBlockCondition));
    setShowAddMenu(false);
    setCategoryFilter(null);
  };

  const previewText = buildPreviewText(conditions);

  const filteredPresets = categoryFilter
    ? CONDITION_PRESETS.filter(p => p.category === categoryFilter)
    : CONDITION_PRESETS;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <Eye className="w-4 h-4" /> Mostrar solo si...
        </Label>
        <p className="text-xs text-muted-foreground mt-1">
          Define condiciones para mostrar u ocultar este bloque según datos del contacto.
        </p>
      </div>

      {/* Active conditions */}
      {activeConditions.length > 0 && (
        <div className="space-y-2">
          {activeConditions.map((ac, idx) => {
            const preset = CONDITION_PRESETS.find(p => p.id === ac.presetId);
            const isCustom = ac.presetId.startsWith('custom_');

            return (
              <div key={idx} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {preset?.icon}
                      <span className="ml-1">{preset?.label || ac.presetId}</span>
                    </Badge>
                  </div>
                  <button
                    onClick={() => removeCondition(idx)}
                    className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Custom field name input */}
                {isCustom && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Nombre del campo</Label>
                    <Input
                      placeholder="ej: plan, tier, referral_source"
                      value={ac.customFieldName || ''}
                      onChange={(e) => updateCondition(idx, { customFieldName: e.target.value })}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                )}

                {/* Value input based on type */}
                {preset?.valueType === 'text' && (
                  <Input
                    placeholder={preset.valuePlaceholder}
                    value={ac.value}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                    className="h-8 text-sm"
                  />
                )}
                {preset?.valueType === 'number' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      placeholder={preset.valuePlaceholder}
                      value={ac.value}
                      onChange={(e) => updateCondition(idx, { value: e.target.value })}
                      className="h-8 text-sm w-32"
                    />
                  </div>
                )}
                {preset?.valueType === 'select' && preset.selectOptions && (
                  <Select
                    value={ac.value}
                    onValueChange={(v) => updateCondition(idx, { value: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {preset.selectOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add condition button / menu */}
      {!showAddMenu ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAddMenu(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Agregar condición
        </Button>
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between p-2 border-b">
            <span className="text-xs font-medium">Elegir condición</span>
            <button
              onClick={() => { setShowAddMenu(false); setCategoryFilter(null); }}
              className="p-1 rounded hover:bg-muted"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Category pills */}
          <div className="flex gap-1 p-2 flex-wrap">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`px-2 py-1 rounded-full text-xs transition-colors ${
                !categoryFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Todas
            </button>
            {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 transition-colors ${
                  categoryFilter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Presets list */}
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredPresets.map(preset => (
              <button
                key={preset.id}
                onClick={() => addConditionFromPreset(preset)}
                className="w-full text-left p-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {preset.icon}
                  <div>
                    <p className="text-sm font-medium">{preset.label}</p>
                    <p className="text-xs text-muted-foreground">{preset.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="flex items-start gap-2 rounded-md bg-muted/50 border p-3">
        <Eye className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {previewText}
        </p>
      </div>
    </div>
  );
}
