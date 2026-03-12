import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon } from 'lucide-react';
import type { DateRange as DayPickerRange } from 'react-day-picker';

export type DateRange = '7d' | '30d' | '90d' | 'mtd' | 'ytd' | 'custom';

export interface CustomDateRange {
  from: Date;
  to: Date;
}

interface MetricsDateFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  customRange?: CustomDateRange;
  onCustomRangeChange?: (range: CustomDateRange) => void;
}

export function MetricsDateFilter({ value, onChange, customRange, onCustomRangeChange }: MetricsDateFilterProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState<DayPickerRange | undefined>(
    customRange ? { from: customRange.from, to: customRange.to } : undefined
  );

  const presetOptions: { value: DateRange; label: string }[] = [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
    { value: 'mtd', label: 'Mes actual' },
    { value: 'ytd', label: 'Año actual' },
  ];

  const handlePresetClick = (preset: DateRange) => {
    onChange(preset);
  };

  const handleApplyCustomRange = () => {
    if (pickerRange?.from && pickerRange?.to) {
      onCustomRangeChange?.({ from: pickerRange.from, to: pickerRange.to });
      onChange('custom');
      setPopoverOpen(false);
    }
  };

  const formatCustomLabel = () => {
    if (!customRange) return 'Personalizado';
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    return `${fmt(customRange.from)} – ${fmt(customRange.to)}`;
  };

  return (
    <div className="flex items-center gap-2">
      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {presetOptions.map((opt) => (
          <Button
            key={opt.value}
            variant={value === opt.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => handlePresetClick(opt.value)}
            className="text-xs h-7 px-3"
          >
            {opt.label}
          </Button>
        ))}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={value === 'custom' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7 px-3"
            >
              {value === 'custom' ? formatCustomLabel() : 'Personalizado'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="p-3 space-y-3">
              <Calendar
                mode="range"
                selected={pickerRange}
                onSelect={setPickerRange}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                defaultMonth={
                  pickerRange?.from
                    ? new Date(pickerRange.from.getFullYear(), pickerRange.from.getMonth())
                    : new Date(new Date().getFullYear(), new Date().getMonth() - 1)
                }
              />
              <div className="flex items-center justify-between border-t pt-3 px-1">
                <p className="text-xs text-muted-foreground">
                  {pickerRange?.from && pickerRange?.to
                    ? `${pickerRange.from.toLocaleDateString('es-CL')} – ${pickerRange.to.toLocaleDateString('es-CL')}`
                    : 'Selecciona un rango de fechas'}
                </p>
                <Button
                  size="sm"
                  className="text-xs h-7"
                  disabled={!pickerRange?.from || !pickerRange?.to}
                  onClick={handleApplyCustomRange}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
