import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAndNavigate(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 25000 });
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => {});

  // Dismiss onboarding modal
  for (let attempt = 0; attempt < 5; attempt++) {
    const omitirBtn = page.getByText('Omitir', { exact: true });
    if (await omitirBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await omitirBtn.click({ force: true });
      await page.waitForTimeout(1500);
      continue;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    const modal = page.locator('[role="dialog"], .fixed.inset-0').first();
    if (!(await modal.isVisible({ timeout: 1000 }).catch(() => false))) break;
  }
  await page.waitForTimeout(2000);
  console.log('[MAIL-QA] Login OK');
}

async function goToSteveMail(page: Page): Promise<boolean> {
  // Try direct tab button
  const directTab = page.locator('button').filter({ hasText: /Steve Mail/ }).first();
  if (await directTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await directTab.click({ force: true });
    await page.waitForTimeout(3000);
    console.log('[MAIL-QA] Navigated to Steve Mail (direct)');
    return true;
  }

  // Try via "Más" dropdown
  const masBtn = page.locator('button').filter({ hasText: /^Más$/ }).first();
  if (await masBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await masBtn.click({ force: true });
    await page.waitForTimeout(800);
    const menuItem = page.locator('[role="menuitem"]').filter({ hasText: /Steve Mail/ }).first();
    if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuItem.click({ force: true });
      await page.waitForTimeout(3000);
      console.log('[MAIL-QA] Navigated to Steve Mail via Más');
      return true;
    }
  }

  console.log('[MAIL-QA] Could not find Steve Mail tab');
  return false;
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/steve-mail-${name}.png`, fullPage: true });
  console.log(`[MAIL-QA] Screenshot: steve-mail-${name}.png`);
}

/** Click a Steve Mail inner tab by role */
async function clickTab(page: Page, tabName: string) {
  const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') }).first();
  if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tab.click();
  } else {
    // Fallback: click by text inside TabsTrigger
    await page.locator('[role="tablist"] button, [data-radix-collection-item]')
      .filter({ hasText: new RegExp(tabName) }).first().click();
  }
  await page.waitForTimeout(3000);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Steve Mail — QA Completo', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAndNavigate(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ─── 1. Navigate to Steve Mail ───────────────────────────────────────────
  test('1. Navegar a Steve Mail — tabs visibles', async () => {
    const found = await goToSteveMail(page);
    expect(found).toBe(true);
    await page.waitForTimeout(2000);

    // Verify the 5 tabs exist using role selectors (unique)
    const tabList = page.locator('[role="tablist"]').first();
    await expect(tabList).toBeVisible({ timeout: 10000 });

    // Check each tab trigger exists
    const tabNames = ['Campañas', 'Contactos', 'Automatizaciones', 'Formularios', 'Rendimiento'];
    for (const name of tabNames) {
      const tab = tabList.locator('button').filter({ hasText: new RegExp(name) }).first();
      const isVis = await tab.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[MAIL-QA] Tab "${name}": ${isVis ? 'VISIBLE' : 'NOT FOUND'}`);
      expect(isVis).toBe(true);
    }

    // Verify removed tabs don't exist
    for (const removed of ['Segmentos', 'Alertas']) {
      const tab = tabList.locator('button').filter({ hasText: new RegExp(`^${removed}$`) });
      await expect(tab).not.toBeVisible();
    }

    // Verify header
    await expect(page.locator('h2').filter({ hasText: /Steve Mail/ })).toBeVisible();

    // Verify gear settings icon
    const gearBtn = page.locator('button[title*="Configuración"], button[title*="dominio"]').first();
    const isGearVisible = await gearBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Settings gear: ${isGearVisible ? 'VISIBLE' : 'NOT FOUND'}`);

    await screenshot(page, '01-tabs-overview');
  });

  // ─── 2. Campañas Tab ───────────────────────────────────────────────────
  test('2. Tab Campañas — lista y botón crear', async () => {
    await clickTab(page, 'Campañas');

    // Should see title and CTA
    await expect(page.getByRole('heading', { name: /Campañas de Email/i })).toBeVisible({ timeout: 10000 });
    const nuevaCampana = page.getByRole('button', { name: /Nueva Campaña/i });
    await expect(nuevaCampana).toBeVisible();

    // UX Check: verify descriptive subtitle exists
    const subtitle = page.getByText(/Crea y envía campañas/i);
    await expect(subtitle).toBeVisible();

    // UX Check: empty state has clear CTA
    const emptyState = page.getByText(/No hay campañas todavía/i);
    if (await emptyState.isVisible({ timeout: 3000 }).catch(() => false)) {
      const crearBtn = page.getByRole('button', { name: /Crear Campaña/i });
      await expect(crearBtn).toBeVisible();
      console.log('[MAIL-QA] Empty state: OK — clear CTA visible');
    }

    await screenshot(page, '02-campanas-list');
  });

  // ─── 3. Crear campaña — Step 1 (Datos) ────────────────────────────────
  test('3. Crear campaña — wizard step 1 y avanzar al editor', async () => {
    const nuevaCampana = page.getByRole('button', { name: /Nueva Campaña/i }).first();
    await nuevaCampana.click();
    await page.waitForTimeout(3000);

    await screenshot(page, '03-campana-step1');

    // UX Check: wizard step indicator visible (1 Datos — 2 Diseño — 3 Audiencia — 4 Revisar)
    const stepIndicator = page.getByText('Datos').first();
    const hasSteps = await stepIndicator.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Wizard step indicator: ${hasSteps ? 'VISIBLE' : 'NOT FOUND'}`);

    // UX Check: campaign name input (placeholder: "Ej: Promoción Black Friday")
    const nameInput = page.locator('input[placeholder*="Promoción Black Friday"]').first();
    const hasName = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MAIL-QA] Campaign name input: ${hasName ? 'VISIBLE' : 'NOT FOUND'}`);

    // UX Check: subject input (placeholder: "Ej: 30% de descuento solo hoy")
    const subjectInput = page.locator('input[placeholder*="30% de descuento"]').first();
    const hasSubject = await subjectInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Subject input: ${hasSubject ? 'VISIBLE' : 'NOT FOUND'}`);

    // UX Check: AI generation section
    const aiSection = page.getByText('Generar con Steve AI');
    const hasAI = await aiSection.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] AI generation section: ${hasAI ? 'VISIBLE' : 'NOT FOUND'}`);

    // UX Check: "Siguiente: Diseñar Email" button
    const nextBtn = page.getByRole('button', { name: /Siguiente.*Diseñar/i }).first();
    const hasNext = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Next button: ${hasNext ? 'VISIBLE' : 'NOT FOUND'}`);

    // Fill in required fields to advance
    if (hasName) await nameInput.fill('Test QA Campaign');
    if (hasSubject) await subjectInput.fill('30% de descuento hoy');

    // Advance to step 2 (editor)
    if (hasNext) {
      await nextBtn.click();
      await page.waitForTimeout(6000); // GrapeJS needs time to load
      await screenshot(page, '03b-campana-step2-editor');
    }
  });

  // ─── 4. Email Editor UX Evaluation ────────────────────────────────────
  test('4. Editor de email — evaluación UX completa', async () => {
    // Capture browser console logs from the editor
    page.on('console', msg => {
      if (msg.text().includes('[SteveMailEditor]')) {
        console.log(`[MAIL-QA] BROWSER: ${msg.text()}`);
      }
    });

    // We should be in step 2 (design) after test 3.
    // Wait extra for GrapeJS to initialize
    await page.waitForTimeout(5000);

    await screenshot(page, '04-editor-full');

    // ── GrapeJS Canvas (inside iframe or div) ──
    const gjsFrame = page.locator('.gjs-frame').first();
    const gjsEditor = page.locator('.gjs-editor').first();
    const gjsCanvas = page.locator('.gjs-cv-canvas').first();
    const hasFrame = await gjsFrame.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEditor = await gjsEditor.isVisible({ timeout: 3000 }).catch(() => false);
    const hasCanvas = await gjsCanvas.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] GrapeJS frame: ${hasFrame ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`[MAIL-QA] GrapeJS editor: ${hasEditor ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`[MAIL-QA] GrapeJS canvas: ${hasCanvas ? 'VISIBLE' : 'NOT FOUND'}`);

    // If editor is not visible, check what IS visible on screen
    if (!hasEditor && !hasFrame) {
      console.log('[MAIL-QA] WARNING: GrapeJS not loaded! Checking page state...');
      // Check if we're stuck on step 1
      const step1 = page.getByText('Paso 1: Datos de la campaña');
      if (await step1.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('[MAIL-QA] Still on step 1 — wizard did not advance');
      }
      // Check for loading state
      const loader = page.locator('.animate-spin').first();
      if (await loader.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('[MAIL-QA] Loading spinner visible — editor may be initializing');
        await page.waitForTimeout(8000);
      }
      // Check what divs are on screen
      const body = await page.locator('body').innerHTML();
      const hasGjs = body.includes('gjs-');
      console.log(`[MAIL-QA] Page HTML contains gjs- classes: ${hasGjs}`);
    }

    // ── GrapeJS Panels (toolbar/sidebar) ──
    const panels = page.locator('.gjs-pn-panels, .gjs-pn-panel').first();
    const hasPanels = await panels.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] GrapeJS panels: ${hasPanels ? 'VISIBLE' : 'NOT FOUND'}`);

    // ── Block manager ──
    const blocks = page.locator('.gjs-blocks-c, .gjs-block-categories, .gjs-block').first();
    const hasBlocks = await blocks.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Block manager: ${hasBlocks ? 'VISIBLE' : 'NOT FOUND'}`);

    // ── Custom Steve blocks ──
    if (hasBlocks) {
      const steveBlocks = ['Productos', 'Descuento', 'Countdown', 'Botón CTA'];
      for (const label of steveBlocks) {
        const block = page.locator('.gjs-block').filter({ hasText: new RegExp(label, 'i') }).first();
        const found = await block.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`[MAIL-QA] Custom block "${label}": ${found ? 'FOUND' : 'NOT FOUND'}`);
      }
    }

    // ── Style manager ──
    const styleManager = page.locator('.gjs-sm-sectors, .gjs-sm-sector').first();
    const hasStyles = await styleManager.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Style manager: ${hasStyles ? 'VISIBLE' : 'NOT FOUND'}`);

    // ── Top bar buttons ──
    const topBar = page.locator('.border-b.bg-muted, .shrink-0').first();

    const saveBtn = page.getByRole('button', { name: /Guardar/i }).first();
    const hasSave = await saveBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Save button: ${hasSave ? 'VISIBLE' : 'NOT FOUND'}`);

    const backBtn = page.locator('button').filter({ hasText: /Volver/ }).first();
    const hasBack = await backBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Back/Volver button: ${hasBack ? 'VISIBLE' : 'NOT FOUND'}`);

    const templatesBtn = page.getByRole('button', { name: /Plantillas/i }).first();
    const hasTemplates = await templatesBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Templates button: ${hasTemplates ? 'VISIBLE' : 'NOT FOUND'}`);

    const blocksBtn = page.getByRole('button', { name: /Bloques/i }).first();
    const hasBlocksBtn = await blocksBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Blocks button: ${hasBlocksBtn ? 'VISIBLE' : 'NOT FOUND'}`);

    const previewBtn = page.getByRole('button', { name: /Vista previa/i }).first();
    const hasPreview = await previewBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Preview button: ${hasPreview ? 'VISIBLE' : 'NOT FOUND'}`);

    const nextStepBtn = page.getByRole('button', { name: /Siguiente/i }).first();
    const hasNext = await nextStepBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Next step button: ${hasNext ? 'VISIBLE' : 'NOT FOUND'}`);

    // ── Editor dimensions check ──
    if (hasFrame || hasCanvas || hasEditor) {
      // Log all relevant element dimensions for debugging
      const dims = await page.evaluate(() => {
        const results: Record<string, string> = {};
        const els = [
          '.gjs-editor', '.gjs-cv-canvas', '.gjs-frame-wrapper',
          '.gjs-frame', '.gjs-pn-views', '.gjs-pn-views-container'
        ];
        for (const sel of els) {
          const el = document.querySelector(sel) as HTMLElement;
          if (el) {
            const r = el.getBoundingClientRect();
            results[sel] = `${Math.round(r.width)}x${Math.round(r.height)} style=[${el.style.cssText.substring(0, 80)}]`;
          } else {
            results[sel] = 'NOT FOUND';
          }
        }
        // Also check the container
        const container = document.querySelector('.gjs-editor')?.parentElement;
        if (container) {
          const cr = container.getBoundingClientRect();
          results['container'] = `${Math.round(cr.width)}x${Math.round(cr.height)}`;
        }
        return results;
      });
      for (const [sel, dim] of Object.entries(dims)) {
        console.log(`[MAIL-QA] DOM ${sel}: ${dim}`);
      }

      const box = hasFrame ? await gjsFrame.boundingBox() : null;
      if (box) {
        console.log(`[MAIL-QA] Editor iframe: ${Math.round(box.width)}x${Math.round(box.height)}`);
        if (box.width < 300) console.log('[MAIL-QA] FAIL: Editor too narrow (<300px)');
        if (box.height < 300) console.log('[MAIL-QA] FAIL: Editor too short (<300px)');
      }
    }

    // ── Theme check ──
    const themedEl = page.locator('.gjs-one-bg, .gjs-two-color').first();
    const hasTheme = await themedEl.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Editor theme CSS: ${hasTheme ? 'APPLIED' : 'NOT APPLIED'}`);

    await screenshot(page, '04b-editor-panels');

    // ── Navigate back to list ──
    // First dismiss any open dialogs/overlays
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1000);

    // Click Volver with force to bypass any remaining overlays
    const volverBtn = page.locator('button').filter({ hasText: /Volver/ }).first();
    if (await volverBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await volverBtn.click({ force: true });
      await page.waitForTimeout(2000);
    }

    // If still in editor, try again
    const volverBtn2 = page.locator('button').filter({ hasText: /Volver|Cancelar/ }).first();
    if (await volverBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await volverBtn2.click({ force: true });
      await page.waitForTimeout(2000);
    }
  });

  // ─── 5. Contactos Tab ─────────────────────────────────────────────────
  test('5. Tab Contactos — lista de suscriptores', async () => {
    await clickTab(page, 'Contactos');

    // Stats cards
    const totalContactos = page.getByText(/Total contactos/i);
    await expect(totalContactos).toBeVisible({ timeout: 10000 });

    // Search bar
    const search = page.locator('input[placeholder*="Buscar"]').first();
    await expect(search).toBeVisible();

    // Import button (appears in both toolbar and empty state)
    const importBtn = page.getByRole('button', { name: /Importar.*Shopify/i }).first();
    await expect(importBtn).toBeVisible();

    // Table headers
    const headers = ['Email', 'Nombre', 'Estado', 'Fuente'];
    for (const h of headers) {
      const header = page.locator('th, [role="columnheader"]').filter({ hasText: h }).first();
      const vis = await header.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[MAIL-QA] Column "${h}": ${vis ? 'VISIBLE' : 'NOT FOUND'}`);
    }

    // Status filter dropdown
    const statusFilter = page.locator('select, [role="combobox"]').filter({ hasText: /Todos/i }).first();
    const hasFilter = await statusFilter.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Status filter: ${hasFilter ? 'VISIBLE' : 'NOT FOUND'}`);

    await screenshot(page, '05-contactos');
  });

  // ─── 6. Automatizaciones Tab ──────────────────────────────────────────
  test('6. Tab Automatizaciones — lista y crear', async () => {
    await clickTab(page, 'Automatizaciones');

    // Title
    const title = page.getByRole('heading', { name: /Automatizaciones/i }).first();
    const hasTitle = await title.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[MAIL-QA] Automatizaciones title: ${hasTitle ? 'VISIBLE' : 'NOT FOUND'}`);

    // CTA button
    const nuevaAuto = page.getByRole('button', { name: /Nueva Automatización/i });
    await expect(nuevaAuto).toBeVisible({ timeout: 5000 });

    // UX Check: descriptive subtitle
    const subtitle = page.getByText(/Envía emails automáticamente según/i);
    const hasSub = await subtitle.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Descriptive subtitle: ${hasSub ? 'VISIBLE' : 'NOT FOUND'}`);

    // UX Check: empty state
    const emptyMsg = page.getByText(/automatizaciones envían emails automáticamente/i);
    if (await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[MAIL-QA] Empty state: OK');
      const crearBtn = page.getByRole('button', { name: /Crear automatización/i });
      await expect(crearBtn).toBeVisible();
    }

    // Try opening trigger picker
    await nuevaAuto.click();
    await page.waitForTimeout(2000);

    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await screenshot(page, '06b-trigger-picker');

      // UX Check: all 6 triggers visible
      const triggers = ['Carrito abandonado', 'Bienvenida', 'Nuevo cliente', 'Primera compra', 'Post-compra', 'Recuperar cliente'];
      for (const t of triggers) {
        const trig = dialog.getByText(new RegExp(t, 'i'));
        const vis = await trig.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`[MAIL-QA] Trigger "${t}": ${vis ? 'VISIBLE' : 'NOT FOUND'}`);
      }

      // UX Check: AI generation buttons
      const aiBtn = dialog.locator('button').filter({ hasText: /Carrito abandonado/i }).first();
      const hasAI = await aiBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[MAIL-QA] AI generation buttons: ${hasAI ? 'VISIBLE' : 'NOT FOUND'}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    await screenshot(page, '06-automatizaciones');
  });

  // ─── 7. Formularios Tab ───────────────────────────────────────────────
  test('7. Tab Formularios — lista y crear', async () => {
    await clickTab(page, 'Formularios');

    const title = page.getByRole('heading', { name: /Formularios/i }).first();
    await expect(title).toBeVisible({ timeout: 5000 });

    const nuevoForm = page.getByRole('button', { name: /Nuevo Formulario/i });
    await expect(nuevoForm).toBeVisible();

    // UX Check: empty state description
    const emptyMsg = page.getByText(/formularios capturan emails/i);
    if (await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[MAIL-QA] Formularios empty state: OK');
    }

    await screenshot(page, '07-formularios');
  });

  // ─── 8. Rendimiento Tab ───────────────────────────────────────────────
  test('8. Tab Rendimiento — métricas', async () => {
    await clickTab(page, 'Rendimiento');

    // Should have metrics or empty state
    const emptyState = page.getByText(/no has enviado campañas/i);
    const metricsCards = page.getByText(/Emails enviados|Tasa de apertura/i).first();

    const hasContent = await emptyState.isVisible({ timeout: 5000 }).catch(() => false) ||
                        await metricsCards.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasContent).toBe(true);
    console.log(`[MAIL-QA] Rendimiento: ${await emptyState.isVisible().catch(() => false) ? 'empty state' : 'metrics visible'}`);

    await screenshot(page, '08-rendimiento');
  });

  // ─── 9. Settings Sheet ────────────────────────────────────────────────
  test('9. Settings gear → Configuración de dominio', async () => {
    // First make sure we're on the right page by clicking a tab
    await clickTab(page, 'Campañas');
    await page.waitForTimeout(1000);

    const settingsBtn = page.locator('button[title*="dominio"], button[title*="Configuración"]').first();
    if (await settingsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(2000);

      // Should see domain config in sheet
      const configTitle = page.getByText(/Configuración/i).first();
      const hasConfig = await configTitle.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`[MAIL-QA] Settings sheet title: ${hasConfig ? 'VISIBLE' : 'NOT FOUND'}`);

      // Domain input
      const domainInput = page.locator('input[placeholder*="tutienda"]').first();
      const hasDomainInput = await domainInput.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[MAIL-QA] Domain input: ${hasDomainInput ? 'VISIBLE' : 'NOT FOUND (domain already set)'}`);

      await screenshot(page, '09-settings-sheet');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    } else {
      console.log('[MAIL-QA] Settings gear not found — trying alternative');
      await screenshot(page, '09-no-settings');
    }
  });

  // ─── 10. Console errors ───────────────────────────────────────────────
  test('10. Sin errores graves en consola', async () => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (err.message.includes('ResizeObserver') || err.message.includes('Script error')) return;
      errors.push(err.message);
    });

    // Navigate through tabs
    await clickTab(page, 'Campañas');
    await clickTab(page, 'Contactos');
    await clickTab(page, 'Automatizaciones');
    await clickTab(page, 'Formularios');
    await clickTab(page, 'Rendimiento');

    console.log(`[MAIL-QA] Console errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ERROR: ${e}`));

    expect(errors.length).toBeLessThan(3);
  });

  // ─── 11. Mobile UX ───────────────────────────────────────────────────
  test('11. Vista mobile — tabs y contenido', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(2000);

    // Tabs should be scrollable
    const tabList = page.locator('[role="tablist"]').first();
    await expect(tabList).toBeVisible({ timeout: 5000 });

    // At least some tabs visible
    const anyTab = tabList.locator('button').first();
    await expect(anyTab).toBeVisible();

    // Content area should be visible
    const content = page.locator('[role="tabpanel"]').first();
    const hasContent = await content.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Mobile content panel: ${hasContent ? 'VISIBLE' : 'NOT FOUND'}`);

    // Steve Mail header
    const header = page.locator('h2').filter({ hasText: /Steve Mail/ });
    const hasHeader = await header.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[MAIL-QA] Mobile header: ${hasHeader ? 'VISIBLE' : 'NOT FOUND'}`);

    // Settings gear on mobile
    const gear = page.locator('button[title*="Configuración"], button[title*="dominio"]').first();
    const hasGear = await gear.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`[MAIL-QA] Mobile settings gear: ${hasGear ? 'VISIBLE' : 'NOT FOUND'}`);

    await screenshot(page, '11-mobile-overview');

    // Try tab by tab on mobile
    await clickTab(page, 'Contactos');
    await screenshot(page, '11b-mobile-contactos');

    await clickTab(page, 'Formularios');
    await screenshot(page, '11c-mobile-formularios');

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(1000);
  });

  // ─── 12. UX Summary Report ────────────────────────────────────────────
  test('12. Reporte UX final', async () => {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  STEVE MAIL — UX/UI QUALITY REPORT');
    console.log('═══════════════════════════════════════════════\n');

    const checks: { area: string; item: string; status: string; note: string }[] = [];

    // Tab navigation
    const tabList = page.locator('[role="tablist"]').first();
    const tabCount = await tabList.locator('button').count();
    checks.push({ area: 'Navigation', item: 'Tab count', status: tabCount === 5 ? 'PASS' : 'FAIL', note: `${tabCount} tabs (expected 5)` });

    // Go to Campañas
    await clickTab(page, 'Campañas');

    // Check button consistency
    const nuevaCampBtn = page.getByRole('button', { name: /Nueva Campaña/i });
    checks.push({ area: 'Campañas', item: 'CTA button', status: await nuevaCampBtn.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Nueva Campaña button' });

    // Check text encoding
    const heading = page.getByRole('heading', { name: /Campañas de Email/i });
    const headingText = await heading.textContent().catch(() => '');
    const hasUnicodeEscapes = headingText?.includes('\\u00');
    checks.push({ area: 'Encoding', item: 'Spanish characters', status: !hasUnicodeEscapes ? 'PASS' : 'FAIL', note: hasUnicodeEscapes ? 'Unicode escapes found!' : 'All accents render correctly' });

    // Contactos
    await clickTab(page, 'Contactos');
    const importBtn = page.getByRole('button', { name: /Importar.*Shopify/i }).first();
    checks.push({ area: 'Contactos', item: 'Import Shopify CTA', status: await importBtn.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Importar de Shopify button' });

    const searchBar = page.locator('input[placeholder*="Buscar"]').first();
    checks.push({ area: 'Contactos', item: 'Search bar', status: await searchBar.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Search input' });

    // Automatizaciones
    await clickTab(page, 'Automatizaciones');
    const autoBtn = page.getByRole('button', { name: /Nueva Automatización/i });
    checks.push({ area: 'Automatizaciones', item: 'CTA button', status: await autoBtn.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Nueva Automatización button' });

    // Formularios
    await clickTab(page, 'Formularios');
    const formBtn = page.getByRole('button', { name: /Nuevo Formulario/i });
    checks.push({ area: 'Formularios', item: 'CTA button', status: await formBtn.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Nuevo Formulario button' });

    // Rendimiento
    await clickTab(page, 'Rendimiento');
    const rendContent = page.getByText(/no has enviado campañas|Emails enviados/i).first();
    checks.push({ area: 'Rendimiento', item: 'Content', status: await rendContent.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Metrics or empty state' });

    // Settings
    const gearBtn = page.locator('button[title*="Configuración"], button[title*="dominio"]').first();
    checks.push({ area: 'Settings', item: 'Gear icon', status: await gearBtn.isVisible().catch(() => false) ? 'PASS' : 'FAIL', note: 'Settings gear button' });

    // Print report
    let passCount = 0;
    let failCount = 0;
    for (const c of checks) {
      const icon = c.status === 'PASS' ? 'OK' : 'FAIL';
      console.log(`  [${icon}] ${c.area} > ${c.item}: ${c.note}`);
      if (c.status === 'PASS') passCount++;
      else failCount++;
    }

    console.log(`\n  TOTAL: ${passCount} passed, ${failCount} failed out of ${checks.length}`);
    console.log('═══════════════════════════════════════════════\n');

    expect(failCount).toBe(0);
  });
});
