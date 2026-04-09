import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Task Completed Hook — triggers QA smoke when Leonardo marks a task as completed.
 *
 * Flow:
 * 1. Leonardo completes a task → calls this endpoint with task_id
 * 2. Endpoint determines the QA scope based on the task's type/squad/title
 * 3. Inserts a qa_smoke_request into qa_log for Javiera (W12) to pick up
 * 4. Returns the scope so the local orchestrator can call:
 *    tmux send-keys -t steve:12 "qa_scope=<scope> /run-qa" Enter
 *
 * Auth: X-Cron-Secret header (internal use by Leonardo/Cerebro)
 */

interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  type: string;
  source: string;
  assigned_squad: string | null;
  assigned_agent: string | null;
  priority: string;
  status: string;
  spec: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  completed_at: string | null;
}

// Map task attributes to QA scope for Javiera
function determineQaScope(task: TaskRecord): string {
  const text = `${task.title} ${task.description || ''} ${task.assigned_squad || ''}`.toLowerCase();

  if (text.match(/meta|campaña|anuncio|pixel|audience|social.?inbox|competitor/)) return 'meta';
  if (text.match(/steve.?mail|email|template|editor|grapes|ses|campaign.?builder/)) return 'stevemail';
  if (text.match(/shopify|producto|orden|carrito|inventory/)) return 'shopify';
  if (text.match(/klaviyo|flow|automation|subscriber/)) return 'klaviyo';
  if (text.match(/google.?ads|google.?metric/)) return 'google';
  if (text.match(/steve.?chat|brief|brand|estrategia|copy/)) return 'steve-chat';
  if (text.match(/login|auth|signup|password|oauth|session/)) return 'auth';
  if (text.match(/metric|dashboard|kpi|chart|analytics/)) return 'metrics';
  if (text.match(/deploy|cloud.?run|infra|endpoint|health/)) return 'infra';

  // Default based on squad
  const squadMap: Record<string, string> = {
    marketing: 'meta',
    producto: 'portal',
    infra: 'infra',
    meta: 'meta',
    email: 'stevemail',
    analytics: 'metrics',
  };

  return squadMap[task.assigned_squad || ''] || 'full';
}

export async function taskCompleted(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const cronSecret = process.env.CRON_SECRET!;

  const supabase = getSupabaseAdmin();

  const body = await c.req.json().catch(() => ({}));
  const { task_id } = body as { task_id?: string };

  if (!task_id) {
    return c.json({ error: 'task_id required' }, 400);
  }

  // Fetch the task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', task_id)
    .single();

  if (taskError || !task) {
    return c.json({ error: 'Task not found', details: taskError?.message }, 404);
  }

  // Only trigger QA for completed tasks
  if (task.status !== 'completed') {
    return c.json({ skipped: true, reason: `Task status is '${task.status}', not 'completed'` });
  }

  const qaScope = determineQaScope(task as TaskRecord);
  const now = new Date().toISOString();

  console.log(`[task-completed] Task ${task_id} completed → QA scope: ${qaScope}`);

  // Mark completion timestamp if not set
  if (!task.completed_at) {
    await supabase
      .from('tasks')
      .update({ completed_at: now })
      .eq('id', task_id);
  }

  // Log QA smoke request for Javiera
  await supabase.from('qa_log').insert({
    check_type: 'qa_smoke_request',
    status: 'pending',
    details: {
      task_id,
      task_title: task.title,
      task_type: task.type,
      task_squad: task.assigned_squad,
      qa_scope: qaScope,
      requested_at: now,
      requested_by: 'leonardo',
    },
  });

  // Trigger auto-postmortem for critical tasks
  if (task.priority === 'critical' || task.priority === 'critica') {
    const selfUrl = process.env.SELF_URL || 'https://steve-api-850416724643.us-central1.run.app';
    try {
      await fetch(`${selfUrl}/api/cron/auto-postmortem`, {
        method: 'POST',
        headers: {
          'X-Cron-Secret': cronSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id }),
      });
      console.log(`[task-completed] Triggered auto-postmortem for critical task ${task_id}`);
    } catch (e) {
      console.error(`[task-completed] Failed to trigger postmortem:`, e);
    }
  }

  // Return scope + tmux command for local orchestrator
  const tmuxCmd = `tmux send-keys -t steve:12 '/qa ${qaScope} --task=${task_id}' Enter`;

  return c.json({
    success: true,
    task_id,
    task_title: task.title,
    qa_scope: qaScope,
    tmux_command: tmuxCmd,
    postmortem_triggered: task.priority === 'critical' || task.priority === 'critica',
  });
}
