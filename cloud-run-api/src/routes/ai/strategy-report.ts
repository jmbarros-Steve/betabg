import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Strategy Report — branded PDF report for a client.
 *
 * Endpoint: POST /api/strategy-report
 *   Body: { client_id, from, to, temas: string[] }
 *   Auth: X-Cron-Secret | internal | JWT user owner
 *
 * Returns: { url, filename, sections, period, previous }
 *
 * Available temas:
 *   ads_meta, ads_google, shopify, email, whatsapp,
 *   abandoned, competencia, creativos, catalogo, criterio, all
 *
 * Premium edition includes:
 *  - Cover page with hero metric
 *  - SVG sparklines / bar charts / line charts / donuts / radar
 *  - AI-generated executive narrative + alerts + action plan (Sonnet)
 *  - Health score per dimension (0-100) rendered as radar
 *  - Top sold products (live Shopify orders fetch)
 *  - Cohort metrics (LTV, repeat rate)
 *  - WhatsApp sentiment classification (Haiku at-runtime)
 *  - Page breaks per section, branded footer with pagination
 */

const VALID_TEMAS = new Set([
  'ads_meta', 'ads_google', 'shopify', 'email', 'whatsapp',
  'abandoned', 'competencia', 'creativos', 'catalogo', 'criterio', 'all',
]);

const SHOPIFY_API_VERSION = '2026-04';

interface ReportPayload {
  client_id: string;
  from: string;
  to: string;
  temas: string[];
}

// ─────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any
  )[c]);
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

function fmtMoneyShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('es-CL');
}

function pctDelta(curr: number, prev: number): { label: string; cls: string; sign: number } {
  if (prev <= 0) return { label: 'N/A', cls: 'neutral', sign: 0 };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? 1 : pct < 0 ? -1 : 0;
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '→';
  const cls = sign > 0 ? 'up' : sign < 0 ? 'down' : 'neutral';
  return { label: `${arrow} ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, cls, sign };
}

function dayDiff(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// SVG CHART HELPERS — pure functions returning inline SVG strings
// ─────────────────────────────────────────────────────────────────

function sparklineSvg(values: number[], opts: { width?: number; height?: number; stroke?: string; fill?: string } = {}): string {
  const w = opts.width || 80;
  const h = opts.height || 24;
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const fillPath = `M 0,${h} L ${points.join(' L ')} L ${w},${h} Z`;
  const stroke = opts.stroke || '#0f172a';
  const fill = opts.fill || 'rgba(15,23,42,0.08)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <path d="${fillPath}" fill="${fill}" stroke="none"/>
    <path d="${pathD}" stroke="${stroke}" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function lineChartSvg(daily: Array<{ date: string; value: number }>, opts: { width?: number; height?: number; stroke?: string; fill?: string; label?: string; yFormat?: (n: number) => string } = {}): string {
  const w = opts.width || 520;
  const h = opts.height || 140;
  const padL = 48, padR = 12, padT = 12, padB = 30;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  if (daily.length === 0) return `<div class="chart-empty">Sin datos</div>`;
  const values = daily.map(d => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = innerW / Math.max(1, daily.length - 1);
  const points = daily.map((d, i) => {
    const x = padL + i * stepX;
    const y = padT + innerH - ((d.value - min) / span) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  const fillPath = `M ${padL},${padT + innerH} L ${points.join(' L ')} L ${(padL + innerW).toFixed(1)},${padT + innerH} Z`;
  const stroke = opts.stroke || '#0f172a';
  const fill = opts.fill || 'rgba(15,23,42,0.10)';
  const yFmt = opts.yFormat || ((n: number) => fmtNum(n));
  // Y-axis labels (3 levels: max, mid, min)
  const yTicks = [max, (max + min) / 2, min];
  const yLabels = yTicks.map((v, i) => {
    const y = padT + (innerH * i / 2);
    return `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${escapeHtml(yFmt(v))}</text>
            <line x1="${padL}" x2="${padL + innerW}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width="0.5"/>`;
  }).join('');
  // X-axis labels (first, middle, last)
  const xLabels = daily.length >= 2 ? [
    { i: 0, label: daily[0].date.slice(5) },
    { i: Math.floor(daily.length / 2), label: daily[Math.floor(daily.length / 2)].date.slice(5) },
    { i: daily.length - 1, label: daily[daily.length - 1].date.slice(5) },
  ].map(t => {
    const x = padL + t.i * stepX;
    return `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="9" fill="#94a3b8">${escapeHtml(t.label)}</text>`;
  }).join('') : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${yLabels}
    <path d="${fillPath}" fill="${fill}" stroke="none"/>
    <path d="${pathD}" stroke="${stroke}" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    ${xLabels}
  </svg>`;
}

function barChartCompareSvg(items: Array<{ label: string; current: number; previous: number }>, opts: { width?: number; height?: number; colorCurr?: string; colorPrev?: string; format?: (n: number) => string } = {}): string {
  const w = opts.width || 520;
  const rowH = 26;
  const h = opts.height || (items.length * rowH + 16);
  const labelW = 130;
  const padR = 10;
  const innerW = w - labelW - padR;
  const max = Math.max(...items.flatMap(i => [i.current, i.previous]), 1);
  const colorCurr = opts.colorCurr || '#0f172a';
  const colorPrev = opts.colorPrev || '#cbd5e1';
  const fmt = opts.format || fmtNum;
  const rows = items.map((it, i) => {
    const y = 8 + i * rowH;
    const wCurr = (it.current / max) * innerW;
    const wPrev = (it.previous / max) * innerW;
    return `
      <text x="${labelW - 8}" y="${y + 16}" text-anchor="end" font-size="10" fill="#475569" font-weight="500">${escapeHtml(it.label)}</text>
      <rect x="${labelW}" y="${y + 4}" width="${wPrev.toFixed(1)}" height="8" fill="${colorPrev}" rx="2"/>
      <rect x="${labelW}" y="${y + 14}" width="${wCurr.toFixed(1)}" height="8" fill="${colorCurr}" rx="2"/>
      <text x="${labelW + Math.max(wCurr, wPrev) + 6}" y="${y + 12}" font-size="9" fill="#94a3b8">${escapeHtml(fmt(it.previous))}</text>
      <text x="${labelW + Math.max(wCurr, wPrev) + 6}" y="${y + 22}" font-size="9.5" fill="#0f172a" font-weight="700">${escapeHtml(fmt(it.current))}</text>
    `;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
}

function donutSvg(segments: Array<{ label: string; value: number; color: string }>, opts: { size?: number; thickness?: number; centerLabel?: string } = {}): string {
  const size = opts.size || 160;
  const thick = opts.thickness || 28;
  const r = size / 2 - 4;
  const ri = r - thick;
  const cx = size / 2, cy = size / 2;
  const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  let acc = 0;
  const arcs = segments.map((s) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const x3 = cx + ri * Math.cos(end), y3 = cy + ri * Math.sin(end);
    const x4 = cx + ri * Math.cos(start), y4 = cy + ri * Math.sin(start);
    return `<path d="M ${x1.toFixed(1)},${y1.toFixed(1)} A ${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L ${x3.toFixed(1)},${y3.toFixed(1)} A ${ri},${ri} 0 ${large} 0 ${x4.toFixed(1)},${y4.toFixed(1)} Z" fill="${s.color}"/>`;
  }).join('');
  const center = opts.centerLabel ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" fill="#0f172a" font-weight="700">${escapeHtml(opts.centerLabel)}</text>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${arcs}${center}</svg>`;
}

