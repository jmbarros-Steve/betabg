import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingle } from '../../lib/safe-supabase.js';

/**
 * Root Cause Analysis — Paso C.2
 * Runs weekly (Sunday 2am) to analyze error patterns from qa_log.
 * Uses Claude to perform 5 Whys analysis and identify recurring issues.
 * Creates refactor tasks for architectural patterns.
 *
 * Cron: 0 2 * * 0 (Sunday 2am)
 * Auth: X-Cron-Secret header
 */
export async function rootCauseAnalysis(c: Context) {
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

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // 1. Fetch all errors from the last week
  const { data: errors, error: fetchError } = await supabase
    .from('qa_log')
    .select('*')
    .gte('checked_at', weekAgo)
    .order('checked_at', { ascending: false });

  if (fetchError) {
    console.error('[rca] Failed to fetch errors:', fetchError);
    return c.json({ error: fetchError.message }, 500);
  }

  if (!errors || errors.length < 3) {
    console.log(`[rca] Only ${errors?.length || 0} errors this week, skipping analysis`);
    return c.json({ message: 'Menos de 3 errores esta semana, no hay patrones', error_count: errors?.length || 0 });
  }

  // 2. Claude Sonnet analyzes patterns
  const errorSummary = errors.map(e =>
    `- [${e.check_type || e.error_type || 'unknown'}] ${JSON.stringify(e.details || e.error_detail || '').substring(0, 200)} (status: ${e.status})`
  ).join('\n');

  let result;
  try {
    const analysis = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Eres un ingeniero de confiabilidad (SRE). Analiza estos ${errors.length} errores de la última semana y encuentra PATRONES.

ERRORES:
${errorSummary}

ANÁLISIS REQUERIDO:
1. ¿Hay errores que se repiten? Agrúpalos por causa probable.
2. Para cada grupo: aplica 5 Whys.
   - ¿Por qué falló? → ¿Por qué eso? → ¿Por qué eso? → ... hasta la raíz.
3. ¿La raíz es un bug (arreglo puntual) o arquitectura (necesita refactor)?
4. ¿Qué prevención se necesita? (nueva regla, invariante, test, refactor)

Responde en JSON:
{
  "patterns": [
    {
      "name": "nombre del patrón",
      "count": N,
      "five_whys": ["why1", "why2", "why3", "why4", "root_cause"],
      "type": "bug" | "architecture",
      "prevention": "qué hacer para que nunca más pase",
      "priority": "critica" | "alta" | "media"
    }
  ],
  "one_off_errors": N,
  "recurring_errors": N,
  "health_score": "mejorando" | "estable" | "empeorando"
}`,
        }],
      }),
    });

    const aiData: any = await analysis.json();
    const text = aiData.content?.[0]?.text || '';
    result = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('[rca] Claude analysis failed:', e);
    return c.json({ error: 'AI analysis failed' }, 500);
  }

  // 3. Create tasks for architectural patterns
  let tasksCreated = 0;
  for (const pattern of result.patterns || []) {
    if (pattern.type === 'architecture') {
      const rootCause = pattern.five_whys?.[pattern.five_whys.length - 1] || 'unknown';
      const taskTitle = `REFACTOR: ${pattern.name} (${pattern.count} veces esta semana)`;

      // Deduplicate
      const existing = await safeQuerySingle<{ id: string }>(
        supabase
          .from('tasks')
          .select('id')
          .eq('title', taskTitle)
          .in('status', ['pending', 'in_progress'])
          .limit(1)
          .maybeSingle() as any,
        'rootCauseAnalysis.findExistingRefactorTask',
      );

      if (!existing) {
        await supabase.from('tasks').insert({
          title: taskTitle,
          description: `Root cause: ${rootCause}\nPrevención: ${pattern.prevention}`,
          priority: pattern.priority || 'media',
          type: 'mejora',
          source: 'cerebro',
          assigned_squad: 'infra',
          status: 'pending',
        });
        tasksCreated++;
      }
    }
  }

  // 4. Save analysis to qa_log
  await supabase.from('qa_log').insert({
    check_type: 'rca_weekly',
    status: 'info',
    details: result,
  });

  console.log(
    `[rca] Weekly analysis: ${errors.length} errors → ${result.patterns?.length || 0} patterns, ` +
    `${result.recurring_errors || 0} recurring, health: ${result.health_score}. Tasks created: ${tasksCreated}`
  );

  return c.json({
    success: true,
    analyzed_at: new Date().toISOString(),
    total_errors: errors.length,
    patterns: result.patterns?.length || 0,
    recurring_errors: result.recurring_errors || 0,
    one_off_errors: result.one_off_errors || 0,
    health_score: result.health_score,
    tasks_created: tasksCreated,
  });
}
