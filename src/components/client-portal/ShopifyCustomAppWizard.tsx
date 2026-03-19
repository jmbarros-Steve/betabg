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
import { ShoppingBag, Loader2 } from 'lucide-react';

interface ShopifyCustomAppWizardProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onConnected: () => void;
}

const SHOPIFY_CLIENT_ID = '3f87a3e6dcbd34a981df841f7705b7da';
const SHOPIFY_SCOPES =
  'read_orders,read_analytics,write_discounts,read_discounts,read_checkouts,read_products,read_customers,write_script_tags';
const SHOPIFY_REDIRECT_URI =
  'https://steve-api-850416724643.us-central1.run.app/api/shopify-oauth-callback';

export function ShopifyCustomAppWizard({
  open,
  onClose,
  clientId,
  onConnected,
}: ShopifyCustomAppWizardProps) {
  const [domain, setDomain] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setDomain('');
    setConnecting(false);
    setError('');
    onClose();
  };

  const normalizeDomain = (raw: string): string => {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '');
    d = d.replace(/\.myshopify\.com.*$/, '');
    d = d.replace(/\/+$/, '');
    return d;
  };

  const handleConnect = () => {
    const clean = normalizeDomain(domain);
    if (!clean) {
      setError('Ingresa el nombre de tu tienda');
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(clean)) {
      setError('El nombre de la tienda solo puede tener letras, números y guiones');
      return;
    }
    setConnecting(true);
    setError('');
    const authUrl = `https://${clean}.myshopify.com/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&state=${clientId}`;
    window.location.href = authUrl;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-600" />
            Conectar Shopify
          </DialogTitle>
          <DialogDescription>
            Ingresa el nombre de tu tienda para conectarla con Steve
          </DialogDescription>
        </DialogHeader>

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
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                disabled={connecting}
                autoFocus
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                .myshopify.com
              </span>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <Button
            onClick={handleConnect}
            disabled={connecting || !domain.trim()}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4 mr-2" />
                Conectar con Shopify
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Serás redirigido a Shopify para autorizar la conexión
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