function radarSvg(scores: Array<{ dimension: string; value: number }>, opts: { size?: number; max?: number; color?: string } = {}): string {
  const size = opts.size || 280;
  const max = opts.max || 100;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 36;
  const n = scores.length;
  if (n === 0) return '';
  const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const color = opts.color || '#0f172a';
  // Concentric grid (4 levels)
  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = scores.map((_, i) => {
      const a = angle(i);
      return `${(cx + r * f * Math.cos(a)).toFixed(1)},${(cy + r * f * Math.sin(a)).toFixed(1)}`;
    });
    return `<polygon points="${pts.join(' ')}" fill="none" stroke="#e2e8f0" stroke-width="0.5"/>`;
  }).join('');
  // Axes
  const axes = scores.map((_, i) => {
    const a = angle(i);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="0.5"/>`;
  }).join('');
  // Labels
  const labels = scores.map((s, i) => {
    const a = angle(i);
    const x = cx + (r + 18) * Math.cos(a);
    const y = cy + (r + 18) * Math.sin(a);
    const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1) + 0}" text-anchor="${anchor}" font-size="9" fill="#475569" font-weight="600">${escapeHtml(s.dimension)}</text>
            <text x="${x.toFixed(1)}" y="${y.toFixed(1) + 11}" text-anchor="${anchor}" font-size="9" fill="${color}" font-weight="700">${Math.round(s.value)}</text>`;
  }).join('');
  // Area
  const pts = scores.map((s, i) => {
    const a = angle(i);
    const f = Math.max(0, Math.min(1, s.value / max));
    return `${(cx + r * f * Math.cos(a)).toFixed(1)},${(cy + r * f * Math.sin(a)).toFixed(1)}`;
  });
  const dots = scores.map((s, i) => {
    const a = angle(i);
    const f = Math.max(0, Math.min(1, s.value / max));
    const x = cx + r * f * Math.cos(a), y = cy + r * f * Math.sin(a);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    ${axes}
    <polygon points="${pts.join(' ')}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5"/>
    ${dots}
    ${labels}
  </svg>`;
}

function progressBarSvg(value: number, max: number, opts: { width?: number; height?: number; color?: string } = {}): string {
  const w = opts.width || 100;
  const h = opts.height || 6;
  const color = opts.color || '#0f172a';
  const f = Math.max(0, Math.min(1, value / Math.max(1, max)));
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" fill="#e2e8f0"/>
    <rect x="0" y="0" width="${(w * f).toFixed(1)}" height="${h}" rx="${h / 2}" fill="${color}"/>
  </svg>`;
}

// ─────────────────────────────────────────────────────────────────
// AGGREGATIONS
// ─────────────────────────────────────────────────────────────────

function aggregateShopify(metrics: any[], from: string, to: string, shopifyConnIds: string[]): { revenue: number; orders: number } {
  let revenue = 0, orders = 0;
  for (const m of metrics) {
    if (m.metric_date < from || m.metric_date > to) continue;
    if (!shopifyConnIds.includes(m.connection_id)) continue;
    if (m.metric_type === 'revenue' || m.metric_type === 'gross_revenue') revenue += Number(m.metric_value) || 0;
    if (m.metric_type === 'orders' || m.metric_type === 'orders_count') orders += Number(m.metric_value) || 0;
  }
  return { revenue, orders };
}

function aggregateAds(metrics: any[], from: string, to: string): { spend: number; impressions: number; clicks: number; conversions: number; revenue: number } {
  let spend = 0, impressions = 0, clicks = 0, conversions = 0, revenue = 0;
  for (const m of metrics) {
    if (m.metric_date < from || m.metric_date > to) continue;
    spend += Number(m.spend) || 0;
    impressions += Number(m.impressions) || 0;
    clicks += Number(m.clicks) || 0;
    conversions += Number(m.conversions) || 0;
    revenue += Number(m.conversion_value) || 0;
  }
  return { spend, impressions, clicks, conversions, revenue };
}

function dailySeriesShopify(metrics: any[], days: string[], shopifyConnIds: string[], type: 'revenue' | 'orders'): Array<{ date: string; value: number }> {
  const map: Record<string, number> = {};
  for (const d of days) map[d] = 0;
  for (const m of metrics) {
    if (!(m.metric_date in map)) continue;
    if (!shopifyConnIds.includes(m.connection_id)) continue;
    if (type === 'revenue' && (m.metric_type === 'revenue' || m.metric_type === 'gross_revenue')) {
      map[m.metric_date] += Number(m.metric_value) || 0;
    } else if (type === 'orders' && (m.metric_type === 'orders' || m.metric_type === 'orders_count')) {
      map[m.metric_date] += Number(m.metric_value) || 0;
    }
  }
  return days.map(d => ({ date: d, value: map[d] || 0 }));
}

function dailySeriesAds(metrics: any[], days: string[], field: 'spend' | 'clicks' | 'impressions' | 'conversions' | 'conversion_value'): Array<{ date: string; value: number }> {
  const map: Record<string, number> = {};
  for (const d of days) map[d] = 0;
  for (const m of metrics) {
    if (!(m.metric_date in map)) continue;
    map[m.metric_date] += Number(m[field]) || 0;
  }
  return days.map(d => ({ date: d, value: map[d] || 0 }));
}

function dailySeriesEmail(events: any[], days: string[], type: 'open' | 'click'): Array<{ date: string; value: number }> {
  const map: Record<string, number> = {};
  for (const d of days) map[d] = 0;
  const matches = type === 'open' ? new Set(['open', 'opened']) : new Set(['click', 'clicked']);
  for (const e of events) {
    const d = (e.created_at || '').slice(0, 10);
    if (!(d in map)) continue;
    if (matches.has(e.event_type)) map[d] += 1;
  }
  return days.map(d => ({ date: d, value: map[d] || 0 }));
}

// ─────────────────────────────────────────────────────────────────
// SHOPIFY ORDERS FETCH (for top sold products)
// ─────────────────────────────────────────────────────────────────

interface ShopifyLineItem { sku: string | null; title: string; quantity: number; price: string; product_id?: number; image_url?: string | null }
interface ShopifyOrder { id: number; created_at: string; financial_status: string; total_price: string; line_items: ShopifyLineItem[] }

async function fetchShopifyOrdersForReport(supabase: any, shopifyConnId: string, fromIso: string, toIso: string): Promise<ShopifyOrder[]> {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('store_url, access_token_encrypted')
    .eq('id', shopifyConnId)
    .single();
  if (!connection?.store_url || !connection?.access_token_encrypted) return [];

  const { data: decryptedToken, error: decryptError } = await supabase
    .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });
  if (decryptError || !decryptedToken) return [];

  const cleanStoreUrl = String(connection.store_url).replace(/^https?:\/\//, '');
  const headers = {
    'X-Shopify-Access-Token': decryptedToken,
    'Content-Type': 'application/json',
  };
  const out: ShopifyOrder[] = [];
  const baseFields = 'id,created_at,financial_status,total_price,line_items';
  let url: string | null = `https://${cleanStoreUrl}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&created_at_min=${fromIso}T00:00:00Z&created_at_max=${toIso}T23:59:59Z&fields=${baseFields}&limit=250`;
  let pages = 0;
  console.log(`[strategy-report] Fetching Shopify orders for ${cleanStoreUrl} ${fromIso}→${toIso}`);
  while (url && pages < 10) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[strategy-report] Shopify API ${res.status}: ${errText.slice(0, 200)}`);
        break;
      }
      const json: any = await res.json();
      const pageOrders = json.orders || [];
      out.push(...pageOrders);
      console.log(`[strategy-report] Page ${pages + 1}: ${pageOrders.length} orders fetched`);
      const linkHeader = res.headers.get('Link') || '';
      const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = m ? m[1] : null;
      pages++;
    } catch (e: any) {
      console.error('[strategy-report] Shopify orders fetch error:', e?.message || e);
      break;
    }
  }
  console.log(`[strategy-report] Total orders fetched: ${out.length} from ${cleanStoreUrl}`);
  return out;
}

function aggregateTopProducts(orders: ShopifyOrder[], limit: number = 10): Array<{ sku: string | null; title: string; units: number; revenue: number; orders: number }> {
  const map: Record<string, { sku: string | null; title: string; units: number; revenue: number; orders: number }> = {};
  // Accept both PAID and FULFILLED-but-pending states (small merchants often have manual / pending payments)
  const ACCEPTED = new Set(['paid', 'partially_paid', 'partially_refunded', 'pending', 'authorized']);
  let kept = 0, dropped = 0;
  const droppedStatuses: Record<string, number> = {};
  for (const o of orders) {
    const fs = String(o.financial_status || '');
    if (!ACCEPTED.has(fs)) {
      dropped++;
      droppedStatuses[fs] = (droppedStatuses[fs] || 0) + 1;
      continue;
    }
    kept++;
    for (const li of (o.line_items || [])) {
      const key = li.sku || li.title || 'sin-sku';
      if (!map[key]) map[key] = { sku: li.sku || null, title: li.title || 'Sin título', units: 0, revenue: 0, orders: 0 };
      map[key].units += Number(li.quantity) || 0;
      map[key].revenue += (Number(li.price) || 0) * (Number(li.quantity) || 0);
      map[key].orders += 1;
    }
  }
  console.log(`[strategy-report] Top products aggregation: ${kept} accepted, ${dropped} dropped, ${Object.keys(map).length} unique products. Dropped statuses:`, droppedStatuses);
  return Object.values(map).sort((a, b) => b.units - a.units).slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────
// AI INSIGHTS (Sonnet) — narrative + alerts + opportunities + action plan + health scores
// ─────────────────────────────────────────────────────────────────

interface AIInsights {
  narrative: string;            // 1 paragraph executive narrative
  alerts: Array<{ severity: 'high' | 'medium' | 'low'; title: string; detail: string }>;
  opportunities: Array<{ title: string; detail: string; impact: string }>;
  actionPlan: Array<{ priority: 'P1' | 'P2' | 'P3'; action: string; reason: string; impact: string; deadline: string; owner: string }>;
  healthScores: Array<{ dimension: string; value: number; reason: string }>;
}

/** Strip lone UTF-16 surrogates that break JSON.stringify → Anthropic 400. */
function sanitizeForJson(s: string): string {
  if (!s) return '';
  return s
    // Remove high surrogates not followed by a low surrogate
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    // Remove low surrogates not preceded by a high surrogate
    .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '$1');
}

async function generateAIInsights(allData: any, period: { from: string; to: string; days: number }, sectionsIncluded: string[]): Promise<AIInsights | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = sanitizeForJson(buildInsightsPrompt(allData, period, sectionsIncluded));

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: `Eres Steve, un Bulldog Francés con doctorado en Performance Marketing de Stanford. Tu trabajo es analizar la data de un cliente y devolver insights concretos en formato JSON estricto.

REGLAS:
- Devuelve SIEMPRE un JSON válido con esta forma exacta:
{
  "narrative": "1 párrafo de 3-5 oraciones, en español neutro, tono experto pero cercano, mencionando los 2-3 hallazgos más importantes del período con números concretos",
  "alerts": [{"severity": "high|medium|low", "title": "...", "detail": "..."}],
  "opportunities": [{"title": "...", "detail": "...", "impact": "estimación de impacto en $ CLP o %"}],
  "actionPlan": [{"priority": "P1|P2|P3", "action": "verbo + objeto + condición", "reason": "por qué", "impact": "$ estimado o métrica", "deadline": "fecha YYYY-MM-DD o 'inmediato'", "owner": "cliente | steve"}],
  "healthScores": [{"dimension": "...", "value": 0-100, "reason": "1 línea"}]
}
- Máximo 5 alerts, 5 opportunities, 6 actionPlan items, 6 healthScores.
- Sé brutalmente honesto pero accionable.
- Cita NÚMEROS reales de la data, NO inventes.
- Si la data no permite una sección, devolvé arrays vacíos [].
- Las dimensions de healthScores deben ser cosas como: Ventas, Publicidad, Email, Carritos, Creativos, Salud Operativa, Diversificación, Engagement.
- NO incluyas markdown, NO incluyas explicaciones fuera del JSON. Solo el JSON.`,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[strategy-report] AI insights HTTP ${res.status}: ${errBody.slice(0, 400)}`);
      return null;
    }
    const json: any = await res.json();
    const text = (json.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    // Extract JSON from response (model may wrap in code fence)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[strategy-report] AI returned no JSON. Raw text:', text.slice(0, 300));
      return null;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      console.warn('[strategy-report] AI JSON parse failed (text length:', text.length, '). Trying to fix truncation...');
      // Common case: model hit max_tokens mid-array. Trim to last complete }
      const fixed = jsonMatch[0].replace(/,\s*\{[^}]*$/, '').replace(/,\s*"[^"]*$/, '');
      // Close any open brackets
      const opens = (fixed.match(/\[/g) || []).length;
      const closes = (fixed.match(/\]/g) || []).length;
      let attempt = fixed + ']'.repeat(Math.max(0, opens - closes));
      const oOpens = (attempt.match(/\{/g) || []).length;
      const oCloses = (attempt.match(/\}/g) || []).length;
      attempt = attempt + '}'.repeat(Math.max(0, oOpens - oCloses));
      try {
        parsed = JSON.parse(attempt);
        console.log('[strategy-report] Recovered partial AI response after truncation fix.');
      } catch {
        console.error('[strategy-report] AI JSON unrecoverable:', parseErr?.message);
        return null;
      }
    }
    return {
      narrative: parsed.narrative || '',
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 5) : [],
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.slice(0, 5) : [],
      actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan.slice(0, 6) : [],
      healthScores: Array.isArray(parsed.healthScores) ? parsed.healthScores.slice(0, 6) : [],
    };
  } catch (e: any) {
    console.error('[strategy-report] AI insights error:', e?.message);
    return null;
  }
}

