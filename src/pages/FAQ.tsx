import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const faqs = [
  {
    q: '¿Qué es Steve y cómo funciona?',
    a: 'Steve es un asistente de marketing impulsado por IA que se conecta directamente a tu tienda Shopify. Analiza tus métricas de ventas, productos y datos de campañas para generar copias publicitarias de alto rendimiento para Meta y Google Ads, además de brindarte asesoría estratégica 24/7.',
  },
  {
    q: '¿Qué datos de mi tienda accede Steve?',
    a: 'Steve accede a métricas de ventas (ingresos, pedidos, AOV), datos de productos (títulos, descripciones, precios) y, si conectas Meta Ads, también a métricas de campañas publicitarias. Toda la información se usa exclusivamente para generar análisis y copias para tu negocio. No vendemos ni compartimos datos con terceros.',
  },
  {
    q: '¿Necesito experiencia en marketing digital para usar Steve?',
    a: 'No. Steve está diseñado para ser accesible tanto para principiantes como para expertos. Te guía paso a paso y genera recomendaciones claras y accionables basadas en tus datos reales.',
  },
  {
    q: '¿Cómo conecto Meta Ads?',
    a: 'Desde el panel de Steve, haz clic en "Conectar Meta Ads". Serás redirigido a Facebook para autorizar el acceso. Una vez autorizado, Steve comenzará a sincronizar las métricas de tus campañas automáticamente.',
  },
  {
    q: '¿Google Ads está disponible?',
    a: 'La integración con Google Ads está actualmente en desarrollo. Steve ya puede generar copias optimizadas para Google Ads basándose en tus datos de Shopify, pero la sincronización directa de métricas de Google Ads estará disponible próximamente.',
  },
  {
    q: '¿Qué pasa con mis datos si desinstalo la app?',
    a: 'Al desinstalar, desactivamos inmediatamente el acceso a tu tienda y eliminamos tu token de acceso. Dentro de las 48 horas siguientes, Shopify nos notifica para eliminar definitivamente todos los datos asociados a tu tienda, conforme a las políticas de GDPR y Shopify.',
  },
  {
    q: '¿Cuánto cuesta Steve?',
    a: 'Steve ofrece un plan gratuito con funcionalidades básicas. Los planes premium están basados en créditos mensuales que te permiten generar más copias y acceder a análisis avanzados. Consulta los detalles de precios dentro de la app.',
  },
  {
    q: '¿Puedo usar Steve sin Shopify?',
    a: 'Sí. Steve también está disponible como plataforma web independiente en consultoriabg.com, donde puedes acceder a servicios de consultoría en marketing digital, incluyendo gestión de campañas en Meta y Google Ads.',
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>

          <h1 className="text-3xl font-bold mb-2">Preguntas Frecuentes</h1>
          <p className="text-muted-foreground mb-8">Todo lo que necesitas saber sobre Steve y la plataforma de Consultoría BG.</p>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </main>
      <Footer />
    </div>
  );
}
