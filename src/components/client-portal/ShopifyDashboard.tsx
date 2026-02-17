import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShoppingBag, RefreshCw, TrendingUp, Globe, Link2, Search, ShoppingCart, Package } from 'lucide-react';
import { TopSkusPanel, SkuData } from './metrics/TopSkusPanel';
import { AbandonedCartsPanel, AbandonedCart } from './metrics/AbandonedCartsPanel';
import { ShopifyProductsPanel } from './ShopifyProductsPanel';

interface ShopifyDashboardProps {
  clientId: string;
}

interface ChannelData {
  channel: string;
  orders: number;
  revenue: number;
}

interface UtmData {
  utm: string;
  source: string;
  medium: string;
  campaign: string;
  orders: number;
  revenue: number;
}

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Tienda Online',
  pos: 'Punto de Venta',
  shopify_draft_order: 'Pedido Manual',
  iphone: 'App iOS',
  android: 'App Android',
  direct: 'Directo',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  '': 'Otro',
};

export function ShopifyDashboard({ clientId }: ShopifyDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState(false);
  const [skuData, setSkuData] = useState<SkuData[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [salesByChannel, setSalesByChannel] = useState<ChannelData[]>([]);
  const [utmPerformance, setUtmPerformance] = useState<UtmData[]>([]);
  const [daysBack, setDaysBack] = useState(30);

  useEffect(() => {
    checkConnection();
  }, [clientId]);

  useEffect(() => {
    if (connectionId) fetchAnalytics();
  }, [connectionId, daysBack]);

  const checkConnection = async () => {
    const { data } = await supabase
      .from('platform_connections')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'shopify')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (data) {
      setConnectionId(data.id);
      setHasConnection(true);
    } else {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-shopify-analytics', {
        body: { connectionId, daysBack },
      });
      if (error) throw error;
      setSkuData(data?.topSkus || []);
      setAbandonedCarts(data?.abandonedCarts || []);
      setSalesByChannel(data?.salesByChannel || []);
      setUtmPerformance(data?.utmPerformance || []);
    } catch (e: any) {
      console.warn('[ShopifyDashboard] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!hasConnection) {
    return (
      <Card className="glow-box">
        <CardContent className="py-12 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Conecta Shopify en la pestaña "Conexiones" para ver tu dashboard</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    );
  }

  const totalChannelRevenue = salesByChannel.reduce((s, c) => s + c.revenue, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Dashboard Shopify</h2>
          <p className="text-muted-foreground text-sm">Análisis completo de tu tienda</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                variant={daysBack === d ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setDaysBack(d)}
                className="text-xs"
              >
                {d}d
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchAnalytics}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Ventas por Canal */}
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Ventas por Canal
          </CardTitle>
        </CardHeader>
        <CardContent>
          {salesByChannel.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">No hay datos de canales</p>
          ) : (
            <div className="space-y-3">
              {salesByChannel.map((ch) => {
                const pct = totalChannelRevenue > 0 ? (ch.revenue / totalChannelRevenue) * 100 : 0;
                return (
                  <div key={ch.channel} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{CHANNEL_LABELS[ch.channel] || ch.channel}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{ch.orders} pedidos</span>
                        <span className="font-semibold">${ch.revenue.toLocaleString('es-CL')}</span>
                        <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top SKUs + Abandoned Carts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopSkusPanel skus={skuData} currency="CLP" />
        <AbandonedCartsPanel carts={abandonedCarts} currency="CLP" />
      </div>

      {/* UTMs con más ventas */}
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            UTMs con Más Ventas
          </CardTitle>
          <CardDescription>Campañas de marketing rastreadas por parámetros UTM</CardDescription>
        </CardHeader>
        <CardContent>
          {utmPerformance.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              No se encontraron UTMs en los pedidos. Asegúrate de usar parámetros utm_source, utm_medium y utm_campaign en tus links.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Fuente</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Medio</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Campaña</th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Pedidos</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {utmPerformance.map((utm, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">{utm.source || '—'}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{utm.medium || '—'}</td>
                      <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{utm.campaign || '—'}</td>
                      <td className="py-2 pr-4 text-right">{utm.orders}</td>
                      <td className="py-2 text-right font-semibold">${utm.revenue.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEO Quick Analysis */}
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4" />
            Análisis SEO Rápido
          </CardTitle>
          <CardDescription>Mejoras potenciales para el posicionamiento de tu tienda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <SeoCheckItem
              title="Títulos de productos optimizados"
              description="Asegúrate de que tus títulos incluyan keywords relevantes y sean descriptivos"
              status={skuData.length > 0 ? 'info' : 'warn'}
              tip="Ejemplo: En vez de 'Polera Azul', usa 'Polera de Algodón Orgánico Azul para Mujer - EcoStyle'"
            />
            <SeoCheckItem
              title="Descripciones de productos"
              description="Las descripciones deben tener al menos 150 palabras con keywords naturales"
              status="info"
              tip="Incluye beneficios, materiales, medidas y usos. Google indexa este contenido."
            />
            <SeoCheckItem
              title="Imágenes con texto alt"
              description="Cada imagen de producto debe tener texto alternativo descriptivo"
              status="info"
              tip="Configura el alt text en Shopify > Productos > Imagen > Editar texto alternativo"
            />
            <SeoCheckItem
              title="URLs amigables (handles)"
              description="Los handles de tus productos deben ser limpios y descriptivos"
              status="info"
              tip="Shopify genera handles automáticos, pero puedes editarlos para ser más descriptivos"
            />
            <SeoCheckItem
              title="Meta descriptions"
              description="Cada producto y colección debe tener meta description única"
              status="warn"
              tip="Ve a Shopify > Producto > SEO > Editar meta description (máx 160 caracteres)"
            />
            <SeoCheckItem
              title="Blog activo"
              description="Un blog con contenido relevante mejora significativamente el SEO orgánico"
              status="warn"
              tip="Publica al menos 2 artículos al mes sobre temas relacionados con tus productos"
            />
          </div>
        </CardContent>
      </Card>

      {/* Productos de Shopify */}
      <ShopifyProductsPanel clientId={clientId} />
    </div>
  );
}

function SeoCheckItem({ title, description, status, tip }: { title: string; description: string; status: 'ok' | 'warn' | 'info'; tip: string }) {
  return (
    <div className="p-3 border border-border rounded-lg">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${status === 'ok' ? 'bg-green-500' : status === 'warn' ? 'bg-orange-500' : 'bg-blue-500'}`} />
        <div className="flex-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
            💡 <strong>Tip:</strong> {tip}
          </div>
        </div>
      </div>
    </div>
  );
}
