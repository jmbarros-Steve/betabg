import { useState } from 'react';
import { useReveal } from '@/hooks/useReveal';
import { Check } from 'lucide-react';

interface PricingSectionProps {
  onOpenAuth: () => void;
}

const plans = [
  {
    name: 'Free',
    monthly: 0,
    annual: 0,
    description: 'Para explorar la plataforma',
    features: [
      'Chat con Steve (5 consultas/dia)',
      'Generacion de copies basica',
      '1 integracion',
      'Analytics basicos',
    ],
    cta: 'Comenzar Gratis',
    popular: false,
  },
  {
    name: 'Starter',
    monthly: 49,
    annual: 39,
    description: 'Para tiendas en crecimiento',
    features: [
      'Chat con Steve ilimitado',
      'Generacion de copies avanzada',
      '2 integraciones',
      'Analytics completos',
      'Analisis de competencia',
    ],
    cta: 'Comenzar',
    popular: false,
  },
  {
    name: 'Pro',
    monthly: 149,
    annual: 119,
    description: 'Para tiendas establecidas',
    features: [
      'Todo en Starter',
      'Todas las integraciones',
      'Generacion de imagenes AI',
      'Email marketing avanzado',
      'Reportes personalizados',
      'Soporte prioritario',
    ],
    cta: 'Comenzar',
    popular: true,
  },
  {
    name: 'Agency',
    monthly: null,
    annual: null,
    description: 'Para agencias y equipos grandes',
    features: [
      'Todo en Pro',
      'Multi-tenant (clientes ilimitados)',
      'API access',
      'White-label',
      'Account manager dedicado',
      'Onboarding personalizado',
    ],
    cta: 'Contactar',
    popular: false,
  },
];

export function PricingSection({ onOpenAuth }: PricingSectionProps) {
  const [annual, setAnnual] = useState(false);
  const ref = useReveal();

  return (
    <section id="planes" className="bg-white py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Planes para cada etapa
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto mb-8">
            Comienza gratis y escala cuando lo necesites.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 bg-slate-100 rounded-full p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                !annual ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                annual ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
              }`}
            >
              Anual
              <span className="ml-1.5 text-xs text-emerald-600 font-semibold">-20%</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border p-6 flex flex-col ${
                plan.popular
                  ? 'border-blue-600 shadow-lg shadow-blue-100 ring-1 ring-blue-600'
                  : 'border-slate-200'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Mas popular
                  </span>
                </div>
              )}

              <h3 className="font-bold text-slate-900 text-lg mb-1">{plan.name}</h3>
              <p className="text-sm text-slate-500 mb-4">{plan.description}</p>

              <div className="mb-6">
                {plan.monthly !== null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-slate-900">
                      ${annual ? plan.annual : plan.monthly}
                    </span>
                    <span className="text-slate-500 text-sm">/mes</span>
                  </div>
                ) : (
                  <span className="text-2xl font-bold text-slate-900">Personalizado</span>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={onOpenAuth}
                className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
