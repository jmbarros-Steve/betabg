import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Link2, CheckCircle, XCircle, RefreshCw, ExternalLink, ShoppingBag, Key, Mail, Unlink } from 'lucide-react';
import { ClientOnboardingSteps } from './ClientOnboardingSteps';
import { MetaAdAccountSelector } from './MetaAdAccountSelector';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoGoogle from '@/assets/logo-google-ads.png';
import { useShopifyAuthFetch } from '@/hooks/useShopifyAuthFetch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShopifyCustomAppWizard } from './ShopifyCustomAppWizard';
import { useRetrySync } from './useRetrySync';

const GOOGLE_CLIENT_ID = '850416724643-52bpu0tvsd9juc2v5b636ajfk4sogt24.apps.googleusercontent.com';
const META_APP_ID = '1994525824461583';

interface ClientPortalConnectionsProps {
  clientId: string;
  isAdmin?: boolean;
}

interface Connection {
  id: string;
  platform: 'shopify' | 'meta' | 'google' | 'klaviyo';
  store_name: string | null;
  store_url: string | null;
  account_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
}

const platformConfig: Record<string, { name: string; logo: string | null; color: string }> = {
  shopify: {
    name: 'Shopify',
    logo: logoShopify,
    color: 'bg-green-100 text-green-800',
  },
  meta: {
    name: 'Meta Ads',
    logo: logoMeta,
    color: 'bg-blue-100 text-blue-800',
  },
  google: {
    name: 'Google Ads',
    logo: logoGoogle,
    color: 'bg-yellow-100 text-yellow-800',
  },
  klaviyo: {
    name: 'Klaviyo',
    logo: null,
    color: 'bg-purple-100 text-purple-800',
  },
};

