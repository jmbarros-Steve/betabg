import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
    case 'text':
      return <TextConfig p={p} set={set} />;
    case 'image':
      return <ImageConfig p={p} set={set} assets={assets} />;
    case 'button':
      return <ButtonConfig p={p} set={set} />;
    case 'header_bar':
      return <HeaderBarConfig p={p} set={set} />;
    case 'divider':
      return <DividerConfig p={p} set={set} />;
    case 'spacer':
      return <SpacerConfig p={p} set={set} />;
    case 'social_links':
      return <SocialConfig p={p} set={set} />;
    case 'product':
      return <ProductConfig p={p} set={set} />;
    case 'coupon':
      return <CouponConfig p={p} set={set} />;
    case 'table':
      return <TableConfig p={p} set={set} />;
    case 'review':
      return <ReviewConfig p={p} set={set} />;
    case 'video':
      return <VideoConfig p={p} set={set} />;
    case 'html':
      return <HtmlConfig p={p} set={set} />;
    case 'drop_shadow':
      return <DropShadowConfig p={p} set={set} />;
    case 'split':
      return <SplitConfig p={p} set={set} />;
    case 'columns':
      return <ColumnsConfig p={p} set={set} />;
    case 'section':
      return <SectionConfig p={p} set={set} />;
    default:
      return <p className="text-sm text-muted-foreground">Sin configuración disponible</p>;
  }
}

// Helper color picker
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded border cursor-pointer p-0" />
        <Input value={value || ''} onChange={e => onChange(e.target.value)} className="h-8 text-xs font-mono flex-1" />
      </div>
    </div>
  );
}

// ============ BLOCK CONFIGS ============

function TextConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Contenido</Label>
        <Textarea value={p.content?.replace(/<[^>]+>/g, '') || ''} onChange={e => set('content', `<p>${e.target.value}</p>`)} rows={5} className="text-sm" />
      </div>
      <KlaviyoVariablePicker onSelect={v => set('content', (p.content || '') + v)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Alineación</Label>
          <Select value={p.align || 'left'} onValueChange={v => set('align', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Izquierda</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="right">Derecha</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tamaño (px)</Label>
          <Input type="number" value={p.fontSize || 14} onChange={e => set('fontSize', +e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      <ColorField label="Color texto" value={p.color || '#333333'} onChange={v => set('color', v)} />
    </div>
  );
}

function ImageConfig({ p, set, assets }: { p: any; set: (k: string, v: any) => void; assets?: any[] }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">URL imagen</Label>
        <Input value={p.src || ''} onChange={e => set('src', e.target.value)} placeholder="https://..." className="h-8 text-xs" />
      </div>
      {assets && assets.length > 0 && (
        <div>
          <Label className="text-xs">O selecciona de assets</Label>
          <div className="grid grid-cols-4 gap-1 mt-1 max-h-24 overflow-y-auto">
            {assets.map((a, i) => (
              <img key={i} src={a.url} alt={a.name} className="w-full h-12 object-cover rounded cursor-pointer border hover:border-primary" onClick={() => set('src', a.url)} />
            ))}
          </div>
        </div>
      )}
      <Input value={p.alt || ''} onChange={e => set('alt', e.target.value)} placeholder="Texto alternativo" className="h-8 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Ancho</Label>
          <Select value={p.width || '100%'} onValueChange={v => set('width', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['25%', '50%', '75%', '100%'].map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Alineación</Label>
          <Select value={p.align || 'center'} onValueChange={v => set('align', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Izquierda</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="right">Derecha</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Input value={p.link || ''} onChange={e => set('link', e.target.value)} placeholder="Link al hacer click" className="h-8 text-xs" />
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Padding arriba</Label><Input type="number" value={p.paddingTop || 0} onChange={e => set('paddingTop', +e.target.value)} className="h-8 text-xs" /></div>
        <div><Label className="text-xs">Padding abajo</Label><Input type="number" value={p.paddingBottom || 0} onChange={e => set('paddingBottom', +e.target.value)} className="h-8 text-xs" /></div>
      </div>
    </div>
  );
}

function ButtonConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const shortcuts = [
    { label: '🏪 Ir a la tienda', value: '{{shop_url}}' },
    { label: '🛍️ Ver productos', value: '{{shop_url}}/collections/all' },
    { label: '🛒 Ver carrito', value: '{{shop_url}}/cart' },
  ];
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Texto del botón</Label><Input value={p.text || ''} onChange={e => set('text', e.target.value)} className="h-8 text-xs" /></div>
      <div><Label className="text-xs">URL destino</Label><Input value={p.url || ''} onChange={e => set('url', e.target.value)} className="h-8 text-xs" /></div>
      <div className="flex flex-wrap gap-1">
        {shortcuts.map(s => (
          <Button key={s.value} variant="outline" size="sm" className="text-xs h-6 px-2" onClick={() => set('url', s.value)}>
            {s.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Fondo" value={p.bgColor || '#000'} onChange={v => set('bgColor', v)} />
        <ColorField label="Texto" value={p.textColor || '#fff'} onChange={v => set('textColor', v)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Radius</Label>
          <Select value={String(p.borderRadius ?? 4)} onValueChange={v => set('borderRadius', +v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0, 4, 8, 20, 999].map(r => <SelectItem key={r} value={String(r)}>{r === 999 ? 'Pill' : `${r}px`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ancho</Label>
          <Select value={p.width || 'auto'} onValueChange={v => set('width', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="50%">50%</SelectItem>
              <SelectItem value="100%">100%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Alineación</Label>
          <Select value={p.align || 'center'} onValueChange={v => set('align', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Izq</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="right">Der</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function HeaderBarConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Texto</Label><Input value={p.text || ''} onChange={e => set('text', e.target.value)} className="h-8 text-xs" /></div>
      <KlaviyoVariablePicker compact onSelect={v => set('text', (p.text || '') + ' ' + v)} />
      <div><Label className="text-xs">Ícono (opcional)</Label><Input value={p.icon || ''} onChange={e => set('icon', e.target.value)} placeholder="🔥" className="h-8 text-xs" /></div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Fondo" value={p.bgColor || '#000'} onChange={v => set('bgColor', v)} />
        <ColorField label="Texto" value={p.textColor || '#fff'} onChange={v => set('textColor', v)} />
      </div>
      <div><Label className="text-xs">Tamaño (px)</Label><Input type="number" value={p.fontSize || 14} onChange={e => set('fontSize', +e.target.value)} className="h-8 text-xs" /></div>
    </div>
  );
}

function DividerConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Estilo</Label>
        <Select value={p.style || 'solid'} onValueChange={v => set('style', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Sólida</SelectItem>
            <SelectItem value="dashed">Punteada</SelectItem>
            <SelectItem value="double">Doble</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ColorField label="Color" value={p.color || '#e5e7eb'} onChange={v => set('color', v)} />
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">Grosor</Label><Select value={String(p.thickness || 1)} onValueChange={v => set('thickness', +v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3].map(t => <SelectItem key={t} value={String(t)}>{t}px</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Ancho</Label><Select value={p.width || '100%'} onValueChange={v => set('width', v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['50%', '75%', '100%'].map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Margen ↑</Label><Input type="number" value={p.marginTop || 16} onChange={e => set('marginTop', +e.target.value)} className="h-8 text-xs" /></div>
        <div><Label className="text-xs">Margen ↓</Label><Input type="number" value={p.marginBottom || 16} onChange={e => set('marginBottom', +e.target.value)} className="h-8 text-xs" /></div>
      </div>
    </div>
  );
}

function SpacerConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const presets = [10, 20, 30, 40, 60, 80];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {presets.map(h => (
          <Button key={h} variant={p.height === h ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-3" onClick={() => set('height', h)}>
            {h}px
          </Button>
        ))}
      </div>
      <div><Label className="text-xs">O altura personalizada</Label><Input type="number" value={p.height || 30} onChange={e => set('height', +e.target.value)} className="h-8 text-xs" /></div>
    </div>
  );
}

function SocialConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const platforms = ['facebook', 'instagram', 'tiktok', 'twitter', 'youtube', 'linkedin', 'pinterest', 'whatsapp'];
  return (
    <div className="space-y-3">
      {platforms.map(pl => (
        <div key={pl}>
          <Label className="text-xs capitalize">{pl}</Label>
          <Input value={p[pl] || ''} onChange={e => set(pl, e.target.value)} placeholder={`URL de ${pl}`} className="h-8 text-xs" />
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Estilo</Label>
          <Select value={p.iconStyle || 'color'} onValueChange={v => set('iconStyle', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="color">Color</SelectItem>
              <SelectItem value="bw">Blanco/Negro</SelectItem>
              <SelectItem value="circle">Circular</SelectItem>
              <SelectItem value="square">Cuadrado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tamaño</Label>
          <Select value={p.iconSize || 'medium'} onValueChange={v => set('iconSize', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Pequeño</SelectItem>
              <SelectItem value="medium">Mediano</SelectItem>
              <SelectItem value="large">Grande</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Alineación</Label>
        <Select value={p.align || 'center'} onValueChange={v => set('align', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Izquierda</SelectItem>
            <SelectItem value="center">Centro</SelectItem>
            <SelectItem value="right">Derecha</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ============ PRODUCT CONFIG (3 modes) ============

function ProductConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const mode = p.productMode || 'fixed';

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={v => set('productMode', v)}>
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="fixed" className="text-[10px] px-1">📌 Fijo</TabsTrigger>
          <TabsTrigger value="dynamic" className="text-[10px] px-1">🔄 Dinámico</TabsTrigger>
          <TabsTrigger value="collection" className="text-[10px] px-1">📁 Colección</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="mt-3 space-y-3">
          <div><Label className="text-xs">Nombre</Label><Input value={p.name || ''} onChange={e => set('name', e.target.value)} className="h-8 text-xs" placeholder="Nombre del producto" /></div>
          <div><Label className="text-xs">URL imagen</Label><Input value={p.imageUrl || ''} onChange={e => set('imageUrl', e.target.value)} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Precio</Label><Input value={p.price || ''} onChange={e => set('price', e.target.value)} placeholder="$29.990" className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Descripción</Label><Textarea value={p.description || ''} onChange={e => set('description', e.target.value)} rows={2} className="text-xs" /></div>
          <div><Label className="text-xs">Link producto</Label><Input value={p.link || ''} onChange={e => set('link', e.target.value)} className="h-8 text-xs" placeholder="{{shop_url}}/products/handle" /></div>
          <div><Label className="text-xs">Texto botón</Label><Input value={p.buttonText || 'Comprar'} onChange={e => set('buttonText', e.target.value)} className="h-8 text-xs" /></div>
        </TabsContent>

        <TabsContent value="dynamic" className="mt-3 space-y-3">
          <div>
            <Label className="text-xs">Tipo de variable dinámica</Label>
            <Select value={p.dynamicType || 'lastViewed'} onValueChange={v => set('dynamicType', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lastViewed">👁️ Último producto visto</SelectItem>
                <SelectItem value="abandonedCart">🛒 Carrito abandonado</SelectItem>
                <SelectItem value="recommended">✨ Producto recomendado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">Variables que se usarán:</p>
            {(PRODUCT_DYNAMIC_VARIABLES[p.dynamicType as keyof typeof PRODUCT_DYNAMIC_VARIABLES] || PRODUCT_DYNAMIC_VARIABLES.lastViewed).map(v => (
              <div key={v.key} className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-muted-foreground">{v.label}</span>
                <code className="text-[9px] font-mono bg-background px-1 rounded">{v.key}</code>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-[10px] text-blue-700 dark:text-blue-300">
            <span>💡</span>
            <span>Klaviyo resolverá estas variables al enviar el email con los datos reales del cliente.</span>
          </div>
        </TabsContent>

        <TabsContent value="collection" className="mt-3 space-y-3">
          <div><Label className="text-xs">Handle de la colección</Label><Input value={p.collectionHandle || ''} onChange={e => set('collectionHandle', e.target.value)} className="h-8 text-xs" placeholder="ej: summer-sale" /></div>
          <div><Label className="text-xs">Nombre colección</Label><Input value={p.collectionName || ''} onChange={e => set('collectionName', e.target.value)} className="h-8 text-xs" placeholder="ej: Sale de Verano" /></div>
          <div>
            <Label className="text-xs">Productos a mostrar</Label>
            <Select value={String(p.collectionCount || 2)} onValueChange={v => set('collectionCount', +v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n} productos</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Texto botón</Label><Input value={p.buttonText || 'Ver colección'} onChange={e => set('buttonText', e.target.value)} className="h-8 text-xs" /></div>
          <p className="text-[10px] text-muted-foreground">Link del botón: {'{{shop_url}}/collections/' + (p.collectionHandle || '{handle}')}</p>
        </TabsContent>
      </Tabs>

      {/* Common options */}
      <div>
        <Label className="text-xs">Layout</Label>
        <Select value={p.layout || 'image-top'} onValueChange={v => set('layout', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="image-top">Imagen arriba</SelectItem>
            <SelectItem value="image-left">Imagen izq</SelectItem>
            <SelectItem value="image-right">Imagen der</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2"><Checkbox checked={p.showPrice !== false} onCheckedChange={v => set('showPrice', !!v)} /><Label className="text-xs">Mostrar precio</Label></div>
        <div className="flex items-center gap-2"><Checkbox checked={p.showDescription !== false} onCheckedChange={v => set('showDescription', !!v)} /><Label className="text-xs">Mostrar descripción</Label></div>
        <div className="flex items-center gap-2"><Checkbox checked={p.showButton !== false} onCheckedChange={v => set('showButton', !!v)} /><Label className="text-xs">Mostrar botón</Label></div>
      </div>
    </div>
  );
}

// ============ COUPON CONFIG (improved) ============

function CouponConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const discountUrl = `{{shop_url}}/discount/${p.code || 'CÓDIGO'}`;

  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Código cupón</Label><Input value={p.code || ''} onChange={e => set('code', e.target.value.toUpperCase())} className="h-8 text-xs font-mono" placeholder="VERANO20" /></div>
      <div><Label className="text-xs">Descripción</Label><Input value={p.description || ''} onChange={e => set('description', e.target.value)} className="h-8 text-xs" placeholder="20% de descuento en toda la tienda" /></div>
      <div><Label className="text-xs">Vencimiento (opcional)</Label><Input type="date" value={p.expiresAt || ''} onChange={e => set('expiresAt', e.target.value)} className="h-8 text-xs" /></div>
      <div><Label className="text-xs">Texto botón</Label><Input value={p.buttonText || 'Usar cupón'} onChange={e => set('buttonText', e.target.value)} className="h-8 text-xs" /></div>

      <div className="p-2.5 bg-muted/50 rounded-lg border border-dashed space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground">🔗 URL de descuento automático:</p>
        <code className="text-[10px] font-mono block break-all">{discountUrl}</code>
      </div>

      <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-[10px] text-green-700 dark:text-green-300">
        <span>✅</span>
        <span>El cliente recibirá el descuento automáticamente al hacer click. Shopify aplica el cupón sin que el cliente tenga que ingresarlo manualmente.</span>
      </div>
    </div>
  );
}

function TableConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const data: string[][] = p.data || [['', ''], ['', '']];
  const updateCell = (r: number, c: number, val: string) => {
    const newData = data.map((row, ri) => row.map((cell, ci) => ri === r && ci === c ? val : cell));
    set('data', newData);
  };
  const addRow = () => { if (data.length < 10) set('data', [...data, new Array(data[0]?.length || 2).fill('')]); };
  const addCol = () => { if ((data[0]?.length || 0) < 5) set('data', data.map(row => [...row, ''])); };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="p-0.5">
                    <Input value={cell} onChange={e => updateCell(ri, ci, e.target.value)} className="h-7 text-xs w-20" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={addRow} disabled={data.length >= 10}>+ Fila</Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={addCol} disabled={(data[0]?.length || 0) >= 5}>+ Columna</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ColorField label="Header fondo" value={p.headerBgColor || '#000'} onChange={v => set('headerBgColor', v)} />
        <ColorField label="Header texto" value={p.headerTextColor || '#fff'} onChange={v => set('headerTextColor', v)} />
      </div>
      <div className="flex items-center gap-2"><Checkbox checked={p.showBorders !== false} onCheckedChange={v => set('showBorders', !!v)} /><Label className="text-xs">Mostrar bordes</Label></div>
    </div>
  );
}

function ReviewConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Nombre cliente</Label><Input value={p.customerName || ''} onChange={e => set('customerName', e.target.value)} className="h-8 text-xs" /></div>
      <div><Label className="text-xs">Texto reseña</Label><Textarea value={p.reviewText || ''} onChange={e => set('reviewText', e.target.value)} rows={3} className="text-xs" /></div>
      <div>
        <Label className="text-xs">Estrellas</Label>
        <div className="flex gap-1 mt-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} className={`text-xl ${n <= (p.rating || 5) ? 'text-yellow-400' : 'text-gray-300'}`} onClick={() => set('rating', n)}>⭐</button>
          ))}
        </div>
      </div>
      <div><Label className="text-xs">Foto cliente (URL)</Label><Input value={p.customerPhoto || ''} onChange={e => set('customerPhoto', e.target.value)} className="h-8 text-xs" /></div>
    </div>
  );
}

function VideoConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">URL video (YouTube/Vimeo)</Label><Input value={p.url || ''} onChange={e => set('url', e.target.value)} placeholder="https://youtube.com/watch?v=..." className="h-8 text-xs" /></div>
      <div><Label className="text-xs">Thumbnail personalizado (opcional)</Label><Input value={p.thumbnailUrl || ''} onChange={e => set('thumbnailUrl', e.target.value)} className="h-8 text-xs" /></div>
      <p className="text-[10px] text-muted-foreground">Los emails no soportan video embebido. Se muestra thumbnail con botón play que abre el video en el navegador.</p>
    </div>
  );
}

function HtmlConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Código HTML</Label><Textarea value={p.code || ''} onChange={e => set('code', e.target.value)} rows={10} className="text-xs font-mono" /></div>
      <p className="text-[10px] text-muted-foreground">Para usuarios avanzados. El HTML se inserta directamente en el email.</p>
    </div>
  );
}

function DropShadowConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Posición</Label>
        <Select value={p.position || 'bottom'} onValueChange={v => set('position', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top">Superior</SelectItem>
            <SelectItem value="bottom">Inferior</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ColorField label="Color sombra" value={p.color || '#000000'} onChange={v => set('color', v)} />
      <div>
        <Label className="text-xs">Intensidad</Label>
        <Select value={p.intensity || 'medium'} onValueChange={v => set('intensity', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="soft">Suave</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="strong">Fuerte</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SplitConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  const layouts = ['50/50', '33/67', '67/33', '33/33/33', '25/75', '75/25'];
  return (
    <div className="space-y-3">
      <Label className="text-xs">Layout</Label>
      <div className="grid grid-cols-3 gap-1">
        {layouts.map(l => (
          <Button key={l} variant={p.layout === l ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => {
            const colCount = l.split('/').length;
            const cols = Array.from({ length: colCount }, (_, i) => p.columns?.[i] || []);
            set('layout', l);
            set('columns', cols);
          }}>
            {l}
          </Button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Cada columna acepta bloques de texto, imagen y botón dentro.</p>
    </div>
  );
}

function ColumnsConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <Label className="text-xs">Número de columnas</Label>
      <div className="flex gap-2">
        {[2, 3, 4].map(n => (
          <Button key={n} variant={p.count === n ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-4" onClick={() => {
            const cols = Array.from({ length: n }, (_, i) => p.columns?.[i] || []);
            set('count', n);
            set('columns', cols);
          }}>
            {n}
          </Button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">En mobile se apilan verticalmente.</p>
    </div>
  );
}

function SectionConfig({ p, set }: { p: any; set: (k: string, v: any) => void }) {
  return (
    <div className="space-y-3">
      <ColorField label="Color fondo" value={p.bgColor || '#f9fafb'} onChange={v => set('bgColor', v)} />
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Padding ↑</Label><Input type="number" value={p.paddingTop || 20} onChange={e => set('paddingTop', +e.target.value)} className="h-8 text-xs" /></div>
        <div><Label className="text-xs">Padding ↓</Label><Input type="number" value={p.paddingBottom || 20} onChange={e => set('paddingBottom', +e.target.value)} className="h-8 text-xs" /></div>
        <div><Label className="text-xs">Padding ←</Label><Input type="number" value={p.paddingLeft || 20} onChange={e => set('paddingLeft', +e.target.value)} className="h-8 text-xs" /></div>
        <div><Label className="text-xs">Padding →</Label><Input type="number" value={p.paddingRight || 20} onChange={e => set('paddingRight', +e.target.value)} className="h-8 text-xs" /></div>
      </div>
      <ColorField label="Color borde" value={p.borderColor || ''} onChange={v => set('borderColor', v)} />
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Grosor borde</Label><Input type="number" value={p.borderWidth || 0} onChange={e => set('borderWidth', +e.target.value)} className="h-8 text-xs" /></div>
        <div><Label className="text-xs">Radius borde</Label><Input type="number" value={p.borderRadius || 0} onChange={e => set('borderRadius', +e.target.value)} className="h-8 text-xs" /></div>
      </div>
    </div>
  );
}
