import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getCreativeContext } from '../../lib/creative-context.js';
import { checkRateLimit } from '../../lib/rate-limiter.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { sanitizeForPrompt } from '../../lib/prompt-utils.js';
import { sanitizeMessagesForAnthropic, truncateMessages } from './steve-chat.js';

// Calendario de fechas comerciales relevantes para Chile/LATAM (#39)
// Usadas para que Steve sepa qué evento se aproxima y pueda recomendar
// preparación de campañas/inventario/email.
function buildSeasonalContext(today: Date): string {
  const year = today.getFullYear();
  const events: Array<{ date: Date; name: string; type: string }> = [
    { date: new Date(year, 1, 14), name: 'San Valentín', type: 'romántico/regalo' },
    { date: new Date(year, 2, 8), name: 'Día Internacional de la Mujer', type: 'awareness/regalo' },
    { date: new Date(year, 4, 1), name: 'Día del Trabajador (feriado)', type: 'feriado/oferta' },
    { date: new Date(year, 4, 11), name: 'Día de la Madre (Chile)', type: 'regalo/alta demanda' },
    { date: new Date(year, 5, 16), name: 'Día del Padre (Chile)', type: 'regalo' },
    { date: new Date(year, 5, 21), name: 'CyberDay Chile (junio)', type: 'descuento/alta competencia' },
    { date: new Date(year, 6, 16), name: 'Día Internacional de la Amistad', type: 'regalo' },
    { date: new Date(year, 8, 18), name: 'Fiestas Patrias Chile', type: 'feriado largo/preparación' },
    { date: new Date(year, 9, 6), name: 'CyberMonday Chile (octubre)', type: 'descuento/alta competencia' },
    { date: new Date(year, 9, 31), name: 'Halloween', type: 'nicho/disfraces' },
    { date: new Date(year, 10, 28), name: 'Black Friday', type: 'descuento/conversión alta' },
    { date: new Date(year, 11, 1), name: 'Cyber Monday global', type: 'descuento' },
    { date: new Date(year, 11, 25), name: 'Navidad', type: 'regalo/máxima demanda' },
    { date: new Date(year, 11, 31), name: 'Año Nuevo', type: 'cierre/promoción liquidación' },
  ];
  const todayMs = today.getTime();
  const upcoming = events
    .map(e => ({ ...e, daysUntil: Math.ceil((e.date.getTime() - todayMs) / 86400000) }))
    .filter(e => e.daysUntil >= -3 && e.daysUntil <= 60)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  if (upcoming.length === 0) return '';
  let out = `\n📅 CALENDARIO ESTACIONAL (Chile/LATAM, próximas fechas comerciales):\n`;
  for (const e of upcoming.slice(0, 4)) {
    if (e.daysUntil < 0) {
      out += `- ${e.name} (${e.type}): pasó hace ${Math.abs(e.daysUntil)} días — analizar performance reciente\n`;
    } else if (e.daysUntil === 0) {
      out += `- ${e.name} (${e.type}): HOY 🔥\n`;
    } else {
      out += `- ${e.name} (${e.type}): en ${e.daysUntil} días — ventana ideal de preparación\n`;
    }
  }
  return out;
}

