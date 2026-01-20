import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link2, CheckCircle, XCircle, RefreshCw, ExternalLink, ShoppingBag } from 'lucide-react';
import { ClientOnboardingSteps } from './ClientOnboardingSteps';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';
import logoGoogle from '@/assets/logo-google-ads.png';

const SHOPIFY_CLIENT_ID = '933109488c1e95e5fd630abb7e03809e';
const GOOGLE_CLIENT_ID = '870555860271-um4g70a5ob5bs56rpusni6eci01f77mn.apps.googleusercontent.com';

interface ClientPortalConnectionsProps {
  clientId: string;
  isAdmin?: boolean;
}

interface Connection {
  id: string;
  platform: 'shopify' | 'meta' | 'google';
  store_name: string | null;
  store_url: string | null;
  account_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
}

const platformConfig = {
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
};

export function ClientPortalConnections({ clientId, isAdmin = false }: ClientPortalConnectionsProps) {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [connectingShopify, setConnectingShopify] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

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
    } catch (error) {
      console.error('Error fetching connections:', error);
      toast.error('Error al cargar conexiones');
    } finally {
      setLoading(false);
    }
  }

  const handleConnectMeta = () => {
    setConnectingMeta(true);
    
    // Build Meta OAuth URL
    const metaAppId = import.meta.env.VITE_META_APP_ID;
    if (!metaAppId) {
      toast.error('Configuración de Meta no disponible');
      setConnectingMeta(false);
      return;
    }

    const redirectUri = `${window.location.origin}/oauth/meta/callback`;
    const scopes = [
      'ads_read',
      'ads_management',
      'business_management',
      'read_insights',
    ].join(',');

    // Store client_id in sessionStorage for callback
    sessionStorage.setItem('meta_oauth_client_id', clientId);

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${clientId}`;

    window.location.href = authUrl;
  };

  const handleConnectShopify = () => {
    setConnectingShopify(true);

    // Store client_id in sessionStorage for callback
    sessionStorage.setItem('shopify_oauth_client_id', clientId);

    // Build Shopify OAuth URL
    const redirectUri = `${window.location.origin}/oauth/shopify/callback`;
    const scopes = 'read_products,read_orders,read_customers,read_analytics';
    
    // Open a prompt to get the store name
    const storeName = prompt('Ingresa el nombre de tu tienda Shopify (ej: mi-tienda)');
    
    if (!storeName) {
      setConnectingShopify(false);
      return;
    }

    const shopDomain = storeName.includes('.myshopify.com') 
      ? storeName 
      : `${storeName}.myshopify.com`;

    const authUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${clientId}`;

    window.location.href = authUrl;
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
    try {
      toast.loading('Sincronizando...', { id: 'sync' });

      let functionName = 'sync-shopify-metrics';
      if (connection.platform === 'meta') {
        functionName = 'sync-meta-metrics';
      } else if (connection.platform === 'google') {
        functionName = 'sync-google-ads-metrics';
      }

      const { error } = await supabase.functions.invoke(functionName, {
        body: { connection_id: connection.id },
      });

      if (error) throw error;

      toast.success('Sincronización completada', { id: 'sync' });
      fetchConnections();
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Error al sincronizar', { id: 'sync' });
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

  return (
    <div className="space-y-6">
      {/* Onboarding Steps */}
      <ClientOnboardingSteps
        connections={connections}
        onConnectMeta={handleConnectMeta}
        onConnectShopify={handleConnectShopify}
        onConnectGoogle={handleConnectGoogle}
        isConnectingMeta={connectingMeta}
        isConnectingShopify={connectingShopify}
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
            return (
              <Card key={connection.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    {config.logo && (
                      <img src={config.logo} alt={config.name} className="h-10 w-10 object-contain" />
                    )}
                    <div>
                      <p className="font-medium">{config.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {connection.store_name || connection.account_id || 'Conectado'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={connection.is_active ? 'default' : 'secondary'}>
                      {connection.is_active ? (
                        <><CheckCircle className="w-3 h-3 mr-1" /> Activo</>
                      ) : (
                        <><XCircle className="w-3 h-3 mr-1" /> Inactivo</>
                      )}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncConnection(connection)}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Sincronizar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Connect New Platform */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conectar Nueva Plataforma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Shopify Connection */}
          {!hasShopifyConnection && (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <img src={logoShopify} alt="Shopify" className="h-10 w-10 object-contain" />
                <div>
                  <p className="font-medium">Shopify</p>
                  <p className="text-sm text-muted-foreground">
                    Conecta tu tienda online
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleConnectShopify}
                disabled={connectingShopify}
              >
                {connectingShopify ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingBag className="w-4 h-4 mr-2" />
                )}
                Conectar Shopify
              </Button>
            </div>
          )}

          {/* Meta Ads Connection */}
          {!hasMetaConnection && (
            <div className="flex items-center justify-between p-4 border rounded-lg">
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
              >
                {connectingMeta ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Conectar con Meta
              </Button>
            </div>
          )}

          {/* Google Ads Connection */}
          {!hasGoogleConnection && (
            <div className="flex items-center justify-between p-4 border rounded-lg">
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
              >
                {connectingGoogle ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Conectar con Google
              </Button>
            </div>
          )}

          {hasMetaConnection && hasShopifyConnection && hasGoogleConnection && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todas las plataformas disponibles están conectadas
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
