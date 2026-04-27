import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getCreativeContext } from '../../lib/creative-context.js';
import { checkRateLimit } from '../../lib/rate-limiter.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { sanitizeForPrompt } from '../../lib/prompt-utils.js';
import { sanitizeMessagesForAnthropic, truncateMessages } from './steve-chat.js';

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
      .select('id, client_user_id, user_id')
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

    // PARALLELIZED: 5 independent queries that all depend only on client_id / conversation_id
    const [
      { data: convMessages },
      { data: persona },
      { data: research },
      { data: knowledge },
      { data: connections },
      { data: clientKnowledgeData },
      { data: commitments },
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
    ]);

    // Merge client-specific + global knowledge (client first for priority)
    const mergedKnowledge = [...(clientKnowledgeData || []), ...(knowledge || [])];
    timelog('estrategia-parallel-queries');

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

NO eres un cuestionario. NO hagas preguntas estructuradas. Simplemente conversa y asesora.

${persona?.is_complete ? '' : '⚠️ NOTA: El brief del cliente aún NO está completo. Puedes responder sus preguntas pero recuérdale que para un análisis más profundo debería completar el brief en la pestaña "Steve".'}

=== MÉTRICAS REALES (PRIORIDAD MÁXIMA — usa estos datos en TODA respuesta) ===
${metricsContext}

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
    ];

    timelog('estrategia-pre-anthropic');

    // === AGENTIC LOOP — Steve can search before responding ===
    let agentMessages: any[] = [...aiMessages]; // copy the messages array (any[] for tool_use/tool_result shapes)
    let finalResponse = '';
    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 3; // Max 3 searches per question
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
        // Claude wants to use a tool
        const toolUseBlock = agentData.content.find((b: any) => b.type === 'tool_use');
        if (!toolUseBlock) break;

        toolCallCount++;
        let toolResult = '';
        console.log(`[EST] Tool call #${toolCallCount}: ${toolUseBlock.name}(${JSON.stringify(toolUseBlock.input).slice(0, 100)})`);

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

          default:
            toolResult = 'Herramienta no reconocida.';
        }

        // Add assistant message with tool use and tool result to conversation
        agentMessages.push({ role: 'assistant', content: agentData.content });
        agentMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }] });

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
