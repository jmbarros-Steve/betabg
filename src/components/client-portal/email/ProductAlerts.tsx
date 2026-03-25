import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import {
  Bell,
  Trash2,
  Loader2,
  RefreshCw,
  PackageSearch,
  TrendingDown,
  CheckCircle2,
  Copy,
  Code,
  AlertTriangle,
} from 'lucide-react';

interface ProductAlertsProps {
  clientId: string;
}

interface ProductAlert {
  id: string;
  product_id: string;
  product_title: string;
  product_image?: string;
  variant_id?: string;
  variant_title?: string;
  alert_type: 'back_in_stock' | 'price_drop';
  email: string;
  status: 'active' | 'triggered' | 'cancelled';
  created_at: string;
  triggered_at?: string;
}

interface AlertStats {
  total_active: number;
  back_in_stock: number;
  price_drop: number;
  triggered: number;
}

export function ProductAlerts({ clientId }: ProductAlertsProps) {
  const [alerts, setAlerts] = useState<ProductAlert[]>([]);
  const [stats, setStats] = useState<AlertStats>({
    total_active: 0,
    back_in_stock: 0,
    price_drop: 0,
    triggered: 0,
  });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const widgetUrl = `https://steve-api-850416724643.us-central1.run.app/api/email-product-alert-widget?client_id=${clientId}`;
  const scriptTag = `<script src="${widgetUrl}" async defer></script>`;

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await callApi<any>('email-product-alerts', {
        body: { action: 'list', client_id: clientId },
      });
      if (error) { toast.error(error); return; }
      setAlerts(data?.alerts || []);
    } catch (err) {
      toast.error('Error cargando alertas de productos');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const loadStats = useCallback(async () => {
    const { data } = await callApi<any>('email-product-alerts', {
      body: { action: 'get_stats', client_id: clientId },
    });
    if (data) {
      // Backend returns { stats: { back_in_stock: { active: N, triggered: N }, ... }, by_status: {...}, total }
      const s = data.stats || {};
      const bisActive = s.back_in_stock?.active || 0;
      const pdActive = s.price_drop?.active || 0;
      const bisTriggered = s.back_in_stock?.triggered || 0;
      const pdTriggered = s.price_drop?.triggered || 0;
      setStats({
        total_active: bisActive + pdActive,
        back_in_stock: bisActive,
        price_drop: pdActive,
        triggered: bisTriggered + pdTriggered,
      });
    }
  }, [clientId]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleDelete = async (alertId: string) => {
    setDeleting(alertId);
    try {
      const { error } = await callApi('email-product-alerts', {
        body: { action: 'delete', client_id: clientId, alert_id: alertId },
      });
      if (error) { toast.error(error); return; }
      toast.success('Alerta eliminada');
      loadAlerts();
      loadStats();
    } catch (err) {
      toast.error('Error eliminando alerta');
    } finally {
      setDeleting(null);
    }
  };

  const handleTriggerCheck = async (productId: string) => {
    setChecking(productId);
    try {
      const { data, error } = await callApi<any>('email-product-alerts', {
        body: { action: 'trigger_check', client_id: clientId, product_id: productId },
      });
      if (error) { toast.error(error); return; }
      toast.success(`Verificado: ${data?.triggered || 0} alertas notificadas`);
      loadAlerts();
      loadStats();
    } catch (err) {
      toast.error('Error verificando producto');
    } finally {
      setChecking(null);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    toast.success('Script copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  const alertTypeBadge = (type: string) => {
    if (type === 'back_in_stock') {
      return (
        <Badge className="bg-[#D6E0F0] text-[#132448]">
          <PackageSearch className="w-3 h-3 mr-1" />
          Volver en stock
        </Badge>
      );
    }
    return (
      <Badge className="bg-purple-100 text-purple-800">
        <TrendingDown className="w-3 h-3 mr-1" />
        Baja de precio
      </Badge>
    );
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      triggered: 'bg-amber-100 text-amber-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    const labels: Record<string, string> = {
      active: 'Activa',
      triggered: 'Notificada',
      cancelled: 'Cancelada',
    };
    return <Badge className={variants[status] || 'bg-gray-100'}>{labels[status] || status}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Alertas activas</span>
            </div>
            <div className="text-2xl font-bold">{stats.total_active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <PackageSearch className="w-4 h-4 text-[#2A4F9E]" />
              <span className="text-xs text-muted-foreground">Volver en stock</span>
            </div>
            <div className="text-2xl font-bold text-[#1E3A7B]">{stats.back_in_stock}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Baja de precio</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">{stats.price_drop}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Notificadas</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.triggered}</div>
          </CardContent>
        </Card>
      </div>

      {/* Widget installation */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Code className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="flex-1 space-y-2">
              <div>
                <h4 className="text-sm font-semibold">Widget de alertas para Shopify</h4>
                <p className="text-xs text-muted-foreground">
                  Agrega este script en tu theme de Shopify para mostrar botones de "Avisarme cuando vuelva" y "Alerta de baja de precio" en las páginas de producto.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={scriptTag}
                  className="font-mono text-xs bg-muted"
                />
                <Button variant="outline" size="sm" onClick={handleCopyScript} className="shrink-0">
                  {copied ? <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Cargando alertas...
                  </TableCell>
                </TableRow>
              ) : alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No hay alertas de productos registradas.
                    <br />
                    <span className="text-xs">Instala el widget en tu tienda Shopify para comenzar a recibir suscripciones.</span>
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {alert.product_image ? (
                          <img
                            src={alert.product_image}
                            alt={alert.product_title}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                            <PackageSearch className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium line-clamp-1">{alert.product_title}</p>
                          {alert.variant_title && (
                            <p className="text-xs text-muted-foreground">{alert.variant_title}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{alertTypeBadge(alert.alert_type)}</TableCell>
                    <TableCell className="text-sm">{alert.email}</TableCell>
                    <TableCell>{statusBadge(alert.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTriggerCheck(alert.product_id)}
                          disabled={checking === alert.product_id}
                          title="Verificar disponibilidad"
                        >
                          {checking === alert.product_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(alert.id)}
                          disabled={deleting === alert.id}
                          title="Eliminar alerta"
                        >
                          {deleting === alert.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4 text-red-500" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
