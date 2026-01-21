import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink, CheckCircle, Sparkles, BarChart3, Mail, Tag, TrendingUp, Zap } from 'lucide-react';
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

export default function ShopifyEmbedded() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const shop = searchParams.get('shop');

  useEffect(() => {
    // Detect if we're inside Shopify admin iframe
    const inIframe = window.self !== window.top;

    // If user is logged in, redirect to portal
    if (!loading && user) {
      if (inIframe) {
        // Open portal in new tab when in iframe
        window.open('https://betabg.lovable.app/portal', '_blank');
      } else {
        navigate('/portal');
      }
    }
  }, [user, loading, navigate]);

  const handleGoToPortal = () => {
    window.open('https://betabg.lovable.app/portal', '_blank');
  };

  const handleLogin = () => {
    window.open('https://betabg.lovable.app/auth', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4">
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <img src={logoSteve} alt="Steve" className="h-16 mx-auto" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Steve - Tu Copiloto de Marketing
            </h1>
            <p className="text-muted-foreground">
              IA que aprende de tu marca y genera copies que venden
            </p>
          </div>
        </div>

        {shop && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-primary/10 text-primary p-3 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            <span>Tienda conectada: <strong>{shop}</strong></span>
          </div>
        )}

        {/* Features Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {features.map((feature, index) => (
            <Card key={index} className="border-border/50">
              <CardContent className="p-4 text-center">
                <feature.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold text-sm text-foreground">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold text-foreground">
              Accede a todas las funciones
            </h2>
            
            <Button 
              onClick={handleGoToPortal} 
              className="w-full gap-2" 
              size="lg"
            >
              Ir al Portal de Steve
              <ExternalLink className="h-4 w-4" />
            </Button>
            
            <p className="text-xs text-muted-foreground">
              Se abrirá en una nueva pestaña
            </p>
          </CardContent>
        </Card>

        {/* Login help */}
        {!user && (
          <Card className="border-border/50">
            <CardContent className="p-4 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                ¿Primera vez? Revisa tu email para tus credenciales de acceso.
              </p>
              <Button 
                variant="outline" 
                onClick={handleLogin}
                size="sm"
              >
                Iniciar Sesión
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Plan info */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Plan Free: 2 generaciones/mes • 1 conexión • Buyer Persona básico</p>
          <p>Actualiza tu plan en el portal para más funciones</p>
        </div>
      </div>
    </div>
  );
}
