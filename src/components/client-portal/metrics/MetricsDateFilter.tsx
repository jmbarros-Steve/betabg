import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';

export type DateRange = '7d' | '30d' | '90d' | 'mtd' | 'ytd';

interface MetricsDateFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function MetricsDateFilter({ value, onChange }: MetricsDateFilterProps) {
  const options: { value: DateRange; label: string }[] = [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
    { value: 'mtd', label: 'Mes actual' },
    { value: 'ytd', label: 'Año actual' },
  ];

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {options.map((opt) => (
          <Button
            key={opt.value}
            variant={value === opt.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange(opt.value)}
            className="text-xs h-7 px-3"
          >
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
