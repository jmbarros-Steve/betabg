import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { toast } from 'sonner';
import { ShoppingBag, RefreshCw, TrendingUp, Globe, Link2, Search, ShoppingCart, Package, CheckCircle, AlertTriangle } from 'lucide-react';
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
  const [seoProducts, setSeoProducts] = useState<any[]>([]);
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
      const [analyticsRes, productsRes] = await Promise.all([
        callApi('fetch-shopify-analytics', { body: { connectionId, daysBack } }),
        callApi('fetch-shopify-products', { body: { connectionId } }),
      ]);
      if (analyticsRes.error) throw new Error(analyticsRes.error);
      setSkuData(analyticsRes.data?.topSkus || []);
      setAbandonedCarts(analyticsRes.data?.abandonedCarts || []);
      setSalesByChannel(analyticsRes.data?.salesByChannel || []);
      setUtmPerformance(analyticsRes.data?.utmPerformance || []);
      if (productsRes.data?.products) {
        setSeoProducts(productsRes.data.products);
      }
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
                    <th className="text-right py-2 text-muted-foreground font-medium">Ingresos</th>
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
      <SeoAnalysisCard products={seoProducts} />

      {/* Productos de Shopify */}
      <ShopifyProductsPanel clientId={clientId} />
    </div>
  );
}

function SeoAnalysisCard({ products }: { products: any[] }) {
  if (products.length === 0) {
    return (
      <Card className="glow-box">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Search className="w-4 h-4" />
            Análisis SEO Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-6">Cargando productos para análisis SEO...</p>
        </CardContent>
      </Card>
    );
  }

  const activeProducts = products.filter(p => p.status === 'active');
  const total = activeProducts.length;

  const noImage = activeProducts.filter(p => p.image_count === 0);
  const missingAlt = activeProducts.filter(p => p.images_without_alt > 0 && p.image_count > 0);
  const shortTitle = activeProducts.filter(p => (p.title || '').length < 20);
  const emptyDesc = activeProducts.filter(p => {
    const text = (p.body_html || '').replace(/<[^>]*>/g, '').trim();
    return text.length < 50;
  });
  const improvableDesc = activeProducts.filter(p => {
    const text = (p.body_html || '').replace(/<[^>]*>/g, '').trim();
    return text.length >= 50 && text.length < 150;
  });

  const checks = [
    {
      title: 'Productos sin imagen',
      count: noImage.length,
      total,
      items: noImage.map((p: any) => p.title).slice(0, 5),
      tip: 'Sube al menos una imagen para cada producto. Los productos sin imagen no generan clics.',
    },
    {
      title: 'Imágenes sin alt text',
      count: missingAlt.length,
      total,
      items: missingAlt.map((p: any) => p.title).slice(0, 5),
      tip: 'Configura el alt text en Shopify > Productos > Imagen > Editar texto alternativo.',
    },
    {
      title: 'Títulos cortos (<20 chars)',
      count: shortTitle.length,
      total,
      items: shortTitle.map((p: any) => p.title).slice(0, 5),
      tip: 'Usa títulos descriptivos con keywords. Ej: "Polera de Algodón Orgánico Azul para Mujer".',
    },
    {
      title: 'Descripciones vacías o muy cortas',
      count: emptyDesc.length,
      total,
      items: emptyDesc.map((p: any) => p.title).slice(0, 5),
      tip: 'Las descripciones deben tener al menos 150 caracteres. Google indexa este contenido.',
    },
    {
      title: 'Descripciones mejorables (<150 chars)',
      count: improvableDesc.length,
      total,
      items: improvableDesc.map((p: any) => p.title).slice(0, 5),
      tip: 'Agrega beneficios, materiales, medidas y usos. Apunta a 300+ caracteres.',
    },
  ];

  return (
    <Card className="glow-box">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Search className="w-4 h-4" />
          Análisis SEO Rápido
        </CardTitle>
        <CardDescription>Análisis basado en {total} productos activos</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {checks.map((check) => {
            const isOk = check.count === 0;
            return (
              <div key={check.title} className="p-3 border border-border rounded-lg">
                <div className="flex items-start gap-3">
                  {isOk ? (
                    <CheckCircle className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{check.title}</p>
                      <Badge variant={isOk ? 'default' : 'destructive'} className="text-xs">
                        {check.count}/{check.total}
                      </Badge>
                    </div>
                    {!isOk && check.items.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {check.items.join(', ')}{check.count > 5 ? ` y ${check.count - 5} más...` : ''}
                      </p>
                    )}
                    {!isOk && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                        <strong>Tip:</strong> {check.tip}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
