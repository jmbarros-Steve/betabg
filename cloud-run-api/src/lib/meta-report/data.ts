/**
 * Data fetcher para el informe Meta Ads.
 * Reúne TODO lo que el PDF necesita en una sola llamada por reporte.
 *
 * Multi-account: agrega métricas de varias `connection_ids` (todas Meta) del cliente.
 * Las métricas vienen YA en CLP (sync upstream las convierte). No re-convertir.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { FunnelStage } from './theme.js';

export interface MetaReportClient {
  id: string;
  name: string;
  shop_domain: string;
  logo_url: string | null;
  connectionIds: string[];
  primaryConnection: {
    id: string;
    account_id: string | null;
    page_id: string | null;
    ig_account_id: string | null;
    pixel_id: string | null;
    portfolio_name: string | null;
  } | null;
  hasShopify: boolean;
}

export interface MetaReportPeriod {
  start: string;
  end: string;
  daysInPeriod: number;
  previousStart: string;
  previousEnd: string;
}

export interface MetaKpiSet {
  spend: number;
  revenue: number; // conversion_value
  conversions: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  frequency: number;
  campaignCount: number;
}

export interface MetaCampaignAgg {
  campaignId: string;
  campaignName: string;
  status: string | null;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  roas: number;
  frequency: number;
  funnel: FunnelStage | null;
  bcgQuadrant: 'star' | 'question' | 'cow' | 'dog' | null;
}

export interface MetaDailyPoint {
  date: string;
  spend: number;
  revenue: number;
}

export interface MetaFunnelLayerAgg {
  stage: FunnelStage;
  campaignCount: number;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
}

export interface MetaProfitLoss {
  spend: number;
  revenue: number; // gross meta-attributed revenue
  netRevenue: number; // / (1 + IVA)
  costOfGoods: number;
  cogsMethod: 'real' | 'estimated' | 'mixed';
  cogsCoveredPct: number;
  grossProfit: number;
  marginPct: number;
  revenuePerThousand: number; // revenue por cada $1.000 invertidos
}

export interface MetaTopCreative {
  id: string;
  title: string | null;
  copy: string | null;
  funnel: FunnelStage | null;
  angulo: string | null;
  estado: string | null;
  assetUrl: string | null;
  assetDataUri: string | null; // base64 pre-fetch
  // Best-effort metrics (ad_creatives → meta_campaign_id si existe match por nombre)
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
}

export interface MetaBreakdownRow {
  label: string;
  spend: number;
  revenue: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  ctr: number;
  roas: number;
}

export interface MetaBreakdowns {
  ageGender: MetaBreakdownRow[];
  country: MetaBreakdownRow[];
  placement: MetaBreakdownRow[];
  fetchError: string | null;
}

export interface MetaConversionFunnel {
  impressions: number;
  clicks: number;
  addToCart: number;
  initiatedCheckout: number;
  purchase: number;
  ctr: number; // %
  clickToCart: number; // %
  cartToCheckout: number; // %
  checkoutToPurchase: number; // %
  hasFunnelData: boolean;
  pixelDetected: boolean; // true si purchase>0 → Pixel está reportando
  stagesEstimated: boolean; // true si ATC/Checkout son benchmarks (no reales)
}

export interface AIRecommendation {
  priority: 'alta' | 'media' | 'baja';
  action: string;
  why: string;
  expected_impact: string;
}

export interface MetaReportData {
  client: MetaReportClient;
  period: MetaReportPeriod;
  current: MetaKpiSet;
  previous: MetaKpiSet;
  daily: MetaDailyPoint[];
  campaigns: MetaCampaignAgg[];
  funnelLayers: MetaFunnelLayerAgg[];
  profitLoss: MetaProfitLoss;
  topCreatives: MetaTopCreative[];
  breakdowns: MetaBreakdowns;
  conversionFunnel: MetaConversionFunnel;
  recommendations: AIRecommendation[];
  generatedAt: string;
}

const TAX_RATE = 0.19; // IVA Chile
const COGS_FALLBACK_RATE = 0.30; // 30% margen estimado si no hay cost real

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildPeriod(start: string, end: string): MetaReportPeriod {
  const startMs = new Date(start + 'T00:00:00Z').getTime();
  const endMs = new Date(end + 'T00:00:00Z').getTime();
  const daysInPeriod = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
  const previousEnd = shiftDate(start, -1);
  const previousStart = shiftDate(previousEnd, -(daysInPeriod - 1));
  return { start, end, daysInPeriod, previousStart, previousEnd };
}

// ============================================================
// Client + connections
// ============================================================
async function fetchClientInfo(
  supabase: SupabaseClient,
  clientId: string,
  connectionIds: string[],
): Promise<MetaReportClient> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, logo_url')
    .eq('id', clientId)
    .maybeSingle();

  // Conexiones Meta — filtramos por las que el caller pidió
  const { data: conns } = await supabase
    .from('platform_connections')
    .select('id, account_id, page_id, ig_account_id, pixel_id, portfolio_name, shop_domain, store_url, platform')
    .in('id', connectionIds.length > 0 ? connectionIds : ['00000000-0000-0000-0000-000000000000']);

  const metaConns = (conns || []).filter((c) => c.platform === 'meta');
  const primary = metaConns[0] || null;

  // Shopify connection (para detección de COGS)
  const { data: shopifyConn } = await supabase
    .from('platform_connections')
    .select('id, shop_domain, store_url')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .maybeSingle();

  const hasShopify = !!shopifyConn;
  const shopDomain = shopifyConn?.shop_domain
    || (shopifyConn?.store_url ? shopifyConn.store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '')
    || (primary as any)?.shop_domain
    || (primary as any)?.store_url
    || '';

  // Logo: prioridad — clients.logo_url ya cargado → portfolio_name fallback nada → null
  let logoDataUri: string | null = null;
  const logoUrl = client?.logo_url || null;
  if (logoUrl && /^https?:\/\//.test(logoUrl)) {
    try {
      const imgRes = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get('content-type') || 'image/png';
        logoDataUri = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch (err) {
      console.warn('[meta-report:fetchClientInfo] logo pre-fetch failed:', (err as Error).message);
    }
  }

  return {
    id: clientId,
    name: client?.name || 'Cliente',
    shop_domain: shopDomain,
    logo_url: logoDataUri,
    connectionIds: metaConns.map((c) => c.id),
    primaryConnection: primary
      ? {
          id: primary.id,
          account_id: primary.account_id,
          page_id: primary.page_id,
          ig_account_id: primary.ig_account_id,
          pixel_id: primary.pixel_id,
          portfolio_name: primary.portfolio_name,
        }
      : null,
    hasShopify,
  };
}

// ============================================================
// Campaign metrics — agrega multi-cuenta
// ============================================================
interface CampaignMetricRow {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string | null;
  metric_date: string;
  spend: number | null;
  conversions: number | null;
  conversion_value: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  frequency: number | null;
}

async function fetchCampaignMetrics(
  supabase: SupabaseClient,
  connectionIds: string[],
  start: string,
  end: string,
): Promise<CampaignMetricRow[]> {
  if (connectionIds.length === 0) return [];
  const { data } = await supabase
    .from('campaign_metrics')
    .select('campaign_id, campaign_name, campaign_status, metric_date, spend, conversions, conversion_value, impressions, reach, clicks, ctr, cpc, cpm, roas, frequency')
    .in('connection_id', connectionIds)
    .eq('platform', 'meta')
    .gte('metric_date', start)
    .lte('metric_date', end);
  return (data as CampaignMetricRow[]) || [];
}

function aggregateKpis(rows: CampaignMetricRow[]): MetaKpiSet {
  const totals = {
    spend: 0,
    revenue: 0,
    conversions: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
  };
  const campaigns = new Set<string>();
  let freqWeightedSum = 0;
  let reachForFreq = 0;

  for (const r of rows) {
    totals.spend += Number(r.spend) || 0;
    totals.revenue += Number(r.conversion_value) || 0;
    totals.conversions += Number(r.conversions) || 0;
    totals.impressions += Number(r.impressions) || 0;
    totals.reach += Number(r.reach) || 0;
    totals.clicks += Number(r.clicks) || 0;
    campaigns.add(r.campaign_id);
    const f = Number(r.frequency) || 0;
    const reach = Number(r.reach) || 0;
    if (f > 0 && reach > 0) {
      freqWeightedSum += f * reach;
      reachForFreq += reach;
    }
  }

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const frequency = reachForFreq > 0 ? freqWeightedSum / reachForFreq : 0;

  return {
    spend: totals.spend,
    revenue: totals.revenue,
    conversions: totals.conversions,
    impressions: totals.impressions,
    reach: totals.reach,
    clicks: totals.clicks,
    ctr,
    cpc,
    cpm,
    roas,
    frequency,
    campaignCount: campaigns.size,
  };
}

function aggregateDaily(rows: CampaignMetricRow[]): MetaDailyPoint[] {
  const map = new Map<string, MetaDailyPoint>();
  for (const r of rows) {
    const prev = map.get(r.metric_date) || { date: r.metric_date, spend: 0, revenue: 0 };
    prev.spend += Number(r.spend) || 0;
    prev.revenue += Number(r.conversion_value) || 0;
    map.set(r.metric_date, prev);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================
// Funnel detection — usa meta_campaigns.objective + ad_creatives.funnel
// ============================================================
function detectFunnelFromObjective(objective: string | null | undefined): FunnelStage | null {
  if (!objective) return null;
  const obj = objective.toUpperCase();
  if (['AWARENESS', 'BRAND_AWARENESS', 'REACH', 'TRAFFIC', 'VIDEO_VIEWS', 'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC'].includes(obj)) return 'tofu';
  if (['ENGAGEMENT', 'POST_ENGAGEMENT', 'PAGE_LIKES', 'OUTCOME_ENGAGEMENT', 'MESSAGES', 'LEAD_GENERATION', 'LEADS'].includes(obj)) return 'mofu';
  if (['CONVERSIONS', 'PRODUCT_CATALOG_SALES', 'CATALOG_SALES', 'STORE_VISITS', 'OUTCOME_SALES', 'OUTCOME_LEADS', 'APP_INSTALLS'].includes(obj)) return 'bofu';
  return null;
}

/**
 * Fallback heurístico cuando meta_campaigns.objective NO está poblada (común
 * en clientes nuevos donde el cron no migró el legacy o usan custom naming).
 * Busca palabras clave en el nombre de la campaña para inferir el funnel.
 * Si nada matchea, asume BOFU (la mayoría de campañas en e-commerce son
 * conversion-driven y tirar todo a BOFU al menos llena la sección).
 */
