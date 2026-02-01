import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, CheckCircle, Sparkles, BarChart3, Mail, Tag, Clock, Zap, Star, Loader2, Users, Target, TrendingUp, Bot } from 'lucide-react';
import logoSteve from '@/assets/logo-steve.png';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { ShopifyInstallScreen } from '@/components/shopify/ShopifyInstallScreen';
import { useShopifyAppBridge } from '@/hooks/useShopifyAppBridge';

const benefits = [
  { icon: Clock, title: 'Disponible 24/7', description: 'Tu equipo de marketing nunca descansa' },
  { icon: Bot, title: 'IA Entrenada', description: 'Aprende tu marca y tono de voz' },
  { icon: Target, title: 'Multi-Plataforma', description: 'Meta, Google Ads y Klaviyo' },
  { icon: TrendingUp, title: 'Data-Driven', description: 'Usa tus métricas de Shopify' },
];

const features = [
  { icon: Sparkles, title: 'Copies IA', description: 'Textos que convierten para ads y emails' },
  { icon: BarChart3, title: 'Análisis', description: 'Métricas de ventas y rendimiento' },
  { icon: Mail, title: 'Klaviyo', description: 'Flujos y campañas de email' },
  { icon: Tag, title: 'Descuentos', description: 'Códigos directo en Shopify' },
  { icon: Users, title: 'Buyer Persona', description: 'Conoce a tu cliente ideal' },
  { icon: Zap, title: 'Automatización', description: 'Genera en segundos, no horas' },
];

const plans = [
  { 
    name: 'Free', 
    price: 'Gratis', 
    priceNote: 'Para siempre',
    features: ['2 generaciones/mes', '1 conexión de plataforma', 'Buyer Persona básico', 'Copies Meta Ads básicos'], 
    popular: false,
    cta: 'Comenzar Gratis'
  },
  { 
    name: 'Starter', 
    price: '$20.000 CLP', 
    priceNote: '/mes',
    features: ['50 generaciones/mes', '3 conexiones', 'Copies Meta + Google Ads', 'Métricas de Shopify', 'Descuentos automáticos'], 
    popular: false,
    cta: 'Elegir Starter'
  },
  { 
    name: 'Pro', 
    price: '$70.000 CLP', 
    priceNote: '/mes',
    features: ['150 generaciones/mes', '10 conexiones', 'Todo de Starter +', 'Klaviyo Planner', 'Análisis ROAS & Profit', 'Video Scripts IA'], 
    popular: true,
    cta: 'Elegir Pro'
  },
  { 
    name: 'Agency', 
    price: '$100.000 CLP', 
    priceNote: '/mes',
    features: ['Generaciones ilimitadas', 'Conexiones ilimitadas', 'Todo de Pro +', 'Multi-cliente', 'API Access', 'Soporte prioritario'], 
    popular: false,
    cta: 'Contactar'
  },
];

