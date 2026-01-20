import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.jpg';

export default function OAuthShopifyCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const shop = searchParams.get('shop');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        console.log('Shopify OAuth callback received:', { hasCode: !!code, shop, state, error });

        if (error) {
          setErrorMessage('Acceso denegado por el usuario');
          setStatus('error');
          return;
        }

        if (!code || !shop) {
          setErrorMessage('Parámetros de autorización inválidos');
          setStatus('error');
          return;
        }

        // Get client_id from state or sessionStorage
        const clientId = state || sessionStorage.getItem('shopify_oauth_client_id');
        
        if (!clientId) {
          setErrorMessage('No se encontró el ID del cliente');
          setStatus('error');
          return;
        }

        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setErrorMessage('Sesión expirada. Por favor, inicia sesión nuevamente.');
          setStatus('error');
          return;
        }

        // Call edge function to exchange code for token
        const { data, error: invokeError } = await supabase.functions.invoke('shopify-oauth-callback', {
          body: {
            code,
            shop,
            client_id: clientId,
          },
        });

        if (invokeError) {
          console.error('Edge function error:', invokeError);
          setErrorMessage(invokeError.message || 'Error al conectar con Shopify');
          setStatus('error');
          return;
        }

        if (!data?.success) {
          setErrorMessage(data?.error || 'Error al procesar la conexión');
          setStatus('error');
          return;
        }

        // Success!
        setStoreName(data.store_name || shop);
        setStatus('success');
        
        // Clean up sessionStorage
        sessionStorage.removeItem('shopify_oauth_client_id');

        // Redirect after success
        setTimeout(() => {
          navigate('/portal?tab=connections');
        }, 2500);

      } catch (err: any) {
        console.error('Callback error:', err);
        setErrorMessage(err.message || 'Error inesperado');
        setStatus('error');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          <img src={logo} alt="Logo" className="h-16 mx-auto mb-4" />
          
          {status === 'loading' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <h2 className="text-xl font-semibold">Conectando tu tienda Shopify...</h2>
              <p className="text-muted-foreground">
                Esto tomará solo unos segundos
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-xl font-semibold">¡Conexión exitosa!</h2>
              <p className="text-muted-foreground">
                Tu tienda <strong>{storeName}</strong> ha sido conectada correctamente.
              </p>
              <p className="text-sm text-muted-foreground">
                Redirigiendo al portal...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-destructive" />
              <h2 className="text-xl font-semibold text-destructive">Error de conexión</h2>
              <p className="text-muted-foreground">{errorMessage}</p>
              <Button onClick={() => navigate('/portal?tab=connections')} className="mt-4">
                Volver al portal
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
