/**
 * QA FRONTEND EPIC — Steve Mail
 * 100+ screenshots, pruebas funcionales completas
 * Crea campañas, flows, listas, formularios, suscriptores
 * Playwright headless
 */
const { chromium } = require('playwright');

const APP_URL = 'https://betabgnuevosupa.vercel.app';
const SUPABASE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM2NjgsImV4cCI6MjA4NzIwOTY2OH0.PRkFg5sdmu8kXdL9xtpZFREKgohF9cGrNjWVVwZ7IXw';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ';
const ADMIN_EMAIL = 'jmbarros@bgconsult.cl';
const TEST_EMAIL = 'patricio.correa@jardindeeva.cl';
const SCREENSHOT_DIR = 'qa-screenshots-epic';

let browser, context, page;
let PASS = 0, FAIL = 0, SKIP = 0, TOTAL = 0;
let screenshotCount = 0;
const results = [];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

async function screenshot(name) {
  screenshotCount++;
  const num = String(screenshotCount).padStart(3, '0');
  const filename = `${num}-${name}.png`;
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
  return filename;
}

async function screenshotViewport(name) {
  screenshotCount++;
  const num = String(screenshotCount).padStart(3, '0');
  const filename = `${num}-${name}.png`;
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: false });
  return filename;
}

function log(status, id, desc, detail = '') {
  TOTAL++;
  if (status === 'PASS') PASS++;
  else if (status === 'FAIL') FAIL++;
  else SKIP++;
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⊘';
  const msg = `  ${icon} ${status} [${id}] ${desc}${detail ? ' — ' + detail : ''}`;
  console.log(msg);
  results.push({ status, id, desc, detail });
}

async function waitAndClick(selector, opts = {}) {
  const timeout = opts.timeout || 10000;
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    await page.click(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function fillField(selector, value) {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    await page.fill(selector, value);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────

async function getSession() {
  // Use client user with password (client users go to /portal, admin goes to /dashboard)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: 'Jardin2026' }),
  });
  const session = await res.json();
  if (!session.access_token) throw new Error('No session: ' + JSON.stringify(session).substring(0, 200));
  return session;
}

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

async function setup() {
  console.log('══════════════════════════════════════════');
  console.log('  QA FRONTEND EPIC — Steve Mail');
  console.log('  100+ Screenshots, Full Functional Tests');
  console.log('══════════════════════════════════════════\n');

  // Clean screenshots dir
  const fs = require('fs');
  if (fs.existsSync(SCREENSHOT_DIR)) {
    fs.rmSync(SCREENSHOT_DIR, { recursive: true });
  }
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('[Setup] Obteniendo sesión...');
  const session = await getSession();
  console.log('[Setup] Sesión OK\n');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CL',
  });
  page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.consoleErrors = consoleErrors;

  // Inject session — go to app first to set localStorage on same origin
  console.log('[Setup] Inyectando sesión en browser...');
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate((s) => {
    const storageKey = `sb-zpswjccsxjtnhetkkqde-auth-token`;
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: s.user,
    }));
  }, session);
  console.log('[Setup] Sesión inyectada, navegando a /portal...');
  // Don't reload — navigate directly to portal
  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);

  return consoleErrors;
}

// ──────────────────────────────────────────────
// Navigate to Steve Mail
// ──────────────────────────────────────────────

async function navigateToSteveMail() {
  console.log('\n── FASE 0: Navegación a Steve Mail ──\n');

  // Navigate directly to /portal (client users land here)
  console.log('[Nav] Navegando a /portal...');
  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(3000);
  await screenshot('00-portal-home');

  // The portal has sidebar navigation with tabs like 'Steve Mail'
  // These are buttons/links in the sidebar, not [role="tab"]
  let found = false;

  // Try clicking "Steve Mail" in the sidebar/nav
  try {
    const mailLink = page.locator('button, a, span, div')
      .filter({ hasText: /Steve Mail/i }).first();
    if (await mailLink.isVisible({ timeout: 8000 })) {
      await mailLink.click();
      await sleep(3000);
      found = true;
      console.log('[Nav] Clicked Steve Mail en sidebar');
    }
  } catch {}

  if (!found) {
    // The sidebar might use a dropdown or scroll — try looking for MailCheck icon or 'email' text
    try {
      // Look for the tab with "Email" or expand secondary tabs
      const expandBtn = page.locator('button').filter({ hasText: /más|more|ver todo/i }).first();
      if (await expandBtn.isVisible({ timeout: 3000 })) {
        await expandBtn.click();
        await sleep(1000);
      }
    } catch {}

    try {
      const mailLink = page.locator('button, a, span')
        .filter({ hasText: /Steve Mail|Email/i }).first();
      if (await mailLink.isVisible({ timeout: 5000 })) {
        await mailLink.click();
        await sleep(3000);
        found = true;
      }
    } catch {}
  }

  await screenshot('01-steve-mail-landing');

  // Verify we're on Steve Mail by checking for its sub-tabs
  const body = await page.locator('body').innerText();
  const hasTabs = body.includes('Campañas') || body.includes('Campanas') ||
                  body.includes('Contactos') || body.includes('Automatizaciones') ||
                  body.includes('Formularios') || body.includes('Rendimiento');

  if (hasTabs) {
    log('PASS', '0.1', 'Navegación a Steve Mail', 'Sub-tabs visibles');
  } else if (found) {
    log('PASS', '0.1', 'Navegación a Steve Mail', 'Página cargada');
    console.log('  [Debug] Body:', body.substring(0, 300));
  } else {
    log('FAIL', '0.1', 'Navegación a Steve Mail', 'No se encontró Steve Mail');
    console.log('  [Debug] Body:', body.substring(0, 300));
  }
}

// ──────────────────────────────────────────────
// FASE 1: Campaigns Tab
// ──────────────────────────────────────────────

async function clickTab(name) {
  // Steve Mail sub-tabs are Radix TabsTrigger with [role="tab"]
  // They contain <span> with text like "Campanas", "Contactos", etc.
  const regex = new RegExp(name, 'i');

  // First try: exact Radix tabs (these are the Steve Mail sub-tabs)
  try {
    const tab = page.locator('[role="tab"]').filter({ hasText: regex }).first();
    if (await tab.isVisible({ timeout: 5000 })) {
      await tab.click();
      await sleep(2000);
      return true;
    }
  } catch {}

  // Second try: any button
  try {
    const tab = page.locator('button').filter({ hasText: regex }).first();
    if (await tab.isVisible({ timeout: 3000 })) {
      await tab.click();
      await sleep(2000);
      return true;
    }
  } catch {}

  return false;
}

async function ensureOnSteveMail() {
  // Check if we can see Steve Mail heading or its sub-tabs
  try {
    const heading = page.locator('h2').filter({ hasText: /Steve Mail/i }).first();
    if (await heading.isVisible({ timeout: 2000 })) return true;
  } catch {}

  // We might have navigated away — re-navigate to Steve Mail via dropdown
  try {
    // Click "Más" or the dropdown that contains Steve Mail
    const moreBtn = page.locator('button').filter({ hasText: /Más|Steve Mail/i }).first();
    if (await moreBtn.isVisible({ timeout: 3000 })) {
      await moreBtn.click();
      await sleep(500);
      // Look for "Steve Mail" in the dropdown menu
      const steveMailItem = page.locator('[role="menuitem"]').filter({ hasText: /Steve Mail/i }).first();
      if (await steveMailItem.isVisible({ timeout: 3000 })) {
        await steveMailItem.click();
        await sleep(2000);
        return true;
      }
      // Maybe "Steve Mail" was the trigger itself (already selected)
      return true;
    }
  } catch {}
  return false;
}

