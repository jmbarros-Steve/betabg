import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { type EmailBlock, type BlockType } from './blockTypes';
import KlaviyoVariablePicker, { PRODUCT_DYNAMIC_VARIABLES } from './KlaviyoVariablePicker';

interface BlockConfigProps {
  block: EmailBlock;
  onChange: (props: Record<string, any>) => void;
  assets?: { url: string; name: string }[];
}

export default function BlockConfigPanel({ block, onChange, assets }: BlockConfigProps) {
  const p = block.props;
  const set = (key: string, val: any) => onChange({ ...p, [key]: val });

  switch (block.type) {
    case 'text': return <TextConfig p={p} set={set} />;
    case 'image': return <ImageConfig p={p} set={set} assets={assets} />;
    case 'button': return <ButtonConfig p={p} set={set} />;
    case 'header_bar': return <HeaderBarConfig p={p} set={set} />;
    case 'divider': return <DividerConfig p={p} set={set} />;
    case 'spacer': return <SpacerConfig p={p} set={set} />;
    case 'social_links': return <SocialConfig p={p} set={set} />;
    case 'product': return <ProductConfig p={p} set={set} />;
    case 'coupon': return <CouponConfig p={p} set={set} />;
    case 'table': return <TableConfig p={p} set={set} />;
    case 'review': return <ReviewConfig p={p} set={set} />;
    case 'video': return <VideoConfig p={p} set={set} />;
    case 'html': return <HtmlConfig p={p} set={set} />;
    case 'drop_shadow': return <DropShadowConfig p={p} set={set} />;
    case 'split': return <SplitConfig p={p} set={set} />;
    case 'columns': return <ColumnsConfig p={p} set={set} />;
    case 'section': return <SectionConfig p={p} set={set} />;
    default: return <p className="text-sm text-muted-foreground">Sin configuración disponible</p>;
  }
}

// ═══ Helpers ═══

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</p>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex gap-2 items-center">
        <div className="relative">
          <input
            type="color"
            value={value || '#000000'}
            onChange={e => onChange(e.target.value)}
            className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer p-0 appearance-none"
          />
        </div>
        <Input value={value || ''} onChange={e => onChange(e.target.value)} className="h-9 text-xs font-mono flex-1" placeholder="#000000" />
      </div>
    </div>
  );
}

function AlignButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Alineación</Label>
      <div className="flex gap-1">
        {[
          { v: 'left', label: '◀' },
          { v: 'center', label: '◆' },
          { v: 'right', label: '▶' },
        ].map(o => (
          <Button
            key={o.v}
            variant={value === o.v ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => onChange(o.v)}
          >
            {o.v === 'left' ? 'Izq' : o.v === 'center' ? 'Centro' : 'Der'}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════
// TEXT CONFIG
// ═══════════════════════════════

function TextConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const plainText = (p.content || '').replace(/<[^>]+>/g, '');

  return (
    <div className="space-y-4">
      <SectionTitle>Contenido</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Texto</Label>
        <Textarea
          value={plainText}
          onChange={e => set('content', `<p>${e.target.value}</p>`)}
          rows={6}
          className="mt-1.5 text-sm"
          placeholder="Escribe tu texto aquí..."
        />
      </div>
      <KlaviyoVariablePicker onSelect={v => set('content', (p.content || '') + v)} />

      <Separator />
      <SectionTitle>Estilo</SectionTitle>
      <AlignButtons value={p.align || 'left'} onChange={v => set('align', v)} />
      <div>
        <Label className="text-xs font-medium">Tamaño de fuente (px)</Label>
        <Select value={String(p.fontSize || 14)} onValueChange={v => set('fontSize', +v)}>
          <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map(s => (
              <SelectItem key={s} value={String(s)}>{s}px</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ColorField label="Color de texto" value={p.color || '#333333'} onChange={v => set('color', v)} />
    </div>
  );
}

// ═══════════════════════════════
// IMAGE CONFIG
// ═══════════════════════════════

function ImageConfig({ p, set, assets }: { p: any; set: (k: string, v: any) => void; assets?: any[] }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Imagen</SectionTitle>
      <div>
        <Label className="text-xs font-medium">URL de la imagen</Label>
        <Input value={p.src || ''} onChange={e => set('src', e.target.value)} placeholder="https://..." className="h-9 text-sm mt-1.5" />
      </div>
      {assets && assets.length > 0 && (
        <div>
          <Label className="text-xs font-medium">O selecciona de tus assets</Label>
          <div className="grid grid-cols-4 gap-1.5 mt-1.5 max-h-28 overflow-y-auto">
            {assets.map((a, i) => (
              <img key={i} src={a.url} alt={a.name}
                className="w-full h-14 object-cover rounded-lg cursor-pointer border-2 border-transparent hover:border-primary transition-colors"
                onClick={() => set('src', a.url)}
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <Label className="text-xs font-medium">Texto alternativo</Label>
        <Input value={p.alt || ''} onChange={e => set('alt', e.target.value)} placeholder="Descripción de la imagen" className="h-9 text-sm mt-1.5" />
      </div>
      <div>
        <Label className="text-xs font-medium">Link al hacer click</Label>
        <Input value={p.link || ''} onChange={e => set('link', e.target.value)} placeholder="https://..." className="h-9 text-sm mt-1.5" />
      </div>

      <Separator />
      <SectionTitle>Diseño</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Ancho</Label>
        <div className="flex gap-1 mt-1.5">
          {['25%', '50%', '75%', '100%'].map(w => (
            <Button key={w} variant={p.width === w ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('width', w)}>
              {w}
            </Button>
          ))}
        </div>
      </div>
      <AlignButtons value={p.align || 'center'} onChange={v => set('align', v)} />
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs font-medium">Padding ↑</Label><Input type="number" value={p.paddingTop || 0} onChange={e => set('paddingTop', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        <div><Label className="text-xs font-medium">Padding ↓</Label><Input type="number" value={p.paddingBottom || 0} onChange={e => set('paddingBottom', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// BUTTON CONFIG — Smart URL selector
// ═══════════════════════════════

function ButtonConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const [urlMode, setUrlMode] = useState<string>('custom');
  const [collHandle, setCollHandle] = useState('');
  const [prodHandle, setProdHandle] = useState('');
  const [couponCode, setCouponCode] = useState('');

  const urlOptions = [
    { key: 'shop', label: '🏪 Ir a la tienda', url: '{{shop_url}}' },
    { key: 'products', label: '🛍️ Ver todos los productos', url: '{{shop_url}}/collections/all' },
    { key: 'cart', label: '🛒 Ver carrito', url: '{{shop_url}}/cart' },
    { key: 'collection', label: '📁 Ver colección...', url: '' },
    { key: 'product', label: '📦 Ver producto...', url: '' },
    { key: 'coupon', label: '🎟️ Usar cupón...', url: '' },
    { key: 'custom', label: '🔗 URL personalizada', url: '' },
  ];

  const applyUrlOption = (key: string) => {
    setUrlMode(key);
    const opt = urlOptions.find(o => o.key === key);
    if (opt?.url) set('url', opt.url);
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Contenido</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Texto del botón</Label>
        <Input value={p.text || ''} onChange={e => set('text', e.target.value)} className="h-10 text-sm font-medium mt-1.5" placeholder="Comprar ahora" />
      </div>
      <KlaviyoVariablePicker compact onSelect={v => set('text', (p.text || '') + ' ' + v)} />

      <Separator />
      <SectionTitle>URL de destino</SectionTitle>
      <div className="space-y-1.5">
        {urlOptions.map(opt => (
          <button
            key={opt.key}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all border ${
              urlMode === opt.key
                ? 'border-primary bg-primary/5 font-medium'
                : 'border-transparent hover:bg-muted'
            }`}
            onClick={() => applyUrlOption(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {urlMode === 'collection' && (
        <div>
          <Label className="text-xs font-medium">Handle de la colección</Label>
          <Input
            value={collHandle}
            onChange={e => {
              setCollHandle(e.target.value);
              set('url', `{{shop_url}}/collections/${e.target.value}`);
            }}
            placeholder="summer-sale"
            className="h-9 text-sm mt-1.5"
          />
        </div>
      )}
      {urlMode === 'product' && (
        <div>
          <Label className="text-xs font-medium">Handle del producto</Label>
          <Input
            value={prodHandle}
            onChange={e => {
              setProdHandle(e.target.value);
              set('url', `{{shop_url}}/products/${e.target.value}`);
            }}
            placeholder="nombre-producto"
            className="h-9 text-sm mt-1.5"
          />
        </div>
      )}
      {urlMode === 'coupon' && (
        <div>
          <Label className="text-xs font-medium">Código del cupón</Label>
          <Input
            value={couponCode}
            onChange={e => {
              setCouponCode(e.target.value.toUpperCase());
              set('url', `{{shop_url}}/discount/${e.target.value.toUpperCase()}`);
            }}
            placeholder="VERANO20"
            className="h-9 text-sm font-mono mt-1.5"
          />
        </div>
      )}
      {urlMode === 'custom' && (
        <div>
          <Label className="text-xs font-medium">URL personalizada</Label>
          <Input value={p.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://..." className="h-9 text-sm mt-1.5" />
        </div>
      )}

      {p.url && (
        <div className="p-2.5 bg-muted/50 rounded-lg border border-dashed">
          <p className="text-[10px] font-semibold text-muted-foreground">URL final:</p>
          <code className="text-[11px] font-mono break-all text-foreground">{p.url}</code>
        </div>
      )}

      <Separator />
      <SectionTitle>Estilo visual</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Color de fondo" value={p.bgColor || '#000'} onChange={v => set('bgColor', v)} />
        <ColorField label="Color de texto" value={p.textColor || '#fff'} onChange={v => set('textColor', v)} />
      </div>
      <div>
        <Label className="text-xs font-medium">Borde redondeado</Label>
        <div className="flex gap-1 mt-1.5">
          {[
            { v: 0, label: '0' },
            { v: 4, label: '4px' },
            { v: 8, label: '8px' },
            { v: 20, label: '20px' },
            { v: 999, label: 'Pill' },
          ].map(r => (
            <Button key={r.v} variant={(p.borderRadius ?? 4) === r.v ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('borderRadius', r.v)}>
              {r.label}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Ancho</Label>
        <div className="flex gap-2 mt-1.5">
          <Button variant={p.width === 'auto' || !p.width ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('width', 'auto')}>Auto</Button>
          <Button variant={p.width === '50%' ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('width', '50%')}>50%</Button>
          <Button variant={p.width === '100%' ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('width', '100%')}>100%</Button>
        </div>
      </div>
      <AlignButtons value={p.align || 'center'} onChange={v => set('align', v)} />
    </div>
  );
}

// ═══════════════════════════════
// HEADER BAR CONFIG
// ═══════════════════════════════

function HeaderBarConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Contenido</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Texto</Label>
        <Input value={p.text || ''} onChange={e => set('text', e.target.value)} className="h-10 text-sm mt-1.5" />
      </div>
      <KlaviyoVariablePicker compact onSelect={v => set('text', (p.text || '') + ' ' + v)} />
      <div>
        <Label className="text-xs font-medium">Ícono (emoji, opcional)</Label>
        <Input value={p.icon || ''} onChange={e => set('icon', e.target.value)} placeholder="🔥" className="h-9 text-sm mt-1.5" />
      </div>

      <Separator />
      <SectionTitle>Estilo</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Color de fondo" value={p.bgColor || '#000'} onChange={v => set('bgColor', v)} />
        <ColorField label="Color de texto" value={p.textColor || '#fff'} onChange={v => set('textColor', v)} />
      </div>
      <div>
        <Label className="text-xs font-medium">Tamaño</Label>
        <Select value={String(p.fontSize || 14)} onValueChange={v => set('fontSize', +v)}>
          <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="12">Pequeño (12px)</SelectItem>
            <SelectItem value="14">Mediano (14px)</SelectItem>
            <SelectItem value="18">Grande (18px)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// DIVIDER CONFIG
// ═══════════════════════════════

function DividerConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Estilo</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Tipo de línea</Label>
        <div className="flex gap-1 mt-1.5">
          {[
            { v: 'solid', label: 'Sólida' },
            { v: 'dashed', label: 'Punteada' },
            { v: 'double', label: 'Doble' },
          ].map(s => (
            <Button key={s.v} variant={p.style === s.v ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('style', s.v)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <ColorField label="Color" value={p.color || '#e5e7eb'} onChange={v => set('color', v)} />
      <div>
        <Label className="text-xs font-medium">Grosor</Label>
        <div className="flex gap-1 mt-1.5">
          {[1, 2, 3].map(t => (
            <Button key={t} variant={(p.thickness || 1) === t ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('thickness', t)}>
              {t}px
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Ancho</Label>
        <div className="flex gap-1 mt-1.5">
          {['50%', '75%', '100%'].map(w => (
            <Button key={w} variant={p.width === w ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('width', w)}>
              {w}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs font-medium">Margen ↑</Label><Input type="number" value={p.marginTop || 16} onChange={e => set('marginTop', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        <div><Label className="text-xs font-medium">Margen ↓</Label><Input type="number" value={p.marginBottom || 16} onChange={e => set('marginBottom', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// SPACER CONFIG
// ═══════════════════════════════

function SpacerConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const presets = [10, 20, 30, 40, 60, 80];
  return (
    <div className="space-y-4">
      <SectionTitle>Altura del espacio</SectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(h => (
          <Button key={h} variant={p.height === h ? 'default' : 'outline'} size="sm" className="h-9 px-4 text-xs" onClick={() => set('height', h)}>
            {h}px
          </Button>
        ))}
      </div>
      <div>
        <Label className="text-xs font-medium">Altura personalizada (px)</Label>
        <Input type="number" value={p.height || 30} onChange={e => set('height', +e.target.value)} className="h-9 text-sm mt-1.5" />
      </div>
      {/* Visual preview */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/30" style={{ height: p.height || 30 }} />
        <p className="text-center text-[10px] text-muted-foreground py-1">{p.height || 30}px</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// SOCIAL LINKS CONFIG
// ═══════════════════════════════

function SocialConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const platforms = [
    { key: 'facebook', label: 'Facebook', icon: '📘' },
    { key: 'instagram', label: 'Instagram', icon: '📸' },
    { key: 'tiktok', label: 'TikTok', icon: '🎵' },
    { key: 'twitter', label: 'Twitter/X', icon: '🐦' },
    { key: 'youtube', label: 'YouTube', icon: '🎬' },
    { key: 'linkedin', label: 'LinkedIn', icon: '💼' },
    { key: 'pinterest', label: 'Pinterest', icon: '📌' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle>Redes sociales</SectionTitle>
      <p className="text-[11px] text-muted-foreground">Solo se mostrarán los íconos de las redes con URL</p>
      {platforms.map(pl => (
        <div key={pl.key}>
          <Label className="text-xs font-medium">{pl.icon} {pl.label}</Label>
          <Input value={p[pl.key] || ''} onChange={e => set(pl.key, e.target.value)} placeholder={`URL de ${pl.label}`} className="h-9 text-sm mt-1" />
        </div>
      ))}

      <Separator />
      <SectionTitle>Diseño</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Estilo de íconos</Label>
        <div className="flex gap-1 mt-1.5">
          {[
            { v: 'color', label: 'Color' },
            { v: 'bw', label: 'B/N' },
            { v: 'circle', label: 'Circular' },
            { v: 'square', label: 'Cuadrado' },
          ].map(s => (
            <Button key={s.v} variant={p.iconStyle === s.v ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('iconStyle', s.v)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Tamaño</Label>
        <div className="flex gap-1 mt-1.5">
          {[
            { v: 'small', label: 'Pequeño' },
            { v: 'medium', label: 'Mediano' },
            { v: 'large', label: 'Grande' },
          ].map(s => (
            <Button key={s.v} variant={p.iconSize === s.v ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('iconSize', s.v)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <AlignButtons value={p.align || 'center'} onChange={v => set('align', v)} />
    </div>
  );
}

// ═══════════════════════════════
// PRODUCT CONFIG (3 modes)
// ═══════════════════════════════

function ProductConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const mode = p.productMode || 'fixed';

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={v => set('productMode', v)}>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="fixed" className="text-xs px-1">📌 Fijo</TabsTrigger>
          <TabsTrigger value="dynamic" className="text-xs px-1">🔄 Dinámico</TabsTrigger>
          <TabsTrigger value="collection" className="text-xs px-1">📁 Colección</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="mt-4 space-y-3">
          <div><Label className="text-xs font-medium">Nombre del producto</Label><Input value={p.name || ''} onChange={e => set('name', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="Nombre del producto" /></div>
          <div><Label className="text-xs font-medium">URL de imagen</Label><Input value={p.imageUrl || ''} onChange={e => set('imageUrl', e.target.value)} className="h-9 text-sm mt-1.5" /></div>
          <div><Label className="text-xs font-medium">Precio</Label><Input value={p.price || ''} onChange={e => set('price', e.target.value)} placeholder="$29.990" className="h-9 text-sm mt-1.5" /></div>
          <div><Label className="text-xs font-medium">Descripción</Label><Textarea value={p.description || ''} onChange={e => set('description', e.target.value)} rows={3} className="text-sm mt-1.5" /></div>
          <div><Label className="text-xs font-medium">Link del producto</Label><Input value={p.link || ''} onChange={e => set('link', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="{{shop_url}}/products/handle" /></div>
          <div><Label className="text-xs font-medium">Texto del botón</Label><Input value={p.buttonText || 'Comprar'} onChange={e => set('buttonText', e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        </TabsContent>

        <TabsContent value="dynamic" className="mt-4 space-y-3">
          <div>
            <Label className="text-xs font-medium">Tipo de producto dinámico</Label>
            <Select value={p.dynamicType || 'lastViewed'} onValueChange={v => set('dynamicType', v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lastViewed">👁️ Último producto visto</SelectItem>
                <SelectItem value="abandonedCart">🛒 Carrito abandonado</SelectItem>
                <SelectItem value="recommended">✨ Producto recomendado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg border border-dashed space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground">Variables que se usarán:</p>
            {(PRODUCT_DYNAMIC_VARIABLES[p.dynamicType as keyof typeof PRODUCT_DYNAMIC_VARIABLES] || PRODUCT_DYNAMIC_VARIABLES.lastViewed).map(v => (
              <div key={v.key} className="flex items-center justify-between py-0.5">
                <span className="text-[11px] text-muted-foreground">{v.label}</span>
                <code className="text-[10px] font-mono bg-background px-1.5 rounded">{v.key}</code>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-[11px] text-blue-700 dark:text-blue-300">
            <span>💡</span>
            <span>Klaviyo resolverá estas variables con los datos reales del cliente al enviar.</span>
          </div>
        </TabsContent>

        <TabsContent value="collection" className="mt-4 space-y-3">
          <div><Label className="text-xs font-medium">Handle de la colección</Label><Input value={p.collectionHandle || ''} onChange={e => set('collectionHandle', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="summer-sale" /></div>
          <div><Label className="text-xs font-medium">Nombre de la colección</Label><Input value={p.collectionName || ''} onChange={e => set('collectionName', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="Sale de Verano" /></div>
          <div>
            <Label className="text-xs font-medium">Productos a mostrar</Label>
            <div className="flex gap-1 mt-1.5">
              {[2, 3, 4].map(n => (
                <Button key={n} variant={(p.collectionCount || 2) === n ? 'default' : 'outline'} size="sm" className="flex-1 h-9 text-xs" onClick={() => set('collectionCount', n)}>
                  {n} productos
                </Button>
              ))}
            </div>
          </div>
          <div><Label className="text-xs font-medium">Texto del botón</Label><Input value={p.buttonText || 'Ver colección'} onChange={e => set('buttonText', e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        </TabsContent>
      </Tabs>

      <Separator />
      <SectionTitle>Opciones</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Layout</Label>
        <div className="flex gap-1 mt-1.5">
          {[
            { v: 'image-top', label: 'Img arriba' },
            { v: 'image-left', label: 'Img izq' },
            { v: 'image-right', label: 'Img der' },
          ].map(l => (
            <Button key={l.v} variant={p.layout === l.v ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('layout', l.v)}>
              {l.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-center gap-2"><Checkbox checked={p.showPrice !== false} onCheckedChange={v => set('showPrice', !!v)} /><Label className="text-xs">Mostrar precio</Label></div>
        <div className="flex items-center gap-2"><Checkbox checked={p.showDescription !== false} onCheckedChange={v => set('showDescription', !!v)} /><Label className="text-xs">Mostrar descripción</Label></div>
        <div className="flex items-center gap-2"><Checkbox checked={p.showButton !== false} onCheckedChange={v => set('showButton', !!v)} /><Label className="text-xs">Mostrar botón</Label></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// COUPON CONFIG
// ═══════════════════════════════

function CouponConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const discountUrl = `{{shop_url}}/discount/${p.code || 'CÓDIGO'}`;

  return (
    <div className="space-y-4">
      <SectionTitle>Cupón de descuento</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Código del cupón</Label>
        <Input value={p.code || ''} onChange={e => set('code', e.target.value.toUpperCase())} className="h-10 text-sm font-mono font-bold mt-1.5 tracking-widest" placeholder="VERANO20" />
      </div>
      <div>
        <Label className="text-xs font-medium">Descripción</Label>
        <Input value={p.description || ''} onChange={e => set('description', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="20% de descuento en toda la tienda" />
      </div>
      <KlaviyoVariablePicker compact onSelect={v => set('description', (p.description || '') + ' ' + v)} />
      <div>
        <Label className="text-xs font-medium">Texto del botón</Label>
        <Input value={p.buttonText || 'Usar cupón'} onChange={e => set('buttonText', e.target.value)} className="h-9 text-sm mt-1.5" />
      </div>
      <div>
        <Label className="text-xs font-medium">Vencimiento (opcional)</Label>
        <Input type="date" value={p.expiresAt || ''} onChange={e => set('expiresAt', e.target.value)} className="h-9 text-sm mt-1.5" />
      </div>

      <div className="p-3 bg-muted/50 rounded-lg border border-dashed space-y-1">
        <p className="text-[11px] font-semibold text-muted-foreground">🔗 URL de descuento automático:</p>
        <code className="text-[11px] font-mono block break-all text-foreground">{discountUrl}</code>
      </div>

      <div className="flex items-start gap-2 p-2.5 bg-green-50 dark:bg-green-950/30 rounded-lg text-[11px] text-green-700 dark:text-green-300">
        <span>✅</span>
        <span>El descuento se aplica automáticamente al hacer click. El cliente no necesita ingresarlo.</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// TABLE CONFIG
// ═══════════════════════════════

function TableConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const data: string[][] = p.data || [['', ''], ['', '']];
  const updateCell = (r: number, c: number, val: string) => {
    const newData = data.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? val : cell));
    set('data', newData);
  };
  const addRow = () => { if (data.length < 10) set('data', [...data, new Array(data[0]?.length || 2).fill('')]); };
  const addCol = () => { if ((data[0]?.length || 0) < 5) set('data', data.map(row => [...row, ''])); };

  return (
    <div className="space-y-4">
      <SectionTitle>Datos de la tabla</SectionTitle>
      <div className="overflow-x-auto rounded-lg border">
        <table className="text-sm w-full">
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-muted/50' : ''}>
                {row.map((cell, ci) => (
                  <td key={ci} className="p-1">
                    <Input value={cell} onChange={e => updateCell(ri, ci, e.target.value)} className="h-8 text-xs" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="text-xs h-8" onClick={addRow} disabled={data.length >= 10}>+ Fila</Button>
        <Button variant="outline" size="sm" className="text-xs h-8" onClick={addCol} disabled={(data[0]?.length || 0) >= 5}>+ Columna</Button>
      </div>

      <Separator />
      <SectionTitle>Estilo</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Header fondo" value={p.headerBgColor || '#000'} onChange={v => set('headerBgColor', v)} />
        <ColorField label="Header texto" value={p.headerTextColor || '#fff'} onChange={v => set('headerTextColor', v)} />
      </div>
      <div className="flex items-center gap-2"><Checkbox checked={p.showBorders !== false} onCheckedChange={v => set('showBorders', !!v)} /><Label className="text-xs">Mostrar bordes</Label></div>
    </div>
  );
}

// ═══════════════════════════════
// REVIEW CONFIG
// ═══════════════════════════════

function ReviewConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Reseña</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Nombre del cliente</Label>
        <Input value={p.customerName || ''} onChange={e => set('customerName', e.target.value)} className="h-9 text-sm mt-1.5" />
      </div>
      <div>
        <Label className="text-xs font-medium">Texto de la reseña</Label>
        <Textarea value={p.reviewText || ''} onChange={e => set('reviewText', e.target.value)} rows={4} className="text-sm mt-1.5" />
      </div>
      <div>
        <Label className="text-xs font-medium">Estrellas</Label>
        <div className="flex gap-2 mt-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              className={`text-2xl transition-transform hover:scale-110 ${n <= (p.rating || 5) ? 'text-yellow-400' : 'text-muted-foreground/30'}`}
              onClick={() => set('rating', n)}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label className="text-xs font-medium">Foto del cliente (URL)</Label>
        <Input value={p.customerPhoto || ''} onChange={e => set('customerPhoto', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="https://..." />
      </div>
    </div>
  );
}

// ═══════════════════════════════
// VIDEO CONFIG
// ═══════════════════════════════

function VideoConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Vídeo</SectionTitle>
      <div>
        <Label className="text-xs font-medium">URL del video (YouTube/Vimeo)</Label>
        <Input value={p.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://youtube.com/watch?v=..." className="h-9 text-sm mt-1.5" />
      </div>
      <div>
        <Label className="text-xs font-medium">Thumbnail personalizado (opcional)</Label>
        <Input value={p.thumbnailUrl || ''} onChange={e => set('thumbnailUrl', e.target.value)} className="h-9 text-sm mt-1.5" placeholder="https://..." />
      </div>
      <div className="flex items-start gap-2 p-2.5 bg-muted/50 rounded-lg text-[11px] text-muted-foreground">
        <span>ℹ️</span>
        <span>Los emails no soportan video embebido. Se muestra un thumbnail con botón play que abre el video en el navegador.</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// HTML CONFIG
// ═══════════════════════════════

function HtmlConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>HTML personalizado</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Código HTML</Label>
        <Textarea value={p.code || ''} onChange={e => set('code', e.target.value)} rows={14} className="text-xs font-mono mt-1.5" />
      </div>
      <KlaviyoVariablePicker compact onSelect={v => set('code', (p.code || '') + v)} />
      <p className="text-[11px] text-muted-foreground">Para usuarios avanzados. El HTML se inserta directamente en el email.</p>
    </div>
  );
}

// ═══════════════════════════════
// DROP SHADOW CONFIG
// ═══════════════════════════════

function DropShadowConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Sombra</SectionTitle>
      <div>
        <Label className="text-xs font-medium">Posición</Label>
        <div className="flex gap-1 mt-1.5">
          <Button variant={p.position === 'top' ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('position', 'top')}>Superior</Button>
          <Button variant={p.position === 'bottom' || !p.position ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('position', 'bottom')}>Inferior</Button>
        </div>
      </div>
      <ColorField label="Color de sombra" value={p.color || '#000000'} onChange={v => set('color', v)} />
      <div>
        <Label className="text-xs font-medium">Intensidad</Label>
        <div className="flex gap-1 mt-1.5">
          {[
            { v: 'soft', label: 'Suave' },
            { v: 'medium', label: 'Media' },
            { v: 'strong', label: 'Fuerte' },
          ].map(i => (
            <Button key={i.v} variant={p.intensity === i.v ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs" onClick={() => set('intensity', i.v)}>
              {i.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════
// SPLIT CONFIG
// ═══════════════════════════════

function SplitConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const layouts = ['50/50', '33/67', '67/33', '33/33/33', '25/75', '75/25'];
  return (
    <div className="space-y-4">
      <SectionTitle>División</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {layouts.map(l => (
          <Button key={l} variant={p.layout === l ? 'default' : 'outline'} size="sm" className="h-9 text-xs" onClick={() => {
            const colCount = l.split('/').length;
            const cols = Array.from({ length: colCount }, (_, i) => p.columns?.[i] || []);
            set('layout', l);
            set('columns', cols);
          }}>
            {l}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Cada columna acepta bloques de texto, imagen y botón.</p>
    </div>
  );
}

// ═══════════════════════════════
// COLUMNS CONFIG
// ═══════════════════════════════

function ColumnsConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Columnas</SectionTitle>
      <div className="flex gap-2">
        {[2, 3, 4].map(n => (
          <Button key={n} variant={p.count === n ? 'default' : 'outline'} size="sm" className="flex-1 h-10 text-sm" onClick={() => {
            const cols = Array.from({ length: n }, (_, i) => p.columns?.[i] || []);
            set('count', n);
            set('columns', cols);
          }}>
            {n} columnas
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">En mobile se apilan verticalmente.</p>
    </div>
  );
}

// ═══════════════════════════════
// SECTION CONFIG
// ═══════════════════════════════

function SectionConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-4">
      <SectionTitle>Sección contenedora</SectionTitle>
      <ColorField label="Color de fondo" value={p.bgColor || '#f9fafb'} onChange={v => set('bgColor', v)} />
      
      <Separator />
      <SectionTitle>Padding</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs font-medium">↑ Arriba</Label><Input type="number" value={p.paddingTop || 20} onChange={e => set('paddingTop', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        <div><Label className="text-xs font-medium">↓ Abajo</Label><Input type="number" value={p.paddingBottom || 20} onChange={e => set('paddingBottom', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        <div><Label className="text-xs font-medium">← Izquierda</Label><Input type="number" value={p.paddingLeft || 20} onChange={e => set('paddingLeft', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        <div><Label className="text-xs font-medium">→ Derecha</Label><Input type="number" value={p.paddingRight || 20} onChange={e => set('paddingRight', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
      </div>

      <Separator />
      <SectionTitle>Borde</SectionTitle>
      <ColorField label="Color del borde" value={p.borderColor || ''} onChange={v => set('borderColor', v)} />
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs font-medium">Grosor</Label><Input type="number" value={p.borderWidth || 0} onChange={e => set('borderWidth', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
        <div><Label className="text-xs font-medium">Radius</Label><Input type="number" value={p.borderRadius || 0} onChange={e => set('borderRadius', +e.target.value)} className="h-9 text-sm mt-1.5" /></div>
      </div>
    </div>
  );
}
