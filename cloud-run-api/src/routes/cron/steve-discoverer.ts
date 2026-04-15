import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

export async function steveDiscoverer(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  const discoveries: Array<{ pattern: string; evidence: string }> = [];

  try {
    // Gather diverse data points for pattern detection
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Campaign metrics by day of week and platform
    const metrics = await safeQuery<{ platform: string; metric_date: string; spend: number | string; impressions: number; clicks: number; conversions: number; conversion_value: number | string }>(
      supabase
        .from('campaign_metrics')
        .select('platform, metric_date, spend, impressions, clicks, conversions, conversion_value')
        .gte('metric_date', thirtyDaysAgo),
      'steveDiscoverer.fetchMetrics',
    );

    // Creative history performance
    const creatives = await safeQuery<{ channel: string; angle: string | null; verdict: string | null; score: number | null; created_at: string }>(
      supabase
        .from('creative_history')
        .select('channel, angle, verdict, score, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      'steveDiscoverer.fetchCreatives',
    );

    // Email campaign performance
    const emails = await safeQuery<{ subject: string | null; send_count: number; open_count: number; click_count: number; created_at: string }>(
      supabase
        .from('email_campaigns')
        .select('subject, send_count, open_count, click_count, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      'steveDiscoverer.fetchEmails',
    );

    if (metrics.length < 20) {
      return c.json({ success: true, message: 'Not enough data for discovery' });
    }

    // Build analysis dataset
    const dayOfWeekPerf: Record<string, { spend: number; revenue: number; count: number }> = {};
    for (const m of metrics) {
      const dow = new Date(m.metric_date).toLocaleDateString('en', { weekday: 'long' });
      if (!dayOfWeekPerf[dow]) dayOfWeekPerf[dow] = { spend: 0, revenue: 0, count: 0 };
      dayOfWeekPerf[dow].spend += Number(m.spend) || 0;
      dayOfWeekPerf[dow].revenue += Number(m.conversion_value) || 0;
      dayOfWeekPerf[dow].count++;
    }

    const anglePerf: Record<string, { good: number; bad: number; total: number }> = {};
    for (const cr of creatives) {
      if (!cr.angle) continue;
      if (!anglePerf[cr.angle]) anglePerf[cr.angle] = { good: 0, bad: 0, total: 0 };
      anglePerf[cr.angle].total++;
      if (cr.verdict === 'bueno' || (cr.score && cr.score >= 60)) anglePerf[cr.angle].good++;
      if (cr.verdict === 'malo' || (cr.score && cr.score < 40)) anglePerf[cr.angle].bad++;
    }

    const emailPerf = emails.map(e => ({
      subject_length: (e.subject || '').length,
      has_emoji: /[\u{1F600}-\u{1F64F}]/u.test(e.subject || ''),
      has_number: /\d/.test(e.subject || ''),
      open_rate: e.send_count > 0 ? ((e.open_count || 0) / e.send_count * 100) : 0,
      click_rate: e.send_count > 0 ? ((e.click_count || 0) / e.send_count * 100) : 0,
    }));

    // Ask Claude to find patterns
    const analysisRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analiza estos datos REALES y encuentra patrones que nadie haya enseñado explícitamente.

PERFORMANCE POR DÍA DE SEMANA:
${JSON.stringify(dayOfWeekPerf, null, 2)}

PERFORMANCE POR ÁNGULO CREATIVO:
${JSON.stringify(anglePerf, null, 2)}

PATRONES DE EMAIL (${emailPerf.length} campañas):
${JSON.stringify(emailPerf.slice(0, 15), null, 2)}

Busca correlaciones, patrones inesperados, y genera reglas NUEVAS que emerjan de los datos.
Solo incluye patrones con evidencia clara (no inventes).

JSON array:
[{"titulo": "max 60 chars", "contenido": "CUANDO: [condición]. HAZ: [acción]. PORQUE: [dato del análisis].", "evidence": "datos que lo respaldan"}]

Si no hay patrones claros, responde []. Sin markdown.`,
        }],
      }),
    });

    if (!analysisRes.ok) return c.json({ error: 'AI error' }, 500);

    const analysisData: any = await analysisRes.json();
    const text = (analysisData.content?.[0]?.text || '[]').trim();
    const patterns = JSON.parse(text.replace(/```json|```/g, '').trim());

    let saved = 0;
    for (const pattern of (Array.isArray(patterns) ? patterns : [])) {
      if (!pattern.titulo || !pattern.contenido) continue;

      await supabase.from('steve_knowledge').upsert({
        categoria: 'analisis',
        titulo: `[DESCUBIERTO] ${pattern.titulo}`.slice(0, 80),
        contenido: pattern.contenido.slice(0, 600),
        activo: true,
        orden: 99, // Discovered from real data = highest confidence
        approval_status: 'pending',
        ejemplo_real: pattern.evidence || null,
      }, { onConflict: 'categoria,titulo' });

      discoveries.push({ pattern: pattern.titulo, evidence: pattern.evidence || '' });
      saved++;
    }

    if (saved > 0) {
      await supabase.from('qa_log').insert({
        check_type: 'pattern_discovery',
        status: 'pass',
        details: JSON.stringify({ discovered: saved, discoveries }),
        detected_by: 'steve-discoverer',
      });
    }

    return c.json({ success: true, discovered: saved, discoveries });
  } catch (err: any) {
    console.error('[steve-discoverer]', err);
    return c.json({ error: err.message }, 500);
  }
}
