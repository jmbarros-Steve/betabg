import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface MLAttribute {
  id: string;
  name: string;
  required: boolean;
  type: string;
  values: { id: string; name: string }[];
  allowedUnits: any;
  tooltip: string | null;
}

interface AttributeValue {
  id: string;
  valueName: string;
}

interface AttributeFormProps {
  categoryId: string | null;
  values: AttributeValue[];
  onChange: (values: AttributeValue[]) => void;
  brand?: string | null;
}

export function AttributeForm({ categoryId, values, onChange, brand }: AttributeFormProps) {
  const [attributes, setAttributes] = useState<MLAttribute[]>([]);
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    if (!categoryId) return;
    loadAttributes();
  }, [categoryId]);

  async function loadAttributes() {
    setLoading(true);
    const { data } = await supabase.functions.invoke('ml-search-categories', {
      body: { categoryId },
    });
    if (data?.attributes) {
      setAttributes(data.attributes);
      // Auto-fill brand if available
      if (brand) {
        const brandAttr = data.attributes.find((a: MLAttribute) => a.id === 'BRAND');
        if (brandAttr && !values.find((v) => v.id === 'BRAND')) {
          onChange([...values, { id: 'BRAND', valueName: brand }]);
        }
      }
    }
    setLoading(false);
  }

  function updateValue(attrId: string, valueName: string) {
    const existing = values.findIndex((v) => v.id === attrId);
    if (existing >= 0) {
      const updated = [...values];
      updated[existing] = { id: attrId, valueName };
      onChange(updated);
    } else {
      onChange([...values, { id: attrId, valueName }]);
    }
  }

  function getValue(attrId: string): string {
    return values.find((v) => v.id === attrId)?.valueName || '';
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando atributos...
      </div>
    );
  }

  if (!categoryId) {
    return <p className="text-sm text-muted-foreground">Selecciona una categoría primero</p>;
  }

  const required = attributes.filter((a) => a.required);
  const optional = attributes.filter((a) => !a.required);

  function renderAttribute(attr: MLAttribute) {
    const hasValues = attr.values && attr.values.length > 0;

    return (
      <div key={attr.id} className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          {attr.name}
          {attr.required && <span className="text-red-500">*</span>}
        </Label>
        {hasValues ? (
          <select
            value={getValue(attr.id)}
            onChange={(e) => updateValue(attr.id, e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Seleccionar...</option>
            {attr.values.map((v) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
        ) : (
          <Input
            value={getValue(attr.id)}
            onChange={(e) => updateValue(attr.id, e.target.value)}
            placeholder={attr.tooltip || `Ingresa ${attr.name.toLowerCase()}`}
            className="text-sm"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {required.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Obligatorios ({required.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {required.map(renderAttribute)}
          </div>
        </div>
      )}

      {optional.length > 0 && (
        <div>
          <button
            onClick={() => setShowOptional(!showOptional)}
            className="text-xs text-primary hover:underline"
          >
            {showOptional ? 'Ocultar' : 'Mostrar'} opcionales ({optional.length})
          </button>
          {showOptional && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {optional.map(renderAttribute)}
            </div>
          )}
        </div>
      )}

      {attributes.length === 0 && (
        <p className="text-sm text-muted-foreground">No se encontraron atributos para esta categoría</p>
      )}
    </div>
  );
}
