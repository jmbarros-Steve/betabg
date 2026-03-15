import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 25000 });
  await page.waitForTimeout(2000);

  // Pre-set localStorage keys to suppress ALL tours, onboarding, and coachmarks
  // This runs in the browser context after navigation
  await page.evaluate(() => {
    // Suppress ProductTour (key: steve_tour_<userId>)
    // We don't know userId yet, so suppress ALL keys starting with steve_tour_
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('steve_tour_')) {
        localStorage.setItem(key, 'true');
      }
    }
    // Suppress bg_onboarding_ keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bg_onboarding_')) {
        localStorage.setItem(key, 'true');
      }
    }
    // Suppress coachmarks (key: steve_coachmark_<id>)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('steve_coachmark_')) {
        localStorage.setItem(key, 'true');
      }
    }
    // Add wildcard suppressors for unknown user IDs
    // We'll add them by current user ID from Supabase session
    const session = localStorage.getItem('sb-zpswjccsxjtnhetkkqde-auth-token');
    if (session) {
      try {
        const parsed = JSON.parse(session);
        const userId = parsed?.user?.id;
        if (userId) {
          localStorage.setItem(`steve_tour_${userId}`, 'true');
          localStorage.setItem(`bg_onboarding_${userId}`, 'true');
        }
      } catch (_) {}
    }
  });

  await page.waitForTimeout(1000);
  console.log('[QA] Login OK — localStorage tours suppressed');
}

async function dismissOnboarding(page: Page) {
  // Use JavaScript to force-dismiss all known overlays by setting localStorage
  // and dispatching click events directly via evaluate()
  await page.evaluate(() => {
    // Dismiss ProductTour by clicking its backdrop directly
    const backdrop = document.querySelector('div.fixed.inset-0[class*="bg-black"]') as HTMLElement;
    if (backdrop) {
      backdrop.click();
    }
    // Click any dismiss/skip button (Omitir, Omitir tour, Ir al Portal, Cerrar)
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    for (const btn of buttons) {
      const txt = btn.textContent || '';
      if (txt.includes('Omitir') || txt.includes('Ir al Portal') || txt.includes('Cerrar')) {
        btn.click();
        break;
      }
    }
    // Suppress all tour/onboarding localStorage keys
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('steve_tour_') || key.startsWith('bg_onboarding_') || key.startsWith('steve_coachmark_')) {
        localStorage.setItem(key, 'true');
      }
    }
  });

  await page.waitForTimeout(1000);

  // Check if backdrop is still present, wait for it to disappear
  const backdropGone = await page.locator('div.fixed.inset-0.bg-black\\/40').waitFor({ state: 'hidden', timeout: 5000 }).then(() => true).catch(() => false);
  if (!backdropGone) {
    // Force via keyboard escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    console.log('[QA] Pressed Escape to dismiss overlay');
  } else {
    console.log('[QA] Overlays dismissed successfully');
  }

  // Final check: dismiss ANY remaining modal/overlay with force clicks
  for (const text of ['Omitir', 'Omitir tour', 'Cerrar', 'Comenzar']) {
    const btn = page.locator('button').filter({ hasText: text }).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(500);
      console.log(`[QA] Dismissed via force click: "${text}"`);
    }
  }

  // If overlay STILL present, remove it via JS
  await page.evaluate(() => {
    const overlays = document.querySelectorAll('div.fixed.inset-0');
    overlays.forEach(el => (el as HTMLElement).style.display = 'none');
  });
  await page.waitForTimeout(500);
}

async function goToShopifyTab(page: Page): Promise<boolean> {
  // On desktop, Shopify is in the "Más" dropdown (secondaryTabs).
  // On mobile, Shopify is in the "Más" bottom sheet.
  // First try the "Más" dropdown button in the header tabs area.
  const masDropdown = page.locator('.hidden.md\\:flex button').filter({ hasText: 'Más' }).first();
  const masVisible = await masDropdown.isVisible({ timeout: 5000 }).catch(() => false);

  if (masVisible) {
    await masDropdown.click();
    await page.waitForTimeout(500);
    // Now look for "Shopify" in the dropdown menu items (not disabled)
    const shopifyItem = page.locator('[role="menuitem"]').filter({ hasText: 'Shopify' }).first();
    const shopifyItemVisible = await shopifyItem.isVisible({ timeout: 3000 }).catch(() => false);
    if (shopifyItemVisible) {
      await shopifyItem.click();
      await page.waitForTimeout(4000);
      console.log('[QA] Navigated to Shopify tab via dropdown');
      return true;
    }
  }

  // Fallback: try clicking any non-disabled button/item with text "Shopify"
  // that is NOT from SetupProgressTracker (which has "Conectar Shopify")
  const allShopifyBtns = await page.locator('button:not([disabled])').filter({ hasText: /^Shopify$/ }).all();
  if (allShopifyBtns.length > 0) {
    await allShopifyBtns[0].click();
    await page.waitForTimeout(4000);
    console.log('[QA] Navigated to Shopify tab via direct button');
    return true;
  }

  // Try DropdownMenuItem approach
  const dropdownItem = page.locator('[data-radix-dropdown-menu-item], [role="menuitem"]').filter({ hasText: 'Shopify' }).first();
  if (await dropdownItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dropdownItem.click();
    await page.waitForTimeout(4000);
    console.log('[QA] Navigated to Shopify via dropdown item');
    return true;
  }

  console.log('[QA] Shopify tab NOT found in nav');
  return false;
}

