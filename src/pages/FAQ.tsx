import { Link } from 'react-router-dom';
import { ArrowLeft, HelpCircle, Store, Brain, BarChart3, Shield, CreditCard } from 'lucide-react';
import { SteveFooter } from '@/components/steve-landing/SteveFooter';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const categories = [
  {
    icon: Brain,
    title: 'Sobre Steve',
    color: 'bg-violet-50 text-violet-600',
    faqs: [
      {
        q: '¿Qué es Steve y cómo funciona?',
        a: 'Steve es un asistente de marketing impulsado por IA que se conecta a tu tienda Shopify, tus campañas de Meta Ads y Google Ads. Analiza tus métricas reales de ventas y publicidad para generar copias publicitarias de alto rendimiento, insights estratégicos y asesoría personalizada 24/7.',
      },
      {
        q: '¿Necesito experiencia en marketing digital para usar Steve?',
        a: 'No. Steve está diseñado para ser accesible tanto para principiantes como para expertos. Te guía paso a paso con recomendaciones claras y accionables basadas en tus datos reales. Si eres experto, Steve potencia tu trabajo con análisis automatizados y generación de copias en segundos.',
      },
      {
        q: '¿Puedo usar Steve sin Shopify?',
        a: 'Sí. Aunque la integración con Shopify potencia las recomendaciones al máximo, puedes usar Steve conectando solo Meta Ads o Google Ads. También puedes acceder al chat AI y al generador de copias de forma independiente.',
      },
    ],
  },
  {
    icon: Store,
    title: 'Conexión e Integraciones',
    color: 'bg-green-50 text-green-600',
    faqs: [
      {
        q: '¿Cómo conecto mi tienda Shopify?',
        a: 'Desde el panel de Steve, haz clic en "Conectar Shopify". Ingresa el dominio de tu tienda (ejemplo: mi-tienda.myshopify.com) y autoriza el acceso. Steve comenzará a sincronizar tus datos automáticamente en segundos.',
      },
      {
        q: '¿Cómo conecto Meta Ads?',
        a: 'Desde el panel de conexiones, haz clic en "Conectar Meta Ads". Serás redirigido a Facebook para autorizar el acceso a tus cuentas publicitarias. Una vez autorizado, Steve sincronizará las métricas de tus campañas cada 6 horas.',
      },
      {
        q: '¿Google Ads está disponible?',
        a: 'Sí. La integración con Google Ads permite sincronizar métricas de campañas y generar copias optimizadas para Search, Display y Performance Max, todo basado en datos reales de tu cuenta.',
      },
    ],
  },
  {
    icon: BarChart3,
    title: 'Métricas y Datos',
    color: 'bg-blue-50 text-blue-600',
    faqs: [
      {
        q: '¿Qué datos de mi tienda accede Steve?',
        a: 'Steve accede a métricas de ventas (ingresos, pedidos, AOV), datos de productos (títulos, descripciones, precios, inventario), métricas de campañas de Meta y Google Ads (gastos, clics, conversiones). Toda la información se usa exclusivamente para generar análisis y copias para tu negocio.',
      },
      {
        q: '¿Cada cuánto se actualizan los datos?',
        a: 'Los datos de Shopify, Meta Ads y Google Ads se sincronizan automáticamente cada 6 horas. También puedes forzar una sincronización manual desde el dashboard en cualquier momento.',
      },
    ],
  },
  {
    icon: Shield,
    title: 'Seguridad y Privacidad',
    color: 'bg-red-50 text-red-600',
    faqs: [
      {
        q: '¿Mis datos están seguros?',
        a: 'Sí. Todos los tokens de acceso se almacenan encriptados (AES-256). Utilizamos OAuth 2.0 con validación HMAC, protección CSRF, y Row Level Security (RLS) en la base de datos para que cada usuario solo pueda acceder a sus propios datos.',
      },
      {
        q: '¿Qué pasa con mis datos si desinstalo la app?',
        a: 'Al desinstalar, desactivamos inmediatamente el acceso a tu tienda y eliminamos tu token de acceso. Dentro de las 48 horas siguientes eliminamos definitivamente todos los datos asociados a tu tienda, conforme a las políticas de GDPR y Shopify.',
      },
      {
        q: '¿Steve comparte mis datos con terceros?',
        a: 'No. Nunca vendemos, compartimos ni transferimos tus datos a terceros. Tu información se procesa exclusivamente dentro de nuestra plataforma para brindarte el servicio.',
      },
    ],
  },
  {
    icon: CreditCard,
    title: 'Planes y Precios',
    color: 'bg-amber-50 text-amber-600',
    faqs: [
      {
        q: '¿Cuánto cuesta Steve?',
        a: 'Steve ofrece un plan gratuito con funcionalidades básicas. Los planes PRO incluyen créditos mensuales para generar más copias y acceder a análisis avanzados, asesoría estratégica ilimitada y métricas en tiempo real.',
      },
      {
        q: '¿Puedo cambiar de plan en cualquier momento?',
        a: 'Sí. Puedes actualizar o cambiar tu plan en cualquier momento desde tu panel de administración. Los cambios se aplican de forma inmediata.',
      },
    ],
  },
];

export default function FAQ() {
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
              <HelpCircle className="h-6 w-6 text-violet-400" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Preguntas Frecuentes</h1>
              <p className="text-slate-400 text-sm mt-1">Todo lo que necesitas saber sobre Steve</p>
            </div>
          </div>
          <p className="text-slate-300 mt-4 max-w-2xl">
            Encuentra respuestas a las preguntas más comunes sobre nuestra plataforma, integraciones, seguridad y precios.
          </p>
        </div>
      </div>

      <main className="flex-1 py-16">
        <div className="container max-w-4xl mx-auto px-6 space-y-10">
          {categories.map((cat, catIdx) => {
            const Icon = cat.icon;
            return (
              <section key={catIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 pt-8 pb-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${cat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">{cat.title}</h2>
                </div>
                <div className="px-8 pb-6">
                  <Accordion type="single" collapsible className="w-full">
                    {cat.faqs.map((faq, i) => (
                      <AccordionItem key={i} value={`${catIdx}-${i}`} className="border-slate-100">
                        <AccordionTrigger className="text-left text-sm font-medium text-slate-800 hover:text-slate-900 py-4">
                          {faq.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-slate-600 leading-relaxed pb-4">
                          {faq.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </section>
            );
          })}

          {/* Contact CTA */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-8 text-center">
            <h3 className="text-white font-bold text-lg mb-2">¿No encontraste tu respuesta?</h3>
            <p className="text-slate-400 text-sm mb-4">Escríbenos y te responderemos en menos de 24 horas.</p>
            <a
              href="mailto:jmbarros@bgconsult.cl"
              className="inline-flex items-center gap-2 bg-white text-slate-900 font-medium text-sm px-6 py-2.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Contactar soporte
            </a>
          </div>
        </div>
      </main>
      <SteveFooter />
    </div>
  );
}
