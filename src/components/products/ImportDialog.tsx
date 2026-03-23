import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  platform: 'shopify' | 'mercadolibre';
  clientId: string;
  onSuccess: () => void;
}

type ImportStatus = 'idle' | 'loading-connections' | 'importing' | 'success' | 'error';

interface ImportResult {
  imported: number;
  updated: number;
  total: number;
  errors: string[];
}

export function ImportDialog({ open, onClose, platform, clientId, onSuccess }: ImportDialogProps) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setResult(null);
      setErrorMsg(null);
      return;
    }
    loadConnections();
  }, [open, clientId, platform]);

  async function loadConnections() {
    setStatus('loading-connections');
    const platformFilter = platform === 'mercadolibre' ? 'mercadolibre' : 'shopify';
    const { data, error } = await supabase
      .from('platform_connections')
      .select('id, store_name, store_url, account_id, is_active')
      .eq('client_id', clientId)
      .eq('platform', platformFilter)
      .eq('is_active', true);

    if (error || !data || data.length === 0) {
      setStatus('error');
      setErrorMsg(`No se encontraron conexiones ${platform === 'shopify' ? 'Shopify' : 'MercadoLibre'} activas`);
      return;
    }

    setConnections(data);
    setSelectedConnection(data[0].id);
    setStatus('idle');
  }

  async function handleImport() {
    if (!selectedConnection) return;
    setStatus('importing');
    setErrorMsg(null);

    const functionName = platform === 'shopify' ? 'import-shopify-products' : 'import-ml-products';

    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { connectionId: selectedConnection },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      toast.error(`Error importando: ${error.message}`);
      return;
    }

    if (data?.error) {
      setStatus('error');
      setErrorMsg(data.error);
      toast.error(`Error: ${data.error}`);
      return;
    }

    setResult(data);
    setStatus('success');
    toast.success(`Importados ${data.imported} productos, actualizados ${data.updated}`);
    onSuccess();
  }

  const platformLabel = platform === 'shopify' ? 'Shopify' : 'MercadoLibre';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Importar desde {platformLabel}
          </DialogTitle>
          <DialogDescription>
            Importa todos los productos activos a tu catálogo unificado
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {status === 'loading-connections' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando conexiones...
            </div>
          )}

          {status === 'idle' && connections.length > 0 && (
            <>
              {connections.length > 1 && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Conexión</label>
                  <select
                    value={selectedConnection || ''}
                    onChange={(e) => setSelectedConnection(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.store_name || c.store_url || c.account_id || c.id}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button onClick={handleImport} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                Importar productos de {platformLabel}
              </Button>
            </>
          )}

          {status === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importando productos...</p>
              <p className="text-xs text-muted-foreground">Esto puede tomar unos segundos</p>
            </div>
          )}

          {status === 'success' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Importación completada</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-green-700">{result.imported}</p>
                  <p className="text-xs text-green-600">Nuevos</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                  <p className="text-xs text-blue-600">Actualizados</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-slate-700">{result.total}</p>
                  <p className="text-xs text-slate-600">Total</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">{result.errors.length} errores:</p>
                  <div className="max-h-24 overflow-y-auto">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-amber-600">{e}</p>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={onClose} className="w-full" variant="outline">
                Cerrar
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-sm text-red-600">{errorMsg}</p>
              <Button onClick={() => setStatus('idle')} variant="outline" className="w-full">
                Reintentar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
