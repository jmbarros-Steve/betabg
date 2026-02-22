import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

export interface QuestionField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

interface StructuredFieldsFormProps {
  fields: QuestionField[];
  validation?: string;
  onSubmit: (formattedMessage: string) => void;
  isLoading: boolean;
}

export function StructuredFieldsForm({ fields, validation, onSubmit, isLoading }: StructuredFieldsFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
  };

  const getTotal = () => fields
    .filter(f => f.type !== 'select')
    .reduce((acc, f) => acc + (parseFloat(values[f.key] || '0') || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // BUG 3 FIX: For sum_100 forms (channel percentages), empty = 0 is valid.
    // Only enforce "no empty fields" for non-sum forms.
    const emptyFields = validation === 'sum_100'
      ? []
      : fields.filter(f => !values[f.key]?.trim());
    if (emptyFields.length > 0) {
      toast.error(`Faltan campos por completar`);
      return;
    }

    if (validation === 'sum_100') {
      const sum = getTotal();
      if (Math.abs(sum - 100) > 0.01) {
        toast.error(`Los porcentajes suman ${sum}%, deben sumar exactamente 100%.`);
        return;
      }
    }

    const lines = fields.map(f => {
      const val = values[f.key]?.trim() || '';
      const prefix = f.prefix ? `${f.prefix}` : '';
      const suffix = f.suffix ? ` ${f.suffix}` : '';
      return `${f.label}: ${prefix}${val}${suffix}`;
    });

    onSubmit(lines.join('\n'));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-muted/50 rounded-xl p-4 border border-border">
      <div className="grid gap-3">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
            <div className="flex items-center gap-2">
              {field.prefix && (
                <span className="text-sm text-muted-foreground font-semibold min-w-[16px]">{field.prefix}</span>
              )}
              {field.type === 'textarea' ? (
                <Textarea
                  value={values[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="text-sm min-h-[60px] bg-background"
                  disabled={isLoading}
                />
              ) : field.type === 'select' ? (
                <Select
                  value={values[field.key] || ''}
                  onValueChange={(val) => handleChange(field.key, val)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="text-sm bg-background w-full">
                    <SelectValue placeholder={field.placeholder || 'Selecciona una opción'} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="text"
                  inputMode={field.type === 'number' ? 'numeric' : 'text'}
                  value={values[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="text-sm bg-background"
                  disabled={isLoading}
                />
              )}
              {field.suffix && (
                <span className="text-sm text-muted-foreground font-semibold min-w-[16px]">{field.suffix}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {validation === 'sum_100' && (
        <div className={`text-xs text-right font-medium ${Math.abs(getTotal() - 100) < 0.01 ? 'text-green-600' : 'text-destructive'}`}>
          Total: {getTotal()}% {Math.abs(getTotal() - 100) < 0.01 ? '✅' : '❌ (debe sumar 100%)'}
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="w-full">
        <Send className="h-4 w-4 mr-2" />
        Enviar respuesta
      </Button>
    </form>
  );
}
