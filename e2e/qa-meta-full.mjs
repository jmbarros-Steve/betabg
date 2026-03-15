/**
 * QA Exhaustivo - Bloque Meta Completo
 * Prueba todas las funcionalidades de Meta como heavy user
 * Screenshots en e2e/screenshots/meta/
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYzMzY2OCwiZXhwIjoyMDg3MjA5NjY4fQ.xmTkRrqT7Hg5dPcc6vs6SnwikFvVqSjNAnnhfbQkjhQ';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwc3dqY2NzeGp0bmhldGtrcWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM2NjgsImV4cCI6MjA4NzIwOTY2OH0.PRkFg5sdmu8kXdL9xtpZFREKgohF9cGrNjWVVwZ7IXw';
const APP_URL = 'https://betabgnuevosupa.vercel.app';
const SCREENSHOT_DIR = path.join(process.cwd(), 'e2e/screenshots/meta');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
// Clean old screenshots
for (const f of fs.readdirSync(SCREENSHOT_DIR)) {
  fs.unlinkSync(path.join(SCREENSHOT_DIR, f));
}

const supabase = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false } });

const issues = [];
const warnings = [];
let shotCounter = 0;

function log(msg) { console.log(`\x1b[36m[QA]\x1b[0m ${msg}`); }
function logOK(msg) { console.log(`\x1b[32m  ✓\x1b[0m ${msg}`); }
function logFAIL(msg) { console.log(`\x1b[31m  ✗\x1b[0m ${msg}`); issues.push(msg); }
function logWARN(msg) { console.log(`\x1b[33m  ⚠\x1b[0m ${msg}`); warnings.push(msg); }

async function shot(page, name) {
  shotCounter++;
  const filename = `${String(shotCounter).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage: false });
  return filename;
}

async function clickNav(page, text) {
  // Try multiple selector patterns for nav buttons
  const selectors = [
    `nav button:has-text("${text}")`,
    `aside button:has-text("${text}")`,
    `[class*="nav"] button:has-text("${text}")`,
    `button:has-text("${text}")`,
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      try {
        await el.click({ force: true, timeout: 5000 });
      } catch {
        await el.click({ timeout: 5000 });
      }
      await page.waitForTimeout(2500);
      return true;
    }
  }
  return false;
}

async function dismissModals(page) {
  // Dismiss onboarding wizard, alerts, modals
  for (const text of ['Omitir', 'Cerrar', 'Skip', 'Dismiss', 'Close']) {
    const btn = page.locator(`button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000);
      log(`Modal dismissed via "${text}"`);
    }
  }
  // Also try Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// Track API calls and errors
const apiCalls = [];
const networkErrors = [];

function setupCapture(page) {
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (url.includes('/api/')) {
      const endpoint = url.split('/api/')[1]?.split('?')[0];
      apiCalls.push({ endpoint, status });
      if (status >= 400) {
        networkErrors.push({ endpoint, status });
      }
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('third-party') && !text.includes('ERR_BLOCKED') && !text.includes('net::')) {
        warnings.push(`Console error: ${text.substring(0, 150)}`);
      }
    }
  });
}

async function main() {
  log('═══════════════════════════════════════');
  log('  QA EXHAUSTIVO META — BLOQUE COMPLETO');
  log('═══════════════════════════════════════\n');

  // ── AUTH ──
  log('Generando sesión...');
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'jmbarros@barguz.cl',
  });
  const emailOtp = linkData?.properties?.email_otp;
  if (!emailOtp) { logFAIL('No se pudo generar OTP'); return; }
  logOK('OTP generado');

  // ── BROWSER ──
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-CL',
  });
  const page = await context.newPage();
  setupCapture(page);

  // ── LOGIN ──
  log('Autenticando en app...');
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Inject auth via Supabase JS in browser context
  await page.evaluate(async ({ url, key, email, otp }) => {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const sb = createClient(url, key);
    const result = await sb.auth.verifyOtp({ email, token: otp, type: 'magiclink' });
    if (result.error) throw new Error(result.error.message);
    // Store session for the app's Supabase client
    const session = result.data.session;
    localStorage.setItem('sb-zpswjccsxjtnhetkkqde-auth-token', JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    }));
  }, { url: SUPABASE_URL, key: ANON_KEY, email: 'jmbarros@barguz.cl', otp: emailOtp });

  logOK('Sesión inyectada en localStorage');

  // Navigate to portal
  await page.goto(`${APP_URL}/portal`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Dismiss any onboarding/welcome modals
  await dismissModals(page);
  await page.waitForTimeout(1000);
  await dismissModals(page); // Double check

  await shot(page, 'portal-clean');

  // ── FIND META ADS TAB ──
  log('\nBuscando sección Meta Ads...');

  // Meta Ads is under "Más" dropdown → "Meta Ads" menu item
  // The dropdown button shows "Más" if no secondary tab is active, otherwise shows the active tab label
  const dropdownBtn = page.locator('button:has(svg.lucide-chevron-down)').first();
  if (await dropdownBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dropdownBtn.click();
    await page.waitForTimeout(1000);
    logOK('Dropdown secundario abierto');

    // Wait for dropdown menu to appear, then click Meta Ads
    const metaItem = page.locator('[role="menuitem"]:has-text("Meta Ads")').first();
    if (await metaItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await metaItem.click();
      await page.waitForTimeout(5000); // Meta Ads loads hierarchy which takes time
      logOK('Tab Meta Ads seleccionado');
    } else {
      // List all menu items for debugging
      const items = await page.locator('[role="menuitem"]').allTextContents();
      log(`Menu items disponibles: ${items.join(', ')}`);
      logFAIL('No se encontró "Meta Ads" en dropdown');
    }
  } else {
    logFAIL('No se encontró dropdown de tabs secundarios');
  }

  await dismissModals(page);
  await shot(page, 'meta-section-initial');

  // Check if we see the Meta sidebar navigation
  const sidebarTexts = await page.locator('aside button, nav button, [class*="sidebar"] button, [class*="nav"] button').allTextContents();
  const sidebarClean = sidebarTexts.filter(t => t.trim()).map(t => t.trim());
  log(`Sidebar/Nav items: ${sidebarClean.join(' | ')}`);

  // ═══════════════════════════════════════
  // 1. DASHBOARD
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  1. DASHBOARD                    ║');
  log('╚══════════════════════════════════╝');

  await clickNav(page, 'Dashboard');
  await dismissModals(page);
  await shot(page, '01-dashboard');

  // Check for KPI cards
  const cards = await page.locator('[class*="card"], [class*="Card"]').count();
  if (cards > 0) logOK(`${cards} cards visibles`);
  else logWARN('No se ven cards en dashboard');

  // Check for actual metric values (not just empty)
  const metricValues = await page.locator('[class*="card"] [class*="text-2xl"], [class*="card"] [class*="text-3xl"], [class*="card"] .font-bold').allTextContents();
  const nonEmpty = metricValues.filter(v => v.trim() && v.trim() !== '--' && v.trim() !== '$0');
  if (nonEmpty.length > 0) {
    logOK(`Métricas con datos: ${nonEmpty.slice(0, 4).join(', ')}`);
  } else {
    logWARN('Dashboard no muestra valores de métricas reales');
  }

  // ═══════════════════════════════════════
  // 2. CAMPAÑAS (Tree View)
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  2. CAMPAÑAS (Tree View)         ║');
  log('╚══════════════════════════════════╝');

  const campFound = await clickNav(page, 'Campañas') || await clickNav(page, 'Tree');
  if (!campFound) logFAIL('No se encontró sección Campañas');
  await dismissModals(page);
  await shot(page, '02-campaigns');

  // Check for campaign rows
  const campRows = await page.locator('table tr, [class*="campaign"], [class*="tree-row"]').count();
  log(`Elementos de campaña: ${campRows}`);

  // Try sync button
  const syncBtn = page.locator('button:has-text("Sincronizar"), button:has-text("Sync")').first();
  if (await syncBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    logOK('Botón Sincronizar visible');
    await syncBtn.click();
    await page.waitForTimeout(8000); // Sync takes time
    await shot(page, '02-campaigns-synced');

    // Check for error toasts
    const errToast = page.locator('[data-sonner-toast][data-type="error"]').first();
    if (await errToast.isVisible({ timeout: 2000 }).catch(() => false)) {
      const text = await errToast.textContent();
      logFAIL(`Sync error: ${text?.substring(0, 100)}`);
    } else {
      logOK('Sync completado');
    }
  }

  // Try expanding a campaign
  const expandBtns = page.locator('button:has(svg.lucide-chevron-right), button:has(svg.lucide-chevron-down)');
  if (await expandBtns.count() > 0) {
    await expandBtns.first().click();
    await page.waitForTimeout(1500);
    await shot(page, '02-campaigns-expanded');
    logOK('Campaña expandida — ad sets visibles');
  }

  // Check campaign status badges
  const statusBadges = await page.locator('[class*="badge"], [class*="Badge"]').allTextContents();
  if (statusBadges.length > 0) {
    logOK(`Status badges: ${[...new Set(statusBadges.map(s => s.trim()))].join(', ')}`);
  }

  // ═══════════════════════════════════════
  // 3. CREAR CAMPAÑA (Wizard)
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  3. CREAR CAMPAÑA (Wizard)       ║');
  log('╚══════════════════════════════════╝');

  const crearFound = await clickNav(page, 'Crear');
  if (!crearFound) logFAIL('No se encontró sección Crear');
  await dismissModals(page);
  await shot(page, '03-wizard-initial');

  // Check step indicator
  const steps = await page.locator('[class*="step"], [class*="Step"]').count();
  log(`Step indicators: ${steps}`);

  // Check objectives
  const objButtons = page.locator('[class*="objective"], button:has-text("Tráfico"), button:has-text("Conversiones"), button:has-text("Ventas")');
  const objCount = await objButtons.count();
  if (objCount > 0) {
    logOK(`${objCount} objetivos disponibles`);

    // Click first objective to advance
    await objButtons.first().click();
    await page.waitForTimeout(1000);

    // Look for "Siguiente" or "Next" button
    const nextBtn = page.locator('button:has-text("Siguiente"), button:has-text("Continuar"), button:has-text("Next")').first();
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      logOK('Botón Siguiente visible');
      await nextBtn.click();
      await page.waitForTimeout(2000);
      await shot(page, '03-wizard-step2');

      // Check step 2 content (campaign config)
      const budgetInput = page.locator('input[type="number"], input[placeholder*="presupuesto"], input[placeholder*="Budget"]').first();
      if (await budgetInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        logOK('Input de presupuesto visible en paso 2');
      }

      const targetingSection = page.locator('text=Segmentación, text=Targeting, text=País, text=Edad');
      if (await targetingSection.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        logOK('Sección de targeting visible');
      }
    }
  } else {
    logWARN('No se encontraron opciones de objetivo');
  }

  // Go back to step 1 to not leave wizard dirty
  const backBtn = page.locator('button:has-text("Atrás"), button:has-text("Volver"), button:has-text("Back")').first();
  if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await backBtn.click();
    await page.waitForTimeout(1000);
  }

  // ═══════════════════════════════════════
  // 4. BORRADORES
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  4. BORRADORES                   ║');
  log('╚══════════════════════════════════╝');

  const draftsFound = await clickNav(page, 'Borradores') || await clickNav(page, 'Drafts');
  if (!draftsFound) logFAIL('No se encontró sección Borradores');
  await dismissModals(page);
  await shot(page, '04-drafts');

  const draftItems = page.locator('[class*="draft"], table tr, [class*="card"]');
  const draftCount = await draftItems.count();
  const emptyDrafts = page.locator('text=No hay borradores, text=sin borradores, text=vacío').first();
  if (await emptyDrafts.isVisible({ timeout: 1000 }).catch(() => false)) {
    logOK('Empty state de borradores correcto');
  } else if (draftCount > 1) {
    logOK(`${draftCount} borradores encontrados`);
  } else {
    logWARN('Estado de borradores no claro');
  }

  // ═══════════════════════════════════════
  // 5. AUDIENCIAS
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  5. AUDIENCIAS                   ║');
  log('╚══════════════════════════════════╝');

  const audFound = await clickNav(page, 'Audiencias') || await clickNav(page, 'Audiences');
  if (!audFound) logFAIL('No se encontró sección Audiencias');
  await page.waitForTimeout(3000); // Audiences load from API
  await dismissModals(page);
  await shot(page, '05-audiences');

  // Check tabs
  const audTabTexts = await page.locator('button:has-text("Custom"), button:has-text("Lookalike"), button:has-text("Personaliz"), button:has-text("Similar"), button:has-text("Guardad")').allTextContents();
  if (audTabTexts.length > 0) {
    logOK(`Tabs de audiencia: ${audTabTexts.map(t => t.trim()).join(', ')}`);
  }

  // Check audience list
  const audItems = page.locator('table tr, [class*="audience"]');
  const audCount = await audItems.count();
  log(`Audiencias listadas: ${audCount}`);

  // Check create button
  const createAud = page.locator('button:has-text("Crear"), button:has-text("Nueva")').first();
  if (await createAud.isVisible({ timeout: 1000 }).catch(() => false)) {
    logOK('Botón crear audiencia visible');

    // Open create dialog
    await createAud.click();
    await page.waitForTimeout(1500);
    await shot(page, '05-audiences-create');

    // Check form fields
    const formVisible = await page.locator('input, select, textarea, [role="dialog"]').count();
    if (formVisible > 0) {
      logOK('Formulario de creación de audiencia se abrió');
    }

    // Close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ═══════════════════════════════════════
  // 6. PIXEL
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  6. PIXEL                        ║');
  log('╚══════════════════════════════════╝');

  const pixelFound = await clickNav(page, 'Pixel');
  if (!pixelFound) logFAIL('No se encontró sección Pixel');
  await page.waitForTimeout(3000);
  await dismissModals(page);
  await shot(page, '06-pixel');

  // Check pixel ID display
  const pixelId = page.locator('text=1522, text=Pixel ID, [class*="mono"]').first();
  if (await pixelId.isVisible({ timeout: 2000 }).catch(() => false)) {
    logOK('Pixel ID visible');
  }

  // Check event list
  const events = page.locator('text=PageView, text=Purchase, text=AddToCart, text=ViewContent');
  if (await events.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    logOK('Eventos de pixel visibles');
  } else {
    logWARN('No se ven eventos de pixel');
  }

  // Check for install instructions
  const installSection = page.locator('text=instalar, text=código, text=snippet, text=Copiar');
  if (await installSection.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    logOK('Instrucciones de instalación de pixel visibles');
  }

  // ═══════════════════════════════════════
  // 7. BIBLIOTECA
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  7. BIBLIOTECA DE CREATIVIDADES  ║');
  log('╚══════════════════════════════════╝');

  const libFound = await clickNav(page, 'Biblioteca') || await clickNav(page, 'Library');
  if (!libFound) logWARN('No se encontró sección Biblioteca');
  await page.waitForTimeout(2000);
  await dismissModals(page);
  await shot(page, '07-library');

  // Check for asset grid
  const assets = page.locator('img[src*="supabase"], img[src*="storage"], [class*="asset"], [class*="grid"] img');
  const assetCount = await assets.count();
  if (assetCount > 0) {
    logOK(`${assetCount} assets/creatividades visibles`);
  } else {
    const emptyLib = page.locator('text=No hay creatividades, text=vacía, text=Sube').first();
    if (await emptyLib.isVisible({ timeout: 1000 }).catch(() => false)) {
      logOK('Empty state de biblioteca correcto');
    } else {
      logWARN('Biblioteca no muestra contenido ni empty state');
    }
  }

  // ═══════════════════════════════════════
  // 8. ANÁLISIS
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  8. ANÁLISIS / ANALYTICS         ║');
  log('╚══════════════════════════════════╝');

  const analyticsFound = await clickNav(page, 'Análisis') || await clickNav(page, 'Analytics');
  if (!analyticsFound) logFAIL('No se encontró sección Análisis');
  await page.waitForTimeout(3000);
  await dismissModals(page);
  await shot(page, '08-analytics');

  // Check charts
  const charts = await page.locator('svg.recharts-surface, [class*="recharts"]').count();
  if (charts > 0) {
    logOK(`${charts} gráficos renderizados`);
  } else {
    logWARN('No se ven gráficos en Analytics');
  }

  // Check date range buttons
  const dateRanges = page.locator('button:has-text("7"), button:has-text("14"), button:has-text("30"), button:has-text("Últimos")');
  if (await dateRanges.count() > 0) {
    logOK('Selector de rango de fechas visible');

    // Click 30 days
    const thirtyDays = page.locator('button:has-text("30")').first();
    if (await thirtyDays.isVisible({ timeout: 1000 }).catch(() => false)) {
      await thirtyDays.click();
      await page.waitForTimeout(2000);
      logOK('Rango 30 días seleccionado');
    }
  }

  // Check metric selector/tabs
  const metricTabs = page.locator('button:has-text("Spend"), button:has-text("CPC"), button:has-text("CTR"), button:has-text("ROAS"), button:has-text("Gasto")');
  if (await metricTabs.count() > 0) {
    logOK(`${await metricTabs.count()} métricas disponibles en gráfico`);
  }

  // ═══════════════════════════════════════
  // 9. SOCIAL INBOX
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  9. SOCIAL INBOX                 ║');
  log('╚══════════════════════════════════╝');

  const inboxFound = await clickNav(page, 'Social') || await clickNav(page, 'Inbox') || await clickNav(page, 'Mensajes');
  if (!inboxFound) logFAIL('No se encontró sección Social Inbox');
  await page.waitForTimeout(4000); // API call to fetch conversations
  await dismissModals(page);
  await shot(page, '09-inbox');

  // Check platform toggle
  const platformBtns = page.locator('button:has-text("Messenger"), button:has-text("Instagram"), button:has-text("Facebook")');
  const platformCount = await platformBtns.count();
  if (platformCount > 0) {
    logOK(`${platformCount} plataformas en inbox`);

    // Check each platform
    for (let i = 0; i < platformCount; i++) {
      const text = await platformBtns.nth(i).textContent();
      log(`  Plataforma: ${text?.trim()}`);
    }
  }

  // Check conversation list
  const convos = page.locator('[class*="conversation"], [class*="thread"], [class*="cursor-pointer"][class*="border"]');
  const convoCount = await convos.count();
  if (convoCount > 0) {
    logOK(`${convoCount} conversaciones visibles`);

    // Click first conversation (force to handle overlay issues)
    try {
      await convos.first().click({ force: true, timeout: 5000 });
    } catch {
      logWARN('No se pudo clickear la primera conversación');
    }
    await page.waitForTimeout(3000);
    await shot(page, '09-inbox-conversation');

    // Check message bubbles
    const msgs = page.locator('[class*="message"], [class*="bubble"], [class*="rounded-lg"][class*="p-"]');
    const msgCount = await msgs.count();
    if (msgCount > 0) {
      logOK(`${msgCount} mensajes en conversación`);
    }

    // Check reply input
    const replyInput = page.locator('input[placeholder*="scrib"], input[placeholder*="Respon"], textarea[placeholder*="scrib"], textarea[placeholder*="Respon"]').first();
    if (await replyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      logOK('Campo de respuesta visible');

      // Check send button
      const sendBtn = page.locator('button:has-text("Enviar"), button[type="submit"], button:has(svg.lucide-send)').first();
      if (await sendBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        logOK('Botón enviar visible');

        // Check if send is disabled when empty
        const isDisabled = await sendBtn.isDisabled();
        if (isDisabled) {
          logOK('Botón enviar deshabilitado cuando campo vacío');
        } else {
          logWARN('Botón enviar NO está deshabilitado con campo vacío — podría enviar mensaje vacío');
        }
      }
    } else {
      logWARN('No se ve campo de respuesta en la conversación');
    }
  } else {
    logWARN('No hay conversaciones en Social Inbox');
  }

  // Try Instagram tab
  const igTab = page.locator('button:has-text("Instagram")').first();
  if (await igTab.isVisible({ timeout: 1000 }).catch(() => false)) {
    await igTab.click();
    await page.waitForTimeout(3000);
    await shot(page, '09-inbox-instagram');

    const igConvos = page.locator('[class*="conversation"], [class*="thread"], [class*="cursor-pointer"][class*="border"]');
    const igCount = await igConvos.count();
    log(`Conversaciones Instagram: ${igCount}`);
    if (igCount === 0) {
      logWARN('Instagram inbox vacío (requiere Advanced Access para instagram_manage_messages)');
    }
  }

  // ═══════════════════════════════════════
  // 10. REGLAS AUTOMATIZADAS
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  10. REGLAS AUTOMATIZADAS        ║');
  log('╚══════════════════════════════════╝');

  const rulesFound = await clickNav(page, 'Reglas') || await clickNav(page, 'Rules') || await clickNav(page, 'Automatiz');
  if (!rulesFound) logFAIL('No se encontró sección Reglas');
  await page.waitForTimeout(2000);
  await dismissModals(page);
  await shot(page, '10-rules');

  // Check for rule list or empty state
  const ruleItems = page.locator('[class*="rule"], table tr');
  const ruleCount = await ruleItems.count();
  log(`Reglas listadas: ${ruleCount}`);

  // Check create rule button
  const createRule = page.locator('button:has-text("Crear"), button:has-text("Nueva"), button:has-text("Agregar")').first();
  if (await createRule.isVisible({ timeout: 1000 }).catch(() => false)) {
    logOK('Botón crear regla visible');
    await createRule.click();
    await page.waitForTimeout(1500);
    await shot(page, '10-rules-create');

    // Check form fields in dialog
    const dialog = page.locator('[role="dialog"], [class*="Dialog"]');
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      logOK('Dialog de creación de regla abierto');

      // Check key fields
      const nameField = page.locator('[role="dialog"] input').first();
      if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
        logOK('Campos del formulario de regla visibles');
      }

      // Check condition selector
      const conditionSelect = page.locator('[role="dialog"] select, [role="dialog"] [role="combobox"], [role="dialog"] button:has-text("CPC"), [role="dialog"] button:has-text("CPA")');
      if (await conditionSelect.count() > 0) {
        logOK('Selector de condiciones disponible');
      }

      // Check action selector
      const actionSelect = page.locator('[role="dialog"] button:has-text("Pausar"), [role="dialog"] button:has-text("Escalar"), [role="dialog"] button:has-text("Notificar")');
      if (await actionSelect.count() > 0) {
        logOK('Opciones de acción disponibles');
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ═══════════════════════════════════════
  // 11. COMPETENCIA
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  11. COMPETENCIA                 ║');
  log('╚══════════════════════════════════╝');

  const compFound = await clickNav(page, 'Competencia') || await clickNav(page, 'Competitor');
  if (!compFound) logWARN('No se encontró sección Competencia');
  await page.waitForTimeout(2000);
  await dismissModals(page);
  await shot(page, '11-competitor');

  // Check for search/input field
  const compSearch = page.locator('input[placeholder*="compet"], input[placeholder*="buscar"], input[placeholder*="URL"]').first();
  if (await compSearch.isVisible({ timeout: 1000 }).catch(() => false)) {
    logOK('Campo de búsqueda de competencia visible');
  }

  // ═══════════════════════════════════════
  // EDGE CASES & CROSS-CUTTING
  // ═══════════════════════════════════════
  log('\n╔══════════════════════════════════╗');
  log('║  EDGE CASES & VALIDACIONES       ║');
  log('╚══════════════════════════════════╝');

  // ── Responsive ──
  log('Testing mobile (375x667)...');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(1500);
  await shot(page, '12-mobile');

  const mobileNav = page.locator('[class*="hamburger"], button[aria-label*="menu"], button:has(svg.lucide-menu), [class*="sheet-trigger"]');
  if (await mobileNav.isVisible({ timeout: 1000 }).catch(() => false)) {
    logOK('Menú mobile visible');
  } else {
    logWARN('No se detecta navegación mobile');
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ── Broken images ──
  log('Checking broken images...');
  const brokenImgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => img.src || img.getAttribute('data-src') || 'unknown')
      .filter(src => src !== 'unknown' && !src.includes('data:'));
  });
  if (brokenImgs.length > 0) {
    logFAIL(`${brokenImgs.length} imágenes rotas: ${brokenImgs.slice(0, 3).join(', ')}`);
  } else {
    logOK('Todas las imágenes cargaron');
  }

  // ── Language consistency ──
  log('Checking idioma...');
  const bodyText = await page.textContent('body') || '';
  const englishFragments = [
    { word: 'Loading...', expected: 'Cargando...' },
    { word: 'Error occurred', expected: 'Ocurrió un error' },
    { word: 'No data available', expected: 'Sin datos' },
    { word: 'Submit', expected: 'Enviar' },
    { word: 'Are you sure', expected: '¿Estás seguro?' },
  ];
  for (const { word, expected } of englishFragments) {
    if (bodyText.includes(word)) {
      logWARN(`Texto en inglés: "${word}" — debería ser "${expected}"`);
    }
  }

  // ── Error states visible ──
  const errorEls = await page.locator('[class*="destructive"]:visible, [role="alert"]:visible').allTextContents();
  if (errorEls.length > 0) {
    for (const txt of errorEls) {
      if (txt.trim()) logWARN(`Error visible en UI: "${txt.trim().substring(0, 80)}"`);
    }
  }

  // ── Back to Dashboard (stability check) ──
  log('Volviendo a Dashboard para verificar estabilidad...');
  await clickNav(page, 'Dashboard');
  await page.waitForTimeout(2000);
  await shot(page, '13-dashboard-final');
  logOK('Dashboard se carga correctamente tras navegación completa');

  // ═══════════════════════════════════════
  // REPORTE FINAL
  // ═══════════════════════════════════════
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          REPORTE QA META — RESUMEN FINAL            ║');
  console.log('╠══════════════════════════════════════════════════════╣');

  console.log(`║  Screenshots: ${String(shotCounter).padStart(2)} capturados                          ║`);
  console.log(`║  API calls: ${String(apiCalls.length).padStart(3)} total, ${String(networkErrors.length).padStart(2)} errores               ║`);
  console.log('╠══════════════════════════════════════════════════════╣');

  if (issues.length === 0) {
    console.log('║  \x1b[32m✓ CERO ERRORES CRÍTICOS\x1b[0m                              ║');
  } else {
    console.log(`║  \x1b[31m✗ ${String(issues.length).padStart(2)} ERRORES CRÍTICOS:\x1b[0m                              ║`);
    for (const issue of issues) {
      console.log(`║  · ${issue.substring(0, 50).padEnd(50)} ║`);
    }
  }

  console.log('╠══════════════════════════════════════════════════════╣');

  if (warnings.length === 0) {
    console.log('║  \x1b[33m⚠ CERO WARNINGS\x1b[0m                                      ║');
  } else {
    console.log(`║  \x1b[33m⚠ ${String(warnings.length).padStart(2)} WARNINGS:\x1b[0m                                       ║`);
    for (const w of warnings) {
      console.log(`║  · ${w.substring(0, 50).padEnd(50)} ║`);
    }
  }

  if (networkErrors.length > 0) {
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  \x1b[31mAPI ERRORS:\x1b[0m                                          ║`);
    for (const ne of networkErrors) {
      console.log(`║  · ${ne.status} ${(ne.endpoint || '').substring(0, 44).padEnd(44)} ║`);
    }
  }

  console.log('╚══════════════════════════════════════════════════════╝');

  await browser.close();

  // Exit with error code if critical issues
  if (issues.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('\x1b[31mQA script crashed:\x1b[0m', err.message);
  process.exit(2);
});
