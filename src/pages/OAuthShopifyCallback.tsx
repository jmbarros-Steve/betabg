import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/logo.jpg';
import { useToast } from '@/hooks/use-toast';

export default function OAuthShopifyCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<'loading' | 'success' | 'new_user' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [storeName, setStoreName] = useState<string>('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
        
        if (isNewUser && tempPass && email) {
          setCredentials({ email, password: tempPass });
          setStatus('new_user');
        } else {
          setStatus('success');
          // Existing user - redirect after showing success
          setTimeout(() => {
            navigate('/portal?tab=connections');
          }, 2500);
        }
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
          setCredentials({
            email: data.user_email,
            password: data.temp_password,
          });
          setStatus('new_user');
        } else {
          setStatus('success');
          setTimeout(() => {
            navigate('/portal?tab=connections');
          }, 2500);
        }
      } catch (err: any) {
        console.error('Callback error:', err);
        setErrorMessage(err.message || 'Error inesperado');
        setStatus('error');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  const handleCopyCredentials = () => {
    if (credentials) {
      const text = `Email: ${credentials.email}\nContraseña: ${credentials.password}`;
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Credenciales copiadas',
        description: 'Guarda estas credenciales en un lugar seguro',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

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

          {status === 'new_user' && credentials && (
            <>
              <CheckCircle className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-xl font-semibold">¡Bienvenido a Steve!</h2>
              <p className="text-muted-foreground">
                Tu tienda <strong>{storeName}</strong> ha sido conectada y tu cuenta ha sido creada.
              </p>
              
              <div className="bg-muted p-4 rounded-lg text-left space-y-2 mt-4">
                <p className="text-sm font-medium">Tus credenciales de acceso:</p>
                <div className="space-y-1">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Email:</span>{' '}
                    <span className="font-mono">{credentials.email}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Contraseña:</span>{' '}
                    <span className="font-mono">{credentials.password}</span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCredentials}
                  className="w-full mt-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar credenciales
                    </>
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ Guarda estas credenciales. Podrás cambiar tu contraseña después.
              </p>

              <Button onClick={handleLoginWithCredentials} className="w-full mt-4">
                Entrar al Portal
              </Button>
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
