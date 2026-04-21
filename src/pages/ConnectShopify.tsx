import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store, ArrowRight, Shield, Zap, CheckCircle, Lock, User } from 'lucide-react';
import logo from '@/assets/logo.jpg';
import logoShopify from '@/assets/logo-shopify-clean.png';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'https://steve-api-850416724643.us-central1.run.app';

function buildInstallUrl(domain: string, host?: string | null): string {
  const url = new URL(`${API_BASE}/api/shopify-install`);
  url.searchParams.set('shop', domain);
  if (host) url.searchParams.set('host', host);
  return url.toString();
}

const steps = [
  {
    icon: Shield,
    title: 'Autorización segura',
    description: 'Te redirigiremos a Shopify para autorizar la conexión de forma segura vía OAuth 2.0.',
  },
  {
    icon: User,
    title: 'Cuenta automática',
    description: 'Crearemos tu cuenta en Steve usando el email de tu tienda Shopify.',
  },
  {
    icon: Zap,
    title: 'Listo para usar',
    description: 'Serás redirigido al portal con acceso inmediato a todas las herramientas.',
  },
];

const features = [
  'Análisis de métricas en tiempo real',
  'Generación de copies con IA',
  'Creación de códigos de descuento',
  'Integración con Klaviyo y Meta Ads',
];

function normalizeShopDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/\/+$/, '');
  domain = domain.replace(/\/admin.*$/, '');
  if (!domain.includes('.myshopify.com')) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

const SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export default function ConnectShopify() {
  const [shopDomain, setShopDomain] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');

  // Auto-redirect: si llegamos con ?shop=... (caso Preferences URL desde admin de
  // Shopify, o install link directo), saltamos el formulario y vamos al OAuth.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shopParam = params.get('shop');
    const hostParam = params.get('host');
    if (!shopParam) return;

    const domain = normalizeShopDomain(shopParam);
    if (!SHOP_REGEX.test(domain)) {
      setError(`Dominio inválido en la URL: ${shopParam}`);
      return;
    }
    setIsRedirecting(true);
    window.location.href = buildInstallUrl(domain, hostParam);
  }, []);

  const handleConnect = () => {
    setError('');
    const domain = normalizeShopDomain(shopDomain);
    if (!SHOP_REGEX.test(domain)) {
      setError('Ingresa un dominio válido, ej: mi-tienda.myshopify.com');
      return;
    }
    setIsRedirecting(true);
    window.location.href = buildInstallUrl(domain);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl border border-slate-200">
        <CardHeader className="text-center pb-2">
          <img src={logo} alt="Steve" className="h-16 mx-auto mb-4" />
          <CardTitle className="text-2xl">Conectar con Shopify</CardTitle>
          <p className="text-muted-foreground mt-2">
            Ingresa el dominio de tu tienda para empezar
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg py-2 px-4">
            <Lock className="h-4 w-4 text-primary" />
            <span>Conexión cifrada y segura vía OAuth 2.0</span>
          </div>

          {/* Shop Domain Input */}
          <div className="space-y-2">
            <Label htmlFor="shop-domain">Dominio de tu tienda</Label>
            <div className="flex gap-2">
              <Input
                id="shop-domain"
                placeholder="mi-tienda.myshopify.com"
                value={shopDomain}
                onChange={(e) => {
                  setShopDomain(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                className="flex-1"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              También puedes escribir solo el nombre, ej: <strong>mi-tienda</strong>
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
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
            <h3 className="text-sm font-medium text-muted-foreground">
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
            onClick={handleConnect}
            className="w-full h-12 text-base bg-primary hover:bg-primary/90 rounded-lg"
            disabled={isRedirecting || !shopDomain.trim()}
          >
            {isRedirecting ? (
              <span className="animate-pulse">Redirigiendo a Shopify...</span>
            ) : (
              <>
                <img src={logoShopify} alt="Shopify" className="h-5 w-5 mr-2" />
                Conectar con Shopify
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Al conectar, aceptas nuestros{' '}
            <a href="/terminos" className="underline hover:text-foreground">
              Términos de Servicio
            </a>{' '}
            y{' '}
            <a href="/privacidad" className="underline hover:text-foreground">
              Política de Privacidad
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