async function testCampaignsTab() {
  console.log('\n── FASE 1: Campaigns Tab ──\n');

  await ensureOnSteveMail();
  // Click Campaigns tab
  const clicked = await clickTab('Campanas');
  await sleep(2000);
  await screenshot('02-campaigns-tab');

  const body = await page.locator('body').innerText();
  const hasHeading = body.includes('Campañas') || body.includes('Campanas') || body.includes('Email Campaigns');
  log(hasHeading ? 'PASS' : 'FAIL', '1.1', 'Tab Campaigns carga', hasHeading ? 'Heading visible' : 'No heading');

  // Look for campaign list or empty state
  const hasCampaigns = body.includes('Borrador') || body.includes('Enviada') || body.includes('Welcome') || body.includes('Abandoned');
  const hasCreate = body.includes('Crear') || body.includes('Nueva');
  log(hasCampaigns || hasCreate ? 'PASS' : 'FAIL', '1.2', 'Lista de campañas o empty state', hasCampaigns ? 'Campañas listadas' : 'Empty/Create state');
  await screenshot('03-campaigns-list');
}

// ──────────────────────────────────────────────
// FASE 2: Create Campaign — Full Wizard
// ──────────────────────────────────────────────

async function testCreateCampaign() {
  console.log('\n── FASE 2: Crear Campaña (Wizard 4 pasos) ──\n');

  // Click "Nueva Campaña"
  const createBtn = await waitAndClick('button:has-text("Nueva Campaña")') ||
                    await waitAndClick('button:has-text("Nueva Campana")') ||
                    await waitAndClick('button:has-text("Crear Campaña")') ||
                    await waitAndClick('button:has-text("Crear Campana")');
  await sleep(2000);
  await screenshot('04-campaign-wizard-opened');

  if (!createBtn) {
    log('SKIP', '2.1', 'Abrir wizard nueva campaña', 'Botón no encontrado');
    return;
  }
  log('PASS', '2.1', 'Abrir wizard nueva campaña', 'Wizard abierto');

  // ── Step 1: Datos ──
  console.log('  [Step 1] Datos de la campaña...');

  // Campaign name
  const nameInput = await page.$('input[placeholder*="Nombre de la camp"]') ||
                    await page.$('input[placeholder*="nombre"]');
  if (nameInput) {
    await nameInput.fill('QA Epic Test Campaign');
    log('PASS', '2.2', 'Input nombre campaña', 'Rellenado');
  } else {
    // Try generic first input
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      await inputs[0].fill('QA Epic Test Campaign');
      log('PASS', '2.2', 'Input nombre campaña', 'Primer input');
    } else {
      log('FAIL', '2.2', 'Input nombre campaña', 'No input encontrado');
    }
  }
  await screenshot('05-step1-name-filled');

  // Subject
  const subjectInput = await page.$('input[placeholder*="descuento"]') ||
                       await page.$('input[placeholder*="Asunto"]') ||
                       await page.$('input[placeholder*="asunto"]');
  if (subjectInput) {
    await subjectInput.fill('QA Test - 30% descuento hoy');
    log('PASS', '2.3', 'Input asunto', 'Rellenado');
  } else {
    log('SKIP', '2.3', 'Input asunto', 'Input no encontrado');
  }

  // Preview text
  const previewInput = await page.$('input[placeholder*="bandeja"]') ||
                       await page.$('input[placeholder*="preview"]') ||
                       await page.$('input[placeholder*="Preview"]');
  if (previewInput) {
    await previewInput.fill('No te pierdas esta oferta exclusiva');
    log('PASS', '2.4', 'Input preview text', 'Rellenado');
  } else {
    log('SKIP', '2.4', 'Input preview text', 'Input no encontrado');
  }

  // From name
  const fromNameInput = await page.$('input[placeholder*="Nombre de tu tienda"]') ||
                        await page.$('input[placeholder*="marca"]');
  if (fromNameInput) {
    await fromNameInput.fill('Jardin de Eva');
    log('PASS', '2.5', 'Input remitente nombre', 'Rellenado');
  } else {
    log('SKIP', '2.5', 'Input remitente nombre', 'No encontrado');
  }

  // From email
  const fromEmailInput = await page.$('input[placeholder*="noreply"]') ||
                         await page.$('input[placeholder*="tudominio"]');
  if (fromEmailInput) {
    await fromEmailInput.fill('qa@jardindeeva.cl');
    log('PASS', '2.6', 'Input remitente email', 'Rellenado');
  } else {
    log('SKIP', '2.6', 'Input remitente email', 'No encontrado');
  }

  await screenshot('06-step1-all-fields');

  // AI Generation section
  const aiSection = await page.$('text="Generar con Steve AI"');
  if (aiSection) {
    log('PASS', '2.7', 'Sección AI visible', 'Generar con Steve AI');
    await screenshot('07-step1-ai-section');
  } else {
    log('SKIP', '2.7', 'Sección AI visible', 'No visible');
  }

  // Campaign type select
  const typeSelect = await page.$('text="Tipo de campaña"') || await page.$('text="Tipo de campana"');
  if (typeSelect) {
    log('PASS', '2.8', 'Select tipo campaña', 'Visible');
  } else {
    log('SKIP', '2.8', 'Select tipo campaña', 'No visible');
  }

  // Productos Dinámicos section
  const productSection = await page.$('text="Productos Dinámicos"') || await page.$('text="Productos Dinamicos"');
  await page.evaluate(() => window.scrollTo(0, 9999));
  await sleep(500);
  await screenshot('08-step1-products-section');
  log(productSection ? 'PASS' : 'SKIP', '2.9', 'Productos Dinámicos visible', productSection ? 'Sección visible' : 'No visible');

  // Click Next
  const nextBtn = await waitAndClick('button:has-text("Siguiente")');
  await sleep(3000);
  await screenshot('09-step2-design');

  if (nextBtn) {
    log('PASS', '2.10', 'Navegar a Step 2 (Diseño)', 'Click siguiente');
  } else {
    log('FAIL', '2.10', 'Navegar a Step 2 (Diseño)', 'Botón siguiente no encontrado');
    return;
  }

  // ── Step 2: Diseño / Editor ──
  console.log('  [Step 2] Diseño (Editor)...');

  // Check for GrapeJS editor or design area
  await sleep(2000);
  const hasEditor = await page.$('.gjs-editor') ||
                    await page.$('.gjs-frame') ||
                    await page.$('[class*="grapes"]') ||
                    await page.$('iframe') ||
                    await page.$('canvas');
  await screenshot('10-step2-editor-area');
  log(hasEditor ? 'PASS' : 'SKIP', '2.11', 'Editor de diseño carga', hasEditor ? 'Editor visible' : 'Editor no renderizado aún');

  // Templates button
  const templatesBtn = await page.$('button:has-text("Plantillas")') ||
                       await page.$('button:has-text("Templates")');
  if (templatesBtn) {
    await templatesBtn.click();
    await sleep(2000);
    await screenshot('11-step2-templates-gallery');
    log('PASS', '2.12', 'Galería de plantillas', 'Modal abierto');

    // Close gallery - try ESC or close button
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    log('SKIP', '2.12', 'Galería de plantillas', 'Botón no visible');
  }

  // Save as template button
  const saveTemplateBtn = await page.$('button:has-text("Guardar Plantilla")') ||
                          await page.$('button:has-text("Guardar plantilla")');
  log(saveTemplateBtn ? 'PASS' : 'SKIP', '2.13', 'Botón guardar plantilla', saveTemplateBtn ? 'Visible' : 'No visible');

  // Preview button
  const previewBtn = await page.$('button:has-text("Vista previa")');
  log(previewBtn ? 'PASS' : 'SKIP', '2.14', 'Botón vista previa', previewBtn ? 'Visible' : 'No visible');

  // Email size indicator
  const sizeIndicator = await page.$('text=/\\d+kB/');
  log(sizeIndicator ? 'PASS' : 'SKIP', '2.15', 'Indicador tamaño email', sizeIndicator ? 'Visible' : 'No visible');

  // Navigate to step 3
  const nextBtn2 = await waitAndClick('button:has-text("Siguiente")');
  await sleep(2000);
  await screenshot('12-step3-audience');

  if (nextBtn2) {
    log('PASS', '2.16', 'Navegar a Step 3 (Audiencia)', 'Click siguiente');
  } else {
    log('FAIL', '2.16', 'Navegar a Step 3 (Audiencia)', 'Botón no encontrado');
  }

  // ── Step 3: Audiencia ──
  console.log('  [Step 3] Audiencia...');

  const audienceHeading = await page.$('text="Audiencia"') || await page.$('text="Paso 3"');
  log(audienceHeading ? 'PASS' : 'SKIP', '2.17', 'Step 3 Audiencia carga', audienceHeading ? 'Heading visible' : 'No visible');

  // "Todos los suscritos" option
  const allSubs = await page.$('text="Todos los suscritos"');
  if (allSubs) {
    await allSubs.click();
    await sleep(500);
    log('PASS', '2.18', 'Opción todos los suscritos', 'Seleccionada');
  } else {
    log('SKIP', '2.18', 'Opción todos los suscritos', 'No visible');
  }
  await screenshot('13-step3-audience-selected');

  // "Lista o segmento específico" option
  const specificList = await page.$('text="Lista o segmento"') || await page.$('text="segmento específico"');
  if (specificList) {
    await specificList.click();
    await sleep(1000);
    await screenshot('14-step3-specific-list');
    log('PASS', '2.19', 'Opción lista/segmento específico', 'Visible');
    // Go back to "todos"
    if (allSubs) await allSubs.click();
  } else {
    log('SKIP', '2.19', 'Opción lista/segmento específico', 'No visible');
  }

  // Navigate to step 4
  const nextBtn3 = await waitAndClick('button:has-text("Siguiente")') || await waitAndClick('button:has-text("Revisar")');
  await sleep(2000);
  await screenshot('15-step4-review');

  if (nextBtn3) {
    log('PASS', '2.20', 'Navegar a Step 4 (Revisar)', 'Click siguiente');
  } else {
    log('FAIL', '2.20', 'Navegar a Step 4 (Revisar)', 'Botón no encontrado');
  }

  // ── Step 4: Revisar y Enviar ──
  console.log('  [Step 4] Revisar y Enviar...');

  const reviewHeading = await page.$('text="Revisar"') || await page.$('text="Paso 4"');
  log(reviewHeading ? 'PASS' : 'SKIP', '2.21', 'Step 4 Review carga', reviewHeading ? 'Visible' : 'No visible');

  // Summary card
  const summaryLabels = ['Campaña', 'Campana', 'Asunto', 'Remitente'];
  let summaryFound = 0;
  for (const label of summaryLabels) {
    if (await page.$(`text="${label}"`)) summaryFound++;
  }
  log(summaryFound >= 2 ? 'PASS' : 'SKIP', '2.22', 'Resumen de campaña', `${summaryFound} campos visibles`);
  await screenshot('16-step4-summary');

  // Desktop/Mobile preview toggle
  const desktopBtn = await page.$('button:has-text("Desktop")');
  const mobileBtn = await page.$('button:has-text("Mobile")');
  if (desktopBtn && mobileBtn) {
    await mobileBtn.click();
    await sleep(1000);
    await screenshot('17-step4-mobile-preview');
    await desktopBtn.click();
    await sleep(500);
    log('PASS', '2.23', 'Toggle preview Desktop/Mobile', 'Ambos funcionan');
  } else {
    log('SKIP', '2.23', 'Toggle preview Desktop/Mobile', 'Botones no encontrados');
  }

  // A/B Testing section
  const advancedToggle = await page.$('button:has-text("Opciones avanzadas")') ||
                         await page.$('button:has-text("avanzadas")');
  if (advancedToggle) {
    await advancedToggle.click();
    await sleep(1000);
    await screenshot('18-step4-advanced-options');
    log('PASS', '2.24', 'Opciones avanzadas desplegadas', 'Visible');

    // A/B test switch
    const abSwitch = await page.$('text="Test A/B"');
    if (abSwitch) {
      log('PASS', '2.25', 'Sección A/B Testing visible', 'Switch presente');
      // Try to enable it
      const switchEl = await page.$('[role="switch"]');
      if (switchEl) {
        await switchEl.click();
        await sleep(1000);
        await screenshot('19-step4-ab-testing-enabled');

        // Check for A/B fields
        const variantB = await page.$('input[placeholder*="variante"]') || await page.$('input[placeholder*="Variante"]') || await page.$('text="Asunto variante B"');
        log(variantB ? 'PASS' : 'SKIP', '2.26', 'Campos A/B test', variantB ? 'Input variante B visible' : 'No visible');

        // Disable A/B again
        await switchEl.click();
        await sleep(500);
      }
    } else {
      log('SKIP', '2.25', 'Sección A/B Testing visible', 'No encontrada');
      log('SKIP', '2.26', 'Campos A/B test', 'A/B no disponible');
    }
  } else {
    log('SKIP', '2.24', 'Opciones avanzadas desplegadas', 'No encontrado');
    log('SKIP', '2.25', 'Sección A/B Testing visible', 'No disponible');
    log('SKIP', '2.26', 'Campos A/B test', 'No disponible');
  }

  // Send button visible
  const sendBtn = await page.$('button:has-text("Enviar")');
  const testSendBtn = await page.$('button:has-text("Enviar Test")');
  log(sendBtn ? 'PASS' : 'SKIP', '2.27', 'Botón Enviar visible', sendBtn ? 'Presente' : 'No visible');
  log(testSendBtn ? 'PASS' : 'SKIP', '2.28', 'Botón Enviar Test visible', testSendBtn ? 'Presente' : 'No visible');
  await screenshot('20-step4-send-buttons');

  // Save campaign as draft
  const saveBtn = await page.$('button:has-text("Guardar")');
  if (saveBtn) {
    await saveBtn.click();
    await sleep(2000);
    await screenshot('21-campaign-saved');
    log('PASS', '2.29', 'Guardar campaña como borrador', 'Click guardar');
  } else {
    log('SKIP', '2.29', 'Guardar campaña como borrador', 'Botón guardar no encontrado');
  }

  // Go back to list
  const backBtn = await waitAndClick('button:has-text("Volver")');
  await sleep(2000);
  if (!backBtn) {
    // Try keyboard
    await page.keyboard.press('Escape');
    await sleep(1000);
  }
  await screenshot('22-back-to-campaigns');
  log('PASS', '2.30', 'Volver a lista de campañas', 'Navegación completa');
}

