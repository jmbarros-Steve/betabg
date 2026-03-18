import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tag } from 'lucide-react';

interface VariableGroup {
  label: string;
  variables: { key: string; label: string }[];
}

const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: '👤 Perfil del Suscriptor',
    variables: [
      { key: '{{ first_name }}', label: 'Nombre' },
      { key: '{{ last_name }}', label: 'Apellido' },
      { key: '{{ email }}', label: 'Email' },
      { key: '{{ phone_number }}', label: 'Teléfono' },
      { key: '{{ organization }}', label: 'Empresa' },
    ],
  },
  {
    label: '🛍️ Shopify',
    variables: [
      { key: '{{ person.shopify.city }}', label: 'Ciudad' },
      { key: '{{ person.shopify.total_spent }}', label: 'Total gastado' },
      { key: '{{ person.shopify.orders_count }}', label: 'Nº pedidos' },
      { key: '{{ person.shopify.last_order_date }}', label: 'Fecha último pedido' },
    ],
  },
  {
    label: '📦 Evento (Flows)',
    variables: [
      { key: '{{ event.value }}', label: 'Valor del evento' },
      { key: '{{ event.items.0.product.title }}', label: 'Producto del evento' },
      { key: '{{ event.extra.discount_code }}', label: 'Código descuento usado' },
    ],
  },
  {
    label: '📅 Fecha',
    variables: [
      { key: '{{ current_date }}', label: 'Fecha actual' },
      { key: '{{ current_year }}', label: 'Año actual' },
    ],
  },
];

export const PRODUCT_DYNAMIC_VARIABLES = {
  lastViewed: [
    { key: '{{ item.product.title }}', label: 'Nombre' },
    { key: '{{ item.product.image }}', label: 'Imagen' },
    { key: '{{ item.product.price }}', label: 'Precio' },
    { key: '{{ item.product.url }}', label: 'Link' },
  ],
  abandonedCart: [
    { key: '{{ event.items.0.product.title }}', label: 'Nombre' },
    { key: '{{ event.items.0.product.image }}', label: 'Imagen' },
    { key: '{{ event.items.0.product.price }}', label: 'Precio' },
    { key: '{{ event.items.0.product.url }}', label: 'Link' },
  ],
  recommended: [
    { key: '{{ recommended_products.0.title }}', label: 'Nombre' },
    { key: '{{ recommended_products.0.image }}', label: 'Imagen' },
    { key: '{{ recommended_products.0.price }}', label: 'Precio' },
    { key: '{{ recommended_products.0.url }}', label: 'Link' },
  ],
};

interface VariablePickerProps {
  onSelect: (variable: string) => void;
  compact?: boolean;
}

/** @deprecated Renamed — use default import. Kept for backwards compat. */
export default function KlaviyoVariablePicker({ onSelect, compact }: VariablePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={compact ? "h-6 px-2 text-[10px]" : "h-7 px-2 text-xs"}>
          <Tag className="w-3 h-3 mr-1" />
          Insertar variable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <ScrollArea className="max-h-[320px]">
          <div className="p-2 space-y-3">
            {VARIABLE_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-semibold text-muted-foreground px-1 mb-1">{group.label}</p>
                <div className="space-y-0.5">
                  {group.variables.map(v => (
                    <button
                      key={v.key}
                      className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted text-left text-xs transition-colors"
                      onClick={() => { onSelect(v.key); setOpen(false); }}
                    >
                      <span className="text-muted-foreground">{v.label}</span>
                      <code className="text-[10px] font-mono bg-muted px-1 rounded">{v.key}</code>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
