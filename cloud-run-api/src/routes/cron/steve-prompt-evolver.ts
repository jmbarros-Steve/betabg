import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function stevePromptEvolver(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  try {
    // Gather feedback data
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fix Tomás W7 (2026-04-07, Fase 1 deuda técnica):
    // Isidora W6 observó que el Promise.all destructuraba sin capturar
    // errores en las 3 queries. Mismo patrón sistémico de bug silencioso
    // que ya causó 6 bugs. Ahora: capturamos result objects y logueamos
    // cada error explícitamente antes de continuar con data || [].
    const [fbRes, qaRes, rulesRes] = await Promise.all([
      supabase.from('steve_training_feedback')
        .select('feedback_rating, original_recommendation, improved_recommendation, feedback_notes')
        .gte('created_at', thirtyDaysAgo)
        .limit(20),
      // Fix Tomás W7 (2026-04-07): qa_log usa `checked_at`, no `created_at`.
      // Antes esta query siempre devolvía vacío → los prompts de Steve nunca
      // evolucionaban con feedback real del juez nocturno.
      supabase.from('qa_log')
        .select('check_type, status, details')
        .eq('check_type', 'juez_nocturno')
        .gte('checked_at', thirtyDaysAgo)
        .limit(10),
      supabase.from('steve_knowledge')
        .select('titulo, contenido, veces_usada, quality_score')
        .eq('activo', true)
        .eq('approval_status', 'approved')
        .order('veces_usada', { ascending: false })
        .limit(10),
    ]);

    if (fbRes.error) console.error('[steve-prompt-evolver] feedback fetch error:', fbRes.error.message);
    if (qaRes.error) console.error('[steve-prompt-evolver] qa_log fetch error:', qaRes.error.message);
    if (rulesRes.error) console.error('[steve-prompt-evolver] knowledge fetch error:', rulesRes.error.message);

    const feedback = fbRes.data || [];
    const qaResults = qaRes.data || [];
    const usedRules = rulesRes.data || [];

    const positivePatterns = (feedback || [])
      .filter(f => f.feedback_rating === 'positive')
      .map(f => f.original_recommendation?.slice(0, 100))
      .filter(Boolean);

    const negativePatterns = (feedback || [])
      .filter(f => f.feedback_rating === 'negative')
      .map(f => `BAD: ${f.original_recommendation?.slice(0, 80)} → BETTER: ${f.improved_recommendation?.slice(0, 80)}`)
      .filter(Boolean);

    const topRules = (usedRules || [])
      .filter(r => (r.veces_usada || 0) > 0)
      .map(r => `${r.titulo} (usado ${r.veces_usada}x, quality: ${r.quality_score})`);

    if (positivePatterns.length + negativePatterns.length < 3) {
      return c.json({ success: true, message: 'Not enough feedback data to evolve' });
    }

    // Ask Claude to generate prompt improvements
    const evolveRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Eres el meta-optimizador de Steve, un consultor AI de marketing.
Analiza qué tipo de respuestas funcionan y cuáles no, y genera INSTRUCCIONES que Steve debería seguir.

RESPUESTAS QUE FUNCIONARON:
${positivePatterns.join('\n')}

RESPUESTAS QUE FALLARON (con corrección):
${negativePatterns.join('\n')}

REGLAS MÁS USADAS:
${topRules.join('\n')}

Genera 3-5 instrucciones nuevas para el system prompt de Steve.
Formato JSON:
[{"instruccion": "SIEMPRE hacer X cuando Y", "razon": "porque los datos muestran Z"}]

Solo incluye instrucciones basadas en los datos. Sin markdown.`,
        }],
      }),
    });

    if (!evolveRes.ok) return c.json({ error: 'AI error' }, 500);

    const evolveData: any = await evolveRes.json();
    const text = (evolveData.content?.[0]?.text || '[]').trim();
    const instructions = JSON.parse(text.replace(/```json|```/g, '').trim());

    // Save evolved instructions as high-priority knowledge
    let saved = 0;
    for (const inst of (Array.isArray(instructions) ? instructions : [])) {
      if (!inst.instruccion) continue;

      await supabase.from('steve_knowledge').upsert({
        categoria: 'brief',
        titulo: `[AUTO-PROMPT] ${inst.instruccion.slice(0, 50)}`.slice(0, 80),
        contenido: `INSTRUCCIÓN: ${inst.instruccion}. PORQUE: ${inst.razon || 'basado en feedback de usuarios.'}`.slice(0, 600),
        activo: true,
        orden: 99,
        approval_status: 'approved',
      }, { onConflict: 'categoria,titulo' });
      saved++;
    }

    await supabase.from('qa_log').insert({
      check_type: 'prompt_evolution',
      status: 'pass',
      details: JSON.stringify({
        positive_patterns: positivePatterns.length,
        negative_patterns: negativePatterns.length,
        instructions_generated: saved,
        instructions,
      }),
      detected_by: 'steve-prompt-evolver',
    });

    await supabase.from('steve_episodic_memory').insert({
      event_type: 'prompt_evolution',
      summary: `Steve evolved: ${saved} new prompt instructions based on ${positivePatterns.length + negativePatterns.length} feedback data points`,
      data: { instructions, positivePatterns, negativePatterns },
    });

    return c.json({ success: true, instructionsGenerated: saved, instructions });
  } catch (err: any) {
    console.error('[steve-prompt-evolver]', err);
    return c.json({ error: err.message }, 500);
  }
}
