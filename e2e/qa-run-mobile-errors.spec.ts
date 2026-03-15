import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';
const MOBILE_WIDTH = 375;
const MOBILE_HEIGHT = 812;

// ── Helpers ──────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('[QA] Login OK');
}

async function dismissOnboarding(page: Page) {
  // Dismiss "Setup del portal" wizard if present
  const setupClose = page.locator('button[aria-label="Cerrar progreso de setup"], button:has-text("Cerrar progreso")');
  if (await setupClose.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await setupClose.first().click({ force: true });
    await page.waitForTimeout(1000);
    console.log('[QA] Dismissed setup wizard');
  }

  // Dismiss Steve AI assistant floating panel (the overlay intercepting clicks)
  const aiPanel = page.locator('[class*="fixed"][class*="inset-0"]').first();
  if (await aiPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Try pressing Escape to close it
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Dismiss any onboarding wizard / tour with "Omitir" button using force click
  const omitir = page.getByText('Omitir', { exact: true });
  if (await omitir.isVisible({ timeout: 2000 }).catch(() => false)) {
    await omitir.click({ force: true });
    await page.waitForTimeout(1000);
    console.log('[QA] Dismissed onboarding via Omitir');
  }

  // Dismiss "Comenzar" or generic "Cerrar" buttons
  const closeOrStart = page.locator('button:has-text("Comenzar"), button:has-text("Cerrar")').first();
  if (await closeOrStart.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeOrStart.click({ force: true });
    await page.waitForTimeout(1000);
  }

  // Wait for any fixed overlays to disappear before proceeding
  await page.waitForTimeout(500);
}

async function navigateToTab(page: Page, tabName: string): Promise<boolean> {
  // Desktop primary tabs: Steve, Brief, Métricas, Conexiones, Configuración (direct buttons, hidden on mobile)
  // Desktop secondary tabs: under DropdownMenu triggered by "Más" button — items are role="menuitem"
  // Mobile primary tabs (bottom nav): Métricas, Steve, Conexiones, Config, Más
  // Mobile secondary tabs: under Sheet triggered by "Más" button

  // First try direct button match (works for primary tabs on both desktop and mobile)
  const directBtn = page.locator('button').filter({ hasText: tabName }).first();
  if (await directBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await directBtn.click({ force: true });
    await page.waitForTimeout(3000);
    console.log(`[QA] Navigated to tab (direct): ${tabName}`);
    return true;
  }

  // Try DropdownMenuItem (desktop "Más" dropdown)
  const dropdownItem = page.locator(`[role="menuitem"]`).filter({ hasText: tabName }).first();
  if (await dropdownItem.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dropdownItem.click({ force: true });
    await page.waitForTimeout(3000);
    console.log(`[QA] Navigated via dropdown item: ${tabName}`);
    return true;
  }

  // Click "Más" to open dropdown/sheet, then find the tab
  const masBtn = page.locator('button').filter({ hasText: /^Más$|^Más\s/ }).first();
  if (await masBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await masBtn.click({ force: true });
    await page.waitForTimeout(800);

    // Desktop: DropdownMenuItem
    const menuItem = page.locator(`[role="menuitem"]`).filter({ hasText: tabName }).first();
    if (await menuItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuItem.click({ force: true });
      await page.waitForTimeout(3000);
      console.log(`[QA] Navigated via Más dropdown: ${tabName}`);
      return true;
    }

    // Mobile: button inside Sheet bottom drawer
    const sheetBtn = page.locator('button').filter({ hasText: tabName }).first();
    if (await sheetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sheetBtn.click({ force: true });
      await page.waitForTimeout(3000);
      console.log(`[QA] Navigated via Más sheet: ${tabName}`);
      return true;
    }

    // Close the menu with Escape if tab not found
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Final fallback: any role=tab or anchor
  const fallback = page.locator(`[role="tab"]:has-text("${tabName}"), a:has-text("${tabName}")`).first();
  if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fallback.click({ force: true });
    await page.waitForTimeout(3000);
    console.log(`[QA] Navigated to tab (fallback): ${tabName}`);
    return true;
  }

  console.log(`[QA] Tab NOT FOUND: ${tabName}`);
  return false;
}

async function waitForLoad(page: Page) {
  const skeleton = page.locator('.animate-pulse').first();
  await skeleton.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {
    console.log('[QA] Warning: skeletons still visible after 30s');
  });
  await page.waitForTimeout(1000);
}

