import { Link } from 'react-router-dom';
import { ArrowLeft, GraduationCap, Store, Palette, BarChart3, Megaphone, MessageSquare, Zap, Target, Mail } from 'lucide-react';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';

const steps = [
  {
    icon: Store,
    number: '01',
    title: 'Conecta tu tienda Shopify',
    description: 'Desde el panel de Steve, ingresa el dominio de tu tienda (ej: mi-tienda.myshopify.com). Autoriza el acceso y Steve comenzará a sincronizar tus datos de ventas, productos e inventario automáticamente.',
    color: 'from-green-500 to-emerald-600',
    tips: ['La sincronización inicial toma menos de 30 segundos', 'Los datos se actualizan automáticamente cada 6 horas'],
  },
  {
    icon: Palette,
    number: '02',
    title: 'Completa tu Brand Brief',
    description: 'Steve te guiará para crear un Brand Brief estratégico con tu propuesta de valor, público objetivo, tono de marca y diferenciadores. Este brief es la base para generar copias publicitarias alineadas con tu identidad.',
    color: 'from-violet-500 to-purple-600',
    tips: ['Mientras más detallado sea tu brief, mejores serán las copias generadas', 'Puedes editarlo en cualquier momento'],
  },
  {
    icon: BarChart3,
    number: '03',
    title: 'Revisa tus métricas',
    description: 'En el dashboard verás tus KPIs principales: ingresos, pedidos, AOV, productos más vendidos, carros abandonados y funnel de conversión. Steve usa estos datos para fundamentar todas sus recomendaciones.',
    color: 'from-blue-500 to-cyan-600',
    tips: ['Incluye métricas de Shopify, Meta Ads y Google Ads en un solo lugar', 'Exporta reportes semanales automáticos por email'],
  },
  {
    icon: Megaphone,
    number: '04',
    title: 'Conecta Meta Ads',
    description: 'Conecta tu cuenta de Meta Ads para potenciar las recomendaciones. Steve analizará el rendimiento de tus campañas, calculará tu ROAS y CPA, y generará copias optimizadas basándose en lo que realmente funciona.',
    color: 'from-blue-600 to-indigo-600',
    tips: ['Opcional pero recomendado para resultados óptimos', 'También puedes conectar Google Ads'],
  },
  {
    icon: MessageSquare,
    number: '05',
    title: 'Chatea con Steve',
    description: 'Consulta a Steve sobre estrategia de marketing, precios, audiencias, competencia y más. Steve conoce tus datos reales y te da recomendaciones personalizadas y accionables, no respuestas genéricas.',
    color: 'from-amber-500 to-orange-600',
    tips: ['Steve recuerda el contexto entre conversaciones', 'Pregunta sobre tu competencia, tendencias y oportunidades'],
  },
  {
    icon: Zap,
    number: '06',
    title: 'Genera copias publicitarias',
    description: 'Usa el generador de copias para crear anuncios para Meta Ads (imagen, video, carrusel) y Google Ads (Search, Display, Performance Max). Las copias se basan en tus datos reales y tu Brand Brief.',
    color: 'from-rose-500 to-pink-600',
    tips: ['Genera múltiples variantes y elige la mejor', 'CRITERIO evalúa automáticamente la calidad de cada copia'],
  },
  {
    icon: Target,
    number: '07',
    title: 'Analiza y optimiza',
    description: 'Revisa el rendimiento de tus campañas con métricas detalladas. Steve detecta automáticamente campañas con fatiga creativa, sugiere ajustes de precio para productos y te alerta sobre oportunidades de mejora.',
    color: 'from-teal-500 to-emerald-600',
    tips: ['El detector de fatiga creativa corre diariamente', 'Recibe sugerencias de precios basadas en demanda e inventario'],
  },
  {
    icon: Mail,
    number: '08',
    title: 'Automatiza emails y WhatsApp',
    description: 'Configura flows automatizados de email marketing con Steve Mail y recupera carros abandonados via WhatsApp. Todo integrado con tus datos de Shopify para mensajes personalizados.',
    color: 'from-indigo-500 to-violet-600',
    tips: ['Flows de bienvenida, carrito abandonado y post-compra', 'Templates drag & drop estilo Klaviyo'],
  },
];

export default function Tutorial() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container max-w-4xl mx-auto px-6 py-20">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Tutorial: Cómo usar Steve</h1>
              <p className="text-slate-400 text-sm mt-1">Guía paso a paso</p>
            </div>
          </div>
          <p className="text-slate-300 mt-4 max-w-2xl">
            Sigue estos pasos para configurar tu cuenta y sacar el máximo provecho de tu asistente de marketing con IA.
          </p>
        </div>
      </div>

      <main className="flex-1 py-16">
        <div className="container max-w-4xl mx-auto px-6">
          <div className="space-y-6">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start gap-4 sm:gap-6">
                      <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shrink-0 shadow-lg`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Paso {step.number}</span>
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-4">{step.description}</p>
                        <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                          {step.tips.map((tip, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                              <div className="h-1 w-1 rounded-full bg-slate-400 shrink-0" />
                              {tip}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Help CTA */}
          <div className="mt-10 bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-8 text-center">
            <h3 className="text-white font-bold text-lg mb-2">¿Necesitas ayuda?</h3>
            <p className="text-slate-400 text-sm mb-4">Consulta nuestras preguntas frecuentes o escríbenos directamente.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/faq" className="inline-flex items-center gap-2 bg-white text-slate-900 font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-slate-100 transition-colors">
                Preguntas Frecuentes
              </Link>
              <a href="mailto:jmbarros@bgconsult.cl" className="inline-flex items-center gap-2 bg-white/10 text-white font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-white/20 transition-colors border border-white/10">
                Contactar soporte
              </a>
            </div>
          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
