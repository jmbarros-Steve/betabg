import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Strategy Report — generates a branded PDF report for a client.
 *
 * Endpoint: POST /api/strategy-report
 *   Body: { client_id, from, to, temas: string[] }
 *   Auth: X-Cron-Secret | internal | JWT user owner
 *
 * Returns: { url, filename, sections }
 *
 * Available temas:
 *   ads_meta, ads_google, shopify, email, whatsapp,
 *   abandoned, competencia, creativos, catalogo, criterio, all
 */

const VALID_TEMAS = new Set([
  'ads_meta', 'ads_google', 'shopify', 'email', 'whatsapp',
  'abandoned', 'competencia', 'creativos', 'catalogo', 'criterio', 'all',
]);

interface ReportPayload {
  client_id: string;
  from: string;  // ISO date YYYY-MM-DD
  to: string;    // ISO date YYYY-MM-DD
  temas: string[];
}

async function launchBrowser() {
  const puppeteer = await import(/* webpackIgnore: true */ 'puppeteer' as string) as any;
  const launcher = puppeteer.default || puppeteer;
  // Per-launch unique writable dirs under /tmp (writable for non-root user).
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
    env: {
      ...process.env,
      HOME: '/tmp',
      XDG_CONFIG_HOME: '/tmp/.config',
      XDG_CACHE_HOME: '/tmp/.cache',
    },
    dumpio: false,
  });
}

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any
  )[c]);
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

