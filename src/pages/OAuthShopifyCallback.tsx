import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.jpg';
import { useToast } from '@/hooks/use-toast';
import { ShopifyWelcomeScreen } from '@/components/shopify/ShopifyWelcomeScreen';

export default function OAuthShopifyCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'new_user' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Check for direct redirect params from edge function
      const success = searchParams.get('success');
      const error = searchParams.get('error');
      const store = searchParams.get('store');
      const email = searchParams.get('email');
      const isNewUser = searchParams.get('new_user') === 'true';
      const tempPass = searchParams.get('temp_pass');

      console.log('OAuth callback params:', { success, error, store, email, isNewUser });

      if (error) {
        const errorMessages: Record<string, string> = {
          'invalid_signature': 'Firma de solicitud inválida',
          'missing_params': 'Parámetros de autorización inválidos',
          'token_exchange_failed': 'Error al obtener token de Shopify',
          'no_email': 'No se pudo obtener el email de la tienda',
          'user_creation_failed': 'Error al crear la cuenta de usuario',
          'client_creation_failed': 'Error al crear el registro del cliente',
          'encryption_failed': 'Error al procesar credenciales',
        };
        setErrorMessage(errorMessages[error] || error);
        setStatus('error');
        return;
      }

      if (success === 'true' && store) {
        setStoreName(store);
        
        // New user - auto-login with credentials
        if (isNewUser && tempPass && email) {
          setStatus('loading'); // Keep showing loading while we auto-login
          
          try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password: tempPass,
            });

            if (signInError) {
              console.error('Auto-login failed:', signInError);
              // Fallback: show credentials screen
              setCredentials({ email, password: tempPass });
              setStatus('new_user');
              return;
            }

            // Auto-login successful - show brief success and redirect
            toast({
              title: '¡Bienvenido a Steve!',
              description: `Tu tienda ${store} ha sido conectada exitosamente.`,
            });
            
            navigate('/portal?tab=connections');
          } catch (e: any) {
            console.error('Auto-login error:', e);
            setCredentials({ email, password: tempPass });
            setStatus('new_user');
          }
          return;
        }
        
        // Existing user - just redirect
        setStatus('success');
        setTimeout(() => {
          navigate('/portal?tab=connections');
        }, 1500);
        return;
      }

      // Legacy flow: frontend calling edge function
      const code = searchParams.get('code');
      const shop = searchParams.get('shop');

      if (!code || !shop) {
        setErrorMessage('Parámetros de autorización inválidos');
        setStatus('error');
        return;
      }

      try {
        const { data, error: invokeError } = await supabase.functions.invoke('shopify-oauth-callback', {
          body: { code, shop },
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

        setStoreName(data.store_name || shop);
        
        if (data.is_new_user && data.temp_password) {
          // Auto-login for legacy flow too
          try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: data.user_email,
              password: data.temp_password,
            });

            if (signInError) {
              setCredentials({
                email: data.user_email,
                password: data.temp_password,
              });
              setStatus('new_user');
              return;
            }

            toast({
              title: '¡Bienvenido a Steve!',
              description: `Tu tienda ha sido conectada exitosamente.`,
            });
            navigate('/portal?tab=connections');
          } catch {
            setCredentials({
              email: data.user_email,
              password: data.temp_password,
            });
            setStatus('new_user');
          }
        } else {
          setStatus('success');
          setTimeout(() => {
            navigate('/portal?tab=connections');
          }, 1500);
        }
      } catch (err: any) {
        console.error('Callback error:', err);
        setErrorMessage(err.message || 'Error inesperado');
        setStatus('error');
      }
    };

    handleCallback();
  }, [searchParams, navigate, toast]);

  const handleLoginWithCredentials = async () => {
    if (credentials) {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (error) {
          toast({
            title: 'Error al iniciar sesión',
            description: error.message,
            variant: 'destructive',
          });
          return;
        }

        navigate('/portal?tab=connections');
      } catch (e: any) {
        toast({
          title: 'Error',
          description: e.message,
          variant: 'destructive',
        });
      }
    }
  };

  // New user - show welcome screen with credentials
  if (status === 'new_user' && credentials) {
    return (
      <ShopifyWelcomeScreen
        storeName={storeName}
        credentials={credentials}
        onLogin={handleLoginWithCredentials}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          <img src={logo} alt="Logo" className="h-16 mx-auto mb-4" />
          
          {status === 'loading' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <h2 className="text-xl font-semibold">Configurando tu cuenta...</h2>
              <p className="text-muted-foreground">
                Conectando tu tienda y preparando el portal
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
              <Button onClick={() => navigate('/steve')} className="mt-4">
                Volver a Steve
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
