import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Store, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import logoShopify from '@/assets/logo-shopify-clean.png';
import logoMeta from '@/assets/logo-meta-clean.png';

interface Client {
  id: string;
  name: string;
  company: string | null;
}

interface PlatformConnection {
  id: string;
  client_id: string;
  platform: 'shopify' | 'meta' | 'google' | 'klaviyo';
  store_name: string | null;
  store_url: string | null;
  account_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  clients?: Client;
}

const platformConfig: Record<string, { name: string; icon: string | null; color: string; fields: string[] }> = {
  shopify: {
    name: 'Shopify',
    icon: logoShopify,
    color: 'bg-green-500/10 text-green-600',
    fields: ['store_url', 'access_token'],
  },
  meta: {
    name: 'Meta Ads',
    icon: logoMeta,
    color: 'bg-blue-500/10 text-blue-600',
    fields: ['account_id', 'access_token'],
  },
  google: {
    name: 'Google',
    icon: null,
    color: 'bg-red-500/10 text-red-600',
    fields: ['account_id', 'access_token'],
  },
  klaviyo: {
    name: 'Klaviyo',
    icon: null,
    color: 'bg-purple-500/10 text-purple-600',
    fields: ['api_key'],
  },
};

export function PlatformConnectionsPanel() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<'shopify' | 'meta' | 'google'>('shopify');
  const [storeName, setStoreName] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [accountId, setAccountId] = useState('');

  useEffect(() => {
    if (user) {
      fetchConnections();
      fetchClients();
    }
  }, [user]);

  const fetchConnections = async () => {
    // Fetch connections without sensitive token fields
    const { data, error } = await supabase
      .from('platform_connections')
      .select('id, client_id, platform, store_name, store_url, account_id, is_active, last_sync_at, created_at, clients(id, name, company)')
      .order('created_at', { ascending: false });

    if (!error) {
      setConnections(data || []);
    }
    setLoading(false);
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, company')
      .order('name');

    if (!error) {
      setClients(data || []);
    }
  };

  const handleAddConnection = async () => {
    if (!selectedClient || !selectedPlatform) {
      toast.error('Selecciona un cliente y plataforma');
      return;
    }

    if (selectedPlatform === 'shopify' && (!storeUrl || !accessToken)) {
      toast.error('Ingresa la URL de la tienda y el Access Token');
      return;
    }

    setSubmitting(true);

    try {
      // Send tokens securely through edge function (never stored in client memory longer than needed)
      const { data, error } = await callApi('store-platform-connection', {
        body: {
          clientId: selectedClient,
          platform: selectedPlatform,
          storeName: storeName || undefined,
          storeUrl: storeUrl || undefined,
          accessToken: accessToken || undefined,
          accountId: accountId || undefined,
        }
      });

      if (error) {
        throw new Error(error);
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Conexión creada exitosamente');
      setDialogOpen(false);
      resetForm();
      fetchConnections();
    } catch (error: any) {
      console.error('Error creating connection:', error);
      toast.error(error.message || 'Error al crear conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    const { error } = await supabase
      .from('platform_connections')
      .delete()
      .eq('id', id);

    if (!error) {
      toast.success('Conexión eliminada');
      fetchConnections();
    } else {
      toast.error('Error al eliminar conexión');
    }
  };

  const handleSyncMetrics = async (connection: PlatformConnection) => {
    setSyncing(connection.id);
    
    try {
      // Use appropriate sync function based on platform
      const functionName = connection.platform === 'meta' 
        ? 'sync-meta-metrics' 
        : 'sync-shopify-metrics';
      
      const bodyKey = connection.platform === 'meta' ? 'connection_id' : 'connectionId';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { [bodyKey]: connection.id }
      });

      if (error) throw error;
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      
      const successMessage = connection.platform === 'meta'
        ? `Métricas sincronizadas: ${data.metrics_synced || 0} registros`
        : `Métricas sincronizadas: ${data.ordersCount || 0} órdenes`;
      
      toast.success(successMessage);
      fetchConnections();
      // Notify other views to refresh instantly
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error('Error al sincronizar métricas');
    } finally {
      setSyncing(null);
    }
  };

  const resetForm = () => {
    setSelectedClient('');
    setSelectedPlatform('shopify');
    setStoreName('');
    setStoreUrl('');
    setAccessToken(''); // Clear token immediately
    setAccountId('');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse h-20 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-medium">Conexiones de Plataformas</h2>
          <p className="text-sm text-muted-foreground">
            Gestiona las conexiones de Shopify, Meta y Google de tus clientes
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm(); // Clear form including tokens when closing
        }}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Conexión
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Conexión de Plataforma</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} {client.company && `- ${client.company}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Plataforma</Label>
                <Select value={selectedPlatform} onValueChange={(v: 'shopify' | 'meta' | 'google') => setSelectedPlatform(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shopify">
                      <div className="flex items-center gap-2">
                        <img src={logoShopify} alt="Shopify" className="w-5 h-5" />
                        Shopify
                      </div>
                    </SelectItem>
                    <SelectItem value="meta">
                      <div className="flex items-center gap-2">
                        <img src={logoMeta} alt="Meta" className="w-5 h-5" />
                        Meta Ads
                      </div>
                    </SelectItem>
                    <SelectItem value="google">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-red-500" />
                        Google
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedPlatform === 'shopify' && (
                <>
                  <div className="space-y-2">
                    <Label>Nombre de la Tienda</Label>
                    <Input
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Mi Tienda"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>URL de la Tienda</Label>
                    <Input
                      value={storeUrl}
                      onChange={(e) => setStoreUrl(e.target.value)}
                      placeholder="mi-tienda.myshopify.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Solo el dominio, sin https://
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Access Token</Label>
                    <Input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="shpat_..."
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      El token se envía de forma segura y no se almacena en el navegador
                    </p>
                  </div>
                </>
              )}

              {selectedPlatform === 'meta' && (
                <>
                  <div className="space-y-2">
                    <Label>Ad Account ID</Label>
                    <Input
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="act_123456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Access Token</Label>
                    <Input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="EAA..."
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      El token se envía de forma segura y no se almacena en el navegador
                    </p>
                  </div>
                </>
              )}

              {selectedPlatform === 'google' && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    La integración con Google está en desarrollo. Próximamente disponible.
                  </p>
                </div>
              )}

              <Button 
                onClick={handleAddConnection} 
                className="w-full" 
                disabled={selectedPlatform === 'google' || submitting}
              >
                {submitting ? 'Guardando...' : 'Guardar Conexión'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {connections.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Store className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay conexiones configuradas</p>
          <p className="text-sm text-muted-foreground mt-1">
            Agrega una conexión para empezar a sincronizar métricas
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((connection) => {
            const config = platformConfig[connection.platform];
            return (
              <div
                key={connection.id}
                className="p-4 bg-white border border-slate-200 rounded-xl card-hover flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${config.color}`}>
                    {config.icon ? (
                      <img src={config.icon} alt={config.name} className="w-6 h-6" />
                    ) : (
                      <TrendingUp className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {connection.clients?.name || 'Cliente'}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {config.name}
                      </Badge>
                      {connection.is_active ? (
                        <Badge className="bg-green-500/10 text-green-600 text-xs">Activo</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactivo</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {connection.store_url || connection.account_id || 'Sin configurar'}
                    </p>
                    {connection.last_sync_at && (
                      <p className="text-xs text-muted-foreground">
                        Última sincronización: {new Date(connection.last_sync_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(connection.platform === 'shopify' || connection.platform === 'meta') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncMetrics(connection)}
                      disabled={syncing === connection.id}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${syncing === connection.id ? 'animate-spin' : ''}`} />
                      Sincronizar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteConnection(connection.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
