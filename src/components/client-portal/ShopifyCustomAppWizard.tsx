import { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  ChevronLeft,
  Copy,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const API_BASE = import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

interface ShopifyCustomAppWizardProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onConnected: () => void;
}

export function ShopifyCustomAppWizard({
  open,
  onClose,
  clientId,
  onConnected,
}: ShopifyCustomAppWizardProps) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Start polling when step 2 is shown
  useEffect(() => {
    if (step === 2 && open) {
      setPolling(true);
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform_type', 'shopify')
          .limit(1);

        if (data && data.length > 0) {
          // Connection found — advance to step 3
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);
          setStep(3);
          onConnected();
        }
      }, 3000); // Check every 3 seconds
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      setPolling(false);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, open, clientId, onConnected]);

  const handleClose = () => {
    setStep(1);
    setDomain('');
    setError('');
    setLinkCopied(false);
    setPolling(false);
    if (pollRef.current) clearInterval(pollRef.current);
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
  const shopDomain = `${cleanDomain}.myshopify.com`;

  // Personalized OAuth install link
  const installLink = `${API_BASE}/api/shopify-install?shop=${encodeURIComponent(shopDomain)}&client_id=${encodeURIComponent(clientId)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(installLink);
    setLinkCopied(true);
    toast.success('Link copiado — pégalo en tu navegador');
    setTimeout(() => setLinkCopied(false), 3000);
  };

  // Step 1: Enter store name
  const renderStep1 = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="shopify-domain">Nombre de tu tienda en Shopify</Label>
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
        <p className="text-xs text-muted-foreground">
          Es el nombre que aparece en tu URL de Shopify, ej: <strong>mi-tienda</strong>.myshopify.com
        </p>
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
        Generar link de conexión
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );

  // Step 2: Show install link + polling for connection
  const renderStep2 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Tu link personalizado para <strong>{cleanDomain}.myshopify.com</strong>:</p>

        {/* The install link */}
        <div className="bg-background rounded-lg border-2 border-green-200 p-4 space-y-3">
          <code className="text-xs block text-green-700 break-all leading-relaxed select-all">
            {installLink}
          </code>
          <Button
            onClick={handleCopyLink}
            className={`w-full ${linkCopied ? 'bg-green-600' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {linkCopied ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Copiado — ahora pégalo en tu navegador
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copiar link
              </>
            )}
          </Button>
        </div>

        {/* Instructions */}
        <div className="space-y-2 pt-2">
          <p className="font-medium text-foreground">Qué hacer:</p>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Haz clic en <strong>"Copiar link"</strong> arriba</li>
            <li><strong>Pega el link</strong> en la barra de tu navegador y presiona Enter</li>
            <li>Shopify te pedirá que <strong>autorices la app</strong> — haz clic en <strong>"Instalar"</strong></li>
            <li>La app se instala sola y esta ventana se actualizará automáticamente</li>
          </ol>
        </div>

        {/* Polling indicator */}
        {polling && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            <span>Esperando que instales la app en Shopify...</span>
          </div>
        )}

        <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Debes estar logueado en Shopify como <strong>administrador</strong> de {cleanDomain}.myshopify.com
          </span>
        </div>
      </div>

      {/* Direct link button */}
      <a
        href={installLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm font-medium"
      >
        O haz clic aquí para abrir directamente
        <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" />
          Cambiar tienda
        </Button>
      </div>
    </div>
  );

  // Step 3: App installed — success!
  const renderStep3 = () => (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-foreground">App instalada</h3>
          <p className="text-sm text-muted-foreground">
            <strong>{cleanDomain}.myshopify.com</strong> está conectada correctamente.
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          Ya estamos sincronizando tus productos, órdenes y clientes. Esto puede tomar unos minutos.
        </p>
      </div>

      <Button
        onClick={handleClose}
        className="w-full bg-green-600 hover:bg-green-700"
      >
        Listo
      </Button>
    </div>
  );

  const stepTitles = ['Tu tienda', 'Instalar app', 'App instalada'];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-600" />
            Conectar Shopify
          </DialogTitle>
          <DialogDescription>
            {step === 3
              ? 'Conexión completada'
              : `Paso ${step} de 3: ${stepTitles[step - 1]}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-green-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </DialogContent>
    </Dialog>
  );
}