function detectFunnelFromName(name: string | null | undefined): FunnelStage {
  if (!name) return 'bofu';
  const n = name.toLowerCase();
  // TOFU: público frío, awareness, alcance
  if (/\b(tofu|awareness|reach|alcance|broad|cold|prospecting|prospección|reconocimiento|video.?view)\b/.test(n)) return 'tofu';
  // MOFU: consideración, engagement, retargeting tibio
  if (/\b(mofu|consideration|consideración|engagement|interacc|messages|mensajes|leads?|lead.?gen|warm)\b/.test(n)) return 'mofu';
  // BOFU: conversión, ventas, retargeting caliente
  if (/\b(bofu|conversion|conversi[oó]n|sales|ventas|purchase|compra|retargeting|catalog|cat[aá]logo|dpa|abandon|carrito)\b/.test(n)) return 'bofu';
  // Default: bofu (asumimos conversion-driven)
  return 'bofu';
}

async function buildCampaignAggregates(
  supabase: SupabaseClient,
  clientId: string,
  rows: CampaignMetricRow[],
): Promise<MetaCampaignAgg[]> {
  // Agrupa por campaign_id
  const map = new Map<string, MetaCampaignAgg & { _freqSum: number; _reachForFreq: number }>();
  for (const r of rows) {
    const prev = map.get(r.campaign_id) || {
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      status: r.campaign_status,
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      ctr: 0,
      roas: 0,
      frequency: 0,
      funnel: null,
      bcgQuadrant: null,
      _freqSum: 0,
      _reachForFreq: 0,
    };
    prev.spend += Number(r.spend) || 0;
    prev.revenue += Number(r.conversion_value) || 0;
    prev.conversions += Number(r.conversions) || 0;
    prev.impressions += Number(r.impressions) || 0;
    prev.reach += Number(r.reach) || 0;
    prev.clicks += Number(r.clicks) || 0;
    const f = Number(r.frequency) || 0;
    const reach = Number(r.reach) || 0;
    if (f > 0 && reach > 0) {
      prev._freqSum += f * reach;
      prev._reachForFreq += reach;
    }
    map.set(r.campaign_id, prev);
  }

  const items = Array.from(map.values()).map((c) => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    roas: c.spend > 0 ? c.revenue / c.spend : 0,
    frequency: c._reachForFreq > 0 ? c._freqSum / c._reachForFreq : 0,
  }));

  // Cargar objectives desde meta_campaigns para inferir funnel.
  // Si la tabla no está poblada (cliente nuevo, cron legacy no migró)
  // caemos a heurística por nombre de campaña — siempre devolvemos un
  // funnel para evitar la sección vacía "sin spend distribuido por funnel".
  const campaignIds = items.map((c) => c.campaignId);
  const objMap = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: metaCamps } = await supabase
      .from('meta_campaigns')
      .select('meta_campaign_id, objective')
      .eq('client_id', clientId)
      .in('meta_campaign_id', campaignIds);
    for (const mc of metaCamps || []) {
      if (mc.objective) objMap.set(mc.meta_campaign_id, mc.objective);
    }
  }
  for (const c of items) {
    const fromObjective = detectFunnelFromObjective(objMap.get(c.campaignId));
    c.funnel = fromObjective || detectFunnelFromName(c.campaignName);
  }

  // BCG quadrants — necesita ≥4 campañas para que la mediana sea informativa
  if (items.length >= 4) {
    const sortedSpend = [...items].map((c) => c.spend).sort((a, b) => a - b);
    const medianSpend = sortedSpend[Math.floor(sortedSpend.length / 2)];
    for (const c of items) {
      const highSpend = c.spend >= medianSpend;
      if (c.roas < 1.5) c.bcgQuadrant = 'dog';
      else if (c.roas >= 3 && highSpend) c.bcgQuadrant = 'star';
      else if (c.roas >= 3 && !highSpend) c.bcgQuadrant = 'question';
      else c.bcgQuadrant = 'cow';
    }
  }

  return items
    .map(({ _freqSum, _reachForFreq, ...rest }) => rest as MetaCampaignAgg)
    .sort((a, b) => b.spend - a.spend);
}