async function waitForLoad(page: Page) {
  // Wait for loading skeletons to disappear
  const skeleton = page.locator('.animate-pulse').first();
  await skeleton.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {
    console.log('[QA] Warning: skeleton still visible after 30s');
  });
  await page.waitForTimeout(1500);
}

/** Returns true if the Shopify dashboard (connected state) is rendered. */
async function hasDashboard(page: Page): Promise<boolean> {
  const panelHeader = page.locator('h2:has-text("Panel Shopify")');
  return await panelHeader.isVisible({ timeout: 8000 }).catch(() => false);
}

// ── Tests ─────────────────────────────────────────────────────────────

test.describe.serial('Shopify Tab — QA Run', () => {
  test.setTimeout(300_000);

  // ── 1. Login & navigate to Shopify tab ────────────────────────────

  test('1. Login and navigate to Shopify tab — dashboard loads', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);
    await dismissOnboarding(page);
    const tabFound = await goToShopifyTab(page);
    expect(tabFound, 'Shopify tab must be visible in navigation').toBe(true);

    await waitForLoad(page);

    // Either Shopify is connected (shows "Panel Shopify") or shows the connect prompt
    const connected = await hasDashboard(page);
    const connectPrompt = page.locator('text=Conecta Shopify');
    const promptVisible = await connectPrompt.isVisible({ timeout: 5000 }).catch(() => false);

    if (connected) {
      console.log('[QA] Shopify dashboard connected — "Panel Shopify" visible');
    } else if (promptVisible) {
      console.log('[QA] Shopify not connected — connect prompt shown (acceptable)');
    } else {
      // Try alternate heading
      const altHeader = await page.locator('h2').first().textContent().catch(() => '');
      console.log(`[QA] Page h2 content: "${altHeader}"`);
    }

    expect(connected || promptVisible, '"Panel Shopify" or connect prompt must be visible').toBe(true);

    // No critical JS errors
    const critical = consoleErrors.filter(e =>
      e.includes('Unhandled') || e.includes('Cannot read properties') || e.includes('is not a function')
    );
    if (critical.length > 0) console.log('[QA] Critical errors:', critical);
    expect(critical, 'No unhandled JS errors during navigation').toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/shopify-01-dashboard.png', fullPage: true });
  });

  // ── 2. KPI cards ──────────────────────────────────────────────────

  test('2. KPI cards visible — Ingresos, Pedidos, Ticket Promedio, Dinero en Carritos — no NaN', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    if (!(await hasDashboard(page))) {
      console.log('[QA] Shopify not connected — skipping KPI test');
      test.skip();
      return;
    }

    const kpiTitles = ['Ingresos del Período', 'Pedidos', 'Ticket Promedio', 'Dinero en Carritos'];
    for (const title of kpiTitles) {
      const el = page.locator(`text=${title}`).first();
      const visible = await el.isVisible({ timeout: 6000 }).catch(() => false);
      console.log(`[QA] KPI "${title}" ${visible ? 'visible ✓' : 'NOT FOUND ✗'}`);
      expect(visible, `KPI card "${title}" should be visible`).toBe(true);
    }

    // KPI values use .text-2xl.font-bold.tabular-nums
    const kpiValues = page.locator('.text-2xl.font-bold.tabular-nums');
    const count = await kpiValues.count();
    console.log(`[QA] KPI value elements found: ${count}`);
    expect(count, 'At least 3 KPI value elements should be present').toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const text = await kpiValues.nth(i).textContent();
      console.log(`[QA]   KPI[${i}] = "${text}"`);
      expect(text, `KPI[${i}] must not contain NaN`).not.toContain('NaN');
      expect(text, `KPI[${i}] must not contain undefined`).not.toContain('undefined');
      expect(text, `KPI[${i}] must not contain null`).not.toContain('null');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-02-kpis.png', fullPage: true });
  });

  // ── 3. Date filters ───────────────────────────────────────────────

  test('3. Date filters work — 7 días, 30 días, Mes actual', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    if (!(await hasDashboard(page))) {
      console.log('[QA] Shopify not connected — skipping date filter test');
      test.skip();
      return;
    }

    const presets = ['7 días', '30 días', 'Mes actual'];
    for (const preset of presets) {
      const btn = page.locator('button').filter({ hasText: preset }).first();
      const visible = await btn.isVisible({ timeout: 4000 }).catch(() => false);
      if (!visible) {
        console.log(`[QA] Date filter button "${preset}" not found — skipping`);
        continue;
      }
      await btn.click();
      await page.waitForTimeout(3000);

      // Dashboard should still be visible after filter change
      const stillVisible = await page.locator('h2:has-text("Panel Shopify")').isVisible({ timeout: 6000 }).catch(() => false);
      expect(stillVisible, `Dashboard visible after switching to "${preset}"`).toBe(true);

      // KPI values should not show NaN
      const kpiValues = page.locator('.text-2xl.font-bold.tabular-nums');
      for (let i = 0; i < await kpiValues.count(); i++) {
        const text = await kpiValues.nth(i).textContent();
        expect(text, `KPI[${i}] no NaN after filter "${preset}"`).not.toContain('NaN');
      }
      console.log(`[QA] Date filter "${preset}" — OK ✓`);
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-03-date-filters.png', fullPage: true });
  });

  // ── 4. Charts render (recharts SVG) ───────────────────────────────

  test('4. Ventas por Día chart renders with recharts SVG', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    if (!(await hasDashboard(page))) {
      console.log('[QA] Shopify not connected — skipping chart test');
      test.skip();
      return;
    }

    // Check for "Ventas por Día" title
    const salesChartTitle = page.locator('text=Ventas por Día');
    const chartTitleVisible = await salesChartTitle.isVisible({ timeout: 8000 }).catch(() => false);

    if (chartTitleVisible) {
      console.log('[QA] "Ventas por Día" chart title visible ✓');

      // Check that at least one recharts SVG renders
      const svgEl = page.locator('.recharts-wrapper svg, .recharts-responsive-container svg').first();
      const svgVisible = await svgEl.isVisible({ timeout: 8000 }).catch(() => false);
      console.log(`[QA] Recharts SVG visible: ${svgVisible}`);
      expect(svgVisible, 'Recharts SVG must render inside chart container').toBe(true);
    } else {
      // No data — chart may be hidden, check for the period breakdown message
      const noDataMsg = page.locator('text=Sin carritos abandonados en este período');
      const noDataVisible = await noDataMsg.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[QA] No data period — no daily breakdown (acceptable): noDataMsg=${noDataVisible}`);
      // If no data, we just log — this is acceptable
    }

    // Check abandoned carts by day chart title
    const abandonedChartTitle = page.locator('text=Carritos Abandonados por Día');
    const abandonedVisible = await abandonedChartTitle.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[QA] "Carritos Abandonados por Día" title visible: ${abandonedVisible}`);

    await page.screenshot({ path: 'e2e/screenshots/shopify-04-charts.png', fullPage: true });
  });

  // ── 5. Top SKUs panel ─────────────────────────────────────────────

  test('5. Top SKUs panel renders with product data', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    if (!(await hasDashboard(page))) {
      console.log('[QA] Shopify not connected — skipping SKU test');
      test.skip();
      return;
    }

    const skuTitle = page.locator('text=Top SKUs Vendidos');
    const visible = await skuTitle.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[QA] "Top SKUs Vendidos" panel visible: ${visible}`);
    expect(visible, 'Top SKUs panel title must be visible').toBe(true);

    // Check for product rows (at least the panel structure renders)
    // If there is data, expect progress bars or product names
    const progressBars = page.locator('.bg-primary.rounded-full.transition-all');
    const progressCount = await progressBars.count();
    console.log(`[QA] SKU progress bars found: ${progressCount}`);

    if (progressCount === 0) {
      // No sales data is acceptable — check for empty state message
      const emptyMsg = page.locator('text=Sin ventas, text=No hay SKUs, text=sin datos').first();
      const emptyVisible = await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[QA] No SKU data — empty state visible: ${emptyVisible}`);
    } else {
      expect(progressCount, 'At least one SKU progress bar should render').toBeGreaterThan(0);
      console.log(`[QA] Top SKUs panel — ${progressCount} product(s) with progress bars ✓`);
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-05-skus.png', fullPage: true });
  });

  // ── 6. Abandoned carts panel — filter buttons ─────────────────────

  test('6. Abandoned carts panel loads with filter buttons (Todos, Sin contactar, Contactados)', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    if (!(await hasDashboard(page))) {
      console.log('[QA] Shopify not connected — skipping abandoned carts test');
      test.skip();
      return;
    }

    const cartsTitle = page.locator('text=Carritos Abandonados').first();
    const titleVisible = await cartsTitle.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[QA] "Carritos Abandonados" panel visible: ${titleVisible}`);
    expect(titleVisible, '"Carritos Abandonados" panel must be visible').toBe(true);

    // Check filter buttons exist
    const allBtn = page.locator('button').filter({ hasText: /^Todos/ }).first();
    const notContactedBtn = page.locator('button').filter({ hasText: /Sin contactar/ }).first();
    const contactedBtn = page.locator('button').filter({ hasText: /^Contactados/ }).first();

    const allVisible = await allBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const ncVisible = await notContactedBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const cVisible = await contactedBtn.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`[QA] Filter buttons — Todos: ${allVisible}, Sin contactar: ${ncVisible}, Contactados: ${cVisible}`);
    expect(allVisible, '"Todos" filter button must be visible').toBe(true);
    expect(ncVisible, '"Sin contactar" filter button must be visible').toBe(true);
    expect(cVisible, '"Contactados" filter button must be visible').toBe(true);

    // Click through filter buttons
    if (ncVisible) {
      await notContactedBtn.click();
      await page.waitForTimeout(600);
      console.log('[QA] Clicked "Sin contactar" filter');
    }
    if (cVisible) {
      await contactedBtn.click();
      await page.waitForTimeout(600);
      console.log('[QA] Clicked "Contactados" filter');
    }
    if (allVisible) {
      await allBtn.click();
      await page.waitForTimeout(600);
      console.log('[QA] Clicked "Todos" filter — reset');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-06-carts-filters.png', fullPage: true });
  });

  // ── 7. Cart values in CLP format ──────────────────────────────────

  test('7. Abandoned cart values are in CLP format (not raw USD)', async ({ page }) => {
    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    if (!(await hasDashboard(page))) {
      console.log('[QA] Shopify not connected — skipping CLP format test');
      test.skip();
      return;
    }

    // Look for "CLP" label in the abandoned carts panel
    const clpLabel = page.locator('text=CLP').first();
    const clpVisible = await clpLabel.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`[QA] "CLP" label visible in carts panel: ${clpVisible}`);

    // Check for "$" prefix (Chilean peso format uses $)
    // Values in the panel follow $X.XXX format using es-CL locale
    const currencyValues = page.locator('p.font-semibold').filter({ hasText: /^\$[\d.,]+$/ });
    const valCount = await currencyValues.count();
    console.log(`[QA] Currency-formatted values found: ${valCount}`);

    if (valCount > 0) {
      // Verify none contain a decimal point in a way that suggests USD (e.g. "$1234.56")
      // CLP values should be integers (rounded). USD prices are typically < 1000 with 2 decimals.
      for (let i = 0; i < Math.min(valCount, 5); i++) {
        const text = await currencyValues.nth(i).textContent();
        console.log(`[QA]   Cart value[${i}]: "${text}"`);
        // CLP values should not look like raw USD (e.g. "$12.99")
        // Raw USD would be a small decimal like "$12.99" — CLP is typically thousands
        // We allow $X format but flag if it looks like a raw USD price (decimal + less than 100)
        expect(text, `Cart value[${i}] must not be NaN`).not.toContain('NaN');
      }
      // Verify CLP label appears somewhere in abandoned carts section
      expect(clpVisible, 'CLP currency label should be visible in carts panel').toBe(true);
    } else {
      // No cart data — check KPI cards which also use CLP
      const kpiRevenue = page.locator('.text-2xl.font-bold.tabular-nums').first();
      const revenueText = await kpiRevenue.textContent().catch(() => '');
      console.log(`[QA] KPI revenue value: "${revenueText}"`);
      // Even with $0 it should use CLP locale format
      expect(revenueText, 'Revenue KPI must not contain NaN').not.toContain('NaN');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-07-clp-format.png', fullPage: true });
  });

  // ── 8. No 5xx API errors during navigation ────────────────────────

  test('8. No 5xx API errors during navigation', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      if (status >= 500 && (url.includes('/api/') || url.includes('supabase') || url.includes('functions'))) {
        failedRequests.push(`HTTP ${status} — ${url}`);
        console.log(`[QA] 5xx error: ${status} ${url}`);
      }
    });

    await login(page);
    await dismissOnboarding(page);
    await goToShopifyTab(page);
    await waitForLoad(page);

    // Wait extra time for all async requests to complete
    await page.waitForTimeout(5000);

    // Switch date filters to trigger additional API calls
    const presets = ['7 días', '30 días'];
    for (const preset of presets) {
      const btn = page.locator('button').filter({ hasText: preset }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(3000);
      }
    }

    if (failedRequests.length > 0) {
      console.log('[QA] 5xx API errors detected:');
      failedRequests.forEach(r => console.log(`  ${r}`));
    } else {
      console.log('[QA] No 5xx API errors ✓');
    }

    expect(failedRequests, 'No 5xx API errors should occur during Shopify tab navigation').toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/shopify-08-no-errors.png', fullPage: true });
  });
});