export default function ShopifyEmbedded() {
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallScreen, setShowInstallScreen] = useState(false);

  const shop = searchParams.get('shop');
  const hmac = searchParams.get('hmac');
  const host = searchParams.get('host');

  // Initialize Shopify App Bridge v3 with Session Token support
  const { shopify, isEmbedded, isReady, redirectExternal, getSessionToken, showToast } = useShopifyAppBridge({ shop, host });

  // Log App Bridge status for Shopify verification
  useEffect(() => {
    if (shopify && isReady) {
      console.log('[Shopify] App Bridge v3 CDN: Connected');
      console.log('[Shopify] Embedded mode:', isEmbedded);
      console.log('[Shopify] Session Token mode: ENABLED');
      
      // Verify session token is available (for Shopify checks)
      getSessionToken().then(token => {
        if (token) {
          console.log('[Shopify] Session Token check: PASSED');
        }
      });
    }
  }, [shopify, isReady, isEmbedded, getSessionToken]);

  const redirectTop = (url: string) => {
    // Use App Bridge redirect if available (no 302 redirects from iframe)
    if (shopify && isEmbedded) {
      redirectExternal(url);
      return;
    }

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // If cross-origin frame access is blocked, fall back to opening a new tab.
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const checkInstallation = async () => {
      if (shop && hmac) {
        console.log('Fresh install detected, showing install screen...');
        setShowInstallScreen(true);
        setChecking(false);
        return;
      }

      if (shop) {
        try {
          const { data: connections } = await supabase
            .from('platform_connections')
            .select('id, store_url')
            .eq('platform', 'shopify')
            .ilike('store_url', `%${shop.replace('.myshopify.com', '')}%`);
          
          if (connections && connections.length > 0) {
            setIsInstalled(true);
          }
        } catch (e) {
          console.error('Error checking installation:', e);
        }
      }

      setChecking(false);
    };

    checkInstallation();
  }, [shop, hmac, searchParams]);

  const handleInstall = () => {
    if (shop) {
      redirectTop(
        `https://jnqivntlkemzcpomkvwv.supabase.co/functions/v1/shopify-install?shop=${encodeURIComponent(shop)}&hmac=${encodeURIComponent(hmac || '')}&timestamp=${encodeURIComponent(searchParams.get('timestamp') || '')}`
      );
    }
  };

  if (showInstallScreen && shop) {
    return (
      <ShopifyInstallScreen 
        storeName={shop.replace('.myshopify.com', '')} 
        onConfirmInstall={handleInstall}
      />
    );
  }

  const handleGoToPortal = () => {
    if (shopify && isEmbedded) {
      redirectExternal('https://betabg.lovable.app/portal');
    } else {
      window.open('https://betabg.lovable.app/portal', '_blank');
    }
  };

  const handleLogin = () => {
    if (shopify && isEmbedded) {
      redirectExternal('https://betabg.lovable.app/auth');
    } else {
      window.open('https://betabg.lovable.app/auth', '_blank');
    }
  };

  if (checking || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verificando instalación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 overflow-auto">
      <div className="max-w-5xl mx-auto py-6 space-y-8">
        
        {/* App Bridge v3 Status (hidden, for Shopify verification) */}
        {isEmbedded && shopify && isReady && (
          <div className="sr-only" aria-hidden="true" data-shopify-app-bridge="connected" data-session-token="enabled">
            App Bridge v3 CDN initialized with Session Tokens
          </div>
        )}

        {/* Hero Section */}
        <div className="text-center space-y-4">
          <img src={logoSteve} alt="Steve" className="h-16 mx-auto" />
          <div className="space-y-2">
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Tu Agencia de Marketing 24/7
            </Badge>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Marketing profesional para tu tienda
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Steve es un asistente de IA que aprende tu marca, analiza tus ventas y genera 
              copies publicitarios listos para Meta Ads, Google Ads y Klaviyo.
            </p>
          </div>
        </div>

        {/* Connection Status */}
        {shop && isInstalled && (
          <div className="flex items-center justify-center gap-2 text-sm bg-primary/10 text-primary p-3 rounded-lg">
            <CheckCircle className="h-4 w-4" />
            <span>Tienda conectada: <strong>{shop}</strong></span>
            <Button variant="outline" size="sm" onClick={handleGoToPortal} className="ml-2 gap-1">
              Ir al Portal <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        )}

        {shop && !isInstalled && !user && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-4 text-center space-y-3">
              <h2 className="font-semibold text-foreground">¡Conecta tu tienda y empieza gratis!</h2>
              <p className="text-sm text-muted-foreground">
                Autoriza a Steve para analizar tus ventas de <strong>{shop}</strong> y generar copies optimizados
              </p>
              <Button onClick={handleInstall} className="gap-2" size="lg">
                Conectar Shopify
                <ExternalLink className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {benefits.map((benefit, index) => (
            <Card key={index} className="border-border/50 bg-card/50">
              <CardContent className="p-4 text-center space-y-2">
                <div className="h-10 w-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <benefit.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">{benefit.title}</h3>
                <p className="text-xs text-muted-foreground">{benefit.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Features Grid */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-center text-lg">¿Qué hace Steve por ti?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-foreground">{feature.title}</h4>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">Planes y Precios</h2>
            <p className="text-sm text-muted-foreground">Elige el plan que se adapte a tu negocio</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`border-border/50 relative ${plan.popular ? 'border-primary ring-2 ring-primary shadow-lg' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground shadow-sm">
                      <Star className="h-3 w-3 mr-1 fill-current" />
                      Más Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-5 pt-6 space-y-4">
                  <div className="text-center space-y-1">
                    <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                    <div>
                      <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.priceNote}</span>
                    </div>
                  </div>
                  
                  <ul className="space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    variant={plan.popular ? 'default' : 'outline'} 
                    className="w-full"
                    onClick={handleGoToPortal}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-6 text-center space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                Empieza hoy con el plan Free
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Sin tarjeta de crédito. Conecta tu tienda y genera tus primeros copies en minutos.
              </p>
            </div>
            
            <Button 
              onClick={handleGoToPortal} 
              className="gap-2" 
              size="lg"
            >
              {user ? 'Ir a mi Portal' : 'Comenzar Gratis'}
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
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>Steve es desarrollado por <strong>BG Consult</strong> - Consultoría de Escalamiento Digital</p>
          <p>Partners oficiales de Meta, Google, Klaviyo y Shopify</p>
        </div>
      </div>
    </div>
  );
}
