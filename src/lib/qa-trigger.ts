import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STEVE_API_URL = process.env.STEVE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';
const CRON_SECRET = process.env.CRON_SECRET!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Module mapping: task attributes → QA focus area
const MODULE_MAP: Record<string, string> = {
  meta: 'meta-ads',
  email: 'stevemail',
  stevemail: 'stevemail',
  klaviyo: 'klaviyo',
  shopify: 'shopify',
  google: 'google-ads',
  analytics: 'metrics',
  producto: 'portal',
  infra: 'infra',
  marketing: 'meta-ads',
};

function resolveModule(task: {
  assigned_squad?: string | null;
  title?: string;
  type?: string;
  spec?: Record<string, unknown> | null;
}): string {
  // 1. Check spec.entity_type
  const entityType = (task.spec?.entity_type as string) || '';
  if (entityType.includes('email')) return 'stevemail';
  if (entityType.includes('meta')) return 'meta-ads';
  if (entityType.includes('shopify')) return 'shopify';

  // 2. Check assigned_squad
  if (task.assigned_squad && MODULE_MAP[task.assigned_squad]) {
    return MODULE_MAP[task.assigned_squad];
  }

  // 3. Keyword scan on title
  const title = (task.title || '').toLowerCase();
  if (title.match(/meta|campaña|anuncio/)) return 'meta-ads';
  if (title.match(/email|steve.?mail|template/)) return 'stevemail';
  if (title.match(/klaviyo|flow/)) return 'klaviyo';
  if (title.match(/shopify|product|orden/)) return 'shopify';
  if (title.match(/google|gads/)) return 'google-ads';
  if (title.match(/login|auth/)) return 'auth';
  if (title.match(/dashboard|metric/)) return 'metrics';

  return 'full';
}

function runTmux(command: string): Promise<{ ok: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    exec(command, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, output: stdout || stderr });
      }
    });
  });
}

/**
 * Trigger QA for a single completed task.
 * Calls the task-completed backend endpoint, then fires tmux to Javiera (window 12).
 */
export async function triggerQaForTask(taskId: string): Promise<{
  success: boolean;
  module: string;
  tmux_sent: boolean;
  details?: string;
}> {
  // 1. Fetch task
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error || !task) {
    return { success: false, module: 'unknown', tmux_sent: false, details: `Task not found: ${error?.message}` };
  }

  if (task.status !== 'completed') {
    return { success: false, module: 'unknown', tmux_sent: false, details: `Task status is '${task.status}', skipping` };
  }

  const module = resolveModule(task);

  // 2. Notify backend (logs to qa_log, triggers postmortem if critical)
  try {
    await fetch(`${STEVE_API_URL}/api/cron/task-completed`, {
      method: 'POST',
      headers: {
        'X-Cron-Secret': CRON_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task_id: taskId }),
    });
  } catch (e) {
    console.error(`[qa-trigger] Failed to notify task-completed endpoint:`, e);
  }

  // 3. Fire tmux command to Javiera (steve:12)
  const tmuxCmd = `tmux send-keys -t steve:12 'cd ~/steve && /qa --quick https://www.steve.cl --focus ${module} --task=${taskId}' Enter`;
  const tmuxResult = await runTmux(tmuxCmd);

  if (!tmuxResult.ok) {
    console.warn(`[qa-trigger] tmux failed (Javiera may not be running): ${tmuxResult.error}`);
  }

  console.log(`[qa-trigger] Task ${taskId} → QA module=${module}, tmux=${tmuxResult.ok}`);

  return {
    success: true,
    module,
    tmux_sent: tmuxResult.ok,
    details: tmuxResult.ok ? undefined : tmuxResult.error,
  };
}

/**
 * Poll for recently completed tasks that haven't been QA'd yet.
 * Intended to be called by Leonardo's cron loop.
 */
export async function pollCompletedTasks(): Promise<{ triggered: number; errors: number }> {
  // Find tasks completed in the last 10 minutes that don't have a qa_log entry yet
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: completedTasks, error } = await supabase
    .from('tasks')
    .select('id, title, assigned_squad, spec, type')
    .eq('status', 'completed')
    .gte('completed_at', tenMinAgo)
    .order('completed_at', { ascending: false })
    .limit(10);

  if (error || !completedTasks) {
    console.error('[qa-trigger] Failed to poll completed tasks:', error?.message);
    return { triggered: 0, errors: 1 };
  }

  // Check which already have a qa_log entry
  const taskIds = completedTasks.map((t) => t.id);
  if (taskIds.length === 0) return { triggered: 0, errors: 0 };

  const { data: existingLogs } = await supabase
    .from('qa_log')
    .select('details->task_id')
    .eq('check_type', 'qa_smoke_request')
    .in('details->task_id', taskIds);

  const alreadyLogged = new Set((existingLogs || []).map((l: any) => l.task_id));

  let triggered = 0;
  let errors = 0;

  for (const task of completedTasks) {
    if (alreadyLogged.has(task.id)) continue;

    const result = await triggerQaForTask(task.id);
    if (result.success) {
      triggered++;
    } else {
      errors++;
    }
  }

  if (triggered > 0) {
    console.log(`[qa-trigger] Triggered QA for ${triggered} completed task(s)`);
  }

  return { triggered, errors };
}
