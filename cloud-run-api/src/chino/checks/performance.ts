// El Chino — performance executor
// Checks 8-9: measure response times against thresholds

import type { ChinoCheck, CheckResult } from '../types.js';

export async function executePerformance(check: ChinoCheck): Promise<CheckResult> {
  const start = Date.now();

  const url = check.check_config?.url as string | undefined;
  const maxMs = check.check_config?.max_ms as number | undefined;

  if (!url || !maxMs) {
    return {
      result: 'skip',
      error_message: 'check_config missing url or max_ms',
      duration_ms: Date.now() - start,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const fetchStart = Date.now();
    const res = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - fetchStart;
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        result: 'error',
        steve_value: maxMs,
        real_value: elapsed,
        error_message: `URL returned ${res.status}`,
        duration_ms: Date.now() - start,
      };
    }

    if (elapsed <= maxMs) {
      return {
        result: 'pass',
        steve_value: maxMs,
        real_value: elapsed,
        duration_ms: Date.now() - start,
      };
    }

    return {
      result: 'fail',
      steve_value: maxMs,
      real_value: elapsed,
      error_message: `Tardó ${elapsed}ms, máximo ${maxMs}ms`,
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.name === 'AbortError' ? 'Timeout (30s)' : err.message,
      duration_ms: Date.now() - start,
    };
  }
}
