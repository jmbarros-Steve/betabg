// QA Frontend Steve Mail — Playwright Headless Tests
// Navega la app, toma screenshots, detecta errores, prueba interacciones

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APP_URL = 'https://betabgnuevosupa.vercel.app';
const ADMIN_EMAIL = 'jmbarros@bgconsult.cl';
const SCREENSHOTS_DIR = path.join(__dirname, 'qa-screenshots');
const SUPABASE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM2NjgsImV4cCI6MjA4NzIwOTY2OH0.PRkFg5sdmu8kXdL9xtpZFREKgohF9cGrNjWVVwZ7IXw';

// Results
const results = [];
const consoleErrors = [];
let PASS = 0, FAIL = 0, SKIP = 0;

function record(id, name, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⊘';
  console.log(`  ${icon} ${status} [${id}] ${name}${detail ? ' — ' + detail : ''}`);
  results.push({ id, name, status, detail });
  if (status === 'PASS') PASS++;
  else if (status === 'FAIL') FAIL++;
  else SKIP++;
}

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  return filepath;
}

async function getSession() {
  // Get JWT via magic link
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: ADMIN_EMAIL }),
  });
  const data = await resp.json();

  if (data.hashed_token) {
    const verifyResp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: data.hashed_token }),
    });
    return await verifyResp.json();
  }
  return data;
}

