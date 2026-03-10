import { useReveal } from '@/hooks/useReveal';
import { UserPlus, Plug, Sparkles } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Crea tu cuenta gratis',
    description: 'Registrate en menos de 1 minuto. Sin tarjeta de credito, sin compromisos.',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
  },
  {
    number: '02',
    icon: Plug,
    title: 'Conecta tus plataformas',
    description: 'Vincula Shopify, Meta Ads, Google Ads y Klaviyo con OAuth seguro.',
    color: 'bg-purple-50 text-purple-600 border-purple-200',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Habla con Steve',
    description: 'Pide estrategias, genera copies, analiza competidores y optimiza tu marketing.',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  },
];

export function HowItWorks() {
  const ref = useReveal();

  return (
    <section className="bg-white py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Comienza en 3 simples pasos
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            De cero a tu primer insight de marketing en menos de 5 minutos.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line desktop */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-slate-200" />

          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className={`relative text-center reveal-delay-${i + 1}`}>
                {/* Number circle */}
                <div className="relative z-10 mx-auto mb-6">
                  <div className={`w-14 h-14 rounded-full ${step.color} border-2 flex items-center justify-center mx-auto`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center">
                    {step.number}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2 text-lg">{step.title}</h3>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
