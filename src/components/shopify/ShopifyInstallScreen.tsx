import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Store, User, Zap, CheckCircle, ArrowRight, Lock } from 'lucide-react';
import logo from '@/assets/logo.jpg';

interface ShopifyInstallScreenProps {
  storeName: string;
  onConfirmInstall: () => void;
}

const steps = [
  {
    icon: Shield,
    title: 'Autorización segura',
    description: 'Te redirigiremos a Shopify para autorizar la conexión de forma segura.',
  },
  {
    icon: User,
    title: 'Cuenta automática',
    description: 'Crearemos tu cuenta en Steve usando el email de tu tienda.',
  },
  {
    icon: Zap,
    title: 'Listo para usar',
    description: 'Recibirás tus credenciales y podrás acceder al portal inmediatamente.',
  },
];

const features = [
  'Análisis de métricas en tiempo real',
  'Generación de copies con IA',
  'Creación de códigos de descuento',
  'Integración con Klaviyo y Meta Ads',
];

export function ShopifyInstallScreen({ storeName, onConfirmInstall }: ShopifyInstallScreenProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleConfirm = () => {
    setIsRedirecting(true);
    // Small delay for UX feedback
    setTimeout(() => {
      onConfirmInstall();
    }, 500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl border border-slate-200">
        <CardHeader className="text-center pb-2">
          <img src={logo} alt="Steve" className="h-16 mx-auto mb-4" />
          <CardTitle className="text-2xl">Conectar {storeName}</CardTitle>
          <p className="text-muted-foreground mt-2">
            Conecta tu tienda Shopify para acceder a todas las herramientas de Steve
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg py-2 px-4">
            <Lock className="h-4 w-4 text-primary" />
            <span>Conexión cifrada y segura vía OAuth 2.0</span>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-700">
              Cómo funciona
            </h3>
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div 
                  key={index} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">
              Lo que obtendrás
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <Button
            onClick={handleConfirm}
            className="w-full h-12 text-base bg-[#1E3A7B] hover:bg-[#162D5F] rounded-lg"
            disabled={isRedirecting}
          >
            {isRedirecting ? (
              <>
                <span className="animate-pulse">Redirigiendo a Shopify...</span>
              </>
            ) : (
              <>
                <Store className="h-5 w-5 mr-2" />
                Conectar con Shopify
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Al conectar, aceptas nuestros{' '}
            <a href="/terms" className="underline hover:text-foreground">
              Términos de Servicio
            </a>{' '}
            y{' '}
            <a href="/privacy" className="underline hover:text-foreground">
              Política de Privacidad
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
