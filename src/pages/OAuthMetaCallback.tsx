import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';

export default function OAuthMetaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state'); // This is the client_id
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage('Autorización cancelada por el usuario');
        return;
      }

      if (!code) {
        setStatus('error');
        setErrorMessage('No se recibió código de autorización');
        return;
      }

      // Get client_id from state or sessionStorage
      const clientId = state || sessionStorage.getItem('meta_oauth_client_id');
      
      if (!clientId) {
        setStatus('error');
        setErrorMessage('No se pudo identificar el cliente');
        return;
      }

      try {
        // Call edge function to exchange code for token and store connection
        const { data, error: fnError } = await supabase.functions.invoke('meta-oauth-callback', {
          body: {
            code,
            client_id: clientId,
            redirect_uri: `${window.location.origin}/oauth/meta/callback`,
          },
        });

        if (fnError) throw fnError;

        if (data?.error) {
          throw new Error(data.error);
        }

        // Tokens are saved in DB by the edge function at this point
        setStatus('success');
        sessionStorage.removeItem('meta_oauth_client_id');

        // Check if we came from Shopify embedded — redirect back into the admin
        const shopName = localStorage.getItem('meta_oauth_shop_domain');
        localStorage.removeItem('meta_oauth_shop_domain');

        if (shopName) {
          // Redirect IMMEDIATELY back into Shopify admin (tokens already persisted)
          console.log('[Meta OAuth] Redirecting back to Shopify admin for store:', shopName);
          window.location.replace(
            `https://admin.shopify.com/store/${shopName}/apps/loveable_public?meta_connected=true`
          );
          return; // Stop rendering — we're leaving the page
        }

        // Non-Shopify flow: stay and show success, then navigate
        toast.success('¡Meta conectado exitosamente!');
        setTimeout(() => navigate('/portal'), 1500);
      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Error al conectar con Meta');
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          <img src={logo} alt="Consultoría BG" className="h-16 w-auto mx-auto mb-4" />

          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <p className="text-lg font-medium">Conectando con Meta...</p>
              <p className="text-sm text-muted-foreground">
                Por favor espera mientras completamos la conexión
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-12 h-12 mx-auto text-green-600" />
              <p className="text-lg font-medium">¡Conexión exitosa!</p>
              <p className="text-sm text-muted-foreground">
                Tu cuenta de Meta Ads ha sido conectada correctamente
              </p>
              <p className="text-xs text-muted-foreground">
                Redirigiendo al portal...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 mx-auto text-destructive" />
              <p className="text-lg font-medium">Error de conexión</p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button onClick={() => {
                const shopName = localStorage.getItem('meta_oauth_shop_domain');
                localStorage.removeItem('meta_oauth_shop_domain');
                if (shopName) {
                  window.location.replace(
                    `https://admin.shopify.com/store/${shopName}/apps/loveable_public`
                  );
                } else {
                  navigate('/portal');
                }
              }} className="mt-4">
                {localStorage.getItem('meta_oauth_shop_domain') ? 'Volver a Shopify' : 'Volver al portal'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
