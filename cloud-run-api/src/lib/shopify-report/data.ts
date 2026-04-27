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

// ===== Sprint 2 types =====
export interface RevenueByDayHour {
  matrix: number[][]; // [day-of-week 0-6][hour 0-23] = revenue
  totalsByDay: number[]; // [0-6]
  totalsByHour: number[]; // [0-23]
  peakDay: number;
  peakHour: number;
  peakRevenue: number;
}

export interface ChannelBreakdown {
  channel: string;
  label: string;
  orders: number;
  revenue: number;
  share: number; // 0-100
}

export interface GeoBreakdown {
  city: string;
  country: string;
  orders: number;
  revenue: number;
}

export interface ProductRevenueBreakdown {
  title: string;
  sku: string;
  productId: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  bcgQuadrant: 'star' | 'cow' | 'question' | 'dog';
}

export interface FunnelData {
  sessions: number | null;
  addToCart: number | null;
  checkouts: number;
  purchases: number;
  abandonedRevenue: number;
  abandonmentRate: number; // 0-100
  conversionRate: number | null; // 0-100, null si no hay sessions
  hasAbandonedData: boolean;
}

export interface MarketingPerformance {
  platform: 'meta' | 'tiktok' | 'google';
  spend: number;
  revenue: number;
  roas: number;
  cpm: number;
  ctr: number;
  cac: number;
  impressions: number;
  clicks: number;
  conversions: number;
  bestCampaign: { name: string; roas: number; spend: number } | null;
  worstCampaign: { name: string; roas: number; spend: number } | null;
}

export interface SprintTwoData {
  revenueByDayHour: RevenueByDayHour;
  channels: ChannelBreakdown[];
  topCities: GeoBreakdown[];
  productBreakdown: ProductRevenueBreakdown[];
  staleProducts: Array<{ title: string; daysWithoutSale: number; stockValue: number }>;
  funnel: FunnelData;
  marketing: MarketingPerformance[];
  breakEvenRoas: number;
}

export interface ReportData {
  client: ReportClientInfo;
  period: ReportPeriod;
  current: ReportKpiSet;
  previous: ReportKpiSet;
  financial: ReportFinancialConfig;
  profitLoss: ReportProfitLoss;
  topProducts: ReportTopProduct[];
  sprint2: SprintTwoData;
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

// ============================================================
// Sprint 2 fetchers — usan shopify_orders (sincronizada vía cron)
// ============================================================

interface OrderRow {
  total_price: number;
  subtotal_price: number;
  total_tax: number;
  source_name: string | null;
  shipping_country: string | null;
  shipping_city: string | null;
  financial_status: string | null;
  cancelled_at: string | null;
  line_items: unknown;
  created_at_shop: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Tienda Online',
  pos: 'Punto de Venta',
  shopify_draft_order: 'Pedido Manual',
  iphone: 'App iOS',
  android: 'App Android',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  unknown: 'Otro',
};

async function fetchOrders(
  supabase: SupabaseClient,
  clientId: string,
  start: string,
  end: string,
): Promise<OrderRow[]> {
  // Filtramos por created_at_shop. Excluimos cancelled.
  const { data } = await supabase
    .from('shopify_orders')
    .select('total_price, subtotal_price, total_tax, source_name, shipping_country, shipping_city, financial_status, cancelled_at, line_items, created_at_shop')
    .eq('client_id', clientId)
    .is('cancelled_at', null)
    .gte('created_at_shop', start + 'T00:00:00Z')
    .lte('created_at_shop', end + 'T23:59:59Z');

  return (data as OrderRow[]) || [];
}

// Timezone del cliente — Sprint 2 hardcoded a Chile.
// Sprint 3 leerá de clients.timezone o shopify shop.iana_timezone.
const CLIENT_TIMEZONE = 'America/Santiago';

const tzFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLIENT_TIMEZONE,
  weekday: 'short',
  hour: 'numeric',
  hour12: false,
});

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localDayHour(iso: string): { dow: number; hour: number } {
  const parts = tzFormatter.formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === 'weekday')?.value || 'Sun';
  const hr = parts.find((p) => p.type === 'hour')?.value || '0';
  return { dow: DAY_INDEX[wd] ?? 0, hour: parseInt(hr, 10) % 24 };
}

