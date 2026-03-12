import { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { ShoppingBag, RefreshCw, TrendingUp, Globe, Link2, Search, ShoppingCart, CheckCircle, AlertTriangle, Image, Type, FileText, ChevronDown } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts';
import { TopSkusPanel, SkuData } from './metrics/TopSkusPanel';
import { AbandonedCartsPanel, AbandonedCart } from './metrics/AbandonedCartsPanel';
import { ShopifyProductsPanel } from './ShopifyProductsPanel';
import { ChartSkeleton, TableSkeleton } from './metrics/MetricsSkeleton';
import { Coachmark } from '@/components/client-portal/Coachmark';

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
  const [dailyBreakdown, setDailyBreakdown] = useState<{ date: string; revenue: number; orders: number }[]>([]);
  const [daysBack, setDaysBack] = useState(30);

  // Responsive: detect mobile for chart adjustments
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const resizeHandler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, []);

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
      setDailyBreakdown(analyticsRes.data?.dailyBreakdown || []);
      if (productsRes.data?.products) {
        setSeoProducts(productsRes.data.products);
      }
    } catch (e: any) {
      console.warn('[ShopifyDashboard] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Aggregate abandoned carts by day — must be before early returns to respect hook rules
  const abandonedCartsByDay = useMemo(() => {
    const byDate: Record<string, { count: number; value: number }> = {};
    abandonedCarts.forEach((cart) => {
      const date = cart.abandonedAt ? cart.abandonedAt.split('T')[0] : null;
      if (!date) return;
      if (!byDate[date]) byDate[date] = { count: 0, value: 0 };
      byDate[date].count += 1;
      byDate[date].value += cart.totalValue || 0;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }, [abandonedCarts]);

  if (!hasConnection) {
    return (
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton rows={5} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton rows={5} />
          <TableSkeleton rows={5} />
        </div>
        <TableSkeleton rows={4} />
      </div>
    );
  }

  const totalChannelRevenue = salesByChannel.reduce((s, c) => s + c.revenue, 0);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      <Coachmark id="shopify_intro" message="Aquí ves ventas diarias, carritos abandonados, canales de venta y un análisis SEO rápido de tus productos." />
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

      {/* Daily Sales Chart */}
      {dailyBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-white border border-slate-200 rounded-xl card-hover">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Ventas por Día
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 350}>
                  <ComposedChart data={dailyBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
                    <defs>
                      <linearGradient id="shopifyRevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: isMobile ? 10 : 12 }} className="text-muted-foreground" tickFormatter={(val: string) => val.slice(5)} interval={isMobile ? 'preserveStartEnd' : 0} angle={isMobile ? -45 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 60 : 30} />
                    <YAxis yAxisId="left" tick={{ fontSize: isMobile ? 10 : 12 }} className="text-muted-foreground" tickFormatter={formatCurrency} width={isMobile ? 45 : 60} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: isMobile ? 10 : 12 }} className="text-muted-foreground" width={isMobile ? 35 : 50} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value: number, name: string) => [
                        name === 'revenue' ? `$${value.toLocaleString('es-CL')} CLP` : value.toLocaleString('es-CL'),
                        name === 'revenue' ? 'Ingresos' : 'Pedidos'
                      ]}
                      labelFormatter={(label) => `Fecha: ${label}`}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#shopifyRevGrad)" name="revenue" />
                    <Bar yAxisId="right" dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.4} name="orders" />
                  </ComposedChart>
              </ResponsiveContainer>
              <div className={`flex items-center justify-center gap-${isMobile ? '4' : '6'} mt-4 text-xs`}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Ingresos</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary opacity-40" />
                  <span className="text-muted-foreground">Pedidos</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Abandoned Carts by Day */}
          <Card className="bg-white border border-slate-200 rounded-xl card-hover">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Carritos Abandonados por Día
              </CardTitle>
            </CardHeader>
            <CardContent>
              {abandonedCartsByDay.length > 0 ? (
                <ResponsiveContainer width="100%" height={isMobile ? 250 : 350}>
                    <ComposedChart data={abandonedCartsByDay} margin={{ top: 10, right: 10, left: 0, bottom: isMobile ? 20 : 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: isMobile ? 10 : 12 }} className="text-muted-foreground" tickFormatter={(val: string) => val.slice(5)} interval={isMobile ? 'preserveStartEnd' : 0} angle={isMobile ? -45 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 60 : 30} />
                      <YAxis yAxisId="left" tick={{ fontSize: isMobile ? 10 : 12 }} className="text-muted-foreground" width={isMobile ? 35 : 50} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: isMobile ? 10 : 12 }} className="text-muted-foreground" tickFormatter={formatCurrency} width={isMobile ? 45 : 60} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(value: number, name: string) => [
                          name === 'value' ? `$${value.toLocaleString('es-CL')} CLP` : value.toLocaleString('es-CL'),
                          name === 'value' ? 'Valor Perdido' : 'Carritos'
                        ]}
                        labelFormatter={(label) => `Fecha: ${label}`}
                      />
                      <Bar yAxisId="left" dataKey="count" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} name="count" />
                      <Line yAxisId="right" type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={false} name="value" />
                    </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-6">No hay carritos abandonados en este período</p>
              )}
              {abandonedCartsByDay.length > 0 && (
                <div className="flex items-center justify-center gap-6 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-destructive opacity-70" />
                    <span className="text-muted-foreground">Carritos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-orange-500" />
                    <span className="text-muted-foreground">Valor Perdido</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ventas por Canal */}
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
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
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
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
            <UtmTable utmPerformance={utmPerformance} />
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

function UtmTable({ utmPerformance }: { utmPerformance: UtmData[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = utmPerformance.length > 20;

  const virtualizer = useVirtualizer({
    count: utmPerformance.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 41, // approximate row height in px
    overscan: 5,
    enabled: useVirtual,
  });

  const headerRow = (
    <tr className="border-b">
      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Fuente</th>
      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Medio</th>
      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Campaña</th>
      <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Pedidos</th>
      <th className="text-right py-2 text-muted-foreground font-medium">Ingresos</th>
    </tr>
  );

  const renderRow = (utm: UtmData, i: number) => (
    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      <td className="py-2 pr-4">
        <Badge variant="outline" className="text-xs">{utm.source || '—'}</Badge>
      </td>
      <td className="py-2 pr-4 text-muted-foreground">{utm.medium || '—'}</td>
      <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{utm.campaign || '—'}</td>
      <td className="py-2 pr-4 text-right">{utm.orders}</td>
      <td className="py-2 text-right font-semibold">${utm.revenue.toLocaleString('es-CL')}</td>
    </tr>
  );

  if (!useVirtual) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>{headerRow}</thead>
          <tbody>
            {utmPerformance.map((utm, i) => renderRow(utm, i))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>{headerRow}</thead>
      </table>
      <div ref={parentRef} className="overflow-auto max-h-[400px]">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          <table className="w-full text-sm">
            <tbody>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const utm = utmPerformance[virtualRow.index];
                return (
                  <tr
                    key={virtualRow.key}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                      display: 'table-row',
                    }}
                  >
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-xs">{utm.source || '—'}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{utm.medium || '—'}</td>
                    <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{utm.campaign || '—'}</td>
                    <td className="py-2 pr-4 text-right">{utm.orders}</td>
                    <td className="py-2 text-right font-semibold">${utm.revenue.toLocaleString('es-CL')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SeoAnalysisCard({ products }: { products: any[] }) {
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({});

  if (products.length === 0) {
    return (
      <Card className="bg-white border border-slate-200 rounded-xl card-hover">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
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
      id: 'no-image',
      title: 'Productos sin imagen',
      icon: Image,
      count: noImage.length,
      total,
      items: noImage.map((p: any) => p.title),
      tip: 'Sube al menos una imagen para cada producto. Los productos sin imagen no generan clics.',
    },
    {
      id: 'missing-alt',
      title: 'Imágenes sin alt text',
      icon: Image,
      count: missingAlt.length,
      total,
      items: missingAlt.map((p: any) => p.title),
      tip: 'Configura el alt text en Shopify > Productos > Imagen > Editar texto alternativo.',
    },
    {
      id: 'short-title',
      title: 'Títulos cortos (<20 chars)',
      icon: Type,
      count: shortTitle.length,
      total,
      items: shortTitle.map((p: any) => p.title),
      tip: 'Usa títulos descriptivos con keywords. Ej: "Polera de Algodón Orgánico Azul para Mujer".',
    },
    {
      id: 'empty-desc',
      title: 'Descripciones vacías o muy cortas',
      icon: FileText,
      count: emptyDesc.length,
      total,
      items: emptyDesc.map((p: any) => p.title),
      tip: 'Las descripciones deben tener al menos 150 caracteres. Google indexa este contenido.',
    },
    {
      id: 'short-desc',
      title: 'Descripciones mejorables (<150 chars)',
      icon: FileText,
      count: improvableDesc.length,
      total,
      items: improvableDesc.map((p: any) => p.title),
      tip: 'Agrega beneficios, materiales, medidas y usos. Apunta a 300+ caracteres.',
    },
  ];

  // SEO Score: % of checks passed (weighted by affected products)
  const totalIssues = checks.reduce((s, c) => s + c.count, 0);
  const maxIssues = checks.length * total;
  const seoScore = maxIssues > 0 ? Math.round(((maxIssues - totalIssues) / maxIssues) * 100) : 100;
  const scoreColor = seoScore >= 80 ? 'text-green-500' : seoScore >= 50 ? 'text-orange-500' : 'text-red-500';
  const scoreBg = seoScore >= 80 ? 'bg-green-500/10 border-green-500/20' : seoScore >= 50 ? 'bg-orange-500/10 border-orange-500/20' : 'bg-red-500/10 border-red-500/20';

  const toggleExpanded = (id: string) => {
    setExpandedChecks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Card className="bg-white border border-slate-200 rounded-xl card-hover">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4" />
              Análisis SEO Rápido
            </CardTitle>
            <CardDescription className="mt-1">Análisis basado en {total} productos activos</CardDescription>
          </div>
          <div className={`flex items-center justify-center w-16 h-16 rounded-full border-2 ${scoreBg}`}>
            <div className="text-center">
              <div className={`text-xl font-bold ${scoreColor}`}>{seoScore}</div>
              <div className="text-[9px] text-muted-foreground -mt-0.5">/ 100</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checks.map((check) => {
            const isOk = check.count === 0;
            const passedPct = total > 0 ? ((total - check.count) / total) * 100 : 100;
            const CheckIcon = check.icon;
            const isExpanded = expandedChecks[check.id] || false;

            return (
              <div
                key={check.id}
                className={`p-3 rounded-lg border transition-colors ${
                  isOk
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-orange-500/5 border-orange-500/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-md ${isOk ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
                    <CheckIcon className={`w-3.5 h-3.5 ${isOk ? 'text-green-500' : 'text-orange-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{check.title}</p>
                      <Badge variant={isOk ? 'default' : 'destructive'} className="text-xs shrink-0">
                        {check.count}/{check.total}
                      </Badge>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isOk ? 'bg-green-500' : 'bg-orange-500'}`}
                        style={{ width: `${passedPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {Math.round(passedPct)}% de productos OK
                    </p>
                    {!isOk && (
                      <>
                        <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                          <strong>Tip:</strong> {check.tip}
                        </div>
                        {check.items.length > 0 && (
                          <button
                            onClick={() => toggleExpanded(check.id)}
                            className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            {isExpanded ? 'Ocultar' : 'Ver'} productos ({check.items.length})
                          </button>
                        )}
                        {isExpanded && (
                          <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                            {check.items.map((item, i) => (
                              <p key={i} className="text-xs text-muted-foreground truncate pl-1 border-l-2 border-orange-500/30">
                                {item}
                              </p>
                            ))}
                          </div>
                        )}
                      </>
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
