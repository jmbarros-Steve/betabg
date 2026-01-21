import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  TrendingUp, 
  Mail, 
  Tag, 
  BarChart3, 
  Zap,
  CheckCircle,
  ArrowRight,
  Play,
  Star,
  ShieldCheck,
  Clock,
  Users,
  ChevronDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Footer } from '@/components/landing/Footer';
import logoSteve from '@/assets/logo-steve.png';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoKlaviyo from '@/assets/logo-klaviyo-clean.png';
import logoGoogleAds from '@/assets/logo-google-ads.png';
import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const features = [
  {
    icon: Sparkles,
    title: 'Copies con IA',
    description: 'Genera headlines, textos y scripts de video para Meta Ads y Google Ads basados en tu Brand Brief.',
    color: 'from-violet-500 to-purple-600'
  },
  {
    icon: Tag,
    title: 'Descuentos Automáticos',
    description: 'Crea códigos de descuento directamente en tu tienda Shopify desde la plataforma.',
    color: 'from-green-500 to-emerald-600'
  },
  {
    icon: Mail,
    title: 'Email Marketing',
    description: 'Planifica secuencias de Welcome, Abandoned Cart y Winback listas para Klaviyo.',
    color: 'from-blue-500 to-cyan-600'
  },
  {
    icon: BarChart3,
    title: 'Métricas de Ventas',
    description: 'Visualiza ventas, órdenes, ticket promedio y tendencias de tu tienda Shopify.',
    color: 'from-orange-500 to-amber-600'
  },
  {
    icon: TrendingUp,
    title: 'ROAS & Profit',
    description: 'Calcula POAS, CAC, MER y Break-even ROAS con tus datos reales de ads.',
    color: 'from-pink-500 to-rose-600'
  },
  {
    icon: Zap,
    title: 'Integraciones',
    description: 'Conecta Meta Ads, Google Ads y Klaviyo para una visión 360° de tu marketing.',
    color: 'from-indigo-500 to-blue-600'
  }
];

const steps = [
  {
    number: '01',
    title: 'Instala la App',
    description: 'Busca "Steve" en Shopify App Store y autoriza los permisos necesarios.'
  },
  {
    number: '02',
    title: 'Completa tu Brief',
    description: 'Responde preguntas sobre tu marca, audiencia y productos para personalizar la IA.'
  },
  {
    number: '03',
    title: 'Genera Copies',
    description: 'Selecciona el tipo de campaña y obtén copies optimizados en segundos.'
  },
  {
    number: '04',
    title: 'Lanza Campañas',
    description: 'Copia los textos a Meta Ads o Google Ads y empieza a vender más.'
  }
];

const faqs = [
  {
    question: '¿Qué permisos necesita la app?',
    answer: 'Steve necesita acceso a tus pedidos (para métricas), analytics (para tendencias), y descuentos (para crear códigos). No accedemos a información de clientes ni datos sensibles.'
  },
  {
    question: '¿Cómo funciona la IA para generar copies?',
    answer: 'Nuestra IA está entrenada en metodologías probadas de copywriting (Russell Brunson, Sabri Suby). Usa la información de tu Brand Brief para crear textos personalizados para tu marca.'
  },
  {
    question: '¿Puedo usar Steve sin conectar Meta o Google?',
    answer: 'Sí, puedes usar Steve solo con Shopify. Las integraciones con Meta Ads, Google Ads y Klaviyo son opcionales y agregan funcionalidades adicionales.'
  },
  {
    question: '¿Los códigos de descuento se crean en mi tienda real?',
    answer: 'Sí, cuando creas un código desde Steve, se genera directamente en tu tienda Shopify con las condiciones que especifiques (porcentaje, duración, etc.).'
  },
  {
    question: '¿Hay límite de copies que puedo generar?',
    answer: 'El plan gratuito incluye generaciones limitadas por mes. Puedes ver tu uso actual en el dashboard. Próximamente habrá planes con más capacidad.'
  },
  {
    question: '¿Mis datos están seguros?',
    answer: 'Absolutamente. Usamos encriptación de grado bancario para tokens y credenciales. No almacenamos datos de clientes de tu tienda. Cumplimos con GDPR y políticas de privacidad de Shopify.'
  }
];

const testimonials = [
  {
    name: 'María González',
    company: 'Tienda Eco Chile',
    text: 'Steve me ahorra horas cada semana. Los copies que genera son mejores que los que yo escribía.',
    rating: 5
  },
  {
    name: 'Carlos Mendoza',
    company: 'SportMax',
    text: 'La integración con Shopify es perfecta. Crear descuentos desde la misma plataforma es genial.',
    rating: 5
  },
  {
    name: 'Ana Martínez',
    company: 'Belleza Natural',
    text: 'Por fin puedo ver todas mis métricas en un solo lugar. El dashboard es muy claro.',
    rating: 5
  }
];

