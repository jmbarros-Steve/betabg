import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery, safeQuerySingle } from '../../lib/safe-supabase.js';

/**
 * Error Budget Calculator — Paso C.1
 * Calculates error budgets for 4 Critical User Journeys (CUJs) based on
 * criterio_results data from the last 30 days.
 *
 * If a CUJ's error budget is exhausted (status=frozen), feature tasks are blocked
 * and only bug/security fixes proceed.
 *
 * Cron: 0 *​/4 * * * (every 4 hours)
 * Auth: X-Cron-Secret header
 */

interface SloConfig {
  id: string;
  name: string;
  slo_target: number;
  window_days: number;
  status: string;
}

// Each CUJ maps to a query against criterio_results
const CUJ_QUERIES: Record<string, {
  entity_type?: string;
  evaluated_by?: string;
  rule_id_pattern?: string;
}> = {
  'CUJ-1': { entity_type: 'health_check' },
  'CUJ-2': { evaluated_by: 'juez' },
  'CUJ-3': { entity_type: 'meta_campaign' },
  'CUJ-4': { entity_type: 'email_campaign' },
};

export async function errorBudgetCalculator(c: Context) {
  // Validate cron secret
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const results: Array<{ id: string; name: string; success_rate: number; budget_remaining: number; status: string }> = [];

  // Fetch all SLO configs
  const { data: slos, error: sloError } = await supabase
    .from('slo_config')
    .select('*');

  if (sloError || !slos) {
    console.error('[error-budget] Failed to fetch SLO configs:', sloError);
    return c.json({ error: 'Failed to fetch SLO configs' }, 500);
  }

  for (const slo of slos as SloConfig[]) {
    const windowDays = slo.window_days || 30;
    const windowStart = new Date(Date.now() - windowDays * 86400000).toISOString();
    const queryDef = CUJ_QUERIES[slo.id];

    if (!queryDef) {
      console.warn(`[error-budget] No query defined for ${slo.id}, skipping`);
      continue;
    }

    // Build query against criterio_results
    let query = supabase
      .from('criterio_results')
      .select('passed')
      .gte('evaluated_at', windowStart);

    if (queryDef.entity_type) {
      query = query.eq('entity_type', queryDef.entity_type);
    }
    if (queryDef.evaluated_by) {
      query = query.eq('evaluated_by', queryDef.evaluated_by);
    }

    const { data: checkResults, error: queryError } = await query;

    if (queryError) {
      console.error(`[error-budget] Query error for ${slo.id}:`, queryError);
      continue;
    }

    if (!checkResults || checkResults.length === 0) {
      console.log(`[error-budget] No data for ${slo.id}, keeping current status`);
      continue;
    }

    const total = checkResults.length;
    const passed = checkResults.filter((r: { passed: boolean }) => r.passed).length;
    const successRate = passed / total;

    // Calculate error budget
    const target = slo.slo_target;
    const errorBudgetTotal = 1 - target; // e.g. 0.005 for 99.5%
    const errorRateActual = 1 - successRate;
    const budgetRemaining = errorBudgetTotal > 0
      ? Math.max(0, (errorBudgetTotal - errorRateActual) / errorBudgetTotal)
      : 1;

    // Determine status
    let status = 'healthy';
    if (budgetRemaining < 0.01) status = 'frozen';
    else if (budgetRemaining < 0.25) status = 'critical';
    else if (budgetRemaining < 0.50) status = 'warning';

    const successRatePercent = Math.round(successRate * 10000) / 100;
    const budgetRemainingPercent = Math.round(budgetRemaining * 100);

    // Update slo_config
    await supabase
      .from('slo_config')
      .update({
        current_success_rate: successRatePercent,
        error_budget_remaining: budgetRemainingPercent,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', slo.id);

    results.push({
      id: slo.id,
      name: slo.name,
      success_rate: successRatePercent,
      budget_remaining: budgetRemainingPercent,
      status,
    });

    console.log(
      `[error-budget] ${slo.id} (${slo.name}): ${successRatePercent}% success, ${budgetRemainingPercent}% budget remaining → ${status}`
    );

    // ALERTS: frozen → create blocking task + log
    if (status === 'frozen') {
      console.error(`[error-budget] 🔴 FROZEN: ${slo.id} ${slo.name} — error budget exhausted`);

      // Create a critical task to signal the freeze
      const freezeTitle = `FREEZE: Error budget ${slo.id} agotado`;
      const existingTask = await safeQuerySingle<{ id: string }>(
        supabase
          .from('tasks')
          .select('id')
          .eq('title', freezeTitle)
          .in('status', ['pending', 'in_progress'])
          .limit(1)
          .maybeSingle() as any,
        'errorBudgetCalculator.fetchExistingFreezeTask',
      );

      if (!existingTask) {
        await supabase.from('tasks').insert({
          title: freezeTitle,
          description:
            `${slo.name} bajo SLO. Success rate ${successRatePercent}% (target: ${(target * 100)}%). ` +
            `CONGELAR features hasta que se recupere el error budget.`,
          priority: 'critica',
          type: 'seguridad',
          source: 'cerebro',
          assigned_squad: 'infra',
          status: 'pending',
        });
      }

      // Log to qa_log
      await supabase.from('qa_log').insert({
        check_type: 'error_budget_frozen',
        status: 'fail',
        details: {
          slo_id: slo.id,
          slo_name: slo.name,
          success_rate: successRatePercent,
          target: target * 100,
          budget_remaining: budgetRemainingPercent,
        },
      });
    } else if (status === 'critical') {
      console.warn(`[error-budget] 🟡 CRITICAL: ${slo.id} ${slo.name} — budget at ${budgetRemainingPercent}%`);
    }
  }

  // Feature freeze enforcement: block feature/mejora tasks when any SLO is frozen
  const frozenSLOs = await safeQuery<{ id: string; name: string }>(
    supabase
      .from('slo_config')
      .select('id, name')
      .eq('status', 'frozen'),
    'errorBudgetCalculator.fetchFrozenSLOs',
  );

  if (frozenSLOs.length > 0) {
    const freezeReason = `Bloqueada por freeze: ${frozenSLOs.map((s: { name: string }) => s.name).join(', ')}`;

    // Block pending feature/mejora tasks
    const featureTasks = await safeQuery<{ id: string; title: string }>(
      supabase
        .from('tasks')
        .select('id, title')
        .in('type', ['feature', 'mejora'])
        .eq('status', 'pending'),
      'errorBudgetCalculator.fetchFeatureTasks',
    );

    if (featureTasks.length > 0) {
      for (const task of featureTasks) {
        await supabase
          .from('tasks')
          .update({ status: 'blocked', result: freezeReason })
          .eq('id', task.id);
      }

      console.log(`[error-budget] Blocked ${featureTasks.length} feature tasks due to freeze`);
    }
  }

  return c.json({
    success: true,
    calculated_at: new Date().toISOString(),
    slos: results,
    frozen_count: frozenSLOs.length,
  });
}
