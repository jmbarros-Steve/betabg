import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { Globe, CheckCircle2, Clock, AlertTriangle, Copy, RefreshCw, Plus, Loader2, Trash2 } from 'lucide-react';

interface DomainSetupProps {
  clientId: string;
}

export function DomainSetup({ clientId }: DomainSetupProps) {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setDomains(data?.domains || []);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadDomains(); }, [loadDomains]);

  const handleAdd = async () => {
    if (!newDomain) { toast.error('Dominio es requerido'); return; }
    setAdding(true);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'initiate', client_id: clientId, domain: newDomain },
      });
      if (error) { toast.error(error); return; }
      toast.success('Dominio agregado. Agrega los registros DNS y verifica.');
      setNewDomain('');
      loadDomains();
    } finally {
      setAdding(false);
    }
  };

  const handleCheck = async (domain: string) => {
    setChecking(domain);
    try {
      const { data, error } = await callApi<any>('verify-email-domain', {
        body: { action: 'check', client_id: clientId, domain },
      });
      if (error) { toast.error(error); return; }
      if (data?.verified) {
        toast.success(`${domain} verificado exitosamente!`);
      } else {
        toast.info(`${domain} todavía no verificado. Estado: ${data?.status}`);
      }
      loadDomains();
    } finally {
      setChecking(null);
    }
  };

  const handleDelete = async (domain: string) => {
    const { error } = await callApi('verify-email-domain', {
      body: { action: 'delete', client_id: clientId, domain },
    });
    if (error) { toast.error(error); return; }
    toast.success('Dominio eliminado');
    loadDomains();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'failed': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Configuración de Dominio</h3>
        <p className="text-sm text-muted-foreground">
          Verifica tu dominio para enviar emails que no caigan en spam
        </p>
      </div>

      {/* Add domain */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Agregar dominio</Label>
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="tudominio.com"
              />
            </div>
            <Button onClick={handleAdd} disabled={adding || !newDomain}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Verificar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Domain list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : domains.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No hay dominios configurados. Agrega tu dominio para empezar a enviar emails.
            </p>
          </CardContent>
        </Card>
      ) : (
        domains.map((domain) => (
          <Card key={domain.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusIcon(domain.status)}
                  <CardTitle className="text-base">{domain.domain}</CardTitle>
                  <Badge className={
                    domain.status === 'verified' ? 'bg-green-100 text-green-800' :
                    domain.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }>
                    {domain.status === 'verified' ? 'Verificado' :
                     domain.status === 'pending' ? 'Pendiente' : 'Error'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCheck(domain.domain)}
                    disabled={checking === domain.domain}
                  >
                    {checking === domain.domain ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(domain.domain)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {domain.dns_records?.length > 0 && domain.status !== 'verified' && (
              <CardContent>
                <p className="text-sm font-medium mb-3">Registros DNS requeridos:</p>
                <div className="space-y-3">
                  {domain.dns_records.map((record: any, i: number) => (
                    <div key={i} className="bg-muted/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{record.type}</Badge>
                          <span className="text-xs text-muted-foreground">{record.purpose}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(record.value)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-xs text-muted-foreground">Name: </span>
                          <code className="text-xs bg-background px-1.5 py-0.5 rounded">{record.name}</code>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Value: </span>
                          <code className="text-xs bg-background px-1.5 py-0.5 rounded break-all">{record.value}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Agrega estos registros en tu proveedor de DNS. La verificación puede tardar 24-72 horas.
                </p>
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
