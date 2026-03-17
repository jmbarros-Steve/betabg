import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Paintbrush, Sparkles, RotateCcw } from 'lucide-react';
import { callApi } from '@/lib/api';
import type { BlocksEditorRef } from './BlocksEditorWrapper';

interface GlobalStylesPanelProps {
  editorRef: React.RefObject<BlocksEditorRef | null>;
  clientId: string;
}

interface BrandKit {
  brand_color: string;
  brand_secondary_color: string;
  brand_font: string;
  brand_logo: string;
  brand_name: string;
}

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif" },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
  { label: 'Inter', value: "'Inter', Arial, sans-serif" },
  { label: 'Roboto', value: "'Roboto', Arial, sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', Arial, sans-serif" },
  { label: 'Lato', value: "'Lato', Arial, sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', Arial, sans-serif" },
  { label: 'Poppins', value: "'Poppins', Arial, sans-serif" },
];

/** Map a brand font name (e.g. "Inter") to its full font-family stack */
function resolveBrandFont(fontName: string): string {
  if (!fontName) return 'Arial, Helvetica, sans-serif';
  const match = FONT_OPTIONS.find(
    (f) => f.label.toLowerCase() === fontName.toLowerCase()
  );
  if (match) return match.value;
  // Custom font — wrap in quotes and add sans-serif fallback
  return `'${fontName}', Arial, sans-serif`;
}

const DEFAULTS = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  bgColor: '#f4f4f5',
  textColor: '#18181b',
  linkColor: '#2563eb',
  contentPadding: '16',
};

export function GlobalStylesPanel({ editorRef, clientId }: GlobalStylesPanelProps) {
  const [fontFamily, setFontFamily] = useState(DEFAULTS.fontFamily);
  const [bgColor, setBgColor] = useState(DEFAULTS.bgColor);
  const [textColor, setTextColor] = useState(DEFAULTS.textColor);
  const [linkColor, setLinkColor] = useState(DEFAULTS.linkColor);
  const [contentPadding, setContentPadding] = useState(DEFAULTS.contentPadding);
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [brandLoaded, setBrandLoaded] = useState(false);
  const appliedOnce = useRef(false);

  // Fetch brand data on mount
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const { data } = await callApi<any>('manage-email-campaigns', {
          body: { action: 'get_client_brand', client_id: clientId },
        });
        if (data) {
          const kit: BrandKit = {
            brand_color: data.brand_color || '#18181b',
            brand_secondary_color: data.brand_secondary_color || '#6366f1',
            brand_font: data.brand_font || '',
            brand_logo: data.brand_logo || '',
            brand_name: data.brand_name || '',
          };
          setBrandKit(kit);

          // Pre-populate form with brand values
          if (kit.brand_color && kit.brand_color !== '#18181b') {
            setLinkColor(kit.brand_color);
          }
          if (kit.brand_font) {
            setFontFamily(resolveBrandFont(kit.brand_font));
          }
          setBrandLoaded(true);
        }
      } catch { /* brand kit is optional */ }
    })();
  }, [clientId]);

  // Auto-apply brand styles once when editor becomes ready and brand is loaded
  useEffect(() => {
    if (!brandLoaded || appliedOnce.current) return;
    // Small delay to ensure GrapeJS editor is fully initialized
    const timer = setTimeout(() => {
      if (editorRef.current?.getEditor?.()) {
        applyStyles();
        appliedOnce.current = true;
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandLoaded]);

  const applyBrandKit = () => {
    if (!brandKit) return;
    if (brandKit.brand_color && brandKit.brand_color !== '#18181b') {
      setLinkColor(brandKit.brand_color);
    }
    if (brandKit.brand_font) {
      setFontFamily(resolveBrandFont(brandKit.brand_font));
    }
    setBgColor(DEFAULTS.bgColor);
    setTextColor(DEFAULTS.textColor);
    setContentPadding(DEFAULTS.contentPadding);
    // Apply after state updates in next tick
    setTimeout(applyStyles, 50);
  };

  const resetToDefaults = () => {
    setFontFamily(DEFAULTS.fontFamily);
    setBgColor(DEFAULTS.bgColor);
    setTextColor(DEFAULTS.textColor);
    setLinkColor(DEFAULTS.linkColor);
    setContentPadding(DEFAULTS.contentPadding);
  };

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
          {brandLoaded && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-500 inline-block" title="Brand kit cargado" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Estilos Globales</h4>
            {brandKit && (
              <button
                onClick={resetToDefaults}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                title="Restaurar valores por defecto"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          {/* Brand Kit quick-apply */}
          {brandKit && (
            <button
              onClick={applyBrandKit}
              className="w-full flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs text-left hover:bg-primary/10 transition-colors"
            >
              {brandKit.brand_logo ? (
                <img
                  src={brandKit.brand_logo}
                  alt=""
                  className="w-6 h-6 rounded object-contain shrink-0"
                />
              ) : (
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  Aplicar Brand Kit{brandKit.brand_name ? ` — ${brandKit.brand_name}` : ''}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-3 h-3 rounded-full border border-white/50 shrink-0"
                    style={{ backgroundColor: brandKit.brand_color }}
                  />
                  <span
                    className="w-3 h-3 rounded-full border border-white/50 shrink-0"
                    style={{ backgroundColor: brandKit.brand_secondary_color }}
                  />
                  {brandKit.brand_font && (
                    <span className="text-[10px] text-muted-foreground">{brandKit.brand_font}</span>
                  )}
                </div>
              </div>
            </button>
          )}

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
