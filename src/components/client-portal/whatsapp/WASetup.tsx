import { useState } from 'react';
import { MessageCircle, Phone, Check, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  clientId: string;
  onSetupComplete: () => void;
}

export function WASetup({ clientId, onSetupComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'intro' | 'configuring' | 'done'>('intro');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  async function handleActivate() {
    setLoading(true);
    setStep('configuring');

    try {
      // Call backend to create Twilio sub-account + buy number
      // Get business name from supabase
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: clientInfo } = await supabase
        .from('clients')
        .select('name, company')
        .eq('id', clientId)
        .single();

      const businessName = clientInfo?.company || clientInfo?.name || 'Mi Tienda';

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || '';

      const response = await fetch(
        `${import.meta.env.VITE_CLOUD_RUN_URL || 'https://steve-api-850416724643.us-central1.run.app'}/api/whatsapp/setup-merchant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'provision', client_id: clientId, business_name: businessName }),
        }
      );

      if (!response.ok) {
        throw new Error('Error al configurar WhatsApp');
      }

      const data = await response.json();
      setPhoneNumber(data.phone_number);
      setStep('done');
      toast.success('WhatsApp activado correctamente');
    } catch (err) {
      toast.error('Error al activar WhatsApp. Contacta soporte.');
      setStep('intro');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">WhatsApp Activado</h2>
        <p className="text-gray-600 mb-2">Tu numero es:</p>
        <p className="text-3xl font-mono font-bold text-green-600 mb-4">{phoneNumber}</p>
        <p className="text-sm text-gray-500 mb-6">
          Tus clientes ya pueden escribirte. Steve respondera automaticamente.
          <br />Recibiste 100 creditos de regalo para empezar.
        </p>
        <Button onClick={onSetupComplete} className="bg-green-600 hover:bg-green-700">
          Ir al Inbox
        </Button>
      </div>
    );
  }

  if (step === 'configuring') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Loader2 className="h-12 w-12 animate-spin text-green-600 mx-auto mb-6" />
        <h2 className="text-xl font-bold mb-2">Configurando tu numero...</h2>
        <p className="text-gray-500">Esto puede tomar 15-30 segundos</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12">
      <Card className="border-green-200">
        <CardContent className="pt-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <MessageCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Activa WhatsApp para tu tienda</h2>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Tus clientes podran escribirte por WhatsApp y Steve respondera
            automaticamente como si fueras tu. Atencion 24/7 sin esfuerzo.
          </p>

          <div className="grid grid-cols-1 gap-3 mb-8 text-left">
            {[
              'Steve responde como tu tienda, 24/7',
              'Carrito abandonado automatico',
              'Tus clientes nunca saben que es IA',
              '100 creditos gratis de bienvenida',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <Button
            onClick={handleActivate}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-lg py-6"
          >
            <Phone className="h-5 w-5 mr-2" />
            Activar WhatsApp
          </Button>

          <p className="text-xs text-gray-400 mt-4">
            Se asignara un numero chileno a tu tienda. Puedes desactivarlo en cualquier momento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
