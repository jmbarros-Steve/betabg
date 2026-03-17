import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const SKYVERN_API_URL = process.env.SKYVERN_API_URL || 'http://localhost:8000';
const SKYVERN_API_KEY = process.env.SKYVERN_API_KEY || '';

/**
 * POST /api/cron/skyvern-dispatcher
 * Polls tasks with type='skyvern-onboarding' and dispatches them to Skyvern.
 * Also checks running tasks for completion.
 *
 * Cron: every 2 minutes
 */
export async function skyvernDispatcher(c: Context) {
  // Verify cron secret
  const cronSecret = c.req.header('X-Cron-Secret');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (cronSecret !== serviceKey && cronSecret !== process.env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (!SKYVERN_API_KEY) {
    return c.json({ error: 'SKYVERN_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { dispatched: 0, completed: 0, failed: 0, errors: [] as string[] };

  // ─── Phase 1: Dispatch pending skyvern tasks ──────────────────────────────
  const { data: pendingTasks, error: fetchErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('type', 'skyvern-onboarding')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  if (fetchErr) {
    console.error('[skyvern-dispatcher] Error fetching pending tasks:', fetchErr);
    return c.json({ error: fetchErr.message }, 500);
  }

  for (const task of pendingTasks || []) {
    try {
      const spec = task.spec || {};
      const url = spec.url;
      const prompt = spec.prompt || task.description || task.title;

      if (!url) {
        console.error(`[skyvern-dispatcher] Task ${task.id} missing spec.url, marking failed`);
        await supabase.from('tasks').update({
          status: 'failed',
          result: { error: 'Missing spec.url' },
          completed_at: new Date().toISOString(),
        }).eq('id', task.id);
        results.failed++;
        continue;
      }

      // Create Skyvern run
      const response = await fetch(`${SKYVERN_API_URL}/v1/run/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': SKYVERN_API_KEY,
        },
        body: JSON.stringify({
          url,
          prompt,
          engine: 'skyvern-2.0',
          max_steps: spec.max_steps || 20,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Skyvern API ${response.status}: ${errText.slice(0, 200)}`);
      }

      const runData = await response.json() as any;
      const runId = runData.run_id;

      // Update task to in_progress with run_id
      await supabase.from('tasks').update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        attempts: (task.attempts || 0) + 1,
        result: { skyvern_run_id: runId, app_url: runData.app_url },
      }).eq('id', task.id);

      console.log(`[skyvern-dispatcher] Dispatched task ${task.id} → run ${runId}`);
      results.dispatched++;
    } catch (err: any) {
      console.error(`[skyvern-dispatcher] Error dispatching task ${task.id}:`, err);
      results.errors.push(`${task.id}: ${err.message}`);
    }
  }

  // ─── Phase 2: Check running skyvern tasks ─────────────────────────────────
  const { data: runningTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('type', 'skyvern-onboarding')
    .eq('status', 'in_progress')
    .limit(20);

  for (const task of runningTasks || []) {
    try {
      const runId = task.result?.skyvern_run_id;
      if (!runId) continue;

      const response = await fetch(`${SKYVERN_API_URL}/v1/runs/${runId}`, {
        headers: { 'x-api-key': SKYVERN_API_KEY },
      });

      if (!response.ok) continue;

      const runData = await response.json() as any;

      if (runData.status === 'completed') {
        await supabase.from('tasks').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: {
            skyvern_run_id: runId,
            app_url: runData.app_url,
            output: runData.output,
            steps: runData.step_count,
            recording_url: runData.recording_url,
            screenshot_urls: runData.screenshot_urls,
          },
        }).eq('id', task.id);
        console.log(`[skyvern-dispatcher] Task ${task.id} completed (run ${runId})`);
        results.completed++;
      } else if (runData.status === 'failed') {
        await supabase.from('tasks').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          result: {
            skyvern_run_id: runId,
            app_url: runData.app_url,
            failure_reason: runData.failure_reason,
            steps: runData.step_count,
          },
        }).eq('id', task.id);
        console.log(`[skyvern-dispatcher] Task ${task.id} failed: ${runData.failure_reason}`);
        results.failed++;
      }
      // If still running/queued, do nothing — check next cycle
    } catch (err: any) {
      console.error(`[skyvern-dispatcher] Error checking task ${task.id}:`, err);
      results.errors.push(`check-${task.id}: ${err.message}`);
    }
  }

  return c.json({ ok: true, ...results });
}
