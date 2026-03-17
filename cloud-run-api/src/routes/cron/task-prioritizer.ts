import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Task Prioritizer — Paso C.1 (Regla del Freeze)
 * Processes pending tasks in priority order, enforcing the SLO freeze rule:
 *
 * - When ANY slo_config has status='frozen', ONLY tasks of type 'bug', 'fix',
 *   or 'seguridad' are processed. All other types ('feature', 'mejora',
 *   'creative', 'optimization', 'analysis', 'report') are blocked.
 * - When no freeze is active, all pending tasks are processed normally.
 *
 * Priority order: critica > alta > high > medium/media > low/baja
 *
 * Cron: 0 0-23 * * * (every hour)
 * Auth: X-Cron-Secret header
 */

// Types allowed during a freeze — only bug fixes and security
const FREEZE_ALLOWED_TYPES = ['bug', 'fix', 'seguridad'];

// Priority ranking (lower = higher priority)
const PRIORITY_RANK: Record<string, number> = {
  critica: 0,
  critical: 0,
  alta: 1,
  high: 1,
  media: 2,
  medium: 2,
  baja: 3,
  low: 3,
};

// Squad assignment heuristics based on task type/source
const SQUAD_HINTS: Record<string, string> = {
  meta_campaign: 'meta',
  email: 'email',
  email_campaign: 'email',
  google_ads: 'google',
  shopify: 'shopify',
  creative: 'creative',
};

export async function taskPrioritizer(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();

  // ─────────────────────────────────────────────
  // 1. Check for SLO freeze
  // ─────────────────────────────────────────────
  const { data: frozenSLOs } = await supabase
    .from('slo_config')
    .select('id, name')
    .eq('status', 'frozen');

  const isFrozen = frozenSLOs && frozenSLOs.length > 0;
  const freezeReason = isFrozen
    ? `Bloqueada por freeze: ${frozenSLOs!.map((s: { name: string }) => s.name).join(', ')}`
    : null;

  // ─────────────────────────────────────────────
  // 2. Fetch all pending tasks
  // ─────────────────────────────────────────────
  const { data: pendingTasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, title, type, priority, source, assigned_squad, spec')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (fetchError || !pendingTasks) {
    console.error('[task-prioritizer] Failed to fetch pending tasks:', fetchError);
    return c.json({ error: 'Failed to fetch tasks' }, 500);
  }

  if (pendingTasks.length === 0) {
    return c.json({ success: true, message: 'No pending tasks', frozen: isFrozen });
  }

  // ─────────────────────────────────────────────
  // 3. Sort by priority
  // ─────────────────────────────────────────────
  const sorted = [...pendingTasks].sort((a, b) => {
    const rankA = PRIORITY_RANK[a.priority] ?? 2;
    const rankB = PRIORITY_RANK[b.priority] ?? 2;
    return rankA - rankB;
  });

  // ─────────────────────────────────────────────
  // 4. Apply freeze filter
  // ─────────────────────────────────────────────
  let toProcess: typeof sorted;
  let blocked: typeof sorted;

  if (isFrozen) {
    toProcess = sorted.filter((t) => FREEZE_ALLOWED_TYPES.includes(t.type));
    blocked = sorted.filter((t) => !FREEZE_ALLOWED_TYPES.includes(t.type));

    // Block non-allowed tasks
    for (const task of blocked) {
      await supabase
        .from('tasks')
        .update({
          status: 'blocked',
          result: { blocked_reason: freezeReason },
        })
        .eq('id', task.id);
    }

    if (blocked.length > 0) {
      console.warn(
        `[task-prioritizer] 🔴 FREEZE active — blocked ${blocked.length} non-critical tasks: ${frozenSLOs!.map((s: { name: string }) => s.name).join(', ')}`
      );
    }
  } else {
    toProcess = sorted;
    blocked = [];

    // Unblock previously frozen tasks (restore to pending)
    const { data: blockedTasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('status', 'blocked');

    if (blockedTasks && blockedTasks.length > 0) {
      for (const task of blockedTasks) {
        await supabase
          .from('tasks')
          .update({
            status: 'pending',
            result: null,
          })
          .eq('id', task.id);
      }
      console.log(
        `[task-prioritizer] ✅ Freeze lifted — unblocked ${blockedTasks.length} tasks`
      );
    }
  }

  // ─────────────────────────────────────────────
  // 5. Assign squad if missing
  // ─────────────────────────────────────────────
  let assigned = 0;
  for (const task of toProcess) {
    if (task.assigned_squad) continue;

    // Try to infer squad from spec.entity_type or task source
    const entityType = (task.spec as any)?.entity_type;
    const inferredSquad = (entityType && SQUAD_HINTS[entityType]) || null;

    if (inferredSquad) {
      await supabase
        .from('tasks')
        .update({ assigned_squad: inferredSquad })
        .eq('id', task.id);
      assigned++;
    }
  }

  console.log(
    `[task-prioritizer] Processed ${pendingTasks.length} pending tasks: ` +
    `${toProcess.length} to process, ${blocked.length} blocked, ${assigned} auto-assigned`
  );

  return c.json({
    success: true,
    processed_at: new Date().toISOString(),
    frozen: isFrozen,
    frozen_slos: frozenSLOs?.map((s: { id: string; name: string }) => s.name) || [],
    total_pending: pendingTasks.length,
    to_process: toProcess.length,
    blocked: blocked.length,
    auto_assigned: assigned,
  });
}
