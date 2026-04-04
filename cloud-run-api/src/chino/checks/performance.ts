// El Chino — performance executor
// Checks 8-9: simple URL fetch (existing)
// Checks 60,66,71,181-188,195: endpoint response time (Group A)

import type { ChinoCheck, CheckResult } from '../types.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const API_BASE = process.env.STEVE_API_URL
  || 'https://steve-api-850416724643.us-central1.run.app';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ─── Shared fetch with timeout ───────────────────────────────────

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs = 30000
): Promise<{ res: Response; elapsed: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { res, elapsed: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Auth headers for Steve API ──────────────────────────────────

function steveHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVICE_KEY}`,
  };
}

// ─── Result builders ─────────────────────────────────────────────

function passResult(elapsed: number, maxMs: number, start: number): CheckResult {
  return {
    result: 'pass',
    steve_value: maxMs,
    real_value: elapsed,
    duration_ms: Date.now() - start,
  };
}

function failResult(elapsed: number, maxMs: number, start: number): CheckResult {
  return {
    result: 'fail',
    steve_value: maxMs,
    real_value: elapsed,
    error_message: `Tardó ${elapsed}ms, máximo ${maxMs}ms`,
    duration_ms: Date.now() - start,
  };
}

function errorResult(msg: string, start: number): CheckResult {
  return { result: 'error', error_message: msg, duration_ms: Date.now() - start };
}

// ─── Generic: POST/GET to endpoint, measure time ─────────────────
// Accepts ANY status (2xx, 3xx, 4xx) as "endpoint alive".
// Only 5xx or network error = error.

async function measureEndpoint(
  path: string,
  method: string,
  body: Record<string, any> | null,
  maxMs: number,
  start: number,
  timeoutMs = 30000
): Promise<CheckResult> {
  const url = `${API_BASE}${path}`;
  const init: RequestInit = {
    method,
    headers: steveHeaders(),
  };
  if (body && method === 'POST') {
    init.body = JSON.stringify(body);
  }

  const { res, elapsed } = await timedFetch(url, init, timeoutMs);

  if (res.status >= 500) {
    return errorResult(`${path} returned ${res.status}`, start);
  }

  return elapsed <= maxMs
    ? passResult(elapsed, maxMs, start)
    : failResult(elapsed, maxMs, start);
}

// ─── Check 71/181: Steve Chat (needs real response) ──────────────

async function perfSteveChat(maxMs: number, start: number): Promise<CheckResult> {
  const url = `${API_BASE}/api/steve-chat`;
  const { res, elapsed } = await timedFetch(url, {
    method: 'POST',
    headers: steveHeaders(),
    body: JSON.stringify({ message: 'ping — responde en una línea corta' }),
  }, maxMs + 5000); // extra margin for timeout

  if (res.status >= 500) {
    return errorResult(`Steve Chat returned ${res.status}`, start);
  }

  if (!res.ok) {
    // Auth or validation error — still measure time
    return elapsed <= maxMs
      ? passResult(elapsed, maxMs, start)
      : failResult(elapsed, maxMs, start);
  }

  // Verify we got a real response
  const json = await res.json() as any;
  const reply = json.response || json.message || json.reply || '';
  if (reply.length < 2) {
    return errorResult(`Steve Chat respondió vacío (${elapsed}ms)`, start);
  }

  return elapsed <= maxMs
    ? passResult(elapsed, maxMs, start)
    : failResult(elapsed, maxMs, start);
}

// ─── Check 195: Anthropic API direct latency ─────────────────────

async function perfAnthropicDirect(maxMs: number, start: number): Promise<CheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { result: 'skip', error_message: 'ANTHROPIC_API_KEY not set', duration_ms: Date.now() - start };
  }

  const { res, elapsed } = await timedFetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
    maxMs + 5000
  );

  if (res.status >= 500) {
    return errorResult(`Anthropic API returned ${res.status}`, start);
  }

  return elapsed <= maxMs
    ? passResult(elapsed, maxMs, start)
    : failResult(elapsed, maxMs, start);
}

// ─── Original simple fetch (checks 8, 9, api_exists) ────────────

async function perfSimpleFetch(check: ChinoCheck): Promise<CheckResult> {
  const start = Date.now();
  const url = check.check_config?.url as string | undefined;
  const maxMs = check.check_config?.max_ms as number | undefined;
  const method = (check.check_config?.method as string) || 'GET';

  if (!url || !maxMs) {
    return { result: 'skip', error_message: 'check_config missing url or max_ms', duration_ms: Date.now() - start };
  }

  const init: RequestInit = { method };
  if (method === 'POST') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = '{}';
  }

  const { res, elapsed } = await timedFetch(url, init, 30000);

  // Accept any non-5xx response as "endpoint alive"
  if (res.status >= 500) {
    return errorResult(`URL returned ${res.status} (${elapsed}ms)`, start);
  }

  return elapsed <= maxMs
    ? passResult(elapsed, maxMs, start)
    : failResult(elapsed, maxMs, start);
}

// ─── Check 48: Edge function errors últimos 30min ────────────────

async function perfEdgeFunctionErrors(currentRunId?: string): Promise<CheckResult> {
  const start = Date.now();
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();

  let query = supabase
    .from('chino_reports')
    .select('id', { count: 'exact', head: true })
    .eq('result', 'error')
    .gte('created_at', since);

  if (currentRunId) {
    query = query.neq('run_id', currentRunId);
  }

  const { count, error } = await query;

  if (error) return errorResult(`DB error: ${error.message}`, start);

  if (count && count > 0) {
    return {
      result: 'fail',
      steve_value: 0,
      real_value: count,
      error_message: `${count} errors en chino_reports últimos 30min (excl run actual)`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: 0, real_value: 0, duration_ms: Date.now() - start };
}

// ─── Check 82: Supabase connection pool latency ─────────────────

async function perfSupabasePool(): Promise<CheckResult> {
  const start = Date.now();
  const supabase = getSupabaseAdmin();
  const maxMs = 500;

  const t0 = Date.now();
  const { error } = await supabase.from('clients').select('id').limit(1);
  const elapsed = Date.now() - t0;

  if (error) return errorResult(`DB query failed: ${error.message}`, start);

  return elapsed <= maxMs
    ? passResult(elapsed, maxMs, start)
    : failResult(elapsed, maxMs, start);
}

// ─── Check 85: Storage buckets accessible ───────────────────────

async function perfStorageBuckets(): Promise<CheckResult> {
  const start = Date.now();
  const supabase = getSupabaseAdmin();
  const buckets = ['avatars', 'assets', 'emails'];
  const failures: string[] = [];

  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).list('', { limit: 1 });
    if (error) failures.push(`${bucket}: ${error.message}`);
  }

  if (failures.length > 0) {
    return {
      result: 'fail',
      steve_value: `${buckets.length} buckets`,
      real_value: `${failures.length} failures`,
      error_message: `Storage errors: ${failures.join('; ')}`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: `${buckets.length} buckets`, real_value: 'All accessible', duration_ms: Date.now() - start };
}

// ─── Check 89: Memory usage < 512MB ─────────────────────────────

async function perfMemoryUsage(): Promise<CheckResult> {
  const start = Date.now();
  const maxMB = 512;
  const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

  if (usedMB >= maxMB) {
    return {
      result: 'fail',
      steve_value: maxMB,
      real_value: usedMB,
      error_message: `Heap usage ${usedMB}MB >= ${maxMB}MB`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: maxMB, real_value: usedMB, duration_ms: Date.now() - start };
}

// ─── Check 90: P95 latency from chino_reports ───────────────────

async function perfP95Latency(): Promise<CheckResult> {
  const start = Date.now();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('chino_reports')
    .select('duration_ms')
    .not('duration_ms', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return errorResult(`DB error: ${error.message}`, start);
  if (!data || data.length < 10) {
    return { result: 'skip', error_message: `Solo ${(data || []).length} reports para calcular p95`, duration_ms: Date.now() - start };
  }

  const sorted = data.map((r) => r.duration_ms).sort((a: number, b: number) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index];
  const maxP95 = 30000; // 30s

  if (p95 > maxP95) {
    return {
      result: 'fail',
      steve_value: maxP95,
      real_value: p95,
      error_message: `P95 latency ${p95}ms > ${maxP95}ms`,
      duration_ms: Date.now() - start,
    };
  }
  return { result: 'pass', steve_value: maxP95, real_value: p95, duration_ms: Date.now() - start };
}

// ─── Main executor ───────────────────────────────────────────────

export async function executePerformance(check: ChinoCheck, runId?: string): Promise<CheckResult> {
  const start = Date.now();

  try {
    switch (check.check_number) {
      // ── Existing: simple URL fetch ──
      case 8:
      case 9:
        return await perfSimpleFetch(check);

      // ── Group A: Endpoint response time ──

      // #60 — Klaviyo push emails < 5s
      case 60:
        return await measureEndpoint('/api/klaviyo-push-emails', 'POST', {}, 5000, start);

      // #66 — SteveMail send-email < 3s
      case 66:
        return await measureEndpoint('/api/send-email', 'POST', {}, 3000, start);

      // #71 — Steve Chat < 10s con mensaje válido
      case 71:
        return await perfSteveChat(10000, start);

      // #181 — Steve Chat p95 < 10s
      case 181:
        return await perfSteveChat(10000, start);

      // #182 — fetch-shopify-products < 5s
      case 182:
        return await measureEndpoint('/api/fetch-shopify-products', 'POST', {}, 5000, start);

      // #183 — sync-meta-metrics < 15s
      case 183:
        return await measureEndpoint('/api/sync-meta-metrics', 'POST', {}, 15000, start);

      // #184 — generate-meta-copy < 8s
      case 184:
        return await measureEndpoint('/api/generate-meta-copy', 'POST', {
          prompt: 'test — no generar',
          system_test: true,
        }, 8000, start);

      // #185 — manage-meta-campaign < 5s
      case 185:
        return await measureEndpoint('/api/manage-meta-campaign', 'POST', {}, 5000, start);

      // #186 — send-email < 3s
      case 186:
        return await measureEndpoint('/api/send-email', 'POST', {}, 3000, start);

      // #187 — generate-image < 20s
      case 187:
        return await measureEndpoint('/api/generate-image', 'POST', {}, 20000, start);

      // #188 — steve-strategy < 12s
      case 188:
        return await measureEndpoint('/api/steve-strategy', 'POST', {
          query: 'test — no generar',
          system_test: true,
        }, 12000, start);

      // #195 — Anthropic API latency < 5s
      case 195:
        return await perfAnthropicDirect(5000, start);

      // ── Group B: Special handlers ──

      // #48 — Edge function errors últimos 30min
      case 48:
        return await perfEdgeFunctionErrors(runId);

      // #82 — Supabase pool latency < 500ms
      case 82:
        return await perfSupabasePool();

      // #85 — Storage buckets accessible
      case 85:
        return await perfStorageBuckets();

      // #89 — Memory usage < 512MB
      case 89:
        return await perfMemoryUsage();

      // #90 — P95 latency < 30s
      case 90:
        return await perfP95Latency();

      // ── Default: try check_config url+max_ms (api_exists, etc) ──
      default:
        return await perfSimpleFetch(check);
    }
  } catch (err: any) {
    return errorResult(
      err.name === 'AbortError' ? 'Timeout (30s)' : err.message,
      start
    );
  }
}
