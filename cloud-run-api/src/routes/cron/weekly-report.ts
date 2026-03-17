import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Weekly Report — Paso C.7 (QA Scorecard) + Paso D.7 (Mejora Continua)
 * Generates a weekly summary with:
 * - QA Scorecard: errors, MTTR, autofix rate, self-healed tests, new rules, repeated errors
 * - Mejora Continua: creative performance scores, trend vs last week
 *
 * Cron: 0 8 * * 5 (Friday 8am)
 * Auth: X-Cron-Secret header
 */

export async function weeklyReport(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

  // ─────────────────────────────────────────────
  // C.7 — QA SCORECARD
  // ─────────────────────────────────────────────

  // This week's errors
  const { data: thisWeekErrors } = await supabase
    .from('qa_log')
    .select('*')
    .gte('checked_at', weekAgo);

  // Last week's errors (for trend)
  const { data: lastWeekErrors } = await supabase
    .from('qa_log')
    .select('*')
    .gte('checked_at', twoWeeksAgo)
    .lt('checked_at', weekAgo);

  const thisWeekCount = thisWeekErrors?.length || 0;
  const lastWeekCount = lastWeekErrors?.length || 0;
  const errorTrend = thisWeekCount < lastWeekCount
    ? 'bajando'
    : thisWeekCount > lastWeekCount
      ? 'subiendo'
      : 'estable';

  // Auto-fixed count
  const autoFixed = (thisWeekErrors || []).filter(
    (e: { status: string }) => e.status === 'auto_fixed'
  ).length;
  const autofixRate = thisWeekCount > 0
    ? Math.round((autoFixed / thisWeekCount) * 100)
    : 0;

  // Self-healed tests
  const selfHealed = (thisWeekErrors || []).filter(
    (e: { check_type: string }) => e.check_type === 'test_self_healed'
  ).length;

  // New CRITERIO rules created this week
  const { data: newRulesData } = await supabase
    .from('criterio_rules')
    .select('id')
    .gte('created_at', weekAgo);
  const newRules = newRulesData?.length || 0;

  // Repeated errors (check_type appearing 2+ times with status fail)
  const failErrors = (thisWeekErrors || []).filter(
    (e: { status: string }) => e.status === 'fail'
  );
  const errorCounts: Record<string, number> = {};
  for (const e of failErrors) {
    const key = (e as { check_type: string }).check_type;
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  }
  const repeatedErrors = Object.values(errorCounts).filter((c) => c >= 2).length;

  // MTTR: average time between fail and auto_fixed/pass for same check_type
  // Simplified: count fail entries that later got an auto_fixed within the week
  const failEntries = (thisWeekErrors || []).filter(
    (e: { status: string }) => e.status === 'fail'
  );
  const fixedEntries = (thisWeekErrors || []).filter(
    (e: { status: string }) => e.status === 'auto_fixed'
  );

  let mttrMinutes: number | null = null;
  if (failEntries.length > 0 && fixedEntries.length > 0) {
    const mttrSamples: number[] = [];
    for (const fail of failEntries) {
      const f = fail as { check_type: string; checked_at: string };
      const matchingFix = fixedEntries.find(
        (fix: any) =>
          fix.check_type === f.check_type &&
          new Date(fix.checked_at).getTime() > new Date(f.checked_at).getTime()
      );
      if (matchingFix) {
        const diff =
          new Date((matchingFix as { checked_at: string }).checked_at).getTime() -
          new Date(f.checked_at).getTime();
        mttrSamples.push(diff / 60000); // minutes
      }
    }
    if (mttrSamples.length > 0) {
      mttrMinutes = Math.round(
        mttrSamples.reduce((a, b) => a + b, 0) / mttrSamples.length
      );
    }
  }

  const qaScorecard = {
    errors_this_week: thisWeekCount,
    errors_last_week: lastWeekCount,
    error_trend: errorTrend,
    mttr_minutes: mttrMinutes,
    autofix_rate_pct: autofixRate,
    auto_fixed_count: autoFixed,
    self_healed_tests: selfHealed,
    new_rules: newRules,
    repeated_errors: repeatedErrors,
  };

  // ─────────────────────────────────────────────
  // D.7 — MEJORA CONTINUA
  // ─────────────────────────────────────────────

  // Creatives measured this week
  const { data: weekCreatives } = await supabase
    .from('creative_history')
    .select('performance_score, performance_verdict')
    .not('performance_score', 'is', null)
    .gte('measured_at', weekAgo);

  const creativeCount = weekCreatives?.length || 0;
  const avgScore = creativeCount > 0
    ? Math.round(
        (weekCreatives as { performance_score: number }[]).reduce(
          (s, c) => s + c.performance_score,
          0
        ) / creativeCount
      )
    : null;

  const buenos = (weekCreatives || []).filter(
    (c: { performance_verdict: string }) => c.performance_verdict === 'bueno'
  ).length;
  const malos = (weekCreatives || []).filter(
    (c: { performance_verdict: string }) => c.performance_verdict === 'malo'
  ).length;

  // Last week's creatives (for trend)
  const { data: lastWeekCreatives } = await supabase
    .from('creative_history')
    .select('performance_score')
    .not('performance_score', 'is', null)
    .gte('measured_at', twoWeeksAgo)
    .lt('measured_at', weekAgo);

  const lastCreativeCount = lastWeekCreatives?.length || 0;
  const lastAvgScore = lastCreativeCount > 0
    ? Math.round(
        (lastWeekCreatives as { performance_score: number }[]).reduce(
          (s, c) => s + c.performance_score,
          0
        ) / lastCreativeCount
      )
    : null;

  const scoreTrend =
    avgScore !== null && lastAvgScore !== null
      ? avgScore > lastAvgScore
        ? 'mejorando'
        : avgScore < lastAvgScore
          ? 'empeorando'
          : 'estable'
      : null;

  // Fatigue detections this week
  const { data: fatigueData } = await supabase
    .from('qa_log')
    .select('id')
    .eq('check_type', 'creative_fatigue')
    .gte('checked_at', weekAgo);
  const fatigueCount = fatigueData?.length || 0;

  const mejoraContinua = {
    creatives_measured: creativeCount,
    avg_score: avgScore,
    last_week_avg_score: lastAvgScore,
    score_trend: scoreTrend,
    buenos,
    malos,
    fatigue_detected: fatigueCount,
  };

  // ─────────────────────────────────────────────
  // SAVE REPORT
  // ─────────────────────────────────────────────

  const reportDate = now.toISOString().split('T')[0];

  await supabase.from('qa_log').insert({
    check_type: 'weekly_report',
    status: 'pass',
    details: {
      report_date: reportDate,
      qa_scorecard: qaScorecard,
      mejora_continua: mejoraContinua,
    },
  });

  console.log(`[weekly-report] QA Scorecard: ${thisWeekCount} errors (${errorTrend}), MTTR: ${mttrMinutes ?? 'N/A'}min, autofix: ${autofixRate}%`);
  console.log(`[weekly-report] Mejora Continua: ${creativeCount} creatives, avg score: ${avgScore ?? 'N/A'}/100, trend: ${scoreTrend ?? 'N/A'}`);

  return c.json({
    success: true,
    report_date: reportDate,
    qa_scorecard: qaScorecard,
    mejora_continua: mejoraContinua,
  });
}
