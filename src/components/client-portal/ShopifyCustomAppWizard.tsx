import { useState } from 'react';
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
import {
  ShoppingBag,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';

interface ShopifyCustomAppWizardProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onConnected: () => void;
}

const REQUIRED_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'read_customers',
  'read_checkouts',
  'read_analytics',
  'read_inventory',
  'write_inventory',
  'read_fulfillments',
  'read_discounts',
  'write_discounts',
];

export function ShopifyCustomAppWizard({
  open,
  onClose,
  clientId,
  onConnected,
}: ShopifyCustomAppWizardProps) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [shopName, setShopName] = useState('');
  const [scopesCopied, setScopesCopied] = useState(false);

  const handleClose = () => {
    setStep(1);
    setDomain('');
    setAccessToken('');
    setConnecting(false);
    setError('');
    setSuccess(false);
    setShopName('');
    setScopesCopied(false);
    onClose();
  };

  const normalizeDomain = (raw: string): string => {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\.myshopify\.com.*$/, '');
    d = d.replace(/\/+$/, '');
    return d;
  };

  const cleanDomain = normalizeDomain(domain);
  const isValidDomain = cleanDomain && /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(cleanDomain);
  const adminUrl = cleanDomain
    ? `https://admin.shopify.com/store/${cleanDomain}/settings/apps/development`
    : '';

  const handleCopyScopes = () => {
    navigator.clipboard.writeText(REQUIRED_SCOPES.join(', '));
    setScopesCopied(true);
    setTimeout(() => setScopesCopied(false), 2000);
  };

  const handleConnect = async () => {
    const trimmedToken = accessToken.trim();
    if (!trimmedToken) {
      setError('Pega el Admin API Access Token');
      return;
    }
    if (trimmedToken.length < 20) {
      setError('El token parece muy corto. Verifica que lo copiaste completo.');
      return;
    }

    setConnecting(true);
    setError('');

    const { data, error: apiError } = await callApi('store-shopify-token', {
      body: { clientId, shopDomain: cleanDomain, accessToken: trimmedToken },
    });

    setConnecting(false);

    if (apiError) {
      setError(apiError);
      return;
    }

    setShopName(data?.shopName || cleanDomain);
    setSuccess(true);
    onConnected();
  };

  const renderStep1 = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="shopify-domain">Nombre de tu tienda</Label>
        <div className="flex items-center gap-2">
          <Input
            id="shopify-domain"
            placeholder="mi-tienda"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && isValidDomain && setStep(2)}
            autoFocus
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            .myshopify.com
          </span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Button
        onClick={() => {
          if (!cleanDomain) {
            setError('Ingresa el nombre de tu tienda');
            return;
          }
          if (!isValidDomain) {
            setError('Solo letras, números y guiones');
            return;
          }
          setError('');
          setStep(2);
        }}
        disabled={!domain.trim()}
        className="w-full bg-green-600 hover:bg-green-700"
      >
        Siguiente
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://betabgnuevosupa.vercel.app';
  const redirectUrl = `${appUrl}/oauth/shopify/callback`;

  const renderStep2 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Sigue estos pasos en tu Shopify Admin:</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>
            Haz clic en el botón de abajo para ir a tu admin de <strong>{cleanDomain}.myshopify.com</strong>
          </li>
          <li>
            Haz clic en <strong>"Desarrollar apps"</strong> (arriba a la derecha)
          </li>
          <li>
            Si es la primera vez, haz clic en <strong>"Permitir el desarrollo de apps personalizadas"</strong>
          </li>
          <li>
            Haz clic en <strong>"Crear una app"</strong>
          </li>
          <li>
            Ponle nombre: <strong>Steve</strong>
          </li>
          <li>
            Si te pide <strong>"App URL"</strong>, pega esto:
          </li>
        </ol>

        <div className="bg-background rounded border p-3 mt-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">APP URL</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(appUrl);
                toast.success('App URL copiada');
              }}
              className="h-6 px-2 text-xs"
            >
              <Copy className="w-3 h-3 mr-1" />
              Copiar
            </Button>
          </div>
          <code className="text-xs block text-green-600 break-all">{appUrl}</code>
        </div>

        <div className="bg-background rounded border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">ALLOWED REDIRECTION URL</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(redirectUrl);
                toast.success('Redirect URL copiada');
              }}
              className="h-6 px-2 text-xs"
            >
              <Copy className="w-3 h-3 mr-1" />
              Copiar
            </Button>
          </div>
          <code className="text-xs block text-green-600 break-all">{redirectUrl}</code>
        </div>

        <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Si Shopify no te pide estas URLs, ignóralas y sigue adelante. Solo son necesarias en algunos casos.
          </span>
        </div>
      </div>

      <a
        href={adminUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm font-medium"
      >
        Abrir admin de {cleanDomain}.myshopify.com
        <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" />
          Atrás
        </Button>
        <Button
          onClick={() => setStep(3)}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          Ya creé la app
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Ahora configura los permisos de la app "Steve":</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>
            Dentro de la app que creaste, haz clic en <strong>"Configure Admin API scopes"</strong>
          </li>
          <li>Busca y activa cada uno de estos permisos (puedes copiarlos para buscarlos más rápido):</li>
        </ol>

        <div className="bg-background rounded border p-3 mt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">11 PERMISOS REQUERIDOS</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyScopes}
              className="h-6 px-2 text-xs"
            >
              {scopesCopied ? (
                <>
                  <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copiar
                </>
              )}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {REQUIRED_SCOPES.map((scope) => (
              <span
                key={scope}
                className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>

        <ol start={3} className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>
            Haz clic en <strong>"Save"</strong> (Guardar)
          </li>
          <li>
            Luego haz clic en <strong>"Install app"</strong> y confirma
          </li>
        </ol>

        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Asegúrate de activar los 11 permisos. Si falta alguno, Steve no podrá leer tus productos, pedidos o clientes.
          </span>
        </div>
      </div>

      <a
        href={adminUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-xs"
      >
        Volver al admin de {cleanDomain}.myshopify.com
        <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" />
          Atrás
        </Button>
        <Button
          onClick={() => setStep(4)}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          Ya instalé la app
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4 py-4">
      {success ? (
        <div className="text-center space-y-3 py-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <div>
            <p className="font-medium text-lg">Conectado exitosamente</p>
            <p className="text-sm text-muted-foreground">{shopName}</p>
          </div>
          <Button onClick={handleClose} className="w-full bg-green-600 hover:bg-green-700">
            Listo
          </Button>
        </div>
      ) : (
        <>
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <p className="font-medium">Último paso — copia el token de la app:</p>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>
                En tu Shopify Admin, abre la app <strong>"Steve"</strong> que instalaste
              </li>
              <li>
                Haz clic en la pestaña <strong>"API credentials"</strong>
              </li>
              <li>
                Baja hasta <strong>"Admin API access token"</strong> y haz clic en <strong>"Reveal token once"</strong>
              </li>
              <li>
                <strong>Copia el token</strong> (empieza con <code className="bg-muted px-1 rounded text-xs">shpat_</code>) y pégalo abajo
              </li>
            </ol>
            <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Importante:</strong> El token solo se muestra UNA VEZ. Cópialo ahora. Si lo pierdes, tendrás que desinstalar y reinstalar la app.
              </span>
            </div>
          </div>

          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-xs"
          >
            Ir al admin de {cleanDomain}.myshopify.com
            <ExternalLink className="w-4 h-4" />
          </a>

          <div className="space-y-2">
            <Label htmlFor="access-token">Admin API Access Token</Label>
            <Input
              id="access-token"
              type="password"
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
              value={accessToken}
              onChange={(e) => {
                setAccessToken(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              disabled={connecting}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep(3)}
              disabled={connecting}
              className="flex-1"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Atrás
            </Button>
            <Button
              onClick={handleConnect}
              disabled={connecting || !accessToken.trim()}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Conectar'
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const stepTitles = [
    'Tu tienda',
    'Crear Custom App',
    'Configurar permisos',
    'Pegar token',
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-600" />
            Conectar Shopify
          </DialogTitle>
          <DialogDescription>
            {success ? 'Tienda conectada' : `Paso ${step} de 4: ${stepTitles[step - 1]}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {!success && (
          <div className="flex items-center gap-1 px-1">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-green-500' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        )}

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </DialogContent>
    </Dialog>
  );
}
