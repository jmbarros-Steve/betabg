import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Filter, Eye } from 'lucide-react';

export interface BlockCondition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionalBlockPanelProps {
  conditions: BlockCondition[];
  onChange: (conditions: BlockCondition[]) => void;
}

const CONDITION_FIELDS = [
  { value: 'person.total_orders', label: 'Total de pedidos', type: 'number' },
  { value: 'person.total_spent', label: 'Total gastado', type: 'number' },
  { value: 'person.tags', label: 'Tags del contacto', type: 'text' },
  {
    value: 'person.last_order_at',
    label: 'Fecha último pedido',
    type: 'text',
  },
  {
    value: 'person.custom_fields.*',
    label: 'Campo personalizado',
    type: 'text',
  },
  { value: 'brand.name', label: 'Nombre de la marca', type: 'text' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'es igual a' },
  { value: 'not_equals', label: 'no es igual a' },
  { value: 'greater_than', label: 'mayor que' },
  { value: 'less_than', label: 'menor que' },
  { value: 'contains', label: 'contiene' },
  { value: 'not_contains', label: 'no contiene' },
  { value: 'exists', label: 'existe' },
  { value: 'not_exists', label: 'no existe' },
];

const NO_VALUE_OPERATORS = ['exists', 'not_exists'];

function getFieldType(fieldValue: string): string {
  const field = CONDITION_FIELDS.find((f) => f.value === fieldValue);
  return field?.type || 'text';
}

function getFieldLabel(fieldValue: string): string {
  const field = CONDITION_FIELDS.find((f) => f.value === fieldValue);
  return field?.label || fieldValue;
}

function getOperatorLabel(operatorValue: string): string {
  const op = CONDITION_OPERATORS.find((o) => o.value === operatorValue);
  return op?.label || operatorValue;
}

function buildPreviewText(conditions: BlockCondition[]): string {
  if (conditions.length === 0) {
    return 'Este bloque se mostrará siempre';
  }

  const parts = conditions.map((c) => {
    const fieldLabel = getFieldLabel(c.field);
    const opLabel = getOperatorLabel(c.operator);

    if (NO_VALUE_OPERATORS.includes(c.operator)) {
      return `${fieldLabel} ${opLabel}`;
    }
    return `${fieldLabel} ${opLabel} '${c.value}'`;
  });

  return `Este bloque se mostrará si: ${parts.join(' Y ')}`;
}

/**
 * Serialize conditions to a data-attribute string for embedding in HTML.
 * Uses double quotes for the attribute and HTML-encodes the JSON value
 * to prevent XSS from condition values containing quotes.
 */
export function serializeConditionsToAttr(conditions: BlockCondition[]): string {
  if (conditions.length === 0) return '';
  const json = JSON.stringify(conditions)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `data-steve-condition="${json}"`;
}

export function ConditionalBlockPanel({
  conditions,
  onChange,
}: ConditionalBlockPanelProps) {
  const handleAddCondition = () => {
    onChange([
      ...conditions,
      { field: 'person.total_orders', operator: 'equals', value: '' },
    ]);
  };

  const handleUpdateCondition = (
    index: number,
    updates: Partial<BlockCondition>
  ) => {
    const updated = conditions.map((c, i) => {
      if (i !== index) return c;
      const merged = { ...c, ...updates };
      // Clear value when switching to an operator that doesn't need one
      if (updates.operator && NO_VALUE_OPERATORS.includes(updates.operator)) {
        merged.value = '';
      }
      return merged;
    });
    onChange(updated);
  };

  const handleRemoveCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const previewText = buildPreviewText(conditions);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">
          Condiciones de visibilidad
        </Label>
      </div>

      {/* Condition rows */}
      {conditions.length > 0 && (
        <div className="space-y-3">
          {conditions.map((condition, index) => {
            const fieldType = getFieldType(condition.field);
            const needsValue = !NO_VALUE_OPERATORS.includes(
              condition.operator
            );

            return (
              <Card key={index}>
                <CardContent className="p-3 space-y-2">
                  {index > 0 && (
                    <div className="flex items-center gap-2 pb-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground uppercase">
                        Y
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      {/* Field selector */}
                      <Select
                        value={condition.field}
                        onValueChange={(val) =>
                          handleUpdateCondition(index, { field: val })
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Campo" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_FIELDS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Operator selector */}
                      <Select
                        value={condition.operator}
                        onValueChange={(val) =>
                          handleUpdateCondition(index, { operator: val })
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Operador" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Value input */}
                      {needsValue && (
                        <Input
                          type={fieldType === 'number' ? 'number' : 'text'}
                          placeholder="Valor"
                          value={condition.value}
                          onChange={(e) =>
                            handleUpdateCondition(index, {
                              value: e.target.value,
                            })
                          }
                          className="h-9 text-xs"
                        />
                      )}
                    </div>

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveCondition(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add condition button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleAddCondition}
      >
        <Plus className="h-4 w-4 mr-2" />
        Agregar condición
      </Button>

      {/* Preview text */}
      <div className="flex items-start gap-2 rounded-md bg-muted/50 border p-3">
        <Eye className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {previewText}
        </p>
      </div>
    </div>
  );
}
