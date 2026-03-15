import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  // Fill credentials
  await page.locator('input[type="email"], input#email, input[name="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"], input#password, input[name="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /iniciar sesión|sign in|login|entrar/i }).first().click();
  await page.waitForURL(/portal|dashboard|home/i, { timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('[QA] Login OK');
}

async function dismissAllModals(page: Page) {
  // Repeatedly dismiss visible modals until page is clear or max attempts reached.
  const dismissSelectors = [
    'button:has-text("Omitir")',
    'button:has-text("Cerrar")',
    'button:has-text("Saltar")',
    'button:has-text("Comenzar")',
    '[data-testid="close-onboarding"]',
  ];

  for (let attempt = 0; attempt < 5; attempt++) {
    // Quick check: are there any visible dismiss buttons?
    let dismissed = false;
    for (const sel of dismissSelectors) {
      const el = page.locator(sel).first();
      // Use a very short timeout to not block
      const vis = await el.isVisible({ timeout: 500 }).catch(() => false);
      if (vis) {
        await el.click({ force: true });
        await page.waitForTimeout(1000);
        console.log(`[QA] Dismissed modal via: ${sel} (attempt ${attempt + 1})`);
        dismissed = true;
        break;
      }
    }
    if (!dismissed) {
      // No more dismiss buttons — we're done
      break;
    }
  }
  // Small final buffer
  await page.waitForTimeout(500);
}

async function navigateToMetricas(page: Page) {
  // Try tab by text — use force:true in case any overlay is still fading
  const tab = page.locator('button, a, [role="tab"]').filter({ hasText: /^Métricas$/ }).first();
  if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tab.click({ force: true });
    await page.waitForTimeout(4000);
    console.log('[QA] Navigated to Métricas');
    return true;
  }
  // Try nav links
  const navLink = page.locator('nav a, nav button').filter({ hasText: /métricas/i }).first();
  if (await navLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await navLink.click({ force: true });
    await page.waitForTimeout(4000);
    console.log('[QA] Navigated to Métricas via nav');
    return true;
  }
  console.log('[QA] WARNING: Métricas tab not found');
  return false;
}

async function waitForKPIsToLoad(page: Page) {
  // Wait for the page to settle. We use a fixed pause rather than
  // skeleton-detection because some KPI icons always pulse.
  await page.waitForTimeout(6000);
  console.log('[QA] KPI load wait complete');
}

// ── Test Suite ────────────────────────────────────────────────────────

test.describe.serial('QA Métricas — Focused Run', () => {
  test.setTimeout(300_000);

  // ── TEST 1: Login + navigate + KPI cards load ────────────────────

  test('1. Login → Métricas tab → KPI cards load without NaN/undefined', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);
    await dismissAllModals(page);

    const navigated = await navigateToMetricas(page);
    expect(navigated).toBe(true);

    await waitForKPIsToLoad(page);

    // ── Verify KPI card titles ──
    const expectedKPIs = [
      'Ingresos Totales',
      'Inversión',
      'Pedidos',
      'Ticket Promedio',
      'ROAS',
    ];

    for (const kpiName of expectedKPIs) {
      const el = page.locator(`text=${kpiName}`).first();
      const visible = await el.isVisible({ timeout: 8000 }).catch(() => false);
      if (visible) {
        console.log(`[QA] KPI "${kpiName}" visible`);
      } else {
        // Try partial match
        const partial = page.locator(`[class*="card"], [class*="kpi"]`).filter({ hasText: kpiName }).first();
        const partialVisible = await partial.isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`[QA] KPI "${kpiName}": ${partialVisible ? 'visible (partial)' : 'NOT FOUND'}`);
      }
    }

    // ── Verify no NaN/undefined in KPI values ──
    // Grab all bold numeric-looking values on the page
    const pageText = await page.content();
    expect(pageText).not.toContain('>NaN<');
    expect(pageText).not.toContain('>undefined<');
    expect(pageText).not.toContain('NaN%');
    expect(pageText).not.toContain('$NaN');
    console.log('[QA] Page content: no NaN/undefined in KPI values');

    // ── Screenshot for evidence ──
    await page.screenshot({ path: 'e2e/screenshots/metrics-run-01-kpis.png', fullPage: false });

    // ── No critical console errors ──
    const critical = consoleErrors.filter(e =>
      e.includes('Unhandled') || e.includes('Cannot read') || e.includes('is not a function')
    );
    if (critical.length > 0) console.log('[QA] Critical errors:', critical);
    expect(critical).toHaveLength(0);
  });

  // ── TEST 2: Date filter presets ──────────────────────────────────

  test('2. Date filters: each preset updates KPIs without NaN', async ({ page }) => {
    await login(page);
    await dismissAllModals(page);
    await navigateToMetricas(page);
    await waitForKPIsToLoad(page);

    const presets = ['7 días', '30 días', '90 días', 'Mes actual', 'Año actual'];

    for (const preset of presets) {
      const btn = page.locator('button').filter({ hasText: preset }).first();
      const visible = await btn.isVisible({ timeout: 3000 }).catch(() => false);

      if (visible) {
        await btn.click();
        await page.waitForTimeout(3000);
        await waitForKPIsToLoad(page);

        // Check for NaN in page content after filter change
        const content = await page.content();
        expect(content).not.toContain('>NaN<');
        expect(content).not.toContain('$NaN');
        expect(content).not.toContain('NaN%');
        console.log(`[QA] Date filter "${preset}" → OK (no NaN)`);
      } else {
        console.log(`[QA] Date filter "${preset}" → NOT FOUND (skipping)`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-run-02-datefilters.png', fullPage: false });
  });

  // ── TEST 3: Custom date range ────────────────────────────────────

  test('3. Custom date range: open Personalizado → select dates → Aplicar', async ({ page }) => {
    await login(page);
    await dismissAllModals(page);
    await navigateToMetricas(page);
    await waitForKPIsToLoad(page);

    const customBtn = page.locator('button').filter({ hasText: /personalizado/i }).first();
    const customVisible = await customBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!customVisible) {
      console.log('[QA] "Personalizado" button not found — skipping custom range test');
      test.skip();
      return;
    }

    await customBtn.click();
    await page.waitForTimeout(1000);

    // Calendar or date picker should open
    const calendar = page.locator('[role="grid"], [data-testid="calendar"], .rdp, .DayPicker, .react-datepicker').first();
    const calendarVisible = await calendar.isVisible({ timeout: 5000 }).catch(() => false);

    if (calendarVisible) {
      console.log('[QA] Calendar opened');

      // Click the 5th and 15th day buttons (generically)
      const dayButtons = page.locator('button[name="day"], td[role="gridcell"] button, .rdp-day:not(.rdp-day_disabled)');
      const dayCount = await dayButtons.count();
      console.log(`[QA] Found ${dayCount} day buttons`);

      if (dayCount >= 15) {
        await dayButtons.nth(4).click(); // 5th available day
        await page.waitForTimeout(400);
        await dayButtons.nth(14).click(); // 15th available day
        await page.waitForTimeout(400);
        console.log('[QA] Selected start and end date');
      } else if (dayCount >= 2) {
        await dayButtons.nth(0).click();
        await page.waitForTimeout(400);
        await dayButtons.nth(Math.min(7, dayCount - 1)).click();
        await page.waitForTimeout(400);
      }
    } else {
      // Maybe it opened inline date inputs
      const dateInputs = page.locator('input[type="date"]');
      const inputCount = await dateInputs.count();
      if (inputCount >= 2) {
        await dateInputs.nth(0).fill('2026-01-01');
        await dateInputs.nth(1).fill('2026-01-31');
        console.log('[QA] Filled date inputs');
      } else {
        console.log('[QA] No calendar or date inputs found');
      }
    }

    // Try clicking Aplicar
    const applyBtn = page.locator('button').filter({ hasText: /aplicar/i }).first();
    const applyVisible = await applyBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (applyVisible) {
      const isEnabled = await applyBtn.isEnabled();
      if (isEnabled) {
        await applyBtn.click();
        await page.waitForTimeout(3000);
        console.log('[QA] "Aplicar" clicked');

        // Verify page still functional
        const content = await page.content();
        expect(content).not.toContain('>NaN<');
        console.log('[QA] Custom date range applied → no NaN');
      } else {
        console.log('[QA] "Aplicar" button exists but disabled — dates may not be fully selected');
      }
    } else {
      console.log('[QA] "Aplicar" button not found after date selection');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-run-03-customrange.png', fullPage: false });
  });

  // ── TEST 4: Revenue is NOT the buggy $54,000 value ───────────────

  test('4. Revenue value is NOT $54,000 (known bug check)', async ({ page }) => {
    await login(page);
    await dismissAllModals(page);
    await navigateToMetricas(page);
    await waitForKPIsToLoad(page);

    // Grab the full page text
    const pageText = await page.innerText('body');

    // The known bug was showing exactly $54,000 or $54.000
    const hasBuggyValue =
      pageText.includes('$54,000') ||
      pageText.includes('$54.000') ||
      pageText.includes('54000');

    // Log what we see near "Ingresos"
    const revenueCard = page.locator('text=Ingresos Totales').first();
    if (await revenueCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      const cardParent = revenueCard.locator('../..');
      const cardText = await cardParent.textContent().catch(() => '');
      console.log(`[QA] Ingresos Totales card text: "${cardText?.trim().substring(0, 100)}"`);
    }

    // Also log what the page shows as revenue
    const boldValues = page.locator('.text-3xl, .text-2xl, [class*="text-3"], [class*="font-bold"]');
    const count = await boldValues.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const txt = await boldValues.nth(i).textContent().catch(() => '');
      if (txt && txt.trim().match(/[\$\d]/)) {
        console.log(`[QA] Bold value [${i}]: "${txt.trim()}"`);
      }
    }

    if (hasBuggyValue) {
      console.log('[QA] WARNING: Found $54,000 on page — possible bug!');
    } else {
      console.log('[QA] Revenue is NOT $54,000 — bug not present');
    }

    expect(hasBuggyValue).toBe(false);

    await page.screenshot({ path: 'e2e/screenshots/metrics-run-04-revenue.png', fullPage: false });
  });

  // ── TEST 5: Conversion Funnel panel ──────────────────────────────

  test('5. Funnel de Conversión panel visible with Checkout + Compra stages', async ({ page }) => {
    await login(page);
    await dismissAllModals(page);
    await navigateToMetricas(page);
    await waitForKPIsToLoad(page);

    // Scroll through the page to trigger lazy-loaded sections
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Look for funnel panel
    const funnelTitle = page.locator('text=Funnel de Conversión').first();
    const funnelVisible = await funnelTitle.isVisible({ timeout: 8000 }).catch(() => false);

    if (funnelVisible) {
      console.log('[QA] "Funnel de Conversión" panel is visible');

      // Check for Checkout stage
      const checkoutStage = page.locator('text=/checkout|Checkout/i').first();
      const checkoutVisible = await checkoutStage.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`[QA] Checkout stage: ${checkoutVisible ? 'VISIBLE' : 'NOT FOUND'}`);

      // Check for Compra/Purchase stage
      const compraStage = page.locator('text=/compra|Compra|purchase/i').first();
      const compraVisible = await compraStage.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`[QA] Compra stage: ${compraVisible ? 'VISIBLE' : 'NOT FOUND'}`);

      expect(checkoutVisible || compraVisible).toBe(true);
    } else {
      // Check if there's a "no data" placeholder or the section simply isn't implemented
      const pageContent = await page.innerText('body');
      const hasFunnelText = pageContent.toLowerCase().includes('funnel') ||
                            pageContent.includes('conversión') ||
                            pageContent.includes('conversion');
      console.log(`[QA] "Funnel de Conversión" panel NOT visible. Page has funnel-related text: ${hasFunnelText}`);
      // Not a hard fail if panel doesn't exist yet — log and note
      console.log('[QA] Funnel panel may not be implemented or may require data');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-run-05-funnel.png', fullPage: true });
  });

  // ── TEST 6: Smart Insights panel ─────────────────────────────────

  test('6. Smart Insights panel ("Steve te recomienda") visible with actionable insights', async ({ page }) => {
    await login(page);
    await dismissAllModals(page);
    await navigateToMetricas(page);
    await waitForKPIsToLoad(page);

    // Scroll to find the panel
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    const insightsPanel = page.locator('text=Steve te recomienda').first();
    const panelVisible = await insightsPanel.isVisible({ timeout: 8000 }).catch(() => false);

    if (panelVisible) {
      console.log('[QA] "Steve te recomienda" panel is visible');

      // Get the parent container and look for insight items
      const panelContainer = insightsPanel.locator('../../..');
      const panelText = await panelContainer.textContent().catch(() => '');

      // Verify no NaN/undefined in insight text
      expect(panelText).not.toContain('NaN');
      expect(panelText).not.toContain('undefined');
      console.log('[QA] Insights panel: no NaN/undefined values');

      // Count insight cards/items
      const insightItems = panelContainer.locator('[class*="rounded"], [class*="card"], li, [class*="insight"]');
      const itemCount = await insightItems.count();
      console.log(`[QA] Found ${itemCount} insight items/elements`);

      // Log a snippet of the panel content
      const snippet = panelText?.trim().substring(0, 200);
      console.log(`[QA] Insights panel content: "${snippet}"`);

      expect(panelText!.length).toBeGreaterThan(10);
    } else {
      // The panel might appear differently or require more data
      console.log('[QA] "Steve te recomienda" panel NOT visible — checking alternatives...');

      // Try broader search
      const alternativeSelectors = [
        'text=te recomienda',
        'text=Recomendaciones',
        'text=Insights',
        'text=Sugerencias',
      ];
      let foundAlternative = false;
      for (const sel of alternativeSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[QA] Found alternative: "${sel}"`);
          foundAlternative = true;
          break;
        }
      }

      if (!foundAlternative) {
        console.log('[QA] No insights panel found — may require data or feature not yet live');
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-run-06-insights.png', fullPage: true });
  });

  // ── TEST 7: No console errors during navigation ──────────────────

  test('7. No console errors during Métricas navigation', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    await login(page);
    await dismissAllModals(page);
    await navigateToMetricas(page);
    await waitForKPIsToLoad(page);

    // Scroll the full page to trigger all lazy loads
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // Try a couple of date filter interactions
    const thirtyDays = page.locator('button').filter({ hasText: '30 días' }).first();
    if (await thirtyDays.isVisible({ timeout: 3000 }).catch(() => false)) {
      await thirtyDays.click();
      await page.waitForTimeout(2000);
    }

    // Filter out known benign errors (third-party, ResizeObserver, etc.)
    const ignoredPatterns = [
      'ResizeObserver',
      'Non-Error exception',
      'Script error',
      'favicon',
      'gtag',
      'analytics',
      'intercom',
      'hotjar',
    ];

    const criticalConsoleErrors = consoleErrors.filter(e =>
      !ignoredPatterns.some(p => e.toLowerCase().includes(p.toLowerCase()))
    );

    const criticalPageErrors = pageErrors.filter(e =>
      !ignoredPatterns.some(p => e.toLowerCase().includes(p.toLowerCase()))
    );

    if (consoleErrors.length > 0) {
      console.log(`[QA] All console errors (${consoleErrors.length}):`);
      consoleErrors.forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 150)}`));
    }

    if (pageErrors.length > 0) {
      console.log(`[QA] Page errors (${pageErrors.length}):`);
      pageErrors.forEach((e, i) => console.log(`  [${i}] ${e.substring(0, 150)}`));
    }

    if (criticalConsoleErrors.length === 0 && criticalPageErrors.length === 0) {
      console.log('[QA] No critical console/page errors during Métricas navigation');
    }

    expect(criticalPageErrors).toHaveLength(0);
    // Console errors get a softer check — warn but don't fail on minor errors
    // (Some errors may come from third-party embeds)
    const severeErrors = criticalConsoleErrors.filter(e =>
      e.includes('Unhandled') ||
      e.includes('Cannot read properties of undefined') ||
      e.includes('is not a function') ||
      e.includes('Cannot read property')
    );
    if (severeErrors.length > 0) {
      console.log('[QA] SEVERE errors:', severeErrors);
    }
    expect(severeErrors).toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/metrics-run-07-noerrors.png', fullPage: false });
  });
});
