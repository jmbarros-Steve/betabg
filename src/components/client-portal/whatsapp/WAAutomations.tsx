import { useEffect, useState } from 'react';
import { Zap, ShoppingCart, Gift, MessageSquare, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: any;
  template_body: string;
  is_active: boolean;
  total_sent: number;
  total_converted: number;
  created_at: string;
}

interface Props {
  clientId: string;
}

const TRIGGER_INFO: Record<string, { icon: typeof ShoppingCart; label: string; description: string }> = {
  abandoned_cart: {
    icon: ShoppingCart,
    label: 'Carrito abandonado',
    description: 'Cuando un cliente deja productos en el carrito sin comprar',
  },
  first_purchase: {
    icon: Gift,
    label: 'Bienvenida',
    description: 'Despues de la primera compra del cliente',
  },
  post_purchase: {
    icon: MessageSquare,
    label: 'Post-compra',
    description: 'Dias despues de una compra (seguimiento)',
  },
  winback: {
    icon: RefreshCw,
    label: 'Recompra',
    description: 'Cuando un cliente no compra hace 30+ dias',
  },
};

// Issue 6: Only abandoned_cart is functional — others are coming soon
const COMING_SOON_TRIGGERS = new Set(['first_purchase', 'post_purchase', 'winback']);

const DEFAULT_AUTOMATIONS = [
  {
    name: 'Carrito abandonado',
    trigger_type: 'abandoned_cart',
    trigger_config: { delay_minutes: 60 },
    template_name: 'abandoned_cart',
    template_body: 'Hola {{nombre}}! Vimos que dejaste {{producto}} en tu carrito. Todavia te interesa? Completalo aqui: {{link}}',
  },
  {
    name: 'Bienvenida nuevo cliente',
    trigger_type: 'first_purchase',
    trigger_config: { delay_minutes: 30 },
    template_name: 'welcome',
    template_body: 'Gracias por tu compra {{nombre}}! Bienvenido/a a nuestra tienda. Cualquier duda, escribenos por aqui.',
  },
  {
    name: 'Post-compra (3 dias)',
    trigger_type: 'post_purchase',
    trigger_config: { delay_minutes: 4320 },
    template_name: 'post_purchase',
    template_body: 'Hola {{nombre}}! Como te fue con tu pedido? Si tienes alguna duda, estamos aqui para ayudarte.',
  },
  {
    name: 'Recompra (30 dias)',
    trigger_type: 'winback',
    trigger_config: { delay_minutes: 43200 },
    template_name: 'winback',
    template_body: 'Hola {{nombre}}! Te extranamos. Tenemos novedades que te pueden gustar. Echa un vistazo: {{link}}',
  },
];

export function WAAutomations({ clientId }: Props) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAutomations();
  }, [clientId]);

  async function fetchAutomations() {
    setLoading(true);
    const { data } = await supabase
      .from('wa_automations' as any)
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (data && data.length > 0) {
      setAutomations(data as any[]);
    } else {
      // Create default automations for new merchants
      await createDefaults();
    }
    setLoading(false);
  }

  async function createDefaults() {
    const inserts = DEFAULT_AUTOMATIONS.map(a => ({
      ...a,
      client_id: clientId,
      is_active: false,
    }));

    const { data } = await supabase
      .from('wa_automations' as any)
      .insert(inserts)
      .select();

    setAutomations((data as any[]) || []);
  }

  async function toggleAutomation(auto: Automation, isActive: boolean) {
    // Issue 6: Block non-functional automations
    if (COMING_SOON_TRIGGERS.has(auto.trigger_type)) {
      toast.info('Esta automatizacion estara disponible proximamente');
      return;
    }

    const { error } = await supabase
      .from('wa_automations' as any)
      .update({ is_active: isActive })
      .eq('id', auto.id)
      .eq('client_id', clientId);

    if (error) {
      toast.error('Error al actualizar');
      return;
    }

    setAutomations(prev => prev.map(a => a.id === auto.id ? { ...a, is_active: isActive } : a));
    toast.success(isActive ? 'Automatizacion activada' : 'Automatizacion pausada');
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Automatizaciones
        </CardTitle>
        <p className="text-sm text-gray-500">
          Steve envia mensajes automaticos a tus clientes basado en su comportamiento.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {automations.map(auto => {
          const info = TRIGGER_INFO[auto.trigger_type];
          const Icon = info?.icon || Zap;
          const isComingSoon = COMING_SOON_TRIGGERS.has(auto.trigger_type);
          const convRate = auto.total_sent > 0
            ? Math.round((auto.total_converted / auto.total_sent) * 100)
            : 0;

          return (
            <div
              key={auto.id}
              className={`border rounded-lg p-4 transition-colors ${
                auto.is_active ? 'border-green-200 bg-green-50/30' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${auto.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Icon className={`h-5 w-5 ${auto.is_active ? 'text-green-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{auto.name}</p>
                      {isComingSoon && (
                        <Badge className="bg-gray-100 text-gray-500 text-xs">Proximamente</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{info?.description || auto.trigger_type}</p>
                    <p className="text-xs text-gray-400 mt-1 italic">"{auto.template_body.slice(0, 80)}..."</p>
                  </div>
                </div>
                <Switch
                  checked={auto.is_active}
                  onCheckedChange={(checked) => toggleAutomation(auto, checked)}
                  disabled={isComingSoon}
                />
              </div>

              {auto.total_sent > 0 && (
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-gray-600">Enviados: <strong>{auto.total_sent}</strong></span>
                  <span className="text-gray-600">Conversiones: <strong>{auto.total_converted}</strong></span>
                  <span className={`font-medium ${convRate >= 10 ? 'text-green-600' : 'text-gray-500'}`}>
                    {convRate}% tasa
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
