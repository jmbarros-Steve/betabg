import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import logoMeta from '@/assets/logo-meta-clean.png';

interface MetaAdAccountSelectorProps {
  connectionId: string;
  clientId: string;
  currentAccountId: string | null;
  onAccountSelected: (accountId: string) => void;
}

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone: string;
  business_id: string | null;
  business_name: string;
}

interface GroupedAccounts {
  [businessName: string]: AdAccount[];
}

export function MetaAdAccountSelector({
  connectionId,
  clientId,
  currentAccountId,
  onAccountSelected
}: MetaAdAccountSelectorProps) {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [groupedAccounts, setGroupedAccounts] = useState<GroupedAccounts>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>(currentAccountId || '');
  const [error, setError] = useState<string | null>(null);
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const [missingPermissions, setMissingPermissions] = useState<string[]>([]);

  useEffect(() => {
    fetchAdAccounts();
  }, [connectionId]);

  useEffect(() => {
    if (currentAccountId) {
      setSelectedAccount(currentAccountId);
    }
  }, [currentAccountId]);

  async function fetchAdAccounts() {
    setLoading(true);
    setError(null);
    setRequiresReconnect(false);
    setMissingPermissions([]);

    try {
      const { data, error: fnError } = await callApi('fetch-meta-ad-accounts', {
        body: { connection_id: connectionId }
      });

      if (fnError) throw fnError;

      if (data?.error) {
        setError(data.details || data.error);
        if (data.requires_reconnect) {
          setRequiresReconnect(true);
          setMissingPermissions(data.missing_permissions || []);
        }
        return;
      }

      setAccounts(data?.accounts || []);
      setGroupedAccounts(data?.grouped || {});
    } catch {
      // Error handled by state below
      setError('No se pudieron cargar las cuentas publicitarias');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectAccount(accountId: string) {
    // Validate accountId format (numeric only, max 20 digits)
    if (!/^\d{1,20}$/.test(accountId)) {
      toast.error('ID de cuenta inválido');
      return;
    }
    setSelectedAccount(accountId);
    setSaving(true);

    try {
      // Find the selected account name for store_name
      const selectedAcc = accounts.find(a => a.account_id === accountId);
      const storeName = selectedAcc?.name || accountId;

      // Update account_id AND store_name in platform_connections
      const { error: updateError } = await supabase
        .from('platform_connections')
        .update({ account_id: accountId, store_name: storeName })
        .eq('id', connectionId);

      if (updateError) throw updateError;

      toast.success('Cuenta publicitaria seleccionada');
      onAccountSelected(accountId);

      // Sync metrics + campaigns in parallel, purging stale data from previous account
      toast.loading('Sincronizando métricas y campañas...', { id: 'meta-sync' });

      const [metricsResult, campaignsResult] = await Promise.allSettled([
        callApi('sync-meta-metrics', {
          body: { connection_id: connectionId, purge_stale: true }
        }),
        callApi('sync-campaign-metrics', {
          body: { connection_id: connectionId, platform: 'meta', purge_stale: true }
        }),
      ]);

      const metricsOk = metricsResult.status === 'fulfilled' && !metricsResult.value.error;
      const campaignsOk = campaignsResult.status === 'fulfilled' && !campaignsResult.value.error;

      if (metricsOk && campaignsOk) {
        toast.success('Métricas y campañas sincronizadas', { id: 'meta-sync' });
      } else {
        toast.warning('Sincronización parcial — revisa la consola', { id: 'meta-sync' });
      }

      // Notify all views to refresh
      window.dispatchEvent(new CustomEvent('bg:sync-complete'));
    } catch {
      // Error handled by toast below
      toast.error('Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  }

  function handleReconnect() {
    // Redirect to Meta OAuth with proper scopes
    const META_APP_ID = '1994525824461583';
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
      'pages_show_list',
      'catalog_management',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'instagram_manage_messages',
      'public_profile',
      'email',
    ].join(',');

    sessionStorage.setItem('meta_oauth_client_id', clientId);
    
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&auth_type=rerequest`;

    window.location.href = authUrl;
  }

  if (loading) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            {requiresReconnect ? (
              <AlertTriangle className="h-6 w-6 text-destructive mt-0.5" />
            ) : (
              <AlertCircle className="h-6 w-6 text-destructive mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {requiresReconnect ? 'Permisos insuficientes' : 'Error al cargar cuentas'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              {missingPermissions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {missingPermissions.map(perm => (
                    <Badge key={perm} variant="outline" className="text-xs text-destructive border-destructive/30">
                      {perm}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {requiresReconnect ? (
              <Button size="sm" onClick={handleReconnect}>
                <ExternalLink className="w-4 h-4 mr-1" />
                Reconectar Meta
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={fetchAdAccounts}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Reintentar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card className="border-muted bg-muted/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <img src={logoMeta} alt="Meta" className="h-8 w-8 object-contain" />
            <div className="flex-1">
              <p className="text-sm font-medium">Sin cuentas activas</p>
              <p className="text-xs text-muted-foreground">
                No se encontraron cuentas publicitarias activas. Verifica que tengas acceso a al menos una Ad Account en Meta Business Suite.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAdAccounts}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Recargar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedAccountData = accounts.find(a => a.account_id === selectedAccount);
  const businessNames = Object.keys(groupedAccounts).sort();

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <img src={logoMeta} alt="Meta" className="h-8 w-8 object-contain" />
          <div>
            <CardTitle className="text-base">Cuenta Publicitaria de Meta</CardTitle>
            <CardDescription>
              {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} disponible{accounts.length !== 1 ? 's' : ''}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Select 
            value={selectedAccount} 
            onValueChange={handleSelectAccount}
            disabled={saving}
          >
            <SelectTrigger className="flex-1 bg-background">
              <SelectValue placeholder="Selecciona una cuenta publicitaria" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50 max-h-80">
              {businessNames.map((businessName) => (
                <SelectGroup key={businessName}>
                  <SelectLabel className="text-sm font-medium text-muted-foreground px-2 py-1.5">
                    {businessName}
                  </SelectLabel>
                  {groupedAccounts[businessName].map((account) => (
                    <SelectItem key={account.account_id} value={account.account_id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate max-w-[200px]">{account.name}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {account.currency}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {saving && (
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          )}

          {selectedAccountData && !saving && (
            <CheckCircle className="w-5 h-5 text-primary" />
          )}
        </div>

        {selectedAccountData && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary" className="text-xs">
              {selectedAccountData.business_name}
            </Badge>
            <span>•</span>
            <span>ID: {selectedAccountData.account_id}</span>
            <span>•</span>
            <span>{selectedAccountData.timezone}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
