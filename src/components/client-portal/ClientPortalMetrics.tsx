import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Target, HelpCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedNumber } from './metrics/AnimatedNumber';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MetricsCharts } from './metrics/MetricsCharts';
import { TopSkusPanel, SkuData } from './metrics/TopSkusPanel';
import { AbandonedCartsPanel, AbandonedCart } from './metrics/AbandonedCartsPanel';
import { ConversionLtvPanel } from './metrics/ConversionLtvPanel';
import { ProfitMetricsPanel } from './metrics/ProfitMetricsPanel';
import { ProfitLossPanel, ProductMarginItem } from './metrics/ProfitLossPanel';
import { CohortAnalysisPanel } from './metrics/CohortAnalysisPanel';
import { MetricsDateFilter, DateRange, CustomDateRange } from './metrics/MetricsDateFilter';
import { KPIGridSkeleton, ChartSkeleton, TableSkeleton } from './metrics/MetricsSkeleton';

interface ClientPortalMetricsProps {
  clientId: string;
}

interface MetricRow {
  metric_type: string;
  metric_value: number;
  metric_date: string;
}

interface FixedCostItem {
  name: string;
  amount: number;
}

interface FinancialConfig {
  default_margin_percentage: number;
  shopify_plan_cost: number;
  klaviyo_plan_cost: number;
  other_fixed_costs: number;
  payment_gateway_commission: number;
  shipping_cost_per_order: number;
  shopify_commission_percentage: number;
  manual_google_spend: number;
  fixed_cost_items: FixedCostItem[];
}

const defaultFinancialConfig: FinancialConfig = {
  default_margin_percentage: 30,
  shopify_plan_cost: 0,
  klaviyo_plan_cost: 0,
  other_fixed_costs: 0,
  payment_gateway_commission: 3.5,
  shipping_cost_per_order: 0,
  shopify_commission_percentage: 0,
  manual_google_spend: 0,
  fixed_cost_items: [],
};

function getProrationFactor(dateRange: DateRange, customRange?: CustomDateRange): number {
  const now = new Date();
  switch (dateRange) {
    case 'mtd': {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      return dayOfMonth / daysInMonth;
    }
    case '7d': return 7 / 30;
    case '30d': return 1;
    case '90d': return 3;
    case 'ytd': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const daysDiff = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff / 30;
    }
    case 'custom': {
      if (!customRange) return 1;
      const days = Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return days / 30;
    }
    default: return 1;
  }
}

