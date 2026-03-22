import { getSupabaseAdmin } from './supabase.js';

// ---------------------------------------------------------------------------
// Circuit Breaker — protects external APIs from cascading failures
// States: closed (normal) → open (blocked) → half_open (testing 1 request)
// ---------------------------------------------------------------------------

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
  /** Custom recovery timeout (e.g. longer for rate limits) */
  recoveryMs: number;
}

const FAILURE_THRESHOLD = 5;            // 5 consecutive failures → open
const RECOVERY_TIMEOUT_MS = 60_000;     // 60s before trying half_open
const RATE_LIMIT_RECOVERY_MS = 120_000; // 120s recovery for rate-limit opens

const circuits = new Map<string, CircuitEntry>();

function getOrCreate(service: string): CircuitEntry {
  let entry = circuits.get(service);
  if (!entry) {
    entry = { state: 'closed', failures: 0, lastFailureAt: 0, openedAt: 0, recoveryMs: RECOVERY_TIMEOUT_MS };
    circuits.set(service, entry);
  }
  return entry;
}

/**
 * Check if a request is allowed for the given service.
 * Returns true if the circuit is closed or half_open (testing).
 */
export function canRequest(service: string): boolean {
  const entry = getOrCreate(service);

  if (entry.state === 'closed') return true;

  if (entry.state === 'open') {
    // Check if recovery timeout has elapsed (uses per-entry recoveryMs)
    if (Date.now() - entry.openedAt >= entry.recoveryMs) {
      entry.state = 'half_open';
      console.log(`[circuit-breaker] ${service}: open → half_open (testing 1 request after ${entry.recoveryMs / 1000}s)`);
      return true;
    }
    return false;
  }

  // half_open — allow the single test request
  return true;
}

/**
 * Record a successful response. Resets the circuit to closed.
 */
export function recordSuccess(service: string): void {
  const entry = getOrCreate(service);
  if (entry.state !== 'closed') {
    console.log(`[circuit-breaker] ${service}: ${entry.state} → closed`);
  }
  entry.state = 'closed';
  entry.failures = 0;
  entry.recoveryMs = RECOVERY_TIMEOUT_MS;
}

/**
 * Record a failed response. After threshold consecutive failures,
 * opens the circuit and logs to qa_log.
 * @param isRateLimit - If true, opens circuit immediately (threshold=1) with longer recovery.
 */
export function recordFailure(service: string, errorDetail?: string, isRateLimit?: boolean): void {
  const entry = getOrCreate(service);
  entry.failures++;
  entry.lastFailureAt = Date.now();

  if (entry.state === 'half_open') {
    // Test request failed — back to open
    entry.state = 'open';
    entry.openedAt = Date.now();
    entry.recoveryMs = isRateLimit ? RATE_LIMIT_RECOVERY_MS : RECOVERY_TIMEOUT_MS;
    console.warn(`[circuit-breaker] ${service}: half_open → open (test request failed)`);
    logToQaLog(service, 'half_open → open', errorDetail);
    return;
  }

  // Rate limit → open immediately (threshold=1); otherwise use normal threshold
  const threshold = isRateLimit ? 1 : FAILURE_THRESHOLD;

  if (entry.failures >= threshold && entry.state === 'closed') {
    entry.state = 'open';
    entry.openedAt = Date.now();
    entry.recoveryMs = isRateLimit ? RATE_LIMIT_RECOVERY_MS : RECOVERY_TIMEOUT_MS;
    const reason = isRateLimit
      ? `rate limit detected (immediate open, recovery ${RATE_LIMIT_RECOVERY_MS / 1000}s)`
      : `${entry.failures} consecutive failures (recovery ${RECOVERY_TIMEOUT_MS / 1000}s)`;
    console.warn(`[circuit-breaker] ${service}: closed → open (${reason})`);
    logToQaLog(service, `closed → open: ${reason}`, errorDetail);
  }
}

/**
 * Get current circuit status for diagnostics.
 */
export function getCircuitStatus(service: string): {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
  recoveryMs: number;
} {
  return { ...getOrCreate(service) };
}

// ---------------------------------------------------------------------------
// qa_log helper — fire-and-forget, never throws
// ---------------------------------------------------------------------------

function logToQaLog(service: string, transition: string, detail?: string): void {
  try {
    const supabase = getSupabaseAdmin();
    supabase
      .from('qa_log')
      .insert({
        check_type: 'circuit-breaker',
        status: 'fail',
        details: `[${service}] ${transition}`,
        error_type: 'rate_limit',
        error_detail: detail || null,
        detected_by: 'circuit-breaker',
        detected_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error('[circuit-breaker] qa_log insert failed:', error.message);
      });
  } catch {
    // Never let logging break the flow
  }
}