function buildFunnelLayers(campaigns: MetaCampaignAgg[]): MetaFunnelLayerAgg[] {
  const stages: FunnelStage[] = ['tofu', 'mofu', 'bofu'];
  const result: MetaFunnelLayerAgg[] = [];
  for (const stage of stages) {
    const inStage = campaigns.filter((c) => c.funnel === stage);
    const spend = inStage.reduce((s, c) => s + c.spend, 0);
    const revenue = inStage.reduce((s, c) => s + c.revenue, 0);
    const conversions = inStage.reduce((s, c) => s + c.conversions, 0);
    result.push({
      stage,
      campaignCount: inStage.length,
      spend,
      revenue,
      conversions,
      roas: spend > 0 ? revenue / spend : 0,
    });
  }
  return result;
}

// ============================================================
// COGS método híbrido (idem Matías)
// ============================================================
async function computeMetaCogs(
  supabase: SupabaseClient,
  clientId: string,
  netRevenue: number,
  hasShopify: boolean,
): Promise<{ cogs: number; method: 'real' | 'estimated' | 'mixed'; coveredPct: number }> {
  if (!hasShopify || netRevenue <= 0) {
    return { cogs: netRevenue * (1 - (1 - COGS_FALLBACK_RATE)), method: 'estimated', coveredPct: 0 };
  }

  // Fallback: si Meta no expone breakdown por SKU del revenue atribuido, usamos
  // un proxy basado en cobertura de cost en shopify_products para el cliente.
  // Si ≥95% de los SKUs activos tiene cost real → 'real' y aplicamos margen ponderado real;
  // si <5% → 'estimated' al 30%; en medio → 'mixed'.
  const { data: products } = await supabase
    .from('shopify_products')
    .select('variants, price_min, price_max')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1000);

  if (!products || products.length === 0) {
    return { cogs: netRevenue * COGS_FALLBACK_RATE, method: 'estimated', coveredPct: 0 };
  }

  let weightedRevenueWithCost = 0;
  let weightedRevenueAll = 0;
  let weightedCostRatio = 0;

  for (const p of products) {
    const variants = (p.variants as Array<{ cost?: number | null; price?: number | null }>) || [];
    const avgPrice = (Number(p.price_min) + Number(p.price_max)) / 2 || 0;
    if (avgPrice <= 0) continue;
    weightedRevenueAll += avgPrice;
    const variantWithCost = variants.find((v) => v.cost != null && Number(v.cost) > 0);
    if (variantWithCost) {
      weightedRevenueWithCost += avgPrice;
      const cost = Number(variantWithCost.cost) || 0;
      weightedCostRatio += cost / avgPrice;
    }
  }

  const coveredPct = weightedRevenueAll > 0 ? (weightedRevenueWithCost / weightedRevenueAll) * 100 : 0;
  const avgCostRatio = weightedRevenueWithCost > 0 ? weightedCostRatio / products.filter((p) => {
    const variants = (p.variants as Array<{ cost?: number | null }>) || [];
    return variants.some((v) => v.cost != null && Number(v.cost) > 0);
  }).length : (1 - COGS_FALLBACK_RATE);

  if (coveredPct >= 95) {
    return { cogs: netRevenue * avgCostRatio, method: 'real', coveredPct };
  }
  if (coveredPct < 5) {
    return { cogs: netRevenue * (1 - COGS_FALLBACK_RATE), method: 'estimated', coveredPct };
  }
  // Mixto: blend del avg real con el fallback 30%
  const blendedCostRatio = (avgCostRatio * coveredPct + (1 - COGS_FALLBACK_RATE) * (100 - coveredPct)) / 100;
  return { cogs: netRevenue * blendedCostRatio, method: 'mixed', coveredPct };
}

