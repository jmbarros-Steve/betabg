import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import logoMeta from '@/assets/logo-meta-clean.png';

interface MetaAdAccountSelectorProps {
  connectionId: string;
  currentAccountId: string | null;
  onAccountSelected: (accountId: string) => void;
}

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone: string;
}

export function MetaAdAccountSelector({ 
  connectionId, 
  currentAccountId,
  onAccountSelected 
}: MetaAdAccountSelectorProps) {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>(currentAccountId || '');
  const [error, setError] = useState<string | null>(null);

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

    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-meta-ad-accounts', {
        body: { connection_id: connectionId }
      });

      if (fnError) throw fnError;

      if (data?.error) {
        setError(data.error);
        return;
      }

      setAccounts(data?.accounts || []);
    } catch (err) {
      console.error('Error fetching ad accounts:', err);
      setError('No se pudieron cargar las cuentas publicitarias');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectAccount(accountId: string) {
    setSelectedAccount(accountId);
    setSaving(true);

    try {
      // Update the platform_connections table with the selected account_id
      const { error: updateError } = await supabase
        .from('platform_connections')
        .update({ account_id: accountId })
        .eq('id', connectionId);

      if (updateError) throw updateError;

      toast.success('Cuenta publicitaria seleccionada');
      onAccountSelected(accountId);

      // Auto-trigger sync after selecting account
      toast.loading('Sincronizando métricas...', { id: 'meta-sync' });
      
      const { error: syncError } = await supabase.functions.invoke('sync-meta-metrics', {
        body: { connection_id: connectionId }
      });

      if (syncError) {
        toast.error('Error al sincronizar métricas', { id: 'meta-sync' });
      } else {
        toast.success('Métricas sincronizadas correctamente', { id: 'meta-sync' });
      }
    } catch (err) {
      console.error('Error saving account:', err);
      toast.error('Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/30">
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
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Error al cargar cuentas</p>
              <p className="text-xs text-destructive/80">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAdAccounts}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <img src={logoMeta} alt="Meta" className="h-8 w-8 object-contain" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-foreground">Sin cuentas activas</p>
              <p className="text-xs text-muted-foreground">
                No se encontraron cuentas publicitarias activas asociadas a este token.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const selectedAccountData = accounts.find(a => a.account_id === selectedAccount);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <img src={logoMeta} alt="Meta" className="h-8 w-8 object-contain" />
          <div>
            <CardTitle className="text-base">Cuenta Publicitaria de Meta</CardTitle>
            <CardDescription>
              Selecciona la cuenta para sincronizar métricas
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
            <SelectContent className="bg-popover z-50">
              {accounts.map((account) => (
                <SelectItem key={account.account_id} value={account.account_id}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{account.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {account.currency}
                    </Badge>
                  </div>
                </SelectItem>
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
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>ID: {selectedAccountData.account_id}</span>
            <span>•</span>
            <span>{selectedAccountData.timezone}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
