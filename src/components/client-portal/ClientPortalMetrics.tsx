import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, DollarSign, ShoppingCart, Target } from 'lucide-react';
import { MetricsCharts } from './metrics/MetricsCharts';
import { TopSkusPanel, SkuData } from './metrics/TopSkusPanel';
import { AbandonedCartsPanel, AbandonedCart } from './metrics/AbandonedCartsPanel';
import { ConversionLtvPanel } from './metrics/ConversionLtvPanel';
import { ProfitMetricsPanel } from './metrics/ProfitMetricsPanel';
import { ProfitLossPanel, ProductMarginItem } from './metrics/ProfitLossPanel';
import { CohortAnalysisPanel } from './metrics/CohortAnalysisPanel';
import { MetricsDateFilter, DateRange } from './metrics/MetricsDateFilter';

interface ClientPortalMetricsProps {
  clientId: string;
}

interface MetricRow {
  metric_type: string;
  metric_value: number;
  metric_date: string;
}

interface FinancialConfig {
  default_margin_percentage: number;
  shopify_plan_cost: number;
  klaviyo_plan_cost: number;
  other_fixed_costs: number;
  payment_gateway_commission: number;
}

const defaultFinancialConfig: FinancialConfig = {
  default_margin_percentage: 30,
  shopify_plan_cost: 0,
  klaviyo_plan_cost: 0,
  other_fixed_costs: 0,
  payment_gateway_commission: 3.5,
};

function getDateRangeStart(range: DateRange): Date {
  const now = new Date();
  switch (range) {
    case '7d':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    case '30d':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    case '90d':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    case 'mtd':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'ytd':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  }
}

function getPreviousPeriodDates(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const currentStart = getDateRangeStart(range);
  const daysDiff = Math.ceil((now.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
  
  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);
  
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - daysDiff);
  
  return { start: prevStart, end: prevEnd };
}

