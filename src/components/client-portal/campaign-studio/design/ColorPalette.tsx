import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ColorField {
  key: string;
  label: string;
  value: string;
}

interface ColorPaletteProps {
  colors: ColorField[];
  onChange: (key: string, value: string) => void;
}

export function ColorPalette({ colors, onChange }: ColorPaletteProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {colors.map((c) => (
        <div key={c.key} className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{c.label}</Label>
          <div className="flex items-center gap-2">
            <label
              className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer shrink-0 transition-shadow hover:shadow-md"
              style={{ backgroundColor: c.value }}
            >
              <input
                type="color"
                value={c.value}
                onChange={(e) => onChange(c.key, e.target.value)}
                className="sr-only"
              />
            </label>
            <Input
              value={c.value}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                  onChange(c.key, v);
                }
              }}
              className="font-mono text-xs h-9 uppercase"
              maxLength={7}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
