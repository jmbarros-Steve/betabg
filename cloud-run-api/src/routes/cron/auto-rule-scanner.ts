import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * auto-rule-scanner
 *
 * Cron wrapper that reads recent qa_log errors and calls auto-rule-generator
 * for each unique error_type that no existing criterio_rule covers.
 *
 * Runs hourly. Caps at MAX_PER_RUN unique error_types per run to control Haiku cost.
 * Dedupes within the run by error_type. Excludes its own logs + auto-rule-generator
 * logs (both by detected_by and by check_type as defense in depth) to avoid feedback loops.
 *
 * Cron: 0 * * * *
 * Called via POST /api/cron/auto-rule-scanner
 * Auth: X-Cron-Secret header
 */

type GeneratorResponse =
  | { created: true; rule_id: string; rule: unknown }
  | { created: false; existing_covers: true; rule_id: string; reason: string }
  | { error: string };

export async function autoRuleScanner(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const cronSecret = process.env.CRON_SECRET!;

  const supabase = getSupabaseAdmin();
  const LOOKBACK_HOURS = 1;
  const MAX_PER_RUN = 5;
  const FETCH_TIMEOUT_MS = 60_000; // Haiku can be slow; 60s per call

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // 1. Fetch recent errors. Defense in depth: exclude by both detected_by AND
  // check_type to prevent feedback loops even if a future cron forgets to set
  // detected_by correctly.
  const { data: errors, error: fetchError } = await supabase
    .from('qa_log')
    .select('error_type, error_detail, check_type, detected_by, checked_at')
    .in('status', ['warn', 'fail'])
    .not('error_type', 'is', null)
    .not('detected_by', 'in', '("auto-rule-scanner","auto-rule-generator")')
    .not('check_type', 'in', '("auto_rule_scan","auto_rule_generated")')
    .gte('checked_at', since)
    .order('checked_at', { ascending: false })
    .limit(500);

  if (fetchError) {
    console.error('[auto-rule-scanner] qa_log fetch error:', fetchError);
    return c.json({ error: 'Failed to fetch qa_log', detail: fetchError.message }, 500);
  }

  if (!errors || errors.length === 0) {
    return c.json({ success: true, scanned: 0, generated: 0, message: 'no recent errors' });
  }

  // 2. Dedupe by error_type. Sort is DESC so first seen = most recent.
  const seen = new Set<string>();
  const unique: Array<{
    error_type: string;
    error_detail: string;
    check_type: string;
    detected_by: string;
  }> = [];

  for (const err of errors) {
    if (!err.error_type || seen.has(err.error_type)) continue;
    seen.add(err.error_type);
    unique.push({
      error_type: err.error_type,
      error_detail: err.error_detail || `Error type: ${err.error_type}`,
      check_type: err.check_type || 'unknown',
      detected_by: err.detected_by || 'unknown',
    });
    if (unique.length >= MAX_PER_RUN) break;
  }

  // 3. HTTP-over-self to auto-rule-generator. We use INTERNAL_BASE_URL (explicit
  // env var, falls back to Cloud Run's intra-container localhost) instead of
  // deriving from c.req.url, which is implicit and unreliable behind proxies.
  const baseUrl = process.env.INTERNAL_BASE_URL || 'http://localhost:8080';

  const results: Array<{ error_type: string; status: string; rule_id?: string }> = [];
  let generated = 0;
  let covered = 0;
  let failed = 0;
  let drifted = 0;

  // Fire all rule-generator calls in parallel instead of sequentially (up to MAX_PER_RUN=5)
  const settledResults = await Promise.allSettled(unique.map(async (err) => {
    const res = await fetch(`${baseUrl}/api/cron/auto-rule-generator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': cronSecret,
      },
      body: JSON.stringify({
        error_detail: err.error_detail.slice(0, 1000),
        error_type: err.error_type,
        entity_type: err.check_type,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[auto-rule-scanner] ${err.error_type} → HTTP ${res.status}: ${text.slice(0, 200)}`
      );
      return { err, outcome: 'http_error' as const, status: res.status };
    }

    const data = (await res.json()) as GeneratorResponse;
    return { err, outcome: 'ok' as const, data };
  }));

  for (const settled of settledResults) {
    if (settled.status === 'rejected') {
      failed++;
      // Extract error_type from the rejection — fallback to 'unknown'
      const reason = settled.reason;
      const errorType = reason?.error_type || 'unknown';
      results.push({ error_type: errorType, status: 'exception' });
      console.error(
        `[auto-rule-scanner] exception:`,
        reason?.message?.slice(0, 200) || reason
      );
      continue;
    }

    const result = settled.value;
    if (result.outcome === 'http_error') {
      failed++;
      results.push({ error_type: result.err.error_type, status: `http_${result.status}` });
      continue;
    }

    const { err: errItem, data } = result;
    if ('created' in data && data.created === true) {
      generated++;
      results.push({ error_type: errItem.error_type, status: 'created', rule_id: data.rule_id });
    } else if ('existing_covers' in data && data.existing_covers === true) {
      covered++;
      results.push({
        error_type: errItem.error_type,
        status: 'existing_covers',
        rule_id: data.rule_id,
      });
    } else {
      // Contract drift — not a failure, but worth surfacing in monitoring.
      drifted++;
      results.push({ error_type: errItem.error_type, status: 'unknown_response' });
      console.warn(
        `[auto-rule-scanner] contract drift for ${errItem.error_type}: keys=${Object.keys(data).join(',')}`
      );
    }
  }

  // 4. Single summary row in qa_log (structured JSONB, not stringified).
  const { error: logErr } = await supabase.from('qa_log').insert({
    check_type: 'auto_rule_scan',
    status: generated > 0 ? 'pass' : 'info',
    details: { scanned: unique.length, generated, covered, failed, drifted, results },
    detected_by: 'auto-rule-scanner',
  });
  if (logErr) {
    console.error('[auto-rule-scanner] qa_log insert failed:', logErr.message);
  }

  return c.json({
    success: true,
    scanned: unique.length,
    generated,
    covered,
    failed,
    drifted,
    results,
  });
}
