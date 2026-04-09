import { Context } from 'hono';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery, safeQueryOrDefault, safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Weekly Report — Merchant-facing + QA Scorecard
 * Generates a weekly summary per merchant with:
 * - Merchant report: sales, top campaign, CPA trend, recommended action
 * - QA Scorecard: errors, MTTR, autofix rate
 * - Mejora Continua: creative performance scores
 *
 * Sends report via Resend email to each merchant.
 *
 * Cron: 0 11 * * 1 (Monday 11am UTC = 8am Chile)
 * Auth: X-Cron-Secret header
 */

let resend: Resend | null = null;
function getResend(): Resend {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY!);
  return resend;
}

function formatCLP(value: number): string {
  return '$' + Math.round(value).toLocaleString('es-CL');
}

function getWeekLabel(): string {
  const now = new Date();
  const day = now.getDate();
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${day} de ${months[now.getMonth()]}`;
}

// ─── Merchant report HTML ────────────────────────────────────────────────────

function buildMerchantEmailHtml(params: {
  brandName: string;
  weekLabel: string;
  totalSales: number;
  lastWeekSales: number;
  topCampaignName: string | null;
  topCampaignSpend: number;
  topCampaignResults: number;
  cpaThisWeek: number | null;
  cpaLastWeek: number | null;
  recommendedAction: string;
}): string {
  const {
    brandName, weekLabel, totalSales, lastWeekSales,
    topCampaignName, topCampaignSpend, topCampaignResults,
    cpaThisWeek, cpaLastWeek, recommendedAction,
  } = params;

  const salesDelta = lastWeekSales > 0
    ? Math.round(((totalSales - lastWeekSales) / lastWeekSales) * 100)
    : 0;
  const salesTrendIcon = salesDelta >= 0 ? '📈' : '📉';
  const salesTrendColor = salesDelta >= 0 ? '#16a34a' : '#dc2626';

  const cpaDelta = cpaThisWeek && cpaLastWeek && cpaLastWeek > 0
    ? Math.round(((cpaThisWeek - cpaLastWeek) / cpaLastWeek) * 100)
    : null;
  const cpaTrendIcon = cpaDelta !== null ? (cpaDelta <= 0 ? '✅' : '⚠️') : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reporte Semanal Steve Ads</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px 24px;text-align:center;">
  <h1 style="color:#ffffff;margin:0;font-size:22px;">📊 Reporte Semanal</h1>
  <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">${brandName} — Semana del ${weekLabel}</p>
</td></tr>

<!-- Sales KPI -->
<tr><td style="padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:#f8fafc;border-radius:8px;padding:20px;text-align:center;width:50%;">
      <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;">Ventas Totales</p>
      <p style="margin:8px 0 4px;font-size:28px;font-weight:bold;color:#0f172a;">${formatCLP(totalSales)}</p>
      <p style="margin:0;font-size:13px;color:${salesTrendColor};">${salesTrendIcon} ${salesDelta >= 0 ? '+' : ''}${salesDelta}% vs semana anterior</p>
    </td>
    <td style="width:16px;"></td>
    <td style="background:#f8fafc;border-radius:8px;padding:20px;text-align:center;width:50%;">
      <p style="margin:0;color:#64748b;font-size:12px;text-transform:uppercase;">CPA Promedio</p>
      <p style="margin:8px 0 4px;font-size:28px;font-weight:bold;color:#0f172a;">${cpaThisWeek ? formatCLP(cpaThisWeek) : 'N/A'}</p>
      <p style="margin:0;font-size:13px;color:#64748b;">${cpaTrendIcon} ${cpaDelta !== null ? `${cpaDelta <= 0 ? '' : '+'}${cpaDelta}% vs anterior` : 'Sin datos previos'}</p>
    </td>
  </tr>
  </table>
</td></tr>

<!-- Top Campaign -->
<tr><td style="padding:0 24px 24px;">
  <div style="background:#eff6ff;border-radius:8px;padding:16px;border-left:4px solid #3b82f6;">
    <p style="margin:0;color:#1e40af;font-size:12px;text-transform:uppercase;font-weight:bold;">🏆 Top Campaña</p>
    <p style="margin:8px 0 4px;font-size:16px;font-weight:bold;color:#0f172a;">${topCampaignName || 'Sin campañas esta semana'}</p>
    ${topCampaignName ? `<p style="margin:0;color:#475569;font-size:13px;">Inversión: ${formatCLP(topCampaignSpend)} · ${topCampaignResults} resultado${topCampaignResults !== 1 ? 's' : ''}</p>` : ''}
  </div>
</td></tr>

<!-- Recommended Action -->
<tr><td style="padding:0 24px 32px;">
  <div style="background:#f0fdf4;border-radius:8px;padding:16px;border-left:4px solid #22c55e;">
    <p style="margin:0;color:#15803d;font-size:12px;text-transform:uppercase;font-weight:bold;">🎯 Siguiente Acción Recomendada</p>
    <p style="margin:8px 0 0;font-size:14px;color:#0f172a;">${recommendedAction}</p>
  </div>
</td></tr>

<!-- Footer -->
<tr><td style="background:#f8fafc;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;">
  <p style="margin:0;color:#94a3b8;font-size:12px;">Generado por Steve Ads · <a href="https://www.steve.cl" style="color:#3b82f6;text-decoration:none;">www.steve.cl</a></p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ─── Generate recommended action ────────────────────────────────────────────

function generateRecommendedAction(params: {
  salesDelta: number;
  cpaThisWeek: number | null;
  cpaLastWeek: number | null;
  topCampaignName: string | null;
  creativeScore: number | null;
}): string {
  const { salesDelta, cpaThisWeek, cpaLastWeek, topCampaignName, creativeScore } = params;

  if (cpaThisWeek && cpaLastWeek && cpaThisWeek > cpaLastWeek * 1.2) {
    return 'Tu CPA subió más de un 20%. Revisa las audiencias de tus campañas activas y considera refrescar los creativos.';
  }
  if (salesDelta < -10) {
    return 'Las ventas bajaron esta semana. Considera lanzar una campaña de retargeting para recuperar compradores que visitaron tu tienda.';
  }
  if (creativeScore && creativeScore < 50) {
    return 'El score promedio de tus creativos está bajo. Prueba nuevos ángulos creativos y formatos de imagen.';
  }
  if (topCampaignName && salesDelta > 10) {
    return `¡Gran semana! Tu campaña "${topCampaignName}" está funcionando bien. Considera aumentar su presupuesto un 20%.`;
  }
  return 'Mantén el ritmo actual. Revisa tus campañas activas y asegúrate de que todas tengan creativos frescos.';
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function weeklyReport(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
  const weekLabel = getWeekLabel();

  // ─────────────────────────────────────────────
  // MERCHANT REPORTS — per-client sales + email
  // ─────────────────────────────────────────────

  // Get all active clients with their users
  const clients = await safeQuery<{ id: string; name: string; user_id: string }>(
    supabase
      .from('clients')
      .select('id, name, user_id'),
    'weeklyReport.fetchActiveClients',
  );

  const merchantResults: Array<{ client_id: string; name: string; email_sent: boolean; error?: string }> = [];

  const reportDate = now.toISOString().split('T')[0];

  for (const client of clients) {
    try {
      // Dedup: skip if report already sent for this client this week
      const existingReport = await safeQuerySingleOrDefault<{ id: string }>(
        supabase
          .from('qa_log')
          .select('id')
          .eq('check_type', 'weekly_merchant_report')
          .eq('details->>client_id', client.id)
          .eq('details->>report_date', reportDate)
          .limit(1)
          .maybeSingle(),
        null,
        'weeklyReport.dedupCheck',
      );
      if (existingReport) {
        merchantResults.push({ client_id: client.id, name: client.name, email_sent: false, error: 'already sent today' });
        continue;
      }

      // Get merchant email
      const { data: userData } = await supabase.auth.admin.getUserById(client.user_id);
      const merchantEmail = userData?.user?.email;
      if (!merchantEmail) {
        merchantResults.push({ client_id: client.id, name: client.name, email_sent: false, error: 'no email' });
        continue;
      }

      // Get connection IDs for this client to query campaign_metrics
      // (campaign_metrics uses connection_id, not client_id)
      const clientConnections = await safeQuery<{ id: string }>(
        supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', client.id)
          .eq('platform', 'meta')
          .eq('is_active', true),
        'weeklyReport.fetchClientConnections',
      );
      const connectionIds = clientConnections.map(c => c.id);

      // This week's campaign metrics
      let thisWeekMetrics: any[] = [];
      if (connectionIds.length > 0) {
        thisWeekMetrics = await safeQuery<any>(
          supabase
            .from('campaign_metrics')
            .select('campaign_name, spend, conversions, metric_date')
            .in('connection_id', connectionIds)
            .gte('metric_date', weekAgo.split('T')[0]),
          'weeklyReport.fetchThisWeekMetrics',
        );
      }

      // Last week's campaign metrics
      let lastWeekMetrics: any[] = [];
      if (connectionIds.length > 0) {
        lastWeekMetrics = await safeQuery<any>(
          supabase
            .from('campaign_metrics')
            .select('spend, conversions')
            .in('connection_id', connectionIds)
            .gte('metric_date', twoWeeksAgo.split('T')[0])
            .lt('metric_date', weekAgo.split('T')[0]),
          'weeklyReport.fetchLastWeekMetrics',
        );
      }

      // Shopify revenue this week
      // TODO: shopify_metrics table does not exist yet — using platform_metrics as fallback
      let totalSales = 0;
      let lastWeekSales = 0;
      try {
        const shopifyConnections = await safeQuery<{ id: string }>(
          supabase
            .from('platform_connections')
            .select('id')
            .eq('client_id', client.id)
            .eq('platform', 'shopify')
            .eq('is_active', true),
          'weeklyReport.fetchShopifyConnections',
        );
        const shopifyConnIds = shopifyConnections.map(c => c.id);
        if (shopifyConnIds.length > 0) {
          const shopifyThisWeek = await safeQuery<{ metric_value: number | string }>(
            supabase
              .from('platform_metrics')
              .select('metric_value')
              .in('connection_id', shopifyConnIds)
              .eq('metric_type', 'revenue')
              .gte('metric_date', weekAgo.split('T')[0]),
            'weeklyReport.fetchShopifyThisWeek',
          );
          const shopifyLastWeek = await safeQuery<{ metric_value: number | string }>(
            supabase
              .from('platform_metrics')
              .select('metric_value')
              .in('connection_id', shopifyConnIds)
              .eq('metric_type', 'revenue')
              .gte('metric_date', twoWeeksAgo.split('T')[0])
              .lt('metric_date', weekAgo.split('T')[0]),
            'weeklyReport.fetchShopifyLastWeek',
          );
          totalSales = shopifyThisWeek.reduce((s: number, r: any) => s + (Number(r.metric_value) || 0), 0);
          lastWeekSales = shopifyLastWeek.reduce((s: number, r: any) => s + (Number(r.metric_value) || 0), 0);
        }
      } catch (shopifyErr) {
        console.error(`[weekly-report] Shopify metrics error for ${client.name}:`, shopifyErr);
      }

      // Top campaign by conversions
      const campaignTotals: Record<string, { spend: number; conversions: number }> = {};
      for (const m of thisWeekMetrics) {
        const key = (m as any).campaign_name || 'Unknown';
        if (!campaignTotals[key]) campaignTotals[key] = { spend: 0, conversions: 0 };
        campaignTotals[key].spend += (m as any).spend || 0;
        campaignTotals[key].conversions += (m as any).conversions || 0;
      }

      const topCampaign = Object.entries(campaignTotals).sort((a, b) => b[1].conversions - a[1].conversions)[0];
      const topCampaignName = topCampaign?.[0] || null;
      const topCampaignSpend = topCampaign?.[1]?.spend || 0;
      const topCampaignResults = topCampaign?.[1]?.conversions || 0;

      // Compute CPA from spend / conversions
      const totalSpendThisWeek = thisWeekMetrics.reduce((s: number, m: any) => s + ((m as any).spend || 0), 0);
      const totalConversionsThisWeek = thisWeekMetrics.reduce((s: number, m: any) => s + ((m as any).conversions || 0), 0);
      const cpaThisWeek = totalConversionsThisWeek > 0 ? totalSpendThisWeek / totalConversionsThisWeek : null;

      const totalSpendLastWeek = lastWeekMetrics.reduce((s: number, m: any) => s + ((m as any).spend || 0), 0);
      const totalConversionsLastWeek = lastWeekMetrics.reduce((s: number, m: any) => s + ((m as any).conversions || 0), 0);
      const cpaLastWeek = totalConversionsLastWeek > 0 ? totalSpendLastWeek / totalConversionsLastWeek : null;

      // Creative score
      const creativeData = await safeQuery<{ performance_score: number }>(
        supabase
          .from('creative_history')
          .select('performance_score')
          .eq('client_id', client.id)
          .not('performance_score', 'is', null)
          .gte('measured_at', weekAgo),
        'weeklyReport.fetchCreativeScores',
      );

      const creativeScore = creativeData.length > 0
        ? Math.round(creativeData.reduce((s, c) => s + c.performance_score, 0) / creativeData.length)
        : null;

      const salesDelta = lastWeekSales > 0 ? Math.round(((totalSales - lastWeekSales) / lastWeekSales) * 100) : 0;

      const recommendedAction = generateRecommendedAction({
        salesDelta,
        cpaThisWeek,
        cpaLastWeek,
        topCampaignName,
        creativeScore,
      });

      // Build and send email
      const htmlEmail = buildMerchantEmailHtml({
        brandName: client.name,
        weekLabel,
        totalSales,
        lastWeekSales,
        topCampaignName,
        topCampaignSpend,
        topCampaignResults,
        cpaThisWeek,
        cpaLastWeek,
        recommendedAction,
      });

      const fromDomain = process.env.DEFAULT_FROM_DOMAIN || 'steve.cl';

      await getResend().emails.send({
        from: `Steve Ads <reportes@${fromDomain}>`,
        to: [merchantEmail],
        subject: `📊 Tu reporte semanal de Steve Ads — semana del ${weekLabel}`,
        html: htmlEmail,
      });

      console.log(`[weekly-report] Email sent to ${merchantEmail} for ${client.name}`);

      // Save merchant report to qa_log for dashboard display
      await supabase.from('qa_log').insert({
        check_type: 'weekly_merchant_report',
        status: 'pass',
        details: {
          client_id: client.id,
          report_date: now.toISOString().split('T')[0],
          total_sales: totalSales,
          last_week_sales: lastWeekSales,
          sales_delta_pct: salesDelta,
          top_campaign: topCampaignName,
          cpa_this_week: cpaThisWeek,
          cpa_last_week: cpaLastWeek,
          creative_score: creativeScore,
          recommended_action: recommendedAction,
        },
      });

      merchantResults.push({ client_id: client.id, name: client.name, email_sent: true });
    } catch (err: any) {
      console.error(`[weekly-report] Error for client ${client.name}:`, err?.message);
      merchantResults.push({ client_id: client.id, name: client.name, email_sent: false, error: err?.message });
    }
  }

  // ─────────────────────────────────────────────
  // C.7 — QA SCORECARD (internal)
  // ─────────────────────────────────────────────

  // QA scorecard is internal reporting; degrade gracefully to preserve
  // merchant results already computed above. If qa_log query fails, log
  // and continue with empty arrays.
  const thisWeekErrors = await safeQueryOrDefault<any>(
    supabase
      .from('qa_log')
      .select('*')
      .gte('checked_at', weekAgo)
      .in('status', ['fail', 'warn', 'error', 'auto_fixed']),
    [],
    'weeklyReport.fetchThisWeekErrors',
  );

  const lastWeekErrors = await safeQueryOrDefault<any>(
    supabase
      .from('qa_log')
      .select('*')
      .gte('checked_at', twoWeeksAgo)
      .lt('checked_at', weekAgo)
      .in('status', ['fail', 'warn', 'error', 'auto_fixed']),
    [],
    'weeklyReport.fetchLastWeekErrors',
  );

  // Solo contar fails reales para el QA score — warns y auto_fixed no son errores
  const thisWeekFails = thisWeekErrors.filter((e: any) => e.status === 'fail' || e.status === 'error');
  const lastWeekFails = lastWeekErrors.filter((e: any) => e.status === 'fail' || e.status === 'error');
  const thisWeekCount = thisWeekFails.length;
  const lastWeekCount = lastWeekFails.length;
  const errorTrend = thisWeekCount < lastWeekCount ? 'bajando' : thisWeekCount > lastWeekCount ? 'subiendo' : 'estable';

  const autoFixed = thisWeekErrors.filter((e: any) => e.status === 'auto_fixed').length;
  const autofixRate = (autoFixed + thisWeekCount) > 0
    ? Math.round((autoFixed / (autoFixed + thisWeekCount)) * 100)
    : 0;

  const selfHealed = thisWeekErrors.filter((e: any) => e.check_type === 'test_self_healed').length;

  const newRulesData = await safeQueryOrDefault<{ id: string }>(
    supabase
      .from('criterio_rules')
      .select('id')
      .gte('created_at', weekAgo),
    [],
    'weeklyReport.fetchNewRules',
  );
  const newRules = newRulesData.length;

  const failErrors = thisWeekErrors.filter((e: any) => e.status === 'fail');
  const errorCounts: Record<string, number> = {};
  for (const e of failErrors) {
    const key = (e as any).check_type;
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  }
  const repeatedErrors = Object.values(errorCounts).filter((c) => c >= 2).length;

  // MTTR
  const fixedEntries = thisWeekErrors.filter((e: any) => e.status === 'auto_fixed');
  let mttrMinutes: number | null = null;
  if (failErrors.length > 0 && fixedEntries.length > 0) {
    const mttrSamples: number[] = [];
    for (const fail of failErrors) {
      const f = fail as any;
      const matchingFix = fixedEntries.find((fix: any) =>
        fix.check_type === f.check_type && new Date(fix.checked_at).getTime() > new Date(f.checked_at).getTime()
      );
      if (matchingFix) {
        const diff = new Date((matchingFix as any).checked_at).getTime() - new Date(f.checked_at).getTime();
        mttrSamples.push(diff / 60000);
      }
    }
    if (mttrSamples.length > 0) {
      mttrMinutes = Math.round(mttrSamples.reduce((a, b) => a + b, 0) / mttrSamples.length);
    }
  }

  const qaScorecard = {
    errors_this_week: thisWeekCount, errors_last_week: lastWeekCount, error_trend: errorTrend,
    mttr_minutes: mttrMinutes, autofix_rate_pct: autofixRate, auto_fixed_count: autoFixed,
    self_healed_tests: selfHealed, new_rules: newRules, repeated_errors: repeatedErrors,
  };

  // ─── Mejora Continua ──────────────────────────

  const weekCreatives = await safeQueryOrDefault<{ performance_score: number; performance_verdict: string }>(
    supabase
      .from('creative_history')
      .select('performance_score, performance_verdict')
      .not('performance_score', 'is', null)
      .gte('measured_at', weekAgo),
    [],
    'weeklyReport.fetchWeekCreatives',
  );

  const creativeCount = weekCreatives.length;
  const avgScore = creativeCount > 0
    ? Math.round(weekCreatives.reduce((s, c) => s + c.performance_score, 0) / creativeCount)
    : null;

  const buenos = weekCreatives.filter((c: any) => c.performance_verdict === 'bueno').length;
  const malos = weekCreatives.filter((c: any) => c.performance_verdict === 'malo').length;

  const lastWeekCreatives = await safeQueryOrDefault<{ performance_score: number }>(
    supabase
      .from('creative_history')
      .select('performance_score')
      .not('performance_score', 'is', null)
      .gte('measured_at', twoWeeksAgo)
      .lt('measured_at', weekAgo),
    [],
    'weeklyReport.fetchLastWeekCreatives',
  );

  const lastAvgScore = lastWeekCreatives.length > 0
    ? Math.round(lastWeekCreatives.reduce((s, c) => s + c.performance_score, 0) / lastWeekCreatives.length)
    : null;

  const scoreTrend = avgScore !== null && lastAvgScore !== null
    ? avgScore > lastAvgScore ? 'mejorando' : avgScore < lastAvgScore ? 'empeorando' : 'estable'
    : null;

  const fatigueData = await safeQueryOrDefault<{ id: string }>(
    supabase
      .from('qa_log')
      .select('id')
      .eq('check_type', 'creative_fatigue')
      .gte('checked_at', weekAgo),
    [],
    'weeklyReport.fetchFatigueData',
  );

  const mejoraContinua = {
    creatives_measured: creativeCount, avg_score: avgScore, last_week_avg_score: lastAvgScore,
    score_trend: scoreTrend, buenos, malos, fatigue_detected: fatigueData.length,
  };

  // ─── Save internal report ─────────────────────

  await supabase.from('qa_log').insert({
    check_type: 'weekly_report',
    status: 'pass',
    details: { report_date: reportDate, qa_scorecard: qaScorecard, mejora_continua: mejoraContinua },
  });

  // ─────────────────────────────────────────────
  // TASK 5 — Conversaciones exitosas → knowledge
  // Analyze WA conversations from last 7 days,
  // extract patterns from 5+ message conversations
  // ─────────────────────────────────────────────

  let conversationPatternsLearned = 0;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    if (ANTHROPIC_API_KEY) {
      // Get wa_messages from last 7 days
      const recentMessages = await safeQuery<any>(
        supabase
          .from('wa_messages')
          .select('client_id, contact_phone, channel, direction, body, created_at')
          .gte('created_at', weekAgo)
          .not('body', 'is', null)
          .order('created_at', { ascending: true }),
        'weeklyReport.fetchRecentMessages',
      );

      if (recentMessages.length > 0) {
        // Group by client_id + contact_phone (acts as conversation_id)
        const conversations: Record<string, Array<{ direction: string; body: string }>> = {};
        for (const msg of recentMessages) {
          const key = `${msg.client_id}::${msg.contact_phone}`;
          if (!conversations[key]) conversations[key] = [];
          conversations[key].push({ direction: msg.direction, body: msg.body });
        }

        // Filter conversations with 5+ messages, take max 5
        const richConversations = Object.entries(conversations)
          .filter(([, msgs]) => msgs.length >= 5)
          .slice(0, 5);

        for (const [convKey, messages] of richConversations) {
          try {
            const transcript = messages
              .map(m => `${m.direction === 'inbound' ? 'CLIENTE' : 'STEVE'}: ${m.body}`)
              .join('\n');

            const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                messages: [{
                  role: 'user',
                  content: `Analiza esta conversación de WhatsApp entre un cliente y Steve (asistente AI de marketing).
Extrae 1-2 patrones útiles que Steve debería aprender para futuras conversaciones.
Ejemplos: "cuando el cliente pregunta X, responder con Y funciona bien", "los clientes suelen necesitar Z después de preguntar W".
Responde SOLO con los patrones, uno por línea, máximo 2 líneas. Sin explicaciones ni formato extra.

CONVERSACIÓN:
${transcript.substring(0, 2000)}`
                }],
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json() as any;
              const patterns = aiData?.content?.[0]?.text?.trim();

              if (patterns && patterns.length > 10) {
                await supabase.from('steve_knowledge').upsert(
                  {
                    categoria: 'conversaciones',
                    titulo: `Patrón conversacional ${convKey.split('::')[0].substring(0, 8)}`,
                    contenido: patterns,
                    activo: true,
                    orden: 90,
                  },
                  { onConflict: 'categoria,titulo' }
                );
                conversationPatternsLearned++;
                console.log(`[weekly-report] Conversation pattern learned from ${convKey.split('::')[0].substring(0, 8)}`);
              }
            }
          } catch (convErr) {
            console.error(`[weekly-report] Error analyzing conversation:`, convErr);
          }
        }
      }
    } else {
      console.log('[weekly-report] ANTHROPIC_API_KEY not set, skipping conversation learning');
    }
  } catch (convLoopErr) {
    console.error('[weekly-report] Conversation learning loop error:', convLoopErr);
  }

  // ─────────────────────────────────────────────
  // TASK 6 — Meta campaigns post-mortem
  // Extract patterns from creative verdicts of the week
  // ─────────────────────────────────────────────

  let postmortemPatternsLearned = 0;

  try {
    if (ANTHROPIC_API_KEY) {
      // Query creative_history from last 7 days with verdict
      const verdictCreatives = await safeQuery<any>(
        supabase
          .from('creative_history')
          .select('angle, content_summary, channel, performance_score, performance_verdict')
          .not('performance_verdict', 'is', null)
          .gte('measured_at', weekAgo),
        'weeklyReport.fetchVerdictCreatives',
      );

      if (verdictCreatives.length >= 3) {
        // Group by verdict
        const buenos = verdictCreatives.filter((c: any) => c.performance_verdict === 'bueno');
        const malos = verdictCreatives.filter((c: any) => c.performance_verdict === 'malo');

        const summaryLines: string[] = [];
        if (buenos.length > 0) {
          summaryLines.push('CREATIVOS BUENOS:');
          buenos.forEach((c: any) => {
            summaryLines.push(`- Ángulo: ${c.angle || 'N/A'}, Score: ${c.performance_score}, Canal: ${c.channel}. ${c.content_summary || ''}`);
          });
        }
        if (malos.length > 0) {
          summaryLines.push('CREATIVOS MALOS:');
          malos.forEach((c: any) => {
            summaryLines.push(`- Ángulo: ${c.angle || 'N/A'}, Score: ${c.performance_score}, Canal: ${c.channel}. ${c.content_summary || ''}`);
          });
        }

        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `Analiza el rendimiento de creativos publicitarios de esta semana.
Extrae 1-2 patrones generales que expliquen qué funcionó y qué no.
Responde SOLO con los patrones, uno por línea, máximo 2 líneas. Sin explicaciones ni formato extra.

${summaryLines.join('\n').substring(0, 2000)}`
            }],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json() as any;
          const patterns = aiData?.content?.[0]?.text?.trim();

          if (patterns && patterns.length > 10) {
            // Determine primary channel from the data
            const channelCounts: Record<string, number> = {};
            for (const c of verdictCreatives) {
              const ch = (c as any).channel || 'meta';
              channelCounts[ch] = (channelCounts[ch] || 0) + 1;
            }
            const primaryChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'meta';
            const categoria = primaryChannel === 'klaviyo' ? 'klaviyo' : 'meta_ads';

            await supabase.from('steve_knowledge').upsert(
              {
                categoria,
                titulo: `Post-mortem semanal creativos ${reportDate}`,
                contenido: patterns,
                activo: true,
                orden: 90,
              },
              { onConflict: 'categoria,titulo' }
            );
            postmortemPatternsLearned++;
            console.log(`[weekly-report] Post-mortem pattern learned: ${categoria}`);
          }
        }
      } else {
        console.log(`[weekly-report] Only ${verdictCreatives.length} measured creatives, need 3+ for post-mortem`);
      }
    }
  } catch (postmortemErr) {
    console.error('[weekly-report] Post-mortem learning error:', postmortemErr);
  }

  const emailsSent = merchantResults.filter((r) => r.email_sent).length;
  console.log(`[weekly-report] Done: ${emailsSent}/${merchantResults.length} merchant emails sent`);
  console.log(`[weekly-report] QA Scorecard: ${thisWeekCount} errors (${errorTrend}), autofix: ${autofixRate}%`);
  console.log(`[weekly-report] Learning: ${conversationPatternsLearned} conversation patterns, ${postmortemPatternsLearned} post-mortem patterns`);

  return c.json({
    success: true,
    report_date: reportDate,
    merchant_emails_sent: emailsSent,
    merchant_results: merchantResults,
    qa_scorecard: qaScorecard,
    mejora_continua: mejoraContinua,
    learning: {
      conversation_patterns: conversationPatternsLearned,
      postmortem_patterns: postmortemPatternsLearned,
    },
  });
}