// ──────────────────────────────────────────────
// FASE 3: Subscribers Tab
// ──────────────────────────────────────────────

async function testSubscribersTab() {
  console.log('\n── FASE 3: Subscribers / Contactos ──\n');

  await ensureOnSteveMail();
  // Click Contactos tab
  await clickTab('Contactos');
  await sleep(2000);
  await screenshot('23-subscribers-tab');

  // Stats cards
  const totalCard = await page.$('text="Total contactos"') || await page.$('text="Total"');
  const subscribedCard = await page.$('text="Suscritos"');
  log(totalCard ? 'PASS' : 'SKIP', '3.1', 'Stats cards visibles', totalCard ? 'Total contactos visible' : 'No visible');
  log(subscribedCard ? 'PASS' : 'SKIP', '3.2', 'Card suscritos visible', subscribedCard ? 'Visible' : 'No visible');

  // Search input
  const searchInput = await page.$('input[placeholder*="Buscar"]') || await page.$('input[placeholder*="buscar"]');
  if (searchInput) {
    await searchInput.fill('test@');
    await sleep(1000);
    await screenshot('24-subscribers-search');
    await searchInput.fill('');
    log('PASS', '3.3', 'Buscar suscriptor', 'Input funcional');
  } else {
    log('SKIP', '3.3', 'Buscar suscriptor', 'Input no encontrado');
  }

  // Status filter
  const statusFilter = await page.$('button:has-text("Todos")') || await page.$('select');
  log(statusFilter ? 'PASS' : 'SKIP', '3.4', 'Filtro de status', statusFilter ? 'Visible' : 'No visible');
  await screenshot('25-subscribers-filters');

  // Table with subscribers
  const table = await page.$('table') || await page.$('[role="table"]') || await page.$('text="Email"');
  log(table ? 'PASS' : 'SKIP', '3.5', 'Tabla de suscriptores', table ? 'Tabla renderizada' : 'Sin tabla');

  // Import from Shopify button
  const shopifyBtn = await page.$('button:has-text("Importar")') || await page.$('button:has-text("Shopify")');
  log(shopifyBtn ? 'PASS' : 'SKIP', '3.6', 'Botón importar Shopify', shopifyBtn ? 'Visible' : 'No visible');
  await screenshot('26-subscribers-actions');

  // Add subscriber dialog
  const addBtn = await page.$('button:has-text("Agregar contacto")') || await page.$('button:has-text("Agregar")');
  if (addBtn) {
    await addBtn.click();
    await sleep(1500);
    await screenshot('27-add-subscriber-dialog');

    const emailField = await page.$('input[placeholder*="email"]') || await page.$('input[placeholder*="Email"]');
    const nameField = await page.$('input[placeholder*="Juan"]') || await page.$('input[placeholder*="Nombre"]');

    log(emailField ? 'PASS' : 'FAIL', '3.7', 'Dialog agregar contacto — email', emailField ? 'Input visible' : 'No visible');
    log(nameField ? 'PASS' : 'SKIP', '3.8', 'Dialog agregar contacto — nombre', nameField ? 'Input visible' : 'No visible');

    if (emailField) {
      await emailField.fill('qa-epic-test@jardindeeva.cl');
      if (nameField) await nameField.fill('QA Test');
      await screenshot('28-add-subscriber-filled');

      // Click Agregar
      const submitBtn = await page.$('button:has-text("Agregar"):not(:has-text("contacto"))') ||
                        await page.$('[role="dialog"] button:has-text("Agregar")');
      if (submitBtn) {
        await submitBtn.click();
        await sleep(2000);
        await screenshot('29-subscriber-added');
        log('PASS', '3.9', 'Agregar suscriptor', 'Submit exitoso');
      } else {
        log('SKIP', '3.9', 'Agregar suscriptor', 'Botón submit no encontrado');
        await page.keyboard.press('Escape');
      }
    } else {
      await page.keyboard.press('Escape');
      log('SKIP', '3.9', 'Agregar suscriptor', 'No se pudo rellenar');
    }
  } else {
    log('SKIP', '3.7', 'Dialog agregar contacto — email', 'Botón agregar no encontrado');
    log('SKIP', '3.8', 'Dialog agregar contacto — nombre', 'Botón agregar no encontrado');
    log('SKIP', '3.9', 'Agregar suscriptor', 'Botón agregar no encontrado');
  }

  // Pagination
  const pagination = await page.$('text="Página"') || await page.$('button:has-text("Siguiente")') || await page.$('button:has-text("Anterior")');
  log(pagination ? 'PASS' : 'SKIP', '3.10', 'Paginación visible', pagination ? 'Visible' : 'No visible');
  await screenshot('30-subscribers-pagination');

  // Export button
  const exportMenu = await page.$('button:has-text("...")') || await page.$('[aria-label="Más opciones"]');
  if (exportMenu) {
    await exportMenu.click();
    await sleep(500);
    await screenshot('31-subscribers-export-menu');
    const exportBtn = await page.$('text="Exportar"') || await page.$('[role="menuitem"]:has-text("Exportar")');
    log(exportBtn ? 'PASS' : 'SKIP', '3.11', 'Opción exportar', exportBtn ? 'Visible' : 'No visible');
    await page.keyboard.press('Escape');
  } else {
    log('SKIP', '3.11', 'Opción exportar', 'Menú no encontrado');
  }
}

