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
import { callApi } from '@/lib/api';

const API_BASE = (import.meta.env.VITE_API_URL || 'https://steve-api-850416724643.us-central1.run.app').trim();

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
  const [scopesCopied, setScopesCopied] = useState(false);
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifyClientSecret, setShopifyClientSecret] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Start polling when step 5 is shown (install step)
  useEffect(() => {
    if (step === 5 && open) {
      setPolling(true);
      pollRef.current = setInterval(async () => {
        const { data } = await supabase
          .from('platform_connections')
          .select('id, access_token_encrypted')
          .eq('client_id', clientId)
          .eq('platform', 'shopify')
          .limit(1);
        // Connection exists AND has the OAuth token (not just the client credentials)
        if (data && data.length > 0 && data[0].access_token_encrypted) {
          if (pollRef.current) clearInterval(pollRef.current);
          setPolling(false);
          setStep(6);
          onConnected();
        }
      }, 3000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
      setPolling(false);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, open, clientId, onConnected]);

  const handleClose = () => {
    setStep(1);
    setDomain('');
    setError('');
    setScopesCopied(false);
    setShopifyClientId('');
    setShopifyClientSecret('');
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
  const adminUrl = cleanDomain
    ? `https://admin.shopify.com/store/${cleanDomain}/settings/apps/development`
    : '';

  // App URL must be our API install endpoint so Shopify's install link redirects through our OAuth
  const appUrl = `${API_BASE}/api/shopify-install`;
  const redirectUrl = `${API_BASE}/api/shopify-oauth-callback`;

  const handleCopyScopes = () => {
    navigator.clipboard.writeText(REQUIRED_SCOPES.join(', '));
    setScopesCopied(true);
    toast.success('Permisos copiados');
    setTimeout(() => setScopesCopied(false), 2000);
  };

  // Save Client ID + Client Secret to backend
  const handleSaveCredentials = async () => {
    if (!shopifyClientId.trim() || !shopifyClientSecret.trim()) {
      setError('Pega ambos: Client ID y Client Secret');
      return;
    }
    setSavingCredentials(true);
    setError('');

    const { data, error: apiError } = await callApi('store-shopify-credentials', {
      body: {
        clientId,
        shopDomain: cleanDomain,
        shopifyClientId: shopifyClientId.trim(),
        shopifyClientSecret: shopifyClientSecret.trim(),
      },
    });

    setSavingCredentials(false);

    if (apiError) {
      setError(apiError);
      return;
    }

    toast.success('Credenciales guardadas');
    setStep(5);
  };

  // ─── Step 1: Nombre de la tienda ─────────────────────
  const renderStep1 = () => (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="shopify-domain">Nombre de tu tienda en Shopify</Label>
        <div className="flex items-center gap-2">
          <Input
            id="shopify-domain"
            placeholder="mi-tienda"
            value={domain}
            onChange={(e) => { setDomain(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && isValidDomain && setStep(2)}
            autoFocus
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">.myshopify.com</span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Es el nombre que aparece en tu URL de Shopify, ej: <strong>mi-tienda</strong>.myshopify.com
        </p>
      </div>
      <Button
        onClick={() => {
          if (!cleanDomain) { setError('Ingresa el nombre de tu tienda'); return; }
          if (!isValidDomain) { setError('Solo letras, números y guiones'); return; }
          setError('');
          setStep(2);
        }}
        disabled={!domain.trim()}
        className="w-full bg-green-600 hover:bg-green-700"
      >
        Siguiente <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );

  // ─── Step 2: Crear app + URLs ─────────────────────
  const renderStep2 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Crea una Custom App en tu Shopify Admin:</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Haz clic en el botón de abajo para ir a tu admin</li>
          <li>Haz clic en <strong>"Desarrollar apps"</strong> (arriba a la derecha)</li>
          <li>Si es la primera vez, haz clic en <strong>"Permitir el desarrollo de apps personalizadas"</strong></li>
          <li>Haz clic en <strong>"Crear una app"</strong></li>
          <li>Ponle nombre: <strong>Steve</strong></li>
          <li>Si te pide <strong>"App URL"</strong> y <strong>"Redirect URL"</strong>, pega estos:</li>
        </ol>

        <div className="bg-background rounded border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">APP URL</span>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(appUrl); toast.success('App URL copiada'); }} className="h-6 px-2 text-xs">
              <Copy className="w-3 h-3 mr-1" /> Copiar
            </Button>
          </div>
          <code className="text-xs block text-green-600 break-all">{appUrl}</code>
        </div>

        <div className="bg-background rounded border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">REDIRECT URL</span>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(redirectUrl); toast.success('Redirect URL copiada'); }} className="h-6 px-2 text-xs">
              <Copy className="w-3 h-3 mr-1" /> Copiar
            </Button>
          </div>
          <code className="text-xs block text-green-600 break-all">{redirectUrl}</code>
        </div>

        <div className="flex items-start gap-2 p-2 bg-[#F0F4FA] border border-[#B5C8E0] rounded text-[#132448] text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Si Shopify no te pide estas URLs, ignóralas y sigue adelante.</span>
        </div>
      </div>

      <a href={adminUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm font-medium">
        Abrir admin de {cleanDomain}.myshopify.com <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
        </Button>
        <Button onClick={() => setStep(3)} className="flex-1 bg-green-600 hover:bg-green-700">
          Ya creé la app <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  // ─── Step 3: Configurar permisos ─────────────────────
  const renderStep3 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Configura los permisos de la app "Steve":</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Dentro de la app, haz clic en <strong>"Configure Admin API scopes"</strong></li>
          <li>Busca y activa cada uno de estos permisos:</li>
        </ol>

        <div className="bg-background rounded border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">11 PERMISOS REQUERIDOS</span>
            <Button variant="ghost" size="sm" onClick={handleCopyScopes} className="h-6 px-2 text-xs">
              {scopesCopied ? (
                <><CheckCircle2 className="w-3 h-3 mr-1 text-green-500" /> Copiado</>
              ) : (
                <><Copy className="w-3 h-3 mr-1" /> Copiar</>
              )}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {REQUIRED_SCOPES.map((scope) => (
              <span key={scope} className="inline-block px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                {scope}
              </span>
            ))}
          </div>
        </div>

        <ol start={3} className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>Haz clic en <strong>"Save"</strong> (Guardar)</li>
        </ol>

        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Asegúrate de activar los 11 permisos. Si falta alguno, Steve no podrá acceder a tus datos.</span>
        </div>
      </div>

      <a href={adminUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-xs">
        Volver al admin de {cleanDomain}.myshopify.com <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
        </Button>
        <Button onClick={() => setStep(4)} className="flex-1 bg-green-600 hover:bg-green-700">
          Ya configuré los permisos <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );

  // ─── Step 4: Client ID + Client Secret ─────────────────────
  const renderStep4 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Copia el Client ID y Client Secret de tu app:</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>En tu Shopify Admin, abre la app <strong>"Steve"</strong></li>
          <li>Ve a la pestaña <strong>"API credentials"</strong></li>
          <li>Copia el <strong>Client ID</strong> y pégalo abajo</li>
          <li>Copia el <strong>Client Secret</strong> y pégalo abajo</li>
        </ol>

        <div className="flex items-start gap-2 p-2 bg-[#F0F4FA] border border-[#B5C8E0] rounded text-[#132448] text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Estos NO son el Access Token. Son las credenciales de la app que aparecen en la pestaña <strong>"API credentials"</strong>, arriba de todo.
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="client-id">Client ID</Label>
          <Input
            id="client-id"
            placeholder="ej: a1b2c3d4e5f6..."
            value={shopifyClientId}
            onChange={(e) => { setShopifyClientId(e.target.value); setError(''); }}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-secret">Client Secret</Label>
          <Input
            id="client-secret"
            type="password"
            placeholder="ej: shpss_xxxxx..."
            value={shopifyClientSecret}
            onChange={(e) => { setShopifyClientSecret(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveCredentials()}
            autoComplete="off"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
      </div>

      <a href={adminUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-xs">
        Ir al admin de {cleanDomain}.myshopify.com <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(3)} disabled={savingCredentials} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
        </Button>
        <Button
          onClick={handleSaveCredentials}
          disabled={savingCredentials || !shopifyClientId.trim() || !shopifyClientSecret.trim()}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {savingCredentials ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando...</>
          ) : (
            <>Guardar y continuar <ChevronRight className="w-4 h-4 ml-2" /></>
          )}
        </Button>
      </div>
    </div>
  );

  // ─── Step 5: Distribución personalizada → instalar ─────────────────────
  const renderStep5 = () => (
    <div className="space-y-4 py-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
        <p className="font-medium">Último paso — instala la app:</p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
          <li>En tu Shopify Admin, abre la app <strong>"Steve"</strong></li>
          <li>Ve a la sección <strong>"Distribución"</strong></li>
          <li>Haz clic en <strong>"Gestionar distribución personalizada"</strong></li>
          <li>Shopify te genera un <strong>link de instalación único</strong></li>
          <li><strong>Copia ese link</strong> y pégalo en tu navegador</li>
          <li>Shopify te pedirá que autorices — haz clic en <strong>"Instalar"</strong></li>
        </ol>

        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Importante:</strong> Usa el link que te da Shopify en "Distribución", NO otro link. Es un link único para tu app.
          </span>
        </div>

        {polling && (
          <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded text-green-800 text-xs">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>Esperando que instales la app... esta ventana se actualiza sola</span>
          </div>
        )}

        <div className="flex items-start gap-2 p-2 bg-[#F0F4FA] border border-[#B5C8E0] rounded text-[#132448] text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Debes estar logueado como <strong>administrador</strong> de {cleanDomain}.myshopify.com</span>
        </div>
      </div>

      <a href={adminUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm font-medium">
        Abrir admin de {cleanDomain}.myshopify.com <ExternalLink className="w-4 h-4" />
      </a>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
          <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
        </Button>
      </div>
    </div>
  );

  // ─── Step 6: App instalada ─────────────────────
  const renderStep6 = () => (
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
      <Button onClick={handleClose} className="w-full bg-green-600 hover:bg-green-700">
        Listo
      </Button>
    </div>
  );

  const totalSteps = 6;
  const stepTitles = ['Tu tienda', 'Crear app', 'Permisos', 'Credenciales', 'Instalar', 'Conectada'];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-600" />
            Conectar Shopify
          </DialogTitle>
          <DialogDescription>
            {step === 6
              ? 'Conexión completada'
              : `Paso ${step} de ${totalSteps}: ${stepTitles[step - 1]}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step < 6 && (
          <div className="flex items-center gap-1 px-1">
            {[1, 2, 3, 4, 5, 6].map((s) => (
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
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
      </DialogContent>
    </Dialog>
  );
}
