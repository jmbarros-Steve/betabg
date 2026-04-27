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
  shopifyConnectionId: string | null;
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
    .select('id, shop_domain, store_url, access_token_encrypted')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .maybeSingle();

  const shopDomain = conn?.shop_domain || (conn?.store_url ? conn.store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '');
  const shopifyConnectionId = conn?.id || null;

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
    shopifyConnectionId,
  };
}

async function fetchKpisForPeriod(
  supabase: SupabaseClient,
  clientId: string,
  shopifyConnectionId: string | null,
  start: string,
  end: string,
): Promise<ReportKpiSet> {
  let totalRevenue = 0;
  let totalOrders = 0;
  const uniqueCustomers = 0; // TODO Sprint 2: count distinct desde shopify_orders

  // platform_metrics está scoped por connection_id (no client_id, no platform col).
  if (shopifyConnectionId) {
    const { data: metrics } = await supabase
      .from('platform_metrics')
      .select('metric_type, metric_value, metric_date')
      .eq('connection_id', shopifyConnectionId)
      .gte('metric_date', start)
      .lte('metric_date', end);

    for (const m of metrics || []) {
      const v = Number(m.metric_value) || 0;
      if (m.metric_type === 'revenue') totalRevenue += v;
      else if (m.metric_type === 'orders') totalOrders += v;
    }
  }

  // Ad spend: campaign_metrics también scoped por connection_id.
  // Buscamos todas las conexiones de ads (meta, tiktok, etc.) del cliente,
  // EXCLUYENDO google (manual_google_spend lo cubre desde el financial_config).
  const { data: adsConns } = await supabase
    .from('platform_connections')
    .select('id, platform')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .in('platform', ['meta', 'tiktok']);

  const adsConnectionIds = (adsConns || []).map((c) => c.id);

  let totalSpend = 0;
  if (adsConnectionIds.length > 0) {
    const { data: campaignMetrics } = await supabase
      .from('campaign_metrics')
      .select('spend, metric_date')
      .in('connection_id', adsConnectionIds)
      .gte('metric_date', start)
      .lte('metric_date', end);

    totalSpend = (campaignMetrics || []).reduce((sum, m) => sum + (Number(m.spend) || 0), 0);
  }

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
  _start: string,
  _end: string,
  marginRate: number,
): Promise<ReportTopProduct[]> {
  // Sprint 1: top productos por price_max y inventory_total desde shopify_products
  // (la tabla está scoped por client_id y tiene snapshots cada 6h).
  // Sprint 2: cruzar con shopify_orders del período para top REAL por revenue vendido.
  const { data: products } = await supabase
    .from('shopify_products')
    .select('title, variants, price_min, price_max, inventory_total')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('inventory_total', { ascending: false })
    .limit(10);

  return (products || []).map((p) => {
    const variants = (p.variants as Array<{ sku?: string; cost?: number | null; price?: number | null }>) || [];
    const avgCost = variants.reduce((sum, v) => sum + (Number(v.cost) || 0), 0) / Math.max(1, variants.length);
    const avgPrice = (Number(p.price_min) + Number(p.price_max)) / 2;
    const stock = Number(p.inventory_total) || 0;
    // Estimación: revenue potencial = avgPrice × stock (no es venta real, solo es ranking de catálogo)
    const potentialRevenue = avgPrice * stock;
    const cost = avgCost > 0 ? avgCost * stock : potentialRevenue * (1 - marginRate);
    const margin = potentialRevenue - cost;
    const marginPct = potentialRevenue > 0 ? (margin / potentialRevenue) * 100 : 0;
    return {
      title: p.title || 'Sin nombre',
      revenue: potentialRevenue,
      quantity: stock,
      cost,
      margin,
      marginPct,
    };
  });
}

export async function fetchReportData(
  supabase: SupabaseClient,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<ReportData> {
  const period = buildPeriod(startDate, endDate);

  // Resolvemos client info primero porque incluye shopifyConnectionId que necesitan los KPIs.
  const [client, financial] = await Promise.all([
    fetchClientInfo(supabase, clientId),
    fetchFinancialConfig(supabase, clientId),
  ]);

  const [current, previous] = await Promise.all([
    fetchKpisForPeriod(supabase, clientId, client.shopifyConnectionId, period.start, period.end),
    fetchKpisForPeriod(supabase, clientId, client.shopifyConnectionId, period.previousStart, period.previousEnd),
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
