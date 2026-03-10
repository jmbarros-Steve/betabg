import { useReveal } from '@/hooks/useReveal';
import { MessageSquare, FileText, ShoppingBag, Mail, DollarSign, Search, Plug } from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'Chat con Steve AI',
    description: 'Tu consultor de marketing 24/7. Pregunta sobre estrategia, analisis y optimizacion.',
    color: 'bg-blue-50 text-blue-600',
    span: false,
  },
  {
    icon: FileText,
    title: 'Generacion de Copies',
    description: 'Headlines, textos de anuncios y descripciones generados con AI para Meta y Google.',
    color: 'bg-purple-50 text-purple-600',
    span: false,
  },
  {
    icon: ShoppingBag,
    title: 'Shopify Analytics',
    description: 'Metricas de ventas, productos top, y reportes sincronizados en tiempo real.',
    color: 'bg-green-50 text-green-600',
    span: false,
  },
  {
    icon: Mail,
    title: 'Email Marketing Inteligente',
    description: 'Disena flujos de email, genera contenido y analiza metricas de Klaviyo. Automatiza welcome series, abandoned cart y post-purchase.',
    color: 'bg-orange-50 text-orange-600',
    span: true,
  },
  {
    icon: DollarSign,
    title: 'Control Financiero',
    description: 'Ad spend, revenue, ROAS y profit consolidados por canal y campana.',
    color: 'bg-emerald-50 text-emerald-600',
    span: false,
  },
  {
    icon: Search,
    title: 'Analisis de Competencia',
    description: 'Escanea anuncios, estrategias y posicionamiento de tus competidores con web scraping AI. Identifica oportunidades y gaps en el mercado.',
    color: 'bg-red-50 text-red-600',
    span: true,
  },
  {
    icon: Plug,
    title: 'Hub de Integraciones',
    description: 'Shopify, Meta, Google Ads y Klaviyo conectados en un solo lugar.',
    color: 'bg-indigo-50 text-indigo-600',
    span: false,
  },
];

export function FeatureBento() {
  const ref = useReveal();

  return (
    <section id="integraciones" className="bg-white py-20 md:py-28">
      <div ref={ref} className="reveal max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Capacidades que impulsan tu crecimiento
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Herramientas de marketing potenciadas por AI, integradas en una sola plataforma.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`group bg-white border border-slate-200 rounded-xl p-6 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 ${
                  feature.span ? 'md:col-span-2' : ''
                } reveal-delay-${Math.min(i + 1, 5)}`}
              >
                <div className={`w-10 h-10 rounded-lg ${feature.color} flex items-center justify-center mb-4`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
