import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkupConfig, MarkupType, applyMarkup, formatCLP, calculateMargin } from '@/lib/priceMarkup';

interface PriceMarkupInputProps {
  basePrice: number;
  markup: MarkupConfig;
  onChange: (markup: MarkupConfig) => void;
}

export function PriceMarkupInput({ basePrice, markup, onChange }: PriceMarkupInputProps) {
  const finalPrice = applyMarkup(basePrice, markup);
  const margin = calculateMargin(basePrice, finalPrice);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Precio base (Shopify)</Label>
          <div className="text-lg font-bold text-green-700 mt-1">{formatCLP(basePrice)}</div>
        </div>
        <div>
          <Label className="text-xs">Tipo de markup</Label>
          <select
            value={markup.type}
            onChange={(e) => onChange({ ...markup, type: e.target.value as MarkupType })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
          >
            <option value="percent">Porcentaje (%)</option>
            <option value="fixed">Monto fijo ($)</option>
            <option value="manual">Precio manual</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">
            {markup.type === 'percent' ? 'Porcentaje' : markup.type === 'fixed' ? 'Monto adicional' : 'Precio final'}
          </Label>
          <Input
            type="number"
            value={markup.value}
            onChange={(e) => onChange({ ...markup, value: parseFloat(e.target.value) || 0 })}
            className="mt-1"
            min={0}
          />
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-yellow-700">Precio en MercadoLibre</p>
          <p className="text-xl font-bold text-yellow-800">{formatCLP(finalPrice)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-yellow-700">Margen</p>
          <p className={`text-lg font-bold ${margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {margin}%
          </p>
        </div>
      </div>
    </div>
  );
}
