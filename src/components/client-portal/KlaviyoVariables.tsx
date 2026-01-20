import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Variable {
  variable: string;
  label: string;
  description: string;
  example: string;
}

interface VariableCategory {
  name: string;
  variables: Variable[];
}

const klaviyoVariables: VariableCategory[] = [
  {
    name: 'Datos del Cliente',
    variables: [
      { variable: '{{ first_name }}', label: 'Nombre', description: 'Nombre del suscriptor', example: 'María' },
      { variable: '{{ last_name }}', label: 'Apellido', description: 'Apellido del suscriptor', example: 'García' },
      { variable: '{{ email }}', label: 'Email', description: 'Correo electrónico', example: 'maria@email.com' },
      { variable: '{{ phone_number }}', label: 'Teléfono', description: 'Número de teléfono', example: '+56912345678' },
    ],
  },
  {
    name: 'Carrito Abandonado',
    variables: [
      { variable: '{{ event.extra.line_items.0.product.title }}', label: 'Producto', description: 'Nombre del primer producto', example: 'Zapatillas Running' },
      { variable: '{{ event.extra.line_items.0.product.images.0.src }}', label: 'Imagen', description: 'URL de imagen del producto', example: 'https://...' },
      { variable: '{{ event.extra.line_items.0.line_price }}', label: 'Precio', description: 'Precio del producto', example: '$49.990' },
      { variable: '{{ event.extra.checkout_url }}', label: 'Link Checkout', description: 'URL para completar compra', example: 'https://tienda.com/checkout/...' },
      { variable: '{{ event.extra.total_price }}', label: 'Total Carrito', description: 'Monto total del carrito', example: '$89.990' },
    ],
  },
  {
    name: 'Pedidos',
    variables: [
      { variable: '{{ event.extra.order_number }}', label: 'N° Pedido', description: 'Número de orden', example: '#1234' },
      { variable: '{{ event.extra.total_price }}', label: 'Total', description: 'Total de la orden', example: '$99.990' },
      { variable: '{{ event.extra.shipping_address.city }}', label: 'Ciudad', description: 'Ciudad de envío', example: 'Santiago' },
      { variable: '{{ event.extra.fulfillment_status }}', label: 'Estado', description: 'Estado del pedido', example: 'Enviado' },
    ],
  },
  {
    name: 'Descuentos',
    variables: [
      { variable: '{{ coupon_code }}', label: 'Código', description: 'Código de descuento', example: 'BIENVENIDO10' },
      { variable: '{{ event.extra.discounts.0.code }}', label: 'Descuento Aplicado', description: 'Código usado en el carrito', example: 'SALE20' },
    ],
  },
  {
    name: 'Tienda',
    variables: [
      { variable: '{{ organization.name }}', label: 'Nombre Tienda', description: 'Nombre de tu marca', example: 'Mi Tienda' },
      { variable: '{{ organization.url }}', label: 'URL Tienda', description: 'Link a tu tienda', example: 'https://mitienda.com' },
    ],
  },
];

interface KlaviyoVariablesProps {
  onInsert?: (variable: string) => void;
  compact?: boolean;
}

export function KlaviyoVariables({ onInsert, compact = false }: KlaviyoVariablesProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    compact ? null : 'Datos del Cliente'
  );
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  async function copyVariable(variable: string) {
    try {
      await navigator.clipboard.writeText(variable);
      setCopiedVariable(variable);
      toast.success('Variable copiada');
      setTimeout(() => setCopiedVariable(null), 2000);
      
      if (onInsert) {
        onInsert(variable);
      }
    } catch (error) {
      toast.error('Error al copiar');
    }
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Variables Klaviyo
        </p>
        <div className="flex flex-wrap gap-1">
          {klaviyoVariables.flatMap(cat => cat.variables).slice(0, 8).map((v) => (
            <Badge
              key={v.variable}
              variant="secondary"
              className="cursor-pointer hover:bg-primary/20 transition-colors text-xs"
              onClick={() => copyVariable(v.variable)}
            >
              {copiedVariable === v.variable ? (
                <Check className="w-3 h-3 mr-1" />
              ) : (
                <Copy className="w-3 h-3 mr-1" />
              )}
              {v.label}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Variables de Personalización</p>
        <Badge variant="outline" className="text-xs">Klaviyo</Badge>
      </div>
      
      <div className="space-y-2">
        {klaviyoVariables.map((category) => (
          <div key={category.name} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedCategory(
                expandedCategory === category.name ? null : category.name
              )}
              className="w-full flex items-center justify-between p-3 bg-background hover:bg-muted/50 transition-colors text-left"
            >
              <span className="text-sm font-medium">{category.name}</span>
              {expandedCategory === category.name ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            
            {expandedCategory === category.name && (
              <div className="border-t divide-y">
                {category.variables.map((v) => (
                  <div
                    key={v.variable}
                    className="flex items-center justify-between p-2 px-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                          {v.variable}
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {v.description} • Ej: {v.example}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyVariable(v.variable)}
                    >
                      {copiedVariable === v.variable ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <p className="text-xs text-muted-foreground pt-2">
        Haz clic en una variable para copiarla y pegarla en el asunto o contenido del email.
      </p>
    </div>
  );
}
