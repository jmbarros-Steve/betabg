import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { snapshotBeforeUpdate } from '../../lib/knowledge-versioner.js';

export async function knowledgeQualityScore(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  try {
    const { data: rules } = await supabase
      .from('steve_knowledge')
      .select('id, titulo, contenido, orden, veces_usada, ultima_vez_usada, ejemplo_real, created_at, merged_from, effectiveness_score')
      .eq('activo', true);

    if (!rules) return c.json({ success: true, message: 'No rules to score' });

    const now = Date.now();
    let improved = 0;
    let deactivated = 0;

    for (const rule of rules) {
      let score = 0;

      // Format (20pts): has CUANDO/HAZ/PORQUE
      const hasFormat = rule.contenido.includes('CUANDO') && rule.contenido.includes('HAZ') && rule.contenido.includes('PORQUE');
      score += hasFormat ? 20 : (rule.contenido.includes('1.') ? 10 : 5);

      // Specificity (20pts): not too generic, has numbers or thresholds
      const hasNumbers = /\d+%|\$\d+|\d+x|\d+ días/.test(rule.contenido);
      const isSpecific = rule.contenido.length > 100 && rule.contenido.length < 600;
      score += (hasNumbers ? 10 : 0) + (isSpecific ? 10 : 5);

      // Usage (20pts): veces_usada and recency
      const usageScore = Math.min(20, (rule.veces_usada || 0) * 4);
      score += usageScore;

      // Recency (20pts): newer = better
      const ageMs = now - new Date(rule.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      score += ageDays < 30 ? 20 : ageDays < 90 ? 15 : ageDays < 180 ? 10 : 5;

      // Real example (20pts)
      score += rule.ejemplo_real ? 20 : 0;

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
              await supabase.from('steve_knowledge')
                .update({ contenido: improvedContent, quality_score: 60 })
                .eq('id', rule.id);
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

    await supabase.from('qa_log').insert({
      check_type: 'knowledge_quality_score',
      status: 'pass',
      details: JSON.stringify({
        total_scored: rules.length,
        avg_score: Math.round(rules.length > 0 ? rules.reduce((a, r) => a + (r as any).quality_score || 0, 0) / rules.length : 0),
        improved,
        deactivated,
      }),
      detected_by: 'knowledge-quality-score',
    });

    return c.json({ success: true, totalScored: rules.length, improved, deactivated });
  } catch (err: any) {
    console.error('[knowledge-quality-score]', err);
    return c.json({ error: err.message }, 500);
  }
}
