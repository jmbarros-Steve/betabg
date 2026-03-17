import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  Shield,
} from 'lucide-react';
import { useMetaScopes, type FeatureStatus } from '@/hooks/useMetaScopes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaScopeAlertProps {
  clientId: string;
  /** If set, only show alert if this specific feature is unavailable */
  requiredFeature?: string;
  /** Compact mode for inline usage */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Full scope status panel (used in MetaAdsManager dashboard or standalone)
// ---------------------------------------------------------------------------

export function MetaScopeStatusPanel({ clientId }: { clientId: string }) {
  const { loading, features, needsReconnect, tokenExpired, noConnection, scopeDataLoaded, reconnect, refresh } =
    useMetaScopes(clientId);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          <p className="text-xs text-muted-foreground mt-2">Verificando permisos de Meta...</p>
        </CardContent>
      </Card>
    );
  }

  if (noConnection) return null;

  // Only show the scope panel when we have confirmed data from the edge function.
  // If the function is not deployed, errored, or returned unexpected data, hide silently.
  if (!scopeDataLoaded) return null;

  if (!needsReconnect) {
    return (
      <Card className="border-green-500/30 bg-green-500/5" role="status">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/10" aria-hidden="true">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700">Todos los permisos activos</p>
              <p className="text-xs text-muted-foreground">
                Tu conexion Meta Ads tiene todos los permisos necesarios.
              </p>
            </div>
            <Button variant="ghost" size="sm" aria-label="Actualizar estado de permisos" onClick={refresh}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5" role="alert">
      <CardContent className="py-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-yellow-500/10 shrink-0" aria-hidden="true">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-700">
              {tokenExpired ? 'Token de Meta expirado' : 'Permisos insuficientes'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tokenExpired
                ? 'Tu token de Meta ha expirado. Reconecta para renovarlo y obtener todos los permisos.'
                : 'Algunas funciones necesitan permisos adicionales. Reconecta Meta Ads para activarlas.'}
            </p>
          </div>
        </div>

        {/* Feature status grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {features.map((f) => (
            <FeatureRow key={f.key} feature={f} />
          ))}
        </div>

        <Button onClick={reconnect} className="w-full" size="sm">
          <ExternalLink className="w-3.5 h-3.5 mr-2" />
          Reconectar Meta Ads con todos los permisos
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Individual feature row
// ---------------------------------------------------------------------------

function FeatureRow({ feature }: { feature: FeatureStatus }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs ${
        feature.available
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-red-500/20 bg-red-500/5'
      }`}
    >
      {feature.available ? (
        <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
      )}
      <span className={feature.available ? 'text-green-700' : 'text-red-600'}>
        {feature.label}
      </span>
      {!feature.available && (
        <Badge variant="outline" className="text-[9px] ml-auto text-red-500 border-red-500/30">
          Reconectar
        </Badge>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline alert for individual sections (compact)
// ---------------------------------------------------------------------------

export default function MetaScopeAlert({ clientId, requiredFeature, compact }: MetaScopeAlertProps) {
  const { loading, features, noConnection, tokenExpired, scopeDataLoaded, reconnect, hasFeature } =
    useMetaScopes(clientId);

  if (loading || noConnection) return null;

  // Only show alerts when we have confirmed scope data from the edge function
  if (!scopeDataLoaded) return null;

  // If a specific feature is required, only show alert if it's unavailable
  if (requiredFeature && hasFeature(requiredFeature)) return null;

  // If no specific feature and nothing is missing, don't show
  if (!requiredFeature && !tokenExpired && features.every((f) => f.available)) return null;

  const relevantFeature = requiredFeature
    ? features.find((f) => f.key === requiredFeature)
    : undefined;

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
        <p className="text-xs text-yellow-700 flex-1">
          {tokenExpired
            ? 'Token expirado.'
            : relevantFeature
              ? `${relevantFeature.label} necesita permisos adicionales.`
              : 'Permisos insuficientes.'}
          {' '}
          <button onClick={reconnect} className="underline font-medium">
            Reconectar Meta Ads
          </button>
        </p>
      </div>
    );
  }

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5 mb-4" role="alert">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-yellow-500/10 shrink-0" aria-hidden="true">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-700">
              {tokenExpired
                ? 'Token de Meta expirado'
                : `Necesitas reconectar Meta Ads`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {tokenExpired
                ? 'Tu token ha expirado. Reconecta para seguir usando esta función.'
                : relevantFeature
                  ? `Para usar ${relevantFeature.label}, necesitas los permisos: ${relevantFeature.missingScopes.join(', ')}. Reconecta Meta Ads para obtenerlos.`
                  : 'Algunas funciones necesitan permisos adicionales. Reconecta para activarlas.'}
            </p>
            <Button onClick={reconnect} size="sm" className="mt-3">
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Reconectar Meta Ads
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