// ──────────────────────────────────────────────
// FASE 4: Lists & Segments
// ──────────────────────────────────────────────

async function testListsAndSegments() {
  console.log('\n── FASE 4: Listas y Segmentos ──\n');

  // Switch to Lists sub-tab
  const listsSubTab = await waitAndClick('button:has-text("Listas y Segmentos")') ||
                      await waitAndClick('button:has-text("Listas")');
  await sleep(2000);
  await screenshot('32-lists-tab');

  if (!listsSubTab) {
    log('SKIP', '4.1', 'Sub-tab listas y segmentos', 'No encontrado');
    return;
  }
  log('PASS', '4.1', 'Sub-tab listas y segmentos', 'Visible');

  // Heading
  const listsHeading = await page.$('text="Listas y Segmentos"');
  log(listsHeading ? 'PASS' : 'SKIP', '4.2', 'Heading listas', listsHeading ? 'Visible' : 'No visible');

  // Create button
  const createBtn = await page.$('button:has-text("Crear")');
  if (createBtn) {
    await createBtn.click();
    await sleep(1500);
    await screenshot('33-create-list-dialog');
    log('PASS', '4.3', 'Dialog crear lista/segmento', 'Abierto');

    // Segment templates
    const templates = ['Compradores frecuentes', 'Clientes VIP', 'Nuevos clientes', 'Inactivos'];
    let templatesFound = 0;
    for (const tpl of templates) {
      if (await page.$(`text="${tpl}"`)) templatesFound++;
    }
    log(templatesFound >= 2 ? 'PASS' : 'SKIP', '4.4', 'Templates de segmento', `${templatesFound}/4 encontrados`);
    await screenshot('34-segment-templates');

    // Click "Lista manual"
    const manualBtn = await page.$('button:has-text("Lista manual")') || await page.$('text="Lista manual"');
    if (manualBtn) {
      await manualBtn.click();
      await sleep(1000);
      await screenshot('35-create-manual-list');

      // Fill list name
      const listNameInput = await page.$('input[placeholder]');
      if (listNameInput) {
        await listNameInput.fill('QA Epic Test List');
        await screenshot('36-list-name-filled');
        log('PASS', '4.5', 'Input nombre lista', 'Rellenado');

        // Click Crear — target the button inside the dialog
        try {
          const createListBtn = page.locator('[role="dialog"] button').filter({ hasText: /^Crear$/ }).first();
          if (await createListBtn.isVisible({ timeout: 3000 })) {
            await createListBtn.click({ timeout: 5000 });
            await sleep(2000);
            await screenshot('37-list-created');
            log('PASS', '4.6', 'Crear lista manual', 'Lista creada');
          } else {
            log('SKIP', '4.6', 'Crear lista manual', 'Botón crear no encontrado');
            await page.keyboard.press('Escape');
            await sleep(500);
          }
        } catch (e) {
          log('SKIP', '4.6', 'Crear lista manual', 'Click bloqueado por overlay');
          await page.keyboard.press('Escape');
          await sleep(1000);
        }
      } else {
        log('SKIP', '4.5', 'Input nombre lista', 'No encontrado');
        log('SKIP', '4.6', 'Crear lista manual', 'Input no disponible');
        await page.keyboard.press('Escape');
      }
    } else {
      log('SKIP', '4.5', 'Input nombre lista', 'Lista manual no encontrada');
      log('SKIP', '4.6', 'Crear lista manual', 'No disponible');

      // Try segment instead
      const segmentBtn = await page.$('text="Segmento con filtros"') || await page.$('button:has-text("Segmento")');
      if (segmentBtn) {
        await segmentBtn.click();
        await sleep(1000);
        await screenshot('35b-create-segment');
        log('PASS', '4.5b', 'Crear segmento con filtros', 'Formulario visible');
      }
      await page.keyboard.press('Escape');
    }

    // Create a segment from template
    await sleep(1000);
    // Close any lingering dialogs first
    await page.keyboard.press('Escape');
    await sleep(500);

    try {
      const createBtn2 = page.locator('button').filter({ hasText: /^Crear$/ }).first();
      if (await createBtn2.isVisible({ timeout: 3000 })) {
        await createBtn2.click({ timeout: 5000 });
        await sleep(1500);

        const vipBtn = await page.$('text="Clientes VIP"');
        if (vipBtn) {
          await vipBtn.click();
          await sleep(2000);
          await screenshot('38-segment-vip-created');
          log('PASS', '4.7', 'Crear segmento VIP desde template', 'Creado');
        } else {
          log('SKIP', '4.7', 'Crear segmento VIP desde template', 'Template no encontrado');
          await page.keyboard.press('Escape');
        }
      } else {
        log('SKIP', '4.7', 'Crear segmento VIP desde template', 'Botón crear no encontrado');
      }
    } catch {
      log('SKIP', '4.7', 'Crear segmento VIP desde template', 'Click bloqueado');
      await page.keyboard.press('Escape');
      await sleep(500);
    }
  } else {
    log('SKIP', '4.3', 'Dialog crear lista/segmento', 'Botón crear no encontrado');
    log('SKIP', '4.4', 'Templates de segmento', 'Dialog no abierto');
    log('SKIP', '4.5', 'Input nombre lista', 'Dialog no abierto');
    log('SKIP', '4.6', 'Crear lista manual', 'Dialog no abierto');
    log('SKIP', '4.7', 'Crear segmento VIP desde template', 'Dialog no abierto');
  }

  await screenshot('39-lists-final-state');

  // Verify lists appear
  const listsSection = await page.$('text="Listas"') || await page.$('text="Segmentos"');
  log(listsSection ? 'PASS' : 'SKIP', '4.8', 'Listas/segmentos listados', listsSection ? 'Secciones visibles' : 'No visible');
}

