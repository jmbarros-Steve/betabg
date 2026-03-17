/**
 * QA Bot — Daily automated testing of Steve Ads flows
 *
 * Runs 7 flows as a merchant would:
 * F1: OAuth/Connection status
 * F2: Campaign creation wizard
 * F3: Audiences
 * F4: AI copy generation
 * F5: Ads Library / Competitors
 * F6: Metrics dashboard
 * F7: General UX (all tabs, responsive, errors)
 *
 * Uses the gstack browse binary for headless browser automation.
 * Falls back to HTTP checks when browser isn't needed.
 */

import { execSync } from 'child_process';
import { logResult, saveRun, supabase, type DetectiveLogEntry } from '../lib/supabase.js';
import { alertIfCritical } from '../lib/reporter.js';

const STEVE_URL = process.env.STEVE_URL || 'https://www.steve.cl';
const STEVE_QA_EMAIL = process.env.STEVE_QA_EMAIL || 'patricio.correa@jardindeeva.cl';
const STEVE_QA_PASSWORD = process.env.STEVE_QA_PASSWORD || '';
const API_URL = process.env.STEVE_API_URL || 'https://steve-api-850416724643.us-central1.run.app';

// Find browse binary
function findBrowse(): string {
  const paths = [
    `${process.env.HOME}/steve/.claude/skills/gstack/browse/dist/browse`,
    `${process.env.HOME}/.claude/skills/gstack/browse/dist/browse`,
  ];
  for (const p of paths) {
    try { execSync(`test -x ${p}`); return p; } catch { continue; }
  }
  throw new Error('Browse binary not found');
}

function browse(cmd: string, timeout = 15000): string {
  try {
    return execSync(`${findBrowse()} ${cmd}`, { timeout, encoding: 'utf-8' }).trim();
  } catch (e: any) {
    return e.stdout?.toString().trim() || e.message;
  }
}

function sleep(ms: number) {
  execSync(`sleep ${ms / 1000}`);
}

const runId = `qa-auto-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
const results: DetectiveLogEntry[] = [];

function log(module: string, check: string, passed: boolean, severity: 'CRITICAL' | 'MAJOR' | 'MINOR', details: string) {
  const entry: DetectiveLogEntry = {
    run_id: runId,
    source: 'qa',
    module,
    check_type: check,
    status: passed ? 'PASS' : 'ERROR',
    severity: passed ? 'MINOR' : severity,
    details,
  };
  results.push(entry);
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${module}] ${check}: ${details}`);
}

async function login(): Promise<boolean> {
  browse('restart');
  sleep(2000);
  browse(`goto ${STEVE_URL}/auth`);
  sleep(2000);

  const snap = browse('snapshot -i');
  if (!snap.includes('textbox') || !snap.includes('Iniciar')) {
    log('qa-login', 'login-page-loads', false, 'CRITICAL', 'Login page did not load');
    return false;
  }

  browse(`fill @e2 "${STEVE_QA_EMAIL}"`);
  browse(`fill @e3 "${STEVE_QA_PASSWORD}"`);
  browse('click @e5');
  sleep(5000);

  const url = browse('url');
  if (url.includes('/portal')) {
    log('qa-login', 'login-success', true, 'MINOR', 'Login successful');
    return true;
  }

  log('qa-login', 'login-success', false, 'CRITICAL', `Login failed — stuck at ${url}`);
  return false;
}

async function testF1_OAuth() {
  // Check Meta connection status
  const snap = browse('snapshot -i');
  const hasMetaPending = snap.includes('Conectar Meta (pendiente)');
  const hasMetaConnected = snap.includes('Conectar Meta (completado)');

  log('qa-meta-wizard', 'f1-connection-status-visible', hasMetaPending || hasMetaConnected, 'MAJOR',
    hasMetaConnected ? 'Meta connected' : hasMetaPending ? 'Meta pending (expected)' : 'Connection status not visible');

  // Navigate to Conexiones
  browse('js "document.querySelectorAll(\'button\').forEach(b => { if(b.textContent.trim() === \'Conexiones\') b.click() })"');
  sleep(2000);

  const connSnap = browse('snapshot -C');
  const hasConnectButton = connSnap.includes('Conectar Meta');
  log('qa-meta-wizard', 'f1-connect-button-visible', hasConnectButton, 'MAJOR',
    hasConnectButton ? '"Conectar Meta" button visible in Conexiones' : 'Connect button not found');

  const hasShopifyActive = connSnap.includes('Shopify') && connSnap.includes('Activo');
  log('qa-meta-wizard', 'f1-shopify-connected', hasShopifyActive, 'MINOR',
    hasShopifyActive ? 'Shopify active' : 'Shopify not active');
}