function getDateRangeStart(range: DateRange, customRange?: CustomDateRange): Date {
  if (range === 'custom' && customRange) {
    return customRange.from;
  }
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

function getDateRangeEnd(range: DateRange, customRange?: CustomDateRange): Date {
  if (range === 'custom' && customRange) {
    return customRange.to;
  }
  return new Date();
}

function getPreviousPeriodDates(range: DateRange, customRange?: CustomDateRange): { start: Date; end: Date } {
  const now = range === 'custom' && customRange ? customRange.to : new Date();
  const currentStart = getDateRangeStart(range, customRange);
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
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | undefined>(undefined);
  const [rawMetrics, setRawMetrics] = useState<MetricRow[]>([]);
  const [previousMetrics, setPreviousMetrics] = useState<MetricRow[]>([]);
  const [financialConfig, setFinancialConfig] = useState<FinancialConfig>(defaultFinancialConfig);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [productBreakdown, setProductBreakdown] = useState<ProductMarginItem[]>([]);
  const [skuData, setSkuData] = useState<SkuData[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<AbandonedCart[]>([]);
  const [customerMetrics, setCustomerMetrics] = useState<{ conversionRate: number; averageLtv: number; totalCustomers: number; repeatCustomerRate: number } | null>(null);
  const [cohortData, setCohortData] = useState<{ cohort: string; month0: number; month1?: number; month2?: number; month3?: number; month4?: number; month5?: number }[]>([]);
  const [shopifyDailyData, setShopifyDailyData] = useState<{ date: string; revenue: number; orders: number }[]>([]);
  const [shopifySummary, setShopifySummary] = useState<{ totalRevenue: number; totalOrders: number; averageOrderValue: number } | null>(null);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // Fetch connections
        const { data: connections, error: connError } = await supabase
          .from('platform_connections')
          .select('id, platform, account_id')
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
        // Only use Meta connections that have a selected ad account (avoid stale/mixed data)
        const adConnIds = connections.filter(c =>
          (c.platform === 'meta' && c.account_id) || c.platform === 'google'
        ).map(c => c.id);
        setConnectionIds(connIds);

        const startDate = getDateRangeStart(dateRange, customDateRange);
        const endDate = getDateRangeEnd(dateRange, customDateRange);
        const { start: prevStart, end: prevEnd } = getPreviousPeriodDates(dateRange, customDateRange);

        // Fetch current and previous metrics in parallel
        // IMPORTANT: Only fetch revenue/orders from Shopify connections to avoid double attribution
        // Ad spend comes from platform_metrics (Meta sync writes ad_spend there)
        const shopifyQueryIds = shopifyConnIds.length > 0 ? shopifyConnIds : ['00000000-0000-0000-0000-000000000000'];
        const adQueryIds = adConnIds.length > 0 ? adConnIds : ['00000000-0000-0000-0000-000000000000'];
        // Map connection_id → platform for ad spend breakdown
        const connPlatformMap = new Map(connections.map(c => [c.id, c.platform]));

        const endDateStr = endDate.toISOString().split('T')[0];
        const [currentRes, prevRes, configRes, adSpendCurrentRes, adSpendPrevRes] = await Promise.all([
          // Only Shopify metrics for revenue/orders (no Meta purchase_value!)
          (() => {
            let q = supabase
              .from('platform_metrics')
              .select('metric_type, metric_value, metric_date')
              .in('connection_id', shopifyQueryIds)
              .gte('metric_date', startDate.toISOString().split('T')[0]);
            if (dateRange === 'custom') q = q.lte('metric_date', endDateStr);
            return q.order('metric_date', { ascending: true });
          })(),
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
          // Get ad spend from platform_metrics (where sync-meta-metrics writes)
          (() => {
            let q = supabase
              .from('platform_metrics')
              .select('metric_type, metric_value, metric_date, connection_id')
              .in('connection_id', adQueryIds)
              .eq('metric_type', 'ad_spend')
              .gte('metric_date', startDate.toISOString().split('T')[0]);
            if (dateRange === 'custom') q = q.lte('metric_date', endDateStr);
            return q;
          })(),
          supabase
            .from('platform_metrics')
            .select('metric_type, metric_value, metric_date, connection_id')
            .in('connection_id', adQueryIds)
            .eq('metric_type', 'ad_spend')
            .gte('metric_date', prevStart.toISOString().split('T')[0])
            .lte('metric_date', prevEnd.toISOString().split('T')[0]),
        ]);

        if (currentRes.error) throw currentRes.error;
        if (prevRes.error) throw prevRes.error;
        if (adSpendCurrentRes.error) throw adSpendCurrentRes.error;
        if (adSpendPrevRes.error) throw adSpendPrevRes.error;

        // Convert platform_metrics ad_spend rows into typed metric rows
        const adSpendToMetricRows = (data: any[] | null): MetricRow[] => {
          if (!data) return [];
          // Group by date and platform to avoid duplicates
          const byDatePlatform = new Map<string, { spend: number; platform: string }>();
          for (const row of data) {
            const platform = connPlatformMap.get(row.connection_id) || 'unknown';
            const key = `${row.metric_date}|${platform}`;
            const existing = byDatePlatform.get(key) || { spend: 0, platform };
            existing.spend += Number(row.metric_value) || 0;
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

        const currentCampaignMetrics = adSpendToMetricRows(adSpendCurrentRes.data);
        const prevCampaignMetrics = adSpendToMetricRows(adSpendPrevRes.data);

        const dbMetricRows = (currentRes.data ?? []).map((m) => ({
          metric_type: m.metric_type,
          metric_value: Number(m.metric_value),
          metric_date: m.metric_date,
        }));

        // Will be populated with Shopify API data if DB has no revenue
        let additionalMetrics: MetricRow[] = [];

        setPreviousMetrics([
          ...(prevRes.data ?? []).map((m) => ({
            metric_type: m.metric_type,
            metric_value: Number(m.metric_value),
            metric_date: m.metric_date,
          })),
          ...prevCampaignMetrics,
        ]);

        if (configRes.data) {
          // Auto-migrate legacy fixed costs
          let fixedItems = (configRes.data.fixed_cost_items as FixedCostItem[]) || [];
          if (fixedItems.length === 0) {
            if (Number(configRes.data.shopify_plan_cost) > 0) fixedItems.push({ name: 'Shopify', amount: Number(configRes.data.shopify_plan_cost) });
            if (Number(configRes.data.klaviyo_plan_cost) > 0) fixedItems.push({ name: 'Klaviyo', amount: Number(configRes.data.klaviyo_plan_cost) });
            if (Number(configRes.data.other_fixed_costs) > 0) fixedItems.push({ name: 'Otros', amount: Number(configRes.data.other_fixed_costs) });
          }
          setFinancialConfig({
            default_margin_percentage: Number(configRes.data.default_margin_percentage),
            shopify_plan_cost: Number(configRes.data.shopify_plan_cost),
            klaviyo_plan_cost: Number(configRes.data.klaviyo_plan_cost),
            other_fixed_costs: Number(configRes.data.other_fixed_costs),
            payment_gateway_commission: Number(configRes.data.payment_gateway_commission),
            shipping_cost_per_order: Number(configRes.data.shipping_cost_per_order || 0),
            shopify_commission_percentage: Number(configRes.data.shopify_commission_percentage || 0),
            manual_google_spend: Number(configRes.data.manual_google_spend || 0),
            fixed_cost_items: fixedItems,
          });
        }

        // Fetch Shopify products for per-product margin breakdown
        if (shopifyConnIds.length > 0) {
          try {
            const { data: prodData } = await callApi('fetch-shopify-products', {
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

          // Fetch real SKU sales, abandoned checkouts, customer metrics, and cohorts
          try {
            const now = new Date();
            const mtdDays = Math.max(now.getDate() - 1, 1);
            const ytdDays = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
            const customDays = customDateRange
              ? Math.ceil((customDateRange.to.getTime() - customDateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
              : 30;
            const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, 'mtd': mtdDays, 'ytd': ytdDays, 'custom': customDays };
            const { data: analyticsData } = await callApi('fetch-shopify-analytics', {
              body: { connectionId: shopifyConnIds[0], daysBack: daysMap[dateRange] || 30 },
            });
            if (analyticsData?.topSkus) {
              setSkuData(analyticsData.topSkus);
            }
            if (analyticsData?.abandonedCarts) {
              setAbandonedCarts(analyticsData.abandonedCarts);
            }
            if (analyticsData?.customerMetrics) {
              setCustomerMetrics(analyticsData.customerMetrics);
            }
            if (analyticsData?.cohorts) {
              setCohortData(analyticsData.cohorts);
            }
            if (analyticsData?.dailyBreakdown) {
              setShopifyDailyData(analyticsData.dailyBreakdown);
            }
            if (analyticsData?.summary) {
              setShopifySummary(analyticsData.summary);
              // Inject Shopify API revenue/orders if platform_metrics has no revenue data
              const hasDbRevenue = dbMetricRows.some(m =>
                ['revenue', 'gross_revenue', 'purchase_value'].includes(m.metric_type) && m.metric_value > 0
              );
              if (!hasDbRevenue && analyticsData.summary.totalRevenue > 0) {
                const today = new Date().toISOString().split('T')[0];
                additionalMetrics.push(
                  { metric_type: 'revenue', metric_value: analyticsData.summary.totalRevenue, metric_date: today },
                  { metric_type: 'orders', metric_value: analyticsData.summary.totalOrders, metric_date: today },
                );
              }
            }
          } catch (e) {
            console.warn('[Metrics] Could not fetch analytics:', e);
          }
        }

        // Set rawMetrics with DB data + any injected Shopify API data
        setRawMetrics([...dbMetricRows, ...currentCampaignMetrics, ...additionalMetrics]);
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
  }, [clientId, dateRange, customDateRange]);

  // Compute aggregated metrics — memoized to avoid recreation on each render
  const computeAggregates = useCallback((metrics: MetricRow[]) => {
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
  }, []);

  const current = useMemo(() => computeAggregates(rawMetrics), [rawMetrics, computeAggregates]);
  const previous = useMemo(() => computeAggregates(previousMetrics), [previousMetrics, computeAggregates]);

  // Chart data grouped by date - now includes ad spend
  // Falls back to Shopify daily breakdown if platform_metrics has no daily revenue data
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
    const dbChartEntries = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // If DB has no MULTI-DAY revenue data, use Shopify API daily breakdown
    // (injected summary is a single row on today — doesn't count as real daily data)
    const daysWithRevenue = dbChartEntries.filter(d => d.revenue > 0).length;
    if (daysWithRevenue <= 1 && shopifyDailyData.length > 0) {
      // Merge Shopify daily revenue with any existing ad spend data
      const spendByDate: Record<string, number> = {};
      dbChartEntries.forEach(d => { if (d.spend > 0) spendByDate[d.date] = d.spend; });
      return shopifyDailyData.map(d => ({
        date: d.date,
        revenue: d.revenue,
        orders: d.orders,
        spend: spendByDate[d.date] || 0,
      }));
    }

    return dbChartEntries;
  }, [rawMetrics, shopifyDailyData]);

  // Previous period chart data (daily breakdown from previousMetrics)
  const previousChartData = useMemo(() => {
    const byDate: Record<string, { revenue: number; orders: number; spend: number }> = {};
    previousMetrics.forEach((m) => {
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
  }, [previousMetrics]);

  // Calculate profit metrics
  // IMPORTANT: margin and COGS are based on NET revenue (excl. IVA)
  const profitMetrics = useMemo(() => {
    const taxRate = 0.19; // IVA Chile
    const marginRate = financialConfig.default_margin_percentage / 100;
    const gatewayRate = financialConfig.payment_gateway_commission / 100;

    const netRevenue = current.totalRevenue / (1 + taxRate);
    const grossProfit = netRevenue * marginRate;
    const costOfGoods = netRevenue * (1 - marginRate);

    const prevNetRevenue = previous.totalRevenue / (1 + taxRate);
    const prevGrossProfit = prevNetRevenue * marginRate;

    // Include manual Google spend (prorated) in total ad spend for MER/POAS/CAC
    const prorationFactor = getProrationFactor(dateRange, customDateRange);
    const manualGoogleSpend = Math.round(financialConfig.manual_google_spend * prorationFactor);
    const totalAdSpend = current.totalSpend + manualGoogleSpend;
    const prevTotalAdSpend = previous.totalSpend + manualGoogleSpend;

    // POAS = (Gross Profit - Ad Spend) / Ad Spend
    const poas = totalAdSpend > 0
      ? (grossProfit - totalAdSpend) / totalAdSpend
      : 0;
    const previousPoas = prevTotalAdSpend > 0
      ? (prevGrossProfit - prevTotalAdSpend) / prevTotalAdSpend
      : undefined;

    // CAC = Total Ad Spend / Number of orders
    const cac = current.totalOrders > 0 ? totalAdSpend / current.totalOrders : 0;
    const previousCac = previous.totalOrders > 0 ? prevTotalAdSpend / previous.totalOrders : undefined;

    // MER = Total Revenue / Total Ad Spend (including manual Google)
    const mer = totalAdSpend > 0 ? current.totalRevenue / totalAdSpend : 0;
    const previousMer = prevTotalAdSpend > 0 ? previous.totalRevenue / prevTotalAdSpend : undefined;

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
  }, [current, previous, financialConfig, dateRange, customDateRange]);

  // P&L data
  const profitLossData = useMemo(() => {
    const taxRate = 0.19; // IVA Chile
    const netRevenue = current.totalRevenue / (1 + taxRate);

    // Prorate monthly costs based on date range
    const prorationFactor = getProrationFactor(dateRange, customDateRange);

    // Dynamic fixed costs — prorated
    const fixedCostItems = financialConfig.fixed_cost_items.map(item => ({
      name: item.name,
      amount: Math.round(item.amount * prorationFactor),
    }));
    const totalFixedCosts = fixedCostItems.reduce((sum, i) => sum + i.amount, 0);

    // Google manual spend — prorated
    const manualGoogleSpend = Math.round(financialConfig.manual_google_spend * prorationFactor);
    const totalAdSpendWithGoogle = current.totalSpend + manualGoogleSpend;

    // Operational costs
    const shippingCosts = current.totalOrders * financialConfig.shipping_cost_per_order;
    const shopifyCommission = current.totalRevenue * (financialConfig.shopify_commission_percentage / 100);

    const netProfit =
      profitMetrics.grossProfit -
      totalAdSpendWithGoogle -
      totalFixedCosts -
      profitMetrics.gatewayFees -
      shippingCosts -
      shopifyCommission;

    return {
      grossRevenue: current.totalRevenue,
      netRevenue,
      costOfGoods: profitMetrics.costOfGoods,
      grossProfit: profitMetrics.grossProfit,
      metaSpend: current.metaSpend,
      googleSpend: current.googleSpend,
      manualGoogleSpend,
      totalAdSpend: totalAdSpendWithGoogle,
      fixedCostItems,
      totalFixedCosts,
      paymentGatewayFees: profitMetrics.gatewayFees,
      shippingCosts,
      shopifyCommission,
      netProfit,
      netProfitMargin: current.totalRevenue > 0 ? (netProfit / current.totalRevenue) * 100 : 0,
    };
  }, [current, profitMetrics, financialConfig, dateRange, customDateRange]);

  // Memoized derived KPI values
  const totalAdSpendWithGoogle = profitLossData.totalAdSpend;

  const effectiveRoas = useMemo(() => totalAdSpendWithGoogle > 0
    ? current.totalRevenue / totalAdSpendWithGoogle
    : 0, [current.totalRevenue, totalAdSpendWithGoogle]);

  const currencyFormatter = useCallback((n: number) => "$" + Math.round(n).toLocaleString("es-CL") + " CLP", []);
  const roasFormatter = useCallback((n: number) => n.toFixed(2) + "x", []);

  const statCards = useMemo(() => [
    { title: 'Ingresos Totales', value: `$${current.totalRevenue.toLocaleString('es-CL')} CLP`, currentNum: current.totalRevenue, prevValue: previous.totalRevenue, icon: DollarSign, color: 'text-green-600', tooltip: 'Ingresos totales de Shopify en el período seleccionado', formatter: currencyFormatter },
    { title: 'Inversión Publicitaria', value: `$${totalAdSpendWithGoogle.toLocaleString('es-CL')} CLP`, currentNum: totalAdSpendWithGoogle, prevValue: previous.totalSpend, icon: Target, color: 'text-blue-600', tooltip: 'Gasto total en publicidad (Meta + Google) en el período', formatter: currencyFormatter },
    { title: 'Pedidos', value: current.totalOrders.toLocaleString('es-CL'), currentNum: current.totalOrders, prevValue: previous.totalOrders, icon: ShoppingCart, color: 'text-purple-600', tooltip: 'Número total de pedidos completados en Shopify', formatter: undefined },
    { title: 'ROAS Promedio', value: `${effectiveRoas.toFixed(2)}x`, currentNum: effectiveRoas, prevValue: previous.avgRoas, icon: TrendingUp, color: 'text-orange-600', tooltip: 'Return On Ad Spend — ingresos generados por cada $1 invertido en publicidad. Sobre 3x es bueno, sobre 5x es excelente', formatter: roasFormatter },
  ], [current, previous, totalAdSpendWithGoogle, effectiveRoas, currencyFormatter, roasFormatter]);

  const hasData = useMemo(() => current.totalRevenue > 0 || totalAdSpendWithGoogle > 0 || current.totalOrders > 0, [current.totalRevenue, totalAdSpendWithGoogle, current.totalOrders]);

  const exportToCSV = useCallback(() => {
    const rows = [
      ['Métrica', 'Valor', 'Período anterior', 'Cambio %'],
      ['Ingresos Totales (CLP)', String(Math.round(current.totalRevenue)), String(Math.round(previous.totalRevenue)), previous.totalRevenue > 0 ? (((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100).toFixed(1) + '%' : 'N/A'],
      ['Inversión Publicitaria (CLP)', String(Math.round(totalAdSpendWithGoogle)), String(Math.round(previous.totalSpend)), previous.totalSpend > 0 ? (((totalAdSpendWithGoogle - previous.totalSpend) / previous.totalSpend) * 100).toFixed(1) + '%' : 'N/A'],
      ['Pedidos', String(current.totalOrders), String(previous.totalOrders), previous.totalOrders > 0 ? (((current.totalOrders - previous.totalOrders) / previous.totalOrders) * 100).toFixed(1) + '%' : 'N/A'],
      ['ROAS', effectiveRoas.toFixed(2), previous.avgRoas.toFixed(2), previous.avgRoas > 0 ? (((effectiveRoas - previous.avgRoas) / previous.avgRoas) * 100).toFixed(1) + '%' : 'N/A'],
      ['POAS', profitMetrics.poas.toFixed(2), profitMetrics.previousPoas?.toFixed(2) ?? 'N/A', ''],
      ['CAC (CLP)', String(Math.round(profitMetrics.cac)), profitMetrics.previousCac ? String(Math.round(profitMetrics.previousCac)) : 'N/A', ''],
      ['MER', profitMetrics.mer.toFixed(2), profitMetrics.previousMer?.toFixed(2) ?? 'N/A', ''],
      ['Ganancia Bruta (CLP)', String(Math.round(profitMetrics.grossProfit)), '', ''],
      ['Ganancia Neta (CLP)', String(Math.round(profitLossData.netProfit)), '', ''],
      ['Margen Neto', profitLossData.netProfitMargin.toFixed(1) + '%', '', ''],
    ];
    const csvContent = rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metricas-steve-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [current, previous, totalAdSpendWithGoogle, effectiveRoas, profitMetrics, profitLossData]);

  const getChangePercent = useCallback((curr: number, prev: number) => {
    if (prev === 0) return undefined;
    return ((curr - prev) / prev) * 100;
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <KPIGridSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <KPIGridSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton rows={5} />
          <TableSkeleton rows={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-1">Resumen de Rendimiento</h2>
          <p className="text-muted-foreground text-sm">Dashboard integrado de métricas</p>
        </div>
        <div className="flex items-center gap-2">
          <MetricsDateFilter
            value={dateRange}
            onChange={setDateRange}
            customRange={customDateRange}
            onCustomRangeChange={setCustomDateRange}
          />
          <Button variant="outline" size="sm" onClick={exportToCSV} title="Exportar métricas a CSV">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards with comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const change = getChangePercent(
            stat.currentNum,
            stat.prevValue || 0
          );
          return (
            <Card key={stat.title} className="bg-white border border-slate-200 rounded-xl card-hover">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  {stat.title}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>{stat.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums tracking-tight">
                  <AnimatedNumber value={stat.currentNum} formatter={stat.formatter} />
                </div>
                {stat.prevValue !== undefined && stat.prevValue > 0 && change !== undefined && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        change > 0
                          ? 'bg-green-100 text-green-700'
                          : change < 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {change > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : change < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : null}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                    <span className="text-xs text-muted-foreground">vs período anterior</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasData ? (
        <>
          {/* Charts */}
          <MetricsCharts revenueData={chartData} previousRevenueData={previousChartData.length > 0 ? previousChartData : undefined} currency="CLP" />

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
          {customerMetrics ? (
            <ConversionLtvPanel
              conversionRate={customerMetrics.conversionRate}
              averageLtv={customerMetrics.averageLtv}
              totalCustomers={customerMetrics.totalCustomers}
              repeatCustomerRate={customerMetrics.repeatCustomerRate}
              currency="CLP"
            />
          ) : (
            <Card className="bg-muted/50">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Próximamente — Conecta Shopify y acumula ventas para ver estas métricas.
                </p>
              </CardContent>
            </Card>
          )}

          {/* P&L and Cohort side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProfitLossPanel data={profitLossData} currency="CLP" productBreakdown={productBreakdown} />
            {cohortData.length > 0 ? (
              <CohortAnalysisPanel cohorts={cohortData} />
            ) : (
              <Card className="bg-muted/50">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    Próximamente — Conecta Shopify y acumula ventas para ver estas métricas.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Removed: SKUs & Abandoned Carts moved to Shopify tab */}
        </>
      ) : (
        <Card className="bg-white border border-slate-200 rounded-xl">
          <CardContent className="py-16 text-center">
            <Target className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
            <p className="font-medium text-muted-foreground mb-1">Sin métricas disponibles</p>
            <p className="text-sm text-muted-foreground/70">Conecta Shopify, Meta o Google en la pestaña "Conexiones" para empezar</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