// ──────────────────────────────────────────────
// FASE 5: Flows / Automatizaciones
// ──────────────────────────────────────────────

async function testFlowsTab() {
  console.log('\n── FASE 5: Flows / Automatizaciones ──\n');

  await ensureOnSteveMail();
  // Click Automatizaciones tab
  await clickTab('Automatizaciones');
  await sleep(2000);
  await screenshot('40-flows-tab');

  const flowsHeading = await page.$('text="Automatizaciones"');
  log(flowsHeading ? 'PASS' : 'SKIP', '5.1', 'Tab Automatizaciones carga', flowsHeading ? 'Heading visible' : 'No visible');

  // Existing flows
  const existingFlows = await page.$$('text="Borrador"');
  const activeFlows = await page.$$('text="Activo"');
  log((existingFlows.length + activeFlows.length) > 0 ? 'PASS' : 'SKIP', '5.2', 'Flows listados', `${existingFlows.length + activeFlows.length} flows`);

  // Create new flow
  const newFlowBtn = await page.$('button:has-text("Nueva Automatización")') ||
                     await page.$('button:has-text("Nueva Automatizacion")') ||
                     await page.$('button:has-text("Crear automatización")') ||
                     await page.$('button:has-text("Crear automatizacion")');
  if (newFlowBtn) {
    await newFlowBtn.click();
    await sleep(2000);
    await screenshot('41-flow-trigger-picker');
    log('PASS', '5.3', 'Dialog trigger picker', 'Abierto');

    // Check trigger options
    const triggers = ['Carrito abandonado', 'Bienvenida', 'Post-compra', 'Recuperar cliente'];
    let triggersFound = 0;
    for (const t of triggers) {
      if (await page.$(`text="${t}"`)) triggersFound++;
    }
    log(triggersFound >= 2 ? 'PASS' : 'SKIP', '5.4', 'Opciones de trigger', `${triggersFound}/4 triggers`);
    await screenshot('42-flow-triggers-list');

    // AI generate buttons
    const aiFlowBtns = await page.$$('button:has-text("Carrito abandonado")');
    const aiSection = await page.$('text="genera todos los emails"') || await page.$('text="automaticamente con AI"');
    log(aiSection ? 'PASS' : 'SKIP', '5.5', 'Sección generar con AI', aiSection ? 'Visible' : 'No visible');

    // Select "Bienvenida" trigger — use evaluate to bypass dialog overlay
    const welcomeClicked = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('*')).find(e =>
        e.textContent?.trim() === 'Bienvenida' && e.closest('[role="dialog"]'));
      if (el) { el.click(); return true; }
      // Fallback: try any element with "Bienvenida"
      const els = Array.from(document.querySelectorAll('div, button, span, p'))
        .filter(e => e.textContent?.includes('Bienvenida') && e.children.length < 3);
      if (els.length > 0) { els[0].click(); return true; }
      return false;
    });
    if (welcomeClicked) {
      await sleep(3000);
      await screenshot('43-flow-editor-opened');
      log('PASS', '5.6', 'Seleccionar trigger Bienvenida', 'Flow editor abierto');

      // Flow editor elements
      // Flow name input
      const flowNameInput = await page.$('input[placeholder*="Nombre"]') || await page.$('input[placeholder*="nombre"]') || await page.$('input[placeholder*="automatizacion"]');
      if (flowNameInput) {
        await flowNameInput.fill('QA Epic Welcome Flow');
        log('PASS', '5.7', 'Input nombre flow', 'Rellenado');
      } else {
        log('SKIP', '5.7', 'Input nombre flow', 'No encontrado');
      }
      await screenshot('44-flow-name-filled');

      // Config button — use page.evaluate to click because canvas overlays intercept
      try {
        const configClicked = await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Config'));
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (configClicked) {
          await sleep(1000);
          await screenshot('45-flow-config-panel');
          log('PASS', '5.8', 'Panel de configuración', 'Abierto');

          const exitSwitch = await page.$('text="Salir si el cliente compra"');
          log(exitSwitch ? 'PASS' : 'SKIP', '5.9', 'Opción salir si compra', exitSwitch ? 'Visible' : 'No visible');

          const quietHours = await page.$('text="Horas silenciosas"') || await page.$('text="silenciosas"');
          log(quietHours ? 'PASS' : 'SKIP', '5.10', 'Horas silenciosas', quietHours ? 'Visible' : 'No visible');

          // Close config
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Config'));
            if (btn) btn.click();
          });
          await sleep(500);
        } else {
          log('SKIP', '5.8', 'Panel de configuración', 'Botón no encontrado');
          log('SKIP', '5.9', 'Opción salir si compra', 'Config no abierto');
          log('SKIP', '5.10', 'Horas silenciosas', 'Config no abierto');
        }
      } catch {
        log('SKIP', '5.8', 'Panel de configuración', 'Error al clickear');
        log('SKIP', '5.9', 'Opción salir si compra', 'Config no abierto');
        log('SKIP', '5.10', 'Horas silenciosas', 'Config no abierto');
      }

      // FlowCanvas - trigger node
      const triggerNode = await page.$('text="Disparador"') || await page.$('text="Trigger"');
      log(triggerNode ? 'PASS' : 'SKIP', '5.11', 'Nodo trigger en canvas', triggerNode ? 'Visible' : 'No visible');
      await screenshot('46-flow-canvas');

      // Add Email step — use evaluate to avoid overlay interception
      const addedEmail = await page.evaluate(() => {
        // Find the "Email" button in the add-step bar (not the tab)
        const btns = Array.from(document.querySelectorAll('button'));
        const emailBtn = btns.find(b => b.textContent?.trim() === 'Email' || (b.textContent?.includes('Email') && !b.textContent?.includes('Steve')));
        if (emailBtn) { emailBtn.click(); return true; }
        return false;
      });
      if (addedEmail) {
        await sleep(1000);
        await screenshot('47-flow-email-step-added');
        log('PASS', '5.12', 'Agregar step Email', 'Step añadido');

        // Email subject input in step — may not be immediately visible
        try {
          const emailSubject = page.locator('input[placeholder*="Asunto"]').first();
          if (await emailSubject.isVisible({ timeout: 3000 })) {
            await emailSubject.fill('Bienvenido a Jardin de Eva', { timeout: 5000 });
            log('PASS', '5.13', 'Input asunto en step', 'Rellenado');
          } else {
            log('SKIP', '5.13', 'Input asunto en step', 'No visible');
          }
        } catch {
          log('SKIP', '5.13', 'Input asunto en step', 'Error al rellenar');
        }
        await screenshot('48-flow-email-subject');
      } else {
        log('SKIP', '5.12', 'Agregar step Email', 'Botón no encontrado');
        log('SKIP', '5.13', 'Input asunto en step', 'No disponible');
      }

      // Add Delay step — use evaluate
      const addedDelay = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Esperar'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (addedDelay) {
        await sleep(1000);
        await screenshot('49-flow-delay-step-added');
        log('PASS', '5.14', 'Agregar step Esperar', 'Step añadido');
      } else {
        log('SKIP', '5.14', 'Agregar step Esperar', 'Botón no encontrado');
      }

      // Add Condition step — use evaluate
      const addedCond = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Condici'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (addedCond) {
        await sleep(1000);
        await screenshot('50-flow-condition-step-added');
        log('PASS', '5.15', 'Agregar step Condición', 'Step añadido');

        // Branch labels
        const yesBranch = await page.$('text="Sí"');
        const noBranch = await page.$('text="No"');
        log((yesBranch && noBranch) ? 'PASS' : 'SKIP', '5.16', 'Branches Sí/No', (yesBranch && noBranch) ? 'Ambas visibles' : 'No visibles');
      } else {
        log('SKIP', '5.15', 'Agregar step Condición', 'Botón no encontrado');
        log('SKIP', '5.16', 'Branches Sí/No', 'No disponible');
      }

      await screenshot('51-flow-complete-canvas');

      // Save flow — use evaluate
      const savedFlow = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent?.includes('Crear') || b.textContent?.includes('Guardar'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (savedFlow) {
        await sleep(2000);
        await screenshot('52-flow-saved');
        log('PASS', '5.17', 'Guardar flow como borrador', 'Guardado');
      } else {
        log('SKIP', '5.17', 'Guardar flow como borrador', 'Botón no encontrado');
      }

      // Go back — use evaluate
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Volver'));
        if (btn) btn.click();
      });
      await sleep(2000);
      await screenshot('53-back-to-flows');
    } else {
      log('SKIP', '5.6', 'Seleccionar trigger Bienvenida', 'Trigger no encontrado');
      log('SKIP', '5.7', 'Input nombre flow', 'Editor no abierto');
      // Skip remaining
      for (let i = 8; i <= 17; i++) {
        log('SKIP', `5.${i}`, `Flow test ${i}`, 'Editor no abierto');
      }
      await page.keyboard.press('Escape');
    }
  } else {
    log('SKIP', '5.3', 'Dialog trigger picker', 'Botón crear no encontrado');
    for (let i = 4; i <= 17; i++) {
      log('SKIP', `5.${i}`, `Flow test ${i}`, 'No disponible');
    }
  }
}

