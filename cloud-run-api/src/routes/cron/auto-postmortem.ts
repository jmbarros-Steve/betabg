import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Auto Postmortem — Paso C.3
 * Called when a critical task is completed. Generates a postmortem with
 * 5 Whys analysis and creates prevention tasks automatically.
 *
 * POST /api/cron/auto-postmortem { task_id: string }
 * Auth: X-Cron-Secret header
 */
export async function autoPostmortem(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { task_id } = await c.req.json();
  if (!task_id) {
    return c.json({ error: 'task_id is required' }, 400);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Fetch the completed task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', task_id)
    .single();

  if (taskError || !task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // Only for critical tasks
  if (task.priority !== 'critica') {
    return c.json({ skipped: true, reason: 'Not a critical task' });
  }

  // Calculate duration
  const duration = task.completed_at && task.created_at
    ? Math.round((new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 60000)
    : null;

  // Claude generates postmortem
  let postmortem;
  try {
    const pm = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Genera un postmortem para este incidente crítico en Steve Ads:

TÍTULO: ${task.title}
DESCRIPCIÓN: ${(task.description || '').substring(0, 500)}
FUENTE: ${task.source}
DURACIÓN: ${duration} minutos (desde detección hasta fix)
INTENTOS: ${task.attempts}
RESULTADO: ${(task.result || '').substring(0, 300)}

Responde en JSON:
{
  "summary": "qué pasó en 1 línea",
  "duration_minutes": ${duration},
  "impact": "a quién afectó y cómo",
  "root_cause": "causa raíz en 1 línea",
  "five_whys": ["why1", "why2", "why3", "why4", "why5"],
  "what_prevented_it": "qué regla/test/invariante habría evitado esto",
  "prevention_action": {
    "type": "new_rule" | "new_invariant" | "new_test" | "refactor",
    "description": "qué crear exactamente"
  },
  "lessons": ["lección 1", "lección 2"]
}`,
        }],
      }),
    });

    const aiData: any = await pm.json();
    const text = aiData.content?.[0]?.text || '';
    postmortem = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('[postmortem] Claude analysis failed:', e);
    return c.json({ error: 'AI analysis failed' }, 500);
  }

  // Save postmortem to qa_log
  await supabase.from('qa_log').insert({
    check_type: 'postmortem',
    status: 'info',
    details: {
      task_id: task.id,
      task_title: task.title,
      ...postmortem,
    },
  });

  // Create prevention task automatically
  let preventionTaskCreated = false;
  if (postmortem.prevention_action) {
    const pa = postmortem.prevention_action;
    const typeMap: Record<string, { prefix: string; taskType: string; priority: string }> = {
      new_rule: { prefix: 'Crear regla', taskType: 'mejora', priority: 'alta' },
      new_invariant: { prefix: 'Crear invariante', taskType: 'seguridad', priority: 'alta' },
      new_test: { prefix: 'Crear test', taskType: 'mejora', priority: 'media' },
      refactor: { prefix: 'Refactor', taskType: 'mejora', priority: 'alta' },
    };

    const mapping = typeMap[pa.type];
    if (mapping) {
      const preventionTitle = `${mapping.prefix}: ${(pa.description || '').substring(0, 80)}`;

      // Deduplicate
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('title', preventionTitle)
        .in('status', ['pending', 'in_progress'])
        .limit(1)
        .maybeSingle();

      if (!existing) {
        await supabase.from('tasks').insert({
          title: preventionTitle,
          description: `Postmortem de "${task.title}" reveló que falta: ${pa.description}`,
          priority: mapping.priority,
          type: mapping.taskType,
          source: 'cerebro',
          status: 'pending',
        });
        preventionTaskCreated = true;
      }
    }
  }

  console.log(
    `[postmortem] Generated for task ${task.id}: "${task.title}". ` +
    `Duration: ${duration}min. Prevention task: ${preventionTaskCreated}`
  );

  return c.json({
    success: true,
    task_id: task.id,
    postmortem,
    prevention_task_created: preventionTaskCreated,
  });
}