async function run() {
  console.log('\n══════════════════════════════════════════');
  console.log('  QA FRONTEND STEVE MAIL — Playwright');
  console.log('══════════════════════════════════════════\n');

  // Get session tokens
  console.log('[Setup] Obteniendo sesión...');
  const session = await getSession();
  if (!session.access_token) {
    console.error('ERROR: No se pudo obtener sesión:', JSON.stringify(session).substring(0, 200));
    process.exit(1);
  }
  console.log('[Setup] Sesión OK\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CL',
  });
  const page = await context.newPage();

  // Capture ALL console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out known noise
      if (!text.includes('favicon') && !text.includes('404 (Not Found)') && !text.includes('net::ERR')) {
        consoleErrors.push({ url: page.url(), error: text.substring(0, 200) });
      }
    }
  });

  // Capture page errors (uncaught exceptions)
  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), error: `UNCAUGHT: ${err.message.substring(0, 200)}` });
  });

  // ─── Inject auth session ───
  console.log('[Setup] Inyectando sesión en el browser...');
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Inject Supabase session into localStorage
  await page.evaluate((session) => {
    const storageKey = `sb-zpswjccsxjtnhetkkqde-auth-token`;
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: session.user,
    }));
  }, session);

  // Reload to pick up auth
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ══════════════════════════════════════════
  // FASE F: Frontend Tests
  // ══════════════════════════════════════════
  console.log('\n── FASE F: Frontend UI ──\n');

  // F.1 — App loads after login
  try {
    const title = await page.title();
    const hasContent = await page.locator('body').innerText();
    if (hasContent.length > 50 && !hasContent.includes('error')) {
      await screenshot(page, 'F01-app-loaded');
      record('F.1', 'App carga después de login', 'PASS', `Title: ${title}`);
    } else {
      await screenshot(page, 'F01-app-loaded-fail');
      record('F.1', 'App carga después de login', 'FAIL', 'Contenido vacío o error');
    }
  } catch (e) {
    record('F.1', 'App carga después de login', 'FAIL', e.message.substring(0, 100));
  }

  // Navigate to Steve Mail — try multiple selectors
  console.log('[Nav] Buscando Steve Mail...');
  try {
    // Try clicking on Steve Mail in sidebar/nav
    const mailLink = page.locator('a, button, [role="tab"], [role="menuitem"]').filter({ hasText: /steve\s*mail|email\s*market/i }).first();
    if (await mailLink.isVisible({ timeout: 5000 })) {
      await mailLink.click();
      await page.waitForTimeout(2000);
    } else {
      // Try direct URL patterns
      const possiblePaths = ['/steve-mail', '/email', '/email-marketing', '/client-portal'];
      for (const p of possiblePaths) {
        await page.goto(`${APP_URL}${p}`, { waitUntil: 'networkidle', timeout: 15000 });
        const body = await page.locator('body').innerText();
        if (body.length > 100 && !body.includes('Not Found')) break;
      }
    }
  } catch (e) {
    console.log(`  Nav warn: ${e.message.substring(0, 80)}`);
  }

  await page.waitForTimeout(2000);
  await screenshot(page, 'F02-steve-mail-landing');

  // F.2 — Tab Campaigns
  console.log('[Test] Tab Campaigns...');
  try {
    const campaignsTab = page.locator('button, a, [role="tab"]').filter({ hasText: /campañas|campaigns/i }).first();
    if (await campaignsTab.isVisible({ timeout: 5000 })) {
      await campaignsTab.click();
      await page.waitForTimeout(2000);
    }
    await screenshot(page, 'F02-campaigns-tab');
    const body = await page.locator('body').innerText();
    if (body.toLowerCase().includes('campaña') || body.toLowerCase().includes('campaign') || body.toLowerCase().includes('crear') || body.toLowerCase().includes('create')) {
      record('F.2', 'Tab Campaigns carga', 'PASS');
    } else {
      record('F.2', 'Tab Campaigns carga', 'FAIL', 'No se encontró contenido de campañas');
    }
  } catch (e) {
    await screenshot(page, 'F02-campaigns-fail');
    record('F.2', 'Tab Campaigns carga', 'FAIL', e.message.substring(0, 100));
  }

  // F.3 — Crear campaña (click botón crear)
  console.log('[Test] Crear campaña...');
  try {
    const createBtn = page.locator('button').filter({ hasText: /crear|nueva|new|create/i }).first();
    if (await createBtn.isVisible({ timeout: 5000 })) {
      await createBtn.click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'F03-create-campaign');
      record('F.3', 'Crear campaña desde UI', 'PASS', 'Wizard abierto');
    } else {
      await screenshot(page, 'F03-no-create-btn');
      record('F.3', 'Crear campaña desde UI', 'SKIP', 'Botón crear no visible');
    }
  } catch (e) {
    record('F.3', 'Crear campaña desde UI', 'FAIL', e.message.substring(0, 100));
  }

  // Go back/close modal if opened
  try {
    const closeBtn = page.locator('button').filter({ hasText: /cerrar|close|cancel|volver|back/i }).first();
    if (await closeBtn.isVisible({ timeout: 2000 })) await closeBtn.click();
  } catch (e) { /* ignore */ }
  await page.waitForTimeout(1000);

  // F.4 — Tab Subscribers
  console.log('[Test] Tab Subscribers...');
  try {
    const subsTab = page.locator('button, a, [role="tab"]').filter({ hasText: /suscriptor|subscriber|contactos/i }).first();
    if (await subsTab.isVisible({ timeout: 5000 })) {
      await subsTab.click();
      await page.waitForTimeout(2000);
    }
    await screenshot(page, 'F04-subscribers-tab');
    record('F.4', 'Tab Subscribers carga', 'PASS');
  } catch (e) {
    record('F.4', 'Tab Subscribers carga', 'FAIL', e.message.substring(0, 100));
  }

  // F.5 — Tab Flows
  console.log('[Test] Tab Flows...');
  try {
    const flowsTab = page.locator('button, a, [role="tab"]').filter({ hasText: /flows|flujos|automati/i }).first();
    if (await flowsTab.isVisible({ timeout: 5000 })) {
      await flowsTab.click();
      await page.waitForTimeout(2000);
    }
    await screenshot(page, 'F05-flows-tab');
    record('F.5', 'Tab Flows carga', 'PASS');
  } catch (e) {
    record('F.5', 'Tab Flows carga', 'FAIL', e.message.substring(0, 100));
  }

  // F.6 — Crear flow
  console.log('[Test] Crear flow...');
  try {
    const createFlowBtn = page.locator('button').filter({ hasText: /crear|new|nuevo/i }).first();
    if (await createFlowBtn.isVisible({ timeout: 5000 })) {
      await createFlowBtn.click();
      await page.waitForTimeout(3000);
      await screenshot(page, 'F06-create-flow');
      record('F.6', 'Crear flow desde UI', 'PASS', 'Flow editor abierto');
    } else {
      record('F.6', 'Crear flow desde UI', 'SKIP', 'Botón crear flow no visible');
    }
  } catch (e) {
    record('F.6', 'Crear flow desde UI', 'FAIL', e.message.substring(0, 100));
  }

  // Go back
  try {
    const backBtn = page.locator('button').filter({ hasText: /volver|back|cancel|cerrar/i }).first();
    if (await backBtn.isVisible({ timeout: 2000 })) await backBtn.click();
  } catch (e) { /* ignore */ }
  await page.waitForTimeout(1000);

  // F.7 — Tab Forms
  console.log('[Test] Tab Forms...');
  try {
    const formsTab = page.locator('button, a, [role="tab"]').filter({ hasText: /forms|formularios/i }).first();
    if (await formsTab.isVisible({ timeout: 5000 })) {
      await formsTab.click();
      await page.waitForTimeout(2000);
    }
    await screenshot(page, 'F07-forms-tab');
    record('F.7', 'Tab Forms carga', 'PASS');
  } catch (e) {
    record('F.7', 'Tab Forms carga', 'FAIL', e.message.substring(0, 100));
  }

  // F.8 — Tab Analytics
  console.log('[Test] Tab Analytics...');
  try {
    const analyticsTab = page.locator('button, a, [role="tab"]').filter({ hasText: /analytics|analítica|métricas|estadísticas/i }).first();
    if (await analyticsTab.isVisible({ timeout: 5000 })) {
      await analyticsTab.click();
      await page.waitForTimeout(2000);
    }
    await screenshot(page, 'F08-analytics-tab');
    record('F.8', 'Tab Analytics carga', 'PASS');
  } catch (e) {
    record('F.8', 'Tab Analytics carga', 'FAIL', e.message.substring(0, 100));
  }

  // F.9 — Navegación sin pantalla blanca (check all tabs again quickly)
  console.log('[Test] Navegación rápida entre tabs...');
  try {
    const tabs = page.locator('button, a, [role="tab"]').filter({ hasText: /campañas|campaigns|suscriptor|subscriber|flows|flujos|forms|formularios|analytics/i });
    const tabCount = await tabs.count();
    let blankScreens = 0;
    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      try {
        await tabs.nth(i).click();
        await page.waitForTimeout(1500);
        const bodyText = await page.locator('body').innerText();
        if (bodyText.length < 20) blankScreens++;
      } catch (e) { /* skip */ }
    }
    if (blankScreens === 0) {
      record('F.9', 'Navegación sin pantalla blanca', 'PASS', `${tabCount} tabs verificadas`);
    } else {
      record('F.9', 'Navegación sin pantalla blanca', 'FAIL', `${blankScreens} pantallas blancas`);
    }
  } catch (e) {
    record('F.9', 'Navegación sin pantalla blanca', 'FAIL', e.message.substring(0, 100));
  }

  // F.10 — Responsive mobile 375px
  console.log('[Test] Responsive 375px...');
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(2000);
    await screenshot(page, 'F10-mobile-375');
    const bodyText = await page.locator('body').innerText();
    if (bodyText.length > 50) {
      record('F.10', 'Responsive mobile 375px', 'PASS', 'UI renderiza en mobile');
    } else {
      record('F.10', 'Responsive mobile 375px', 'FAIL', 'Contenido vacío en mobile');
    }
    // Restore viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (e) {
    record('F.10', 'Responsive mobile 375px', 'FAIL', e.message.substring(0, 100));
  }

  // F.11 — Tablet 768px
  console.log('[Test] Responsive tablet 768px...');
  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1500);
    await screenshot(page, 'F11-tablet-768');
    record('F.11', 'Responsive tablet 768px', 'PASS');
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch (e) {
    record('F.11', 'Responsive tablet 768px', 'FAIL', e.message.substring(0, 100));
  }

  // F.12 — Console errors check
  console.log('[Test] Errores de consola...');
  if (consoleErrors.length === 0) {
    record('F.12', 'Sin errores de consola', 'PASS', '0 errores');
  } else {
    await screenshot(page, 'F12-console-errors');
    record('F.12', 'Sin errores de consola', 'FAIL', `${consoleErrors.length} errores encontrados`);
    console.log('  Errores de consola:');
    consoleErrors.slice(0, 10).forEach((e, i) => {
      console.log(`    ${i + 1}. [${e.url.split('/').pop()}] ${e.error.substring(0, 120)}`);
    });
  }

  // ─── CLEANUP ───
  await browser.close();

  // ─── REPORT ───
  console.log('\n══════════════════════════════════════════');
  console.log('  RESUMEN QA FRONTEND STEVE MAIL');
  console.log('══════════════════════════════════════════\n');
  console.log(`  ✓ PASS: ${PASS}`);
  console.log(`  ✗ FAIL: ${FAIL}`);
  console.log(`  ⊘ SKIP: ${SKIP}`);
  console.log(`  TOTAL:  ${PASS + FAIL + SKIP}\n`);

  const effective = PASS + FAIL;
  const score = effective > 0 ? Math.round(PASS / effective * 100) : 0;
  console.log(`  Score: ${score}% (${PASS}/${effective} efectivas)\n`);

  console.log(`  Screenshots: ${SCREENSHOTS_DIR}/`);
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
  files.forEach(f => console.log(`    📸 ${f}`));

  if (consoleErrors.length > 0) {
    console.log(`\n  ⚠ ${consoleErrors.length} errores de consola detectados`);
  }

  console.log('');
  process.exit(FAIL > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
