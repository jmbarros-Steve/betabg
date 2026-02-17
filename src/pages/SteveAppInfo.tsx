import { Link } from 'react-router-dom';
import { Dog, BarChart3, Megaphone, MessageSquare, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Footer } from '@/components/landing/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import logo from '@/assets/logo-steve.png';

const features = [
  { icon: BarChart3, title: 'Métricas en tiempo real', desc: 'Sincroniza automáticamente ingresos, pedidos, AOV y productos más vendidos de tu tienda Shopify.' },
  { icon: Megaphone, title: 'Copias publicitarias con IA', desc: 'Genera headlines, descripciones y scripts para Meta Ads y Google Ads basados en tus datos reales.' },
  { icon: MessageSquare, title: 'Asesoría estratégica 24/7', desc: 'Consulta a Steve sobre precios, audiencias, embudos y estrategias de crecimiento en cualquier momento.' },
];

const benefits = [
  'Sin contratos ni compromisos a largo plazo',
  'Funciona con los datos de tu propia tienda',
  'Copias basadas en metodologías de Sabri Suby y Russell Brunson',
  'Conexión segura con OAuth 2.0 y encriptación de tokens',
  'Cumplimiento total con GDPR y políticas de Shopify',
];

export default function SteveAppInfo() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 border-b border-border">
          <div className="container max-w-4xl px-6 text-center">
            <div className="flex justify-center mb-6">
              <img src={logo} alt="Steve" className="h-20 w-20 rounded-2xl" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Steve – AI Marketing Copilot</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Tu agencia de marketing digital 24/7 dentro de Shopify. Analiza tus métricas, genera copias publicitarias de alto rendimiento y recibe asesoría estratégica con IA.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg">
                <Link to="/auth">
                  Crear cuenta gratis <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/faq">Ver preguntas frecuentes</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16">
          <div className="container max-w-4xl px-6">
            <h2 className="text-2xl font-bold text-center mb-10">¿Qué puedes hacer con Steve?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {features.map((f, i) => {
                const Icon = f.icon;
                return (
                  <Card key={i} className="border-border">
                    <CardContent className="pt-6">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{f.title}</h3>
                      <p className="text-sm text-muted-foreground">{f.desc}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-16 border-t border-border">
          <div className="container max-w-2xl px-6">
            <h2 className="text-2xl font-bold text-center mb-8">¿Por qué elegir Steve?</h2>
            <ul className="space-y-3">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-muted-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 border-t border-border">
          <div className="container max-w-2xl px-6 text-center">
            <Dog className="h-10 w-10 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3">¿Listo para empezar?</h2>
            <p className="text-muted-foreground mb-6">Crea tu cuenta gratuita y conecta tu tienda Shopify en minutos.</p>
            <Button asChild size="lg">
              <Link to="/auth">Registrarme ahora <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Al registrarte aceptas nuestros <Link to="/terminos" className="underline hover:text-foreground">Términos de Servicio</Link> y <Link to="/privacidad" className="underline hover:text-foreground">Política de Privacidad</Link>.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
