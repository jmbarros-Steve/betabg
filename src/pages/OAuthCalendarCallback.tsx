import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';

export default function OAuthCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state'); // seller_name from CalendarConnect
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

      try {
        const { data, error: apiError } = await callApi('google-calendar-oauth-callback', {
          body: {
            code,
            redirect_uri: `${window.location.origin}/agendar/oauth-callback`,
            seller_name: state || 'Vendedor',
          },
        });

        if (apiError) throw new Error(apiError);
        if (data?.error) throw new Error(data.error);

        setBookingUrl(data?.booking_url || '');
        setStatus('success');
        toast.success('Google Calendar conectado');

        setTimeout(() => {
          navigate('/dashboard');
        }, 3000);
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Error al conectar calendario');
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-2xl border border-slate-200 shadow-xl">
        <CardContent className="pt-6 text-center space-y-4">
          <img src={logo} alt="Steve Ads" className="h-16 w-auto mx-auto mb-4" />

          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <p className="text-lg font-medium">Conectando Google Calendar...</p>
              <p className="text-sm text-muted-foreground">
                Verificando acceso al calendario
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="w-12 h-12 mx-auto text-green-600" />
              <p className="text-lg font-medium">Calendario conectado</p>
              <p className="text-sm text-muted-foreground">
                Los prospectos ya pueden agendar reuniones contigo
              </p>
              {bookingUrl && (
                <p className="text-xs text-blue-600 font-mono bg-blue-50 rounded-lg p-2">
                  {window.location.origin}{bookingUrl}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Redirigiendo al dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="w-12 h-12 mx-auto text-destructive" />
              <p className="text-lg font-medium">Error de conexión</p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
              <Button onClick={() => navigate('/dashboard')} className="mt-4">
                Volver al dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
