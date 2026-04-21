import { useEffect, useState } from 'react';
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
import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logoShopify from '@/assets/logo-shopify-clean.png';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'https://steve-api-850416724643.us-central1.run.app';

const SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

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

interface ShopifyConnectDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
}

export function ShopifyConnectDialog({ open, onClose, clientId }: ShopifyConnectDialogProps) {
  const [shopDomain, setShopDomain] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    // Prefill con el shop_domain guardado del cliente (si existe)
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('shop_domain')
        .eq('id', clientId)
        .maybeSingle();
      if (data?.shop_domain) setShopDomain(data.shop_domain);
    })();
  }, [open, clientId]);

  const handleConnect = () => {
    setError('');
    const domain = normalizeShopDomain(shopDomain);
    if (!SHOP_REGEX.test(domain)) {
      setError('Ingresa un dominio válido, ej: mi-tienda.myshopify.com');
      return;
    }
    setIsRedirecting(true);
    const url = new URL(`${API_BASE}/api/shopify-install`);
    url.searchParams.set('shop', domain);
    url.searchParams.set('client_id', clientId);
    window.location.href = url.toString();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src={logoShopify} alt="Shopify" className="h-5 w-5 object-contain" />
            Conectar Shopify
          </DialogTitle>
          <DialogDescription>
            Autoriza Steve en tu tienda vía OAuth — es el flujo oficial de Shopify.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg py-2 px-3">
            <Lock className="h-4 w-4 text-primary flex-shrink-0" />
            <span>Conexión cifrada vía OAuth 2.0 — no compartes contraseña.</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-domain">Dominio de tu tienda</Label>
            <Input
              id="shop-domain"
              placeholder="mi-tienda.myshopify.com"
              value={shopDomain}
              onChange={(e) => {
                setShopDomain(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && !isRedirecting && handleConnect()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Solo el nombre (ej: <strong>mi-tienda</strong>) también funciona.
            </p>
          </div>

          <Button
            onClick={handleConnect}
            className="w-full h-11 text-base"
            disabled={isRedirecting || !shopDomain.trim()}
          >
            {isRedirecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Redirigiendo a Shopify...
              </>
            ) : (
              <>
                Autorizar con Shopify
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
