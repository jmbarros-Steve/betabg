import { useReveal } from '@/hooks/useReveal';

const testimonials = [
  {
    name: 'Maria Gonzalez',
    role: 'Fundadora, Bloom Skincare',
    avatar: 'MG',
    quote: 'Steve me ahorra horas cada semana en la gestion de campanas. El copy que genera convierte increiblemente bien.',
    metric: '+45% ROAS en 2 meses',
    color: 'bg-[#D6E0F0] text-[#162D5F]',
  },
  {
    name: 'Carlos Mendez',
    role: 'CMO, FitWear Chile',
    avatar: 'CM',
    quote: 'El análisis de competencia es brutal. Descubrimos gaps en el mercado que nos dieron ventaja competitiva real.',
    metric: '3x más rápido en research',
    color: 'bg-purple-100 text-purple-700',
  },
  {
    name: 'Ana Torres',
    role: 'Ecommerce Manager, PetStore',
    avatar: 'AT',
    quote: 'Tener Shopify, Meta y Klaviyo en un solo lugar cambio completamente nuestro workflow de marketing.',
    metric: '-60% tiempo en reportes',
    color: 'bg-emerald-100 text-emerald-700',
  },
];

export function TestimonialsSection() {
  const ref = useReveal();

  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Lo que dicen nuestros usuarios
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Equipos de e-commerce que ya confian en Steve para su marketing.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <div
              key={t.name}
              className={`bg-white rounded-xl border border-slate-200 p-6 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 reveal-delay-${i + 1}`}
            >
              {/* Avatar & info */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center font-bold text-sm`}>
                  {t.avatar}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.role}</p>
                </div>
              </div>

              {/* Quote */}
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                "{t.quote}"
              </p>

              {/* Metric badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" /></svg>
                {t.metric}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
