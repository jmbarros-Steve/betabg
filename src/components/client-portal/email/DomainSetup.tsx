import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle2, Clock, AlertTriangle, Copy, Loader2, Globe } from 'lucide-react';

interface DomainSetupProps {
  clientId: string;
}

export function DomainSetup({ clientId }: DomainSetupProps) {
  const [domain, setDomain] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadDomain = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      // Only show the first domain for simplicity
      const domains = data?.domains || [];
      setDomain(domains.length > 0 ? domains[0] : null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadDomain(); }, [loadDomain]);

  const handleAdd = async () => {
    if (!newDomain) { toast.error('Ingresa tu dominio'); return; }
    setAdding(true);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'initiate', client_id: clientId, domain: newDomain },
      });
      if (error) { toast.error(error); return; }
      toast.success('Dominio agregado. Ahora agrega los registros DNS.');
      setNewDomain('');
      loadDomain();
    } finally {
      setAdding(false);
    }
  };

  const handleCheck = async () => {
    if (!domain) return;
    setChecking(true);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'check', client_id: clientId, domain: domain.domain },
      });
      if (error) { toast.error(error); return; }
      if (data?.verified) {
        toast.success('Dominio verificado exitosamente');
      } else {
        toast.info('Todavia no verificado. Revisa que los registros DNS esten correctos.');
      }
      loadDomain();
    } finally {
      setChecking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold">Configurar dominio de envio</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Envia emails desde tu propio dominio (ej: info@tutienda.com)
        </p>
      </div>

      {/* Step 1: Enter domain — only show if no domain configured yet */}
      {!domain && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Paso 1: Tu dominio</Label>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="tutienda.com"
                onKeyDown={(e) => e.key === 'Enter' && newDomain && handleAdd()}
              />
            </div>
            <Button onClick={handleAdd} disabled={adding || !newDomain}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Verificar
            </Button>
          </div>
        </div>
      )}

      {/* Domain info & DNS records */}
      {domain && (
        <div className="space-y-4">
          {/* Domain name + status */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <Globe className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{domain.domain}</p>
            </div>
            <Badge
              className={
                domain.status === 'verified'
                  ? 'bg-green-100 text-green-800'
                  : domain.status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
              }
            >
              {domain.status === 'verified' && (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              )}
              {domain.status === 'pending' && (
                <Clock className="w-3 h-3 mr-1" />
              )}
              {domain.status === 'failed' && (
                <AlertTriangle className="w-3 h-3 mr-1" />
              )}
              {domain.status === 'verified'
                ? 'Verificado'
                : domain.status === 'failed'
                ? 'Error'
                : 'Pendiente'}
            </Badge>
          </div>

          {/* Step 2: DNS records table — only show when not yet verified */}
          {domain.status !== 'verified' && domain.dns_records?.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Paso 2: Agrega estos registros DNS
              </Label>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium">Tipo</th>
                      <th className="text-left px-3 py-2 font-medium">Nombre</th>
                      <th className="text-left px-3 py-2 font-medium">Valor</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.dns_records.map((record: any, i: number) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px]">
                            {record.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <code className="bg-muted px-1 py-0.5 rounded text-[11px] break-all">
                            {record.name}
                          </code>
                        </td>
                        <td className="px-3 py-2">
                          <code className="bg-muted px-1 py-0.5 rounded text-[11px] break-all">
                            {record.value}
                          </code>
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(record.value)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Agrega estos registros DNS en tu proveedor de dominio. La verificacion puede tomar hasta 72 horas.
              </p>
            </div>
          )}

          {/* Step 3: Check verification — only show when not yet verified */}
          {domain.status !== 'verified' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Paso 3: Comprobar verificacion
              </Label>
              <Button
                onClick={handleCheck}
                disabled={checking}
                variant="outline"
                className="w-full"
              >
                {checking ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Comprobar verificacion
              </Button>
            </div>
          )}

          {/* Verified success state */}
          {domain.status === 'verified' && (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Tu dominio esta verificado y listo para enviar emails.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