export function ClientPortalMetrics({ clientId }: ClientPortalMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [rawMetrics, setRawMetrics] = useState<MetricRow[]>([]);
  const [previousMetrics, setPreviousMetrics] = useState<MetricRow[]>([]);
  const [financialConfig, setFinancialConfig] = useState<FinancialConfig>(defaultFinancialConfig);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [productBreakdown, setProductBreakdown] = useState<ProductMarginItem[]>([]);
  const [skuData, setSkuData] = useState<SkuData[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // Fetch connections
        const { data: connections, error: connError } = await supabase
          .from('platform_connections')
          .select('id, platform')
          .eq('client_id', clientId);

        if (connError) throw connError;

        if (!connections || connections.length === 0) {
          setRawMetrics([]);
          setPreviousMetrics([]);
          setConnectionIds([]);
          setLoading(false);
          return;
        }

        const connIds = connections.map((c) => c.id);
        // Separate Shopify connection IDs for revenue/orders (avoid double attribution)
        const shopifyConnIds = connections.filter(c => c.platform === 'shopify').map(c => c.id);
        const adConnIds = connections.filter(c => c.platform === 'meta' || c.platform === 'google').map(c => c.id);
        setConnectionIds(connIds);

        const startDate = getDateRangeStart(dateRange);
        const { start: prevStart, end: prevEnd } = getPreviousPeriodDates(dateRange);

        // Fetch current and previous metrics in parallel
        // IMPORTANT: Only fetch revenue/orders from Shopify connections to avoid double attribution
        // Ad spend comes from campaign_metrics (Meta + Google)
        const shopifyQueryIds = shopifyConnIds.length > 0 ? shopifyConnIds : ['00000000-0000-0000-0000-000000000000'];
        const adQueryIds = adConnIds.length > 0 ? adConnIds : ['00000000-0000-0000-0000-000000000000'];
        
        const [currentRes, prevRes, configRes, campaignCurrentRes, campaignPrevRes] = await Promise.all([
          // Only Shopify metrics for revenue/orders (no Meta purchase_value!)
          supabase
            .from('platform_metrics')
            .select('metric_type, metric_value, metric_date')
            .in('connection_id', shopifyQueryIds)
            .gte('metric_date', startDate.toISOString().split('T')[0])
            .order('metric_date', { ascending: true }),
          supabase
            .from('platform_metrics')
            .select('metric_type, metric_value, metric_date')
            .in('connection_id', shopifyQueryIds)
            .gte('metric_date', prevStart.toISOString().split('T')[0])
            .lte('metric_date', prevEnd.toISOString().split('T')[0]),
          supabase
            .from('client_financial_config')
            .select('*')
            .eq('client_id', clientId)
            .maybeSingle(),
          // Get ad spend from campaign_metrics (Meta + Google)
          supabase
            .from('campaign_metrics')
            .select('spend, conversion_value, metric_date, platform')
            .in('connection_id', adQueryIds)
            .gte('metric_date', startDate.toISOString().split('T')[0]),
          supabase
            .from('campaign_metrics')
            .select('spend, conversion_value, metric_date, platform')
            .in('connection_id', adQueryIds)
            .gte('metric_date', prevStart.toISOString().split('T')[0])
            .lte('metric_date', prevEnd.toISOString().split('T')[0]),
        ]);

        if (currentRes.error) throw currentRes.error;
        if (prevRes.error) throw prevRes.error;
        if (campaignCurrentRes.error) throw campaignCurrentRes.error;
        if (campaignPrevRes.error) throw campaignPrevRes.error;

        // Convert campaign metrics to platform_metrics format for ad spend
        const campaignToMetricRows = (data: any[] | null): MetricRow[] => {
          if (!data) return [];
          // Group by date and platform to avoid duplicates
          const byDatePlatform = new Map<string, { spend: number; platform: string }>();
          for (const row of data) {
            // IMPORTANT: date has hyphens; use a safe delimiter.
            const key = `${row.metric_date}|${row.platform}`;
            const existing = byDatePlatform.get(key) || { spend: 0, platform: row.platform };
            existing.spend += Number(row.spend) || 0;
            byDatePlatform.set(key, existing);
          }
          
          const result: MetricRow[] = [];
          for (const [key, value] of byDatePlatform) {
            const [date, platform] = key.split('|');
            result.push({
              metric_type: platform === 'meta' ? 'meta_spend' : 'google_spend',
              metric_value: value.spend,
              metric_date: date,
            });
            result.push({
              metric_type: 'ad_spend',
              metric_value: value.spend,
              metric_date: date,
            });
          }
          return result;
        };

        const currentCampaignMetrics = campaignToMetricRows(campaignCurrentRes.data);
        const prevCampaignMetrics = campaignToMetricRows(campaignPrevRes.data);

        setRawMetrics([
          ...(currentRes.data ?? []).map((m) => ({
            metric_type: m.metric_type,
            metric_value: Number(m.metric_value),
            metric_date: m.metric_date,
          })),
          ...currentCampaignMetrics,
        ]);

        setPreviousMetrics([
          ...(prevRes.data ?? []).map((m) => ({
            metric_type: m.metric_type,
            metric_value: Number(m.metric_value),
            metric_date: m.metric_date,
          })),
          ...prevCampaignMetrics,
        ]);

        if (configRes.data) {
          setFinancialConfig({
            default_margin_percentage: Number(configRes.data.default_margin_percentage),
            shopify_plan_cost: Number(configRes.data.shopify_plan_cost),
            klaviyo_plan_cost: Number(configRes.data.klaviyo_plan_cost),
            other_fixed_costs: Number(configRes.data.other_fixed_costs),
            payment_gateway_commission: Number(configRes.data.payment_gateway_commission),
          });
        }

        // Fetch Shopify products for per-product margin breakdown
        if (shopifyConnIds.length > 0) {
          try {
            const { data: prodData } = await supabase.functions.invoke('fetch-shopify-products', {
              body: { connectionId: shopifyConnIds[0] },
            });
            if (prodData?.products) {
              const marginConfig = configRes.data
                ? Number(configRes.data.default_margin_percentage) / 100
                : 0.3;
              const items: ProductMarginItem[] = prodData.products.map((p: any) => {
                const totalRevenue = (p.variants || []).reduce((sum: number, v: any) => sum + (v.price || 0), 0);
                const hasCost = (p.variants || []).some((v: any) => v.cost !== null);
                const totalCost = hasCost
                  ? (p.variants || []).reduce((sum: number, v: any) => sum + (v.cost || 0), 0)
                  : totalRevenue * (1 - marginConfig);
                const margin = totalRevenue - totalCost;
                const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;
                return {
                  title: p.title,
                  image: p.image,
                  revenue: totalRevenue,
                  cost: totalCost,
                  margin,
                  marginPercent,
                  quantity: (p.variants || []).reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0),
                };
              });
              items.sort((a, b) => b.revenue - a.revenue);
              setProductBreakdown(items);
            }
          } catch (e) {
            console.warn('[Metrics] Could not fetch products for P&L breakdown:', e);
          }

          // Fetch real SKU sales and abandoned checkouts
          try {
            const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, 'mtd': 30, 'ytd': 365 };
            const { data: analyticsData } = await supabase.functions.invoke('fetch-shopify-analytics', {
              body: { connectionId: shopifyConnIds[0], daysBack: daysMap[dateRange] || 30 },
            });
            if (analyticsData?.topSkus) {
              setSkuData(analyticsData.topSkus);
            }
            if (analyticsData?.abandonedCarts) {
              setAbandonedCarts(analyticsData.abandonedCarts);
            }
          } catch (e) {
            console.warn('[Metrics] Could not fetch analytics:', e);
          }
        }
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAll();

    // Refresh metrics instantly after any sync in other tabs
    const handler = () => {
      fetchAll();
    };
    window.addEventListener('bg:sync-complete', handler);
    return () => {
      window.removeEventListener('bg:sync-complete', handler);
    };
  }, [clientId, dateRange]);

  // Compute aggregated metrics
  const computeAggregates = (metrics: MetricRow[]) => {
    let totalRevenue = 0;
    let totalSpend = 0;
    let totalOrders = 0;
    let metaSpend = 0;
    let googleSpend = 0;
    const roasValues: number[] = [];

    metrics.forEach((m) => {
      switch (m.metric_type) {
        case 'revenue':
        case 'purchase_value':
        case 'gross_revenue':
          totalRevenue += m.metric_value;
          break;
        case 'orders':
        case 'purchases':
        case 'orders_count':
          totalOrders += m.metric_value;
          break;
        case 'ad_spend':
          // This comes from campaign_metrics - already aggregated
          totalSpend += m.metric_value;
          break;
        case 'meta_spend':
          metaSpend += m.metric_value;
          break;
        case 'google_spend':
          googleSpend += m.metric_value;
          break;
        case 'spend':
          // Legacy support for platform_metrics spend
          if (!metrics.some(x => x.metric_type === 'ad_spend')) {
            totalSpend += m.metric_value;
          }
          break;
        case 'roas':
          roasValues.push(m.metric_value);
          break;
      }
    });

    const avgRoas =
      roasValues.length > 0
        ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
        : totalSpend > 0
          ? totalRevenue / totalSpend
          : 0;

    return { totalRevenue, totalSpend, totalOrders, avgRoas, metaSpend, googleSpend };
  };

  const current = useMemo(() => computeAggregates(rawMetrics), [rawMetrics]);
  const previous = useMemo(() => computeAggregates(previousMetrics), [previousMetrics]);

  // Chart data grouped by date - now includes ad spend
  const chartData = useMemo(() => {
    const byDate: Record<string, { revenue: number; orders: number; spend: number }> = {};
    rawMetrics.forEach((m) => {
      if (!byDate[m.metric_date]) {
        byDate[m.metric_date] = { revenue: 0, orders: 0, spend: 0 };
      }
      if (['revenue', 'gross_revenue', 'purchase_value'].includes(m.metric_type)) {
        byDate[m.metric_date].revenue += m.metric_value;
      }
      if (['orders', 'orders_count', 'purchases'].includes(m.metric_type)) {
        byDate[m.metric_date].orders += m.metric_value;
      }
      if (m.metric_type === 'ad_spend') {
        byDate[m.metric_date].spend += m.metric_value;
      }
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }, [rawMetrics]);

  // Calculate profit metrics
  const profitMetrics = useMemo(() => {
    const marginRate = financialConfig.default_margin_percentage / 100;
    const gatewayRate = financialConfig.payment_gateway_commission / 100;

    const grossProfit = current.totalRevenue * marginRate;
    const netAfterGateway = current.totalRevenue * (1 - gatewayRate);
    const costOfGoods = current.totalRevenue - grossProfit;

    // POAS = (Revenue * Margin - Ad Spend) / Ad Spend
    const poas = current.totalSpend > 0 
      ? (grossProfit - current.totalSpend) / current.totalSpend 
      : 0;

    const prevGrossProfit = previous.totalRevenue * marginRate;
    const previousPoas = previous.totalSpend > 0 
      ? (prevGrossProfit - previous.totalSpend) / previous.totalSpend 
      : undefined;

    // CAC = Total Ad Spend / Number of unique customers (approx orders * 0.85)
    const uniqueCustomers = Math.round(current.totalOrders * 0.85);
    const cac = uniqueCustomers > 0 ? current.totalSpend / uniqueCustomers : 0;

    const prevUniqueCustomers = Math.round(previous.totalOrders * 0.85);
    const previousCac = prevUniqueCustomers > 0 ? previous.totalSpend / prevUniqueCustomers : undefined;

    // MER = Total Revenue / Total Ad Spend
    const mer = current.totalSpend > 0 ? current.totalRevenue / current.totalSpend : 0;
    const previousMer = previous.totalSpend > 0 ? previous.totalRevenue / previous.totalSpend : undefined;

    // Break-even ROAS = 1 / Margin %
    const breakEvenRoas = marginRate > 0 ? 1 / marginRate : 3.33;

    return {
      poas,
      previousPoas,
      cac,
      previousCac,
      mer,
      previousMer,
      breakEvenRoas,
      currentRoas: current.avgRoas,
      grossProfit,
      costOfGoods,
      gatewayFees: current.totalRevenue * gatewayRate,
    };
  }, [current, previous, financialConfig]);

  // P&L data
  const profitLossData = useMemo(() => {
    const taxRate = 0.19; // IVA Chile
    const netRevenue = current.totalRevenue / (1 + taxRate);
    const totalFixedCosts = financialConfig.shopify_plan_cost + financialConfig.klaviyo_plan_cost + financialConfig.other_fixed_costs;
    
    const netProfit = 
      profitMetrics.grossProfit - 
      current.totalSpend - 
      totalFixedCosts - 
      profitMetrics.gatewayFees;

    return {
      grossRevenue: current.totalRevenue,
      netRevenue,
      costOfGoods: profitMetrics.costOfGoods,
      grossProfit: profitMetrics.grossProfit,
      metaSpend: current.metaSpend,
      googleSpend: current.googleSpend,
      totalAdSpend: current.totalSpend,
      shopifyCost: financialConfig.shopify_plan_cost,
      klaviyoCost: financialConfig.klaviyo_plan_cost,
      otherFixedCosts: financialConfig.other_fixed_costs,
      totalFixedCosts,
      paymentGatewayFees: profitMetrics.gatewayFees,
      netProfit,
      netProfitMargin: current.totalRevenue > 0 ? (netProfit / current.totalRevenue) * 100 : 0,
    };
  }, [current, profitMetrics, financialConfig]);

  // Demo cohort data
  const cohortData = useMemo(() => [
    { cohort: 'Ene 2025', month0: 420, month1: 126, month2: 84, month3: 63, month4: 50, month5: 42 },
    { cohort: 'Dic 2024', month0: 380, month1: 114, month2: 76, month3: 57, month4: 46 },
    { cohort: 'Nov 2024', month0: 350, month1: 105, month2: 70, month3: 53 },
    { cohort: 'Oct 2024', month0: 310, month1: 93, month2: 62 },
    { cohort: 'Sep 2024', month0: 290, month1: 87 },
    { cohort: 'Ago 2024', month0: 275 },
  ], []);

  // Demo conversion/LTV metrics
  const conversionMetrics = useMemo(() => {
    const totalCustomers = Math.round(current.totalOrders * 0.85);
    return {
      conversionRate: 3.42,
      averageLtv: totalCustomers > 0 ? Math.round(current.totalRevenue / totalCustomers) : 0,
      totalCustomers,
      repeatCustomerRate: 28.5,
    };
  }, [current]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[350px]" />
          <Skeleton className="h-[350px]" />
        </div>
      </div>
    );
  }

  const statCards = [
    { title: 'Ingresos Totales', value: `$${current.totalRevenue.toLocaleString('es-CL')} CLP`, prevValue: previous.totalRevenue, icon: DollarSign, color: 'text-green-600' },
    { title: 'Inversión Publicitaria', value: `$${current.totalSpend.toLocaleString('es-CL')} CLP`, prevValue: previous.totalSpend, icon: Target, color: 'text-blue-600' },
    { title: 'Pedidos', value: current.totalOrders.toLocaleString('es-CL'), prevValue: previous.totalOrders, icon: ShoppingCart, color: 'text-purple-600' },
    { title: 'ROAS Promedio', value: `${current.avgRoas.toFixed(2)}x`, prevValue: previous.avgRoas, icon: TrendingUp, color: 'text-orange-600' },
  ];

  const hasData = current.totalRevenue > 0 || current.totalSpend > 0 || current.totalOrders > 0;

  const getChangePercent = (curr: number, prev: number) => {
    if (prev === 0) return undefined;
    return ((curr - prev) / prev) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-1">Resumen de Rendimiento</h2>
          <p className="text-muted-foreground text-sm">Dashboard integrado de métricas</p>
        </div>
        <MetricsDateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* KPI Cards with comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const change = getChangePercent(
            typeof stat.value === 'string' && stat.value.includes('x')
              ? parseFloat(stat.value)
              : current.totalRevenue, // simplified for demo
            stat.prevValue || 0
          );
          return (
            <Card key={stat.title} className="glow-box">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.prevValue !== undefined && stat.prevValue > 0 && (
                  <p className={`text-xs mt-1 ${change && change >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {change !== undefined && (
                      <>
                        {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs período anterior
                      </>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasData ? (
        <>
          {/* Charts */}
          <MetricsCharts revenueData={chartData} currency="CLP" />

          {/* Profit Metrics (POAS, CAC, MER, Break-even) */}
          <ProfitMetricsPanel
            poas={profitMetrics.poas}
            previousPoas={profitMetrics.previousPoas}
            cac={profitMetrics.cac}
            previousCac={profitMetrics.previousCac}
            mer={profitMetrics.mer}
            previousMer={profitMetrics.previousMer}
            breakEvenRoas={profitMetrics.breakEvenRoas}
            currentRoas={profitMetrics.currentRoas}
            currency="CLP"
          />

          {/* Conversion & LTV */}
          <ConversionLtvPanel
            conversionRate={conversionMetrics.conversionRate}
            averageLtv={conversionMetrics.averageLtv}
            totalCustomers={conversionMetrics.totalCustomers}
            repeatCustomerRate={conversionMetrics.repeatCustomerRate}
            currency="CLP"
          />

          {/* P&L and Cohort side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProfitLossPanel data={profitLossData} currency="CLP" productBreakdown={productBreakdown} />
            <CohortAnalysisPanel cohorts={cohortData} />
          </div>

          {/* Removed: SKUs & Abandoned Carts moved to Shopify tab */}
        </>
      ) : (
        <Card className="bg-muted/50">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No hay métricas disponibles. Conecta tus plataformas para ver tus datos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
