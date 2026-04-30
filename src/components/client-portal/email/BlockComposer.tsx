import { useEffect, useMemo, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Copy, Eye, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface BlockLibrary {
  id: string;
  num: string;
  category: string;
  name: string;
  mjml_content: string;
  variables: string[];
  preview_html: string | null;
  sort_order: number;
}

interface CanvasBlock {
  uid: string;
  num: string;
  category: string;
  name: string;
  mjml_content: string;
  preview_html: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  header: 'Headers',
  hero: 'Heros',
  product: 'Productos',
  grid: 'Grillas',
  cta: 'CTAs',
  testimonial: 'Testimonios',
  footer: 'Footers',
  benefits: 'Beneficios',
  content: 'Contenido',
  coupon: 'Cupones',
  social: 'Sociales',
  nav: 'Navegación',
  divider: 'Separadores',
  announcement: 'Anuncios',
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function extractBody(html: string | null): string {
  if (!html) return '';
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

export function BlockComposer() {
  const [library, setLibrary] = useState<BlockLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [canvas, setCanvas] = useState<CanvasBlock[]>([]);
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('email_block_library' as never)
        .select('id, num, category, name, mjml_content, variables, preview_html, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) {
        console.error('Failed to load library:', error);
        toast.error('No se pudo cargar la biblioteca de bloques');
      } else {
        setLibrary((data ?? []) as unknown as BlockLibrary[]);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return library;
    return library.filter(b => b.category === activeCategory);
  }, [library, activeCategory]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return library
      .map(b => b.category)
      .filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });
  }, [library]);

  const composedHtml = useMemo(() => {
    if (canvas.length === 0) return '';
    const bodies = canvas.map(b => extractBody(b.preview_html)).join('\n<!-- block divider -->\n');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#f4f4f5;}</style></head><body>${bodies}</body></html>`;
  }, [canvas]);

  useEffect(() => {
    const iframe = previewRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(composedHtml || '<div style="padding:40px;color:#71717a;font-family:Inter,sans-serif;text-align:center;">Agregá bloques desde la izquierda para ver el preview</div>');
    doc.close();
  }, [composedHtml]);

  const composedMjml = useMemo(() => {
    const body = canvas.map(b => b.mjml_content).join('\n');
    return `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="'{{ brand_font }}', Arial, sans-serif" />
      <mj-text font-size="15px" line-height="1.55" color="#27272a" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f4f4f5" width="600px">
${body}
  </mj-body>
</mjml>`;
  }, [canvas]);

  const handleAdd = (block: BlockLibrary) => {
    setCanvas(prev => [...prev, {
      uid: uid(),
      num: block.num,
      category: block.category,
      name: block.name,
      mjml_content: block.mjml_content,
      preview_html: block.preview_html,
    }]);
  };

  const handleRemove = (uid: string) => {
    setCanvas(prev => prev.filter(b => b.uid !== uid));
  };

  const handleCopyMjml = () => {
    navigator.clipboard.writeText(composedMjml);
    toast.success('MJML copiado al portapapeles');
  };

  const handleClear = () => {
    if (canvas.length === 0) return;
    if (confirm('¿Limpiar el canvas?')) setCanvas([]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (library.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Sparkles className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h3 className="font-semibold text-lg mb-2">Biblioteca vacía</h3>
        <p className="text-sm text-muted-foreground">La tabla email_block_library está vacía. Aplicá la migración SQL y corré el seed.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-[280px_1fr_400px] gap-3 h-[calc(100vh-180px)]">
      {/* SIDEBAR — Biblioteca */}
      <Card className="overflow-hidden flex flex-col">
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm mb-2">Biblioteca · {library.length}</h3>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveCategory('all')}
              className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${activeCategory === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-[11px] px-2 py-1 rounded font-medium transition-colors ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1.5">
            {filtered.map(b => (
              <button
                key={b.id}
                onClick={() => handleAdd(b)}
                className="w-full text-left p-2 rounded border bg-background hover:bg-muted/50 hover:border-primary/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 py-0">
                    {b.category}
                  </Badge>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
                <div className="text-xs font-medium leading-tight">{b.name}</div>
                <div className="text-[10px] text-muted-foreground mt-1">#{b.num}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* CANVAS — bloques agregados con drag & drop */}
      <Card className="overflow-hidden flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Canvas · {canvas.length} bloques</h3>
            <p className="text-[11px] text-muted-foreground">Arrastrá para reordenar · X para eliminar</p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={handleCopyMjml} disabled={canvas.length === 0}>
              <Copy className="w-3.5 h-3.5 mr-1" /> MJML
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClear} disabled={canvas.length === 0}>
              Limpiar
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {canvas.length === 0 ? (
            <div className="p-10 text-center">
              <Sparkles className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Click un bloque de la biblioteca para empezar</p>
            </div>
          ) : (
            <Reorder.Group axis="y" values={canvas} onReorder={setCanvas} className="p-2 space-y-2">
              {canvas.map(b => (
                <Reorder.Item
                  key={b.uid}
                  value={b}
                  className="border rounded-md bg-background cursor-grab active:cursor-grabbing"
                  whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                >
                  <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 py-0">{b.category}</Badge>
                      <span className="text-xs font-medium truncate">{b.name}</span>
                      <span className="text-[10px] text-muted-foreground">#{b.num}</span>
                    </div>
                    <button
                      onClick={() => handleRemove(b.uid)}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="bg-[#f4f4f5] max-h-[200px] overflow-hidden relative">
                    <div
                      className="origin-top-left scale-[0.5] w-[200%] pointer-events-none"
                      dangerouslySetInnerHTML={{ __html: extractBody(b.preview_html) }}
                    />
                  </div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </ScrollArea>
      </Card>

      {/* PREVIEW — email completo */}
      <Card className="overflow-hidden flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            <Eye className="w-3.5 h-3.5 inline mr-1" /> Preview
          </h3>
          <Badge variant="secondary" className="text-[10px]">600px</Badge>
        </div>
        <iframe
          ref={previewRef}
          title="Email preview"
          className="flex-1 w-full bg-[#f4f4f5] border-0"
        />
      </Card>
    </div>
  );
}
