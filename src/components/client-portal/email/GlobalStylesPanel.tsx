import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Paintbrush } from 'lucide-react';
import type { SteveMailEditorRef } from './SteveMailEditor';

interface GlobalStylesPanelProps {
  editorRef: React.RefObject<SteveMailEditorRef | null>;
}

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
];

export function GlobalStylesPanel({ editorRef }: GlobalStylesPanelProps) {
  const [fontFamily, setFontFamily] = useState('Arial, Helvetica, sans-serif');
  const [bgColor, setBgColor] = useState('#f4f4f5');
  const [textColor, setTextColor] = useState('#18181b');
  const [linkColor, setLinkColor] = useState('#2563eb');
  const [contentPadding, setContentPadding] = useState('16');

  const applyStyles = () => {
    const editor = editorRef.current?.getEditor?.();
    if (!editor) return;

    const wrapper = editor.getWrapper();
    if (!wrapper) return;

    // Apply body/wrapper styles
    wrapper.setStyle({
      'background-color': bgColor,
      'font-family': fontFamily,
      color: textColor,
      margin: '0',
      padding: '0',
    });

    // Apply styles to all text components
    const components = editor.getComponents();
    const applyToAll = (comps: any) => {
      comps.forEach((comp: any) => {
        const tagName = comp.get('tagName');
        if (['td', 'p', 'h1', 'h2', 'h3', 'h4', 'span', 'div'].includes(tagName)) {
          const currentStyle = comp.getStyle() || {};
          if (!currentStyle['font-family']) {
            comp.addStyle({ 'font-family': fontFamily });
          }
        }
        if (tagName === 'a') {
          comp.addStyle({ color: linkColor });
        }
        if (comp.get('components')?.length) {
          applyToAll(comp.get('components'));
        }
      });
    };
    applyToAll(components);

    // Add/update global CSS rule for links
    const cssComposer = editor.CssComposer;
    const existingRule = cssComposer.getRule('a');
    if (existingRule) {
      existingRule.setStyle({ color: linkColor });
    } else {
      cssComposer.setRule('a', { color: linkColor });
    }

    // Add global body font rule
    const bodyRule = cssComposer.getRule('body');
    if (bodyRule) {
      bodyRule.setStyle({
        'font-family': fontFamily,
        color: textColor,
        'background-color': bgColor,
      });
    } else {
      cssComposer.setRule('body', {
        'font-family': fontFamily,
        color: textColor,
        'background-color': bgColor,
      });
    }

    // Add padding rule for table cells
    const tdRule = cssComposer.getRule('td');
    if (tdRule) {
      tdRule.setStyle({ padding: `${contentPadding}px` });
    } else {
      cssComposer.setRule('td', { padding: `${contentPadding}px` });
    }

    editor.refresh();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Estilos globales">
          <Paintbrush className="w-3.5 h-3.5 mr-1" /> Estilos
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Estilos Globales</h4>

          <div className="space-y-1.5">
            <Label className="text-xs">Fuente</Label>
            <Select value={fontFamily} onValueChange={setFontFamily}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value} className="text-xs">
                    <span style={{ fontFamily: f.value }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fondo</Label>
              <div className="flex gap-1">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto</Label>
              <div className="flex gap-1">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Color de enlaces</Label>
            <div className="flex gap-1">
              <input
                type="color"
                value={linkColor}
                onChange={(e) => setLinkColor(e.target.value)}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <Input
                value={linkColor}
                onChange={(e) => setLinkColor(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Padding de celdas (px)</Label>
            <Input
              type="number"
              min={0}
              max={48}
              value={contentPadding}
              onChange={(e) => setContentPadding(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <Button size="sm" className="w-full" onClick={applyStyles}>
            Aplicar Estilos
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
