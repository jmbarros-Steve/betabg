/**
 * Data fetcher para el informe Shopify.
 * Reúne TODO lo que el PDF necesita en una sola llamada por reporte.
 *
 * Sprint 1 (caps 1-4, 13, 14): KPIs, EERR, top productos para north star.
 * Sprint 2+ extenderá con revenue por hora/canal, cohortes, funnel detallado, etc.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ReportClientInfo {
  id: string;
  name: string;
  shop_domain: string;
  logo_url: string | null;
}

export interface ReportPeriod {
  start: string;
  end: string;
  daysInPeriod: number;
  previousStart: string;
  previousEnd: string;
  yearAgoStart: string;
  yearAgoEnd: string;
}

export interface ReportKpiSet {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalSpend: number; // ad spend
  totalRoas: number;
  uniqueCustomers: number;
}

export interface ReportFinancialConfig {
  default_margin_percentage: number;
  payment_gateway_commission: number;
  shipping_cost_per_order: number;
  shopify_commission_percentage: number;
  manual_google_spend: number;
  fixed_cost_items: Array<{ name: string; amount: number }>;
}

export interface ReportProfitLoss {
  grossRevenue: number;
  netRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  totalAdSpend: number;
  fixedCostItems: Array<{ name: string; amount: number }>;
  totalFixedCosts: number;
  paymentGatewayFees: number;
  shippingCosts: number;
  shopifyCommission: number;
  netProfit: number;
  netProfitMarginPct: number;
}

export interface ReportTopProduct {
  title: string;
  revenue: number;
  quantity: number;
  cost: number;
  margin: number;
  marginPct: number;
}

export interface ReportData {
  client: ReportClientInfo;
  period: ReportPeriod;
  current: ReportKpiSet;
  previous: ReportKpiSet;
  financial: ReportFinancialConfig;
  profitLoss: ReportProfitLoss;
  topProducts: ReportTopProduct[];
  generatedAt: string;
}

const TAX_RATE = 0.19; // IVA Chile

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildPeriod(start: string, end: string): ReportPeriod {
  const startMs = new Date(start + 'T00:00:00Z').getTime();
  const endMs = new Date(end + 'T00:00:00Z').getTime();
  const daysInPeriod = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;

  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(previousEnd, -(daysInPeriod - 1));

  const yearAgoStart = shiftDate(start, -365);
  const yearAgoEnd = shiftDate(end, -365);

  return { start, end, daysInPeriod, previousStart, previousEnd, yearAgoStart, yearAgoEnd };
}

async function fetchClientInfo(supabase: SupabaseClient, clientId: string): Promise<ReportClientInfo> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, logo_url')
    .eq('id', clientId)
    .maybeSingle();

  const { data: conn } = await supabase
    .from('platform_connections')
    .select('shop_domain, store_url, access_token_encrypted')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .maybeSingle();

  const shopDomain = conn?.shop_domain || (conn?.store_url ? conn.store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '');

  // Auto-extract logo from Shopify shop.json on first report (logo_url null = not extracted yet).
  // El cliente puede sobrescribirlo manualmente en settings; ese override gana porque solo
  // intentamos extraer cuando logo_url es null/empty.
  let logoUrl = client?.logo_url || null;
  if (!logoUrl && conn?.access_token_encrypted && shopDomain) {
    try {
      const { data: decrypted } = await supabase.rpc('decrypt_platform_token', {
        encrypted_token: conn.access_token_encrypted,
      });
      if (decrypted) {
        const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const shopRes = await fetch(`https://${cleanDomain}/admin/api/2026-04/shop.json`, {
          headers: { 'X-Shopify-Access-Token': decrypted, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (shopRes.ok) {
          const { shop } = (await shopRes.json()) as { shop: { logo?: { src?: string }; image?: { src?: string } } };
          const candidate = shop?.logo?.src || shop?.image?.src || null;
          if (candidate) {
            logoUrl = candidate;
            await supabase.from('clients').update({ logo_url: candidate }).eq('id', clientId);
          }
        }
      }
    } catch (err) {
      // Logo extraction is best-effort; el reporte continúa sin logo si falla.
      console.warn('[fetchClientInfo] logo auto-extract failed:', (err as Error).message);
    }
  }

  // Pre-fetch logo a base64 data URI para que react-pdf no falle si la CDN está lenta.
  let logoDataUri: string | null = null;
  if (logoUrl && /^https?:\/\//.test(logoUrl)) {
    try {
      const imgRes = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get('content-type') || 'image/png';
        logoDataUri = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch (err) {
      console.warn('[fetchClientInfo] logo pre-fetch failed:', (err as Error).message);
    }
  }

  return {
    id: clientId,
    name: client?.name || 'Cliente',
    shop_domain: shopDomain,
    logo_url: logoDataUri,
  };
}

async function fetchKpisForPeriod(supabase: SupabaseClient, clientId: string, start: string, end: string): Promise<ReportKpiSet> {
  // Revenue + orders desde platform_metrics agregada por día (la que llena sync-shopify-metrics)
  const { data: metrics } = await supabase
    .from('platform_metrics')
    .select('metric_type, metric_value, metric_date')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .gte('metric_date', start)
    .lte('metric_date', end);

  let totalRevenue = 0;
  let totalOrders = 0;
  let uniqueCustomers = 0;

  for (const m of metrics || []) {
    const v = Number(m.metric_value) || 0;
    if (m.metric_type === 'revenue') totalRevenue += v;
    else if (m.metric_type === 'orders') totalOrders += v;
    else if (m.metric_type === 'unique_customers') uniqueCustomers = Math.max(uniqueCustomers, v);
  }

  // Ad spend: Meta + Google sincronizado en campaign_metrics.
  // CRÍTICO: si se filtra `manual_google_spend` luego en computeProfitLoss, NO debemos
  // contar acá los rows con platform='google' o se duplica el gasto de Google.
  // Acá traemos TODO menos Google (Google se computa con manual_google_spend del config).
  const { data: campaignMetrics } = await supabase
    .from('campaign_metrics')
    .select('spend, metric_date, platform')
    .eq('client_id', clientId)
    .neq('platform', 'google')
    .gte('metric_date', start)
    .lte('metric_date', end);

  const totalSpend = (campaignMetrics || []).reduce((sum, m) => sum + (Number(m.spend) || 0), 0);

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return { totalRevenue, totalOrders, avgOrderValue, totalSpend, totalRoas, uniqueCustomers };
}

async function fetchFinancialConfig(supabase: SupabaseClient, clientId: string): Promise<ReportFinancialConfig> {
  const { data } = await supabase
    .from('client_financial_config')
    .select('default_margin_percentage, payment_gateway_commission, shipping_cost_per_order, shopify_commission_percentage, manual_google_spend, fixed_cost_items, shopify_plan_cost, klaviyo_plan_cost, other_fixed_costs')
    .eq('client_id', clientId)
    .maybeSingle();

  let fixedItems = (data?.fixed_cost_items as Array<{ name: string; amount: number }>) || [];
  if (fixedItems.length === 0 && data) {
    if (Number(data.shopify_plan_cost) > 0) fixedItems.push({ name: 'Shopify', amount: Number(data.shopify_plan_cost) });
    if (Number(data.klaviyo_plan_cost) > 0) fixedItems.push({ name: 'Klaviyo', amount: Number(data.klaviyo_plan_cost) });
    if (Number(data.other_fixed_costs) > 0) fixedItems.push({ name: 'Otros', amount: Number(data.other_fixed_costs) });
  }

  return {
    default_margin_percentage: Number(data?.default_margin_percentage ?? 30),
    payment_gateway_commission: Number(data?.payment_gateway_commission ?? 0),
    shipping_cost_per_order: Number(data?.shipping_cost_per_order ?? 0),
    shopify_commission_percentage: Number(data?.shopify_commission_percentage ?? 0),
    manual_google_spend: Number(data?.manual_google_spend ?? 0),
    fixed_cost_items: fixedItems,
  };
}

function computeProfitLoss(
  current: ReportKpiSet,
  financial: ReportFinancialConfig,
  daysInPeriod: number,
): ReportProfitLoss {
  const marginRate = financial.default_margin_percentage / 100;
  const gatewayRate = financial.payment_gateway_commission / 100;

  const grossRevenue = current.totalRevenue;
  const netRevenue = grossRevenue / (1 + TAX_RATE);
  const costOfGoods = netRevenue * (1 - marginRate); // fallback hasta que cruzemos con sku-level cost en Sprint 2
  const grossProfit = netRevenue - costOfGoods;

  // Prorrateo de costos mensuales al rango de fechas
  const proration = daysInPeriod / 30;
  const fixedCostItems = financial.fixed_cost_items.map((item) => ({
    name: item.name,
    amount: Math.round(item.amount * proration),
  }));
  const totalFixedCosts = fixedCostItems.reduce((sum, i) => sum + i.amount, 0);
  const manualGoogleSpend = Math.round(financial.manual_google_spend * proration);
  const totalAdSpend = current.totalSpend + manualGoogleSpend;

  const paymentGatewayFees = netRevenue * gatewayRate;
  const shippingCosts = current.totalOrders * financial.shipping_cost_per_order;
  const shopifyCommission = netRevenue * (financial.shopify_commission_percentage / 100);

  const netProfit = grossProfit - totalAdSpend - totalFixedCosts - paymentGatewayFees - shippingCosts - shopifyCommission;
  const netProfitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  return {
    grossRevenue,
    netRevenue,
    costOfGoods,
    grossProfit,
    totalAdSpend,
    fixedCostItems,
    totalFixedCosts,
    paymentGatewayFees,
    shippingCosts,
    shopifyCommission,
    netProfit,
    netProfitMarginPct,
  };
}

async function fetchTopProducts(
  supabase: SupabaseClient,
  clientId: string,
  start: string,
  end: string,
  marginRate: number,
): Promise<ReportTopProduct[]> {
  // Top SKUs vendidos en el período (desde platform_metrics o desde fetch-shopify-analytics si está disponible)
  const { data: skuRows } = await supabase
    .from('platform_metrics')
    .select('metric_type, metric_value, metric_date, metadata')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('metric_type', 'top_sku')
    .gte('metric_date', start)
    .lte('metric_date', end);

  // Agregar por SKU desde metadata JSON
  const skuAggregated = new Map<string, { name: string; revenue: number; quantity: number; sku: string }>();
  for (const row of skuRows || []) {
    const meta = (row.metadata as { sku?: string; name?: string; quantity?: number; revenue?: number } | null) || {};
    const sku = meta.sku || '';
    if (!sku) continue;
    const prev = skuAggregated.get(sku) || { name: meta.name || sku, revenue: 0, quantity: 0, sku };
    prev.revenue += Number(meta.revenue) || 0;
    prev.quantity += Number(meta.quantity) || 0;
    skuAggregated.set(sku, prev);
  }

  // Costos por SKU desde shopify_products.variants
  const { data: products } = await supabase
    .from('shopify_products')
    .select('variants, title')
    .eq('client_id', clientId);

  const skuCostMap = new Map<string, number>();
  for (const p of products || []) {
    const variants = (p.variants as Array<{ sku?: string; cost?: number | null; price?: number | null }>) || [];
    for (const v of variants) {
      if (v.sku && v.cost != null && v.cost > 0) {
        skuCostMap.set(v.sku, v.cost);
      }
    }
  }

  const top = Array.from(skuAggregated.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return top.map((s) => {
    const unitCost = skuCostMap.get(s.sku);
    const cost = unitCost != null ? unitCost * s.quantity : (s.revenue / (1 + TAX_RATE)) * (1 - marginRate);
    const margin = s.revenue / (1 + TAX_RATE) - cost;
    const marginPct = s.revenue > 0 ? (margin / (s.revenue / (1 + TAX_RATE))) * 100 : 0;
    return { title: s.name, revenue: s.revenue, quantity: s.quantity, cost, margin, marginPct };
  });
}

export async function fetchReportData(
  supabase: SupabaseClient,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<ReportData> {
  const period = buildPeriod(startDate, endDate);

  const [client, current, previous, financial] = await Promise.all([
    fetchClientInfo(supabase, clientId),
    fetchKpisForPeriod(supabase, clientId, period.start, period.end),
    fetchKpisForPeriod(supabase, clientId, period.previousStart, period.previousEnd),
    fetchFinancialConfig(supabase, clientId),
  ]);

  const profitLoss = computeProfitLoss(current, financial, period.daysInPeriod);
  const marginRate = financial.default_margin_percentage / 100;
  const topProducts = await fetchTopProducts(supabase, clientId, period.start, period.end, marginRate);

  return {
    client,
    period,
    current,
    previous,
    financial,
    profitLoss,
    topProducts,
    generatedAt: new Date().toISOString(),
  };
}