function buildInsightsPrompt(d: any, period: { from: string; to: string; days: number }, sections: string[]): string {
  const lines: string[] = [];
  lines.push(`Cliente: ${d.client.company || d.client.name}`);
  lines.push(`Industria/Fase: ${d.client.fase_negocio || 'N/A'}`);
  lines.push(`Período del reporte: ${period.from} a ${period.to} (${period.days} días)`);
  lines.push(`Período de comparación previo: ${d.prev.from} a ${d.prev.to}`);
  lines.push(`Secciones disponibles en el reporte: ${sections.join(', ')}`);
  lines.push('');

  // Brief
  if (d.persona?.persona_data) {
    lines.push('BRIEF DEL CLIENTE (resumen):');
    lines.push(JSON.stringify(d.persona.persona_data).slice(0, 1200));
    lines.push('');
  }

  // Shopify
  if (sections.includes('shopify') && d.platformMetrics) {
    const cur = aggregateShopify(d.platformMetrics, period.from, period.to, d.shopifyConnIds || []);
    const prev = aggregateShopify(d.platformMetrics, d.prev.from, d.prev.to, d.shopifyConnIds || []);
    lines.push(`SHOPIFY (período actual): ${fmtMoney(cur.revenue)} en ${cur.orders} pedidos`);
    lines.push(`SHOPIFY (período anterior): ${fmtMoney(prev.revenue)} en ${prev.orders} pedidos`);
  }

  // Ads
  if ((sections.includes('ads_meta') || sections.includes('ads_google')) && d.campaignMetrics) {
    const cur = aggregateAds(d.campaignMetrics, period.from, period.to);
    const prev = aggregateAds(d.campaignMetrics, d.prev.from, d.prev.to);
    const roas = cur.spend > 0 ? (cur.revenue / cur.spend).toFixed(2) : 'N/A';
    const ctr = cur.impressions > 0 ? ((cur.clicks / cur.impressions) * 100).toFixed(2) : 'N/A';
    lines.push(`PUBLICIDAD (actual): Spend ${fmtMoney(cur.spend)}, ROAS ${roas}x, CTR ${ctr}%, ${cur.conversions} conversiones`);
    lines.push(`PUBLICIDAD (anterior): Spend ${fmtMoney(prev.spend)}, ${prev.conversions} conversiones`);
  }

  // Email
  if (sections.includes('email')) {
    const ev = d.emailEvents || [];
    const opens = ev.filter((e: any) => e.event_type === 'open' || e.event_type === 'opened').length;
    const clicks = ev.filter((e: any) => e.event_type === 'click' || e.event_type === 'clicked').length;
    lines.push(`EMAIL: ${(d.emailCampaigns || []).length} campañas enviadas, ${opens} opens, ${clicks} clicks`);
    if (d.emailSubsCount) lines.push(`EMAIL: lista de ${d.emailSubsCount} suscriptores`);
  }

  // WA
  if (sections.includes('whatsapp') && d.waMessages) {
    lines.push(`WHATSAPP: ${d.waMessages.length} mensajes en el período`);
  }

  // Abandoned
  if (sections.includes('abandoned') && d.abandoned) {
    const ab = d.abandoned.filter((x: any) => !x.order_completed);
    const total = ab.reduce((acc: number, x: any) => acc + (Number(x.total_price) || 0), 0);
    lines.push(`CARRITOS ABANDONADOS: ${ab.length} carritos, ${fmtMoney(total)} sin recuperar`);
  }

  // Catálogo
  if (sections.includes('catalogo') && d.products) {
    const sinStock = d.products.filter((p: any) => p.inventory_total === 0).length;
    lines.push(`CATÁLOGO: ${d.products.length} productos activos, ${sinStock} sin stock`);
  }

  // Top productos vendidos
  if (d.topProducts && d.topProducts.length > 0) {
    lines.push('TOP PRODUCTOS VENDIDOS (período actual):');
    for (const p of d.topProducts.slice(0, 5)) {
      lines.push(`  - ${p.title}: ${p.units} u. (${fmtMoney(p.revenue)})`);
    }
  }

  // Cohort
  if (d.cohort) {
    lines.push(`COHORTE: ${d.cohort.totalSubs} suscriptores total, ${d.cohort.repeatCount} con 2+ pedidos (${d.cohort.repeatRate}% repeat rate), LTV promedio ${fmtMoney(d.cohort.avgLtv)}`);
  }

  // Creativos top/bottom
  if (sections.includes('creativos') && d.creatives && d.creatives.length > 0) {
    const top = d.creatives.slice(0, 3);
    const bot = d.creatives.slice(-3);
    lines.push('CREATIVOS TOP:');
    for (const c of top) {
      lines.push(`  - [${c.channel || 'meta'}] ${c.theme || c.content_summary || ''} (score ${c.performance_score}, verdict: ${c.performance_verdict})`);
    }
    if (d.creatives.length > 3) {
      lines.push('CREATIVOS BOTTOM:');
      for (const c of bot) {
        lines.push(`  - [${c.channel || 'meta'}] ${c.theme || c.content_summary || ''} (score ${c.performance_score}, verdict: ${c.performance_verdict})`);
      }
    }
  }

  // Criterio
  if (sections.includes('criterio') && d.criterio?.length > 0) {
    lines.push(`CRITERIO: ${d.criterio.length} reglas no cumplidas`);
  }

  // Competencia
  if (sections.includes('competencia') && d.competitorAds?.length > 0) {
    lines.push(`COMPETENCIA: ${d.competitorAds.length} ads activos detectados de competidores`);
  }

  lines.push('');
  lines.push('Devolveme el JSON con narrative, alerts, opportunities, actionPlan y healthScores. Solo JSON, nada más.');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// COHORT (LTV / repeat rate from email_subscribers)
// ─────────────────────────────────────────────────────────────────

function computeCohort(subs: any[]): { totalSubs: number; repeatCount: number; repeatRate: number; avgLtv: number; topSpenders: Array<{ orders: number; spent: number }> } {
  if (!subs || subs.length === 0) return { totalSubs: 0, repeatCount: 0, repeatRate: 0, avgLtv: 0, topSpenders: [] };
  const total = subs.length;
  const withOrders = subs.filter(s => Number(s.total_orders) > 0);
  const repeat = subs.filter(s => Number(s.total_orders) >= 2).length;
  const totalSpent = withOrders.reduce((acc, s) => acc + (Number(s.total_spent) || 0), 0);
  const avgLtv = withOrders.length > 0 ? totalSpent / withOrders.length : 0;
  const topSpenders = subs
    .map(s => ({ orders: Number(s.total_orders) || 0, spent: Number(s.total_spent) || 0 }))
    .filter(s => s.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);
  return {
    totalSubs: total,
    repeatCount: repeat,
    repeatRate: total > 0 ? Math.round((repeat / total) * 1000) / 10 : 0,
    avgLtv: Math.round(avgLtv),
    topSpenders,
  };
}

// ─────────────────────────────────────────────────────────────────
// WA SENTIMENT (Haiku batch classification)
// ─────────────────────────────────────────────────────────────────

interface WaSentiment {
  total: number;
  byCategory: Record<string, number>;
  samples: Array<{ category: string; body: string }>;
}

async function classifyWaSentiment(messages: any[]): Promise<WaSentiment | null> {
  if (!messages || messages.length === 0) return null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // Take last 30 inbound messages with body
  const inbound = messages.filter(m => m.direction === 'inbound' && m.body && String(m.body).trim().length > 5).slice(0, 30);
  if (inbound.length === 0) return null;
  const numbered = inbound.map((m, i) => `[${i}] ${String(m.body).slice(0, 150)}`).join('\n');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `Clasificá cada mensaje de WhatsApp del cliente. Categorías: COMPRA (intención clara de comprar / pago), CONSULTA (pregunta sobre producto, stock, envío, precio), QUEJA (problema, devolución, reclamo), SPAM (irrelevante, ofertas, etc), OTRO. Devolvé SOLO un JSON válido con la forma {"clasificaciones": [{"i": 0, "cat": "COMPRA"}, ...]}. NADA más.`,
        messages: [{ role: 'user', content: `Mensajes:\n${numbered}\n\nDevolveme el JSON con cada índice clasificado.` }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json: any = await res.json();
    const text = (json.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const clas = (parsed.clasificaciones || []) as Array<{ i: number; cat: string }>;
    const byCategory: Record<string, number> = { COMPRA: 0, CONSULTA: 0, QUEJA: 0, SPAM: 0, OTRO: 0 };
    const samples: Array<{ category: string; body: string }> = [];
    for (const c of clas) {
      const cat = (c.cat || 'OTRO').toUpperCase();
      if (!(cat in byCategory)) byCategory[cat] = 0;
      byCategory[cat]++;
      if (samples.length < 6 && inbound[c.i]) {
        samples.push({ category: cat, body: String(inbound[c.i].body).slice(0, 120) });
      }
    }
    return { total: inbound.length, byCategory, samples };
  } catch (e: any) {
    console.error('[strategy-report] WA sentiment error:', e?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// PUPPETEER LAUNCHER (Cloud Run-safe)
// ─────────────────────────────────────────────────────────────────

async function launchBrowser() {
  const puppeteer = await import(/* webpackIgnore: true */ 'puppeteer' as string) as any;
  const launcher = puppeteer.default || puppeteer;
  const ts = `${process.pid}-${Date.now()}`;
  const userDataDir = `/tmp/chrome-data-${ts}`;
  const crashDumpsDir = `/tmp/chrome-crash-${ts}`;
  const fs = await import('fs');
  try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}
  try { fs.mkdirSync(crashDumpsDir, { recursive: true }); } catch {}
  return launcher.launch({
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-crashpad',
      '--disable-breakpad',
      `--user-data-dir=${userDataDir}`,
      `--crash-dumps-dir=${crashDumpsDir}`,
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--hide-scrollbars',
      '--mute-audio',
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    env: { ...process.env, HOME: '/tmp', XDG_CONFIG_HOME: '/tmp/.config', XDG_CACHE_HOME: '/tmp/.cache' },
    dumpio: false,
  });
}

// ─────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────

export async function strategyReport(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const isCron = isValidCronSecret(c.req.header('X-Cron-Secret'));
    const isInternal = c.get('isInternal') === true;
    const user = c.get('user');

    if (!isCron && !isInternal && !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payload = await c.req.json() as ReportPayload;
    const { client_id, from, to } = payload;
    let temas = (payload.temas || []).filter((t) => VALID_TEMAS.has(t));
    if (!client_id || !from || !to) return c.json({ error: 'client_id, from, to required' }, 400);
    if (temas.length === 0) temas = ['all'];

    const fromDate = new Date(from + 'T00:00:00.000Z');
    const toDate = new Date(to + 'T23:59:59.999Z');
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      return c.json({ error: 'Invalid date range' }, 400);
    }
    const days = dayDiff(from, to);
    const dayMs = 86400000;
    const prevToDate = new Date(fromDate.getTime() - 1);
    const prevFromDate = new Date(prevToDate.getTime() - days * dayMs);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);
    const prevFromStr = prevFromDate.toISOString().slice(0, 10);
    const prevToStr = prevToDate.toISOString().slice(0, 10);
    const allDays = eachDay(fromStr, toStr);

    // Load client + branding
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, name, company, shop_domain, logo_url, brand_color, brand_secondary_color, brand_font, fase_negocio, user_id, client_user_id')
      .eq('id', client_id)
      .single();
    if (clientErr || !client) return c.json({ error: 'Client not found' }, 404);

    if (!isCron && !isInternal) {
      const userId = user?.id;
      if (client.user_id !== userId && client.client_user_id !== userId) {
        const { data: roleRow } = await supabase
          .from('user_roles').select('is_super_admin').eq('user_id', userId).eq('role', 'admin').maybeSingle();
        if (!roleRow?.is_super_admin) return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const { data: connections } = await supabase
      .from('platform_connections').select('id, platform').eq('client_id', client_id).eq('is_active', true);
    const connIds = (connections || []).map((c: any) => c.id);
    const shopifyConnIds = (connections || []).filter((c: any) => c.platform === 'shopify').map((c: any) => c.id);

    const wants = (t: string) => temas.includes('all') || temas.includes(t);
    const sectionsToInclude: string[] = [];
    const data: any = {
      client,
      period: { from: fromStr, to: toStr, days },
      prev: { from: prevFromStr, to: prevToStr },
      shopifyConnIds,
      allDays,
    };

    // platform_metrics + campaign_metrics for both periods
    if ((wants('shopify') || wants('ads_meta') || wants('ads_google')) && connIds.length > 0) {
      const { data: pm } = await supabase
        .from('platform_metrics')
        .select('metric_type, metric_value, metric_date, connection_id')
        .in('connection_id', connIds)
        .gte('metric_date', prevFromStr)
        .lte('metric_date', toStr)
        .limit(3000);
      data.platformMetrics = pm || [];
    }
    if ((wants('ads_meta') || wants('ads_google')) && connIds.length > 0) {
      const { data: cm } = await supabase
        .from('campaign_metrics')
        .select('campaign_name, campaign_status, spend, impressions, clicks, conversions, conversion_value, metric_date, connection_id')
        .in('connection_id', connIds)
        .gte('metric_date', prevFromStr)
        .lte('metric_date', toStr)
        .limit(3000);
      data.campaignMetrics = cm || [];
      if (wants('ads_meta')) sectionsToInclude.push('ads_meta');
      if (wants('ads_google')) sectionsToInclude.push('ads_google');
    }
    if (wants('shopify')) sectionsToInclude.push('shopify');

    if (wants('email')) {
      const [{ data: ev }, { data: camps }, { data: subs, count: subsCount }] = await Promise.all([
        supabase.from('email_events').select('event_type, campaign_id, created_at').eq('client_id', client_id).gte('created_at', fromStr).lte('created_at', toStr + 'T23:59:59').limit(5000),
        supabase.from('email_campaigns').select('name, subject, sent_count, total_recipients, sent_at, status').eq('client_id', client_id).eq('status', 'sent').gte('sent_at', fromStr).lte('sent_at', toStr + 'T23:59:59').order('sent_at', { ascending: false }).limit(20),
        supabase.from('email_subscribers').select('status, total_orders, total_spent', { count: 'exact' }).eq('client_id', client_id).limit(2000),
      ]);
      data.emailEvents = ev || [];
      data.emailCampaigns = camps || [];
      data.emailSubsCount = subsCount || (subs || []).length;
      data.emailSubs = subs || [];
      sectionsToInclude.push('email');
      // Cohort calculation from subscribers
      data.cohort = computeCohort(subs || []);
    }

    if (wants('whatsapp')) {
      const { data: wa } = await supabase
        .from('wa_messages').select('direction, body, contact_name, contact_phone, created_at')
        .eq('client_id', client_id).gte('created_at', fromStr).lte('created_at', toStr + 'T23:59:59')
        .order('created_at', { ascending: false }).limit(500);
      data.waMessages = wa || [];
      sectionsToInclude.push('whatsapp');
    }

    if (wants('abandoned')) {
      const { data: ab } = await supabase
        .from('shopify_abandoned_checkouts')
        .select('checkout_id, customer_name, customer_email, customer_phone, total_price, currency, line_items, created_at, order_completed')
        .eq('client_id', client_id).gte('created_at', fromStr).lte('created_at', toStr + 'T23:59:59')
        .order('created_at', { ascending: false }).limit(50);
      data.abandoned = ab || [];
      sectionsToInclude.push('abandoned');
    }

    if (wants('competencia')) {
      const [{ data: tr }, { data: ads }] = await Promise.all([
        supabase.from('competitor_tracking').select('display_name, ig_handle, store_url, last_sync_at').eq('client_id', client_id).eq('is_active', true).limit(20),
        supabase.from('competitor_ads').select('ad_text, ad_headline, days_running, platforms, started_at, image_url').eq('client_id', client_id).eq('is_active', true).gte('started_at', fromStr).order('days_running', { ascending: false }).limit(15),
      ]);
      data.competitorTracking = tr || [];
      data.competitorAds = ads || [];
      sectionsToInclude.push('competencia');
    }

    if (wants('creativos')) {
      const { data: cr } = await supabase
        .from('creative_history')
        .select('channel, type, theme, content_summary, performance_verdict, performance_reason, performance_score, meta_ctr, meta_roas, meta_cpa, klaviyo_open_rate, klaviyo_click_rate, measured_at, image_url')
        .eq('client_id', client_id).gte('measured_at', fromStr).lte('measured_at', toStr + 'T23:59:59')
        .order('performance_score', { ascending: false, nullsFirst: false })
        .limit(20);
      data.creatives = cr || [];
      sectionsToInclude.push('creativos');
    }

    if (wants('catalogo')) {
      const { data: prods } = await supabase
        .from('shopify_products')
        .select('title, vendor, product_type, price_min, price_max, inventory_total, status')
        .eq('client_id', client_id).eq('status', 'active')
        .order('price_max', { ascending: false }).limit(40);
      data.products = prods || [];
      sectionsToInclude.push('catalogo');
    }

    if (wants('criterio')) {
      const { data: cri } = await supabase
        .from('criterio_results')
        .select('rule_id, entity_type, actual_value, expected_value, details, evaluated_at')
        .eq('shop_id', client_id).eq('passed', false)
        .gte('evaluated_at', fromStr).lte('evaluated_at', toStr + 'T23:59:59')
        .order('evaluated_at', { ascending: false }).limit(20);
      data.criterio = cri || [];
      sectionsToInclude.push('criterio');
    }

    // Persona (always included for context)
    const { data: persona } = await supabase
      .from('buyer_personas').select('persona_data, is_complete').eq('client_id', client_id).maybeSingle();
    data.persona = persona;

    // Live Shopify orders → top sold products (only if shopify section + connection exists)
    if (wants('shopify') && shopifyConnIds.length > 0) {
      try {
        const orders = await fetchShopifyOrdersForReport(supabase, shopifyConnIds[0], fromStr, toStr);
        data.shopifyOrders = orders;
        data.topProducts = aggregateTopProducts(orders, 10);
      } catch (e: any) {
        console.error('[strategy-report] Top products fetch failed:', e?.message);
        data.topProducts = [];
      }
    }

    // WA Sentiment (live AI classification)
    if (wants('whatsapp') && data.waMessages?.length > 0) {
      data.waSentiment = await classifyWaSentiment(data.waMessages);
    }

    // AI insights (narrative + alerts + opportunities + action plan + health scores)
    data.aiInsights = await generateAIInsights(data, data.period, sectionsToInclude);

    // Render HTML
    const html = renderReportHtml(data, sectionsToInclude);

    // PDF
    const browser = await launchBrowser();
    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    } finally {
      await browser.close();
    }

    // Upload
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `reports/${client_id}/${ts}_${fromStr}_${toStr}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('client-assets')
      .upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true });
    if (uploadErr) {
      console.error('[strategy-report] Upload error:', uploadErr);
      return c.json({ error: 'Failed to upload PDF', details: uploadErr.message }, 500);
    }
    const { data: { publicUrl } } = supabase.storage.from('client-assets').getPublicUrl(filename);

    return c.json({
      ok: true,
      url: publicUrl,
      filename,
      sections: sectionsToInclude,
      period: { from: fromStr, to: toStr, days },
      previous: { from: prevFromStr, to: prevToStr },
      hasAi: !!data.aiInsights,
    });
  } catch (err: any) {
    console.error('[strategy-report] Unhandled error:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 300) }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────
// HTML RENDERER
// ─────────────────────────────────────────────────────────────────

function renderReportHtml(d: any, sections: string[]): string {
  const c = d.client;
  const brandPrimary = c.brand_color || '#0f172a';
  const brandSecondary = c.brand_secondary_color || '#475569';
  const brandFont = c.brand_font || 'Inter, system-ui, -apple-system, sans-serif';
  const logoUrl = c.logo_url || '';
  const companyName = escapeHtml(c.company || c.name || 'Cliente');
  const period = d.period;
  const prev = d.prev;

  const blocks: string[] = [];
  blocks.push(renderCoverPage(d, brandPrimary, brandSecondary, logoUrl, companyName, period, sections));
  if (d.aiInsights) blocks.push(renderHealthScoreSection(d.aiInsights, brandPrimary));
  blocks.push(renderExecSummarySection(d, sections, brandPrimary));
  if (sections.includes('shopify')) blocks.push(renderShopifySection(d, brandPrimary, brandSecondary));
  if (sections.includes('shopify')) blocks.push(renderTopProductsSection(d, brandPrimary));
  if (sections.includes('ads_meta') || sections.includes('ads_google')) blocks.push(renderAdsSection(d, brandPrimary, brandSecondary));
  if (sections.includes('creativos')) blocks.push(renderCreativosSection(d, brandPrimary));
  if (sections.includes('email')) blocks.push(renderEmailSection(d, brandPrimary, brandSecondary));
  if (sections.includes('email') && d.cohort && d.cohort.totalSubs > 0) blocks.push(renderCohortSection(d, brandPrimary));
  if (sections.includes('whatsapp')) blocks.push(renderWaSection(d, brandPrimary));
  if (sections.includes('abandoned')) blocks.push(renderAbandonedSection(d, brandPrimary));
  if (sections.includes('catalogo')) blocks.push(renderCatalogoSection(d, brandPrimary));
  if (sections.includes('competencia')) blocks.push(renderCompetenciaSection(d, brandPrimary));
  if (sections.includes('criterio')) blocks.push(renderCriterioSection(d, brandPrimary));
  if (d.aiInsights && d.aiInsights.actionPlan && d.aiInsights.actionPlan.length > 0) blocks.push(renderActionPlanSection(d.aiInsights, brandPrimary));
  blocks.push(renderFooter(companyName, period, brandSecondary));

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<title>Reporte ${companyName}</title>
<style>
  @page { size: A4; margin: 0; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${brandFont};color:#0f172a;font-size:10.5pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
  .page{padding:18mm 14mm 16mm;page-break-after:always;position:relative;min-height:297mm;display:flex;flex-direction:column}
  .page:last-child{page-break-after:auto}
  .page.cover{padding:0;min-height:297mm;page-break-after:always}
  h1{font-size:28pt;color:${brandPrimary};font-weight:800;letter-spacing:-1pt;line-height:1.1}
  h2{font-size:14pt;color:${brandPrimary};margin:0 0 10pt;font-weight:800;letter-spacing:-0.3pt;border-left:5pt solid ${brandPrimary};padding-left:10pt;line-height:1.2}
  h3{font-size:10pt;margin:14pt 0 5pt;color:${brandSecondary};font-weight:700;text-transform:uppercase;letter-spacing:0.6pt}
  h4{font-size:11pt;margin:8pt 0 3pt;color:#0f172a;font-weight:700}
  .muted{color:${brandSecondary}}
  .micro{font-size:8.5pt;color:#94a3b8;letter-spacing:0.4pt;text-transform:uppercase;font-weight:600}
  .pill{display:inline-block;padding:2pt 7pt;border-radius:99pt;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:0.4pt}
  .pill.p1{background:#fee2e2;color:#991b1b}
  .pill.p2{background:#fef3c7;color:#92400e}
  .pill.p3{background:#dbeafe;color:#1e40af}
  .pill.high{background:#fee2e2;color:#991b1b}
  .pill.medium{background:#fef3c7;color:#92400e}
  .pill.low{background:#dbeafe;color:#1e40af}
  .pill.win{background:#dcfce7;color:#166534}
  .pill.fail{background:#fee2e2;color:#991b1b}
  .pill.brand{background:${brandPrimary};color:#fff}
  /* COVER */
  .cover-hero{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:30mm 18mm;background:linear-gradient(135deg, ${brandPrimary} 0%, ${brandPrimary}dd 100%);color:#fff;position:relative;overflow:hidden}
  .cover-hero::before{content:'';position:absolute;right:-40mm;top:-40mm;width:160mm;height:160mm;border-radius:50%;background:rgba(255,255,255,0.05)}
  .cover-hero::after{content:'';position:absolute;left:-30mm;bottom:-30mm;width:120mm;height:120mm;border-radius:50%;background:rgba(255,255,255,0.06)}
  .cover-top{display:flex;align-items:center;gap:14pt;position:relative;z-index:2}
  .cover-top img{max-height:42pt;max-width:120pt;object-fit:contain;background:rgba(255,255,255,0.1);padding:6pt;border-radius:6pt}
  .cover-eyebrow{font-size:9pt;letter-spacing:3pt;text-transform:uppercase;opacity:0.7;font-weight:600}
  .cover-title{font-size:38pt;font-weight:800;letter-spacing:-1.5pt;line-height:0.95;margin-top:8pt;max-width:80%;position:relative;z-index:2}
  .cover-period{margin-top:8pt;font-size:14pt;opacity:0.8;font-weight:500;position:relative;z-index:2}
  .cover-hero-metric{margin-top:auto;position:relative;z-index:2}
  .cover-hero-metric .label{font-size:11pt;opacity:0.7;text-transform:uppercase;letter-spacing:1pt;font-weight:600}
  .cover-hero-metric .value{font-size:54pt;font-weight:800;letter-spacing:-2pt;line-height:1;margin-top:4pt}
  .cover-hero-metric .delta{font-size:14pt;opacity:0.85;margin-top:6pt;font-weight:600}
  .cover-meta{padding:10mm 18mm;display:flex;justify-content:space-between;align-items:center;font-size:9pt;color:${brandSecondary};border-top:2pt solid ${brandPrimary}11}
  /* KPI CARDS */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin-top:6pt}
  .kpis.kpi3{grid-template-columns:repeat(3,1fr)}
  .kpi{background:#fff;border:1pt solid #e2e8f0;border-radius:8pt;padding:10pt;box-shadow:0 1pt 2pt rgba(15,23,42,0.04)}
  .kpi .label{font-size:8.5pt;color:${brandSecondary};text-transform:uppercase;letter-spacing:0.5pt;font-weight:600}
  .kpi .value{font-size:17pt;font-weight:800;color:#0f172a;margin-top:3pt;letter-spacing:-0.5pt;line-height:1.1}
  .kpi .delta{font-size:8.5pt;margin-top:4pt;font-weight:600}
  .kpi .spark{margin-top:5pt}
  .delta.up{color:#15803d}
  .delta.down{color:#b91c1c}
  .delta.neutral{color:${brandSecondary}}
  /* TABLES */
  table{width:100%;border-collapse:collapse;margin-top:8pt;font-size:9pt;border-radius:6pt;overflow:hidden}
  th{background:${brandPrimary};color:#fff;text-align:left;padding:7pt 9pt;font-weight:700;font-size:8.5pt;text-transform:uppercase;letter-spacing:0.4pt}
  td{padding:6pt 9pt;border-bottom:1pt solid #e2e8f0;vertical-align:top}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#f8fafc}
  /* SECTION CARDS */
  .panel{background:#fff;border:1pt solid #e2e8f0;border-radius:8pt;padding:12pt;margin-top:8pt;box-shadow:0 1pt 2pt rgba(15,23,42,0.03)}
  .panel-row{display:grid;grid-template-columns:1fr 1fr;gap:10pt;margin-top:8pt}
  /* INSIGHTS */
  .narrative{background:linear-gradient(135deg, ${brandPrimary}08 0%, ${brandPrimary}03 100%);border-left:3pt solid ${brandPrimary};padding:12pt 14pt;border-radius:0 8pt 8pt 0;font-size:10.5pt;line-height:1.6;color:#1e293b;font-weight:500}
  .alerts-grid{display:grid;grid-template-columns:1fr 1fr;gap:8pt;margin-top:6pt}
  .alert-card{padding:10pt;border-radius:6pt;border:1pt solid #e2e8f0;background:#fff}
  .alert-card.high{border-left:3pt solid #dc2626}
  .alert-card.medium{border-left:3pt solid #d97706}
  .alert-card.low{border-left:3pt solid #2563eb}
  .alert-card .title{font-weight:700;font-size:10pt;color:#0f172a;margin-top:3pt}
  .alert-card .detail{font-size:9pt;color:${brandSecondary};margin-top:3pt;line-height:1.5}
  /* HEALTH SCORE */
  .health-grid{display:grid;grid-template-columns:280pt 1fr;gap:14pt;align-items:center;margin-top:6pt}
  .health-list{display:grid;grid-template-columns:1fr;gap:5pt}
  .health-item{display:grid;grid-template-columns:90pt 1fr 30pt;align-items:center;gap:8pt;padding:5pt 0}
  .health-item .dim{font-size:9.5pt;font-weight:600;color:#0f172a}
  .health-item .reason{font-size:8.5pt;color:${brandSecondary};font-weight:500;line-height:1.4}
  .health-item .score{font-size:11pt;font-weight:800;color:${brandPrimary};text-align:right}
  /* ACTION PLAN */
  .action-list{display:flex;flex-direction:column;gap:6pt;margin-top:6pt}
  .action-card{display:grid;grid-template-columns:34pt 1fr;gap:10pt;padding:10pt 12pt;border:1pt solid #e2e8f0;border-radius:6pt;background:#fff}
  .action-card .num{font-size:18pt;font-weight:800;color:${brandPrimary};line-height:1}
  .action-card .body .head{display:flex;align-items:center;gap:6pt;margin-bottom:3pt}
  .action-card .body .what{font-size:10.5pt;font-weight:700;color:#0f172a}
  .action-card .body .why{font-size:9pt;color:${brandSecondary};margin-top:2pt;line-height:1.4}
  .action-card .body .meta{display:flex;gap:10pt;margin-top:5pt;font-size:8.5pt;color:${brandSecondary}}
  .action-card .body .meta strong{color:#0f172a;font-weight:700}
  /* PRODUCT THUMBS */
  .prod-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;margin-top:6pt}
  .prod-card{background:#fff;border:1pt solid #e2e8f0;border-radius:6pt;padding:8pt}
  .prod-card .title{font-size:9pt;font-weight:700;color:#0f172a;line-height:1.3}
  .prod-card .meta{font-size:8pt;color:${brandSecondary};margin-top:3pt}
  .prod-card .units{font-size:14pt;font-weight:800;color:${brandPrimary};margin-top:4pt}
  /* TWO COL */
  .twocol{display:grid;grid-template-columns:1fr 1fr;gap:14pt}
  .charttitle{font-size:9pt;color:${brandSecondary};text-transform:uppercase;letter-spacing:0.5pt;font-weight:600;margin-bottom:4pt}
  .chart-empty{font-size:9pt;color:${brandSecondary};font-style:italic;padding:10pt;text-align:center;background:#f8fafc;border-radius:4pt}
  /* FOOTER */
  .pagefooter{margin-top:auto;padding-top:8pt;border-top:1pt solid #e2e8f0;color:${brandSecondary};font-size:8.5pt;display:flex;justify-content:space-between;align-items:center}
  .pagefooter .brand{font-weight:600;color:#0f172a}
  /* EMPTY */
  .empty{color:${brandSecondary};font-style:italic;padding:6pt 0;font-size:9.5pt}
  ul.simple{padding-left:14pt;margin-top:4pt}
  ul.simple li{margin:2pt 0;font-size:9.5pt}
</style>
</head><body>
${blocks.join('\n')}
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────
// SECTION RENDERERS
// ─────────────────────────────────────────────────────────────────

function renderCoverPage(d: any, brandPrimary: string, brandSecondary: string, logoUrl: string, companyName: string, period: { from: string; to: string; days: number }, sections: string[]): string {
  // Hero metric: pick the most striking
  let heroLabel = 'Revenue del período';
  let heroValue = '—';
  let heroDelta = '';
  let heroDeltaCls = '';
  if (d.platformMetrics) {
    const cur = aggregateShopify(d.platformMetrics, period.from, period.to, d.shopifyConnIds || []);
    const prev = aggregateShopify(d.platformMetrics, d.prev.from, d.prev.to, d.shopifyConnIds || []);
    if (cur.revenue > 0 || prev.revenue > 0) {
      heroValue = fmtMoney(cur.revenue);
      const delta = pctDelta(cur.revenue, prev.revenue);
      heroDelta = `${delta.label} vs período anterior`;
      heroDeltaCls = delta.cls;
    }
  } else if (d.campaignMetrics) {
    const cur = aggregateAds(d.campaignMetrics, period.from, period.to);
    if (cur.spend > 0) {
      heroLabel = 'Inversión publicitaria';
      heroValue = fmtMoney(cur.spend);
      const roas = cur.spend > 0 ? (cur.revenue / cur.spend).toFixed(2) : 'N/A';
      heroDelta = `ROAS ${roas}x · ${cur.conversions} conversiones`;
    }
  }

  const sectionsTags = sections.map(s => `<span style="display:inline-block;padding:3pt 9pt;border-radius:99pt;background:rgba(255,255,255,0.15);color:#fff;font-size:8.5pt;font-weight:600;text-transform:uppercase;letter-spacing:0.5pt;margin:0 4pt 4pt 0">${escapeHtml(s.replace('_', ' '))}</span>`).join('');

  return `
    <div class="page cover">
      <div class="cover-hero">
        <div>
          <div class="cover-top">
            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="logo"/>` : ''}
            <div>
              <div class="cover-eyebrow">Reporte de Performance</div>
            </div>
          </div>
          <div class="cover-title">${companyName}</div>
          <div class="cover-period">${escapeHtml(period.from)} → ${escapeHtml(period.to)} · ${period.days} días</div>
          <div style="margin-top:18pt">${sectionsTags}</div>
        </div>
        <div class="cover-hero-metric">
          <div class="label">${escapeHtml(heroLabel)}</div>
          <div class="value">${heroValue}</div>
          ${heroDelta ? `<div class="delta">${escapeHtml(heroDelta)}</div>` : ''}
        </div>
      </div>
      <div class="cover-meta">
        <div>Generado por <strong style="color:${brandPrimary}">Steve 🐕</strong> · ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <div>Steve Ads · steveads.com</div>
      </div>
    </div>
  `;
}

function renderHealthScoreSection(insights: AIInsights, brandPrimary: string): string {
  if (!insights.healthScores || insights.healthScores.length === 0) return '';
  const radarData = insights.healthScores.map(h => ({ dimension: h.dimension, value: h.value }));
  const overallScore = Math.round(insights.healthScores.reduce((acc, h) => acc + h.value, 0) / insights.healthScores.length);
  const healthList = insights.healthScores.map(h => `
    <div class="health-item">
      <div class="dim">${escapeHtml(h.dimension)}</div>
      <div>
        ${progressBarSvg(h.value, 100, { color: h.value >= 70 ? '#15803d' : h.value >= 40 ? '#d97706' : '#dc2626', width: 200 })}
        <div class="reason" style="margin-top:3pt">${escapeHtml(h.reason)}</div>
      </div>
      <div class="score">${Math.round(h.value)}</div>
    </div>
  `).join('');
  return `
    <div class="page">
      <h2>Diagnóstico de Salud</h2>
      <p class="muted" style="margin-top:4pt;font-size:9.5pt">Score general: <strong style="color:${brandPrimary};font-size:14pt">${overallScore}/100</strong> — promedio de las dimensiones evaluadas.</p>
      <div class="panel">
        <div class="health-grid">
          <div>${radarSvg(radarData, { size: 280, max: 100, color: brandPrimary })}</div>
          <div class="health-list">${healthList}</div>
        </div>
      </div>
      ${renderFooterInline()}
    </div>
  `;
}

function renderExecSummarySection(d: any, sections: string[], brandPrimary: string): string {
  const insights = d.aiInsights as AIInsights | null;
  let narrative = '';
  let alertsHtml = '';

  if (insights?.narrative) {
    narrative = `<div class="narrative">🐕 ${escapeHtml(insights.narrative)}</div>`;
  } else {
    narrative = `<div class="narrative">Resumen del período ${escapeHtml(d.period.from)} → ${escapeHtml(d.period.to)} con ${sections.length} secciones analizadas.</div>`;
  }

  if (insights?.alerts && insights.alerts.length > 0) {
    alertsHtml = `
      <h3 style="margin-top:14pt">⚠️ Alertas detectadas</h3>
      <div class="alerts-grid">
        ${insights.alerts.map(a => `
          <div class="alert-card ${a.severity}">
            <span class="pill ${a.severity}">${a.severity === 'high' ? 'CRÍTICO' : a.severity === 'medium' ? 'IMPORTANTE' : 'ATENCIÓN'}</span>
            <div class="title">${escapeHtml(a.title)}</div>
            <div class="detail">${escapeHtml(a.detail)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  let oppsHtml = '';
  if (insights?.opportunities && insights.opportunities.length > 0) {
    oppsHtml = `
      <h3 style="margin-top:14pt">💡 Oportunidades</h3>
      <div class="alerts-grid">
        ${insights.opportunities.map(o => `
          <div class="alert-card low">
            <span class="pill low">OPORTUNIDAD</span>
            <div class="title">${escapeHtml(o.title)}</div>
            <div class="detail">${escapeHtml(o.detail)}<br/><strong style="color:#0f172a">Impacto: ${escapeHtml(o.impact)}</strong></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div class="page">
      <h2>Resumen ejecutivo</h2>
      ${narrative}
      ${alertsHtml}
      ${oppsHtml}
      ${renderFooterInline()}
    </div>
  `;
}

function renderShopifySection(d: any, brandPrimary: string, brandSecondary: string): string {
  const cur = aggregateShopify(d.platformMetrics || [], d.period.from, d.period.to, d.shopifyConnIds || []);
  const prev = aggregateShopify(d.platformMetrics || [], d.prev.from, d.prev.to, d.shopifyConnIds || []);
  if (cur.revenue === 0 && prev.revenue === 0) {
    return `<div class="page"><h2>Shopify — Ventas</h2><p class="empty">Sin ventas registradas en el período.</p>${renderFooterInline()}</div>`;
  }
  const ticketCur = cur.orders > 0 ? cur.revenue / cur.orders : 0;
  const ticketPrev = prev.orders > 0 ? prev.revenue / prev.orders : 0;
  const dRev = pctDelta(cur.revenue, prev.revenue);
  const dOrd = pctDelta(cur.orders, prev.orders);
  const dTicket = pctDelta(ticketCur, ticketPrev);

  const dailyRev = dailySeriesShopify(d.platformMetrics || [], d.allDays, d.shopifyConnIds || [], 'revenue');
  const dailyOrd = dailySeriesShopify(d.platformMetrics || [], d.allDays, d.shopifyConnIds || [], 'orders');
  const sparkRev = sparklineSvg(dailyRev.map(x => x.value), { stroke: brandPrimary, fill: brandPrimary + '22' });
  const sparkOrd = sparklineSvg(dailyOrd.map(x => x.value), { stroke: brandPrimary, fill: brandPrimary + '22' });

  const compareItems = [
    { label: 'Revenue', current: cur.revenue, previous: prev.revenue },
    { label: 'Pedidos', current: cur.orders, previous: prev.orders },
    { label: 'Ticket prom.', current: ticketCur, previous: ticketPrev },
  ];

  return `
    <div class="page">
      <h2>Shopify — Ventas</h2>
      <div class="kpis kpi3">
        <div class="kpi">
          <div class="label">Revenue</div>
          <div class="value">${fmtMoney(cur.revenue)}</div>
          <div class="delta ${dRev.cls}">${dRev.label}</div>
          <div class="spark">${sparkRev}</div>
        </div>
        <div class="kpi">
          <div class="label">Pedidos</div>
          <div class="value">${cur.orders}</div>
          <div class="delta ${dOrd.cls}">${dOrd.label}</div>
          <div class="spark">${sparkOrd}</div>
        </div>
        <div class="kpi">
          <div class="label">Ticket promedio</div>
          <div class="value">${fmtMoney(ticketCur)}</div>
          <div class="delta ${dTicket.cls}">${dTicket.label}</div>
        </div>
      </div>

      <h3>Evolución diaria de ventas</h3>
      <div class="panel">
        <div class="charttitle">Revenue diario en CLP</div>
        ${lineChartSvg(dailyRev, { stroke: brandPrimary, fill: brandPrimary + '15', yFormat: fmtMoneyShort })}
      </div>

      <h3>Comparación con período anterior</h3>
      <div class="panel">
        <div style="display:flex;gap:14pt;font-size:8.5pt;color:${brandSecondary};margin-bottom:8pt">
          <span><span style="display:inline-block;width:10pt;height:8pt;background:#cbd5e1;border-radius:2pt;margin-right:4pt"></span>Período anterior (${escapeHtml(d.prev.from)} → ${escapeHtml(d.prev.to)})</span>
          <span><span style="display:inline-block;width:10pt;height:8pt;background:${brandPrimary};border-radius:2pt;margin-right:4pt"></span>Período actual (${escapeHtml(d.period.from)} → ${escapeHtml(d.period.to)})</span>
        </div>
        ${barChartCompareSvg(compareItems, { colorCurr: brandPrimary, format: (n: number) => n > 1000 ? fmtMoneyShort(n) : fmtNum(n) })}
      </div>
      ${renderFooterInline()}
    </div>
  `;
}

function renderTopProductsSection(d: any, brandPrimary: string): string {
  const tp = d.topProducts || [];
  const fetched = d.shopifyOrders?.length ?? null;

  if (tp.length === 0) {
    let msg = '';
    if (fetched === null) {
      msg = 'No pudimos consultar tus pedidos en Shopify durante el período. Posibles causas: el token de la conexión expiró o faltan permisos (read_orders).';
    } else if (fetched === 0) {
      msg = `Tu Shopify respondió correctamente pero no había pedidos en el período (${escapeHtml(d.period.from)} → ${escapeHtml(d.period.to)}).`;
    } else {
      msg = `Recibimos ${fetched} pedidos del período pero ninguno tenía estado financiero válido (paid/pending/authorized). Revisar pagos manuales o pendientes en tu Shopify Admin.`;
    }
    return `
      <div class="page">
        <h2>Top productos vendidos</h2>
        <p class="muted" style="margin-top:4pt;font-size:10pt">${msg}</p>
        ${renderFooterInline()}
      </div>
    `;
  }

  const top = tp.slice(0, 9);
  const totalUnits = tp.reduce((acc: number, p: any) => acc + p.units, 0);
  const totalRev = tp.reduce((acc: number, p: any) => acc + p.revenue, 0);
  const cards = top.map((p: any, i: number) => `
    <div class="prod-card">
      <span class="pill brand">#${i + 1}</span>
      <div class="title" style="margin-top:4pt">${escapeHtml(String(p.title).slice(0, 60))}</div>
      <div class="meta">${p.sku ? `SKU: ${escapeHtml(p.sku)}` : 'Sin SKU'}</div>
      <div class="units">${p.units} <span style="font-size:9pt;color:${brandPrimary};font-weight:500">unidades</span></div>
      <div class="meta" style="margin-top:2pt">${fmtMoney(p.revenue)} en revenue</div>
    </div>
  `).join('');
  return `
    <div class="page">
      <h2>Top productos vendidos</h2>
      <p class="muted" style="margin-top:4pt;font-size:9.5pt">Datos extraídos de tus pedidos pagados en Shopify durante el período. Total: <strong style="color:${brandPrimary}">${totalUnits}</strong> unidades por <strong style="color:${brandPrimary}">${fmtMoney(totalRev)}</strong>.</p>
      <div class="prod-grid">${cards}</div>
      ${renderFooterInline()}
    </div>
  `;
}

function renderAdsSection(d: any, brandPrimary: string, brandSecondary: string): string {
  const cur = aggregateAds(d.campaignMetrics || [], d.period.from, d.period.to);
  const prev = aggregateAds(d.campaignMetrics || [], d.prev.from, d.prev.to);
  if (cur.spend === 0 && prev.spend === 0) {
    return `<div class="page"><h2>Publicidad — Meta + Google</h2><p class="empty">Sin gasto publicitario en el período.</p>${renderFooterInline()}</div>`;
  }
  const roas = cur.spend > 0 ? (cur.revenue / cur.spend) : 0;
  const roasPrev = prev.spend > 0 ? (prev.revenue / prev.spend) : 0;
  const ctr = cur.impressions > 0 ? (cur.clicks / cur.impressions) * 100 : 0;
  const cpa = cur.conversions > 0 ? cur.spend / cur.conversions : 0;
  const dSpend = pctDelta(cur.spend, prev.spend);
  const dRoas = roasPrev > 0 ? pctDelta(roas, roasPrev) : { label: 'N/A', cls: 'neutral' };
  const dConv = pctDelta(cur.conversions, prev.conversions);

  const dailySpend = dailySeriesAds(d.campaignMetrics || [], d.allDays, 'spend');
  const dailyRevAds = dailySeriesAds(d.campaignMetrics || [], d.allDays, 'conversion_value');
  const sparkSpend = sparklineSvg(dailySpend.map(x => x.value), { stroke: brandPrimary, fill: brandPrimary + '22' });
  const sparkConv = sparklineSvg(dailySeriesAds(d.campaignMetrics || [], d.allDays, 'conversions').map(x => x.value), { stroke: brandPrimary, fill: brandPrimary + '22' });

  // Top campaigns
  const byCampaign: Record<string, any> = {};
  for (const m of (d.campaignMetrics || [])) {
    if (m.metric_date < d.period.from || m.metric_date > d.period.to) continue;
    const name = m.campaign_name || 'Sin nombre';
    if (!byCampaign[name]) byCampaign[name] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, status: m.campaign_status || 'UNKNOWN' };
    byCampaign[name].spend += Number(m.spend) || 0;
    byCampaign[name].impressions += Number(m.impressions) || 0;
    byCampaign[name].clicks += Number(m.clicks) || 0;
    byCampaign[name].conversions += Number(m.conversions) || 0;
    byCampaign[name].revenue += Number(m.conversion_value) || 0;
  }
  const sortedCamps = Object.entries(byCampaign).sort(([, a]: any, [, b]: any) => b.spend - a.spend);
  const top5 = sortedCamps.slice(0, 5);
  const rows = top5.map(([name, x]: any) => {
    const cRoas = x.spend > 0 ? (x.revenue / x.spend).toFixed(2) : '0';
    const cCtr = x.impressions > 0 ? ((x.clicks / x.impressions) * 100).toFixed(2) : '0';
    const cCpa = x.conversions > 0 ? Math.round(x.spend / x.conversions).toLocaleString('es-CL') : '∞';
    const statusBadge = x.status === 'ACTIVE' ? 'win' : 'low';
    return `<tr>
      <td><strong>${escapeHtml(String(name).slice(0, 50))}</strong> <span class="pill ${statusBadge}">${x.status}</span></td>
      <td>${fmtMoney(x.spend)}</td>
      <td>${cRoas}x</td>
      <td>${cCtr}%</td>
      <td>$${cCpa}</td>
      <td>${x.conversions}</td>
    </tr>`;
  }).join('');

  return `
    <div class="page">
      <h2>Publicidad — Meta + Google</h2>
      <div class="kpis">
        <div class="kpi">
          <div class="label">Inversión</div>
          <div class="value">${fmtMoney(cur.spend)}</div>
          <div class="delta ${dSpend.cls}">${dSpend.label}</div>
          <div class="spark">${sparkSpend}</div>
        </div>
        <div class="kpi">
          <div class="label">ROAS</div>
          <div class="value">${roas.toFixed(2)}x</div>
          <div class="delta ${dRoas.cls}">${dRoas.label}</div>
        </div>
        <div class="kpi">
          <div class="label">CTR</div>
          <div class="value">${ctr.toFixed(2)}%</div>
          <div class="delta neutral">${fmtNum(cur.clicks)} clicks</div>
        </div>
        <div class="kpi">
          <div class="label">Conversiones</div>
          <div class="value">${cur.conversions}</div>
          <div class="delta ${dConv.cls}">${dConv.label}</div>
          <div class="spark">${sparkConv}</div>
        </div>
      </div>

      <h3>Evolución diaria de spend</h3>
      <div class="panel">
        <div class="charttitle">Gasto diario en CLP</div>
        ${lineChartSvg(dailySpend, { stroke: brandPrimary, fill: brandPrimary + '15', yFormat: fmtMoneyShort })}
      </div>

      ${rows ? `<h3>Top 5 campañas por inversión</h3>
      <table>
        <thead><tr><th>Campaña</th><th>Gasto</th><th>ROAS</th><th>CTR</th><th>CPA</th><th>Conv</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : ''}
      ${renderFooterInline()}
    </div>
  `;
}

function renderCreativosSection(d: any, brandPrimary: string): string {
  const cr = d.creatives || [];
  if (cr.length === 0) return `<div class="page"><h2>Creativos — Performance</h2><p class="empty">Sin creativos analizados.</p>${renderFooterInline()}</div>`;
  const top = cr.slice(0, 5);
  const bottom = cr.length > 5 ? cr.slice(-3) : [];

  const renderRow = (c: any) => {
    const verdict = (c.performance_verdict || '').toLowerCase();
    const badge = verdict.includes('win') || verdict.includes('top') ? 'win' : verdict.includes('fatig') || verdict.includes('low') ? 'fail' : 'medium';
    const metrics = c.channel === 'klaviyo'
      ? `OR ${c.klaviyo_open_rate ? (c.klaviyo_open_rate * 100).toFixed(1) + '%' : '—'} · CR ${c.klaviyo_click_rate ? (c.klaviyo_click_rate * 100).toFixed(1) + '%' : '—'}`
      : `CTR ${c.meta_ctr ? (c.meta_ctr * 100).toFixed(2) + '%' : '—'} · ROAS ${c.meta_roas?.toFixed(2) || '—'}`;
    return `<tr>
      <td><strong>${escapeHtml(String(c.theme || c.content_summary || 'Sin título').slice(0, 55))}</strong> <span class="pill ${badge}">${escapeHtml(c.performance_verdict || '?')}</span></td>
      <td>${escapeHtml(c.channel || '—')}/${escapeHtml(c.type || '—')}</td>
      <td>${c.performance_score != null ? c.performance_score : '—'}</td>
      <td>${metrics}</td>
    </tr>`;
  };

  const topRows = top.map(renderRow).join('');
  const botRows = bottom.map(renderRow).join('');

  return `
    <div class="page">
      <h2>Creativos — Performance</h2>
      <h3>🏆 Top performers</h3>
      <table><thead><tr><th>Creativo</th><th>Canal/Tipo</th><th>Score</th><th>Métricas</th></tr></thead><tbody>${topRows}</tbody></table>
      ${botRows ? `<h3 style="margin-top:14pt">📉 Underperformers (revisar)</h3>
      <table><thead><tr><th>Creativo</th><th>Canal/Tipo</th><th>Score</th><th>Métricas</th></tr></thead><tbody>${botRows}</tbody></table>` : ''}
      ${renderFooterInline()}
    </div>
  `;
}

function renderEmailSection(d: any, brandPrimary: string, brandSecondary: string): string {
  const ev = d.emailEvents || [];
  const camps = d.emailCampaigns || [];
  if (ev.length === 0 && camps.length === 0) {
    return `<div class="page"><h2>Email — Klaviyo</h2><p class="empty">Sin actividad de email.</p>${renderFooterInline()}</div>`;
  }
  const opens = ev.filter((e: any) => e.event_type === 'open' || e.event_type === 'opened').length;
  const clicks = ev.filter((e: any) => e.event_type === 'click' || e.event_type === 'clicked').length;
  const bounces = ev.filter((e: any) => e.event_type === 'bounce' || e.event_type === 'bounced').length;
  const unsubs = ev.filter((e: any) => e.event_type === 'unsubscribe' || e.event_type === 'unsubscribed').length;
  const ctor = opens > 0 ? ((clicks / opens) * 100).toFixed(1) : '0';

  const dailyOpens = dailySeriesEmail(ev, d.allDays, 'open');
  const dailyClicks = dailySeriesEmail(ev, d.allDays, 'click');

  const rows = camps.slice(0, 8).map((cmp: any) => {
    const sent = cmp.sent_count || 0;
    const total = cmp.total_recipients || 0;
    const date = cmp.sent_at ? new Date(cmp.sent_at).toLocaleDateString('es-CL') : '?';
    return `<tr><td>${date}</td><td>${escapeHtml(String(cmp.subject || cmp.name || '').slice(0, 70))}</td><td>${fmtNum(sent)}/${fmtNum(total)}</td></tr>`;
  }).join('');

  return `
    <div class="page">
      <h2>Email — Klaviyo</h2>
      <div class="kpis">
        <div class="kpi">
          <div class="label">Opens</div>
          <div class="value">${fmtNum(opens)}</div>
          <div class="spark">${sparklineSvg(dailyOpens.map(x => x.value), { stroke: brandPrimary, fill: brandPrimary + '22' })}</div>
        </div>
        <div class="kpi">
          <div class="label">Clicks</div>
          <div class="value">${fmtNum(clicks)}</div>
          <div class="delta neutral">CTOR ${ctor}%</div>
          <div class="spark">${sparklineSvg(dailyClicks.map(x => x.value), { stroke: brandPrimary, fill: brandPrimary + '22' })}</div>
        </div>
        <div class="kpi"><div class="label">Bounces</div><div class="value">${bounces}</div></div>
        <div class="kpi"><div class="label">Unsubs</div><div class="value">${unsubs}</div></div>
      </div>
      ${rows ? `<h3>Campañas enviadas</h3>
      <table><thead><tr><th>Fecha</th><th>Subject / Nombre</th><th>Enviados</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${d.emailSubsCount ? `<p style="margin-top:8pt;color:${brandSecondary};font-size:9.5pt">Lista total: <strong style="color:#0f172a">${fmtNum(d.emailSubsCount)}</strong> suscriptores</p>` : ''}
      ${renderFooterInline()}
    </div>
  `;
}

function renderCohortSection(d: any, brandPrimary: string): string {
  const co = d.cohort;
  if (!co || co.totalSubs === 0) return '';
  const newOnes = co.totalSubs - co.repeatCount;
  const donut = donutSvg([
    { label: 'Repeat', value: co.repeatCount, color: brandPrimary },
    { label: 'Solo 1 compra / 0 compras', value: newOnes, color: '#cbd5e1' },
  ], { size: 160, thickness: 28, centerLabel: `${co.repeatRate}%` });
  const topRows = co.topSpenders.map((s: any, i: number) => `
    <tr><td>#${i + 1}</td><td>${s.orders} pedidos</td><td>${fmtMoney(s.spent)}</td></tr>
  `).join('');
  return `
    <div class="page">
      <h2>Análisis de Cohorte</h2>
      <p class="muted" style="margin-top:4pt;font-size:9.5pt">Análisis de tu base de clientes basado en datos sincronizados de tu lista de Klaviyo.</p>
      <div class="kpis kpi3">
        <div class="kpi"><div class="label">Suscriptores</div><div class="value">${fmtNum(co.totalSubs)}</div></div>
        <div class="kpi"><div class="label">Repeat customers</div><div class="value">${fmtNum(co.repeatCount)}</div><div class="delta neutral">${co.repeatRate}% repeat rate</div></div>
        <div class="kpi"><div class="label">LTV promedio</div><div class="value">${fmtMoney(co.avgLtv)}</div><div class="delta neutral">Por cliente con compra</div></div>
      </div>
      <div class="twocol" style="margin-top:8pt">
        <div class="panel">
          <div class="charttitle">Distribución repeat vs single</div>
          <div style="text-align:center">${donut}</div>
        </div>
        <div class="panel">
          <div class="charttitle">Top 5 clientes por gasto</div>
          ${topRows ? `<table style="margin-top:4pt"><thead><tr><th>#</th><th>Pedidos</th><th>Total gastado</th></tr></thead><tbody>${topRows}</tbody></table>` : '<p class="empty">Sin datos de top spenders.</p>'}
        </div>
      </div>
      ${renderFooterInline()}
    </div>
  `;
}

function renderWaSection(d: any, brandPrimary: string): string {
  const wa = d.waMessages || [];
  if (wa.length === 0) return `<div class="page"><h2>WhatsApp</h2><p class="empty">Sin actividad de WhatsApp en el período.</p>${renderFooterInline()}</div>`;
  const inbound = wa.filter((m: any) => m.direction === 'inbound').length;
  const outbound = wa.filter((m: any) => m.direction === 'outbound').length;
  const uniq = new Set(wa.map((m: any) => m.contact_phone || m.contact_name).filter(Boolean)).size;

  let sentimentBlock = '';
  if (d.waSentiment) {
    const s = d.waSentiment;
    const segments = [
      { label: 'COMPRA', value: s.byCategory.COMPRA || 0, color: '#15803d' },
      { label: 'CONSULTA', value: s.byCategory.CONSULTA || 0, color: brandPrimary },
      { label: 'QUEJA', value: s.byCategory.QUEJA || 0, color: '#dc2626' },
      { label: 'SPAM', value: s.byCategory.SPAM || 0, color: '#94a3b8' },
      { label: 'OTRO', value: s.byCategory.OTRO || 0, color: '#cbd5e1' },
    ];
    const legend = segments.filter(seg => seg.value > 0).map(seg => `
      <div style="display:flex;align-items:center;gap:6pt;font-size:9pt;margin:3pt 0">
        <span style="display:inline-block;width:10pt;height:10pt;background:${seg.color};border-radius:2pt"></span>
        <strong>${seg.label}</strong>: ${seg.value}
      </div>
    `).join('');
    const samples = (s.samples || []).slice(0, 4).map((sm: any) => `
      <div style="padding:5pt 8pt;background:#f8fafc;border-radius:4pt;margin:3pt 0">
        <span class="pill ${sm.category === 'COMPRA' ? 'win' : sm.category === 'QUEJA' ? 'fail' : sm.category === 'CONSULTA' ? 'low' : 'medium'}">${escapeHtml(sm.category)}</span>
        <span style="font-size:9pt;color:#475569;margin-left:6pt">"${escapeHtml(sm.body)}"</span>
      </div>
    `).join('');
    sentimentBlock = `
      <h3>Análisis de sentimiento (últimos ${s.total} mensajes inbound)</h3>
      <div class="twocol">
        <div class="panel">
          <div class="charttitle">Distribución por intención</div>
          <div style="text-align:center;margin:6pt 0">${donutSvg(segments, { size: 150, thickness: 24, centerLabel: `${s.total}` })}</div>
          ${legend}
        </div>
        <div class="panel">
          <div class="charttitle">Ejemplos clasificados</div>
          ${samples || '<p class="empty">Sin ejemplos.</p>'}
        </div>
      </div>
    `;
  }

  return `
    <div class="page">
      <h2>WhatsApp</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Mensajes</div><div class="value">${wa.length}</div></div>
        <div class="kpi"><div class="label">Entrantes</div><div class="value">${inbound}</div></div>
        <div class="kpi"><div class="label">Salientes</div><div class="value">${outbound}</div></div>
        <div class="kpi"><div class="label">Contactos únicos</div><div class="value">${uniq}</div></div>
      </div>
      ${sentimentBlock}
      ${renderFooterInline()}
    </div>
  `;
}

function renderAbandonedSection(d: any, brandPrimary: string): string {
  const ab = (d.abandoned || []).filter((x: any) => !x.order_completed);
  if (ab.length === 0) return `<div class="page"><h2>Carritos Abandonados</h2><p class="empty">Sin carritos abandonados en el período.</p>${renderFooterInline()}</div>`;
  const total = ab.reduce((acc: number, x: any) => acc + (Number(x.total_price) || 0), 0);
  const withPhone = ab.filter((x: any) => x.customer_phone).length;
  const withEmail = ab.filter((x: any) => x.customer_email).length;
  const rows = ab.slice(0, 12).map((co: any) => {
    const date = new Date(co.created_at).toLocaleDateString('es-CL');
    const items = (co.line_items || []).slice(0, 2).map((li: any) => li.title).join(', ');
    const channel = co.customer_phone ? '📱 WA' : co.customer_email ? '📧 Email' : '👻 Sin canal';
    return `<tr><td>${date}</td><td>${escapeHtml(String(co.customer_name || 'Anónimo').slice(0, 30))}</td><td>${fmtMoney(Number(co.total_price) || 0)}</td><td>${escapeHtml(String(items).slice(0, 50))}</td><td>${channel}</td></tr>`;
  }).join('');
  return `
    <div class="page">
      <h2>Carritos Abandonados</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Carritos</div><div class="value">${ab.length}</div></div>
        <div class="kpi"><div class="label">Revenue pendiente</div><div class="value">${fmtMoney(total)}</div></div>
        <div class="kpi"><div class="label">Recuperables WA</div><div class="value">${withPhone}</div></div>
        <div class="kpi"><div class="label">Recuperables Email</div><div class="value">${withEmail}</div></div>
      </div>
      <table style="margin-top:10pt"><thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Productos</th><th>Canal</th></tr></thead><tbody>${rows}</tbody></table>
      ${renderFooterInline()}
    </div>
  `;
}

function renderCatalogoSection(d: any, brandPrimary: string): string {
  const prods = d.products || [];
  if (prods.length === 0) return `<div class="page"><h2>Catálogo Shopify</h2><p class="empty">Sin productos sincronizados.</p>${renderFooterInline()}</div>`;
  const minPrice = Math.min(...prods.map((p: any) => Number(p.price_min) || Infinity));
  const maxPrice = Math.max(...prods.map((p: any) => Number(p.price_max) || 0));
  const sinStock = prods.filter((p: any) => p.inventory_total === 0).length;
  const rows = prods.slice(0, 18).map((p: any) => {
    const stock = p.inventory_total === -1 ? '—' : p.inventory_total === 0 ? '<span class="pill fail">SIN STOCK</span>' : `${p.inventory_total} u.`;
    const price = p.price_min === p.price_max ? fmtMoney(Number(p.price_min)) : `${fmtMoney(Number(p.price_min))}-${fmtMoney(Number(p.price_max))}`;
    return `<tr><td>${escapeHtml(String(p.title || '').slice(0, 60))}</td><td>${escapeHtml(p.product_type || '—')}</td><td>${price}</td><td>${stock}</td></tr>`;
  }).join('');
  return `
    <div class="page">
      <h2>Catálogo Shopify</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Productos activos</div><div class="value">${prods.length}+</div></div>
        <div class="kpi"><div class="label">Precio mínimo</div><div class="value">${fmtMoney(minPrice)}</div></div>
        <div class="kpi"><div class="label">Precio máximo</div><div class="value">${fmtMoney(maxPrice)}</div></div>
        <div class="kpi"><div class="label">Sin stock</div><div class="value" style="color:${sinStock > 0 ? '#dc2626' : '#0f172a'}">${sinStock}</div></div>
      </div>
      <table style="margin-top:10pt"><thead><tr><th>Producto</th><th>Tipo</th><th>Precio</th><th>Stock</th></tr></thead><tbody>${rows}</tbody></table>
      ${renderFooterInline()}
    </div>
  `;
}

function renderCompetenciaSection(d: any, brandPrimary: string): string {
  const tracking = d.competitorTracking || [];
  const ads = d.competitorAds || [];
  if (tracking.length === 0 && ads.length === 0) {
    return `<div class="page"><h2>Competencia</h2><p class="empty">Sin competidores monitoreados o sin ads detectados.</p>${renderFooterInline()}</div>`;
  }
  const compNames = tracking.map((c: any) => escapeHtml(c.display_name || c.ig_handle || '')).filter(Boolean).join(', ');
  const adsRows = ads.slice(0, 10).map((ad: any) => {
    const headline = String(ad.ad_headline || ad.ad_text || '').slice(0, 100);
    const platforms = (ad.platforms || []).join(', ') || 'meta';
    return `<tr><td>${escapeHtml(headline)}</td><td>${ad.days_running || 0}d</td><td>${escapeHtml(platforms)}</td></tr>`;
  }).join('');
  return `
    <div class="page">
      <h2>Competencia</h2>
      ${compNames ? `<p style="margin-top:4pt;font-size:9.5pt"><strong>Monitoreando:</strong> ${compNames}</p>` : ''}
      ${adsRows ? `<h3>Ads activos detectados</h3><table><thead><tr><th>Anuncio</th><th>Días corriendo</th><th>Plataformas</th></tr></thead><tbody>${adsRows}</tbody></table>` : '<p class="empty">Sin ads activos detectados.</p>'}
      ${renderFooterInline()}
    </div>
  `;
}

function renderCriterioSection(d: any, brandPrimary: string): string {
  const cri = d.criterio || [];
  if (cri.length === 0) return `<div class="page"><h2>Diagnóstico Criterio</h2><p class="empty">✅ Sin reglas Criterio rotas en el período.</p>${renderFooterInline()}</div>`;
  const rows = cri.slice(0, 14).map((f: any) => {
    const date = new Date(f.evaluated_at).toLocaleDateString('es-CL');
    return `<tr><td>${date}</td><td>${escapeHtml(f.entity_type || '—')}</td><td>${escapeHtml(String(f.actual_value).slice(0, 40))}</td><td>${escapeHtml(String(f.expected_value).slice(0, 40))}</td></tr>`;
  }).join('');
  return `
    <div class="page">
      <h2>Diagnóstico Criterio — Reglas no cumplidas</h2>
      <p class="muted" style="font-size:9.5pt">${cri.length} reglas detectaron desviaciones que requieren atención.</p>
      <table style="margin-top:8pt"><thead><tr><th>Fecha</th><th>Entidad</th><th>Valor actual</th><th>Esperado</th></tr></thead><tbody>${rows}</tbody></table>
      ${renderFooterInline()}
    </div>
  `;
}

function renderActionPlanSection(insights: AIInsights, brandPrimary: string): string {
  const plan = insights.actionPlan || [];
  if (plan.length === 0) return '';
  const cards = plan.map((p, i) => `
    <div class="action-card">
      <div class="num">${i + 1}</div>
      <div class="body">
        <div class="head">
          <span class="pill ${p.priority.toLowerCase()}">${p.priority}</span>
          <span style="font-size:8.5pt;color:#475569;font-weight:600">${escapeHtml(p.owner || '')}</span>
        </div>
        <div class="what">${escapeHtml(p.action)}</div>
        <div class="why">${escapeHtml(p.reason)}</div>
        <div class="meta">
          <span>📈 Impacto: <strong>${escapeHtml(p.impact)}</strong></span>
          <span>📅 Para: <strong>${escapeHtml(p.deadline)}</strong></span>
        </div>
      </div>
    </div>
  `).join('');
  return `
    <div class="page">
      <h2>Plan de acción priorizado</h2>
      <p class="muted" style="font-size:9.5pt">Recomendaciones generadas por Steve a partir del análisis cruzado de toda tu data del período. Ordenadas por prioridad.</p>
      <div class="action-list">${cards}</div>
      ${renderFooterInline()}
    </div>
  `;
}

function renderFooterInline(): string {
  return `<div class="pagefooter"><div class="brand">Steve Ads · Reporte de Performance</div><div>Generado ${new Date().toLocaleDateString('es-CL')}</div></div>`;
}

function renderFooter(companyName: string, period: { from: string; to: string; days: number }, brandSecondary: string): string {
  return `
    <div class="page" style="display:flex;align-items:center;justify-content:center;text-align:center;padding:50mm 18mm">
      <div>
        <div style="font-size:24pt;font-weight:800;color:#0f172a;letter-spacing:-1pt">Gracias por confiar en Steve 🐕</div>
        <div style="font-size:12pt;color:${brandSecondary};margin-top:14pt;line-height:1.6">
          Este reporte fue generado para <strong>${companyName}</strong><br/>
          Período: ${escapeHtml(period.from)} → ${escapeHtml(period.to)} (${period.days} días)<br/>
          ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div style="margin-top:30pt;font-size:10pt;color:${brandSecondary}">
          Powered by <strong style="color:#0f172a">Steve Ads</strong> · Tu agencia de marketing AI 24/7
        </div>
      </div>
    </div>
  `;
}
