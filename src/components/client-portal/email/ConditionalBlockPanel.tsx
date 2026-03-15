import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Eye } from 'lucide-react';

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

// Helper to check if a specific condition exists in the array
function hasCondition(conditions: BlockCondition[], field: string, operator: string, value?: string): boolean {
  return conditions.some(
    (c) => c.field === field && c.operator === operator && (value === undefined || c.value === value)
  );
}

// Helper to find a condition's value
function getConditionValue(conditions: BlockCondition[], field: string, operator: string): string {
  const found = conditions.find((c) => c.field === field && c.operator === operator);
  return found?.value || '';
}

// Build a user-friendly preview in Spanish
function buildPreviewText(
  hasBought: boolean,
  isNew: boolean,
  spentMore: string,
  tag: string
): string {
  const parts: string[] = [];
  if (hasBought) parts.push('han comprado antes');
  if (isNew) parts.push('son clientes nuevos');
  if (spentMore) parts.push(`han gastado mas de $${spentMore}`);
  if (tag) parts.push(`tienen la etiqueta '${tag}'`);

  if (parts.length === 0) return 'Este bloque se mostrara siempre.';
  return `Este bloque se muestra a clientes que ${parts.join(' y ')}.`;
}

export function ConditionalBlockPanel({
  conditions,
  onChange,
}: ConditionalBlockPanelProps) {
  // Derive toggle states from conditions
  const hasBought = hasCondition(conditions, 'person.total_orders', 'greater_than', '0');
  const isNew = hasCondition(conditions, 'person.total_orders', 'equals', '0');
  const spentMore = getConditionValue(conditions, 'person.total_spent', 'greater_than');
  const tag = getConditionValue(conditions, 'person.tags', 'contains');

  // Rebuild conditions array from simplified form state
  const rebuildConditions = (
    newHasBought: boolean,
    newIsNew: boolean,
    newSpentMore: string,
    newTag: string
  ) => {
    const result: BlockCondition[] = [];
    if (newHasBought) {
      result.push({ field: 'person.total_orders', operator: 'greater_than', value: '0' });
    }
    if (newIsNew) {
      result.push({ field: 'person.total_orders', operator: 'equals', value: '0' });
    }
    if (newSpentMore) {
      result.push({ field: 'person.total_spent', operator: 'greater_than', value: newSpentMore });
    }
    if (newTag) {
      result.push({ field: 'person.tags', operator: 'contains', value: newTag });
    }
    onChange(result);
  };

  const previewText = buildPreviewText(hasBought, isNew, spentMore, tag);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Label className="text-sm font-semibold">Mostrar este bloque si...</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Elige que clientes veran este contenido en el email.
        </p>
      </div>

      {/* Simple form */}
      <div className="space-y-4">
        {/* Toggle: Ha comprado antes */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Ha comprado antes</p>
            <p className="text-xs text-muted-foreground">
              Solo clientes con al menos 1 pedido
            </p>
          </div>
          <Switch
            checked={hasBought}
            onCheckedChange={(checked) => {
              // If enabling "ha comprado", disable "es nuevo" (they're mutually exclusive)
              rebuildConditions(checked, checked ? false : isNew, spentMore, tag);
            }}
          />
        </div>

        {/* Toggle: Es cliente nuevo */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Es cliente nuevo</p>
            <p className="text-xs text-muted-foreground">
              Solo clientes sin ningun pedido
            </p>
          </div>
          <Switch
            checked={isNew}
            onCheckedChange={(checked) => {
              // If enabling "es nuevo", disable "ha comprado" (mutually exclusive)
              rebuildConditions(checked ? false : hasBought, checked, spentMore, tag);
            }}
          />
        </div>

        {/* Number input: Ha gastado mas de $X */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Ha gastado mas de</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={spentMore}
              onChange={(e) => rebuildConditions(hasBought, isNew, e.target.value, tag)}
              className="h-9 w-32 text-sm"
            />
          </div>
        </div>

        {/* Text input: Tiene la etiqueta */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Tiene la etiqueta</Label>
          <Input
            placeholder="ej: VIP, mayorista, recurrente"
            value={tag}
            onChange={(e) => rebuildConditions(hasBought, isNew, spentMore, e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </div>

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
