import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle, Sparkles, BarChart3, Mail, Tag, TrendingUp, Zap, Star } from 'lucide-react';
import logoSteve from '@/assets/logo-steve.png';
import { useAuth } from '@/hooks/useAuth';

const features = [
  {
    icon: Sparkles,
    title: 'Copies con IA',
    description: 'Meta Ads, Google Ads y scripts de video',
  },
  {
    icon: BarChart3,
    title: 'Métricas',
    description: 'Ventas, órdenes y tendencias',
  },
  {
    icon: Mail,
    title: 'Email Marketing',
    description: 'Secuencias para Klaviyo',
  },
  {
    icon: Tag,
    title: 'Descuentos',
    description: 'Códigos directo en Shopify',
  },
  {
    icon: TrendingUp,
    title: 'ROAS & Profit',
    description: 'CAC, MER y Break-even',
  },
  {
    icon: Zap,
    title: 'Integraciones',
    description: 'Meta, Google y Klaviyo',
  },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/mes',
    features: ['2 generaciones/mes', '1 conexión', 'Buyer Persona básico'],
    popular: false,
  },
  {
    name: 'Starter',
    price: '$20.000',
    period: '/mes',
    features: ['50 generaciones/mes', '3 conexiones', 'Copy Meta Ads', 'Copy Google Ads'],
    popular: false,
  },
  {
    name: 'Pro',
    price: '$70.000',
    period: '/mes',
    features: ['150 generaciones/mes', '10 conexiones', 'Klaviyo Planner', 'Métricas avanzadas'],
    popular: true,
  },
  {
    name: 'Agency',
    price: '$100.000',
    period: '/mes',
    features: ['Generaciones ilimitadas', 'Conexiones ilimitadas', 'Múltiples clientes', 'Soporte prioritario'],
    popular: false,
  },
];

export default function ShopifyEmbedded() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const shop = searchParams.get('shop');

  const handleGoToPortal = () => {
    window.open('https://betabg.lovable.app/portal', '_blank');
  };

  const handleLogin = () => {
    window.open('https://betabg.lovable.app/auth', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 overflow-auto">
      <div className="max-w-4xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={logoSteve} alt="Steve" className="h-14 mx-auto" />
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Steve - Tu Copiloto de Marketing
            </h1>
            <p className="text-sm text-muted-foreground">
              IA que aprende de tu marca y genera copies que venden
            </p>
          </div>
        </div>

        {shop && (
          <div className="flex items-center justify-center gap-2 text-sm bg-primary/10 text-primary p-2 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            <span>Conectado: <strong>{shop}</strong></span>
          </div>
        )}

        {/* Features Grid */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {features.map((feature, index) => (
            <Card key={index} className="border-border/50">
              <CardContent className="p-3 text-center">
                <feature.icon className="h-6 w-6 mx-auto mb-1 text-primary" />
                <h3 className="font-medium text-xs text-foreground">{feature.title}</h3>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Plans */}
        <div>
          <h2 className="text-center text-lg font-semibold text-foreground mb-4">Planes</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`border-border/50 ${plan.popular ? 'border-primary ring-1 ring-primary' : ''}`}
              >
                <CardContent className="p-4 text-center space-y-2">
                  {plan.popular && (
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Popular
                    </Badge>
                  )}
                  <h3 className="font-bold text-foreground">{plan.name}</h3>
                  <div>
                    <span className="text-xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">{plan.period}</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-1 justify-center">
                        <CheckCircle className="h-3 w-3 text-primary flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 text-center space-y-3">
            <Button 
              onClick={handleGoToPortal} 
              className="w-full max-w-xs gap-2" 
              size="lg"
            >
              {user ? 'Ir al Portal' : 'Comenzar Gratis'}
              <ExternalLink className="h-4 w-4" />
            </Button>
            
            {!user && (
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">¿Ya tienes cuenta?</span>
                <Button variant="link" onClick={handleLogin} className="p-0 h-auto">
                  Iniciar Sesión
                </Button>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground">
              Se abrirá en una nueva pestaña
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
