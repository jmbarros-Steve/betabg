import { useReveal } from '@/hooks/useReveal';
import { Check } from 'lucide-react';

interface PricingSectionProps {
  onOpenAuth: () => void;
}

const featuresLeft = [
  'Steve AI ilimitado (asesor 24/7)',
  'Estrategia AI y planes de marketing',
  'Brand Brief completo',
  'Meta Ads Manager (crear campanas)',
  'Generador de copies Meta + Google',
  'Imagenes AI (Google Imagen 4)',
  'Videos AI (Kling)',
];

const featuresRight = [
  'Dashboard metricas unificado',
  'Shopify Dashboard completo',
  'Klaviyo Campaign Studio',
  'Steve Mail (diseno + envio)',
  'Analisis de competencia + Deep Dive',
  'Social Inbox (Meta mensajes)',
  '4 integraciones + Soporte 24/7',
];

export function PricingSection({ onOpenAuth }: PricingSectionProps) {
  const ref = useReveal();

  return (
    <section id="planes" className="bg-slate-50 py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Todo lo que necesitas. Un solo lugar.
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Agenda una reunión y te mostramos cómo Steve puede potenciar tu e-commerce.
          </p>
        </div>

        {/* Features Card */}
        <div className="max-w-xl mx-auto relative">
          <div className="border-2 border-blue-600 rounded-2xl bg-white p-8 md:p-10 shadow-xl shadow-blue-50">
            {/* Header */}
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Plataforma PRO</h3>
              <p className="text-sm text-slate-500">Acceso completo a toda la plataforma</p>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 mb-8">
              <div className="space-y-3">
                {featuresLeft.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {featuresRight.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <a
              href="https://meetings.hubspot.com/jose-manuel15"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-blue-600 text-white py-3.5 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors text-center"
            >
              Agenda una reunión
            </a>

            <p className="text-center text-xs text-slate-400 mt-4">
              Sin compromiso. Te mostramos la plataforma en 15 minutos.
            </p>

            <a
              href="https://wa.me/15559061514?text=Hola%20Steve%2C%20quiero%20saber%20más%20de%20la%20plataforma"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 mt-4 text-sm text-slate-500 hover:text-[#25D366] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              ¿Prefieres chatear? Escríbele a Steve por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
