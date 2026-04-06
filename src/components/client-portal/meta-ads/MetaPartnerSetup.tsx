import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react';

interface MetaPartnerSetupProps {
  clientId: string;
  onConnected: () => void;
}

type SetupState = 'leadsie' | 'waiting' | 'connected';

const LEADSIE_URL = import.meta.env.VITE_LEADSIE_REQUEST_URL || '';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000; // 2 minutes

export function MetaPartnerSetup({ clientId, onConnected }: MetaPartnerSetupProps) {
  const [state, setState] = useState<SetupState>('leadsie');
  const [leadsieOpened, setLeadsieOpened] = useState(false);
  const [pollElapsed, setPollElapsed] = useState(0);

  const leadsieUrl = LEADSIE_URL
    ? `${LEADSIE_URL}?customUserId=${clientId}`
    : '';

  // Poll for connection created by webhook
  const pollForConnection = useCallback(async () => {
    const { data } = await supabase
      .from('platform_connections')
      .select('id, is_active, account_id')
      .eq('client_id', clientId)
      .eq('platform', 'meta')
      .maybeSingle();

    if (data?.is_active && data?.account_id) {
      setState('connected');
      return true;
    }
    return false;
  }, [clientId]);

  useEffect(() => {
    if (state !== 'waiting') return;

    let stopped = false;
    const startTime = Date.now();

    const interval = setInterval(async () => {
      if (stopped) return;

      const elapsed = Date.now() - startTime;
      setPollElapsed(elapsed);

      if (elapsed > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        return;
      }

      const found = await pollForConnection();
      if (found) {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [state, pollForConnection]);

  // When connected, notify parent after a short delay
  useEffect(() => {
    if (state === 'connected') {
      const timer = setTimeout(onConnected, 1500);
      return () => clearTimeout(timer);
    }
  }, [state, onConnected]);

  const handleOpenLeadsie = () => {
    if (!leadsieUrl) return;
    window.open(leadsieUrl, '_blank', 'width=600,height=700');
    setLeadsieOpened(true);
  };

  const handleDoneWithLeadsie = () => {
    setState('waiting');
    setPollElapsed(0);
  };

  // STATE 3: Connected
  if (state === 'connected') {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-emerald-900">Meta conectado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Tu cuenta de Meta Ads se conecto correctamente. Ya puedes gestionar tus campanas.
          </p>
        </div>
      </div>
    );
  }

  // STATE 2: Waiting for webhook
  if (state === 'waiting') {
    const isTimedOut = pollElapsed > POLL_TIMEOUT_MS;

    return (
      <div className="text-center py-8 space-y-4">
        {!isTimedOut ? (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Esperando conexion...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Si ya completaste el proceso en Leadsie, espera unos segundos mientras se conecta automaticamente.
              </p>
            </div>
          </>
        ) : (
          <>
            <RefreshCw className="w-10 h-10 text-amber-500 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Aun no detectamos la conexion</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Si completaste el proceso, puede tomar unos minutos. Puedes cerrar este dialogo y volver mas tarde.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPollElapsed(0);
                  setState('waiting');
                }}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Reintentar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState('leadsie')}
              >
                Volver a Leadsie
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // STATE 1: Leadsie embed
  return (
    <div className="space-y-6 py-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Conecta tu cuenta de Meta</h3>
        <p className="text-sm text-muted-foreground">
          Haz clic en el boton para compartir acceso a tu cuenta de Meta Ads con Steve.
          El proceso es seguro y solo toma 1 minuto.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 border space-y-3">
        <p className="text-sm font-medium">Como funciona:</p>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Haz clic en <span className="font-medium text-foreground">"Conectar con Meta"</span></li>
          <li>Inicia sesion con tu cuenta de Facebook</li>
          <li>Acepta compartir acceso a tu pagina y cuenta publicitaria</li>
          <li>La conexion se crea automaticamente</li>
        </ol>
      </div>

      {!leadsieUrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-800">
            La URL de Leadsie no esta configurada. Contacta al administrador.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button
          onClick={handleOpenLeadsie}
          disabled={!leadsieUrl}
          className="w-full"
          size="lg"
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Conectar con Meta
        </Button>

        {leadsieOpened && (
          <Button
            variant="outline"
            onClick={handleDoneWithLeadsie}
            className="w-full"
          >
            Ya complete el proceso en Leadsie
          </Button>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Badge variant="outline" className="text-xs">
          BM Partner
        </Badge>
        <span className="text-xs text-muted-foreground">
          Conexion segura via Business Manager
        </span>
      </div>
    </div>
  );
}
