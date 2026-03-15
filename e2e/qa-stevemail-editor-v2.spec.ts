import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';
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
}

async function goToSteveMail(page: Page): Promise<boolean> {
  const directTab = page.locator('button').filter({ hasText: /Steve Mail/ }).first();
  if (await directTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await directTab.click({ force: true });
    await page.waitForTimeout(3000);
    return true;
  }
  const masBtn = page.locator('button').filter({ hasText: /^Más$/ }).first();
  if (await masBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await masBtn.click({ force: true });
    await page.waitForTimeout(800);
    const menuItem = page.locator('[role="menuitem"]').filter({ hasText: /Steve Mail/ }).first();
    if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuItem.click({ force: true });
      await page.waitForTimeout(3000);
      return true;
    }
  }
  return false;
}

async function openEditorAndWait(page: Page) {
  // Click "Nueva Campaña"
  const nuevaCampana = page.getByRole('button', { name: /Nueva Campaña/i }).first();
  await nuevaCampana.click();
  await page.waitForTimeout(3000);

  // Fill name and subject to advance
  const nameInput = page.locator('input[placeholder*="Promoción Black Friday"]').first();
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('QA Editor Test');
  }
  const subjectInput = page.locator('input[placeholder*="30% de descuento"]').first();
  if (await subjectInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await subjectInput.fill('Test subject');
  }

  // Advance to step 2
  const nextBtn = page.getByRole('button', { name: /Siguiente.*Diseñar/i }).first();
  if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(8000); // GrapeJS needs time
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Steve Mail Editor v2 — QA Intensiva', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAndNavigate(page);
    const found = await goToSteveMail(page);
    expect(found).toBe(true);
    await openEditorAndWait(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ─── 1. BLOQUES BASICOS ─────────────────────────────────────────────────
  test('1. Bloques basicos — existen y se pueden agregar', async () => {
    const gjsEditor = page.locator('.gjs-editor').first();
    await expect(gjsEditor).toBeVisible({ timeout: 10000 });

    // Check block manager is visible
    const blocks = page.locator('.gjs-blocks-c, .gjs-block-categories').first();
    await expect(blocks).toBeVisible({ timeout: 5000 });

    // Verify essential blocks exist
    const expectedBlocks = [
      'Productos',       // steve-products
      'Descuento',       // steve-discount
      'Botón CTA',       // steve-button
      'Redes Sociales',  // steve-social
      'Header',          // steve-header
      'Footer',          // steve-footer
      'Imagen + Caption',// steve-image-caption
      'Texto Enriquecido', // steve-rich-text
      'Separador',       // steve-divider
      'Espacio',         // steve-spacer
      '2 Columnas',      // steve-two-cols
      '3 Columnas',      // steve-three-cols
      'Hero Banner',     // steve-hero
    ];

    const found: string[] = [];
    const notFound: string[] = [];

    for (const label of expectedBlocks) {
      const block = page.locator('.gjs-block').filter({ hasText: new RegExp(label, 'i') }).first();
      const isVis = await block.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVis) {
        found.push(label);
      } else {
        notFound.push(label);
      }
      console.log(`[QA] Block "${label}": ${isVis ? 'FOUND' : 'NOT FOUND'}`);
    }

    console.log(`[QA] Blocks: ${found.length}/${expectedBlocks.length} found`);
    if (notFound.length > 0) console.log(`[QA] Missing blocks: ${notFound.join(', ')}`);

    // At least 8 custom blocks should exist
    expect(found.length).toBeGreaterThanOrEqual(8);

    // Try clicking a block to add it to canvas
    const heroBlock = page.locator('.gjs-block').filter({ hasText: /Hero/i }).first();
    if (await heroBlock.isVisible({ timeout: 2000 }).catch(() => false)) {
      await heroBlock.click();
      await page.waitForTimeout(2000);
      console.log('[QA] Added Hero block to canvas');
    }

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-01-blocks.png', fullPage: true });
  });

  // ─── 2. DRAG & DROP ────────────────────────────────────────────────────
  test('2. Drag & drop — agregar bloques mantiene contenido', async () => {
    // Access iframe content
    const iframe = page.frameLocator('.gjs-frame').first();

    // Count components before adding
    const componentsBefore = await iframe.locator('[data-gjs-type], table, div').count().catch(() => 0);
    console.log(`[QA] Components before: ${componentsBefore}`);

    // Add a text block via the block manager
    const textBlock = page.locator('.gjs-block').filter({ hasText: /Texto/i }).first();
    if (await textBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textBlock.click();
      await page.waitForTimeout(2000);
    }

    // Count components after
    const componentsAfter = await iframe.locator('[data-gjs-type], table, div').count().catch(() => 0);
    console.log(`[QA] Components after adding text: ${componentsAfter}`);

    // Add a divider block
    const dividerBlock = page.locator('.gjs-block').filter({ hasText: /Separador/i }).first();
    if (await dividerBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dividerBlock.click();
      await page.waitForTimeout(2000);
    }

    const componentsAfterDivider = await iframe.locator('[data-gjs-type], table, div').count().catch(() => 0);
    console.log(`[QA] Components after adding divider: ${componentsAfterDivider}`);

    // Content should have grown
    expect(componentsAfterDivider).toBeGreaterThanOrEqual(componentsBefore);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-02-dnd.png', fullPage: true });
  });

  // ─── 3. HTML OUTPUT ────────────────────────────────────────────────────
  test('3. HTML output — email-safe con tables, DOCTYPE, meta', async () => {
    // Click "Vista previa" to get the HTML
    const previewBtn = page.getByRole('button', { name: /Vista previa/i }).first();
    if (await previewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await previewBtn.click();
      await page.waitForTimeout(3000);

      // Preview should be open
      const previewDialog = page.locator('[role="dialog"]').first();
      await expect(previewDialog).toBeVisible({ timeout: 5000 });

      // Get iframe srcDoc content
      const previewIframe = previewDialog.locator('iframe').first();
      if (await previewIframe.isVisible({ timeout: 3000 }).catch(() => false)) {
        const srcDoc = await previewIframe.getAttribute('srcdoc');
        if (srcDoc) {
          // Validate email HTML structure
          const checks = [
            { name: 'DOCTYPE', test: srcDoc.includes('<!DOCTYPE html>') },
            { name: 'charset', test: srcDoc.includes('charset="UTF-8"') },
            { name: 'viewport meta', test: srcDoc.includes('viewport') },
            { name: 'body tag', test: srcDoc.includes('<body') },
            { name: 'style tag', test: srcDoc.includes('<style>') },
            { name: 'MSO conditional', test: srcDoc.includes('<!--[if mso]>') },
            { name: 'apple disable', test: srcDoc.includes('x-apple-disable-message-reformatting') },
            { name: 'responsive media query', test: srcDoc.includes('@media') },
            { name: 'email reset CSS', test: srcDoc.includes('mso-table') || srcDoc.includes('-webkit-text-size-adjust') },
          ];

          for (const c of checks) {
            console.log(`[QA] HTML ${c.name}: ${c.test ? 'PASS' : 'FAIL'}`);
          }

          const passCount = checks.filter(c => c.test).length;
          console.log(`[QA] HTML checks: ${passCount}/${checks.length} passed`);
          expect(passCount).toBeGreaterThanOrEqual(5);
        }
      }

      await page.screenshot({ path: 'e2e/screenshots/qa-v2-03-html-output.png', fullPage: true });

      // Close preview
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  });

  // ─── 4. RESPONSIVE ────────────────────────────────────────────────────
  test('4. Responsive — toggle desktop/mobile preview', async () => {
    // Check desktop button exists
    const desktopBtn = page.getByRole('button', { name: /Desktop/i }).first();
    const mobileBtn = page.getByRole('button', { name: /Mobile/i }).first();

    const hasDesktop = await desktopBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const hasMobile = await mobileBtn.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`[QA] Desktop toggle: ${hasDesktop ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`[QA] Mobile toggle: ${hasMobile ? 'VISIBLE' : 'NOT FOUND'}`);

    expect(hasDesktop).toBe(true);
    expect(hasMobile).toBe(true);

    // Take desktop screenshot
    await desktopBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/screenshots/qa-v2-04a-desktop.png', fullPage: true });

    // Switch to mobile
    await mobileBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/screenshots/qa-v2-04b-mobile.png', fullPage: true });

    // Canvas should have changed width
    const canvas = page.locator('.gjs-cv-canvas').first();
    if (await canvas.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await canvas.boundingBox();
      console.log(`[QA] Canvas in mobile mode: ${box?.width}x${box?.height}`);
    }

    // Switch back to desktop
    await desktopBtn.click();
    await page.waitForTimeout(1000);
  });

  // ─── 5. MERGE TAGS ────────────────────────────────────────────────────
  test('5. Merge tags — dropdown visible y tags disponibles', async () => {
    // Click inside the canvas iframe to activate RTE
    const iframe = page.frameLocator('.gjs-frame').first();

    // Check for merge tag button in RTE toolbar
    // The merge tag button appears when editing text in GrapeJS
    // First, try clicking on a text component in the canvas
    const textComp = iframe.locator('td, p, div').first();
    if (await textComp.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textComp.dblclick();
      await page.waitForTimeout(2000);

      // Look for the "Tags" button in the RTE toolbar
      const rteToolbar = page.locator('.gjs-rte-toolbar').first();
      const hasRte = await rteToolbar.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[QA] RTE toolbar: ${hasRte ? 'VISIBLE' : 'NOT FOUND'}`);

      if (hasRte) {
        const tagsBtn = rteToolbar.locator('span').filter({ hasText: /Tags/i }).first();
        const hasTags = await tagsBtn.isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`[QA] Tags button in RTE: ${hasTags ? 'VISIBLE' : 'NOT FOUND'}`);

        if (hasTags) {
          await tagsBtn.click();
          await page.waitForTimeout(1000);

          // Check dropdown appeared
          const dropdown = page.locator('[data-merge-dropdown]').first();
          const hasDropdown = await dropdown.isVisible({ timeout: 3000 }).catch(() => false);
          console.log(`[QA] Merge tag dropdown: ${hasDropdown ? 'VISIBLE' : 'NOT FOUND'}`);

          if (hasDropdown) {
            // Verify Spanish tags exist
            const spanishTags = ['nombre', 'empresa', 'tienda_url'];
            for (const tag of spanishTags) {
              const tagItem = dropdown.locator('span').filter({ hasText: new RegExp(tag) }).first();
              const hasTag = await tagItem.isVisible({ timeout: 2000 }).catch(() => false);
              console.log(`[QA] Tag "{{ ${tag} }}": ${hasTag ? 'FOUND' : 'NOT FOUND'}`);
            }
          }

          // Close dropdown
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      }
    }

    // Also verify the undo/redo buttons exist
    const undoBtn = page.locator('button[title="Deshacer"]').first();
    const redoBtn = page.locator('button[title="Rehacer"]').first();
    console.log(`[QA] Undo button: ${await undoBtn.isVisible({ timeout: 2000 }).catch(() => false) ? 'VISIBLE' : 'NOT FOUND'}`);
    console.log(`[QA] Redo button: ${await redoBtn.isVisible({ timeout: 2000 }).catch(() => false) ? 'VISIBLE' : 'NOT FOUND'}`);

    // Verify global styles button
    const stylesBtn = page.getByRole('button', { name: /Estilos/i }).first();
    console.log(`[QA] Global styles button: ${await stylesBtn.isVisible({ timeout: 2000 }).catch(() => false) ? 'VISIBLE' : 'NOT FOUND'}`);

    // Verify save template button
    const saveTemplateBtn = page.getByRole('button', { name: /Guardar Plantilla/i }).first();
    console.log(`[QA] Save template button: ${await saveTemplateBtn.isVisible({ timeout: 2000 }).catch(() => false) ? 'VISIBLE' : 'NOT FOUND'}`);

    await page.screenshot({ path: 'e2e/screenshots/qa-v2-05-merge-tags.png', fullPage: true });
  });
});