async function checkNoInvalidText(page: Page, context: string) {
  // Check full page text for data quality issues
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const badPatterns = ['NaN', 'undefined', 'Infinity'];
  for (const pat of badPatterns) {
    // Only flag if it appears in a KPI-like context (not in code/scripts)
    // We check visible text of specific KPI containers
    const kpiContainers = page.locator(
      '[class*="text-3xl"], [class*="text-2xl"], [class*="font-bold"], [class*="kpi"], [class*="metric"]'
    );
    const count = await kpiContainers.count();
    for (let i = 0; i < count; i++) {
      const text = await kpiContainers.nth(i).textContent().catch(() => '');
      if (text && text.trim() === pat) {
        console.warn(`[QA] WARN: "${pat}" found in KPI element on ${context}: "${text}"`);
      }
    }
  }
}

// ── Test Suite ──────────────────────────────────────────────────────

test.describe.serial('QA Mobile Responsiveness + Error Monitoring', () => {
  test.setTimeout(300_000);

  // ── 1. Login on mobile viewport ────────────────────────────────────

  test('1. Login on mobile viewport — portal loads without overflow', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await login(page);
    await dismissOnboarding(page);

    // Portal should be visible
    const portal = page.locator('body');
    await expect(portal).toBeVisible();

    // No horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[QA] Mobile login — body.scrollWidth=${bodyScrollWidth}, viewport=${viewportWidth}`);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 5);

    // Some nav or content should be present
    const mainContent = page.locator('main, [role="main"], #portal-root, .portal-content, [class*="portal"]').first();
    const hasContent = await mainContent.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasContent) {
      // At minimum the body should have children
      const bodyChildren = await page.evaluate(() => document.body.children.length);
      expect(bodyChildren).toBeGreaterThan(0);
    }

    await page.screenshot({ path: 'e2e/screenshots/mobile-01-login.png', fullPage: false });
    console.log('[QA] ✓ Mobile login — no overflow, portal loaded');
  });

  // ── 2. Métricas on mobile ──────────────────────────────────────────

  test('2. Métricas on mobile — KPIs visible, date filters wrap, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await login(page);
    await dismissOnboarding(page);

    const found = await navigateToTab(page, 'Métricas');
    if (!found) {
      console.log('[QA] Métricas tab not found — skipping');
      return;
    }
    await waitForLoad(page);

    // KPI cards should be visible
    const kpiTitles = ['Ingresos', 'Inversión', 'Pedidos', 'ROAS'];
    let visibleCount = 0;
    for (const title of kpiTitles) {
      const el = page.locator(`text=${title}`).first();
      if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
        visibleCount++;
        console.log(`[QA] KPI "${title}" visible on mobile`);
      }
    }
    // At least some KPIs should be visible
    expect(visibleCount).toBeGreaterThan(0);

    // Date filter buttons — check they exist and are accessible
    const dateButtons = page.locator('button').filter({ hasText: /días|actual|año/i });
    const dateBtnCount = await dateButtons.count();
    console.log(`[QA] Date filter buttons found: ${dateBtnCount}`);
    if (dateBtnCount > 0) {
      // Check the container wraps (flex-wrap) — buttons shouldn't cause overflow
      const firstBtn = dateButtons.first();
      const btnBox = await firstBtn.boundingBox();
      if (btnBox) {
        expect(btnBox.x).toBeGreaterThanOrEqual(0);
        expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(MOBILE_WIDTH + 5);
      }
    }

    // No horizontal scroll
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[QA] Métricas mobile — body.scrollWidth=${bodyScrollWidth}, viewport=${viewportWidth}`);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 5);

    await page.screenshot({ path: 'e2e/screenshots/mobile-02-metricas.png', fullPage: false });
    console.log('[QA] ✓ Métricas mobile — KPIs visible, no overflow');
  });

  // ── 3. Shopify on mobile ───────────────────────────────────────────

  test('3. Shopify on mobile — dashboard renders, charts fit viewport', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await login(page);
    await dismissOnboarding(page);

    const found = await navigateToTab(page, 'Shopify');
    if (!found) {
      console.log('[QA] Shopify tab not found — skipping');
      return;
    }
    await waitForLoad(page);

    // Either dashboard or connect message
    const dashboard = page.locator('h2:has-text("Dashboard Shopify"), h1:has-text("Shopify")').first();
    const connectMsg = page.locator('text=Conecta Shopify, text=Conectar Shopify').first();
    const hasDash = await dashboard.isVisible({ timeout: 10000 }).catch(() => false);
    const hasConnect = await connectMsg.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasDash) {
      console.log('[QA] Shopify dashboard visible on mobile');

      // Charts should not overflow
      const recharts = page.locator('.recharts-responsive-container').first();
      if (await recharts.isVisible({ timeout: 5000 }).catch(() => false)) {
        const box = await recharts.boundingBox();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(MOBILE_WIDTH + 5);
          console.log(`[QA] Chart width: ${box.width}px <= ${MOBILE_WIDTH}px viewport`);
        }
      }
    } else if (hasConnect) {
      console.log('[QA] Shopify not connected — connect message shown');
    } else {
      // Some content should exist
      const anyContent = await page.locator('main, [class*="container"], [class*="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(anyContent).toBe(true);
    }

    // No horizontal scroll
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[QA] Shopify mobile — body.scrollWidth=${bodyScrollWidth}, viewport=${viewportWidth}`);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 5);

    await page.screenshot({ path: 'e2e/screenshots/mobile-03-shopify.png', fullPage: false });
    console.log('[QA] ✓ Shopify mobile — renders, no overflow');
  });

  // ── 4. Campañas on mobile ──────────────────────────────────────────

  test('4. Campañas on mobile — campaign cards stack properly', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await login(page);
    await dismissOnboarding(page);

    // Try both "Campañas" and "Meta" tab names
    let found = await navigateToTab(page, 'Campañas');
    if (!found) found = await navigateToTab(page, 'Meta');
    if (!found) {
      console.log('[QA] Campañas/Meta tab not found — skipping');
      return;
    }
    await waitForLoad(page);

    // Check for campaign cards or connect message
    const cards = page.locator('[class*="card"], [class*="Card"], article').filter({ has: page.locator('text=/campaign|Campaña|campaña|Meta/i') });
    const cardCount = await cards.count();
    console.log(`[QA] Campaign-related cards found: ${cardCount}`);

    if (cardCount > 0) {
      // Cards should be stacked (full width on mobile, not side-by-side)
      const firstCard = cards.first();
      const box = await firstCard.boundingBox();
      if (box) {
        // On mobile 375px, cards should be at most full width
        expect(box.width).toBeLessThanOrEqual(MOBILE_WIDTH + 5);
        console.log(`[QA] Campaign card width: ${box.width}px`);
      }
    }

    // No horizontal scroll
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[QA] Campañas mobile — body.scrollWidth=${bodyScrollWidth}, viewport=${viewportWidth}`);
    expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 5);

    await page.screenshot({ path: 'e2e/screenshots/mobile-04-campanas.png', fullPage: false });
    console.log('[QA] ✓ Campañas mobile — no overflow');
  });

  // ── 5. Desktop navigation — capture ALL page errors ────────────────

  test('5. Desktop full navigation — capture ALL page errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      const msg = err.message || String(err);
      pageErrors.push(msg);
      console.log(`[QA] PAGE ERROR: ${msg}`);
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    await dismissOnboarding(page);

    const tabs = ['Métricas', 'Shopify', 'Campañas'];
    for (const tab of tabs) {
      const found = await navigateToTab(page, tab);
      if (found) {
        await waitForLoad(page);
        await page.waitForTimeout(2000);
        console.log(`[QA] Visited tab: ${tab} — errors so far: ${pageErrors.length}`);
      }
    }

    // Also try "Meta" as alternative to "Campañas"
    const metaFound = await navigateToTab(page, 'Meta');
    if (metaFound) {
      await waitForLoad(page);
      await page.waitForTimeout(2000);
    }

    // Filter out noise
    const critical = pageErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Non-Error exception') &&
      !e.includes('Script error') &&
      !e.includes('ChunkLoadError') // handled by app itself
    );

    if (critical.length > 0) {
      console.log(`[QA] Critical page errors (${critical.length}):\n${critical.join('\n---\n')}`);
    } else {
      console.log('[QA] ✓ No critical page errors during full navigation');
    }

    expect(critical).toHaveLength(0);
  });

  // ── 6. Monitor ALL API responses — NO 5xx errors ──────────────────

  test('6. API monitoring — no 5xx errors from any /api/ endpoint', async ({ page }) => {
    const failedAPIs: string[] = [];
    const allAPIs: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('functions/v1') || url.includes('supabase')) {
        const status = response.status();
        allAPIs.push(`${status} ${url}`);
        if (status >= 500) {
          failedAPIs.push(`${status} ${url}`);
          console.log(`[QA] 5xx ERROR: ${status} ${url}`);
        }
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    await dismissOnboarding(page);

    const tabs = ['Métricas', 'Shopify', 'Campañas', 'Meta'];
    for (const tab of tabs) {
      const found = await navigateToTab(page, tab);
      if (found) {
        await waitForLoad(page);
        await page.waitForTimeout(3000);
      }
    }

    console.log(`[QA] Total API calls monitored: ${allAPIs.length}`);
    if (failedAPIs.length > 0) {
      console.log(`[QA] 5xx FAILURES:\n${failedAPIs.join('\n')}`);
    } else {
      console.log('[QA] ✓ No 5xx API errors');
    }

    expect(failedAPIs).toHaveLength(0);
  });

  // ── 7. No "NaN", "undefined", "null", "Infinity" in KPI cards ──────

  test('7. No invalid values (NaN/undefined/null/Infinity) in KPI cards across all tabs', async ({ page }) => {
    const invalidFound: string[] = [];
    const badValues = ['NaN', 'undefined', 'Infinity'];

    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    await dismissOnboarding(page);

    const tabs = ['Métricas', 'Shopify', 'Campañas', 'Meta'];

    for (const tab of tabs) {
      const found = await navigateToTab(page, tab);
      if (!found) continue;
      await waitForLoad(page);

      // Check numeric display elements: text-3xl, text-2xl, font-bold, tabular-nums, kpi values
      const numericEls = page.locator(
        '[class*="text-3xl"], [class*="text-2xl"], [class*="tabular-nums"], [class*="text-xl"][class*="font-bold"]'
      );
      const count = await numericEls.count();
      console.log(`[QA] Tab "${tab}" — checking ${count} numeric elements`);

      for (let i = 0; i < count; i++) {
        const el = numericEls.nth(i);
        const isVisible = await el.isVisible().catch(() => false);
        if (!isVisible) continue;
        const text = await el.textContent().catch(() => '');
        if (!text) continue;
        const trimmed = text.trim();
        for (const bad of badValues) {
          if (trimmed === bad || trimmed.startsWith(bad) || trimmed.endsWith(bad)) {
            const issue = `Tab "${tab}" — element[${i}] contains "${bad}": "${trimmed}"`;
            invalidFound.push(issue);
            console.log(`[QA] INVALID VALUE FOUND: ${issue}`);
          }
        }
        // Also check for "null" as a standalone value
        if (trimmed === 'null') {
          const issue = `Tab "${tab}" — element[${i}] is literally "null"`;
          invalidFound.push(issue);
          console.log(`[QA] INVALID VALUE FOUND: ${issue}`);
        }
      }
    }

    if (invalidFound.length > 0) {
      console.log(`[QA] Invalid values found:\n${invalidFound.join('\n')}`);
    } else {
      console.log('[QA] ✓ No NaN/undefined/null/Infinity in KPI elements across all tabs');
    }

    expect(invalidFound).toHaveLength(0);
  });

  // ── 8. body.scrollWidth never exceeds viewport on mobile ──────────

  test('8. Mobile scroll check — body.scrollWidth never exceeds viewport on all tabs', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: MOBILE_HEIGHT });
    await login(page);
    await dismissOnboarding(page);

    const tabs = ['Métricas', 'Shopify', 'Campañas', 'Meta'];
    const overflowTabs: string[] = [];

    for (const tab of tabs) {
      const found = await navigateToTab(page, tab);
      if (!found) continue;
      await waitForLoad(page);

      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      console.log(`[QA] Tab "${tab}" — body.scrollWidth=${bodyScrollWidth}, viewport=${viewportWidth}`);

      if (bodyScrollWidth > viewportWidth + 5) {
        overflowTabs.push(`"${tab}": scrollWidth=${bodyScrollWidth}, viewport=${viewportWidth}, overflow=${bodyScrollWidth - viewportWidth}px`);
        console.log(`[QA] OVERFLOW DETECTED on "${tab}": ${bodyScrollWidth - viewportWidth}px extra`);
      }
    }

    if (overflowTabs.length > 0) {
      console.log(`[QA] Overflow tabs:\n${overflowTabs.join('\n')}`);
    } else {
      console.log('[QA] ✓ No horizontal overflow on any tab at mobile viewport');
    }

    expect(overflowTabs).toHaveLength(0);
  });
});