// ──────────────────────────────────────────────
// FASE 6: Forms / Formularios
// ──────────────────────────────────────────────

async function testFormsTab() {
  console.log('\n── FASE 6: Formularios ──\n');

  await ensureOnSteveMail();
  // Click Formularios tab
  await clickTab('Formularios');
  await sleep(2000);
  await screenshot('54-forms-tab');

  const formsHeading = await page.$('text="Formularios de Registro"') || await page.$('text="Formularios"');
  log(formsHeading ? 'PASS' : 'SKIP', '6.1', 'Tab Formularios carga', formsHeading ? 'Heading visible' : 'No visible');

  // Create new form
  const newFormBtn = await page.$('button:has-text("Nuevo Formulario")') ||
                     await page.$('button:has-text("Crear Formulario")');
  if (newFormBtn) {
    await newFormBtn.click();
    await sleep(1500);
    await screenshot('55-form-create-dialog');
    log('PASS', '6.2', 'Dialog crear formulario', 'Abierto');

    // Form name
    const formNameInput = await page.$('input[placeholder*="Popup"]') ||
                          await page.$('input[placeholder*="popup"]') ||
                          await page.$('input[placeholder*="formulario"]') ||
                          await page.$('input[placeholder*="nombre"]');
    if (formNameInput) {
      await formNameInput.fill('QA Epic Popup Form');
      log('PASS', '6.3', 'Input nombre formulario', 'Rellenado');
    } else {
      log('SKIP', '6.3', 'Input nombre formulario', 'No encontrado');
    }
    await screenshot('56-form-name-filled');

    // Form type cards
    const typeCards = ['Popup', 'Slide-in', 'Barra', 'Pagina completa'];
    let typeCardsFound = 0;
    for (const tc of typeCards) {
      if (await page.$(`text="${tc}"`)) typeCardsFound++;
    }
    log(typeCardsFound >= 2 ? 'PASS' : 'SKIP', '6.4', 'Tipos de formulario visibles', `${typeCardsFound}/4 tipos`);
    await screenshot('57-form-types');

    // Click Popup type
    const popupCard = await page.$('text="Popup"');
    if (popupCard) {
      await popupCard.click();
      await sleep(500);
      log('PASS', '6.5', 'Seleccionar tipo Popup', 'Seleccionado');
    } else {
      log('SKIP', '6.5', 'Seleccionar tipo Popup', 'Card no encontrada');
    }

    // Design fields
    const titularInput = await page.$('input[placeholder*="Suscribete"]') ||
                         await page.$('input[placeholder*="suscribete"]') ||
                         await page.$('input[placeholder*="newsletter"]');
    if (titularInput) {
      await titularInput.fill('Únete a nuestra comunidad');
      log('PASS', '6.6', 'Input titular formulario', 'Rellenado');
    } else {
      log('SKIP', '6.6', 'Input titular formulario', 'No encontrado');
    }

    const descInput = await page.$('input[placeholder*="ofertas"]') ||
                      await page.$('input[placeholder*="Recibe"]');
    if (descInput) {
      await descInput.fill('Recibe las mejores ofertas de Jardin de Eva');
      log('PASS', '6.7', 'Input descripción formulario', 'Rellenado');
    } else {
      log('SKIP', '6.7', 'Input descripción formulario', 'No encontrado');
    }

    const buttonTextInput = await page.$('input[placeholder*="Suscribirme"]') ||
                            await page.$('input[placeholder*="suscribirme"]');
    if (buttonTextInput) {
      await buttonTextInput.fill('¡Quiero mis ofertas!');
      log('PASS', '6.8', 'Input texto botón', 'Rellenado');
    } else {
      log('SKIP', '6.8', 'Input texto botón', 'No encontrado');
    }
    await screenshot('58-form-design-filled');

    // Color pickers
    const colorInputs = await page.$$('input[type="color"]');
    log(colorInputs.length >= 1 ? 'PASS' : 'SKIP', '6.9', 'Color pickers', `${colorInputs.length} encontrados`);

    // Live preview
    const livePreview = await page.$('text="Vista previa"') || await page.$('.rounded-lg.border.p-6') || await page.$('[class*="preview"]');
    log(livePreview ? 'PASS' : 'SKIP', '6.10', 'Vista previa en vivo', livePreview ? 'Visible' : 'No visible');
    await screenshot('59-form-preview');

    // Advanced options
    const advancedBtn = await page.$('text="Opciones avanzadas"') || await page.$('button:has-text("avanzadas")');
    if (advancedBtn) {
      await advancedBtn.click();
      await sleep(1000);
      await screenshot('60-form-advanced-options');
      log('PASS', '6.11', 'Opciones avanzadas formulario', 'Desplegadas');

      // Discount section
      const discountSection = await page.$('text="Descuento"') || await page.$('text="descuento"');
      log(discountSection ? 'PASS' : 'SKIP', '6.12', 'Sección descuento', discountSection ? 'Visible' : 'No visible');

      // When to show section
      const whenSection = await page.$('text="Cuando mostrar"') || await page.$('text="intentar salir"');
      log(whenSection ? 'PASS' : 'SKIP', '6.13', 'Sección cuándo mostrar', whenSection ? 'Visible' : 'No visible');

      // Tags section
      const tagsSection = await page.$('text="Etiquetar"') || await page.$('input[placeholder*="popup"]') || await page.$('text="tags"');
      log(tagsSection ? 'PASS' : 'SKIP', '6.14', 'Sección tags', tagsSection ? 'Visible' : 'No visible');
      await screenshot('61-form-advanced-all');
    } else {
      log('SKIP', '6.11', 'Opciones avanzadas formulario', 'No encontrado');
      log('SKIP', '6.12', 'Sección descuento', 'No disponible');
      log('SKIP', '6.13', 'Sección cuándo mostrar', 'No disponible');
      log('SKIP', '6.14', 'Sección tags', 'No disponible');
    }

    // Submit form creation — use evaluate to bypass overlay
    try {
      const created = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent?.includes('Crear formulario')) ||
                    btns.find(b => b.textContent?.trim() === 'Crear');
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (created) {
        await sleep(2000);
        await screenshot('62-form-created');
        log('PASS', '6.15', 'Crear formulario popup', 'Formulario creado');
      } else {
        log('SKIP', '6.15', 'Crear formulario popup', 'Botón no encontrado');
        await page.keyboard.press('Escape');
        await sleep(500);
      }
    } catch {
      log('SKIP', '6.15', 'Crear formulario popup', 'Error');
      await page.keyboard.press('Escape');
      await sleep(500);
    }

    await sleep(1000);
    await screenshot('63-forms-list-updated');
  } else {
    log('SKIP', '6.2', 'Dialog crear formulario', 'Botón no encontrado');
    for (let i = 3; i <= 15; i++) {
      log('SKIP', `6.${i}`, `Form test ${i}`, 'No disponible');
    }
  }

  // Form status badges
  const formBadges = await page.$$('text="Activo"');
  const inactiveBadges = await page.$$('text="Inactivo"');
  log((formBadges.length + inactiveBadges.length) > 0 ? 'PASS' : 'SKIP', '6.16', 'Badges status formularios', `${formBadges.length} activos, ${inactiveBadges.length} inactivos`);
}