export async function strategyChat(c: Context) {
  const requestStart = Date.now();
  const timelog = (label: string) => console.log(`[strategy-chat][timing] ${label}: ${Date.now() - requestStart}ms`);

  const supabase = getSupabaseAdmin();

  // Auth: support both JWT users and internal service calls
  const user = c.get('user');
  const isInternal = c.get('isInternal') === true;
  if (!user && !isInternal) {
    timelog('auth-rejected');
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { client_id, conversation_id, message } = await c.req.json();
  timelog('body-parsed');

  if (!client_id) {
    return c.json({ error: 'Missing client_id' }, 400);
  }

  // Rate limit: 10 requests/minute per client
  const rl = checkRateLimit(client_id, 'strategy-chat');
  if (!rl.allowed) {
    return c.json({ error: `Rate limited. Retry in ${rl.retryAfter} seconds.` }, 429);
  }

  // Parallelize: client lookup + role check are independent
  const userId = user?.id;
  const [{ data: client, error: clientError }, { data: roleRow }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, client_user_id, user_id, shop_domain')
      .eq('id', client_id)
      .single(),
    userId
      ? supabase
          .from('user_roles')
          .select('is_super_admin')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  timelog('auth-queries');

  if (clientError || !client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const isSuperAdmin = isInternal || roleRow?.is_super_admin === true;

  if (!isSuperAdmin && client.client_user_id !== userId && client.user_id !== userId) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    let estrategiaConvId = conversation_id;

    // Create or reuse conversation
    if (!estrategiaConvId) {
      const existingConv = await safeQuerySingleOrDefault<{ id: string }>(
        supabase
          .from('steve_conversations')
          .select('id')
          .eq('client_id', client_id)
          .eq('conversation_type', 'estrategia')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        null,
        'strategy-chat.fetchExistingConv',
      );

      if (existingConv) {
        estrategiaConvId = existingConv.id;
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('steve_conversations')
          .insert({ client_id, conversation_type: 'estrategia' })
          .select()
          .single();
        if (convErr) {
          return c.json({ error: 'Failed to create estrategia conversation' }, 500);
        }
        estrategiaConvId = newConv.id;
      }
    }

    // If no message, just return the conversation_id (initialization)
    if (!message) {
      return c.json({ conversation_id: estrategiaConvId });
    }

    // Insert user message (fire-and-forget -- we fetch messages after insert)
    await supabase.from('steve_messages').insert({
      conversation_id: estrategiaConvId,
      role: 'user',
      content: message,
    });
    timelog('estrategia-msg-insert');

    // Determine knowledge category (no DB needed)
    const mensajeLower = (message || '').toLowerCase();
    const categoriaRelevante =
      mensajeLower.includes('meta') || mensajeLower.includes('anuncio') || mensajeLower.includes('campaña') ? 'meta_ads' :
      mensajeLower.includes('buyer') || mensajeLower.includes('cliente') || mensajeLower.includes('dolor') ? 'buyer_persona' :
      mensajeLower.includes('seo') || mensajeLower.includes('posicionamiento') ? 'seo' :
      mensajeLower.includes('google') ? 'google_ads' :
      mensajeLower.includes('email') || mensajeLower.includes('klaviyo') ? 'klaviyo' :
      mensajeLower.includes('shopify') || mensajeLower.includes('tienda') ? 'shopify' :
      'brief';

    // Date computations (no I/O)
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
    const dayOfWeek = now.getDay() || 7; // Mon=1 … Sun=7
    const thisMondayDate = new Date(now);
    thisMondayDate.setDate(now.getDate() - (dayOfWeek - 1));
    const thisMonday = thisMondayDate.toISOString().split('T')[0];
    const lastMondayDate = new Date(thisMondayDate);
    lastMondayDate.setDate(thisMondayDate.getDate() - 7);
    const lastMonday = lastMondayDate.toISOString().split('T')[0];
    const lastSundayDate = new Date(thisMondayDate);
    lastSundayDate.setDate(thisMondayDate.getDate() - 1);
    const lastSunday = lastSundayDate.toISOString().split('T')[0];
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStart = lastMonthDate.toISOString().split('T')[0];
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    // PARALLELIZED: 19 independent queries that all depend only on client_id / conversation_id
    const [
      { data: convMessages },
      { data: persona },
      { data: research },
      { data: knowledge },
      { data: connections },
      { data: clientKnowledgeData },
      { data: commitments },
      { data: shopifyProducts },
      { data: financialConfig },
      { data: emailEvents },
      { data: emailCampaigns },
      { data: emailSubsAgg },
      { data: waMessages },
      { data: competitorAds },
      { data: competitorTracking },
      { data: campaignRecs },
      { data: creativeHist },
      { data: criterioFailed },
      { data: episodicMem },
      { data: abandonedCheckouts },
    ] = await Promise.all([
      // 1. Fetch last messages for context
      supabase
        .from('steve_messages')
        .select('role, content')
        .eq('conversation_id', estrategiaConvId)
        .order('created_at', { ascending: true })
        .limit(40),
      // 2. Load client brief (persona_data)
      supabase
        .from('buyer_personas')
        .select('persona_data, is_complete')
        .eq('client_id', client_id)
        .maybeSingle(),
      // 3. Load brand research
      supabase
        .from('brand_research')
        .select('research_type, research_data')
        .eq('client_id', client_id),
      // 4. Load knowledge base (global rules)
      // TODO (Mejora #4 - Industry filter): Once clients have industria assigned, add
      // .in('industria', ['general', clientIndustry]) to filter rules by client's industry.
      supabase
        .from('steve_knowledge')
        .select('id, categoria, titulo, contenido')
        .in('categoria', [categoriaRelevante, 'brief'])
        .eq('activo', true)
        .eq('approval_status', 'approved')
        .is('purged_at', null)
        .order('orden', { ascending: false })
        .limit(8),
      // 5. Get client's connections grouped by platform
      supabase
        .from('platform_connections')
        .select('id, platform')
        .eq('client_id', client_id)
        .eq('is_active', true),
      // 6. Fetch client-specific knowledge (Mejora #1)
      supabase
        .from('steve_knowledge')
        .select('id, categoria, titulo, contenido, orden')
        .eq('client_id', client_id)
        .eq('activo', true)
        .eq('approval_status', 'approved')
        .is('purged_at', null)
        .order('orden', { ascending: false })
        .limit(10),
      // 7. Load pending commitments for this client (Mejora #8)
      supabase
        .from('steve_commitments')
        .select('commitment, context, follow_up_date, agreed_date')
        .eq('client_id', client_id)
        .eq('status', 'pending')
        .order('agreed_date', { ascending: false })
        .limit(5),
      // 8. Load Shopify product catalog (active products by price desc)
      supabase
        .from('shopify_products')
        .select('title, vendor, product_type, price_min, price_max, inventory_total, status')
        .eq('client_id', client_id)
        .eq('status', 'active')
        .order('price_max', { ascending: false })
        .limit(15),
      // 9. Financial config (margin, costs, CPA viable)
      supabase
        .from('client_financial_config')
        .select('default_margin_percentage, shopify_commission_percentage, payment_gateway_commission, shipping_cost_per_order, other_fixed_costs, klaviyo_plan_cost, shopify_plan_cost')
        .eq('client_id', client_id)
        .maybeSingle(),
      // 10. Email events last 30d (opens/clicks/bounces)
      supabase
        .from('email_events')
        .select('event_type, campaign_id, created_at')
        .eq('client_id', client_id)
        .gte('created_at', thirtyDaysAgo)
        .limit(2000),
      // 11. Last 10 sent email campaigns
      supabase
        .from('email_campaigns')
        .select('name, subject, sent_count, total_recipients, sent_at, status')
        .eq('client_id', client_id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(10),
      // 12. Email subscribers count + active
      supabase
        .from('email_subscribers')
        .select('status, total_orders, total_spent', { count: 'exact' })
        .eq('client_id', client_id)
        .limit(500),
      // 13. WhatsApp messages last 30d (count + last 5 inbound for tone)
      supabase
        .from('wa_messages')
        .select('direction, body, contact_name, created_at')
        .eq('client_id', client_id)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50),
      // 14. Competitor ads last 30d active
      supabase
        .from('competitor_ads')
        .select('ad_text, ad_headline, days_running, platforms, started_at, is_active')
        .eq('client_id', client_id)
        .eq('is_active', true)
        .gte('started_at', thirtyDaysAgo)
        .order('days_running', { ascending: false })
        .limit(8),
      // 15. Competitors being tracked
      supabase
        .from('competitor_tracking')
        .select('display_name, ig_handle, store_url, last_sync_at')
        .eq('client_id', client_id)
        .eq('is_active', true)
        .limit(10),
      // 16. Pre-computed campaign recommendations (not dismissed)
      supabase
        .from('campaign_recommendations')
        .select('platform, recommendation_type, recommendation_text, priority, created_at')
        .eq('shop_domain', client.shop_domain || '')
        .eq('is_dismissed', false)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8),
      // 17. Creative history top 10 by performance_score (last 30d)
      supabase
        .from('creative_history')
        .select('channel, type, theme, content_summary, performance_verdict, performance_reason, performance_score, meta_ctr, meta_roas, meta_cpa, klaviyo_open_rate, klaviyo_click_rate, measured_at')
        .eq('client_id', client_id)
        .gte('measured_at', thirtyDaysAgo)
        .order('performance_score', { ascending: false, nullsFirst: false })
        .limit(10),
      // 18. Criterio rules failed recently (last 14d)
      supabase
        .from('criterio_results')
        .select('rule_id, entity_type, actual_value, expected_value, details, evaluated_at')
        .eq('shop_id', client_id)
        .eq('passed', false)
        .gte('evaluated_at', fourteenDaysAgo)
        .order('evaluated_at', { ascending: false })
        .limit(10),
      // 19. Steve episodic memory (last 10 events)
      supabase
        .from('steve_episodic_memory')
        .select('event_type, summary, created_at')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .limit(10),
      // 20. Shopify abandoned checkouts (not converted, last 30d)
      supabase
        .from('shopify_abandoned_checkouts')
        .select('checkout_id, customer_name, customer_email, customer_phone, total_price, currency, line_items, created_at, order_completed, abandoned_checkout_url')
        .eq('client_id', client_id)
        .eq('order_completed', false)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    // Merge client-specific + global knowledge (client first for priority)
    const mergedKnowledge = [...(clientKnowledgeData || []), ...(knowledge || [])];
    timelog('estrategia-parallel-queries');

    // === LIVE SHOPIFY: orders last 30d → top sold products + new/returning + bundles (best-effort, ≤5s budget) ===
    let topSoldProducts: Array<{ sku: string | null; title: string; units: number; revenue: number }> = [];
    let shopifyOrdersAnalysis: {
      totalOrders: number;
      newCustomers: number;
      returningCustomers: number;
      bundles: Array<{ items: string[]; count: number }>;
    } | null = null;
    const shopifyConnections = (connections || []).filter((c: any) => c.platform === 'shopify');
    if (shopifyConnections.length > 0) {
      try {
        const shopConn = shopifyConnections[0];
        const { data: connFull } = await supabase
          .from('platform_connections')
          .select('store_url, access_token_encrypted')
          .eq('id', shopConn.id)
          .single();
        if (connFull?.store_url && connFull?.access_token_encrypted) {
          const { data: tok } = await supabase
            .rpc('decrypt_platform_token', { encrypted_token: connFull.access_token_encrypted });
          if (tok) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);
            try {
              const cleanUrl = String(connFull.store_url).replace(/^https?:\/\//, '');
              const url = `https://${cleanUrl}/admin/api/2026-04/orders.json?status=any&created_at_min=${thirtyDaysAgo}T00:00:00Z&fields=id,financial_status,line_items,customer&limit=250`;
              const res = await fetch(url, {
                headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' },
                signal: ctrl.signal,
              });
              if (res.ok) {
                const j: any = await res.json();
                const orders = j.orders || [];
                const ACCEPTED = new Set(['paid', 'partially_paid', 'partially_refunded', 'pending', 'authorized']);
                const skuMap: Record<string, any> = {};
                const bundleMap: Record<string, number> = {};
                let totalAccepted = 0;
                let newCust = 0;
                let returning = 0;
                for (const o of orders) {
                  if (!ACCEPTED.has(o.financial_status)) continue;
                  totalAccepted++;
                  // New vs returning: customer.orders_count
                  const oc = Number(o.customer?.orders_count) || 0;
                  if (oc === 1) newCust++;
                  else if (oc > 1) returning++;
                  // SKU aggregation
                  const orderItems: string[] = [];
                  for (const li of (o.line_items || [])) {
                    const key = li.sku || li.title || 'sin-sku';
                    if (!skuMap[key]) skuMap[key] = { sku: li.sku || null, title: li.title || 'Sin título', units: 0, revenue: 0 };
                    skuMap[key].units += Number(li.quantity) || 0;
                    skuMap[key].revenue += (Number(li.price) || 0) * (Number(li.quantity) || 0);
                    orderItems.push(li.title || li.sku || 'sin-titulo');
                  }
                  // Bundle detection: if this order has 2+ items, count combinations
                  if (orderItems.length >= 2) {
                    const sortedItems = [...new Set(orderItems)].sort();
                    if (sortedItems.length >= 2) {
                      const bundleKey = sortedItems.slice(0, 4).join(' + ');
                      bundleMap[bundleKey] = (bundleMap[bundleKey] || 0) + 1;
                    }
                  }
                }
                topSoldProducts = Object.values(skuMap).sort((a: any, b: any) => b.units - a.units).slice(0, 8);
                const topBundles = Object.entries(bundleMap)
                  .filter(([, count]) => count >= 2)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([items, count]) => ({ items: items.split(' + '), count }));
                shopifyOrdersAnalysis = {
                  totalOrders: totalAccepted,
                  newCustomers: newCust,
                  returningCustomers: returning,
                  bundles: topBundles,
                };
              }
            } catch (e: any) {
              console.warn('[strategy-chat] Shopify orders analysis skipped:', e?.message);
            } finally {
              clearTimeout(timer);
            }
          }
        }
      } catch (e: any) {
        console.warn('[strategy-chat] Shopify orders outer error:', e?.message);
      }
    }
    timelog('estrategia-shopify-orders-analysis');

    // Smart rule selection (Mejora #10): use Haiku to pick most relevant rules for this question
    // Uses mergedKnowledge (client-specific + global, client first for priority)
    let filteredKnowledge = mergedKnowledge;
    if (mergedKnowledge && mergedKnowledge.length > 5 && process.env.ANTHROPIC_API_KEY) {
      try {
        const ruleTitles = mergedKnowledge.map((k: any, i: number) => `[${i}] ${k.titulo}`).join('\n');
        const filterRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 100,
            messages: [{
              role: 'user',
              content: `Pregunta del usuario: "${message}"\n\nReglas disponibles:\n${ruleTitles}\n\nResponde SOLO con los índices de las 5 reglas más relevantes para esta pregunta, separados por comas. Ejemplo: 0,3,5,7,12`,
            }],
          }),
        });
        if (filterRes.ok) {
          const filterData: any = await filterRes.json();
          const indices = (filterData.content?.[0]?.text || '')
            .match(/\d+/g)?.map(Number).filter((n: number) => n < mergedKnowledge.length) || [];
          if (indices.length > 0) {
            filteredKnowledge = indices.map((i: number) => mergedKnowledge![i]).filter(Boolean);
          }
        }
      } catch (e) {
        // Fail silently, use all rules
      }
    }
    // Audit: log knowledge injection (fire-and-forget)
    const estRuleIds = (filteredKnowledge || []).map((k: any) => k.id).filter(Boolean);
    if (estRuleIds.length > 0) {
      supabase.from('qa_log').insert({
        check_type: 'knowledge_injection', status: 'info',
        details: JSON.stringify({ source: 'strategy-chat', client_id, rule_count: estRuleIds.length, rule_ids: estRuleIds }),
        detected_by: 'strategy-chat',
      }).then(({ error }) => { if (error) console.error('[strategy-chat] qa_log insert failed:', error.message); });
      supabase.rpc('increment_knowledge_usage', { rule_ids: estRuleIds })
        .then(({ error }) => { if (error) console.error('[strategy-chat] usage increment failed:', error.message); });
    }
    // TODO (Mejora #4 - Industry filter): Once clients have industria assigned, add
    // .in('industria', ['general', clientIndustry]) to the steve_knowledge query above.

    // Smart truncation: keep first 5 messages (context) + last 15 (recent) to preserve conversation intent
    const allMessages = convMessages || [];
    const recentMessages = allMessages.length > 20
      ? [...allMessages.slice(0, 5), ...allMessages.slice(-15)]
      : allMessages;

    const briefSummary = persona?.persona_data
      ? JSON.stringify(persona.persona_data)
      : 'Brief no completado aún.';

    const researchContext = research?.map((r: { research_type: string; research_data: any }) =>
      `### ${r.research_type}\n${JSON.stringify(r.research_data).slice(0, 2000)}`
    ).join('\n\n') || '';

    const knowledgeCtx = filteredKnowledge?.map((k: { categoria: string; titulo: string; contenido: string }) =>
      `### [${k.categoria.toUpperCase()}] ${k.titulo}\n${k.contenido}`
    ).join('\n\n') || '';

    const productsList = shopifyProducts || [];
    const activeProductsCount = productsList.length;
    let productsContext = '';
    if (activeProductsCount > 0) {
      const top10 = productsList.slice(0, 10);
      const priceRange = (() => {
        const mins = productsList.map((p: any) => Number(p.price_min) || 0).filter((n: number) => n > 0);
        const maxs = productsList.map((p: any) => Number(p.price_max) || 0).filter((n: number) => n > 0);
        if (!mins.length) return '';
        return `rango de precios $${Math.min(...mins).toLocaleString()} - $${Math.max(...maxs).toLocaleString()} CLP`;
      })();
      const byType: Record<string, number> = {};
      for (const p of productsList) {
        const t = p.product_type || 'Sin tipo';
        byType[t] = (byType[t] || 0) + 1;
      }
      const typesLine = Object.entries(byType).map(([k, v]) => `${k} (${v})`).join(', ');
      productsContext = `\n🛍️ CATÁLOGO SHOPIFY (${activeProductsCount}+ productos activos${priceRange ? `, ${priceRange}` : ''}):\n`;
      productsContext += `Tipos: ${typesLine}\n`;
      productsContext += `Top productos por precio (los 10 más caros activos):\n`;
      for (const p of top10) {
        const stock = p.inventory_total === -1 ? 'sin tracking' : p.inventory_total === 0 ? '⚠️ SIN STOCK' : `${p.inventory_total} u.`;
        const priceLabel = p.price_min === p.price_max
          ? `$${Number(p.price_min).toLocaleString()} CLP`
          : `$${Number(p.price_min).toLocaleString()}-$${Number(p.price_max).toLocaleString()} CLP`;
        productsContext += `  - "${p.title}" — ${priceLabel} (${stock})\n`;
      }
    }

    // === TOP PRODUCTOS VENDIDOS (live Shopify orders) ===
    let topSoldContext = '';
    if (topSoldProducts.length > 0) {
      const totalUnits = topSoldProducts.reduce((acc, p) => acc + p.units, 0);
      const totalRev = topSoldProducts.reduce((acc, p) => acc + p.revenue, 0);
      topSoldContext = `\n🔥 TOP PRODUCTOS VENDIDOS (últimos 30 días, datos live de Shopify):\n`;
      topSoldContext += `- Total movido: ${totalUnits} unidades por $${Math.round(totalRev).toLocaleString()} CLP\n`;
      for (const p of topSoldProducts) {
        const sku = p.sku ? ` [SKU: ${p.sku}]` : '';
        topSoldContext += `  - "${p.title}"${sku}: ${p.units} u. ($${Math.round(p.revenue).toLocaleString()} revenue)\n`;
      }
    } else if (shopifyConnections.length > 0) {
      topSoldContext = `\n🔥 TOP PRODUCTOS VENDIDOS: No detecté pedidos pagados en Shopify en los últimos 30 días (puede ser que el cliente esté empezando o el sync de orders esté limitado por scopes).\n`;
    }

    // === ALERTAS DE INVENTARIO (#16, #17, #19) ===
    let inventoryAlertsContext = '';
    if (productsList.length > 0) {
      const sinStock = productsList.filter((p: any) => p.inventory_total === 0);
      const sinStockNames = new Set(sinStock.map((p: any) => String(p.title || '').toLowerCase()));
      const sinImagen = productsList.filter((p: any) => !p.image_url && p.status === 'active');
      // Velocidad de rotación: stock vs ventas últimos 30d
      const rotacionLenta: any[] = [];
      const rotacionRapida: any[] = [];
      for (const p of productsList) {
        if (p.inventory_total === -1 || p.inventory_total === 0) continue;
        const sold = topSoldProducts.find(s => s.title === p.title);
        const unitsSold = sold?.units || 0;
        const stock = Number(p.inventory_total) || 0;
        if (stock > 50 && unitsSold === 0) rotacionLenta.push(p);
        if (stock > 0 && unitsSold > stock * 0.5) rotacionRapida.push({ ...p, unitsSold });
      }
      const alerts: string[] = [];
      if (sinStock.length > 0) {
        alerts.push(`⚠️ ${sinStock.length} producto(s) SIN STOCK (estás perdiendo conversiones si tenés ads activos): ${sinStock.slice(0, 5).map((p: any) => `"${String(p.title).slice(0, 40)}"`).join(', ')}`);
      }
      if (sinImagen.length > 0) {
        alerts.push(`⚠️ ${sinImagen.length} producto(s) activo(s) SIN IMAGEN: ${sinImagen.slice(0, 3).map((p: any) => `"${String(p.title).slice(0, 40)}"`).join(', ')}`);
      }
      if (rotacionLenta.length > 0) {
        alerts.push(`📉 ${rotacionLenta.length} producto(s) con stock alto pero CERO ventas en 30d (capital atrapado): ${rotacionLenta.slice(0, 3).map((p: any) => `"${String(p.title).slice(0, 40)}" (${p.inventory_total} u.)`).join(', ')}`);
      }
      if (rotacionRapida.length > 0) {
        alerts.push(`🚀 ${rotacionRapida.length} producto(s) con ROTACIÓN RÁPIDA — riesgo de quedar sin stock pronto: ${rotacionRapida.slice(0, 3).map((p: any) => `"${String(p.title).slice(0, 40)}" (${p.unitsSold}/${p.inventory_total})`).join(', ')}`);
      }
      // Bundles
      if (shopifyOrdersAnalysis?.bundles && shopifyOrdersAnalysis.bundles.length > 0) {
        const top = shopifyOrdersAnalysis.bundles[0];
        alerts.push(`🎁 BUNDLE detectado: ${top.count} clientes compraron juntos "${top.items.slice(0, 2).join('" + "')}" — oportunidad de combo/discount`);
      }
      if (alerts.length > 0) {
        inventoryAlertsContext = `\n📦 ALERTAS DE INVENTARIO Y CATÁLOGO:\n` + alerts.map(a => `- ${a}`).join('\n') + '\n';
      }
    }

    // === CUSTOMER INTELLIGENCE (#11, #27, #28) ===
    let customerIntelContext = '';
    if (emailSubsAgg && emailSubsAgg.length > 0) {
      const subs = emailSubsAgg as any[];
      const totalWithOrders = subs.filter(s => Number(s.total_orders) > 0).length;
      const repeatCount = subs.filter(s => Number(s.total_orders) >= 2).length;
      const totalSpent = subs.reduce((acc, s) => acc + (Number(s.total_spent) || 0), 0);
      const avgLtv = totalWithOrders > 0 ? Math.round(totalSpent / totalWithOrders) : 0;
      const repeatRate = subs.length > 0 ? Math.round((repeatCount / subs.length) * 1000) / 10 : 0;
      // Top 5 spenders
      const topSpenders = subs
        .filter(s => Number(s.total_spent) > 0)
        .sort((a, b) => Number(b.total_spent) - Number(a.total_spent))
        .slice(0, 5);
      // Churn signals
      const now = Date.now();
      const sixtyDaysAgoMs = now - 60 * 86400000;
      const churnRisk = subs.filter(s => {
        if (!s.last_order_at) return false;
        const last = new Date(s.last_order_at).getTime();
        return last < sixtyDaysAgoMs && Number(s.total_orders) >= 1;
      });
      customerIntelContext = `\n👥 CUSTOMER INTELLIGENCE (basado en tu lista de Klaviyo):\n`;
      customerIntelContext += `- ${subs.length} suscriptores totales · ${totalWithOrders} con al menos 1 compra (${avgLtv > 0 ? `LTV promedio $${avgLtv.toLocaleString()} CLP` : 'sin LTV calculable'})\n`;
      customerIntelContext += `- Repeat rate: ${repeatCount}/${subs.length} clientes (${repeatRate}%) — clientes con 2+ compras\n`;
      if (churnRisk.length > 0) {
        customerIntelContext += `- 🚨 ${churnRisk.length} clientes en RIESGO DE CHURN (compraron pero nada hace 60+ días) — candidatos a flujo de winback\n`;
      }
      if (topSpenders.length > 0) {
        customerIntelContext += `- TOP 5 clientes por LTV individual:\n`;
        for (const s of topSpenders) {
          const name = s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : (s.email || 'Anónimo');
          customerIntelContext += `  - ${name}: ${s.total_orders} pedidos, $${Math.round(Number(s.total_spent)).toLocaleString()} gastado\n`;
        }
      }
      // New vs returning del período actual (de Shopify orders live)
      if (shopifyOrdersAnalysis && shopifyOrdersAnalysis.totalOrders > 0) {
        const total = shopifyOrdersAnalysis.totalOrders;
        const newPct = Math.round((shopifyOrdersAnalysis.newCustomers / total) * 100);
        const retPct = Math.round((shopifyOrdersAnalysis.returningCustomers / total) * 100);
        customerIntelContext += `- Mix de pedidos últimos 30d: ${shopifyOrdersAnalysis.newCustomers} nuevos clientes (${newPct}%) · ${shopifyOrdersAnalysis.returningCustomers} repetidores (${retPct}%)\n`;
      }
    }

    // === ROAS CON MARGEN REAL (#13) ===
    let realRoasContext = '';
    const hasAdsConnection = (connections || []).some((c: any) => c.platform === 'meta' || c.platform === 'google_ads');
    if (financialConfig && hasAdsConnection) {
      const margin = Number(financialConfig.default_margin_percentage) || 0;
      if (margin > 0 && margin < 100) {
        // Usamos los datos ya en metricsContext (ya calculados arriba en este handler)
        // Buscamos los totales 30d en campaignMetrics (variable local más arriba en el handler)
        // Como están dentro de connIds.length>0 branch, necesitamos referencia: usaremos
        // el mismo aggregateCampaigns que ya se usa más abajo. Para evitar acoplamiento,
        // calculamos aquí con un mini-loop sobre lo disponible.
        let totalSpend = 0, totalRevenue = 0;
        // No tenemos campaignMetrics en este scope (está en branch); usamos topSoldProducts revenue
        // como aproximación — pero mejor hacer un mini fetch desde data ya cargada arriba.
        // Como simplificación: dejamos al modelo calcular el ROAS ajustado con los números que
        // vea en metricsContext y la regla siguiente:
        realRoasContext = `\n💎 ROAS AJUSTADO POR MARGEN (regla para Steve):\n`;
        realRoasContext += `- El cliente tiene margen bruto de ${margin}%.\n`;
        realRoasContext += `- Cuando hables de ROAS, calculá también el ROAS REAL = ROAS bruto × ${(margin / 100).toFixed(2)}.\n`;
        realRoasContext += `- ROAS bruto >${(100 / margin).toFixed(2)}x es necesario para que la campaña aporte utilidad real (breakeven).\n`;
        realRoasContext += `- Usá esto para evaluar si una campaña con ROAS 3x está realmente generando plata o solo cubriendo costo.\n`;
      }
    }

    // === COMMITMENTS STATUS (#37) ===
    let commitmentsStatusContext = '';
    if (commitments && commitments.length > 0) {
      const overdue = commitments.filter((c: any) => c.follow_up_date && new Date(c.follow_up_date).getTime() < Date.now());
      if (overdue.length > 0) {
        commitmentsStatusContext = `\n⏰ COMPROMISOS VENCIDOS SIN SEGUIMIENTO (${overdue.length}):\n`;
        for (const c of overdue.slice(0, 3)) {
          commitmentsStatusContext += `- "${String(c.commitment).slice(0, 100)}" (vencía ${new Date(c.follow_up_date).toLocaleDateString('es-CL')})\n`;
        }
        commitmentsStatusContext += `Si el cliente menciona algún tema relacionado, traé estos compromisos a colación y preguntá si avanzaron.\n`;
      }
    }

    // === CALENDARIO ESTACIONAL (#39) ===
    const seasonalContext = buildSeasonalContext(now);

    // === FINANCIAL CONFIG ===
    let financialContext = '';
    if (financialConfig) {
      const margin = Number(financialConfig.default_margin_percentage) || 0;
      const shopifyComm = Number(financialConfig.shopify_commission_percentage) || 0;
      const gatewayComm = Number(financialConfig.payment_gateway_commission) || 0;
      const shipping = Number(financialConfig.shipping_cost_per_order) || 0;
      const otherFixed = Number(financialConfig.other_fixed_costs) || 0;
      financialContext = `\n💰 CONFIG FINANCIERA DEL CLIENTE:\n`;
      if (margin > 0) financialContext += `- Margen bruto promedio: ${margin}%\n`;
      if (shopifyComm > 0) financialContext += `- Comisión Shopify: ${shopifyComm}%\n`;
      if (gatewayComm > 0) financialContext += `- Comisión pasarela de pago: ${gatewayComm}%\n`;
      if (shipping > 0) financialContext += `- Costo envío promedio: $${shipping.toLocaleString()} CLP/orden\n`;
      if (otherFixed > 0) financialContext += `- Otros costos fijos: $${otherFixed.toLocaleString()} CLP\n`;
      financialContext += `Usá estos números para evaluar si el CPA / ROAS de las campañas es viable o no.\n`;
    }

    // === EMAIL / KLAVIYO ===
    let emailContext = '';
    const evts = emailEvents || [];
    const camps = emailCampaigns || [];
    const subsCount = emailSubsAgg?.length || 0;
    const activeSubs = (emailSubsAgg || []).filter((s: any) => s.status === 'active' || s.status === 'subscribed').length;
    if (camps.length > 0 || evts.length > 0 || subsCount > 0) {
      emailContext = `\n📧 EMAIL / KLAVIYO (últimos 30 días):\n`;
      if (subsCount > 0) emailContext += `- Lista: ${subsCount} suscriptores en BD (${activeSubs} activos)\n`;
      if (evts.length > 0) {
        const opens = evts.filter((e: any) => e.event_type === 'open' || e.event_type === 'opened').length;
        const clicks = evts.filter((e: any) => e.event_type === 'click' || e.event_type === 'clicked').length;
        const bounces = evts.filter((e: any) => e.event_type === 'bounce' || e.event_type === 'bounced').length;
        const unsubs = evts.filter((e: any) => e.event_type === 'unsubscribe' || e.event_type === 'unsubscribed').length;
        emailContext += `- Eventos 30d: ${opens} opens, ${clicks} clicks, ${bounces} bounces, ${unsubs} unsubs\n`;
        if (clicks > 0 && opens > 0) emailContext += `- Click-to-open rate: ${((clicks / opens) * 100).toFixed(1)}%\n`;
      }
      if (camps.length > 0) {
        emailContext += `- Últimas campañas enviadas:\n`;
        for (const cmp of camps.slice(0, 5)) {
          const sent = cmp.sent_count || 0;
          const total = cmp.total_recipients || 0;
          const date = cmp.sent_at ? new Date(cmp.sent_at).toLocaleDateString('es-CL') : '?';
          emailContext += `  - "${(cmp.subject || cmp.name || 'Sin subject').slice(0, 80)}" — ${date} (${sent}/${total} enviados)\n`;
        }
      }
    }

    // === WHATSAPP ===
    let waContext = '';
    const waList = waMessages || [];
    if (waList.length > 0) {
      const inbound = waList.filter((m: any) => m.direction === 'inbound').length;
      const outbound = waList.filter((m: any) => m.direction === 'outbound').length;
      const uniqueContacts = new Set(waList.map((m: any) => m.contact_phone || m.contact_name).filter(Boolean)).size;
      waContext = `\n💬 WHATSAPP (últimos 30 días):\n`;
      waContext += `- ${waList.length} mensajes (${inbound} inbound, ${outbound} outbound) con ${uniqueContacts} contactos únicos\n`;
      const lastInbound = waList.filter((m: any) => m.direction === 'inbound').slice(0, 3);
      if (lastInbound.length > 0) {
        waContext += `- Últimos mensajes recibidos:\n`;
        for (const m of lastInbound) {
          waContext += `  - ${m.contact_name || 'Sin nombre'}: "${(m.body || '').slice(0, 100)}"\n`;
        }
      }
    }

    // === COMPETENCIA ===
    let competitorContext = '';
    const trackingList = competitorTracking || [];
    const adsList = competitorAds || [];
    if (trackingList.length > 0 || adsList.length > 0) {
      competitorContext = `\n🎯 COMPETENCIA:\n`;
      if (trackingList.length > 0) {
        competitorContext += `- Monitoreando: ${trackingList.map((c: any) => c.display_name || c.ig_handle).filter(Boolean).join(', ')}\n`;
      }
      if (adsList.length > 0) {
        competitorContext += `- Ads activos detectados (top por días corriendo):\n`;
        for (const ad of adsList.slice(0, 5)) {
          const headline = (ad.ad_headline || ad.ad_text || '').slice(0, 100);
          competitorContext += `  - "${headline}" (${ad.days_running || 0}d corriendo en ${(ad.platforms || []).join(',') || 'meta'})\n`;
        }
      }
    }

    // === RECOMENDACIONES PRE-COMPUTADAS ===
    let recsContext = '';
    const recs = campaignRecs || [];
    if (recs.length > 0) {
      recsContext = `\n🤖 RECOMENDACIONES PRE-COMPUTADAS (otros agentes ya las generaron):\n`;
      for (const r of recs.slice(0, 6)) {
        const prio = r.priority ? `[P${r.priority}]` : '';
        recsContext += `- ${prio} [${r.platform || '?'}] ${r.recommendation_type || ''}: ${(r.recommendation_text || '').slice(0, 200)}\n`;
      }
    }

    // === CREATIVE HISTORY (fatiga + ganadores) ===
    let creativesContext = '';
    const creatives = creativeHist || [];
    if (creatives.length > 0) {
      creativesContext = `\n🎨 PERFORMANCE DE CREATIVOS (últimos 30d, top por score):\n`;
      for (const c of creatives.slice(0, 8)) {
        const verdict = c.performance_verdict || '?';
        const score = c.performance_score != null ? `score ${c.performance_score}` : '';
        const metrics = c.channel === 'klaviyo'
          ? `OR ${c.klaviyo_open_rate ? (c.klaviyo_open_rate * 100).toFixed(1) + '%' : 'N/A'}, CR ${c.klaviyo_click_rate ? (c.klaviyo_click_rate * 100).toFixed(1) + '%' : 'N/A'}`
          : `CTR ${c.meta_ctr ? (c.meta_ctr * 100).toFixed(2) + '%' : 'N/A'}, ROAS ${c.meta_roas?.toFixed(2) || 'N/A'}, CPA $${c.meta_cpa?.toLocaleString() || 'N/A'}`;
        creativesContext += `  - [${c.channel}/${c.type || '?'}] "${(c.theme || c.content_summary || '').slice(0, 80)}" — ${verdict} ${score} (${metrics})\n`;
        if (c.performance_reason) creativesContext += `    Motivo: ${c.performance_reason.slice(0, 120)}\n`;
      }
    }

    // === CRITERIO RULES FAILED ===
    let criterioContext = '';
    const failed = criterioFailed || [];
    if (failed.length > 0) {
      criterioContext = `\n⚠️ REGLAS CRITERIO QUE EL CLIENTE NO ESTÁ CUMPLIENDO (últimos 14d):\n`;
      for (const f of failed.slice(0, 8)) {
        criterioContext += `- Regla ${f.rule_id} (${f.entity_type}): valor ${f.actual_value} vs esperado ${f.expected_value}\n`;
        if (f.details && typeof f.details === 'string') criterioContext += `  ${f.details.slice(0, 150)}\n`;
      }
    }

    // === SHOPIFY ABANDONED CHECKOUTS ===
    let abandonedContext = '';
    const abandonedList = abandonedCheckouts || [];
    if (abandonedList.length > 0) {
      const totalLost = abandonedList.reduce((acc: number, co: any) => acc + (Number(co.total_price) || 0), 0);
      const withPhone = abandonedList.filter((co: any) => co.customer_phone).length;
      const withEmail = abandonedList.filter((co: any) => co.customer_email).length;
      abandonedContext = `\n🛒 CARRITOS ABANDONADOS SHOPIFY (últimos 30 días, sin completar):\n`;
      abandonedContext += `- Total: ${abandonedList.length} carritos por $${Math.round(totalLost).toLocaleString()} CLP en revenue PERDIDO/PENDIENTE\n`;
      abandonedContext += `- Con teléfono (recuperables vía WA): ${withPhone}/${abandonedList.length}\n`;
      abandonedContext += `- Con email (recuperables vía Klaviyo): ${withEmail}/${abandonedList.length}\n`;
      abandonedContext += `- Top 5 más recientes:\n`;
      for (const co of abandonedList.slice(0, 5)) {
        const items = (co.line_items || []).slice(0, 2).map((li: any) => li.title).join(', ');
        const date = new Date(co.created_at).toLocaleDateString('es-CL');
        const contact = co.customer_phone ? '📱' : co.customer_email ? '📧' : '👻';
        abandonedContext += `  - ${date} ${contact} ${co.customer_name || 'Anónimo'} — $${Math.round(co.total_price).toLocaleString()} CLP (${items || 'productos sin detalle'})\n`;
      }
      abandonedContext += `Acción sugerida si hay >5 carritos: recordá al cliente activar flujo de recuperación (WA si tiene phone, Klaviyo si tiene email).\n`;
    }

    // === EPISODIC MEMORY ===
    let memoryContext = '';
    const memList = episodicMem || [];
    if (memList.length > 0) {
      memoryContext = `\n🧠 MEMORIA DE SESIONES PASADAS CON ESTE CLIENTE:\n`;
      for (const m of memList.slice(0, 6)) {
        const date = new Date(m.created_at).toLocaleDateString('es-CL');
        memoryContext += `- [${date}] ${m.event_type}: ${(m.summary || '').slice(0, 200)}\n`;
      }
    }

    const safeConnections = connections || [];
    if (!connections) {
      console.warn('[EST] platform_connections query returned null — treating as no connections');
    }
    const connIds = safeConnections.map((c: { id: string }) => c.id);
    const shopifyConnIds = safeConnections.filter((c: { platform: string }) => c.platform === 'shopify').map((c: { id: string }) => c.id);
    const metaConnIds = safeConnections.filter((c: { platform: string }) => c.platform === 'meta').map((c: { id: string }) => c.id);
    const googleConnIds = safeConnections.filter((c: { platform: string }) => c.platform === 'google_ads').map((c: { id: string }) => c.id);

    let metricsContext = '';

    if (connIds.length > 0) {
      // PARALLELIZED: platform_metrics + campaign_metrics are independent
      const [{ data: platformMetrics }, { data: campaignMetrics }] = await Promise.all([
        supabase
          .from('platform_metrics')
          .select('metric_type, metric_value, metric_date, currency, connection_id')
          .in('connection_id', connIds)
          .gte('metric_date', ninetyDaysAgo)
          .order('metric_date', { ascending: false })
          .limit(1000),
        supabase
          .from('campaign_metrics')
          .select('campaign_name, campaign_status, spend, impressions, clicks, conversions, conversion_value, metric_date, connection_id')
          .in('connection_id', connIds)
          .gte('metric_date', ninetyDaysAgo)
          .order('metric_date', { ascending: false })
          .limit(1000),
      ]);
      timelog('estrategia-metrics-queries');

      // Helper: aggregate metrics for a date range and optional connection filter
      function aggregateMetrics(
        data: typeof platformMetrics,
        dateFrom: string,
        dateTo: string,
        connFilter?: string[]
      ) {
        const byType: Record<string, number> = {};
        for (const m of (data || [])) {
          if (m.metric_date < dateFrom || m.metric_date > dateTo) continue;
          if (connFilter && !connFilter.includes(m.connection_id)) continue;
          byType[m.metric_type] = (byType[m.metric_type] || 0) + (Number(m.metric_value) || 0);
        }
        return byType;
      }

      function aggregateCampaigns(
        data: typeof campaignMetrics,
        dateFrom: string,
        dateTo: string
      ) {
        let spend = 0, impressions = 0, clicks = 0, conversions = 0, revenue = 0;
        const byCampaign: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; status: string }> = {};
        for (const m of (data || [])) {
          if (m.metric_date < dateFrom || m.metric_date > dateTo) continue;
          spend += Number(m.spend) || 0;
          impressions += Number(m.impressions) || 0;
          clicks += Number(m.clicks) || 0;
          conversions += Number(m.conversions) || 0;
          revenue += Number(m.conversion_value) || 0;
          const name = sanitizeForPrompt(m.campaign_name || 'Sin nombre', 200);
          if (!byCampaign[name]) byCampaign[name] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0, status: m.campaign_status || 'UNKNOWN' };
          byCampaign[name].spend += Number(m.spend) || 0;
          byCampaign[name].impressions += Number(m.impressions) || 0;
          byCampaign[name].clicks += Number(m.clicks) || 0;
          byCampaign[name].conversions += Number(m.conversions) || 0;
          byCampaign[name].revenue += Number(m.conversion_value) || 0;
        }
        return { totals: { spend, impressions, clicks, conversions, revenue }, byCampaign };
      }

      // === SHOPIFY METRICS (same 30-day period) ===
      const shopify30d = aggregateMetrics(platformMetrics, thirtyDaysAgo, today, shopifyConnIds);
      const shopifyPrev30d = aggregateMetrics(platformMetrics, sixtyDaysAgo, thirtyDaysAgo, shopifyConnIds);
      const shopify7d = aggregateMetrics(platformMetrics, sevenDaysAgo, today, shopifyConnIds);
      const shopifyPrev7d = aggregateMetrics(platformMetrics, fourteenDaysAgo, sevenDaysAgo, shopifyConnIds);

      if (Object.keys(shopify30d).length > 0) {
        const rev30 = Math.round(shopify30d.revenue || shopify30d.gross_revenue || 0);
        const ord30 = Math.round(shopify30d.orders || shopify30d.orders_count || 0);
        const revPrev30 = Math.round(shopifyPrev30d.revenue || shopifyPrev30d.gross_revenue || 0);
        const rev7 = Math.round(shopify7d.revenue || shopify7d.gross_revenue || 0);
        const ord7 = Math.round(shopify7d.orders || shopify7d.orders_count || 0);
        const revPrev7 = Math.round(shopifyPrev7d.revenue || shopifyPrev7d.gross_revenue || 0);
        const pctChange30 = revPrev30 > 0 ? ((rev30 - revPrev30) / revPrev30 * 100).toFixed(1) : 'N/A';
        const pctChange7 = revPrev7 > 0 ? ((rev7 - revPrev7) / revPrev7 * 100).toFixed(1) : 'N/A';
        const ticket30 = ord30 > 0 ? Math.round(rev30 / ord30) : 0;

        metricsContext += `\n📦 SHOPIFY — VENTAS (período: ${thirtyDaysAgo} a ${today}):\n`;
        metricsContext += `- Últimos 30 días: $${rev30.toLocaleString()} CLP en ${ord30} pedidos (ticket promedio: $${ticket30.toLocaleString()})\n`;
        metricsContext += `- vs 30 días anteriores: ${pctChange30}% ${Number(pctChange30) > 0 ? '📈' : Number(pctChange30) < 0 ? '📉' : '➡️'}\n`;
        metricsContext += `- Últimos 7 días: $${rev7.toLocaleString()} CLP en ${ord7} pedidos\n`;
        metricsContext += `- vs 7 días anteriores: ${pctChange7}% ${Number(pctChange7) > 0 ? '📈' : Number(pctChange7) < 0 ? '📉' : '➡️'}\n`;

        // Week comparison (this week Mon-today vs last week Mon-Sun)
        const thisWeek = aggregateMetrics(platformMetrics, thisMonday, today, shopifyConnIds);
        const lastWeek = aggregateMetrics(platformMetrics, lastMonday, lastSunday, shopifyConnIds);
        const twRev = Math.round(thisWeek.revenue || 0);
        const lwRev = Math.round(lastWeek.revenue || 0);
        const twOrd = Math.round(thisWeek.orders || 0);
        const lwOrd = Math.round(lastWeek.orders || 0);
        if (twRev > 0 || lwRev > 0) {
          const weekPct = lwRev > 0 ? ((twRev - lwRev) / lwRev * 100).toFixed(1) : 'N/A';
          metricsContext += `- Esta semana (${thisMonday} a hoy): $${twRev.toLocaleString()} CLP, ${twOrd} pedidos\n`;
          metricsContext += `- Semana anterior (${lastMonday} a ${lastSunday}): $${lwRev.toLocaleString()} CLP, ${lwOrd} pedidos (${weekPct}%)\n`;
        }

        // Month comparison (this month vs last month)
        const thisMonth = aggregateMetrics(platformMetrics, thisMonthStart, today, shopifyConnIds);
        const lastMonth = aggregateMetrics(platformMetrics, lastMonthStart, lastMonthEnd, shopifyConnIds);
        const tmRev = Math.round(thisMonth.revenue || 0);
        const lmRev = Math.round(lastMonth.revenue || 0);
        const tmOrd = Math.round(thisMonth.orders || 0);
        const lmOrd = Math.round(lastMonth.orders || 0);
        if (tmRev > 0 || lmRev > 0) {
          const monthPct = lmRev > 0 ? ((tmRev - lmRev) / lmRev * 100).toFixed(1) : 'N/A';
          metricsContext += `- Este mes (desde ${thisMonthStart}): $${tmRev.toLocaleString()} CLP, ${tmOrd} pedidos\n`;
          metricsContext += `- Mes anterior: $${lmRev.toLocaleString()} CLP, ${lmOrd} pedidos (${monthPct}%)\n`;
        }

        // Daily breakdown (last 14 days) — enables Steve to answer "how was Monday?"
        const dailyRows: { date: string; rev: number; ord: number }[] = [];
        for (const m of (platformMetrics || [])) {
          if (!shopifyConnIds.includes(m.connection_id)) continue;
          if (m.metric_date < fourteenDaysAgo) continue;
          let row = dailyRows.find(r => r.date === m.metric_date);
          if (!row) { row = { date: m.metric_date, rev: 0, ord: 0 }; dailyRows.push(row); }
          if (m.metric_type === 'revenue') row.rev += Number(m.metric_value) || 0;
          if (m.metric_type === 'orders') row.ord += Number(m.metric_value) || 0;
        }
        dailyRows.sort((a, b) => a.date.localeCompare(b.date));
        if (dailyRows.length > 0) {
          const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
          metricsContext += `\nDESGLOSE DIARIO Shopify (últimos 14 días):\n`;
          for (const d of dailyRows) {
            const dayName = dayNames[new Date(d.date + 'T12:00:00').getDay()];
            metricsContext += `  ${d.date} (${dayName}): $${Math.round(d.rev).toLocaleString()} CLP, ${Math.round(d.ord)} pedidos\n`;
          }
        }
      }

      // === META/GOOGLE ADS METRICS (same 30-day period) ===
      const ads30d = aggregateCampaigns(campaignMetrics, thirtyDaysAgo, today);
      const adsPrev30d = aggregateCampaigns(campaignMetrics, sixtyDaysAgo, thirtyDaysAgo);
      const ads7d = aggregateCampaigns(campaignMetrics, sevenDaysAgo, today);
      const adsPrev7d = aggregateCampaigns(campaignMetrics, fourteenDaysAgo, sevenDaysAgo);

      if (ads30d.totals.spend > 0 || Object.keys(ads30d.byCampaign).length > 0) {
        const s30 = ads30d.totals;
        const sPrev = adsPrev30d.totals;
        const s7 = ads7d.totals;
        const s7prev = adsPrev7d.totals;
        const roas30 = s30.spend > 0 ? (s30.revenue / s30.spend).toFixed(2) : 'N/A';
        const ctr30 = s30.impressions > 0 ? ((s30.clicks / s30.impressions) * 100).toFixed(2) : 'N/A';
        const spendChange = sPrev.spend > 0 ? ((s30.spend - sPrev.spend) / sPrev.spend * 100).toFixed(1) : 'N/A';

        metricsContext += `\n📣 META/GOOGLE ADS (período: ${thirtyDaysAgo} a ${today}):\n`;
        metricsContext += `- Últimos 30 días: Gasto $${Math.round(s30.spend).toLocaleString()}, Revenue ads $${Math.round(s30.revenue).toLocaleString()}, ROAS ${roas30}x, CTR ${ctr30}%, ${s30.conversions} conversiones\n`;
        metricsContext += `- vs 30 días anteriores: gasto ${spendChange}%\n`;
        metricsContext += `- Últimos 7 días: Gasto $${Math.round(s7.spend).toLocaleString()}, Revenue $${Math.round(s7.revenue).toLocaleString()}, ${s7.conversions} conversiones\n`;

        // Per-campaign breakdown (top 10 by spend, 30-day)
        const campaignLines = Object.entries(ads30d.byCampaign)
          .sort(([, a], [, b]) => b.spend - a.spend)
          .slice(0, 10)
          .map(([name, d]) => {
            const roas = d.spend > 0 ? (d.revenue / d.spend).toFixed(2) : 'N/A';
            const ctr = d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) : 'N/A';
            return `  - "${name}" [${d.status}]: $${Math.round(d.spend).toLocaleString()} gasto, $${Math.round(d.revenue).toLocaleString()} revenue, ROAS ${roas}x, CTR ${ctr}%, ${d.conversions} conv`;
          }).join('\n');
        if (campaignLines) metricsContext += `\nCAMPAÑAS (30 días, por gasto):\n${campaignLines}\n`;

        // Daily Meta/Google ads breakdown (last 14 days) — impressions, clicks, CTR, CPC, spend
        const adsDailyRows: { date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }[] = [];
        for (const m of (campaignMetrics || [])) {
          if (m.metric_date < fourteenDaysAgo) continue;
          let row = adsDailyRows.find(r => r.date === m.metric_date);
          if (!row) { row = { date: m.metric_date, spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 }; adsDailyRows.push(row); }
          row.spend += Number(m.spend) || 0;
          row.impressions += Number(m.impressions) || 0;
          row.clicks += Number(m.clicks) || 0;
          row.conversions += Number(m.conversions) || 0;
          row.revenue += Number(m.conversion_value) || 0;
        }
        adsDailyRows.sort((a, b) => a.date.localeCompare(b.date));
        if (adsDailyRows.length > 0) {
          const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
          metricsContext += `\nDESGLOSE DIARIO Ads (últimos 14 días):\n`;
          for (const d of adsDailyRows) {
            const dayName = dayNames[new Date(d.date + 'T12:00:00').getDay()];
            const ctr = d.impressions > 0 ? ((d.clicks / d.impressions) * 100).toFixed(2) : '0';
            const cpc = d.clicks > 0 ? Math.round(d.spend / d.clicks) : 0;
            metricsContext += `  ${d.date} (${dayName}): $${Math.round(d.spend).toLocaleString()} gasto, ${d.impressions.toLocaleString()} imp, ${d.clicks} clicks, CTR ${ctr}%, CPC $${cpc.toLocaleString()}, ${d.conversions} conv\n`;
          }
        }
      }

      // === CROSS-PLATFORM ROAS ===
      const shopifyRev30 = Math.round(shopify30d.revenue || shopify30d.gross_revenue || 0);
      const totalAdSpend30 = Math.round(ads30d.totals.spend);
      if (shopifyRev30 > 0 && totalAdSpend30 > 0) {
        const crossRoas = (shopifyRev30 / totalAdSpend30).toFixed(2);
        metricsContext += `\n🎯 ROAS CRUZADO (Shopify revenue / Ad spend, mismos 30 días):\n`;
        metricsContext += `- Revenue Shopify: $${shopifyRev30.toLocaleString()} CLP / Gasto Ads: $${totalAdSpend30.toLocaleString()} = ROAS ${crossRoas}x\n`;
      }

      if (!metricsContext) {
        metricsContext = '\n⚠️ MÉTRICAS: El cliente tiene conexiones activas pero NO hay datos de métricas en los últimos 90 días. Es probable que la sincronización no haya corrido aún o que las plataformas estén recién conectadas. NO inventes números — di explícitamente que aún no hay datos disponibles y sugiere revisar las conexiones.\n';
      }
    } else {
      metricsContext = '\n⚠️ MÉTRICAS: El cliente NO tiene plataformas conectadas (Meta, Google, Shopify). NO inventes métricas ni números. Di claramente que no hay datos porque no hay plataformas conectadas y recomienda conectarlas.\n';
    }

    // Add current connection status to prevent hallucination from old chat history
    const platformNames: Record<string, string> = { shopify: 'Shopify', meta: 'Meta Ads', google_ads: 'Google Ads', klaviyo: 'Klaviyo' };
    const allPlatforms = ['shopify', 'meta', 'google_ads', 'klaviyo'];
    const connectedPlatforms = (connections || []).map((c: { platform: string }) => c.platform);
    const activePlatforms = allPlatforms.filter(p => connectedPlatforms.includes(p));
    const notConnected = allPlatforms.filter(p => !connectedPlatforms.includes(p));

    metricsContext += '\n--- ESTADO ACTUAL DE CONEXIONES (fuente de verdad, ignora cualquier información contradictoria del historial de chat) ---\n';
    if (activePlatforms.length > 0) {
      metricsContext += `Conectadas ahora: ${activePlatforms.map(p => platformNames[p] || p).join(', ')}.\n`;
    }
    if (notConnected.length > 0) {
      metricsContext += `No conectadas: ${notConnected.map(p => platformNames[p] || p).join(', ')}. No tienes acceso a datos de estas plataformas. Si el cliente menciona datos de una plataforma no conectada, recuérdale amablemente que primero debe conectarla desde la sección de Conexiones.\n`;
    }
    metricsContext += '---\n';

    // D.4: Inject creative performance history when user asks about campaigns/ads
    const wantsCreative = mensajeLower.includes('campaña') || mensajeLower.includes('campaign') ||
      mensajeLower.includes('anuncio') || mensajeLower.includes('copy') ||
      mensajeLower.includes('crear') || mensajeLower.includes('generar') ||
      mensajeLower.includes('email') || mensajeLower.includes('ads');
    let creativeHistoryCtx = '';
    if (wantsCreative) {
      try {
        const channel = mensajeLower.includes('email') || mensajeLower.includes('klaviyo') ? 'klaviyo' : 'meta';
        creativeHistoryCtx = await getCreativeContext(client_id, channel);
      } catch (ctxErr) {
        console.error('[strategy-chat] getCreativeContext failed (non-blocking):', ctxErr);
      }
    }

    const estrategiaSystemPrompt = `Eres Steve, un Bulldog Francés con un doctorado en Performance Marketing de la Universidad de Perros de Stanford. Eres el consultor estratégico del cliente.

PERSONALIDAD:
- Perro literal, brutalmente honesto, sin filtros
- Mezcla jerga de marketing con referencias perrunas
- Si algo es humo, lo ladras claro
- Usas emojis: 🐕 🎯 💰 📊 🚀 😤
- Groserías ocasionales cuando algo es absurdo
- Referencias a tu doctorado de Stanford

🌎 IDIOMA: Español latinoamericano neutro. NO uses voseo argentino.

ROL: Consultor estratégico libre. El cliente puede preguntarte CUALQUIER COSA sobre marketing, estrategia, competencia, posicionamiento, pricing, campañas, copywriting, SEO, etc. Responde con profundidad y datos concretos basándote en el brief, la investigación del cliente Y LOS DATOS REALES DE SUS MÉTRICAS.

IMPORTANTE — MÉTRICAS Y DATOS:
1. Tienes acceso a las métricas REALES del cliente. ÚSALAS. Cita números concretos.
2. TODOS los datos de Shopify y Meta/Google usan el MISMO período. Puedes comparar directamente.
3. Tienes datos de 90 días: 30d actuales, 30d anteriores, y 30d más para contexto.
4. Tienes datos de 7 días actuales Y 7 días anteriores para análisis de corto plazo.
5. Tienes ESTA SEMANA vs SEMANA ANTERIOR y ESTE MES vs MES ANTERIOR con números exactos.
6. Tienes un DESGLOSE DIARIO de los últimos 14 días — úsalo para responder preguntas como "cómo fue el lunes", "qué día vendimos más", "tendencia de esta semana día a día".
7. SIEMPRE menciona el período cuando des números: "en los últimos 30 días", "esta semana vs la anterior", etc.
8. Si el usuario pide comparar períodos, usa los datos disponibles: semana, mes, 7d, 30d. Sé específico con las fechas.
9. NUNCA digas "no tengo acceso" ni "no puedo ver tus métricas". SÍ tienes los datos — están abajo.
10. Si un dato específico NO está disponible, di exactamente qué falta y por qué (ej: "no tengo datos de Google Ads porque no está conectado").
11. Da respuestas CONCRETAS con números. Nada de respuestas vacías o evasivas.
12. El ROAS cruzado (Shopify revenue / Ad spend) es la métrica más importante — úsala.

🛑 REGLAS ABSOLUTAS DE TRANSPARENCIA SOBRE LOS DATOS (NUNCA romper):
A. Si abajo aparece "📦 SHOPIFY — VENTAS" o "🛍️ CATÁLOGO SHOPIFY" o el bloque "Conectadas ahora" incluye Shopify → el cliente TIENE Shopify conectado y vos tenés acceso. NUNCA digas "no tengo conectado tu Shopify" ni "no tengo datos de tu tienda" ni "no estoy viendo tu Shopify".
B. Lo que SÍ tenés de Shopify (cuando hay conexión activa): revenue diario, número de pedidos diarios, ticket promedio, comparaciones 7d/30d/semana/mes, desglose diario 14d, catálogo de productos activos con precio y stock.
C. Lo que NO tenés de Shopify hoy (decílo así, NO digas "no tengo datos"): sesiones, tasa de conversión (CR), tráfico por fuente, tiempo en sitio, bounce rate. Si te piden algo de esta lista, decí "ese dato no se está sincronizando hoy, lo que sí puedo decirte es X" — NUNCA "no estoy conectado".
D. Lo mismo aplica a Meta y Google Ads: si el bloque "Conectadas ahora" los lista, tenés acceso. Spend, impressions, clicks, conversions, ROAS y campañas individuales están en CAMPAÑAS abajo.
E. Si hay 0 filas en una métrica pero la conexión existe → decí "tu Shopify está conectado pero no registró ventas en este período" (NO "no tengo datos").

NO eres un cuestionario. NO hagas preguntas estructuradas. Simplemente conversa y asesora.

${persona?.is_complete ? '' : '⚠️ NOTA: El brief del cliente aún NO está completo. Puedes responder sus preguntas pero recuérdale que para un análisis más profundo debería completar el brief en la pestaña "Steve".'}

=== MÉTRICAS REALES (PRIORIDAD MÁXIMA — usa estos datos en TODA respuesta) ===
${metricsContext}
${productsContext}
${topSoldContext}
${inventoryAlertsContext}
${customerIntelContext}
${realRoasContext}
${commitmentsStatusContext}
${seasonalContext}
${financialContext}
${emailContext}
${waContext}
${competitorContext}
${recsContext}
${creativesContext}
${criterioContext}
${abandonedContext}
${memoryContext}

BRIEF DEL CLIENTE:
${briefSummary}

${researchContext ? `INVESTIGACIÓN DE MARCA:\n${researchContext}\n` : ''}
${knowledgeCtx ? `CONOCIMIENTO APRENDIDO:\n${knowledgeCtx}\n` : ''}
${commitments && commitments.length > 0
  ? `\nCOMPROMISOS PENDIENTES CON ESTE CLIENTE:\n${commitments.map((c: any) =>
      `- "${c.commitment}" (acordado: ${new Date(c.agreed_date).toLocaleDateString('es-CL')}${c.follow_up_date ? `, seguimiento: ${new Date(c.follow_up_date).toLocaleDateString('es-CL')}` : ''})`
    ).join('\n')}\nSi es relevante, pregunta por el progreso de estos compromisos.\n`
  : ''}
${creativeHistoryCtx}
Tienes herramientas para buscar información. Si el usuario pregunta algo que no sabes o sobre lo que no tienes reglas, usa buscar_youtube o buscar_web para encontrar información actualizada antes de responder. Si aprendes algo nuevo y valioso durante la búsqueda, usa guardar_regla para guardarlo.

📊 REPORTES PDF (tool generar_reporte_pdf): Si el usuario pide explícitamente un "reporte", "dashboard exportable", "resumen formal", "PDF", "documento", o frases similares — DISPARÁ la tool. Inferí el rango de fechas del lenguaje natural (ej. "últimos 30 días" → from = today - 30, to = today; "marzo" → from=2026-03-01, to=2026-03-31). HOY ES ${today}. Inferí los temas según lo que pida: Meta → ads_meta + creativos; Google → ads_google; Shopify/ventas → shopify; email/Klaviyo → email; WhatsApp → whatsapp; carritos abandonados → abandoned; competencia → competencia; catálogo/productos → catalogo; diagnóstico/Criterio → criterio. Si no especifica tema o pide "todo / completo / general" → temas=["all"]. Después de obtener la URL, respondé al cliente con el link en formato markdown [Ver reporte PDF](URL) y agregá 3 bullets resumen del contenido.

Responde SIEMPRE en español. Sé directo, concreto, y da recomendaciones accionables. Cuando hables de métricas, cita los números reales que tienes.`;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return c.json({ error: 'AI service not configured' }, 500);

    const aiMessages = truncateMessages(sanitizeMessagesForAnthropic(recentMessages, message));

    // Truncate system prompt if too large (Sonnet 4.6 handles 200k tokens ~800k chars)
    const maxSystemLen = 80000;
    let truncatedSystem = estrategiaSystemPrompt.length > maxSystemLen
      ? estrategiaSystemPrompt.slice(0, maxSystemLen) + '\n\n[...contexto truncado por límite de tamaño]'
      : estrategiaSystemPrompt;

    // === TOOLS for agentic search loop ===
    const steveTools = [
      {
        name: 'buscar_youtube',
        description: 'Busca videos en YouTube sobre un tema de marketing. Úsalo cuando no tengas suficiente conocimiento sobre el tema que pregunta el usuario.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string' as const, description: 'Tema a buscar en YouTube' },
          },
          required: ['query'],
        },
      },
      {
        name: 'buscar_web',
        description: 'Busca información en la web sobre un tema. Úsalo para datos actualizados o temas que no están en tu base de conocimiento.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string' as const, description: 'Tema a buscar en la web' },
          },
          required: ['query'],
        },
      },
      {
        name: 'guardar_regla',
        description: 'Guarda una regla nueva que aprendiste durante la búsqueda para usarla en futuras conversaciones.',
        input_schema: {
          type: 'object' as const,
          properties: {
            titulo: { type: 'string' as const, description: 'Título corto de la regla (máx 60 chars)' },
            contenido: { type: 'string' as const, description: 'Contenido de la regla en formato CUANDO/HAZ/PORQUE' },
            categoria: { type: 'string' as const, description: 'Categoría: meta_ads, google, seo, klaviyo, shopify, brief, anuncios, buyer_persona, analisis' },
          },
          required: ['titulo', 'contenido', 'categoria'],
        },
      },
      {
        name: 'generar_reporte_pdf',
        description: 'Genera un reporte PDF branded con la performance del cliente. ÚSALO cuando el cliente pida explícitamente un reporte, dashboard, resumen formal, o exportable. Inferí el rango de fechas (from/to en formato YYYY-MM-DD) del lenguaje natural del usuario ("últimos 14 días", "marzo", "Q1", etc.) — usá la fecha de hoy como referencia. Inferí los temas: si el usuario menciona Meta/Facebook/Instagram → ads_meta + creativos; Google → ads_google; ventas/Shopify → shopify; mails/Klaviyo → email; carritos abandonados → abandoned; competencia → competencia; productos/catálogo → catalogo; reglas/diagnóstico → criterio; whatsapp → whatsapp. Si no especifica tema, usá ["all"]. Devuelvo URL del PDF que respondés con el link.',
        input_schema: {
          type: 'object' as const,
          properties: {
            from: { type: 'string' as const, description: 'Fecha inicio en formato YYYY-MM-DD' },
            to: { type: 'string' as const, description: 'Fecha fin en formato YYYY-MM-DD' },
            temas: {
              type: 'array' as const,
              items: { type: 'string' as const },
              description: 'Lista de temas: ads_meta, ads_google, shopify, email, whatsapp, abandoned, competencia, creativos, catalogo, criterio, all',
            },
          },
          required: ['from', 'to', 'temas'],
        },
      },
    ];

    timelog('estrategia-pre-anthropic');

    // === AGENTIC LOOP — Steve can search before responding ===
    let agentMessages: any[] = [...aiMessages]; // copy the messages array (any[] for tool_use/tool_result shapes)
    let finalResponse = '';
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 4; // Max 4 turns (3 search/learn + 1 report generation)
    const maxTokens = 2000;

    while (toolCallCount < MAX_TOOL_CALLS) {
      const agentController = new AbortController();
      const agentTimeout = setTimeout(() => agentController.abort(), 120000); // 2 minutes
      let agentRes: Response;
      try {
        agentRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            system: truncatedSystem,
            messages: agentMessages,
            tools: steveTools,
          }),
          signal: agentController.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(agentTimeout);
        if (fetchErr.name === 'AbortError') {
          console.error('[EST] Anthropic API timed out after 120s');
          return c.json({ error: 'La respuesta tardó demasiado. Intenta de nuevo.' }, 504);
        }
        throw fetchErr;
      } finally {
        clearTimeout(agentTimeout);
      }

      if (!agentRes.ok) {
        const errorText = await agentRes.text().catch(() => '');
        console.error('AI API error (estrategia agentic):', agentRes.status, errorText);
        if (agentRes.status === 429) return c.json({ error: 'Rate limit' }, 429);
        return c.json({ error: `AI service error (${agentRes.status})`, details: errorText.slice(0, 200) }, 502);
      }

      const agentData: any = await agentRes.json();

      if (agentData.stop_reason === 'tool_use') {
        // Claude can return MULTIPLE tool_use blocks in one assistant turn.
        // Each tool_use MUST have a matching tool_result, otherwise Anthropic
        // returns 400: "messages.X: tool_use ids must have corresponding tool_result".
        const toolUseBlocks = (agentData.content || []).filter((b: any) => b.type === 'tool_use');
        if (toolUseBlocks.length === 0) break;

        toolCallCount++;
        console.log(`[EST] Turn #${toolCallCount}: ${toolUseBlocks.length} tool call(s) — ${toolUseBlocks.map((b: any) => b.name).join(', ')}`);

        // Execute all tool_use blocks and collect their results
        const toolResultsArr: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
        for (const toolUseBlock of toolUseBlocks) {
          let toolResult = '';
          console.log(`[EST]   → ${toolUseBlock.name}(${JSON.stringify(toolUseBlock.input).slice(0, 100)})`);

          switch (toolUseBlock.name) {
          case 'buscar_youtube': {
            const query = toolUseBlock.input.query;
            try {
              const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
              });
              if (searchRes.ok) {
                const html = await searchRes.text();
                // Extract video titles and descriptions
                const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]{10,80})"/g)]
                  .map(m => m[1])
                  .slice(0, 5);

                // Try to get transcript of first video
                const videoIds = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)]
                  .map(m => m[1])
                  .filter((v, i, arr) => arr.indexOf(v) === i)
                  .slice(0, 1);

                let transcript = '';
                if (videoIds.length > 0) {
                  const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoIds[0]}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                  });
                  if (ytRes.ok) {
                    const ytHtml = await ytRes.text();
                    const captionMatch = ytHtml.match(/"captionTracks"\s*:\s*(\[.*?\])/);
                    if (captionMatch) {
                      try {
                        const tracks = JSON.parse(captionMatch[1]);
                        const preferred = tracks.find((t: any) => t.languageCode === 'es') || tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
                        if (preferred?.baseUrl) {
                          const capRes = await fetch(preferred.baseUrl);
                          if (capRes.ok) {
                            const capXml = await capRes.text();
                            transcript = [...capXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)]
                              .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim())
                              .filter(Boolean)
                              .join(' ')
                              .slice(0, 5000);
                          }
                        }
                      } catch (e: any) {
                        console.warn('[strategy-chat] Caption parse error:', e?.message || e);
                      }
                    }
                  }
                }

                toolResult = transcript
                  ? `Videos encontrados sobre "${query}":\n${titles.join('\n')}\n\nTranscripción del primer video:\n${transcript}`
                  : `Videos encontrados sobre "${query}":\n${titles.join('\n')}\n\n(No se pudo obtener transcripción)`;
              } else {
                toolResult = 'No se pudieron buscar videos en YouTube.';
              }
            } catch (e) {
              toolResult = `Error buscando en YouTube: ${e}`;
            }
            break;
          }

          case 'buscar_web': {
            const query = toolUseBlock.input.query;
            try {
              // Use a simple web search via DuckDuckGo HTML
              const searchRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' marketing ecommerce')}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
              });
              if (searchRes.ok) {
                const html = await searchRes.text();
                const results = [...html.matchAll(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g)]
                  .slice(0, 5)
                  .map(m => `${m[1].replace(/<[^>]+>/g, '')}: ${m[2].replace(/<[^>]+>/g, '')}`)
                  .join('\n\n');
                toolResult = results || 'No se encontraron resultados.';
              } else {
                toolResult = 'No se pudo realizar la búsqueda web.';
              }
            } catch (e) {
              toolResult = `Error en búsqueda web: ${e}`;
            }
            break;
          }

          case 'guardar_regla': {
            const { titulo, contenido, categoria } = toolUseBlock.input;
            try {
              await supabase.from('steve_knowledge').insert({
                categoria,
                titulo: titulo.slice(0, 80),
                contenido: contenido.slice(0, 600),
                activo: true,
                orden: 80,
                approval_status: 'pending',
                industria: 'general',
                client_id,
              });
              toolResult = `Regla "${titulo}" guardada exitosamente (pendiente de aprobación).`;
            } catch (e) {
              toolResult = `Error guardando regla: ${e}`;
            }
            break;
          }

          case 'generar_reporte_pdf': {
            const { from, to, temas } = toolUseBlock.input as { from: string; to: string; temas: string[] };
            try {
              const baseUrl = process.env.SELF_URL || 'https://steve-api-850416724643.us-central1.run.app';
              const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
              const reportRes = await fetch(`${baseUrl}/api/strategy-report`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceKey}`,
                  'X-Internal-Key': serviceKey,
                  'X-Cron-Secret': process.env.CRON_SECRET || 'steve-cron-secret-2024',
                },
                body: JSON.stringify({ client_id, from, to, temas }),
                signal: AbortSignal.timeout(110_000),
              });
              const body: any = await reportRes.json().catch(() => ({}));
              if (!reportRes.ok || !body?.url) {
                toolResult = `Error generando reporte: ${body?.error || `HTTP ${reportRes.status}`}. Detalles: ${body?.details || 'sin detalles'}`;
              } else {
                toolResult = `Reporte generado exitosamente. URL: ${body.url}\nPeríodo: ${body.period?.from} → ${body.period?.to} (${body.period?.days} días). Secciones: ${(body.sections || []).join(', ')}. Devuelve la URL al cliente como link descargable junto con un resumen breve (3 bullets) del contenido.`;
              }
            } catch (e: any) {
              toolResult = `Error invocando reporte: ${e?.message?.slice(0, 200) || e}`;
            }
            break;
          }

          default:
            toolResult = 'Herramienta no reconocida.';
          }

          toolResultsArr.push({ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult });
        }

        // Add assistant message with all tool_use blocks AND user message with ALL matching tool_results
        agentMessages.push({ role: 'assistant', content: agentData.content });
        agentMessages.push({ role: 'user', content: toolResultsArr });

      } else {
        // Claude is done — extract text response
        finalResponse = agentData.content
          ?.filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('') || '';
        break;
      }
    }

    // If loop exited without response (max tools reached), make one final call without tools
    if (!finalResponse) {
      const fallbackController = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 120000);
      try {
        const fallbackRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            system: truncatedSystem,
            messages: agentMessages,
          }),
          signal: fallbackController.signal,
        });
        if (fallbackRes.ok) {
          const fallbackData: any = await fallbackRes.json();
          finalResponse = fallbackData.content
            ?.filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('') || '';
        }
      } catch (fallbackErr: any) {
        console.error('[EST] Fallback API call failed:', fallbackErr?.message);
      } finally {
        clearTimeout(fallbackTimeout);
      }
    }

    timelog('estrategia-post-anthropic');

    const rawMsg = finalResponse || 'Lo siento, hubo un error. ¿Podrías repetir tu pregunta?';
    // Strip <thinking>...</thinking> blocks from chain-of-thought models
    const assistantMsg = rawMsg.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '').trim();

    const { error: insertError } = await supabase.from('steve_messages').insert({
      conversation_id: estrategiaConvId,
      role: 'assistant',
      content: assistantMsg,
    });
    if (insertError) {
      console.error('[EST] Failed to persist assistant message:', insertError);
    }

    // Track rule usage (Mejora #5): update ultima_vez_usada for rules referenced in the response
    if (filteredKnowledge && filteredKnowledge.length > 0 && assistantMsg) {
      const usedTitles = filteredKnowledge
        .filter((k: any) => assistantMsg.toLowerCase().includes(k.titulo.toLowerCase().substring(0, 20)))
        .map((k: any) => k.titulo);
      if (usedTitles.length > 0) {
        supabase.from('steve_knowledge')
          .update({ ultima_vez_usada: new Date().toISOString() })
          .in('titulo', usedTitles)
          .then(() => {});
      }
    }

    // Detect commitments in Steve's response (Mejora #8)
    if (assistantMsg && client_id) {
      const commitmentPatterns = [
        /(?:vamos a|te sugiero|te recomiendo|deberías|hay que|el plan es)\s+(.{20,100})/i,
        /(?:próximo paso|siguiente paso|acción|tarea):\s*(.{20,100})/i,
        /(?:quedamos en|acordamos)\s+(.{20,100})/i,
      ];

      for (const pattern of commitmentPatterns) {
        const match = assistantMsg.match(pattern);
        if (match) {
          const commitmentText = match[1].replace(/[.!?,;]$/, '').trim();
          if (commitmentText.length > 20) {
            supabase.from('steve_commitments').insert({
              client_id,
              commitment: commitmentText.slice(0, 200),
              context: message.slice(0, 200),
              follow_up_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              status: 'pending',
            }).then(() => {});
            break; // Only save first commitment per response
          }
        }
      }
    }

    timelog('estrategia-complete');
    console.log(`Steve estrategia: conversation ${estrategiaConvId}, client ${client_id}, total ${Date.now() - requestStart}ms`);

    return c.json({
      conversation_id: estrategiaConvId,
      message: assistantMsg,
    });
  } catch (estrategiaErr: any) {
    console.error('[strategy-chat] Estrategia unhandled error:', estrategiaErr);
    return c.json({
      error: 'Error en chat de estrategia',
      details: estrategiaErr?.message?.slice(0, 200) || 'Unknown error',
    }, 500);
  }
}