function pctDelta(curr: number, prev: number): { label: string; cls: string } {
  if (prev <= 0) return { label: 'N/A', cls: 'neutral' };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral';
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '→';
  return { label: `${arrow} ${sign}${pct.toFixed(1)}%`, cls };
}

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

    if (!client_id || !from || !to) {
      return c.json({ error: 'client_id, from, to required' }, 400);
    }
    if (temas.length === 0) temas = ['all'];

    // Validate dates
    const fromDate = new Date(from + 'T00:00:00.000Z');
    const toDate = new Date(to + 'T23:59:59.999Z');
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      return c.json({ error: 'Invalid date range' }, 400);
    }

    const dayMs = 86400000;
    const days = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / dayMs));
    // Previous equivalent period: ends day before `from`, lasts same number of days
    const prevToDate = new Date(fromDate.getTime() - 1);
    const prevFromDate = new Date(prevToDate.getTime() - days * dayMs);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr = toDate.toISOString().slice(0, 10);
    const prevFromStr = prevFromDate.toISOString().slice(0, 10);
    const prevToStr = prevToDate.toISOString().slice(0, 10);

    // Load client + branding
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, name, company, shop_domain, logo_url, brand_color, brand_secondary_color, brand_font, fase_negocio, user_id, client_user_id')
      .eq('id', client_id)
      .single();
    if (clientErr || !client) {
      return c.json({ error: 'Client not found' }, 404);
    }

    // Auth: only owner or super admin (skip if cron/internal)
    if (!isCron && !isInternal) {
      const userId = user?.id;
      if (client.user_id !== userId && client.client_user_id !== userId) {
        // Allow super admin
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('is_super_admin')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle();
        if (!roleRow?.is_super_admin) {
          return c.json({ error: 'Forbidden' }, 403);
        }
      }
    }

    // Connections
    const { data: connections } = await supabase
      .from('platform_connections')
      .select('id, platform')
      .eq('client_id', client_id)
      .eq('is_active', true);
    const connIds = (connections || []).map((c: any) => c.id);
    const shopifyConnIds = (connections || []).filter((c: any) => c.platform === 'shopify').map((c: any) => c.id);

    const wants = (t: string) => temas.includes('all') || temas.includes(t);

    // === COLLECT DATA (queries are conditional based on temas) ===
    const sectionsToInclude: string[] = [];
    const data: any = { client, period: { from: fromStr, to: toStr, days }, prev: { from: prevFromStr, to: prevToStr } };

    // Shopify metrics
    if ((wants('shopify') || wants('ads_meta') || wants('ads_google')) && connIds.length > 0) {
      const { data: pm } = await supabase
        .from('platform_metrics')
        .select('metric_type, metric_value, metric_date, connection_id')
        .in('connection_id', connIds)
        .gte('metric_date', prevFromStr)
        .lte('metric_date', toStr)
        .limit(2000);
      data.platformMetrics = pm || [];
    }
    if (wants('shopify')) sectionsToInclude.push('shopify');

    // Campaign metrics (Meta + Google)
    if ((wants('ads_meta') || wants('ads_google')) && connIds.length > 0) {
      const { data: cm } = await supabase
        .from('campaign_metrics')
        .select('campaign_name, campaign_status, spend, impressions, clicks, conversions, conversion_value, metric_date, connection_id')
        .in('connection_id', connIds)
        .gte('metric_date', prevFromStr)
        .lte('metric_date', toStr)
        .limit(2000);
      data.campaignMetrics = cm || [];
      if (wants('ads_meta')) sectionsToInclude.push('ads_meta');
      if (wants('ads_google')) sectionsToInclude.push('ads_google');
    }

    // Email
    if (wants('email')) {
      const [{ data: ev }, { data: camps }, { data: subs }] = await Promise.all([
        supabase.from('email_events').select('event_type, campaign_id, created_at').eq('client_id', client_id).gte('created_at', fromStr).lte('created_at', toStr + 'T23:59:59').limit(5000),
        supabase.from('email_campaigns').select('name, subject, sent_count, total_recipients, sent_at, status').eq('client_id', client_id).eq('status', 'sent').gte('sent_at', fromStr).lte('sent_at', toStr + 'T23:59:59').order('sent_at', { ascending: false }).limit(20),
        supabase.from('email_subscribers').select('status, total_orders, total_spent', { count: 'exact', head: true }).eq('client_id', client_id),
      ]);
      data.emailEvents = ev || [];
      data.emailCampaigns = camps || [];
      data.emailSubsCount = subs || 0;
      sectionsToInclude.push('email');
    }

    // WhatsApp
    if (wants('whatsapp')) {
      const { data: wa } = await supabase
        .from('wa_messages')
        .select('direction, body, contact_name, contact_phone, created_at')
        .eq('client_id', client_id)
        .gte('created_at', fromStr).lte('created_at', toStr + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(500);
      data.waMessages = wa || [];
      sectionsToInclude.push('whatsapp');
    }

    // Abandoned
    if (wants('abandoned')) {
      const { data: ab } = await supabase
        .from('shopify_abandoned_checkouts')
        .select('checkout_id, customer_name, customer_email, customer_phone, total_price, currency, line_items, created_at, order_completed')
        .eq('client_id', client_id)
        .gte('created_at', fromStr).lte('created_at', toStr + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(50);
      data.abandoned = ab || [];
      sectionsToInclude.push('abandoned');
    }

    // Competencia
    if (wants('competencia')) {
      const [{ data: tr }, { data: ads }] = await Promise.all([
        supabase.from('competitor_tracking').select('display_name, ig_handle, store_url, last_sync_at').eq('client_id', client_id).eq('is_active', true).limit(20),
        supabase.from('competitor_ads').select('ad_text, ad_headline, days_running, platforms, started_at, image_url').eq('client_id', client_id).eq('is_active', true).gte('started_at', fromStr).order('days_running', { ascending: false }).limit(15),
      ]);
      data.competitorTracking = tr || [];
      data.competitorAds = ads || [];
      sectionsToInclude.push('competencia');
    }

    // Creativos
    if (wants('creativos')) {
      const { data: cr } = await supabase
        .from('creative_history')
        .select('channel, type, theme, content_summary, performance_verdict, performance_reason, performance_score, meta_ctr, meta_roas, meta_cpa, klaviyo_open_rate, klaviyo_click_rate, measured_at, image_url')
        .eq('client_id', client_id)
        .gte('measured_at', fromStr).lte('measured_at', toStr + 'T23:59:59')
        .order('performance_score', { ascending: false, nullsFirst: false })
        .limit(15);
      data.creatives = cr || [];
      sectionsToInclude.push('creativos');
    }

    // Catálogo
    if (wants('catalogo')) {
      const { data: prods } = await supabase
        .from('shopify_products')
        .select('title, vendor, product_type, price_min, price_max, inventory_total, status')
        .eq('client_id', client_id)
        .eq('status', 'active')
        .order('price_max', { ascending: false })
        .limit(30);
      data.products = prods || [];
      sectionsToInclude.push('catalogo');
    }

    // Criterio
    if (wants('criterio')) {
      const { data: cri } = await supabase
        .from('criterio_results')
        .select('rule_id, entity_type, actual_value, expected_value, details, evaluated_at')
        .eq('shop_id', client_id)
        .eq('passed', false)
        .gte('evaluated_at', fromStr).lte('evaluated_at', toStr + 'T23:59:59')
        .order('evaluated_at', { ascending: false })
        .limit(15);
      data.criterio = cri || [];
      sectionsToInclude.push('criterio');
    }

    // Brief / persona for branding context
    const { data: persona } = await supabase
      .from('buyer_personas')
      .select('persona_data, is_complete')
      .eq('client_id', client_id)
      .maybeSingle();
    data.persona = persona;

    // === RENDER HTML ===
    const html = renderReportHtml(data, sectionsToInclude, shopifyConnIds);

    // === PDF VIA PUPPETEER ===
    const browser = await launchBrowser();
    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
      });
    } finally {
      await browser.close();
    }

    // === UPLOAD TO SUPABASE STORAGE ===
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `reports/${client_id}/${ts}_${fromStr}_${toStr}.pdf`;
    const { error: uploadErr } = await supabase.storage
      .from('client-assets')
      .upload(filename, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
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
    });
  } catch (err: any) {
    console.error('[strategy-report] Unhandled error:', err);
    return c.json({ error: 'Internal error', details: err?.message?.slice(0, 300) }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────
// HTML RENDERER — modular per section
// ─────────────────────────────────────────────────────────────────

function renderReportHtml(d: any, sections: string[], shopifyConnIds: string[]): string {
  const c = d.client;
  const brandPrimary = c.brand_color || '#0f172a';
  const brandSecondary = c.brand_secondary_color || '#64748b';
  const brandFont = c.brand_font || 'Inter, system-ui, sans-serif';
  const logoUrl = c.logo_url || '';
  const companyName = escapeHtml(c.company || c.name || 'Cliente');
  const periodLabel = `${d.period.from} → ${d.period.to} (${d.period.days} días)`;
  const prevLabel = `vs ${d.prev.from} → ${d.prev.to}`;

  const blocks: string[] = [];

  // Header
  blocks.push(`
    <header class="cover">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="logo" />` : ''}
      <div>
        <h1>${companyName}</h1>
        <p class="subtitle">Reporte de Performance · ${escapeHtml(periodLabel)}</p>
        <p class="generatedby">Generado por Steve 🐕 · ${new Date().toLocaleString('es-CL')}</p>
      </div>
    </header>
  `);

  // Executive summary placeholder (no AI sync here — keep deterministic)
  const summary = buildExecSummary(d, sections, shopifyConnIds);
  if (summary) blocks.push(`<section class="exec"><h2>Resumen ejecutivo</h2>${summary}</section>`);

  // Sections in fixed order
  if (sections.includes('shopify')) blocks.push(renderShopifySection(d, shopifyConnIds, prevLabel));
  if (sections.includes('ads_meta') || sections.includes('ads_google')) blocks.push(renderAdsSection(d, sections, prevLabel));
  if (sections.includes('email')) blocks.push(renderEmailSection(d));
  if (sections.includes('whatsapp')) blocks.push(renderWaSection(d));
  if (sections.includes('abandoned')) blocks.push(renderAbandonedSection(d));
  if (sections.includes('catalogo')) blocks.push(renderCatalogoSection(d));
  if (sections.includes('creativos')) blocks.push(renderCreativosSection(d));
  if (sections.includes('competencia')) blocks.push(renderCompetenciaSection(d));
  if (sections.includes('criterio')) blocks.push(renderCriterioSection(d));

  // Footer
  blocks.push(`
    <footer><p>${companyName} · Powered by Steve Ads · ${escapeHtml(periodLabel)}</p></footer>
  `);

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<title>Reporte ${companyName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${brandFont};color:#0f172a;font-size:11pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .cover{padding:24pt 0 16pt;border-bottom:3pt solid ${brandPrimary};display:flex;align-items:center;gap:16pt;page-break-after:avoid}
  .cover .logo{max-height:48pt;max-width:120pt;object-fit:contain}
  h1{font-size:22pt;color:${brandPrimary};font-weight:800;letter-spacing:-0.5pt}
  h2{font-size:14pt;color:${brandPrimary};margin:18pt 0 8pt;border-left:4pt solid ${brandPrimary};padding-left:8pt;font-weight:700}
  h3{font-size:11pt;margin:10pt 0 4pt;color:${brandSecondary};font-weight:600;text-transform:uppercase;letter-spacing:0.5pt}
  .subtitle{color:${brandSecondary};font-size:11pt;margin-top:4pt}
  .generatedby{color:#94a3b8;font-size:9pt;margin-top:2pt}
  section{margin-top:14pt;page-break-inside:avoid}
  .exec ul{padding-left:18pt;margin-top:4pt}
  .exec li{margin:3pt 0}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin-top:6pt}
  .kpi{background:#f8fafc;border:1pt solid #e2e8f0;border-radius:6pt;padding:8pt}
  .kpi .label{font-size:9pt;color:${brandSecondary};text-transform:uppercase;letter-spacing:0.5pt}
  .kpi .value{font-size:14pt;font-weight:800;color:#0f172a;margin-top:2pt}
  .kpi .delta{font-size:9pt;margin-top:2pt}
  .delta.up{color:#15803d}
  .delta.down{color:#b91c1c}
  .delta.neutral{color:#64748b}
  table{width:100%;border-collapse:collapse;margin-top:6pt;font-size:9.5pt}
  th{background:${brandPrimary};color:#fff;text-align:left;padding:6pt 8pt;font-weight:600}
  td{padding:5pt 8pt;border-bottom:1pt solid #e2e8f0;vertical-align:top}
  tr:nth-child(even) td{background:#f8fafc}
  .badge{display:inline-block;padding:2pt 6pt;border-radius:4pt;font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:0.3pt}
  .badge.high{background:#fee2e2;color:#991b1b}
  .badge.medium{background:#fef3c7;color:#92400e}
  .badge.low{background:#dbeafe;color:#1e40af}
  .badge.win{background:#dcfce7;color:#166534}
  .badge.fail{background:#fee2e2;color:#991b1b}
  .empty{color:${brandSecondary};font-style:italic;padding:8pt 0}
  ul.simple{padding-left:18pt}
  ul.simple li{margin:3pt 0}
  footer{margin-top:24pt;padding-top:8pt;border-top:1pt solid #e2e8f0;color:${brandSecondary};font-size:9pt;text-align:center;page-break-before:avoid}
  .pagebreak{page-break-after:always}
</style>
</head><body>
${blocks.join('\n')}
</body></html>`;
}

function buildExecSummary(d: any, sections: string[], shopifyConnIds: string[]): string {
  const lines: string[] = [];
  // Shopify
  if (sections.includes('shopify') && d.platformMetrics) {
    const cur = aggregateShopify(d.platformMetrics, d.period.from, d.period.to, shopifyConnIds);
    const prev = aggregateShopify(d.platformMetrics, d.prev.from, d.prev.to, shopifyConnIds);
    if (cur.revenue > 0 || prev.revenue > 0) {
      const delta = pctDelta(cur.revenue, prev.revenue);
      lines.push(`<li>Revenue Shopify <strong>${fmtMoney(cur.revenue)}</strong> en ${cur.orders} pedidos <span class="delta ${delta.cls}">${delta.label}</span></li>`);
    }
  }
  // Ads
  if ((sections.includes('ads_meta') || sections.includes('ads_google')) && d.campaignMetrics) {
    const cur = aggregateAds(d.campaignMetrics, d.period.from, d.period.to);
    const prev = aggregateAds(d.campaignMetrics, d.prev.from, d.prev.to);
    if (cur.spend > 0) {
      const roas = cur.spend > 0 ? (cur.revenue / cur.spend).toFixed(2) : 'N/A';
      const delta = pctDelta(cur.spend, prev.spend);
      lines.push(`<li>Inversión publicitaria <strong>${fmtMoney(cur.spend)}</strong>, ROAS <strong>${roas}x</strong> <span class="delta ${delta.cls}">${delta.label} en gasto</span></li>`);
    }
  }
  // Abandoned
  if (sections.includes('abandoned') && d.abandoned) {
    const ab = (d.abandoned || []).filter((x: any) => !x.order_completed);
    if (ab.length > 0) {
      const total = ab.reduce((acc: number, x: any) => acc + (Number(x.total_price) || 0), 0);
      lines.push(`<li>Carritos abandonados: <strong>${ab.length}</strong> por <strong>${fmtMoney(total)}</strong> sin recuperar</li>`);
    }
  }
  // Email
  if (sections.includes('email') && d.emailEvents) {
    const opens = (d.emailEvents || []).filter((e: any) => e.event_type === 'open' || e.event_type === 'opened').length;
    const clicks = (d.emailEvents || []).filter((e: any) => e.event_type === 'click' || e.event_type === 'clicked').length;
    if (opens > 0 || clicks > 0) {
      lines.push(`<li>Email: <strong>${opens}</strong> opens, <strong>${clicks}</strong> clicks (${d.emailCampaigns?.length || 0} campañas enviadas)</li>`);
    }
  }
  // WA
  if (sections.includes('whatsapp') && d.waMessages?.length > 0) {
    const inbound = d.waMessages.filter((m: any) => m.direction === 'inbound').length;
    lines.push(`<li>WhatsApp: <strong>${d.waMessages.length}</strong> mensajes (${inbound} entrantes)</li>`);
  }
  // Criterio
  if (sections.includes('criterio') && d.criterio?.length > 0) {
    lines.push(`<li>⚠️ <strong>${d.criterio.length}</strong> reglas Criterio rotas necesitan tu atención</li>`);
  }
  if (lines.length === 0) return `<p class="empty">Sin datos suficientes en este período para generar resumen.</p>`;
  return `<ul>${lines.join('')}</ul>`;
}

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

function renderShopifySection(d: any, shopifyConnIds: string[], prevLabel: string): string {
  const cur = aggregateShopify(d.platformMetrics || [], d.period.from, d.period.to, shopifyConnIds);
  const prev = aggregateShopify(d.platformMetrics || [], d.prev.from, d.prev.to, shopifyConnIds);
  if (cur.revenue === 0 && prev.revenue === 0) {
    return `<section><h2>Shopify</h2><p class="empty">Sin ventas registradas en el período (puede que el sync no haya capturado días sin ventas).</p></section>`;
  }
  const ticket = cur.orders > 0 ? cur.revenue / cur.orders : 0;
  const dRev = pctDelta(cur.revenue, prev.revenue);
  const dOrd = pctDelta(cur.orders, prev.orders);
  return `
    <section>
      <h2>Shopify — Ventas</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Revenue</div><div class="value">${fmtMoney(cur.revenue)}</div><div class="delta ${dRev.cls}">${dRev.label} ${escapeHtml(prevLabel)}</div></div>
        <div class="kpi"><div class="label">Pedidos</div><div class="value">${cur.orders}</div><div class="delta ${dOrd.cls}">${dOrd.label}</div></div>
        <div class="kpi"><div class="label">Ticket promedio</div><div class="value">${fmtMoney(ticket)}</div><div class="delta neutral">— </div></div>
        <div class="kpi"><div class="label">Período anterior</div><div class="value">${fmtMoney(prev.revenue)}</div><div class="delta neutral">${prev.orders} pedidos</div></div>
      </div>
    </section>
  `;
}

function renderAdsSection(d: any, sections: string[], prevLabel: string): string {
  const cur = aggregateAds(d.campaignMetrics || [], d.period.from, d.period.to);
  const prev = aggregateAds(d.campaignMetrics || [], d.prev.from, d.prev.to);
  if (cur.spend === 0 && prev.spend === 0) {
    return `<section><h2>Publicidad — Meta + Google</h2><p class="empty">Sin gasto publicitario registrado.</p></section>`;
  }
  const roas = cur.spend > 0 ? (cur.revenue / cur.spend) : 0;
  const ctr = cur.impressions > 0 ? (cur.clicks / cur.impressions) * 100 : 0;
  const cpa = cur.conversions > 0 ? cur.spend / cur.conversions : 0;
  const dSpend = pctDelta(cur.spend, prev.spend);
  const dRoas = prev.spend > 0 ? pctDelta(roas, prev.revenue / prev.spend) : { label: 'N/A', cls: 'neutral' };

  // Top 5 campaigns by spend in current period
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
  const topCampaigns = Object.entries(byCampaign).sort(([, a]: any, [, b]: any) => b.spend - a.spend).slice(0, 8);
  const rows = topCampaigns.map(([name, x]: any) => {
    const cRoas = x.spend > 0 ? (x.revenue / x.spend).toFixed(2) : '0';
    const cCtr = x.impressions > 0 ? ((x.clicks / x.impressions) * 100).toFixed(2) : '0';
    const cCpa = x.conversions > 0 ? Math.round(x.spend / x.conversions).toLocaleString('es-CL') : '∞';
    return `<tr>
      <td><strong>${escapeHtml(name).slice(0, 60)}</strong> <span class="badge ${x.status === 'ACTIVE' ? 'win' : 'low'}">${x.status}</span></td>
      <td>${fmtMoney(x.spend)}</td>
      <td>${cRoas}x</td>
      <td>${cCtr}%</td>
      <td>$${cCpa}</td>
      <td>${x.conversions}</td>
    </tr>`;
  }).join('');

  return `
    <section>
      <h2>Publicidad — Meta + Google</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Inversión</div><div class="value">${fmtMoney(cur.spend)}</div><div class="delta ${dSpend.cls}">${dSpend.label}</div></div>
        <div class="kpi"><div class="label">ROAS</div><div class="value">${roas.toFixed(2)}x</div><div class="delta ${dRoas.cls}">${dRoas.label}</div></div>
        <div class="kpi"><div class="label">CTR</div><div class="value">${ctr.toFixed(2)}%</div><div class="delta neutral">${cur.clicks.toLocaleString('es-CL')} clicks</div></div>
        <div class="kpi"><div class="label">CPA</div><div class="value">${cpa > 0 ? fmtMoney(cpa) : 'N/A'}</div><div class="delta neutral">${cur.conversions} conv</div></div>
      </div>
      ${rows ? `<h3>Top campañas por inversión</h3>
      <table><thead><tr><th>Campaña</th><th>Gasto</th><th>ROAS</th><th>CTR</th><th>CPA</th><th>Conv</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    </section>
  `;
}

function renderEmailSection(d: any): string {
  const ev = d.emailEvents || [];
  const camps = d.emailCampaigns || [];
  if (ev.length === 0 && camps.length === 0) {
    return `<section><h2>Email — Klaviyo</h2><p class="empty">Sin actividad de email en este período.</p></section>`;
  }
  const opens = ev.filter((e: any) => e.event_type === 'open' || e.event_type === 'opened').length;
  const clicks = ev.filter((e: any) => e.event_type === 'click' || e.event_type === 'clicked').length;
  const bounces = ev.filter((e: any) => e.event_type === 'bounce' || e.event_type === 'bounced').length;
  const unsubs = ev.filter((e: any) => e.event_type === 'unsubscribe' || e.event_type === 'unsubscribed').length;
  const ctor = opens > 0 ? ((clicks / opens) * 100).toFixed(1) : '0';

  const rows = camps.slice(0, 10).map((cmp: any) => {
    const sent = cmp.sent_count || 0;
    const total = cmp.total_recipients || 0;
    const date = cmp.sent_at ? new Date(cmp.sent_at).toLocaleDateString('es-CL') : '?';
    return `<tr><td>${date}</td><td>${escapeHtml((cmp.subject || cmp.name || '').slice(0, 80))}</td><td>${sent}/${total}</td></tr>`;
  }).join('');
  return `
    <section>
      <h2>Email — Klaviyo</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Opens</div><div class="value">${opens.toLocaleString('es-CL')}</div></div>
        <div class="kpi"><div class="label">Clicks</div><div class="value">${clicks.toLocaleString('es-CL')}</div><div class="delta neutral">CTOR ${ctor}%</div></div>
        <div class="kpi"><div class="label">Bounces</div><div class="value">${bounces}</div></div>
        <div class="kpi"><div class="label">Unsubs</div><div class="value">${unsubs}</div></div>
      </div>
      ${rows ? `<h3>Campañas enviadas</h3><table><thead><tr><th>Fecha</th><th>Subject / Nombre</th><th>Enviados</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${d.emailSubsCount ? `<p style="margin-top:8pt;color:#64748b">Lista total: <strong>${d.emailSubsCount}</strong> suscriptores</p>` : ''}
    </section>
  `;
}

function renderWaSection(d: any): string {
  const wa = d.waMessages || [];
  if (wa.length === 0) return `<section><h2>WhatsApp</h2><p class="empty">Sin actividad de WhatsApp en el período.</p></section>`;
  const inbound = wa.filter((m: any) => m.direction === 'inbound').length;
  const outbound = wa.filter((m: any) => m.direction === 'outbound').length;
  const uniq = new Set(wa.map((m: any) => m.contact_phone || m.contact_name).filter(Boolean)).size;
  return `
    <section>
      <h2>WhatsApp</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Mensajes</div><div class="value">${wa.length}</div></div>
        <div class="kpi"><div class="label">Entrantes</div><div class="value">${inbound}</div></div>
        <div class="kpi"><div class="label">Salientes</div><div class="value">${outbound}</div></div>
        <div class="kpi"><div class="label">Contactos únicos</div><div class="value">${uniq}</div></div>
      </div>
    </section>
  `;
}

function renderAbandonedSection(d: any): string {
  const ab = (d.abandoned || []).filter((x: any) => !x.order_completed);
  if (ab.length === 0) return `<section><h2>Carritos Abandonados</h2><p class="empty">Sin carritos abandonados en el período (o no se sincronizaron).</p></section>`;
  const total = ab.reduce((acc: number, x: any) => acc + (Number(x.total_price) || 0), 0);
  const withPhone = ab.filter((x: any) => x.customer_phone).length;
  const withEmail = ab.filter((x: any) => x.customer_email).length;
  const rows = ab.slice(0, 12).map((co: any) => {
    const date = new Date(co.created_at).toLocaleDateString('es-CL');
    const items = (co.line_items || []).slice(0, 2).map((li: any) => li.title).join(', ');
    const channel = co.customer_phone ? '📱 WA' : co.customer_email ? '📧 Email' : '👻 Sin canal';
    return `<tr><td>${date}</td><td>${escapeHtml(co.customer_name || 'Anónimo')}</td><td>${fmtMoney(Number(co.total_price) || 0)}</td><td>${escapeHtml(items.slice(0, 60))}</td><td>${channel}</td></tr>`;
  }).join('');
  return `
    <section>
      <h2>Carritos Abandonados</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Carritos</div><div class="value">${ab.length}</div></div>
        <div class="kpi"><div class="label">Revenue pendiente</div><div class="value">${fmtMoney(total)}</div></div>
        <div class="kpi"><div class="label">Recuperables WA</div><div class="value">${withPhone}</div></div>
        <div class="kpi"><div class="label">Recuperables Email</div><div class="value">${withEmail}</div></div>
      </div>
      <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Productos</th><th>Canal</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `;
}

function renderCatalogoSection(d: any): string {
  const prods = d.products || [];
  if (prods.length === 0) return `<section><h2>Catálogo Shopify</h2><p class="empty">Sin productos sincronizados.</p></section>`;
  const minPrice = Math.min(...prods.map((p: any) => Number(p.price_min) || Infinity));
  const maxPrice = Math.max(...prods.map((p: any) => Number(p.price_max) || 0));
  const sinStock = prods.filter((p: any) => p.inventory_total === 0).length;
  const rows = prods.slice(0, 15).map((p: any) => {
    const stock = p.inventory_total === -1 ? '—' : p.inventory_total === 0 ? '<span class="badge fail">SIN STOCK</span>' : `${p.inventory_total} u.`;
    const price = p.price_min === p.price_max ? fmtMoney(Number(p.price_min)) : `${fmtMoney(Number(p.price_min))}-${fmtMoney(Number(p.price_max))}`;
    return `<tr><td>${escapeHtml((p.title || '').slice(0, 70))}</td><td>${escapeHtml(p.product_type || '—')}</td><td>${price}</td><td>${stock}</td></tr>`;
  }).join('');
  return `
    <section>
      <h2>Catálogo Shopify</h2>
      <div class="kpis">
        <div class="kpi"><div class="label">Productos activos</div><div class="value">${prods.length}+</div></div>
        <div class="kpi"><div class="label">Rango de precios</div><div class="value">${fmtMoney(minPrice)}-${fmtMoney(maxPrice)}</div></div>
        <div class="kpi"><div class="label">Sin stock</div><div class="value">${sinStock}</div></div>
        <div class="kpi"><div class="label">Mostrando top</div><div class="value">15</div></div>
      </div>
      <table><thead><tr><th>Producto</th><th>Tipo</th><th>Precio</th><th>Stock</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `;
}

function renderCreativosSection(d: any): string {
  const cr = d.creatives || [];
  if (cr.length === 0) return `<section><h2>Creativos — Performance</h2><p class="empty">Sin creativos analizados en este período.</p></section>`;
  const rows = cr.slice(0, 10).map((c: any) => {
    const verdict = (c.performance_verdict || '').toLowerCase();
    const badge = verdict.includes('win') || verdict.includes('top') ? 'win' : verdict.includes('fatig') || verdict.includes('low') ? 'fail' : 'medium';
    const metrics = c.channel === 'klaviyo'
      ? `OR ${c.klaviyo_open_rate ? (c.klaviyo_open_rate * 100).toFixed(1) + '%' : '—'} · CR ${c.klaviyo_click_rate ? (c.klaviyo_click_rate * 100).toFixed(1) + '%' : '—'}`
      : `CTR ${c.meta_ctr ? (c.meta_ctr * 100).toFixed(2) + '%' : '—'} · ROAS ${c.meta_roas?.toFixed(2) || '—'}`;
    return `<tr>
      <td><strong>${escapeHtml((c.theme || c.content_summary || 'Sin título').slice(0, 60))}</strong> <span class="badge ${badge}">${escapeHtml(c.performance_verdict || '?')}</span></td>
      <td>${escapeHtml(c.channel || '—')}/${escapeHtml(c.type || '—')}</td>
      <td>${c.performance_score != null ? c.performance_score : '—'}</td>
      <td>${metrics}</td>
    </tr>`;
  }).join('');
  return `
    <section>
      <h2>Creativos — Performance</h2>
      <table><thead><tr><th>Creativo</th><th>Canal/Tipo</th><th>Score</th><th>Métricas</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `;
}

function renderCompetenciaSection(d: any): string {
  const tracking = d.competitorTracking || [];
  const ads = d.competitorAds || [];
  if (tracking.length === 0 && ads.length === 0) {
    return `<section><h2>Competencia</h2><p class="empty">Sin competidores monitoreados o sin ads detectados en el período.</p></section>`;
  }
  const compNames = tracking.map((c: any) => escapeHtml(c.display_name || c.ig_handle || '')).filter(Boolean).join(', ');
  const adsRows = ads.slice(0, 8).map((ad: any) => {
    const headline = (ad.ad_headline || ad.ad_text || '').slice(0, 100);
    const platforms = (ad.platforms || []).join(', ') || 'meta';
    return `<tr><td>${escapeHtml(headline)}</td><td>${ad.days_running || 0}d</td><td>${escapeHtml(platforms)}</td></tr>`;
  }).join('');
  return `
    <section>
      <h2>Competencia</h2>
      ${compNames ? `<p style="margin-top:4pt"><strong>Monitoreando:</strong> ${compNames}</p>` : ''}
      ${adsRows ? `<h3>Ads activos detectados</h3><table><thead><tr><th>Anuncio</th><th>Días corriendo</th><th>Plataformas</th></tr></thead><tbody>${adsRows}</tbody></table>` : '<p class="empty">Sin ads activos detectados en el período.</p>'}
    </section>
  `;
}

function renderCriterioSection(d: any): string {
  const cri = d.criterio || [];
  if (cri.length === 0) return `<section><h2>Diagnóstico Criterio</h2><p class="empty">✅ Sin reglas Criterio rotas en el período.</p></section>`;
  const rows = cri.slice(0, 12).map((f: any) => {
    const date = new Date(f.evaluated_at).toLocaleDateString('es-CL');
    return `<tr><td>${date}</td><td>${escapeHtml(f.entity_type || '—')}</td><td>${escapeHtml(String(f.actual_value).slice(0, 40))}</td><td>${escapeHtml(String(f.expected_value).slice(0, 40))}</td></tr>`;
  }).join('');
  return `
    <section>
      <h2>Diagnóstico Criterio — Reglas no cumplidas</h2>
      <p style="color:#64748b;font-size:9.5pt">${cri.length} reglas detectaron desviaciones que requieren atención.</p>
      <table><thead><tr><th>Fecha</th><th>Entidad</th><th>Valor actual</th><th>Esperado</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `;
}
