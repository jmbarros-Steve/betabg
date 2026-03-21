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
}

const FAILURE_THRESHOLD = 10;
const RECOVERY_TIMEOUT_MS = 15_000; // 15s before trying half_open

const circuits = new Map<string, CircuitEntry>();

function getOrCreate(service: string): CircuitEntry {
  let entry = circuits.get(service);
  if (!entry) {
    entry = { state: 'closed', failures: 0, lastFailureAt: 0, openedAt: 0 };
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
    // Check if recovery timeout has elapsed
    if (Date.now() - entry.openedAt >= RECOVERY_TIMEOUT_MS) {
      entry.state = 'half_open';
      console.log(`[circuit-breaker] ${service}: open → half_open (testing 1 request)`);
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
}

/**
 * Record a failed response. After FAILURE_THRESHOLD consecutive failures,
 * opens the circuit and logs to qa_log.
 */
export function recordFailure(service: string, errorDetail?: string): void {
  const entry = getOrCreate(service);
  entry.failures++;
  entry.lastFailureAt = Date.now();

  if (entry.state === 'half_open') {
    // Test request failed — back to open
    entry.state = 'open';
    entry.openedAt = Date.now();
    console.warn(`[circuit-breaker] ${service}: half_open → open (test request failed)`);
    logToQaLog(service, 'half_open → open', errorDetail);
    return;
  }

  if (entry.failures >= FAILURE_THRESHOLD && entry.state === 'closed') {
    entry.state = 'open';
    entry.openedAt = Date.now();
    console.warn(`[circuit-breaker] ${service}: closed → open (${entry.failures} consecutive failures)`);
    logToQaLog(service, `closed → open after ${entry.failures} failures`, errorDetail);
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
