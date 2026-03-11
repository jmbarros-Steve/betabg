import { useReveal } from '@/hooks/useReveal';
import { Check, Sparkles } from 'lucide-react';

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
            Un solo plan. Todo incluido.
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Sin limites, sin sorpresas. Accede a toda la plataforma.
          </p>
        </div>

        {/* Single PRO Card */}
        <div className="max-w-xl mx-auto relative">
          {/* Beta Badge */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
            <span className="inline-flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-orange-200">
              <Sparkles className="w-3.5 h-3.5" />
              OFERTA BETA — 50% OFF
            </span>
          </div>

          <div className="border-2 border-blue-600 rounded-2xl bg-white p-8 md:p-10 shadow-xl shadow-blue-50">
            {/* Header */}
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 mb-1">PRO</h3>
              <p className="text-sm text-slate-500">Acceso completo a toda la plataforma</p>
            </div>

            {/* Pricing */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-1">
                <span className="text-lg text-slate-400 line-through">$250/mes</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Precio normal</span>
              </div>
              <div className="flex items-center justify-center gap-3 mb-3">
                <span className="text-2xl text-slate-400 line-through">$200/mes</span>
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Anual -20%</span>
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl md:text-6xl font-extrabold text-slate-900">$125</span>
                <span className="text-xl text-slate-500 font-medium">/mes</span>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Facturado anualmente — <strong className="text-slate-700">$1,500/ano</strong>
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-200 my-6" />

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
            <button
              onClick={onOpenAuth}
              className="w-full bg-blue-600 text-white py-3.5 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors"
            >
              Comenzar PRO
            </button>

            {/* Note */}
            <p className="text-center text-xs text-slate-400 mt-4">
              Suscripcion anual obligatoria. Precio regular $200/mes al terminar periodo beta.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
