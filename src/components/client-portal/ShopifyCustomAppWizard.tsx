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
  Settings,
  AppWindow,
  Shield,
  Download,
  Link2,
} from 'lucide-react';

interface ShopifyCustomAppWizardProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onConnected: () => void;
}

const TOTAL_STEPS = 6;

const REQUIRED_SCOPES = [
  { scope: 'read_orders', label: 'Pedidos' },
  { scope: 'read_analytics', label: 'Analíticas' },
  { scope: 'write_discounts', label: 'Crear descuentos' },
  { scope: 'read_discounts', label: 'Ver descuentos' },
  { scope: 'read_checkouts', label: 'Carritos abandonados' },
  { scope: 'read_products', label: 'Productos' },
];

const stepIcons = [ShoppingBag, Settings, AppWindow, Shield, Download, Link2];

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

export function ShopifyCustomAppWizard({
  open,
  onClose,
  clientId,
  onConnected,
}: ShopifyCustomAppWizardProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [domain, setDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
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
    setAccessToken('');
    setShowToken(false);
    setConnecting(false);
    setError('');
    onClose();
  };

  const normalizeDomain = (raw: string): string => {
    let d = raw.trim().toLowerCase();
    // Remove protocol
    d = d.replace(/^https?:\/\//, '');
    // Remove trailing slash
    d = d.replace(/\/+$/, '');
    // Append .myshopify.com if missing
    if (!d.endsWith('.myshopify.com')) {
      d = d.replace(/\.myshopify\.com$/, ''); // no-op guard
      d = `${d}.myshopify.com`;
    }
    return d;
  };

  const isDomainValid = () => {
    const d = normalizeDomain(domain);
    return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(d);
  };

  const isTokenValid = () => {
    return accessToken.startsWith('shpat_') && accessToken.length > 20;
  };

  const handleConnect = async () => {
    setError('');
    if (!isDomainValid()) {
      setError('Dominio inválido. Ejemplo: mi-tienda.myshopify.com');
      return;
    }
    if (!isTokenValid()) {
      setError('El token debe empezar con shpat_ y tener más de 20 caracteres');
      return;
    }

    setConnecting(true);
    const normalizedDomain = normalizeDomain(domain);

    try {
      const { data, error: apiError } = await callApi('store-platform-connection', {
        body: {
          clientId,
          platform: 'shopify',
          storeName: normalizedDomain,
          storeUrl: `https://${normalizedDomain}`,
          accessToken,
        },
      });

      if (apiError) {
        if (apiError.includes('409') || apiError.includes('already') || apiError.includes('existe')) {
          setError('Ya tienes Shopify conectado. Si necesitas reconectar, desconecta primero la conexión actual.');
        } else {
          setError(apiError);
        }
        return;
      }

      toast.success('Shopify conectado exitosamente');
      onConnected();
      handleClose();
    } catch (err: any) {
      console.error('Error connecting Shopify:', err);
      setError(err.message || 'Error al conectar. Intenta de nuevo.');
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
              Vamos a crear una app personalizada en tu tienda para que Steve pueda
              acceder a tus datos de forma segura. Solo toma 3 minutos.
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Habilita las apps personalizadas</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
                <span>Ve a tu <strong>Shopify Admin</strong> → <strong>Configuración</strong> (⚙️ abajo a la izquierda)</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                <span>Click en <strong>Apps y canales de ventas</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
                <span>Click en <strong>Desarrollar apps</strong> (arriba a la derecha)</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">4</span>
                <span>Click en <strong>"Permitir desarrollo de apps personalizadas"</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">5</span>
                <span>Confirma en el popup</span>
              </li>
            </ol>
            {domain && (
              <a
                href={`https://${normalizeDomain(domain)}/admin/settings/apps`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir configuración de apps en Shopify
              </a>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Crea la app</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
                <span>Click en <strong>"Crear una app"</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                <span>Nombre: <Badge variant="secondary" className="font-mono">Steve Ads</Badge> (o el que prefieras)</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
                <span>Click en <strong>"Crear app"</strong></span>
              </li>
            </ol>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configura los permisos de la API</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
                <span>En la app que creaste, click en <strong>"Configurar los alcances de la API de Admin"</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                <span>Marca estos permisos:</span>
              </li>
            </ol>
            <div className="grid gap-2 pl-9">
              {REQUIRED_SCOPES.map((s) => (
                <div key={s.scope} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <Badge variant="outline" className="font-mono text-xs">{s.scope}</Badge>
                  <span className="text-muted-foreground">— {s.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pl-9 pt-1">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
              <span className="text-sm">Click en <strong>"Guardar"</strong></span>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Instala la app y copia el token</h3>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
                <span>Click en <strong>"Instalar app"</strong> (pestaña "Credenciales de la API")</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
                <span>Confirma la instalación</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
                <span>En <strong>"Token de acceso de la API de Admin"</strong>, click en <strong>"Revelar token una vez"</strong></span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">4</span>
                <span className="font-semibold text-orange-700">¡COPIA EL TOKEN AHORA!</span>
              </li>
            </ol>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>El token solo se muestra una vez. Si lo pierdes, deberás desinstalar y reinstalar la app.</span>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Pega tus datos</h3>
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
                <Label htmlFor="shopify-token">Access Token</Label>
                <div className="relative">
                  <Input
                    id="shopify-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="shpat_xxxxx..."
                    value={accessToken}
                    onChange={(e) => {
                      setAccessToken(e.target.value);
                      setError('');
                    }}
                    className="pr-10"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
          {step > 1 ? (
            <Button variant="outline" onClick={goBack} disabled={connecting}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Atrás
            </Button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <Button onClick={goNext} className="bg-green-600 hover:bg-green-700">
              {step === 1 ? 'Empezar' : 'Siguiente'}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={connecting || !domain.trim() || !accessToken.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conectando...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Conectar tienda
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
