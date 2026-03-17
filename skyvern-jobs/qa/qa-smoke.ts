/**
 * QA Smoke Test — Quick HTTP-only checks (no browser needed)
 *
 * Runs in ~10 seconds. Used for:
 * - Post-deploy verification
 * - On-demand health checks
 * - CI/CD pipeline integration
 */

import { logResult, saveRun, supabase, type DetectiveLogEntry } from '../lib/supabase.js';
import { alertIfCritical } from '../lib/reporter.js';

const STEVE_URL = process.env.STEVE_URL || 'https://www.steve.cl';
const API_URL = process.env.STEVE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const QA_EMAIL = process.env.STEVE_QA_EMAIL || 'patricio.correa@jardindeeva.cl';
const QA_PASSWORD = process.env.STEVE_QA_PASSWORD || '';

const runId = `qa-smoke-${Date.now()}`;
const results: DetectiveLogEntry[] = [];

function log(module: string, check: string, passed: boolean, severity: 'CRITICAL' | 'MAJOR' | 'MINOR', details: string) {
  results.push({
    run_id: runId,
    source: 'qa',
    module,
    check_type: check,
    status: passed ? 'PASS' : 'ERROR',
    severity: passed ? 'MINOR' : severity,
    details,
  });
  console.log(`${passed ? '✅' : '❌'} [${module}] ${check}: ${details}`);
}

async function check(name: string, url: string, options?: RequestInit): Promise<{ status: number; body: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    const body = await resp.text();
    return { status: resp.status, body: body.slice(0, 500) };
  } catch (e: any) {
    return { status: 0, body: e.message };
  }
}

async function main() {
  console.log(`\n🔥 QA Smoke Test — ${runId}\n`);

  // 1. Frontend loads
  const frontend = await check('frontend', STEVE_URL);
  log('qa-infra', 'frontend-loads', frontend.status === 200, 'CRITICAL',
    `HTTP ${frontend.status}`);

  // 2. Cloud Run health
  const health = await check('health', `${API_URL}/health`);
  log('qa-infra', 'cloudrun-health', health.status === 200, 'CRITICAL',
    `HTTP ${health.status} — ${health.body.slice(0, 100)}`);

  // 3. Supabase auth works
  const auth = await check('auth', `${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: QA_EMAIL, password: QA_PASSWORD }),
  });
  const authOk = auth.status === 200;
  log('qa-infra', 'supabase-auth', authOk, 'CRITICAL',
    `HTTP ${auth.status}`);

  // 4. API endpoints respond (with auth token if available)
  if (authOk) {
    const token = JSON.parse(auth.body).access_token;

    // Steve chat endpoint
    const chat = await check('steve-chat', `${API_URL}/api/steve-chat`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test', client_id: '9432e754-ad5a-4115-904c-d048de1d0e1e' }),
    });
    log('qa-steve-chat', 'chat-endpoint-responds', chat.status < 500, 'CRITICAL',
      `HTTP ${chat.status} — ${chat.body.slice(0, 100)}`);

    // Shopify products endpoint
    const products = await check('shopify', `${API_URL}/api/fetch-shopify-products`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopId: '9432e754-ad5a-4115-904c-d048de1d0e1e' }),
    });
    log('qa-infra', 'shopify-products-endpoint', products.status < 500, 'MAJOR',
      `HTTP ${products.status}`);
  }

  // Save results
  const passed = results.filter(r => r.status === 'PASS').length;
  const critical = results.filter(r => r.severity === 'CRITICAL' && r.status !== 'PASS').length;
  const score = Math.round((passed / results.length) * 100);

  console.log(`\n📊 Smoke: ${passed}/${results.length} passed (${score}%), ${critical} critical\n`);

  for (const r of results) await logResult(r);
  await saveRun({
    run_id: runId, source: 'qa',
    total_checks: results.length, passed, mismatches: results.length - passed,
    critical, score, by_module: {},
  });

  await alertIfCritical(results.filter(r => r.status !== 'PASS'));

  if (critical > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
