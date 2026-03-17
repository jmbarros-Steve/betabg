import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Rule Calibrator — Paso C.6
 * Detects CRITERIO rules that are miscalibrated:
 * - Reject rate >80% → probably too strict
 * - Reject rate <1% with 50+ evaluations → possibly useless
 *
 * Cron: 0 3 * * 0 (Sunday 3am, after RCA at 2am)
 * Auth: X-Cron-Secret header
 */

interface RuleInfo {
  id: string;
  name: string;
  category: string;
}

interface ProblematicRule {
  rule_id: string;
  name: string;
  category: string;
  reject_rate: number;
  total_evaluations: number;
  issue: 'too_strict' | 'never_rejects';
}

export async function ruleCalibrator(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Fetch all active rules
  const { data: rules, error: rulesError } = await supabase
    .from('criterio_rules')
    .select('id, name, category')
    .eq('active', true);

  if (rulesError || !rules) {
    console.error('[rule-calibrator] Failed to fetch rules:', rulesError);
    return c.json({ error: 'Failed to fetch rules' }, 500);
  }

  const problematic: ProblematicRule[] = [];

  for (const rule of rules as RuleInfo[]) {
    const { data: results, error: queryError } = await supabase
      .from('criterio_results')
      .select('passed')
      .eq('rule_id', rule.id)
      .gte('evaluated_at', thirtyDaysAgo);

    if (queryError || !results) continue;

    const total = results.length;
    if (total < 10) continue; // Not enough data to judge

    const failed = results.filter((r: { passed: boolean }) => !r.passed).length;
    const rejectRate = failed / total;

    if (rejectRate > 0.80) {
      problematic.push({
        rule_id: rule.id,
        name: rule.name,
        category: rule.category,
        reject_rate: Math.round(rejectRate * 100),
        total_evaluations: total,
        issue: 'too_strict',
      });
    } else if (rejectRate < 0.01 && total > 50) {
      problematic.push({
        rule_id: rule.id,
        name: rule.name,
        category: rule.category,
        reject_rate: 0,
        total_evaluations: total,
        issue: 'never_rejects',
      });
    }
  }

  // Log results to qa_log
  await supabase.from('qa_log').insert({
    check_type: 'rule_calibration',
    status: problematic.length > 0 ? 'warn' : 'pass',
    details: {
      rules_checked: rules.length,
      problematic_count: problematic.length,
      problematic,
    },
  });

  // Log individual problematic rules for visibility
  for (const p of problematic) {
    const issueLabel = p.issue === 'too_strict'
      ? `rechaza ${p.reject_rate}% (demasiado estricta)`
      : `nunca rechaza en ${p.total_evaluations} evaluaciones (posiblemente inútil)`;

    console.warn(`[rule-calibrator] ⚙️ ${p.rule_id} "${p.name}": ${issueLabel}`);
  }

  if (problematic.length > 0) {
    console.log(
      `[rule-calibrator] ${problematic.length} rules need review out of ${rules.length} checked`
    );
  } else {
    console.log(`[rule-calibrator] All ${rules.length} rules within normal calibration range`);
  }

  return c.json({
    success: true,
    calibrated_at: new Date().toISOString(),
    rules_checked: rules.length,
    problematic_count: problematic.length,
    problematic,
  });
}
