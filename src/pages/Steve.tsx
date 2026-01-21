import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Dog, Briefcase, GraduationCap, FileText, Check, 
  Sparkles, Globe, BookOpen, Award, Plane, Coffee,
  ArrowRight, Mail, Lock, Clock, Target, TrendingUp,
  DollarSign, BarChart3, Zap, Users, Tag, Bot
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { passwordSchema } from '@/lib/password-validation';
import { PasswordStrengthMeter } from '@/components/ui/password-strength-meter';
import logo from '@/assets/logo.jpg';
import avatarSteve from '@/assets/avatar-steve.png';

const navLinks = [
  { name: 'Steve', to: '/steve', icon: Dog, active: true },
  { name: 'Corporativo', to: '/servicios-corporativos', icon: Briefcase },
  { name: 'Estudios', to: '/centro-estudios', icon: GraduationCap },
  { name: 'Blog', to: '/blog', icon: FileText },
];

const agencyServices = [
  { 
    icon: Sparkles, 
    title: 'Copies que Venden', 
    description: 'IA entrenada en metodologías de Sabri Suby, Allan Dib y Russell Brunson para crear textos que convierten.',
    features: ['Meta Ads (TOFU, MOFU, BOFU)', 'Google Ads (Search & Display)', 'Video Scripts & Hooks']
  },
  { 
    icon: BarChart3, 
    title: 'Análisis de Métricas', 
    description: 'Conecta tus plataformas y obtén insights accionables de tu rendimiento.',
    features: ['Ventas y órdenes Shopify', 'ROAS y MER', 'CAC y Break-even']
  },
  { 
    icon: Mail, 
    title: 'Email Marketing', 
    description: 'Planificación estratégica de flujos y campañas para Klaviyo.',
    features: ['Secuencias automatizadas', 'Campañas estacionales', 'Recuperación de carritos']
  },
  { 
    icon: DollarSign, 
    title: 'Apoyo Financiero', 
    description: 'Configura tus costos y márgenes para entender tu rentabilidad real.',
    features: ['P&L estimado', 'Análisis de profit', 'Pricing óptimo']
  },
  { 
    icon: Tag, 
    title: 'Promociones', 
    description: 'Crea descuentos directamente en Shopify sin salir de la plataforma.',
    features: ['Códigos de descuento', 'Ofertas por tiempo', 'Bundles y packs']
  },
  { 
    icon: Users, 
    title: 'Buyer Persona', 
    description: 'Un brief estratégico de 40 preguntas para que Steve entienda tu marca.',
    features: ['Perfil de cliente ideal', 'Tono de comunicación', 'Propuesta de valor']
  },
];

const plans = [
  {
    name: 'Free',
    price: 'Gratis',
    priceNote: 'Para siempre',
    description: 'Prueba el poder de Steve',
    features: [
      '2 generaciones/mes',
      '1 conexión de plataforma',
      'Buyer Persona básico',
      'Copies Meta Ads',
    ],
    cta: 'Comenzar Gratis',
    popular: false,
  },
  {
    name: 'Starter',
    price: '$20.000 CLP',
    priceNote: '/mes',
    description: 'Para emprendedores',
    features: [
      '50 generaciones/mes',
      '3 conexiones',
      'Copies Meta + Google Ads',
      'Métricas de Shopify',
      'Descuentos automáticos',
    ],
    cta: 'Elegir Starter',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$70.000 CLP',
    priceNote: '/mes',
    description: 'Para equipos en crecimiento',
    features: [
      '150 generaciones/mes',
      '10 conexiones',
      'Todo de Starter +',
      'Klaviyo Planner',
      'Análisis ROAS & Profit',
      'Video Scripts IA',
    ],
    cta: 'Elegir Pro',
    popular: true,
  },
  {
    name: 'Agency',
    price: '$100.000 CLP',
    priceNote: '/mes',
    description: 'Para agencias y empresas',
    features: [
      'Generaciones ilimitadas',
      'Conexiones ilimitadas',
      'Todo de Pro +',
      'Multi-cliente',
      'API Access',
      'Soporte prioritario',
    ],
    cta: 'Contactar',
    popular: false,
  },
];

const loginSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const signupSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  password: passwordSchema,
});

