import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';
import type {
  ReportData,
  ReportDateRange,
  KPISummary,
  ProfitLossData,
  ShopifyPerformance,
  AdPlatformPerformance,
  CampaignRow,
} from './report-types';

interface FinancialConfig {
  default_margin_percentage: number;
  payment_gateway_commission: number;
  shipping_cost_per_order: number;
  shopify_commission_percentage: number;
  manual_google_spend: number;
  fixed_cost_items: { name: string; amount: number }[];
}

const defaultConfig: FinancialConfig = {
  default_margin_percentage: 30,
  payment_gateway_commission: 3.5,
  shipping_cost_per_order: 0,
  shopify_commission_percentage: 0,
  manual_google_spend: 0,
  fixed_cost_items: [],
};

function computeProration(range: ReportDateRange): number {
  const days = Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return days / 30;
}

function previousPeriod(range: ReportDateRange): ReportDateRange {
  const days = Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24));
  const prevEnd = new Date(range.from);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);
  return { from: prevStart, to: prevEnd };
}

function pctChange(current: number, prev: number): number | undefined {
  if (prev === 0) return undefined;
  return ((current - prev) / prev) * 100;
}

interface MetricRow {
  metric_type: string;
  metric_value: number;
  metric_date: string;
  connection_id?: string;
}

function aggregate(rows: MetricRow[]) {
  let totalRevenue = 0, totalSpend = 0, totalOrders = 0;
  let metaSpend = 0, googleSpend = 0;
  const roasValues: number[] = [];

  for (const m of rows) {
    switch (m.metric_type) {
      case 'revenue': case 'purchase_value': case 'gross_revenue':
        totalRevenue += m.metric_value; break;
      case 'orders': case 'purchases': case 'orders_count':
        totalOrders += m.metric_value; break;
      case 'ad_spend':
        totalSpend += m.metric_value; break;
      case 'meta_spend':
        metaSpend += m.metric_value; break;
      case 'google_spend':
        googleSpend += m.metric_value; break;
      case 'roas':
        roasValues.push(m.metric_value); break;
    }
  }

  const avgRoas = roasValues.length > 0
    ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length
    : totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return { totalRevenue, totalSpend, totalOrders, avgRoas, metaSpend, googleSpend };
}