export default function ShopifyApp() {
  const [activeScreenshot, setActiveScreenshot] = useState(0);

  const screenshots = [
    { title: 'Dashboard de Métricas', description: 'Visualiza ventas, órdenes y tendencias' },
    { title: 'Generador de Meta Ads', description: 'Crea copies para Facebook e Instagram' },
    { title: 'Generador de Google Ads', description: 'Headlines y descripciones optimizadas' },
    { title: 'Klaviyo Planner', description: 'Secuencias de email automatizadas' }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoSteve} alt="Steve" className="h-8 w-8" />
              <span className="font-semibold text-foreground">Steve</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/auth">
                <Button variant="ghost" size="sm">Iniciar Sesión</Button>
              </Link>
              <a 
                href="https://apps.shopify.com" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button variant="hero" size="sm" className="gap-2">
                  <img src={logoShopify} alt="Shopify" className="h-4 w-4" />
                  Instalar App
                </Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 bg-primary/10 text-primary border-primary/20">
              <img src={logoShopify} alt="Shopify" className="h-4 w-4 mr-2" />
              Disponible en Shopify App Store
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Tu Asistente de Marketing
              <span className="block text-primary">con Inteligencia Artificial</span>
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Genera copies para Meta Ads, Google Ads y emails. Crea descuentos en Shopify. 
              Analiza tus ventas. Todo desde una sola plataforma.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <a 
                href="https://apps.shopify.com" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button size="lg" variant="hero" className="gap-2 text-lg px-8">
                  <img src={logoShopify} alt="Shopify" className="h-5 w-5" />
                  Instalar Gratis
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </a>
              <Button size="lg" variant="outline" className="gap-2 text-lg px-8">
                <Play className="h-5 w-5" />
                Ver Demo
              </Button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span>Datos encriptados</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span>Setup en 2 minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span>+500 merchants</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-12 border-y border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground mb-6">
            SE INTEGRA CON TUS HERRAMIENTAS FAVORITAS
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            <img src={logoShopify} alt="Shopify" className="h-10 opacity-70 hover:opacity-100 transition-opacity" />
            <img src={logoMeta} alt="Meta" className="h-10 opacity-70 hover:opacity-100 transition-opacity" />
            <img src={logoGoogleAds} alt="Google Ads" className="h-10 opacity-70 hover:opacity-100 transition-opacity" />
            <img src={logoKlaviyo} alt="Klaviyo" className="h-10 opacity-70 hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Todo lo que necesitas para vender más
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Steve combina IA avanzada con integraciones nativas para potenciar tu marketing.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/30">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Cómo funciona
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              En 4 simples pasos estarás generando copies profesionales.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="text-6xl font-bold text-primary/10 mb-4">{step.number}</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
                {index < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute top-8 -right-4 h-6 w-6 text-primary/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots placeholder */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Mira Steve en acción
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Una interfaz simple y poderosa diseñada para merchants como tú.
            </p>
          </div>

          {/* Screenshot viewer */}
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-8 border border-primary/20">
            <div className="aspect-video bg-background rounded-xl border border-border flex items-center justify-center mb-6">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">Screenshot: {screenshots[activeScreenshot].title}</p>
                <p className="text-sm text-muted-foreground/60">{screenshots[activeScreenshot].description}</p>
              </div>
            </div>
            
            {/* Screenshot navigation */}
            <div className="flex justify-center gap-2">
              {screenshots.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveScreenshot(index)}
                  className={`w-3 h-3 rounded-full transition-all ${
                    index === activeScreenshot 
                      ? 'bg-primary w-8' 
                      : 'bg-primary/30 hover:bg-primary/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Lo que dicen nuestros usuarios
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-border/50">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-foreground mb-4">"{testimonial.text}"</p>
                  <div>
                    <p className="font-semibold text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.company}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Precio simple, sin sorpresas
            </h2>
          </div>

          <div className="max-w-md mx-auto">
            <Card className="border-primary/30 shadow-lg">
              <CardContent className="p-8 text-center">
                <Badge className="mb-4 bg-primary/10 text-primary">Más popular</Badge>
                <h3 className="text-2xl font-bold text-foreground mb-2">Plan Gratuito</h3>
                <div className="text-4xl font-bold text-foreground mb-1">$0</div>
                <p className="text-muted-foreground mb-6">para siempre</p>
                
                <ul className="text-left space-y-3 mb-8">
                  {[
                    'Generación de copies con IA',
                    'Integración con Shopify',
                    'Dashboard de métricas',
                    'Creación de descuentos',
                    'Soporte por email'
                  ].map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a 
                  href="https://apps.shopify.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button variant="hero" size="lg" className="w-full gap-2">
                    <img src={logoShopify} alt="Shopify" className="h-5 w-5" />
                    Instalar Ahora
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Preguntas Frecuentes
            </h2>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-background border border-border rounded-lg px-6"
              >
                <AccordionTrigger className="text-left text-foreground hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            ¿Listo para potenciar tu marketing?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Instala Steve gratis y empieza a generar copies que convierten.
          </p>
          <a 
            href="https://apps.shopify.com" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <Button size="lg" variant="hero" className="gap-2 text-lg px-8">
              <img src={logoShopify} alt="Shopify" className="h-5 w-5" />
              Instalar en Shopify
              <ArrowRight className="h-5 w-5" />
            </Button>
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
