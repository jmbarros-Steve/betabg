import { useReveal } from '@/hooks/useReveal';
import { Check, Minus } from 'lucide-react';
import { PLAN_SLUGS, PLAN_INFO, formatPriceCLP, type PlanSlug } from '@/lib/plan-features';

interface PricingSectionProps {
  onOpenAuth: () => void;
}

const planFeatures: Record<PlanSlug, string[]> = {
  visual: [
    'Dashboard métricas unificado',
    'Shopify: productos, órdenes, ventas',
    'Meta Ads: ver campañas y métricas',
    'Klaviyo: métricas y flows',
    'Google Ads: ver campañas',
    'Instagram: feed y métricas',
    'Steve Chat básico',
    'Brand Brief completo',
    'Conectar 4+ plataformas',
    'Academy: cursos básicos',
  ],
  estrategia: [
    'Todo lo de Visual, más:',
    'Análisis de rendimiento IA (Meta, Google)',
    'Steve Estrategia: diagnóstico de marca',
    'Plan de marketing mensual IA',
    'Deep Dive: análisis de competencia',
    'Generador de copies IA',
    'Reportes avanzados + semanal',
    'Chonga: asistente de contenido',
    'Contenido avanzado en Academy',
    'Gestión de usuarios',
  ],
  full: [
    'Todo lo de Estrategia, más:',
    'Crear y editar campañas Meta Ads',
    'Crear campañas Google Ads',
    'Klaviyo: crear campañas + editor',
    'Steve Mail: diseño + envío',
    'WhatsApp: mensajes + automatizaciones',
    'Ejecución desde Steve Chat',
    'Publicar copies a plataformas',
    'Generación de imágenes IA',
    'Widget descuento en tienda',
  ],
};

export function PricingSection({ onOpenAuth }: PricingSectionProps) {
  const ref = useReveal();

  return (
    <section id="planes" className="bg-slate-50 py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Elige el plan que necesita tu negocio
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Desde visualización de datos hasta ejecución completa con IA. Todos los planes incluyen soporte.
          </p>
        </div>

        {/* 3 Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLAN_SLUGS.map((slug) => {
            const plan = PLAN_INFO[slug];
            const features = planFeatures[slug];
            const isPopular = slug === 'estrategia';

            return (
              <div
                key={slug}
                className={`relative rounded-2xl bg-white p-8 shadow-lg transition-all hover:shadow-xl ${
                  isPopular
                    ? 'border-2 border-[#1E3A7B] ring-2 ring-[#1E3A7B]/10 scale-[1.02]'
                    : 'border border-slate-200'
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[#1E3A7B] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                      Más popular
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="text-center mb-6">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${plan.headerColor} mb-3`}>
                    <plan.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {plan.emoji} {plan.nombre}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">{plan.tagline}</p>
                </div>

                {/* Price */}
                <div className="text-center mb-6">
                  <div className="text-3xl font-bold text-slate-900">
                    {formatPriceCLP(plan.priceMonthly)}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">CLP / mes + IVA</p>
                </div>

                {/* Features */}
                <div className="space-y-3 mb-8">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      {feature.startsWith('Todo lo de') ? (
                        <Minus className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Check className="w-4 h-4 text-[#1E3A7B] mt-0.5 flex-shrink-0" />
                      )}
                      <span className={feature.startsWith('Todo lo de') ? 'font-semibold text-slate-800' : ''}>
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <a
                  href="https://meetings.hubspot.com/jose-manuel15"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full py-3 rounded-lg font-semibold text-center transition-colors ${
                    isPopular
                      ? 'bg-[#1E3A7B] text-white hover:bg-[#162D5F]'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  Agendar reunión
                </a>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center mt-10">
          <p className="text-sm text-slate-400">
            *Precios en CLP. Sin compromiso. Te mostramos la plataforma en 15 minutos.
          </p>
          <a
            href="https://wa.me/15559061514?text=Hola%20Steve%2C%20quiero%20saber%20más%20de%20los%20planes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 text-sm text-slate-500 hover:text-[#25D366] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            ¿Prefieres chatear? Escríbele a Steve por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