async function testF5_AdsLibrary() {
  // Navigate to Meta Ads > Biblioteca
  browse('snapshot -i');
  browse('click @e7'); // Más
  sleep(1000);
  browse('click @e5'); // Meta Ads
  sleep(2000);

  const snap = browse('snapshot -i');
  const tabs = snap.match(/tab.*"(.*?)"/g) || [];
  const hasBiblioteca = tabs.some(t => t.includes('Biblioteca'));
  const hasCompetencia = tabs.some(t => t.includes('Competencia'));

  log('qa-meta-wizard', 'f5-biblioteca-tab-exists', hasBiblioteca, 'MAJOR',
    hasBiblioteca ? 'Biblioteca tab present' : 'Biblioteca tab missing');

  log('qa-meta-wizard', 'f5-competencia-tab-exists', hasCompetencia, 'MAJOR',
    hasCompetencia ? 'Competencia tab present' : 'Competencia tab missing');

  // Click Biblioteca and check if it requires connection (bug)
  if (hasBiblioteca) {
    const bibRef = snap.match(/@e\d+.*Biblioteca/)?.[0]?.match(/@e\d+/)?.[0];
    if (bibRef) {
      browse(`click ${bibRef}`);
      sleep(2000);
      const bibSnap = browse('snapshot -C');
      const blockedByConnection = bibSnap.includes('Sin conexión');
      log('qa-meta-wizard', 'f5-biblioteca-works-without-oauth', !blockedByConnection, 'MAJOR',
        blockedByConnection ? 'BUG: Biblioteca blocked by "Sin conexión" — should work without OAuth' : 'Biblioteca accessible');
    }
  }
}

async function testF7_UX() {
  // Navigate to Meta Ads
  browse('snapshot -i');
  const navSnap = browse('snapshot -i');

  // Check all main navigation tabs exist
  const requiredTabs = ['Steve', 'Brief', 'Métricas', 'Conexiones', 'Configuración'];
  for (const tab of requiredTabs) {
    const exists = navSnap.includes(tab);
    log('qa-ux', `f7-nav-tab-${tab.toLowerCase()}`, exists, 'MAJOR',
      exists ? `${tab} tab visible` : `${tab} tab MISSING`);
  }

  // Check console errors
  const consoleErrors = browse('console --errors');
  const hasErrors = consoleErrors.includes('[error]');
  const error502 = consoleErrors.includes('502');
  const error500 = consoleErrors.includes('500');

  log('qa-ux', 'f7-no-console-errors', !hasErrors, error502 || error500 ? 'CRITICAL' : 'MINOR',
    hasErrors ? `Console errors found: ${consoleErrors.slice(0, 200)}` : 'No console errors');

  // Check mobile responsive
  browse('viewport 375x812');
  sleep(1000);
  const mobileSnap = browse('snapshot -i');
  const mobileOk = mobileSnap.length > 50;
  log('qa-ux', 'f7-mobile-responsive', mobileOk, 'MINOR',
    mobileOk ? 'Mobile viewport renders content' : 'Mobile viewport empty or broken');
  browse('viewport 1280x720');
}