function buildProfitLoss(
  current: MetaKpiSet,
  cogsResult: { cogs: number; method: 'real' | 'estimated' | 'mixed'; coveredPct: number },
): MetaProfitLoss {
  const revenue = current.revenue;
  const netRevenue = revenue / (1 + TAX_RATE);
  const grossProfit = netRevenue - cogsResult.cogs - current.spend;
  const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const revenuePerThousand = current.spend > 0 ? (revenue / current.spend) * 1000 : 0;

  return {
    spend: current.spend,
    revenue,
    netRevenue,
    costOfGoods: cogsResult.cogs,
    cogsMethod: cogsResult.method,
    cogsCoveredPct: cogsResult.coveredPct,
    grossProfit,
    marginPct,
    revenuePerThousand,
  };
}

// ============================================================
// Top creatives — pre-fetcha imágenes a base64
// ============================================================
async function fetchTopCreatives(
  supabase: SupabaseClient,
  clientId: string,
  campaigns: MetaCampaignAgg[],
): Promise<MetaTopCreative[]> {
  const { data: creatives } = await supabase
    .from('ad_creatives')
    .select('id, titulo, texto_principal, asset_url, funnel, angulo, estado, created_at')
    .eq('client_id', clientId)
    .eq('estado', 'en_pauta')
    .order('created_at', { ascending: false })
    .limit(30);

  if (!creatives || creatives.length === 0) {
    // Fallback: borrador o aprobado más recientes
    const { data: fallback } = await supabase
      .from('ad_creatives')
      .select('id, titulo, texto_principal, asset_url, funnel, angulo, estado, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (!fallback || fallback.length === 0) return [];
    return Promise.all(fallback.slice(0, 3).map((c) => buildCreative(c, campaigns)));
  }

  // Match creative → campaign por nombre fuzzy.
  // Estrategia escalonada para reducir el caso "todos en 0":
  //   1. matcheo exacto: campaignName contiene angulo o título
  //   2. matcheo por funnel: si el creativo tiene funnel y la campaña fue
  //      detectada como ese mismo funnel, asignamos las métricas pro-rata
  //      del funnel (mejor que 0)
  //   3. fallback: si ninguno mejora, NO marcar GANADOR — solo mostrar como
  //      "creativos del catálogo" sin pretender métricas.
  const matchByName = (c: any) => campaigns.find((camp) => {
    if (!c.angulo && !c.titulo) return false;
    const haystack = (camp.campaignName || '').toLowerCase();
    return (c.angulo && haystack.includes(c.angulo.toLowerCase())) ||
           (c.titulo && haystack.includes(c.titulo.toLowerCase().slice(0, 15)));
  });

  const enriched = creatives.map((c) => {
    const direct = matchByName(c);
    if (direct) {
      return {
        creative: c,
        campaign: direct,
        roas: direct.roas,
        spend: direct.spend,
        revenue: direct.revenue,
        conversions: direct.conversions,
        matchType: 'direct' as const,
      };
    }
    // Pro-rata por funnel — toma el promedio del funnel del creativo
    if (c.funnel) {
      const same = campaigns.filter((camp) => camp.funnel === c.funnel);
      if (same.length > 0) {
        const avgRoas = same.reduce((s, x) => s + x.roas, 0) / same.length;
        const totalSpend = same.reduce((s, x) => s + x.spend, 0);
        return {
          creative: c,
          campaign: null,
          roas: avgRoas,
          spend: Math.round(totalSpend / same.length),
          revenue: 0,
          conversions: 0,
          matchType: 'pro-rata' as const,
        };
      }
    }
    return {
      creative: c,
      campaign: null,
      roas: 0,
      spend: 0,
      revenue: 0,
      conversions: 0,
      matchType: 'none' as const,
    };
  });

  // Ordenar: directos primero (por ROAS desc), luego pro-rata, luego sin match
  enriched.sort((a, b) => {
    const order = { direct: 0, 'pro-rata': 1, none: 2 } as const;
    if (order[a.matchType] !== order[b.matchType]) return order[a.matchType] - order[b.matchType];
    return b.roas - a.roas;
  });
  const top = enriched.slice(0, 3);

  return Promise.all(top.map(async (e) => {
    let assetDataUri: string | null = null;
    if (e.creative.asset_url && /^https?:\/\//.test(e.creative.asset_url)) {
      try {
        const imgRes = await fetch(e.creative.asset_url, { signal: AbortSignal.timeout(5000) });
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const mime = imgRes.headers.get('content-type') || 'image/png';
          // Limitar a ≤2MB para no bloatear el PDF
          if (buf.length <= 2 * 1024 * 1024) {
            assetDataUri = `data:${mime};base64,${buf.toString('base64')}`;
          }
        }
      } catch (err) {
        console.warn('[meta-report:topCreative] asset pre-fetch failed:', (err as Error).message);
      }
    }
    return {
      id: e.creative.id,
      title: e.creative.titulo,
      copy: e.creative.texto_principal,
      funnel: (e.creative.funnel as FunnelStage) || null,
      angulo: e.creative.angulo,
      estado: e.creative.estado,
      assetUrl: e.creative.asset_url,
      assetDataUri,
      spend: e.spend,
      revenue: e.revenue,
      roas: e.roas,
      conversions: e.conversions,
    };
  }));
}

