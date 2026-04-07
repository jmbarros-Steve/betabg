import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { snapshotBeforeUpdate } from '../../lib/knowledge-versioner.js';

// Fórmula de scoring extraída para reutilizar después de auto-rewrite.
// 5 criterios × 20 pts = 100 max.
function computeQualityScore(
  contenido: string,
  ejemploReal: string | null,
  vecesUsada: number | null,
  createdAt: string,
  now: number,
): number {
  let score = 0;

  // Format (20pts): has CUANDO/HAZ/PORQUE
  const hasFormat = contenido.includes('CUANDO') && contenido.includes('HAZ') && contenido.includes('PORQUE');
  score += hasFormat ? 20 : (contenido.includes('1.') ? 10 : 5);

  // Specificity (20pts): not too generic, has numbers or thresholds
  const hasNumbers = /\d+%|\$\d+|\d+x|\d+ días/.test(contenido);
  const isSpecific = contenido.length > 100 && contenido.length < 600;
  score += (hasNumbers ? 10 : 0) + (isSpecific ? 10 : 5);

  // Usage (20pts): veces_usada
  score += Math.min(20, (vecesUsada || 0) * 4);

  // Recency (20pts): newer = better
  const ageDays = (now - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  score += ageDays < 30 ? 20 : ageDays < 90 ? 15 : ageDays < 180 ? 10 : 5;

  // Real example (20pts)
  score += ejemploReal ? 20 : 0;

  return score;
}

export async function knowledgeQualityScore(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    // Fix Tomás W7 (2026-04-07): paginar. PostgREST corta en 1000 filas por
    // default (max-rows). Antes solo se scoreaban las primeras 1000 activas
    // y las restantes quedaban con quality_score stale (o null).
    const rules: any[] = [];
    const BATCH_SIZE = 1000;
    let offset = 0;
    while (true) {
      const { data: batch, error } = await supabase
        .from('steve_knowledge')
        .select('id, titulo, contenido, orden, veces_usada, ultima_vez_usada, ejemplo_real, created_at, merged_from, effectiveness_score')
        .eq('activo', true)
        .order('id', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      rules.push(...batch);
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    if (rules.length === 0) return c.json({ success: true, message: 'No rules to score' });

    const now = Date.now();
    let improved = 0;
    let deactivated = 0;
    // Fix Tomás W7 (2026-04-07): acumular score local. El SELECT NO trae
    // quality_score, así que el reduce previo siempre reportaba avg=0.
    let totalScore = 0;

    for (const rule of rules) {
      let score = computeQualityScore(
        rule.contenido,
        rule.ejemplo_real,
        rule.veces_usada,
        rule.created_at,
        now,
      );
      totalScore += score;

      // Update score
      await supabase.from('steve_knowledge')
        .update({ quality_score: score })
        .eq('id', rule.id);

      // Auto-improve rules with score < 40 (if we have API key)
      if (score < 40 && ANTHROPIC_API_KEY) {
        try {
          await snapshotBeforeUpdate(rule.id, 'knowledge-quality-score', `auto-rewrite: quality_score=${score}`);
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 400,
              messages: [{
                role: 'user',
                content: `Mejora esta regla de marketing para que sea más accionable.

Regla actual:
Título: ${rule.titulo}
Contenido: ${rule.contenido}

Reescríbela en formato:
CUANDO: [situación específica]. HAZ: 1. [acción concreta]. 2. [acción]. PORQUE: [razón con dato].

Máximo 500 caracteres. Solo la regla mejorada, sin explicaciones.`,
              }],
            }),
          });

          if (res.ok) {
            const data: any = await res.json();
            const improvedContent = (data.content?.[0]?.text || '').trim();
            if (improvedContent && improvedContent.length > 50 && improvedContent.length < 600) {
              // Fix Tomás W7 (2026-04-07): re-evaluar con la fórmula real en lugar
              // de hardcodear 60. Si el rewrite quedó mediocre, queremos saberlo.
              const newScore = computeQualityScore(
                improvedContent,
                rule.ejemplo_real,
                rule.veces_usada,
                rule.created_at,
                now,
              );
              await supabase.from('steve_knowledge')
                .update({ contenido: improvedContent, quality_score: newScore })
                .eq('id', rule.id);
              // Reflejar el nuevo score en el promedio del run.
              totalScore += (newScore - score);
              score = newScore;
              improved++;
            }
          }
        } catch {}
      }

      // Deactivate rules with score < 20 and no usage in 60+ days
      if (score < 20 && (!rule.ultima_vez_usada || (now - new Date(rule.ultima_vez_usada).getTime()) > 60 * 24 * 60 * 60 * 1000)) {
        await supabase.from('steve_knowledge')
          .update({ activo: false })
          .eq('id', rule.id);
        deactivated++;
      }

      // Auto-adjust orden based on effectiveness_score
      const eff = (rule as any).effectiveness_score as number | null;
      if (eff != null) {
        let newOrden: number | null = null;
        if (eff >= 70) newOrden = 95;
        else if (eff < 30 && (rule.veces_usada || 0) > 5) newOrden = 60;
        if (newOrden != null && newOrden !== rule.orden) {
          await supabase.from('steve_knowledge')
            .update({ orden: newOrden })
            .eq('id', rule.id);
        }
      }
    }

    const avgScore = rules.length > 0 ? Math.round(totalScore / rules.length) : 0;

    await supabase.from('qa_log').insert({
      check_type: 'knowledge_quality_score',
      status: 'pass',
      details: JSON.stringify({
        total_scored: rules.length,
        avg_score: avgScore,
        improved,
        deactivated,
      }),
      detected_by: 'knowledge-quality-score',
    });

    return c.json({ success: true, totalScored: rules.length, avgScore, improved, deactivated });
  } catch (err: any) {
    console.error('[knowledge-quality-score]', err);
    return c.json({ error: err.message }, 500);
  }
}