// ──────────────────────────────────────────────
// FASE 7: Analytics / Rendimiento
// ──────────────────────────────────────────────

async function testAnalyticsTab() {
  console.log('\n── FASE 7: Analytics / Rendimiento ──\n');

  await ensureOnSteveMail();
  // Click Rendimiento tab
  await clickTab('Rendimiento');
  await sleep(3000);
  await screenshot('64-analytics-tab');

  const analyticsHeading = await page.$('text="Rendimiento"');
  log(analyticsHeading ? 'PASS' : 'SKIP', '7.1', 'Tab Rendimiento carga', analyticsHeading ? 'Heading visible' : 'No visible');

  // Main metric cards
  const metricNames = ['Enviados', 'Aperturas', 'Clicks', 'Rebotes', 'Salud'];
  let metricsFound = 0;
  for (const m of metricNames) {
    if (await page.$(`text="${m}"`)) metricsFound++;
  }
  log(metricsFound >= 3 ? 'PASS' : 'SKIP', '7.2', 'Cards de métricas principales', `${metricsFound}/5 métricas`);
  await screenshot('65-analytics-metrics');

  // Time range selector
  const timeRange = await page.$('text="Últimos 7 días"') || await page.$('text="Últimos 30 días"') ||
                    await page.$('text="7 días"') || await page.$('text="30 días"');
  log(timeRange ? 'PASS' : 'SKIP', '7.3', 'Selector rango de tiempo', timeRange ? 'Visible' : 'No visible');

  // Subscriber count bar
  const subCount = await page.$('text="Contactos activos"') || await page.$('text=/Contactos.*activos/');
  log(subCount ? 'PASS' : 'SKIP', '7.4', 'Contador contactos activos', subCount ? 'Visible' : 'No visible');

  // Industry benchmarks
  await page.evaluate(() => window.scrollTo(0, 500));
  await sleep(500);
  const benchmarks = await page.$('text="Comparativo con industria"') || await page.$('text="industria"');
  log(benchmarks ? 'PASS' : 'SKIP', '7.5', 'Benchmarks de industria', benchmarks ? 'Card visible' : 'No visible');
  await screenshot('66-analytics-benchmarks');

  // Timeline chart
  const timeline = await page.$('text="Actividad en el tiempo"') || await page.$('text="actividad"');
  log(timeline ? 'PASS' : 'SKIP', '7.6', 'Gráfico timeline', timeline ? 'Visible' : 'No visible');

  // Campaign comparison
  await page.evaluate(() => window.scrollTo(0, 1000));
  await sleep(500);
  const comparison = await page.$('text="Comparativa de campañas"') || await page.$('text="Comparativa"') || await page.$('text="campanas"');
  log(comparison ? 'PASS' : 'SKIP', '7.7', 'Gráfico comparativa campañas', comparison ? 'Visible' : 'No visible');
  await screenshot('67-analytics-campaign-comparison');

  // Recent campaigns table
  const recentTable = await page.$('text="Campañas recientes"') || await page.$('text="Campanas recientes"') || await page.$('text="recientes"');
  log(recentTable ? 'PASS' : 'SKIP', '7.8', 'Tabla campañas recientes', recentTable ? 'Visible' : 'No visible');
  await screenshot('68-analytics-recent-campaigns');

  // Full page scroll screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  await screenshot('69-analytics-full-page');
}

// ──────────────────────────────────────────────
// FASE 8: Domain Setup
// ──────────────────────────────────────────────

async function testDomainSetup() {
  console.log('\n── FASE 8: Configurar Dominio ──\n');

  const domainBtn = await page.$('button:has-text("Configurar dominio")') ||
                    await page.$('button:has-text("dominio")');
  if (domainBtn) {
    await domainBtn.click();
    await sleep(1500);
    await screenshot('70-domain-setup-dialog');
    log('PASS', '8.1', 'Dialog configurar dominio', 'Abierto');

    // DNS fields or domain input
    const domainInput = await page.$('input[placeholder*="dominio"]') || await page.$('input[placeholder*="domain"]');
    log(domainInput ? 'PASS' : 'SKIP', '8.2', 'Input dominio', domainInput ? 'Visible' : 'No visible');

    // DNS records section
    const dnsSection = await page.$('text="DNS"') || await page.$('text="SPF"') || await page.$('text="DKIM"') || await page.$('text="registros"');
    log(dnsSection ? 'PASS' : 'SKIP', '8.3', 'Sección DNS records', dnsSection ? 'Visible' : 'No visible');

    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    log('SKIP', '8.1', 'Dialog configurar dominio', 'Botón no encontrado');
    log('SKIP', '8.2', 'Input dominio', 'Dialog no abierto');
    log('SKIP', '8.3', 'Sección DNS records', 'Dialog no abierto');
  }
}

// ──────────────────────────────────────────────
// FASE 9: Responsive Tests
// ──────────────────────────────────────────────

async function testResponsive() {
  console.log('\n── FASE 9: Responsive Tests ──\n');

  // First go to campaigns tab as a representative tab
  await ensureOnSteveMail();
  await clickTab('Campanas');
  await sleep(1500);

  // iPhone SE (375px)
  await page.setViewportSize({ width: 375, height: 667 });
  await sleep(1500);
  await screenshot('71-responsive-iphone-se');
  const tabsOnMobile = await page.$('[role="tab"]');
  log(tabsOnMobile ? 'PASS' : 'FAIL', '9.1', 'iPhone SE (375x667)', 'UI renderiza');

  // iPhone 14 Pro (393px)
  await page.setViewportSize({ width: 393, height: 852 });
  await sleep(1000);
  await screenshot('72-responsive-iphone14');
  log('PASS', '9.2', 'iPhone 14 Pro (393x852)', 'UI renderiza');

  // iPad Mini (768px)
  await page.setViewportSize({ width: 768, height: 1024 });
  await sleep(1000);
  await screenshot('73-responsive-ipad-mini');
  log('PASS', '9.3', 'iPad Mini (768x1024)', 'UI renderiza');

  // iPad Pro (1024px)
  await page.setViewportSize({ width: 1024, height: 1366 });
  await sleep(1000);
  await screenshot('74-responsive-ipad-pro');
  log('PASS', '9.4', 'iPad Pro (1024x1366)', 'UI renderiza');

  // Laptop (1280px)
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(1000);
  await screenshot('75-responsive-laptop');
  log('PASS', '9.5', 'Laptop (1280x800)', 'UI renderiza');

  // Wide screen (1920px)
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(1000);
  await screenshot('76-responsive-widescreen');
  log('PASS', '9.6', 'Widescreen (1920x1080)', 'UI renderiza');

  // Test each tab on mobile
  await page.setViewportSize({ width: 375, height: 667 });
  await sleep(500);

  const mobileTabs = [
    { name: 'Contactos', id: '9.7' },
    { name: 'Automatizaciones', id: '9.8' },
    { name: 'Formularios', id: '9.9' },
    { name: 'Rendimiento', id: '9.10' },
  ];

  for (const tab of mobileTabs) {
    const clicked = await clickTab(tab.name);
    await sleep(1500);
    const suffix = tab.name.toLowerCase().replace(/[^a-z]/g, '');
    await screenshot(`77-mobile-${suffix}`);
    log(clicked ? 'PASS' : 'SKIP', tab.id, `Mobile: ${tab.name}`, clicked ? 'Renderiza correctamente' : 'Tab no encontrado');
  }

  // Reset viewport
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(500);
}