export function ClientPortalConnections({ clientId, isAdmin = false }: ClientPortalConnectionsProps) {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [showShopifyWizard, setShowShopifyWizard] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [showKlaviyoDialog, setShowKlaviyoDialog] = useState(false);
  const [klaviyoApiKey, setKlaviyoApiKey] = useState('');
  const [connectingKlaviyo, setConnectingKlaviyo] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<Connection | null>(null);

  // Use Shopify auth fetch for embedded mode with Session Tokens
  const { callEdgeFunction, isEmbedded } = useShopifyAuthFetch();

  // Retry sync with exponential backoff (3 attempts: initial + 2 retries, 2s/4s delays)
  const { execute: retrySync, retrying: isSyncRetrying } = useRetrySync({ maxRetries: 2, baseDelay: 2000 });

  useEffect(() => {
    fetchConnections();
  }, [clientId]);

  async function fetchConnections() {
    try {
      const { data, error } = await supabase
        .from('platform_connections')
        .select('id, platform, store_name, store_url, account_id, is_active, last_sync_at')
        .eq('client_id', clientId);

      if (error) throw error;
      setConnections(data || []);
    } catch {
      // Error handled by toast
      toast.error('Error al cargar conexiones');
    } finally {
      setLoading(false);
    }
  }

  const handleConnectMeta = () => {
    setConnectingMeta(true);
    
    const redirectUri = `${window.location.origin}/oauth/meta/callback`;
    const scopes = [
      'ads_read',
      'ads_management',
      'business_management',
      'read_insights',
      'pages_read_engagement',
      'pages_manage_ads',
      'pages_manage_metadata',
      'pages_messaging',
      'catalog_management',
      'instagram_manage_messages',
      'public_profile',
      'email',
    ].join(',');

    // Generate CSRF-safe state: random nonce + clientId
    const nonce = crypto.randomUUID();
    const oauthState = `${nonce}:${clientId}`;
    sessionStorage.setItem('meta_oauth_state', oauthState);
    sessionStorage.setItem('meta_oauth_client_id', clientId);

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${encodeURIComponent(oauthState)}`;

    window.location.href = authUrl;
  };

  const handleConnectShopify = () => {
    setShowShopifyWizard(true);
  };

  const handleConnectGoogle = () => {
    setConnectingGoogle(true);

    // Store client_id in sessionStorage for callback
    sessionStorage.setItem('google_ads_oauth_client_id', clientId);

    // Build Google OAuth URL
    const redirectUri = `${window.location.origin}/oauth/google-ads/callback`;
    const scopes = [
      'https://www.googleapis.com/auth/adwords',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&access_type=offline&prompt=consent&state=${clientId}`;

    window.location.href = authUrl;
  };

  const handleSyncConnection = async (connection: Connection) => {
    if (connection.platform === 'klaviyo') {
      toast.info('Klaviyo no requiere sincronización de métricas');
      return;
    }

    let functionName = 'sync-shopify-metrics';
    let bodyKey = 'connectionId';

    if (connection.platform === 'meta') {
      functionName = 'sync-meta-metrics';
      bodyKey = 'connection_id';
    } else if (connection.platform === 'google') {
      functionName = 'sync-google-ads-metrics';
      bodyKey = 'connection_id';
    }

    const platformLabel = platformConfig[connection.platform].name;
    setSyncingConnectionId(connection.id);
    toast.loading('Sincronizando...', { id: 'sync' });

    try {
      await retrySync(async () => {
        // Use callEdgeFunction which includes Session Token when embedded
        if (isEmbedded) {
          // Using Session Token auth for embedded sync
          const { data, error } = await callEdgeFunction(functionName, {
            body: { [bodyKey]: connection.id },
          });
          if (error) throw new Error(error);
          return data;
        } else {
          const { error } = await callApi(functionName, {
            body: { [bodyKey]: connection.id },
          });
          if (error) throw new Error(error);
        }
      }, platformLabel);

      toast.success('Sincronización completada', { id: 'sync' });
      fetchConnections();
      // Notify other views (e.g., Metrics dashboard) to refresh instantly
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
    } catch (error: any) {
      // Error handled by toast
      toast.error(error.message || `Error al sincronizar ${platformLabel} después de reintentar`, { id: 'sync' });
    } finally {
      setSyncingConnectionId(null);
    }
  };

  const handleDisconnect = (connection: Connection) => {
    setPendingDisconnect(connection);
    setDisconnectDialogOpen(true);
  };

  const confirmDisconnect = async () => {
    if (!pendingDisconnect) return;
    setDisconnectDialogOpen(false);
    const connection = pendingDisconnect;
    setPendingDisconnect(null);
    setDisconnecting(connection.id);
    try {
      const { error } = await supabase
        .from('platform_connections')
        .delete()
        .eq('id', connection.id);
      if (error) throw error;
      setConnections((prev) => prev.filter((c) => c.id !== connection.id));
      toast.success(`${platformConfig[connection.platform].name} desconectado`);
    } catch {
      // Error handled by toast
      toast.error('Error al desconectar');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleConnectKlaviyo = async () => {
    if (!klaviyoApiKey.trim()) {
      toast.error('Ingresa tu API Key de Klaviyo');
      return;
    }

    setConnectingKlaviyo(true);

    try {
      const { data, error } = await callApi('store-klaviyo-connection', {
        body: {
          client_id: clientId,
          api_key: klaviyoApiKey,
        },
      });

      if (error) throw new Error(error);

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Klaviyo conectado correctamente');
      setShowKlaviyoDialog(false);
      setKlaviyoApiKey('');
      fetchConnections();
    } catch {
      // Error handled by toast
      toast.error('Error al conectar Klaviyo');
    } finally {
      setConnectingKlaviyo(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  const hasMetaConnection = connections.some(c => c.platform === 'meta');
  const hasShopifyConnection = connections.some(c => c.platform === 'shopify');
  const hasGoogleConnection = connections.some(c => c.platform === 'google');
  const hasKlaviyoConnection = connections.some(c => c.platform === 'klaviyo');

  return (
    <div className="space-y-6">
      {/* Onboarding Steps */}
      <ClientOnboardingSteps
        connections={connections}
        onConnectMeta={handleConnectMeta}
        onConnectShopify={handleConnectShopify}
        onConnectGoogle={handleConnectGoogle}
        isConnectingMeta={connectingMeta}
        isConnectingShopify={false}
        isConnectingGoogle={connectingGoogle}
        isAdmin={isAdmin}
      />

      <div>
        <h2 className="text-2xl font-semibold mb-2">Mis Conexiones</h2>
        <p className="text-muted-foreground">
          Gestiona tus plataformas conectadas
        </p>
      </div>

      {/* Existing Connections Details */}
      {connections.length > 0 && (
        <div className="grid gap-4">
          {connections.map((connection) => {
            const config = platformConfig[connection.platform];
            const isKlaviyo = connection.platform === 'klaviyo';
            const isMeta = connection.platform === 'meta';
            
            return (
              <div key={connection.id} className="space-y-3">
                <Card>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      {config.logo ? (
                        <img src={config.logo} alt={config.name} className="h-10 w-10 object-contain" />
                      ) : (
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.color}`}>
                          <Mail className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{config.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {connection.store_name || connection.account_id || 'Conectado'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={connection.is_active ? 'default' : 'secondary'} className={connection.is_active ? 'bg-emerald-50 text-emerald-700 rounded-full' : ''}>
                        {connection.is_active ? (
                          <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Activo</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5 mr-1" /> Inactivo</>
                        )}
                      </Badge>
                      {!isKlaviyo && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSyncConnection(connection)}
                          disabled={(isMeta && !connection.account_id) || syncingConnectionId === connection.id}
                        >
                          <RefreshCw className={`w-4 h-4 mr-1 ${syncingConnectionId === connection.id ? 'animate-spin' : ''}`} />
                          {syncingConnectionId === connection.id && isSyncRetrying
                            ? 'Reintentando...'
                            : syncingConnectionId === connection.id
                              ? 'Sincronizando...'
                              : 'Sincronizar'}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label="Desconectar"
                        onClick={() => handleDisconnect(connection)}
                        disabled={disconnecting === connection.id}
                      >
                        {disconnecting === connection.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Unlink className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Meta Ad Account Selector */}
                {isMeta && (
                  <MetaAdAccountSelector
                    connectionId={connection.id}
                    currentAccountId={connection.account_id}
                    onAccountSelected={() => fetchConnections()}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Connect New Platform */}
      <Card className="bg-card border rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg">Conectar Nueva Plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Shopify Connection */}
          {!hasShopifyConnection && (
            <div className="flex items-center justify-between p-6 border rounded-xl card-hover">
              <div className="flex items-center gap-4">
                <img src={logoShopify} alt="Shopify" className="h-10 w-10 object-contain" />
                <div>
                  <p className="font-medium">Shopify</p>
                  <p className="text-sm text-muted-foreground">
                    Conecta tu tienda online
                  </p>
                </div>
              </div>
              <Button onClick={handleConnectShopify} className="bg-primary text-white rounded-lg hover:bg-primary/90">
                <ShoppingBag className="w-4 h-4 mr-2" />
                Conectar Shopify
              </Button>
            </div>
          )}

          {/* Meta Ads Connection */}
          {!hasMetaConnection && (
            <div className="flex items-center justify-between p-6 border rounded-xl card-hover">
              <div className="flex items-center gap-4">
                <img src={logoMeta} alt="Meta" className="h-10 w-10 object-contain" />
                <div>
                  <p className="font-medium">Meta Ads</p>
                  <p className="text-sm text-muted-foreground">
                    Facebook e Instagram Ads
                  </p>
                </div>
              </div>
              <Button
                onClick={handleConnectMeta}
                disabled={connectingMeta}
                className="bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                {connectingMeta ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Conectar Meta
              </Button>
            </div>
          )}

          {/* Google Ads Connection */}
          {!hasGoogleConnection && (
            <div className="flex items-center justify-between p-6 border rounded-xl card-hover">
              <div className="flex items-center gap-4">
                <img src={logoGoogle} alt="Google Ads" className="h-10 w-10 object-contain" />
                <div>
                  <p className="font-medium">Google Ads</p>
                  <p className="text-sm text-muted-foreground">
                    Campañas de búsqueda y display
                  </p>
                </div>
              </div>
              <Button
                onClick={handleConnectGoogle}
                disabled={connectingGoogle}
                className="bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                {connectingGoogle ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Conectar Google
              </Button>
            </div>
          )}

          {/* Klaviyo Connection */}
          {!hasKlaviyoConnection && (
            <div className="flex items-center justify-between p-6 border rounded-xl card-hover">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-purple-100 text-purple-800">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium">Klaviyo</p>
                  <p className="text-sm text-muted-foreground">
                    Email marketing y automatizaciones
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setShowKlaviyoDialog(true)}
                disabled={connectingKlaviyo}
                className="bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                {connectingKlaviyo ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Key className="w-4 h-4 mr-2" />
                )}
                Conectar Klaviyo
              </Button>
            </div>
          )}

          {hasMetaConnection && hasShopifyConnection && hasGoogleConnection && hasKlaviyoConnection && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todas las plataformas disponibles están conectadas
            </p>
          )}
        </CardContent>
      </Card>

      {/* Klaviyo API Key Dialog */}
      <Dialog open={showKlaviyoDialog} onOpenChange={setShowKlaviyoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-purple-600" />
              Conectar Klaviyo
            </DialogTitle>
            <DialogDescription>
              Sigue estos pasos para obtener tu API Key y conectar tu cuenta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Step-by-step guide */}
            <div className="space-y-3 bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm font-medium">Cómo obtener tu API Key:</p>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Inicia sesión en <a href="https://www.klaviyo.com/login" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">klaviyo.com</a></li>
                <li>Ve a <span className="font-medium text-foreground">Settings</span> (esquina inferior izquierda, ícono de engranaje)</li>
                <li>Selecciona <span className="font-medium text-foreground">API Keys</span></li>
                <li>Clic en <span className="font-medium text-foreground">"Create Private API Key"</span></li>
                <li>Ponle nombre (ej: "Steve") y copia la key que empieza con <code className="bg-muted px-1 rounded text-xs">pk_</code></li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label htmlFor="klaviyo-api-key">Private API Key</Label>
              <Input
                id="klaviyo-api-key"
                type="password"
                value={klaviyoApiKey}
                onChange={(e) => setKlaviyoApiKey(e.target.value)}
                placeholder="pk_..."
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setShowKlaviyoDialog(false);
                setKlaviyoApiKey('');
              }}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConnectKlaviyo}
                disabled={connectingKlaviyo || !klaviyoApiKey.trim()}
              >
                {connectingKlaviyo ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  'Conectar'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shopify Custom App Wizard */}
      <ShopifyCustomAppWizard
        open={showShopifyWizard}
        onClose={() => setShowShopifyWizard(false)}
        clientId={clientId}
        onConnected={() => {
          fetchConnections();
          setShowShopifyWizard(false);
        }}
      />

      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDisconnect
                ? `¿Desconectar ${platformConfig[pendingDisconnect.platform].name}? Podrás reconectar en cualquier momento.`
                : 'Esta acción no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDisconnect}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