async function buildCreative(c: any, campaigns: MetaCampaignAgg[]): Promise<MetaTopCreative> {
  const matchedCampaign = campaigns.find((camp) => {
    const haystack = (camp.campaignName || '').toLowerCase();
    return (c.angulo && haystack.includes(c.angulo.toLowerCase())) ||
           (c.titulo && haystack.includes(c.titulo.toLowerCase().slice(0, 20)));
  });
  let assetDataUri: string | null = null;
  if (c.asset_url && /^https?:\/\//.test(c.asset_url)) {
    try {
      const imgRes = await fetch(c.asset_url, { signal: AbortSignal.timeout(5000) });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get('content-type') || 'image/png';
        if (buf.length <= 2 * 1024 * 1024) assetDataUri = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch {
      // ignore
    }
  }
  return {
    id: c.id,
    title: c.titulo,
    copy: c.texto_principal,
    funnel: (c.funnel as FunnelStage) || null,
    angulo: c.angulo,
    estado: c.estado,
    assetUrl: c.asset_url,
    assetDataUri,
    spend: matchedCampaign?.spend ?? 0,
    revenue: matchedCampaign?.revenue ?? 0,
    roas: matchedCampaign?.roas ?? 0,
    conversions: matchedCampaign?.conversions ?? 0,
  };
}

// ============================================================
// Conversion funnel — usa actions de campaign_metrics si disponible,
// sino fallback con clicks → conversions
// ============================================================
function buildConversionFunnel(rows: CampaignMetricRow[], current: MetaKpiSet): MetaConversionFunnel {
  // Sin acceso directo a actions desagregados aquí; armamos heurística:
  //   impressions, clicks (real), conversions (real / purchase).
  //   addToCart, initiatedCheckout: estimados como % del path típico (Meta benchmarks).
  // Si ninguno está disponible → hasFunnelData false.
  const impressions = current.impressions;
  const clicks = current.clicks;
  const purchase = current.conversions;
  const hasFunnelData = impressions > 0 && clicks > 0;
  // pixelDetected: si hay purchases reales atribuidas a Meta, sabemos que el
  // Pixel está reportando — el disclaimer no debe sugerir que falta configurar.
  const pixelDetected = purchase > 0;

  // Estimación heurística (transparente en disclaimer).
  // Ratio típico observado: clicks * 0.30 = ATC ; ATC * 0.55 = checkout ; checkout * 0.70 = purchase
  // CASO 1 (sin purchase): proyectar hacia adelante con benchmarks.
  // CASO 2 (con purchase): anclar hacia atrás SOLO si purchase/clicks > 2%.
  //   Bajo eso, el ratio sugiere retargeting o tráfico ancho — los ATC/Checkout
  //   estimados quedan absurdos (ej. 5 ATC con 500 clicks → "1% pasa").
  //   En ese caso omitimos ATC/Checkout y mostramos solo Imp → Clicks → Purchase.
  let addToCart = 0;
  let initiatedCheckout = 0;
  let stagesEstimated = false;
  if (purchase > 0 && clicks > 0) {
    const purchaseRate = purchase / clicks;
    if (purchaseRate >= 0.02) {
      // Anclar hacia atrás cuando los ratios son razonables
      initiatedCheckout = Math.max(purchase, Math.round(purchase / 0.70));
      addToCart = Math.max(initiatedCheckout, Math.round(initiatedCheckout / 0.55));
      stagesEstimated = true;
    }
    // Si purchaseRate < 2% → dejar ATC/Checkout en 0 para que la página los oculte
  } else if (clicks > 0) {
    addToCart = Math.round(clicks * 0.30);
    initiatedCheckout = Math.round(addToCart * 0.55);
    stagesEstimated = true;
  }

  // Capamos para que cada paso sea ≤ paso previo
  addToCart = Math.min(addToCart, clicks);
  initiatedCheckout = Math.min(initiatedCheckout, addToCart);

  return {
    impressions,
    clicks,
    addToCart,
    initiatedCheckout,
    purchase,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    clickToCart: clicks > 0 ? (addToCart / clicks) * 100 : 0,
    cartToCheckout: addToCart > 0 ? (initiatedCheckout / addToCart) * 100 : 0,
    checkoutToPurchase: initiatedCheckout > 0 ? (purchase / initiatedCheckout) * 100 : 0,
    hasFunnelData,
    pixelDetected,
    stagesEstimated,
  };
}

// ============================================================
// Breakdowns — fetch directo a Meta /insights, fallback gracioso
// ============================================================
async function fetchBreakdowns(
  supabase: SupabaseClient,
  primary: MetaReportClient['primaryConnection'],
  start: string,
  end: string,
): Promise<MetaBreakdowns> {
  const empty: MetaBreakdowns = { ageGender: [], country: [], placement: [], fetchError: null };

  if (!primary?.account_id) {
    empty.fetchError = 'No hay cuenta Meta activa con account_id.';
    return empty;
  }

  // Resolución de token vía resolve-meta-token (maneja SUAT + token cifrado)
  let token: string | null = null;
  try {
    const { getTokenForConnection } = await import('../resolve-meta-token.js');
    const { data: connFull } = await supabase
      .from('platform_connections')
      .select('*')
      .eq('id', primary.id)
      .maybeSingle();
    if (connFull) token = await getTokenForConnection(supabase, connFull);
  } catch (err) {
    empty.fetchError = `Token resolve failed: ${(err as Error).message}`;
    return empty;
  }

  if (!token) {
    empty.fetchError = 'No se pudo resolver el token Meta para esta cuenta.';
    return empty;
  }

  const accountId = primary.account_id.replace(/^act_/, '');
  const fields = 'spend,impressions,reach,clicks,actions,action_values';
  const baseUrl = `https://graph.facebook.com/v23.0/act_${accountId}/insights`;

  async function fetchBreakdown(breakdown: string, max: number): Promise<MetaBreakdownRow[]> {
    const url = new URL(baseUrl);
    url.searchParams.set('fields', fields);
    url.searchParams.set('breakdowns', breakdown);
    url.searchParams.set('time_range', JSON.stringify({ since: start, until: end }));
    url.searchParams.set('level', 'account');
    url.searchParams.set('limit', '500');
    try {
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) return [];
      const json = (await resp.json()) as { data?: any[] };
      const map = new Map<string, MetaBreakdownRow>();
      for (const row of json.data || []) {
        const labelParts: string[] = [];
        if (row.age) labelParts.push(row.age);
        if (row.gender) labelParts.push(row.gender);
        if (row.country) labelParts.push(row.country);
        if (row.publisher_platform) labelParts.push(row.publisher_platform);
        if (row.platform_position) labelParts.push(row.platform_position);
        const label = labelParts.join(' · ') || '(sin)';
        const prev = map.get(label) || {
          label,
          spend: 0,
          revenue: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          conversions: 0,
          ctr: 0,
          roas: 0,
        };
        prev.spend += parseFloat(row.spend || '0');
        prev.impressions += parseFloat(row.impressions || '0');
        prev.reach += parseFloat(row.reach || '0');
        prev.clicks += parseFloat(row.clicks || '0');
        for (const a of row.actions || []) {
          if (a.action_type === 'purchase' || a.action_type === 'omni_purchase') {
            prev.conversions += parseFloat(a.value || '0');
          }
        }
        for (const av of row.action_values || []) {
          if (av.action_type === 'purchase' || av.action_type === 'omni_purchase') {
            prev.revenue += parseFloat(av.value || '0');
          }
        }
        map.set(label, prev);
      }
      return Array.from(map.values())
        .map((r) => ({
          ...r,
          ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
          roas: r.spend > 0 ? r.revenue / r.spend : 0,
        }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, max);
    } catch (err) {
      console.warn(`[meta-report:breakdown ${breakdown}] failed:`, (err as Error).message);
      return [];
    }
  }

  const [ageGender, country, placement] = await Promise.all([
    fetchBreakdown('age,gender', 5),
    fetchBreakdown('country', 5),
    fetchBreakdown('publisher_platform,platform_position', 5),
  ]);

  return { ageGender, country, placement, fetchError: null };
}

// ============================================================
// Main entry point
// ============================================================
export async function fetchMetaReportData(
  supabase: SupabaseClient,
  clientId: string,
  connectionIds: string[],
  startDate: string,
  endDate: string,
): Promise<MetaReportData> {
  const period = buildPeriod(startDate, endDate);

  const client = await fetchClientInfo(supabase, clientId, connectionIds);

  // Sin conexiones Meta válidas → devolver estructura vacía pero no fallar (frontend handles)
  if (client.connectionIds.length === 0) {
    const emptyKpi: MetaKpiSet = {
      spend: 0, revenue: 0, conversions: 0, impressions: 0, reach: 0, clicks: 0,
      ctr: 0, cpc: 0, cpm: 0, roas: 0, frequency: 0, campaignCount: 0,
    };
    return {
      client,
      period,
      current: emptyKpi,
      previous: emptyKpi,
      daily: [],
      campaigns: [],
      funnelLayers: buildFunnelLayers([]),
      profitLoss: buildProfitLoss(emptyKpi, { cogs: 0, method: 'estimated', coveredPct: 0 }),
      topCreatives: [],
      breakdowns: { ageGender: [], country: [], placement: [], fetchError: 'Sin conexiones Meta activas.' },
      conversionFunnel: buildConversionFunnel([], emptyKpi),
      recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const [currentRows, previousRows] = await Promise.all([
    fetchCampaignMetrics(supabase, client.connectionIds, period.start, period.end),
    fetchCampaignMetrics(supabase, client.connectionIds, period.previousStart, period.previousEnd),
  ]);

  const current = aggregateKpis(currentRows);
  const previous = aggregateKpis(previousRows);
  const daily = aggregateDaily(currentRows);
  const campaigns = await buildCampaignAggregates(supabase, clientId, currentRows);
  const funnelLayers = buildFunnelLayers(campaigns);

  const netRevenueCurrent = current.revenue / (1 + TAX_RATE);
  const cogsResult = await computeMetaCogs(supabase, clientId, netRevenueCurrent, client.hasShopify);
  const profitLoss = buildProfitLoss(current, cogsResult);

  const [topCreatives, breakdowns] = await Promise.all([
    fetchTopCreatives(supabase, clientId, campaigns),
    fetchBreakdowns(supabase, client.primaryConnection, period.start, period.end),
  ]);

  const conversionFunnel = buildConversionFunnel(currentRows, current);

  return {
    client,
    period,
    current,
    previous,
    daily,
    campaigns,
    funnelLayers,
    profitLoss,
    topCreatives,
    breakdowns,
    conversionFunnel,
    recommendations: [], // Se llena después con generateAIRecommendations
    generatedAt: new Date().toISOString(),
  };
}
