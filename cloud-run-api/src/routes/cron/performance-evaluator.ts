import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { createTask } from '../../lib/task-creator.js';
import { sendAlertEmail } from '../../lib/send-alert-email.js';

/**
 * Performance Evaluator — Paso D.2
 * Runs daily at 10am (after D.1 performance tracker measures at 8-9am).
 * For each creative measured today that lacks a performance_reason:
 *   1. Calls Claude Haiku to analyze WHY it worked or not (2 lines max)
 *   2. Saves performance_reason to creative_history
 *   3. If verdict is 'malo', creates a task for improvement
 *
 * Cron: 0 10 * * * (daily 10am)
 * Auth: X-Cron-Secret header
 */
export async function performanceEvaluator(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Find creatives measured today that don't have a reason yet
  const today = new Date().toISOString().split('T')[0];
  const { data: measured, error: fetchError } = await supabase
    .from('creative_history')
    .select('*')
    .gte('measured_at', today)
    .is('performance_reason', null);

  if (fetchError) {
    console.error('[perf-evaluator] Failed to fetch:', fetchError);
    return c.json({ error: fetchError.message }, 500);
  }

  if (!measured || measured.length === 0) {
    return c.json({ message: 'No creatives to evaluate today', evaluated: 0 });
  }

  let evaluated = 0;
  let tasksCreated = 0;

  for (const creative of measured) {
    try {
      // Build metrics summary based on channel
      let metricsSummary: string;
      if (creative.channel === 'meta') {
        metricsSummary = `CTR: ${creative.meta_ctr ?? 'N/A'}%, CPA: $${creative.meta_cpa ?? 'N/A'}, ROAS: ${creative.meta_roas ?? 'N/A'}x, Spend: $${creative.meta_spend ?? 'N/A'}`;
      } else {
        metricsSummary = `Open: ${creative.klaviyo_open_rate != null ? (creative.klaviyo_open_rate * 100).toFixed(1) : 'N/A'}%, Click: ${creative.klaviyo_click_rate != null ? (creative.klaviyo_click_rate * 100).toFixed(1) : 'N/A'}%`;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Analiza este resultado de marketing en 2 líneas máximo.

CANAL: ${creative.channel}
ÁNGULO: ${creative.angle || 'no especificado'}
COPY: ${(creative.content_summary || '').substring(0, 200)}
TEMA: ${creative.theme || 'no especificado'}

RESULTADOS:
${metricsSummary}

SCORE: ${creative.performance_score}/100 (${creative.performance_verdict})
VS PROMEDIO MERCHANT: ${JSON.stringify(creative.benchmark_comparison || {})}

¿Por qué funcionó o no funcionó? Responde en máximo 2 líneas, concreto.`,
          }],
        }),
      });

      if (!response.ok) {
        console.error(`[perf-evaluator] Anthropic error for ${creative.id}: ${response.status}`);
        continue;
      }

      const aiData: any = await response.json();
      const reason = aiData.content?.[0]?.text || 'Sin análisis disponible';

      // Update creative_history with the reason
      const { error: updateError } = await supabase
        .from('creative_history')
        .update({ performance_reason: reason })
        .eq('id', creative.id);

      if (updateError) {
        console.error(`[perf-evaluator] Update error for ${creative.id}:`, updateError);
        continue;
      }

      evaluated++;

      // If verdict is 'malo', create improvement task + email merchant
      if (creative.performance_verdict === 'malo') {
        const shopId = creative.shop_id || creative.client_id;
        const result = await createTask({
          shop_id: shopId,
          title: `Campaña ${creative.channel} con score ${creative.performance_score}/100`,
          description: `${creative.theme || creative.content_summary || 'Producto'}: ${reason}\nÁngulo: ${creative.angle || 'N/A'}\nSugerencia: probar ángulo distinto.`,
          priority: 'media',
          type: 'mejora',
          source: 'criterio',
        });
        if (result.created) tasksCreated++;

        // Email alert to merchant
        if (shopId) {
          await sendAlertEmail(
            shopId,
            `📊 Campaña ${creative.channel} con bajo rendimiento (${creative.performance_score}/100)`,
            `<h2>Rendimiento bajo detectado</h2>
<p>Tu campaña de <strong>${creative.channel}</strong> obtuvo un score de <strong>${creative.performance_score}/100</strong>.</p>
<p><strong>Análisis:</strong> ${reason}</p>
<p><strong>Ángulo usado:</strong> ${creative.angle || 'No especificado'}</p>
<p><strong>Sugerencia:</strong> Probar un ángulo distinto para mejorar el rendimiento.</p>
<p>— Steve Ads</p>`
          );
        }
      }
    } catch (error) {
      console.error(`[perf-evaluator] Error evaluating creative ${creative.id}:`, error);
    }
  }

  console.log(`[perf-evaluator] Evaluated: ${evaluated}, Tasks created: ${tasksCreated}`);

  // ── LEARNING LOOP: Generalizar patrones por ángulo → steve_knowledge ──
  let knowledgeInserted = 0;
  try {
    // Fetch all measured creatives from last 30 days with angle + verdict
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: recentCreatives } = await supabase
      .from('creative_history')
      .select('angle, channel, performance_score, performance_verdict')
      .not('angle', 'is', null)
      .not('performance_verdict', 'is', null)
      .gte('measured_at', thirtyDaysAgo);

    if (recentCreatives && recentCreatives.length >= 5) {
      // Group by angle+channel
      const groups: Record<string, { scores: number[]; verdicts: string[] }> = {};
      for (const c of recentCreatives) {
        const key = `${c.angle}||${c.channel}`;
        if (!groups[key]) groups[key] = { scores: [], verdicts: [] };
        groups[key].scores.push(c.performance_score);
        groups[key].verdicts.push(c.performance_verdict);
      }

      for (const [key, data] of Object.entries(groups)) {
        if (data.scores.length < 5) continue; // Need 5+ data points

        const [angle, channel] = key.split('||');
        const avgScore = Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length);
        const goodRate = Math.round((data.verdicts.filter(v => v === 'bueno').length / data.verdicts.length) * 100);
        const badRate = Math.round((data.verdicts.filter(v => v === 'malo').length / data.verdicts.length) * 100);

        // Only write knowledge for clear patterns (>60% good or >60% bad)
        if (goodRate < 60 && badRate < 60) continue;

        const titulo = `${channel}: ángulo "${angle}" ${goodRate >= 60 ? 'FUNCIONA' : 'NO FUNCIONA'}`;
        const contenido = goodRate >= 60
          ? `Ángulo "${angle}" en ${channel} tiene score promedio ${avgScore}/100 con ${goodRate}% tasa de éxito (${data.scores.length} mediciones). USAR este ángulo.`
          : `Ángulo "${angle}" en ${channel} tiene score promedio ${avgScore}/100 con ${badRate}% tasa de fracaso (${data.scores.length} mediciones). EVITAR este ángulo.`;

        // Upsert: update if exists, insert if not
        const { error: upsertErr } = await supabase
          .from('steve_knowledge')
          .upsert(
            {
              categoria: channel === 'meta' ? 'meta_ads' : 'klaviyo',
              titulo,
              contenido,
              activo: true,
              orden: 95, // High priority but below manual rules (99)
            },
            { onConflict: 'categoria,titulo' }
          );

        if (!upsertErr) {
          knowledgeInserted++;
          console.log(`[perf-evaluator] Knowledge inserted: ${titulo}`);
        }
      }
    }
  } catch (learnErr) {
    console.error('[perf-evaluator] Learning loop error:', learnErr);
  }

  return c.json({
    evaluated,
    tasks_created: tasksCreated,
    total_measured: measured.length,
    knowledge_learned: knowledgeInserted,
  });
}
