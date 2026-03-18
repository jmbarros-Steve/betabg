import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle2, Clock, AlertTriangle, Copy, Loader2, Globe, Trash2, Info } from 'lucide-react';

interface DomainSetupProps {
  clientId: string;
}

/** Build fallback DNS instruction records when API doesn't return them */
function getFallbackDnsRecords(domainName: string) {
  return [
    {
      type: 'TXT',
      name: domainName,
      value: 'v=spf1 include:amazonses.com ~all',
      purpose: 'SPF',
      status: 'pending',
    },
    {
      type: 'CNAME',
      name: `resend._domainkey.${domainName}`,
      value: `resend._domainkey.${domainName}.dkim.resend.dev`,
      purpose: 'DKIM',
      status: 'pending',
    },
    {
      type: 'TXT',
      name: `_dmarc.${domainName}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainName}`,
      purpose: 'DMARC',
      status: 'pending',
    },
  ];
}

export function DomainSetup({ clientId }: DomainSetupProps) {
  const [domain, setDomain] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDomain = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
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

  const handleDelete = async () => {
    if (!domain) return;
    setDeleting(true);
    try {
      const { error } = await callApi<any>('verify-email-domain', {
        body: { action: 'delete', client_id: clientId, domain: domain.domain },
      });
      if (error) { toast.error(error); return; }
      toast.success('Dominio eliminado');
      setDomain(null);
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Use stored DNS records or generate fallback instructions
  const dnsRecords = domain?.dns_records?.length > 0
    ? domain.dns_records
    : domain
    ? getFallbackDnsRecords(domain.domain)
    : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold">Configurar dominio de envio</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Envia emails desde tu propio dominio (ej: info@tutienda.com).
          Necesitas configurar registros SPF, DKIM y DMARC.
        </p>
      </div>

      {/* Step 1: Enter domain — only show if no domain configured yet */}
      {!domain && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Paso 1: Ingresa tu dominio</Label>
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
              Agregar dominio
            </Button>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3">
            <div className="flex gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium">Para enviar emails necesitas configurar:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><strong>SPF</strong> — Autoriza nuestros servidores a enviar emails en tu nombre</li>
                  <li><strong>DKIM</strong> — Firma digital que verifica la autenticidad del email</li>
                  <li><strong>DMARC</strong> — Politica que protege tu dominio contra suplantacion</li>
                </ul>
                <p>Ingresa tu dominio y te mostraremos los registros DNS exactos que debes agregar.</p>
              </div>
            </div>
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
              {domain.status === 'verified' && <CheckCircle2 className="w-3 h-3 mr-1" />}
              {domain.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
              {domain.status === 'failed' && <AlertTriangle className="w-3 h-3 mr-1" />}
              {domain.status === 'verified'
                ? 'Verificado'
                : domain.status === 'failed'
                ? 'Error'
                : 'Pendiente'}
            </Badge>
            {domain.status !== 'verified' && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />}
              </Button>
            )}
          </div>

          {/* DNS records table — always show when not verified */}
          {domain.status !== 'verified' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Agrega estos registros DNS en tu proveedor de dominio
              </Label>

              {/* Records grouped by purpose */}
              <div className="space-y-3">
                {dnsRecords.map((record: any, i: number) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {record.type}
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          {record.purpose || (record.name?.includes('dkim') ? 'DKIM' : record.name?.includes('dmarc') ? 'DMARC' : 'SPF')}
                        </span>
                      </div>
                      {record.status === 'verified' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-yellow-600" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Nombre / Host</p>
                        <div className="flex items-center gap-1.5">
                          <code className="bg-muted px-2 py-1 rounded text-[11px] break-all flex-1">
                            {record.name}
                          </code>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(record.name)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Valor</p>
                        <div className="flex items-center gap-1.5">
                          <code className="bg-muted px-2 py-1 rounded text-[11px] break-all flex-1">
                            {record.value}
                          </code>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(record.value)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <p>Agrega estos registros en el panel de tu proveedor de dominio (GoDaddy, Cloudflare, Namecheap, etc.).</p>
                    <p>La propagacion DNS puede tomar entre 5 minutos y 72 horas.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Check verification — only show when not yet verified */}
          {domain.status !== 'verified' && (
            <Button
              onClick={handleCheck}
              disabled={checking}
              className="w-full"
            >
              {checking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Comprobar verificacion
            </Button>
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
