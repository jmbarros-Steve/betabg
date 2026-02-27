import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const FONT_OPTIONS = [
  // Sans-serif
  { value: 'Inter', label: 'Inter', type: 'sans-serif' },
  { value: 'Poppins', label: 'Poppins', type: 'sans-serif' },
  { value: 'Montserrat', label: 'Montserrat', type: 'sans-serif' },
  { value: 'Open Sans', label: 'Open Sans', type: 'sans-serif' },
  { value: 'Raleway', label: 'Raleway', type: 'sans-serif' },
  { value: 'Lato', label: 'Lato', type: 'sans-serif' },
  { value: 'Nunito', label: 'Nunito', type: 'sans-serif' },
  { value: 'DM Sans', label: 'DM Sans', type: 'sans-serif' },
  { value: 'Work Sans', label: 'Work Sans', type: 'sans-serif' },
  { value: 'Rubik', label: 'Rubik', type: 'sans-serif' },
  // Serif
  { value: 'Playfair Display', label: 'Playfair Display', type: 'serif' },
  { value: 'Merriweather', label: 'Merriweather', type: 'serif' },
  { value: 'Lora', label: 'Lora', type: 'serif' },
  { value: 'Crimson Text', label: 'Crimson Text', type: 'serif' },
  { value: 'Kaisei Tokumin', label: 'Kaisei Tokumin', type: 'serif' },
  // Monospace
  { value: 'JetBrains Mono', label: 'JetBrains Mono', type: 'monospace' },
  { value: 'Fira Code', label: 'Fira Code', type: 'monospace' },
  { value: 'Anonymous Pro', label: 'Anonymous Pro', type: 'monospace' },
  { value: 'Source Code Pro', label: 'Source Code Pro', type: 'monospace' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono', type: 'monospace' },
] as const;

interface FontSelectorProps {
  label: string;
  value: string;
  fontType: string;
  onChange: (font: string, type: string) => void;
}

export function FontSelector({ label, value, onChange }: FontSelectorProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => {
          const opt = FONT_OPTIONS.find(f => f.value === v);
          onChange(v, opt?.type || 'sans-serif');
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue>
            <span style={{ fontFamily: `'${value}', sans-serif` }}>{value}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sans-serif</div>
          {FONT_OPTIONS.filter(f => f.type === 'sans-serif').map(f => (
            <SelectItem key={f.value} value={f.value}>
              <span style={{ fontFamily: `'${f.value}', sans-serif` }}>{f.label}</span>
            </SelectItem>
          ))}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-1">Serif</div>
          {FONT_OPTIONS.filter(f => f.type === 'serif').map(f => (
            <SelectItem key={f.value} value={f.value}>
              <span style={{ fontFamily: `'${f.value}', serif` }}>{f.label}</span>
            </SelectItem>
          ))}
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-1">Monospace</div>
          {FONT_OPTIONS.filter(f => f.type === 'monospace').map(f => (
            <SelectItem key={f.value} value={f.value}>
              <span style={{ fontFamily: `'${f.value}', monospace` }}>{f.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