export default function Steve() {
  const [isLogin, setIsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect logged-in users to portal (using useEffect to avoid render-time navigation)
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/portal');
    }
  }, [user, authLoading, navigate]);

  // Show nothing while checking auth status
  if (authLoading) {
    return null;
  }

  // If user is logged in, don't render the page (redirect is happening)
  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const schema = isLogin ? loginSchema : signupSchema;
    const validation = schema.safeParse({ email, password });
    
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error('Credenciales incorrectas');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('¡Bienvenido de nuevo! 🐕');
          navigate('/portal');
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            toast.error('Este email ya está registrado');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('¡Cuenta creada! Bienvenido al equipo 🎉');
          navigate('/portal');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border"
      >
        <div className="container px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Consultoría BG" className="h-12 w-auto" />
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  to={link.to}
                  className={`flex items-center gap-2 text-sm uppercase tracking-widest transition-colors ${
                    link.active 
                      ? 'text-primary font-medium' 
                      : 'text-muted-foreground hover:text-primary'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.name}
                </Link>
              );
            })}
          </div>

          <Button 
            variant="default" 
            size="sm" 
            className="uppercase tracking-wider text-xs"
            onClick={() => setShowAuth(true)}
          >
            Comenzar
          </Button>
        </div>
      </motion.nav>

      {/* Hero Section with Steve's Story */}
      <section className="pt-32 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        
        <div className="container px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Steve's Image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="flex justify-center lg:order-2"
            >
              <div className="relative">
                <div className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden border-4 border-primary/20">
                  <img 
                    src={avatarSteve} 
                    alt="Steve el Bulldog" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="absolute -bottom-4 -right-4 bg-card border rounded-lg p-3 shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">PhD Stanford</span>
                  </div>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  className="absolute -top-4 -left-4 bg-card border rounded-lg p-3 shadow-lg"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">World Traveler</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Story */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="lg:order-1"
            >
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                <Clock className="w-3 h-3 mr-1" />
                Tu Agencia de Marketing 24/7
              </Badge>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-light mb-6 leading-tight">
                <span className="text-primary font-medium">Copies que venden</span>,
                <br />métricas que importan.
              </h1>

              <div className="prose prose-lg text-muted-foreground mb-8 space-y-4">
                <p>
                  <strong className="text-foreground">Steve es tu equipo de marketing completo.</strong>{" "}
                  Un asistente de IA entrenado con las metodologías de 
                  <strong className="text-foreground"> Sabri Suby</strong>, 
                  <strong className="text-foreground"> Allan Dib</strong> y 
                  <strong className="text-foreground"> Russell Brunson</strong> que trabaja 24/7 para tu negocio.
                </p>
                
                <p>
                  Conecta tu tienda Shopify y Steve analizará tus ventas, generará copies optimizados 
                  para <Badge variant="outline" className="mx-1">Meta Ads</Badge>
                  <Badge variant="outline" className="mx-1">Google Ads</Badge>
                  <Badge variant="outline" className="mx-1">Klaviyo</Badge>, 
                  calculará tu rentabilidad real y te ayudará a crear promociones que convierten.
                </p>

                <p>
                  <strong className="text-foreground">No más agencias caras. No más esperas.</strong>{" "}
                  Con Steve tienes acceso inmediato a copies profesionales, análisis financiero 
                  y planificación de email marketing — todo basado en los datos reales de tu negocio.
                </p>

                <p className="text-foreground font-medium">
                  <Zap className="w-5 h-5 inline mr-2 text-primary" />
                  Genera tu primer copy en menos de 5 minutos. ¿Te animas?
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" className="uppercase tracking-wider" onClick={() => setShowAuth(true)}>
                  Comenzar Gratis
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button size="lg" variant="outline" className="uppercase tracking-wider" asChild>
                  <a href="#servicios">Ver Qué Hace Steve</a>
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-12 bg-muted/30 border-y border-border">
        <div className="container px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold">Disponible 24/7</h3>
              <p className="text-sm text-muted-foreground">Trabaja cuando tú lo necesites</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold">IA Entrenada</h3>
              <p className="text-sm text-muted-foreground">Aprende tu marca y tono</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold">Multi-Plataforma</h3>
              <p className="text-sm text-muted-foreground">Meta, Google, Klaviyo y más</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold">Data-Driven</h3>
              <p className="text-sm text-muted-foreground">Basado en tus métricas reales</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services - What Steve Does */}
      <section id="servicios" className="py-20 bg-background">
        <div className="container px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge className="mb-4">Tu Agencia Completa</Badge>
            <h2 className="text-3xl md:text-4xl font-light mb-4">
              Todo lo que <span className="text-primary font-medium">Steve</span> hace por ti
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Un equipo de marketing completo potenciado por IA, disponible cuando lo necesites
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agencyServices.map((service, index) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <service.icon className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{service.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {service.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planes" className="py-20 bg-card">
        <div className="container px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge className="mb-4">Planes Mensuales</Badge>
            <h2 className="text-3xl md:text-4xl font-light mb-4">
              Elige tu <span className="text-primary font-medium">Plan</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Desde gratis hasta infinito. Tú decides qué tan en serio vas con tu marketing.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full relative ${plan.popular ? 'border-primary border-2 shadow-lg' : ''}`}>
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Más Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-4">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {plan.priceNote && <span className="text-muted-foreground">{plan.priceNote}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button 
                      className="w-full" 
                      variant={plan.popular ? 'default' : 'outline'}
                      onClick={() => setShowAuth(true)}
                    >
                      {plan.cta}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Auth Modal */}
      {showAuth && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowAuth(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-card border rounded-lg p-8 w-full max-w-md shadow-xl"
          >
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                <img src={avatarSteve} alt="Steve" className="w-full h-full object-cover" />
              </div>
            </div>

            <h2 className="text-xl font-semibold text-center mb-2">
              {isLogin ? '¡Woof! Bienvenido de vuelta' : '¡Hola! Soy Steve 🐕'}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {isLogin ? 'Ingresa para continuar' : 'Crea tu cuenta y comencemos a trabajar'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-email" className="text-xs uppercase tracking-widest">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-password" className="text-xs uppercase tracking-widest">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="auth-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11"
                    required
                  />
                </div>
                {!isLogin && <PasswordStrengthMeter password={password} />}
                {!isLogin && (
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Cargando...' : isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground tracking-widest">O continúa con</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={async () => {
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${window.location.origin}/portal`
                  }
                });
                if (error) {
                  toast.error('Error al iniciar sesión con Google');
                }
              }}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar con Google
            </Button>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
              </button>
            </div>

            <button 
              onClick={() => setShowAuth(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
