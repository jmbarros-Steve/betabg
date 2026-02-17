import { Link } from 'react-router-dom';
import { ArrowLeft, Store, BarChart3, Megaphone, MessageSquare, Palette } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  {
    icon: Store,
    title: '1. Instala Steve en tu tienda Shopify',
    description: 'Busca "Steve – AI Marketing Copilot" en el Shopify App Store e instálalo. La app se conectará automáticamente a tu tienda y comenzará a sincronizar tus datos de ventas.',
  },
  {
    icon: Palette,
    title: '2. Completa tu Brand Brief',
    description: 'Steve te guiará para crear un Brand Brief estratégico con tu propuesta de valor, público objetivo, tono de marca y diferenciadores. Este brief es la base para generar copias publicitarias alineadas con tu marca.',
  },
  {
    icon: BarChart3,
    title: '3. Revisa tus métricas',
    description: 'En el panel principal verás tus métricas de Shopify sincronizadas: ingresos, pedidos, AOV, productos más vendidos y más. Steve usa estos datos para fundamentar sus recomendaciones.',
  },
  {
    icon: Megaphone,
    title: '4. Conecta Meta Ads (opcional)',
    description: 'Para potenciar las recomendaciones, conecta tu cuenta de Meta Ads. Steve analizará el rendimiento de tus campañas y generará copias optimizadas basándose en datos reales de tu tienda y tus anuncios.',
  },
  {
    icon: MessageSquare,
    title: '5. Genera copias y consulta a Steve',
    description: 'Usa el generador de copias para crear anuncios para Meta y Google Ads. También puedes chatear con Steve para obtener asesoría estratégica personalizada sobre marketing, precios, audiencias y más.',
  },
];

export default function Tutorial() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 py-16">
        <div className="container max-w-3xl px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>

          <h1 className="text-3xl font-bold mb-2">Tutorial: Cómo usar Steve</h1>
          <p className="text-muted-foreground mb-8">Guía paso a paso para sacar el máximo provecho de tu asistente de marketing con IA.</p>

          <div className="space-y-6">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <Card key={i} className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm ml-[52px]">{step.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-10 p-6 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">¿Necesitas ayuda?</p>
            <p>Si tienes alguna pregunta, puedes consultar nuestras <Link to="/faq" className="text-primary hover:underline">Preguntas Frecuentes</Link> o contactarnos directamente a través de nuestros canales oficiales.</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