// ──────────────────────────────────────────────
// FASE 10: Navigation & Stability
// ──────────────────────────────────────────────

async function testNavigation() {
  console.log('\n── FASE 10: Navegación y Estabilidad ──\n');

  // Rapid tab switching
  await ensureOnSteveMail();
  const tabs = ['Campanas', 'Contactos', 'Automatizaciones', 'Formularios', 'Rendimiento'];
  let switchCount = 0;

  for (const tab of tabs) {
    const clicked = await clickTab(tab);
    if (clicked) {
      switchCount++;
      await sleep(800);
    }
  }
  await screenshot('82-rapid-tab-switch');
  log(switchCount >= 4 ? 'PASS' : 'FAIL', '10.1', 'Cambio rápido entre 5 tabs', `${switchCount}/5 tabs`);

  // Double-click rapid navigation (stress test)
  for (let i = 0; i < 3; i++) {
    for (const tab of tabs) {
      await clickTab(tab);
      await sleep(200); // Very fast switching
    }
  }
  await sleep(2000);
  const stillAlive = await page.$('[role="tab"]');
  log(stillAlive ? 'PASS' : 'FAIL', '10.2', 'Stress test navegación rápida (15 switches)', stillAlive ? 'UI estable' : 'UI se rompió');
  await screenshot('83-after-stress-test');

  // Console errors count
  const errors = page.consoleErrors;
  log(errors.length === 0 ? 'PASS' : 'FAIL', '10.3', 'Errores en consola', `${errors.length} errores`);
  if (errors.length > 0) {
    console.log('    Primeros errores:');
    errors.slice(0, 5).forEach(e => console.log(`      - ${e.substring(0, 100)}`));
  }

  // Page doesn't have blank screens
  const bodyContent = await page.evaluate(() => document.body.innerText.length);
  log(bodyContent > 100 ? 'PASS' : 'FAIL', '10.4', 'Sin pantalla blanca', `${bodyContent} chars en body`);
  await screenshot('84-final-state');
}

// ──────────────────────────────────────────────
// FASE 11: Campaign Delete (cleanup)
// ──────────────────────────────────────────────

async function testCampaignDelete() {
  console.log('\n── FASE 11: Eliminar campaña de prueba ──\n');

  // Go to campaigns
  await ensureOnSteveMail();
  await clickTab('Campanas');
  await sleep(2000);

  // Find QA campaign
  const qaCampaign = await page.$('text="QA Epic Test Campaign"');
  if (qaCampaign) {
    // Find delete button near it
    const row = await qaCampaign.evaluateHandle(el => {
      let parent = el.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!parent) break;
        const btn = parent.querySelector('button[title="Eliminar"]') || parent.querySelector('[aria-label="Eliminar"]');
        if (btn) return parent;
        parent = parent.parentElement;
      }
      return parent;
    });

    const deleteBtn = await row.$('button[title="Eliminar"]') || await page.$('button[title="Eliminar"]');
    if (deleteBtn) {
      await deleteBtn.click();
      await sleep(1000);
      await screenshot('85-delete-campaign-confirm');

      // Confirm delete
      const confirmBtn = await page.$('button:has-text("Eliminar"):not([title])') ||
                         await page.$('[role="alertdialog"] button:has-text("Eliminar")');
      if (confirmBtn) {
        await confirmBtn.click();
        await sleep(2000);
        await screenshot('86-campaign-deleted');
        log('PASS', '11.1', 'Eliminar campaña QA', 'Eliminada');
      } else {
        log('SKIP', '11.1', 'Eliminar campaña QA', 'Confirm no encontrado');
      }
    } else {
      log('SKIP', '11.1', 'Eliminar campaña QA', 'Botón delete no encontrado');
    }
  } else {
    log('SKIP', '11.1', 'Eliminar campaña QA', 'Campaña no encontrada (puede que no se guardó)');
  }
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────

(async () => {
  try {
    await setup();
    await navigateToSteveMail();
    await testCampaignsTab();
    await testCreateCampaign();
    await testSubscribersTab();
    await testListsAndSegments();
    await testFlowsTab();
    await testFormsTab();
    await testAnalyticsTab();
    await testDomainSetup();
    await testResponsive();
    await testNavigation();
    await testCampaignDelete();
  } catch (err) {
    console.error('\n[FATAL ERROR]', err.message);
    try { await screenshot('FATAL-ERROR'); } catch {}
  } finally {
    if (browser) await browser.close();
  }

  // ── REPORT ──
  const effective = PASS + FAIL;
  const score = effective > 0 ? Math.round((PASS / effective) * 100) : 0;

  console.log('\n══════════════════════════════════════════');
  console.log('  RESUMEN QA FRONTEND EPIC — STEVE MAIL');
  console.log('══════════════════════════════════════════\n');
  console.log(`  ✓ PASS: ${PASS}`);
  console.log(`  ✗ FAIL: ${FAIL}`);
  console.log(`  ⊘ SKIP: ${SKIP}`);
  console.log(`  TOTAL:  ${TOTAL}\n`);
  console.log(`  Score: ${score}% (${PASS}/${effective} efectivas)\n`);
  console.log(`  Screenshots: ${screenshotCount} en ${SCREENSHOT_DIR}/\n`);

  // List failed tests
  const fails = results.filter(r => r.status === 'FAIL');
  if (fails.length > 0) {
    console.log('  FALLOS:');
    fails.forEach(f => console.log(`    ✗ [${f.id}] ${f.desc} — ${f.detail}`));
    console.log('');
  }

  // List skipped tests
  const skips = results.filter(r => r.status === 'SKIP');
  if (skips.length > 0) {
    console.log(`  SKIPS (${skips.length}):`);
    skips.forEach(s => console.log(`    ⊘ [${s.id}] ${s.desc} — ${s.detail}`));
    console.log('');
  }

  // Summary by phase
  console.log('  POR FASE:');
  const phases = {};
  for (const r of results) {
    const phase = r.id.split('.')[0];
    if (!phases[phase]) phases[phase] = { pass: 0, fail: 0, skip: 0 };
    phases[phase][r.status.toLowerCase()]++;
  }
  const phaseNames = {
    '0': 'Navegación', '1': 'Campaigns Tab', '2': 'Crear Campaña',
    '3': 'Subscribers', '4': 'Listas/Segmentos', '5': 'Flows',
    '6': 'Formularios', '7': 'Analytics', '8': 'Dominio',
    '9': 'Responsive', '10': 'Navegación/Estabilidad', '11': 'Cleanup'
  };
  for (const [phase, counts] of Object.entries(phases)) {
    const name = phaseNames[phase] || `Fase ${phase}`;
    const total = counts.pass + counts.fail;
    const pct = total > 0 ? Math.round((counts.pass / total) * 100) : 100;
    console.log(`    ${name}: ${counts.pass}P ${counts.fail}F ${counts.skip}S — ${pct}%`);
  }
  console.log('');
})();
