import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Link2, CheckCircle, XCircle, RefreshCw, ExternalLink, ShoppingBag, Key, Mail, Unlink, Smartphone, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { MetaAdAccountSelector } from './MetaAdAccountSelector';
import { MetaPartnerSetup } from './meta-ads/MetaPartnerSetup';
import { GooglePartnerSetup } from './google-ads/GooglePartnerSetup';
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
  connection_type?: string;
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
    color: 'bg-[#D6E0F0] text-[#132448]',
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
  const [showMetaPartnerSetup, setShowMetaPartnerSetup] = useState(false);
  const [showShopifyWizard, setShowShopifyWizard] = useState(false);
  const [showGooglePartnerSetup, setShowGooglePartnerSetup] = useState(false);
  const [showKlaviyoDialog, setShowKlaviyoDialog] = useState(false);
  const [klaviyoApiKey, setKlaviyoApiKey] = useState('');
  const [connectingKlaviyo, setConnectingKlaviyo] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<Connection | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappSaved, setWhatsappSaved] = useState('');
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);

  // Use Shopify auth fetch for embedded mode with Session Tokens
  const { callEdgeFunction, isEmbedded } = useShopifyAuthFetch();

  // Retry sync with exponential backoff (3 attempts: initial + 2 retries, 2s/4s delays)
  const { execute: retrySync, retrying: isSyncRetrying } = useRetrySync({ maxRetries: 2, baseDelay: 2000 });

  useEffect(() => {
    fetchConnections();
    fetchWhatsappPhone();
  }, [clientId]);

  async function fetchWhatsappPhone() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('whatsapp_phone')
        .eq('id', clientId)
        .maybeSingle();
      if (error) {
        console.error('[Connections] Failed to fetch WhatsApp phone:', error);
        return;
      }
      if (data?.whatsapp_phone) {
        setWhatsappPhone(data.whatsapp_phone);
        setWhatsappSaved(data.whatsapp_phone);
      }
    } catch (err) {
      console.error('[Connections] Unexpected error fetching WhatsApp phone:', err);
    }
  }

  async function handleSaveWhatsapp() {
    const cleaned = whatsappPhone.replace(/\s+/g, '').trim();
    if (!cleaned) {
      toast.error('Ingresa un número de WhatsApp');
      return;
    }
    setSavingWhatsapp(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ whatsapp_phone: cleaned })
        .eq('id', clientId);
      if (error) throw error;
      setWhatsappSaved(cleaned);
      setWhatsappPhone(cleaned);
      toast.success('WhatsApp conectado. Ahora puedes hablar con Steve desde tu celular');
    } catch {
      toast.error('Error al guardar WhatsApp');
    } finally {
      setSavingWhatsapp(false);
    }
  }

  async function fetchConnections() {
    try {
      const { data, error } = await supabase
        .from('platform_connections')
        .select('id, platform, store_name, store_url, account_id, is_active, last_sync_at, connection_type')
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
    // Open BM Partner setup (Leadsie) instead of direct OAuth
    setShowMetaPartnerSetup(true);
  };

  const handleConnectShopify = () => {
    setShowShopifyWizard(true);
  };

  const handleConnectGoogle = () => {
    setShowGooglePartnerSetup(true);
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
    <div className="space-y-6" data-testid="connections-page">
      {/* Onboarding removed */}

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
              <div key={connection.id} className="space-y-3" data-testid={`connection-card-${connection.platform}`}>
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
                      <Badge data-testid={`connection-status-${connection.platform}`} variant={connection.is_active ? 'default' : 'secondary'} className={connection.is_active ? 'bg-emerald-50 text-emerald-700 rounded-full' : ''}>
                        {connection.is_active ? (
                          <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Activo</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5 mr-1" /> Inactivo</>
                        )}
                      </Badge>
                      {isMeta && (connection.connection_type === 'bm_partner' || connection.connection_type === 'leadsie') && (
                        <Badge variant="outline" className="text-xs">BM Partner</Badge>
                      )}
                      {connection.platform === 'google' && connection.connection_type === 'leadsie' && (
                        <Badge variant="outline" className="text-xs">MCC</Badge>
                      )}
                      {!isKlaviyo && (
                        <Button
                          data-testid={`sync-${connection.platform}-btn`}
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
                        data-testid={`disconnect-${connection.platform}-btn`}
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
                    clientId={clientId}
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
              <Button data-testid="connect-shopify-btn" onClick={handleConnectShopify} className="bg-primary text-white rounded-lg hover:bg-primary/90">
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
                data-testid="connect-meta-btn"
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
                data-testid="connect-google-btn"
                onClick={handleConnectGoogle}
                className="bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
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
                data-testid="connect-klaviyo-btn"
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

          {/* WhatsApp Connection */}
          {whatsappSaved ? (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="py-6">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 bg-white rounded-xl p-3 shadow-sm border">
                    <QRCodeSVG
                      value="https://wa.me/15559061514?text=Hola%20Steve%20%F0%9F%90%95"
                      size={120}
                      level="M"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Smartphone className="w-5 h-5 text-green-600" />
                      <p className="font-semibold text-green-900">WhatsApp Conectado</p>
                      <Badge className="bg-emerald-100 text-emerald-700 rounded-full text-xs">
                        <CheckCircle className="w-3 h-3 mr-1" /> {whatsappSaved}
                      </Badge>
                    </div>
                    <p className="text-sm text-green-800 mb-3">
                      Escanea el QR o toca el botón para hablar con Steve desde tu celular.
                    </p>
                    <div className="flex items-center gap-3">
                      <a
                        href="https://wa.me/15559061514?text=Hola%20Steve%20%F0%9F%90%95"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-sm font-medium rounded-lg hover:bg-[#1ebe57] transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Hablar con Steve
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setWhatsappSaved('')}
                        className="text-green-700 hover:text-green-900"
                      >
                        Cambiar número
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-between p-6 border rounded-xl card-hover">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-green-100 text-green-800">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium">WhatsApp</p>
                  <p className="text-sm text-muted-foreground">
                    Conecta tu número para hablar con Steve desde tu celular
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="tel"
                  placeholder="+56 9 1234 5678"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="w-44 h-9 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleSaveWhatsapp}
                  disabled={savingWhatsapp || !whatsappPhone.trim()}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {savingWhatsapp ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {hasMetaConnection && hasShopifyConnection && hasGoogleConnection && hasKlaviyoConnection && whatsappSaved && (
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

      {/* Meta BM Partner Setup (Leadsie) */}
      <Dialog open={showMetaPartnerSetup} onOpenChange={setShowMetaPartnerSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={logoMeta} alt="Meta" className="h-5 w-5 object-contain" />
              Conectar Meta Ads
            </DialogTitle>
            <DialogDescription>
              Conecta tu cuenta publicitaria de Meta para gestionar campanas con Steve.
            </DialogDescription>
          </DialogHeader>
          <MetaPartnerSetup
            clientId={clientId}
            onConnected={() => {
              fetchConnections();
              setShowMetaPartnerSetup(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Google Ads MCC Setup (Leadsie) */}
      <Dialog open={showGooglePartnerSetup} onOpenChange={setShowGooglePartnerSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src={logoGoogle} alt="Google Ads" className="h-5 w-5 object-contain" />
              Conectar Google Ads
            </DialogTitle>
            <DialogDescription>
              Conecta tu cuenta de Google Ads para ver metricas y gestionar campanas con Steve.
            </DialogDescription>
          </DialogHeader>
          <GooglePartnerSetup
            clientId={clientId}
            onConnected={() => {
              fetchConnections();
              setShowGooglePartnerSetup(false);
            }}
          />
        </DialogContent>
      </Dialog>

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