export async function fetchReportData(
  clientId: string,
  dateRange: ReportDateRange
): Promise<ReportData> {
  const startISO = dateRange.from.toISOString().split('T')[0];
  const endISO = dateRange.to.toISOString().split('T')[0];
  const prev = previousPeriod(dateRange);
  const prevStartISO = prev.from.toISOString().split('T')[0];
  const prevEndISO = prev.to.toISOString().split('T')[0];

  // 1. Fetch connections
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('id, platform, account_id')
    .eq('client_id', clientId);

  const conns = connections || [];
  const shopifyIds = conns.filter(c => c.platform === 'shopify').map(c => c.id);
  const adIds = conns.filter(c =>
    (c.platform === 'meta' && c.account_id) || c.platform === 'google'
  ).map(c => c.id);
  const connPlatformMap = new Map(conns.map(c => [c.id, c.platform]));

  const safeShopifyIds = shopifyIds.length > 0 ? shopifyIds : ['00000000-0000-0000-0000-000000000000'];
  const safeAdIds = adIds.length > 0 ? adIds : ['00000000-0000-0000-0000-000000000000'];

  // 2. Parallel fetches
  const [currentRes, prevRes, configRes, adCurrentRes, adPrevRes] = await Promise.all([
    supabase.from('platform_metrics')
      .select('metric_type, metric_value, metric_date')
      .in('connection_id', safeShopifyIds)
      .gte('metric_date', startISO)
      .lte('metric_date', endISO)
      .order('metric_date', { ascending: true }),
    supabase.from('platform_metrics')
      .select('metric_type, metric_value, metric_date')
      .in('connection_id', safeShopifyIds)
      .gte('metric_date', prevStartISO)
      .lte('metric_date', prevEndISO),
    supabase.from('client_financial_config')
      .select('*')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('platform_metrics')
      .select('metric_type, metric_value, metric_date, connection_id')
      .in('connection_id', safeAdIds)
      .eq('metric_type', 'ad_spend')
      .gte('metric_date', startISO)
      .lte('metric_date', endISO),
    supabase.from('platform_metrics')
      .select('metric_type, metric_value, metric_date, connection_id')
      .in('connection_id', safeAdIds)
      .eq('metric_type', 'ad_spend')
      .gte('metric_date', prevStartISO)
      .lte('metric_date', prevEndISO),
  ]);

  // Parse financial config
  const rawCfg = configRes.data;
  let cfg: FinancialConfig = defaultConfig;
  if (rawCfg) {
    let fixedItems = (rawCfg.fixed_cost_items as { name: string; amount: number }[]) || [];
    if (fixedItems.length === 0) {
      if (Number(rawCfg.shopify_plan_cost) > 0) fixedItems.push({ name: 'Shopify', amount: Number(rawCfg.shopify_plan_cost) });
      if (Number(rawCfg.klaviyo_plan_cost) > 0) fixedItems.push({ name: 'Klaviyo', amount: Number(rawCfg.klaviyo_plan_cost) });
      if (Number(rawCfg.other_fixed_costs) > 0) fixedItems.push({ name: 'Otros', amount: Number(rawCfg.other_fixed_costs) });
    }
    cfg = {
      default_margin_percentage: Number(rawCfg.default_margin_percentage) || 30,
      payment_gateway_commission: Number(rawCfg.payment_gateway_commission) || 3.5,
      shipping_cost_per_order: Number(rawCfg.shipping_cost_per_order) || 0,
      shopify_commission_percentage: Number(rawCfg.shopify_commission_percentage) || 0,
      manual_google_spend: Number(rawCfg.manual_google_spend) || 0,
      fixed_cost_items: fixedItems,
    };
  }

  // Convert ad spend rows to metric rows
  const toAdMetrics = (data: any[] | null): MetricRow[] => {
    if (!data) return [];
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
      const [date] = key.split('|');
      result.push({
        metric_type: value.platform === 'meta' ? 'meta_spend' : 'google_spend',
        metric_value: value.spend,
        metric_date: date,
      });
      result.push({ metric_type: 'ad_spend', metric_value: value.spend, metric_date: date });
    }
    return result;
  };

  const dbRows = (currentRes.data ?? []).map(m => ({
    metric_type: m.metric_type, metric_value: Number(m.metric_value), metric_date: m.metric_date,
  }));
  const currentAdMetrics = toAdMetrics(adCurrentRes.data);
  const prevAdMetrics = toAdMetrics(adPrevRes.data);
  const prevDbRows = (prevRes.data ?? []).map(m => ({
    metric_type: m.metric_type, metric_value: Number(m.metric_value), metric_date: m.metric_date,
  }));

  // Shopify analytics
  let shopify: ShopifyPerformance = {
    topSkus: [], dailyBreakdown: [],
    abandonedCartsCount: 0, abandonedCartsValue: 0,
    funnel: null, customerMetrics: null,
  };
  let additionalMetrics: MetricRow[] = [];

  if (shopifyIds.length > 0) {
    try {
      const { data: analyticsData } = await callApi('fetch-shopify-analytics', {
        body: { connectionId: shopifyIds[0], startDate: startISO, endDate: endISO },
      });
      if (analyticsData) {
        if (analyticsData.topSkus) {
          shopify.topSkus = analyticsData.topSkus.slice(0, 10).map((s: any) => ({
            title: s.title || s.name || 'Sin nombre',
            revenue: Number(s.revenue) || 0,
            quantity: Number(s.quantity) || 0,
          }));
        }
        if (analyticsData.dailyBreakdown) shopify.dailyBreakdown = analyticsData.dailyBreakdown;
        if (analyticsData.abandonedCarts) {
          const carts = analyticsData.abandonedCarts as any[];
          shopify.abandonedCartsCount = carts.length;
          shopify.abandonedCartsValue = carts.reduce((sum: number, c: any) => sum + (Number(c.totalValue) || 0), 0);
        }
        if (analyticsData.funnelData) shopify.funnel = analyticsData.funnelData;
        if (analyticsData.customerMetrics) shopify.customerMetrics = analyticsData.customerMetrics;
        if (analyticsData.summary?.totalRevenue > 0) {
          // Remove stale DB revenue/orders
          const staleTypes = ['revenue', 'gross_revenue', 'purchase_value', 'orders', 'orders_count', 'purchases'];
          for (let i = dbRows.length - 1; i >= 0; i--) {
            if (staleTypes.includes(dbRows[i].metric_type)) dbRows.splice(i, 1);
          }
          const today = new Date().toISOString().split('T')[0];
          additionalMetrics = [
            { metric_type: 'revenue', metric_value: analyticsData.summary.totalRevenue, metric_date: today },
            { metric_type: 'orders', metric_value: analyticsData.summary.totalOrders, metric_date: today },
          ];
        }
      }
    } catch {
      // Non-critical
    }
  }

  const allCurrent = [...dbRows, ...currentAdMetrics, ...additionalMetrics];
  const allPrev = [...prevDbRows, ...prevAdMetrics];

  const cur = aggregate(allCurrent);
  const prv = aggregate(allPrev);

  // P&L
  const taxRate = 0.19;
  const marginRate = cfg.default_margin_percentage / 100;
  const gatewayRate = cfg.payment_gateway_commission / 100;
  const proFactor = computeProration(dateRange);
  const manualGoogleSpend = Math.round(cfg.manual_google_spend * proFactor);
  const totalAdSpendWithGoogle = cur.totalSpend + manualGoogleSpend;
  const netRevenue = cur.totalRevenue / (1 + taxRate);
  const grossProfit = netRevenue * marginRate;
  const costOfGoods = netRevenue * (1 - marginRate);
  const fixedCostItems = cfg.fixed_cost_items.map(i => ({ name: i.name, amount: Math.round(i.amount * proFactor) }));
  const totalFixedCosts = fixedCostItems.reduce((s, i) => s + i.amount, 0);
  const shippingCosts = cur.totalOrders * cfg.shipping_cost_per_order;
  const shopifyCommission = netRevenue * (cfg.shopify_commission_percentage / 100);
  const gatewayFees = netRevenue * gatewayRate;
  const netProfit = grossProfit - totalAdSpendWithGoogle - totalFixedCosts - gatewayFees - shippingCosts - shopifyCommission;

  const profitLoss: ProfitLossData = {
    grossRevenue: cur.totalRevenue,
    netRevenue,
    costOfGoods,
    grossProfit,
    metaSpend: cur.metaSpend,
    googleSpend: cur.googleSpend,
    manualGoogleSpend,
    totalAdSpend: totalAdSpendWithGoogle,
    fixedCostItems,
    totalFixedCosts,
    paymentGatewayFees: gatewayFees,
    shippingCosts,
    shopifyCommission,
    netProfit,
    netProfitMargin: cur.totalRevenue > 0 ? (netProfit / cur.totalRevenue) * 100 : 0,
  };

  // KPI
  const effectiveRoas = totalAdSpendWithGoogle > 0 ? cur.totalRevenue / totalAdSpendWithGoogle : 0;
  const prevManualGoogle = Math.round(cfg.manual_google_spend * proFactor);
  const prevTotalAdSpend = prv.totalSpend + prevManualGoogle;
  const prevRoas = prevTotalAdSpend > 0 ? prv.totalRevenue / prevTotalAdSpend : 0;
  const aov = cur.totalOrders > 0 ? cur.totalRevenue / cur.totalOrders : 0;
  const prevAov = prv.totalOrders > 0 ? prv.totalRevenue / prv.totalOrders : 0;

  const kpi: KPISummary = {
    revenue: cur.totalRevenue,
    orders: cur.totalOrders,
    roas: effectiveRoas,
    adSpend: totalAdSpendWithGoogle,
    aov,
    netProfitMargin: profitLoss.netProfitMargin,
    revenueChange: pctChange(cur.totalRevenue, prv.totalRevenue),
    ordersChange: pctChange(cur.totalOrders, prv.totalOrders),
    roasChange: pctChange(effectiveRoas, prevRoas),
    adSpendChange: pctChange(totalAdSpendWithGoogle, prevTotalAdSpend),
    aovChange: pctChange(aov, prevAov),
  };

  // Campaign metrics
  const adPlatforms: AdPlatformPerformance[] = [];
  const allConnIds = conns.map(c => c.id);
  if (allConnIds.length > 0) {
    try {
      const { data: campaignData } = await supabase
        .from('campaign_metrics')
        .select('*')
        .in('connection_id', allConnIds)
        .gte('metric_date', startISO)
        .lte('metric_date', endISO)
        .order('metric_date', { ascending: false });

      if (campaignData && campaignData.length > 0) {
        // Group by campaign
        const byCampaign = new Map<string, any[]>();
        for (const row of campaignData) {
          const key = row.campaign_id || row.campaign_name;
          if (!byCampaign.has(key)) byCampaign.set(key, []);
          byCampaign.get(key)!.push(row);
        }

        const campaignRows: CampaignRow[] = [];
        for (const [, rows] of byCampaign) {
          const first = rows[0];
          const totalSpend = rows.reduce((s: number, r: any) => s + (Number(r.spend) || 0), 0);
          const totalImpressions = rows.reduce((s: number, r: any) => s + (Number(r.impressions) || 0), 0);
          const totalClicks = rows.reduce((s: number, r: any) => s + (Number(r.clicks) || 0), 0);
          const totalConversions = rows.reduce((s: number, r: any) => s + (Number(r.conversions) || 0), 0);
          const totalConvValue = rows.reduce((s: number, r: any) => s + (Number(r.conversion_value) || 0), 0);

          campaignRows.push({
            campaign_name: first.campaign_name || 'Sin nombre',
            platform: first.platform || 'meta',
            spend: totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
            cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
            conversions: totalConversions,
            conversion_value: totalConvValue,
            roas: totalSpend > 0 ? totalConvValue / totalSpend : 0,
          });
        }

        // Sort by spend descending
        campaignRows.sort((a, b) => b.spend - a.spend);

        // Split by platform
        for (const platform of ['meta', 'google'] as const) {
          const rows = campaignRows.filter(c => c.platform === platform);
          if (rows.length === 0) continue;
          const totSpend = rows.reduce((s, r) => s + r.spend, 0);
          const totImpr = rows.reduce((s, r) => s + r.impressions, 0);
          const totClicks = rows.reduce((s, r) => s + r.clicks, 0);
          const totConv = rows.reduce((s, r) => s + r.conversions, 0);
          const totRev = rows.reduce((s, r) => s + r.conversion_value, 0);
          adPlatforms.push({
            platform,
            campaigns: rows,
            totalSpend: totSpend,
            totalImpressions: totImpr,
            totalClicks: totClicks,
            totalConversions: totConv,
            totalRevenue: totRev,
            avgCtr: totImpr > 0 ? (totClicks / totImpr) * 100 : 0,
            avgRoas: totSpend > 0 ? totRev / totSpend : 0,
          });
        }
      }
    } catch {
      // Campaign metrics unavailable
    }
  }

  // Client name
  let clientName = 'Cliente';
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_name, full_name')
      .eq('id', clientId)
      .maybeSingle();
    if (profile) {
      clientName = profile.company_name || profile.full_name || 'Cliente';
    }
  } catch {
    // Use default
  }

  return {
    clientName,
    dateRange,
    kpi,
    profitLoss,
    shopify,
    adPlatforms,
    insights: [], // Filled later by report-ai-insights
  };
}
