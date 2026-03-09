import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Copy,
  Key,
  Link2,
  Globe,
} from 'lucide-react';

interface ShopifyCustomAppWizardProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onConnected: () => void;
}

const TOTAL_STEPS = 5;

const REQUIRED_SCOPES = [
  { scope: 'read_orders', label: 'Pedidos' },
  { scope: 'read_analytics', label: 'Analíticas' },
  { scope: 'write_discounts', label: 'Crear descuentos' },
  { scope: 'read_discounts', label: 'Ver descuentos' },
  { scope: 'read_checkouts', label: 'Carritos abandonados' },
  { scope: 'read_products', label: 'Productos' },
];

const stepIcons = [ShoppingBag, Globe, Key, Link2, Loader2];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
  }),
};

const API_URL = import.meta.env.VITE_API_URL as string;
const APP_URL = API_URL; // Cloud Run URL for Shopify app config
const REDIRECT_URL = `${API_URL}/api/shopify-oauth-callback`;

export function ShopifyCustomAppWizard({
  open,
  onClose,
  clientId,
  onConnected,
}: ShopifyCustomAppWizardProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [domain, setDomain] = useState('');
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifyClientSecret, setShopifyClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const goNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  };

  const goToStep = (target: number) => {
    if (target < step) {
      setDirection(-1);
      setStep(target);
    }
  };

  const handleClose = () => {
    setStep(1);
    setDirection(1);
    setDomain('');
    setShopifyClientId('');
    setShopifyClientSecret('');
    setShowSecret(false);
    setConnecting(false);
    setError('');
    onClose();
  };

  const normalizeDomain = (raw: string): string => {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\/+$/, '');
    if (!d.endsWith('.myshopify.com')) {
      d = `${d}.myshopify.com`;
    }
    return d;
  };

  const isDomainValid = () => {
    if (!domain.trim()) return false;
    const d = normalizeDomain(domain);
    return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(d);
  };

  const isFormValid = () => {
    return isDomainValid() && shopifyClientId.trim().length >= 10 && shopifyClientSecret.trim().length >= 10;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  const handleConnect = async () => {
    setError('');
    if (!isFormValid()) {
      setError('Completa todos los campos correctamente');
      return;
    }

    setConnecting(true);
    goNext(); // Go to step 5 (connecting)

    try {
      const { data, error: apiError } = await callApi('store-shopify-credentials', {
        body: {
          clientId,
          shopifyClientId: shopifyClientId.trim(),
          shopifyClientSecret: shopifyClientSecret.trim(),
          shopDomain: normalizeDomain(domain),
        },
      });

      if (apiError) {
        setError(apiError);
        setDirection(-1);
        setStep(4); // Go back to form
        return;
      }

      if (data?.installUrl) {
        // Redirect to Shopify OAuth
        window.location.href = data.installUrl;
      } else {
        setError('No se recibió la URL de instalación');
        setDirection(-1);
        setStep(4);
      }
    } catch (err: any) {
      console.error('Error storing Shopify credentials:', err);
      setError(err.message || 'Error al guardar credenciales');
      setDirection(-1);
      setStep(4);
    } finally {
      setConnecting(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold">Conecta tu tienda Shopify</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Crea una app en tu panel de Shopify para que Steve pueda acceder
              a tus datos de forma segura via OAuth. Solo toma ~3 minutos.
            </p>
            <div className="text-left max-w-sm mx-auto space-y-2 pt-2">
              <p className="text-sm font-medium">Necesitas:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  Acceso de admin a tu tienda Shopify
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  Crear una app en Settings &gt; Apps &gt; Develop apps
                </li>
              </ul>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Crea tu app en Shopify</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
                <span>Ve a <strong>Shopify Admin</strong> &gt; <strong>Settings</strong> &gt; <strong>Apps and sales channels</strong> &gt; <strong>Develop apps</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                <span>Click <strong>"Create an app"</strong>, nombre: <Badge variant="secondary" className="font-mono">Steve Ads</Badge></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
                <span>En la app, configura <strong>"App URL"</strong> y <strong>"Allowed redirection URL"</strong>:</span>
              </li>
            </ol>

            <div className="space-y-2 pl-9">
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{APP_URL}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(APP_URL, 'App URL')}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{REDIRECT_URL}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(REDIRECT_URL, 'Redirect URL')}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="pl-9 space-y-2">
              <p className="text-sm font-medium">Configura estos scopes en "API access scopes":</p>
              <div className="grid gap-1">
                {REQUIRED_SCOPES.map((s) => (
                  <div key={s.scope} className="flex items-center gap-2 text-sm">
                    <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <Badge variant="outline" className="font-mono text-xs">{s.scope}</Badge>
                    <span className="text-muted-foreground text-xs">— {s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Copia tus credenciales</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
                <span>En tu app de Shopify, ve a la pestana <strong>"API credentials"</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                <span>Copia el <strong>Client ID</strong> (aparece como "API key")</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
                <span>Copia el <strong>Client Secret</strong> (aparece como "API secret key")</span>
              </li>
            </ol>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <Key className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Estas credenciales se almacenan encriptadas (AES-256) y solo se usan para la conexion OAuth con Shopify.</span>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Ingresa tus datos</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="shopify-domain">Dominio de la tienda</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="shopify-domain"
                    placeholder="mi-tienda"
                    value={domain}
                    onChange={(e) => {
                      setDomain(e.target.value);
                      setError('');
                    }}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">.myshopify.com</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shopify-client-id">Client ID</Label>
                <Input
                  id="shopify-client-id"
                  placeholder="Tu API key de Shopify"
                  value={shopifyClientId}
                  onChange={(e) => {
                    setShopifyClientId(e.target.value);
                    setError('');
                  }}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shopify-client-secret">Client Secret</Label>
                <div className="relative">
                  <Input
                    id="shopify-client-secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Tu API secret key de Shopify"
                    value={shopifyClientSecret}
                    onChange={(e) => {
                      setShopifyClientSecret(e.target.value);
                      setError('');
                    }}
                    className="pr-10"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="text-center space-y-4 py-8">
            <Loader2 className="w-12 h-12 mx-auto animate-spin text-green-600" />
            <h3 className="text-lg font-semibold">Conectando con Shopify...</h3>
            <p className="text-sm text-muted-foreground">
              Te redirigiremos a Shopify para autorizar la conexion.
            </p>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-600" />
            Conectar Shopify
          </DialogTitle>
          <DialogDescription>
            Paso {step} de {TOTAL_STEPS}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 py-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const stepNum = i + 1;
            const Icon = stepIcons[i];
            const isActive = stepNum === step;
            const isCompleted = stepNum < step;
            return (
              <button
                key={stepNum}
                onClick={() => goToStep(stepNum)}
                disabled={stepNum >= step}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all
                  ${isActive
                    ? 'bg-green-600 text-white scale-110'
                    : isCompleted
                      ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer'
                      : 'bg-muted text-muted-foreground cursor-default'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Step content with animation */}
        <div className="min-h-[280px] relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between pt-2">
          {step > 1 && step < 5 ? (
            <Button variant="outline" onClick={goBack} disabled={connecting}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Atras
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button onClick={goNext} className="bg-green-600 hover:bg-green-700">
              {step === 1 ? 'Empezar' : 'Siguiente'}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : step === 4 ? (
            <Button
              onClick={handleConnect}
              disabled={connecting || !isFormValid()}
              className="bg-green-600 hover:bg-green-700"
            >
              <Link2 className="w-4 h-4 mr-2" />
              Conectar con Shopify
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
