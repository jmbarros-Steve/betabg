import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Filter, Plus, Trash2, Loader2, Users, Search } from 'lucide-react';

interface SegmentBuilderProps {
  clientId: string;
  onApply?: (filters: SegmentFilter[], count: number) => void;
  compact?: boolean;
}

interface SegmentFilter {
  field: string;
  operator: string;
  value: string;
}

const FIELD_OPTIONS = [
  { value: 'status', label: 'Estado', type: 'select', options: ['subscribed', 'unsubscribed', 'bounced', 'complained'] },
  { value: 'source', label: 'Fuente', type: 'select', options: ['shopify_customer', 'shopify_order', 'shopify_abandoned', 'manual', 'form'] },
  { value: 'total_orders', label: 'Total de pedidos', type: 'number' },
  { value: 'total_spent', label: 'Total gastado ($)', type: 'number' },
  { value: 'created_at', label: 'Fecha de registro', type: 'date' },
  { value: 'last_order_at', label: 'Última compra', type: 'date' },
  { value: 'tags', label: 'Tags', type: 'text' },
  { value: 'first_name', label: 'Nombre', type: 'text' },
  { value: 'email', label: 'Email', type: 'text' },
];

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: 'eq', label: 'es igual a' },
    { value: 'neq', label: 'no es igual a' },
    { value: 'like', label: 'contiene' },
  ],
  number: [
    { value: 'eq', label: 'es igual a' },
    { value: 'gt', label: 'mayor que' },
    { value: 'gte', label: 'mayor o igual' },
    { value: 'lt', label: 'menor que' },
    { value: 'lte', label: 'menor o igual' },
  ],
  date: [
    { value: 'gt', label: 'después de' },
    { value: 'lt', label: 'antes de' },
    { value: 'gte', label: 'desde' },
    { value: 'lte', label: 'hasta' },
    { value: 'is_null', label: 'nunca' },
    { value: 'not_null', label: 'alguna vez' },
  ],
  select: [
    { value: 'eq', label: 'es' },
    { value: 'neq', label: 'no es' },
  ],
};

export function SegmentBuilder({ clientId, onApply, compact }: SegmentBuilderProps) {
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const getFieldConfig = (field: string) => FIELD_OPTIONS.find(f => f.value === field);

  const addFilter = () => {
    setFilters([...filters, { field: 'status', operator: 'eq', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<SegmentFilter>) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], ...updates };
    // Reset operator/value when field changes
    if (updates.field) {
      const config = getFieldConfig(updates.field);
      const ops = OPERATORS[config?.type || 'text'];
      updated[index].operator = ops[0].value;
      updated[index].value = '';
    }
    setFilters(updated);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
    setMatchCount(null);
  };

  const countMatches = useCallback(async () => {
    setCounting(true);
    try {
      const { data, error } = await callApi<any>('query-email-subscribers', {
        body: {
          action: 'segment',
          client_id: clientId,
          filters: filters.map(f => ({
            field: f.field,
            operator: f.operator,
            value: f.value,
          })),
          count_only: true,
        },
      });
      if (error) { toast.error(error); return; }
      setMatchCount(data?.total || 0);
    } finally {
      setCounting(false);
    }
  }, [clientId, filters]);

  const handleApply = () => {
    if (onApply && matchCount !== null) {
      onApply(filters, matchCount);
    }
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros de audiencia</span>
          </div>
          <Button variant="ghost" size="sm" onClick={addFilter}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Filtro
          </Button>
        </div>

        {filters.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin filtros = todos los contactos suscritos</p>
        ) : (
          <div className="space-y-2">
            {filters.map((filter, index) => {
              const fieldConfig = getFieldConfig(filter.field);
              const operators = OPERATORS[fieldConfig?.type || 'text'];
              return (
                <div key={index} className="flex items-center gap-2">
                  <Select value={filter.field} onValueChange={(v) => updateFilter(index, { field: v })}>
                    <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filter.operator} onValueChange={(v) => updateFilter(index, { operator: v })}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {operators.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!['is_null', 'not_null'].includes(filter.operator) && (
                    fieldConfig?.type === 'select' && fieldConfig.options ? (
                      <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {fieldConfig.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 text-xs flex-1"
                        type={fieldConfig?.type === 'number' ? 'number' : fieldConfig?.type === 'date' ? 'date' : 'text'}
                        value={filter.value}
                        onChange={(e) => updateFilter(index, { value: e.target.value })}
                        placeholder="Valor..."
                      />
                    )
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeFilter(index)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {filters.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={countMatches} disabled={counting}>
              {counting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
              Contar
            </Button>
            {matchCount !== null && (
              <Badge variant="outline">
                <Users className="w-3 h-3 mr-1" /> {matchCount} contactos
              </Badge>
            )}
            {onApply && matchCount !== null && (
              <Button size="sm" onClick={handleApply}>Aplicar</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Segmentación</h3>
          <p className="text-sm text-muted-foreground">Crea segmentos de audiencia para tus campañas</p>
        </div>
        <Button onClick={addFilter}>
          <Plus className="w-4 h-4 mr-1.5" /> Agregar Filtro
        </Button>
      </div>

      {filters.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Filter className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Agrega filtros para crear un segmento de audiencia</p>
            <Button className="mt-4" onClick={addFilter}>
              <Plus className="w-4 h-4 mr-1.5" /> Agregar Filtro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 space-y-3">
            {filters.map((filter, index) => {
              const fieldConfig = getFieldConfig(filter.field);
              const operators = OPERATORS[fieldConfig?.type || 'text'];
              return (
                <div key={index} className="flex items-center gap-3">
                  {index > 0 && (
                    <Badge variant="outline" className="shrink-0">Y</Badge>
                  )}
                  <Select value={filter.field} onValueChange={(v) => updateFilter(index, { field: v })}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filter.operator} onValueChange={(v) => updateFilter(index, { operator: v })}>
                    <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {operators.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!['is_null', 'not_null'].includes(filter.operator) && (
                    fieldConfig?.type === 'select' && fieldConfig.options ? (
                      <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {fieldConfig.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="flex-1"
                        type={fieldConfig?.type === 'number' ? 'number' : fieldConfig?.type === 'date' ? 'date' : 'text'}
                        value={filter.value}
                        onChange={(e) => updateFilter(index, { value: e.target.value })}
                        placeholder="Valor..."
                      />
                    )
                  )}
                  <Button variant="ghost" size="sm" onClick={() => removeFilter(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}

            <div className="flex items-center gap-3 pt-3 border-t">
              <Button variant="outline" onClick={countMatches} disabled={counting}>
                {counting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
                Contar contactos
              </Button>
              {matchCount !== null && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{matchCount}</span>
                  <span className="text-sm text-muted-foreground">contactos coinciden</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