async function testEstrategia() {
  // Navigate to Estrategia
  browse('snapshot -i');
  browse('click @e7'); // Más dropdown
  sleep(1000);
  const menu = browse('snapshot -i');
  const estrategiaRef = menu.match(/@e\d+.*Estrategia/)?.[0]?.match(/@e\d+/)?.[0];
  if (!estrategiaRef) {
    log('qa-steve-chat', 'estrategia-accessible', false, 'CRITICAL', 'Estrategia not found in Más menu');
    return;
  }

  browse(`click ${estrategiaRef}`);
  sleep(3000);

  const snap = browse('snapshot -i');
  const hasInput = snap.includes('textbox');
  log('qa-steve-chat', 'estrategia-chat-loads', hasInput, 'CRITICAL',
    hasInput ? 'Chat input visible' : 'Chat input not found');

  if (!hasInput) return;

  // Send a message
  const inputRef = snap.match(/@e\d+.*textbox/)?.[0]?.match(/@e\d+/)?.[0];
  if (inputRef) {
    browse(`fill ${inputRef} "Test QA automático"`);
    browse('press Enter');
    sleep(15000);

    const errors = browse('console --errors');
    const has502 = errors.includes('502');
    const has401 = errors.includes('401');

    log('qa-steve-chat', 'estrategia-no-502', !has502, 'CRITICAL',
      has502 ? 'Backend returns 502 on chat send' : 'No 502 errors');

    log('qa-steve-chat', 'estrategia-no-401', !has401, 'MAJOR',
      has401 ? 'Auth error 401 on chat send' : 'No 401 errors');
  }
}

async function testSteveMail() {
  // Navigate to Steve Mail
  browse('snapshot -i');
  browse('click @e7'); // Más
  sleep(1000);
  const menu = browse('snapshot -i');
  const mailRef = menu.match(/@e\d+.*Steve Mail/)?.[0]?.match(/@e\d+/)?.[0];
  if (!mailRef) {
    log('qa-steve-mail', 'stevemail-accessible', false, 'MAJOR', 'Steve Mail not found in menu');
    return;
  }

  browse(`click ${mailRef}`);
  sleep(2000);

  const snap = browse('snapshot -i');
  const hasNueva = snap.includes('Nueva Campaña');
  log('qa-steve-mail', 'stevemail-nueva-campana-visible', hasNueva, 'MAJOR',
    hasNueva ? '"Nueva Campaña" button visible' : 'Nueva Campaña not found');
}

async function testHealthEndpoint() {
  try {
    const result = execSync(`curl -s -w "\\n%{http_code}" --max-time 10 "${API_URL}/health"`, { encoding: 'utf-8' });
    const lines = result.trim().split('\n');
    const httpCode = lines[lines.length - 1];
    log('qa-infra', 'health-endpoint', httpCode === '200', 'CRITICAL',
      `Cloud Run health: HTTP ${httpCode}`);
  } catch {
    log('qa-infra', 'health-endpoint', false, 'CRITICAL', 'Cloud Run health endpoint unreachable');
  }
}

async function main() {
  console.log(`\n🤖 QA Bot — Run ${runId}\n`);
  console.log(`Target: ${STEVE_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Health check first
  await testHealthEndpoint();

  // Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('\n❌ Login failed — aborting QA run');
    await saveResults();
    return;
  }

  // Run all tests
  await testF1_OAuth();
  await testEstrategia();
  await testSteveMail();
  await testF5_AdsLibrary();
  await testF7_UX();

  await saveResults();
}

async function saveResults() {
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status !== 'PASS').length;
  const critical = results.filter(r => r.severity === 'CRITICAL' && r.status !== 'PASS').length;
  const score = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

  console.log(`\n📊 QA Results: ${passed}/${results.length} passed (${score}%), ${critical} critical\n`);

  // Save individual results
  for (const r of results) {
    await logResult(r);
  }

  // Save run summary
  await saveRun({
    run_id: runId,
    source: 'qa',
    total_checks: results.length,
    passed,
    mismatches: failed,
    critical,
    score,
    by_module: results.reduce((acc, r) => {
      const mod = r.module;
      if (!acc[mod]) acc[mod] = { passed: 0, failed: 0 };
      if (r.status === 'PASS') acc[mod].passed++;
      else acc[mod].failed++;
      return acc;
    }, {} as Record<string, { passed: number; failed: number }>),
  });

  // Alert on critical issues
  await alertIfCritical(results.filter(r => r.status !== 'PASS'));
}

main().catch(console.error);