function computeRevenueByDayHour(orders: OrderRow[]): RevenueByDayHour {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const totalsByDay = Array(7).fill(0);
  const totalsByHour = Array(24).fill(0);

  for (const o of orders) {
    const { dow, hour } = localDayHour(o.created_at_shop);
    const rev = Number(o.total_price) || 0;
    matrix[dow][hour] += rev;
    totalsByDay[dow] += rev;
    totalsByHour[hour] += rev;
  }

  let peakDay = 0,
    peakHour = 0,
    peakRevenue = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (matrix[d][h] > peakRevenue) {
        peakRevenue = matrix[d][h];
        peakDay = d;
        peakHour = h;
      }
    }
  }

  return { matrix, totalsByDay, totalsByHour, peakDay, peakHour, peakRevenue };
}

function computeChannels(orders: OrderRow[]): ChannelBreakdown[] {
  const map = new Map<string, { orders: number; revenue: number }>();
  let totalRev = 0;
  for (const o of orders) {
    const ch = (o.source_name || 'unknown').toLowerCase();
    const prev = map.get(ch) || { orders: 0, revenue: 0 };
    prev.orders += 1;
    prev.revenue += Number(o.total_price) || 0;
    map.set(ch, prev);
    totalRev += Number(o.total_price) || 0;
  }
  return Array.from(map.entries())
    .map(([channel, v]) => ({
      channel,
      label: CHANNEL_LABELS[channel] || channel,
      orders: v.orders,
      revenue: v.revenue,
      share: totalRev > 0 ? (v.revenue / totalRev) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function computeTopCities(orders: OrderRow[]): GeoBreakdown[] {
  const map = new Map<string, { city: string; country: string; orders: number; revenue: number }>();
  for (const o of orders) {
    const city = (o.shipping_city || '').trim();
    const country = (o.shipping_country || '').trim();
    if (!city) continue;
    const key = `${city.toLowerCase()}|${country.toLowerCase()}`;
    const prev = map.get(key) || { city, country, orders: 0, revenue: 0 };
    prev.orders += 1;
    prev.revenue += Number(o.total_price) || 0;
    map.set(key, prev);
  }
  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

interface LineItem {
  sku?: string;
  product_id?: number;
  variant_id?: number;
  name?: string;
  title?: string;
  quantity?: number;
  price?: string;
  total_discount?: string;
}

async function computeProductBreakdown(
  supabase: SupabaseClient,
  clientId: string,
  orders: OrderRow[],
  marginRate: number,
): Promise<ProductRevenueBreakdown[]> {
  // Solo cargar products que aparecen en line_items del periodo (evita full-table scan
  // en clientes con 10k+ SKUs, donde el límite default de 1000 rompía el lookup).
  const productIdsInOrders = new Set<string>();
  for (const o of orders) {
    const items = (o.line_items as LineItem[]) || [];
    for (const it of items) {
      if (it.product_id) productIdsInOrders.add(String(it.product_id));
    }
  }

  let products: Array<{ shopify_product_id: string; title: string; variants: unknown }> = [];
  if (productIdsInOrders.size > 0) {
    const { data } = await supabase
      .from('shopify_products')
      .select('shopify_product_id, title, variants')
      .eq('client_id', clientId)
      .in('shopify_product_id', Array.from(productIdsInOrders));
    products = data || [];
  }

  const skuCostMap = new Map<string, number>();
  const productNameById = new Map<string, string>();
  for (const p of products) {
    productNameById.set(p.shopify_product_id, p.title || '');
    const variants = (p.variants as Array<{ sku?: string; cost?: number | null }>) || [];
    for (const v of variants) {
      if (v.sku && v.cost != null && v.cost > 0) {
        skuCostMap.set(v.sku, v.cost);
      }
    }
  }

  const productMap = new Map<string, { title: string; sku: string; productId: string; unitsSold: number; revenue: number; cost: number }>();

  for (const o of orders) {
    const items = (o.line_items as LineItem[]) || [];
    for (const item of items) {
      const productId = String(item.product_id || '');
      const sku = item.sku || '';
      const key = productId || sku || (item.name || '');
      if (!key) continue;
      const prev = productMap.get(key) || {
        title: item.name || item.title || productNameById.get(productId) || 'Sin nombre',
        sku,
        productId,
        unitsSold: 0,
        revenue: 0,
        cost: 0,
      };
      const qty = Number(item.quantity) || 0;
      const price = parseFloat(item.price || '0') || 0;
      const discount = parseFloat(item.total_discount || '0') || 0;
      const lineRevenue = qty * price - discount;
      prev.unitsSold += qty;
      prev.revenue += lineRevenue;

      const unitCost = sku ? skuCostMap.get(sku) : null;
      const lineCost = unitCost != null ? unitCost * qty : (lineRevenue / (1 + TAX_RATE)) * (1 - marginRate);
      prev.cost += lineCost;
      productMap.set(key, prev);
    }
  }

  // Convertir a netRevenue ANTES (no en margin pct) para coherencia con EERR.
  const items = Array.from(productMap.values()).map((p) => {
    const netRevenue = p.revenue / (1 + TAX_RATE);
    const margin = netRevenue - p.cost;
    const marginPct = netRevenue > 0 ? (margin / netRevenue) * 100 : 0;
    // Sobrescribir revenue con neto para que la columna BCG sea consistente con EERR.
    return { ...p, revenue: netRevenue, margin, marginPct };
  });

  // BCG quadrant — necesita ≥4 productos para que la mediana sea informativa.
  // Con 1-3 productos, todos quedan en el mismo cuadrante por construcción.
  if (items.length === 0) return [];
  if (items.length < 4) {
    return items
      .map((p) => ({ ...p, bcgQuadrant: 'star' as const })) // marcador, BCGMatrix muestra disclaimer
      .sort((a, b) => b.revenue - a.revenue);
  }

  const medianRevenue = [...items].sort((a, b) => a.revenue - b.revenue)[Math.floor(items.length / 2)].revenue;
  const medianMargin = [...items].sort((a, b) => a.marginPct - b.marginPct)[Math.floor(items.length / 2)].marginPct;

  return items
    .map((p) => {
      const highRev = p.revenue >= medianRevenue;
      const highMargin = p.marginPct >= medianMargin;
      let quadrant: 'star' | 'cow' | 'question' | 'dog';
      if (highRev && highMargin) quadrant = 'star';
      else if (highRev && !highMargin) quadrant = 'cow';
      else if (!highRev && highMargin) quadrant = 'question';
      else quadrant = 'dog';
      return { ...p, bcgQuadrant: quadrant };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

async function computeStaleProducts(
  supabase: SupabaseClient,
  clientId: string,
): Promise<Array<{ title: string; daysWithoutSale: number; stockValue: number }>> {
  // Productos con stock pero sin venta en STALE_WINDOW_DAYS (independiente del periodo del informe,
  // porque "stale" es semántica de inventario, no del rango analizado).
  const STALE_WINDOW_DAYS = 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_WINDOW_DAYS);
  const cutoffIso = cutoff.toISOString();

  // Limitamos a top 200 por inventario para evitar full-table scans en shops grandes.
  const { data: products } = await supabase
    .from('shopify_products')
    .select('shopify_product_id, title, price_min, inventory_total, variants')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .gt('inventory_total', 0)
    .order('inventory_total', { ascending: false })
    .limit(200);

  const { data: recentOrders } = await supabase
    .from('shopify_orders')
    .select('line_items')
    .eq('client_id', clientId)
    .gte('created_at_shop', cutoffIso);

  const soldProductIds = new Set<string>();
  for (const o of recentOrders || []) {
    const items = (o.line_items as LineItem[]) || [];
    for (const item of items) {
      if (item.product_id) soldProductIds.add(String(item.product_id));
    }
  }

  const stale = (products || [])
    .filter((p) => !soldProductIds.has(p.shopify_product_id))
    .map((p) => ({
      title: p.title || 'Sin nombre',
      daysWithoutSale: STALE_WINDOW_DAYS,
      stockValue: (Number(p.price_min) || 0) * (Number(p.inventory_total) || 0),
    }))
    .filter((p) => p.stockValue > 0)
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 10);

  return stale;
}

async function computeFunnel(
  supabase: SupabaseClient,
  clientId: string,
  start: string,
  end: string,
  orders: OrderRow[],
): Promise<FunnelData> {
  // Abandoned checkouts del período
  const { data: abandoned } = await supabase
    .from('shopify_abandoned_checkouts')
    .select('total_price')
    .eq('client_id', clientId)
    .gte('created_at_shop', start + 'T00:00:00Z')
    .lte('created_at_shop', end + 'T23:59:59Z');

  const abandonedCount = (abandoned || []).length;
  const abandonedRevenue = (abandoned || []).reduce((s, a) => s + (Number(a.total_price) || 0), 0);

  // Detectar si tenemos data de abandoned (alguna fila histórica del cliente)
  // para no mentir con "0% abandono = excelente" cuando en realidad no se sincroniza.
  const { count: totalAbandonedHistorical } = await supabase
    .from('shopify_abandoned_checkouts')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId);
  const hasAbandonedData = (totalAbandonedHistorical ?? 0) > 0;

  const purchases = orders.length;
  const checkouts = purchases + abandonedCount;
  const abandonmentRate = checkouts > 0 ? (abandonedCount / checkouts) * 100 : 0;

  return {
    sessions: null,
    addToCart: null,
    checkouts,
    purchases,
    abandonedRevenue,
    abandonmentRate,
    conversionRate: null,
    hasAbandonedData,
  };
}

async function computeMarketingPerformance(
  supabase: SupabaseClient,
  clientId: string,
  start: string,
  end: string,
): Promise<MarketingPerformance[]> {
  const { data: adsConns } = await supabase
    .from('platform_connections')
    .select('id, platform')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .in('platform', ['meta', 'tiktok', 'google']);

  if (!adsConns || adsConns.length === 0) return [];

  const result: MarketingPerformance[] = [];

  for (const conn of adsConns) {
    const { data: metrics } = await supabase
      .from('campaign_metrics')
      .select('campaign_id, campaign_name, spend, conversion_value, conversions, impressions, clicks, ctr, cpm, roas')
      .eq('connection_id', conn.id)
      .gte('metric_date', start)
      .lte('metric_date', end);

    if (!metrics || metrics.length === 0) continue;

    const totals = metrics.reduce(
      (acc, m) => {
        acc.spend += Number(m.spend) || 0;
        acc.revenue += Number(m.conversion_value) || 0;
        acc.impressions += Number(m.impressions) || 0;
        acc.clicks += Number(m.clicks) || 0;
        acc.conversions += Number(m.conversions) || 0;
        return acc;
      },
      { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 },
    );

    // Aggregate por campaign para best/worst
    const byCampaign = new Map<string, { name: string; spend: number; revenue: number }>();
    for (const m of metrics) {
      const key = String(m.campaign_id || m.campaign_name || 'unknown');
      const prev = byCampaign.get(key) || { name: m.campaign_name || key, spend: 0, revenue: 0 };
      prev.spend += Number(m.spend) || 0;
      prev.revenue += Number(m.conversion_value) || 0;
      byCampaign.set(key, prev);
    }

    const campaigns = Array.from(byCampaign.values())
      .filter((c) => c.spend > 100) // ignorar campañas con gasto trivial
      .map((c) => ({ name: c.name, roas: c.spend > 0 ? c.revenue / c.spend : 0, spend: c.spend }));

    const sortedByRoas = [...campaigns].sort((a, b) => b.roas - a.roas);
    const bestCampaign = sortedByRoas[0] || null;
    const worstCampaign = sortedByRoas[sortedByRoas.length - 1] || null;

    result.push({
      platform: conn.platform as 'meta' | 'tiktok' | 'google',
      spend: totals.spend,
      revenue: totals.revenue,
      roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
      cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cac: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
      impressions: totals.impressions,
      clicks: totals.clicks,
      conversions: totals.conversions,
      bestCampaign: bestCampaign && bestCampaign !== worstCampaign ? bestCampaign : null,
      worstCampaign: worstCampaign && bestCampaign !== worstCampaign ? worstCampaign : null,
    });
  }

  return result;
}

export async function fetchReportData(
  supabase: SupabaseClient,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<ReportData> {
  const period = buildPeriod(startDate, endDate);

  const [client, financial] = await Promise.all([
    fetchClientInfo(supabase, clientId),
    fetchFinancialConfig(supabase, clientId),
  ]);

  const [current, previous, orders] = await Promise.all([
    fetchKpisForPeriod(supabase, clientId, client.shopifyConnectionId, period.start, period.end),
    fetchKpisForPeriod(supabase, clientId, client.shopifyConnectionId, period.previousStart, period.previousEnd),
    fetchOrders(supabase, clientId, period.start, period.end),
  ]);

  const profitLoss = computeProfitLoss(current, financial, period.daysInPeriod);
  const marginRate = financial.default_margin_percentage / 100;

  const [topProducts, productBreakdown, staleProducts, funnel, marketing] = await Promise.all([
    fetchTopProducts(supabase, clientId, period.start, period.end, marginRate),
    computeProductBreakdown(supabase, clientId, orders, marginRate),
    computeStaleProducts(supabase, clientId),
    computeFunnel(supabase, clientId, period.start, period.end, orders),
    computeMarketingPerformance(supabase, clientId, period.start, period.end),
  ]);

  const sprint2: SprintTwoData = {
    revenueByDayHour: computeRevenueByDayHour(orders),
    channels: computeChannels(orders),
    topCities: computeTopCities(orders),
    productBreakdown,
    staleProducts,
    funnel,
    marketing,
    breakEvenRoas: marginRate > 0 ? 1 / marginRate : 3.33,
  };

  return {
    client,
    period,
    current,
    previous,
    financial,
    profitLoss,
    topProducts,
    sprint2,
    generatedAt: new Date().toISOString(),
  };
}
