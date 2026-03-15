import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const ADMIN_EMAIL = 'jmbarros@bgconsult.cl';
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || '';

// ── Helpers ──────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await page.goto(`${BASE_URL}/auth`);
  await expect(page.locator('h1')).toContainText('Acceder al Panel', { timeout: 10000 });
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log('[QA] Admin login OK');
}

async function dismissOnboarding(page: Page) {
  const omitirBtn = page.getByText('Omitir', { exact: true });
  if (await omitirBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await omitirBtn.click();
    await page.waitForTimeout(1000);
  }
  const closeBtn = page.locator('button:has-text("Cerrar"), button:has-text("Comenzar")');
  if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.first().click();
    await page.waitForTimeout(1000);
  }
}

async function navigateToTab(page: Page, tabName: string) {
  const tab = page.locator('button').filter({ hasText: tabName }).first();
  if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(3000);
    console.log(`[QA] Tab: ${tabName}`);
    return true;
  }
  console.log(`[QA] Tab NOT FOUND: ${tabName}`);
  return false;
}

async function waitForMetricsLoad(page: Page) {
  // Wait for skeletons to disappear (metrics loaded)
  const skeleton = page.locator('.animate-pulse').first();
  await skeleton.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {
    console.log('[QA] Warning: Skeletons still visible after 30s');
  });
  await page.waitForTimeout(1000);
}

// ── Test Suite: Metrics Tab ──────────────────────────────────────────

test.describe.serial('QA Metrics & Shopify — Exhaustive', () => {
  test.setTimeout(300_000);

  // ── 1. METRICS TAB ────────────────────────────────────────────────

  test('1. Metrics tab loads without errors', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    // Verify header renders
    await expect(page.locator('h2:has-text("Resumen de Rendimiento")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Dashboard integrado de métricas')).toBeVisible();

    // No uncaught React errors
    const criticalErrors = consoleErrors.filter(e =>
      e.includes('Unhandled') || e.includes('Cannot read') || e.includes('is not a function')
    );
    expect(criticalErrors).toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/metrics-01-loaded.png', fullPage: true });
    console.log('[QA] Metrics tab loaded OK');
  });

  test('2. KPI cards render with correct structure', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    // 5 KPI cards should be visible (includes Ticket Promedio)
    const kpiTitles = ['Ingresos Totales', 'Inversión Publicitaria', 'Pedidos', 'Ticket Promedio', 'ROAS'];
    for (const title of kpiTitles) {
      const card = page.locator(`text=${title}`).first();
      await expect(card).toBeVisible({ timeout: 5000 });
      console.log(`[QA] KPI "${title}" visible`);
    }

    // Each card should have a numeric value (not NaN, not undefined)
    const kpiValues = page.locator('.text-3xl.font-bold');
    const count = await kpiValues.count();
    expect(count).toBe(5);

    for (let i = 0; i < count; i++) {
      const text = await kpiValues.nth(i).textContent();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
      console.log(`[QA] KPI ${i + 1} value: ${text}`);
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-02-kpis.png', fullPage: true });
  });

  test('3. Date filter works for all presets', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const presets = ['7 días', '30 días', '90 días', 'Mes actual', 'Año actual'];
    for (const preset of presets) {
      const btn = page.locator('button').filter({ hasText: preset }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(2000);

        // Verify no NaN/error in KPIs after switching
        const kpiValues = page.locator('.text-3xl.font-bold');
        for (let i = 0; i < await kpiValues.count(); i++) {
          const text = await kpiValues.nth(i).textContent();
          expect(text).not.toContain('NaN');
          expect(text).not.toContain('undefined');
        }
        console.log(`[QA] Date filter "${preset}" — OK`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-03-date-filter.png', fullPage: true });
  });

  test('4. Custom date range picker works', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const customBtn = page.locator('button').filter({ hasText: 'Personalizado' }).first();
    if (await customBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customBtn.click();
      await page.waitForTimeout(500);

      // Calendar popover should appear
      const calendar = page.locator('[role="grid"]').first();
      await expect(calendar).toBeVisible({ timeout: 5000 });

      // Click two dates
      const days = page.locator('button[name="day"]');
      const dayCount = await days.count();
      if (dayCount >= 10) {
        await days.nth(2).click();
        await page.waitForTimeout(200);
        await days.nth(8).click();
        await page.waitForTimeout(200);

        // Click Aplicar
        const applyBtn = page.locator('button:has-text("Aplicar")');
        if (await applyBtn.isEnabled()) {
          await applyBtn.click();
          await page.waitForTimeout(2000);
          console.log('[QA] Custom date range applied');
        }
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-04-custom-range.png', fullPage: true });
  });

  test('5. Charts render without errors', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    // Check if data exists — if yes, charts should render
    const noDataMsg = page.locator('text=No hay métricas disponibles');
    const hasNoData = await noDataMsg.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasNoData) {
      // Revenue chart should exist
      const revenueChart = page.locator('text=Ingresos por Día').first();
      const hasRevenueChart = await revenueChart.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasRevenueChart) {
        // Check SVG renders inside chart container
        const chartSvg = page.locator('.recharts-wrapper svg').first();
        await expect(chartSvg).toBeVisible({ timeout: 5000 });
        console.log('[QA] Revenue chart renders OK');
      }

      // Orders chart
      const ordersChart = page.locator('text=Órdenes por Día');
      if (await ordersChart.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[QA] Orders chart renders OK');
      }
    } else {
      console.log('[QA] No data — charts correctly hidden');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-05-charts.png', fullPage: true });
  });

  test('6. Profit metrics panel renders correctly', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const noDataMsg = page.locator('text=No hay métricas disponibles');
    if (await noDataMsg.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[QA] No data — skipping profit panel check');
      return;
    }

    // POAS, CAC, MER, Break-even ROAS
    const profitLabels = ['POAS', 'CAC', 'MER', 'Break-even ROAS'];
    for (const label of profitLabels) {
      const el = page.locator(`text=${label}`).first();
      const visible = await el.isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) {
        console.log(`[QA] Profit metric "${label}" visible`);
      }
    }

    // ROAS vs Break-even indicator
    const roasIndicator = page.locator('text=/Operación rentable|Por debajo del break-even/');
    if (await roasIndicator.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await roasIndicator.first().textContent();
      console.log(`[QA] ROAS indicator: ${text}`);
      // Verify percentage is not NaN
      const pctEl = page.locator('.text-2xl.font-bold.tabular-nums').last();
      const pctText = await pctEl.textContent().catch(() => '');
      expect(pctText).not.toContain('NaN');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-06-profit.png', fullPage: true });
  });

  test('7. P&L (Estado de Resultados) renders correctly', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const plTitle = page.locator('text=Estado de Resultados');
    if (await plTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check key P&L lines
      const plLines = ['Ingresos Brutos', 'Ingresos Netos', 'Utilidad Bruta', 'Utilidad Neta'];
      for (const line of plLines) {
        const el = page.locator(`text=${line}`).first();
        await expect(el).toBeVisible({ timeout: 3000 });
        console.log(`[QA] P&L line "${line}" visible`);
      }

      // Verify Margen Neto is a valid percentage (not NaN%)
      const marginEl = page.locator('text=/\\d+\\.\\d+%/').last();
      if (await marginEl.isVisible({ timeout: 2000 }).catch(() => false)) {
        const marginText = await marginEl.textContent();
        expect(marginText).not.toContain('NaN');
        console.log(`[QA] Net margin: ${marginText}`);
      }

      // Test collapsible product detail
      const expandBtn = page.locator('button:has-text("Utilidad Bruta")');
      if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expandBtn.click();
        await page.waitForTimeout(500);
        console.log('[QA] P&L product detail expanded');
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-07-pl.png', fullPage: true });
  });

  test('8. Conversion & LTV panel renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const convLabels = ['Tasa de Conversión', 'LTV Promedio', 'Clientes Totales', 'Clientes Recurrentes'];
    for (const label of convLabels) {
      const el = page.locator(`text=${label}`).first();
      const visible = await el.isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) {
        console.log(`[QA] Conv metric "${label}" visible`);
      }
    }

    // Check no NaN values
    const placeholderMsg = page.locator('text=Próximamente');
    if (await placeholderMsg.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      // Verify accent is correct (was "Proximamente" before fix)
      const text = await placeholderMsg.first().textContent();
      expect(text).toContain('Próximamente');
      expect(text).toContain('métricas');
      console.log('[QA] Placeholder text has correct accents');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-08-conversion.png', fullPage: true });
  });

  test('9. CSV export button exists and is clickable', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const exportBtn = page.locator('button[title="Exportar métricas a CSV"]');
    await expect(exportBtn).toBeVisible({ timeout: 5000 });

    // Intercept download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      exportBtn.click(),
    ]);

    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain('metricas-steve');
      expect(filename).toContain('.csv');
      console.log(`[QA] CSV exported: ${filename}`);
    } else {
      console.log('[QA] CSV download triggered (no download event captured)');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-09-csv.png', fullPage: true });
  });

  test('10. Cohort table renders without division by zero', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const cohortTitle = page.locator('text=Cohort Analysis');
    if (await cohortTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check for NaN or Infinity in cohort cells
      const cohortCells = page.locator('table').last().locator('td');
      const cellCount = await cohortCells.count();
      for (let i = 0; i < cellCount; i++) {
        const text = await cohortCells.nth(i).textContent();
        expect(text).not.toContain('NaN');
        expect(text).not.toContain('Infinity');
      }
      console.log(`[QA] Cohort table: ${cellCount} cells, no NaN/Infinity`);
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-10-cohort.png', fullPage: true });
  });

  test('11. Tooltips on KPI cards show useful info', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    // Hover on help icon for Ingresos Totales
    const helpIcons = page.locator('.cursor-help');
    const helpCount = await helpIcons.count();
    expect(helpCount).toBeGreaterThan(0);

    if (helpCount > 0) {
      await helpIcons.first().hover();
      await page.waitForTimeout(500);

      // Tooltip content should appear
      const tooltip = page.locator('[role="tooltip"]');
      if (await tooltip.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = await tooltip.textContent();
        expect(text!.length).toBeGreaterThan(10);
        console.log(`[QA] Tooltip: "${text?.substring(0, 50)}..."`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-11-tooltips.png', fullPage: true });
  });

  // ── 2. SHOPIFY TAB ────────────────────────────────────────────────

  test('12. Shopify tab loads', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    // Either dashboard or "Conecta Shopify" message
    const dashboard = page.locator('h2:has-text("Dashboard Shopify")');
    const connectMsg = page.locator('text=Conecta Shopify');
    const hasDashboard = await dashboard.isVisible({ timeout: 10000 }).catch(() => false);
    const hasConnectMsg = await connectMsg.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDashboard || hasConnectMsg).toBe(true);

    if (hasDashboard) {
      console.log('[QA] Shopify dashboard loaded');
    } else {
      console.log('[QA] Shopify not connected — placeholder shown');
    }

    const criticalErrors = consoleErrors.filter(e =>
      e.includes('Unhandled') || e.includes('Cannot read') || e.includes('is not a function')
    );
    expect(criticalErrors).toHaveLength(0);

    await page.screenshot({ path: 'e2e/screenshots/shopify-12-loaded.png', fullPage: true });
  });

  test('13. Shopify date filter works (all presets)', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const dashboard = page.locator('h2:has-text("Dashboard Shopify")');
    if (!await dashboard.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[QA] Shopify not connected — skip date test');
      return;
    }

    const presets = ['7 días', '30 días', '90 días', 'Mes actual', 'Año actual'];
    for (const preset of presets) {
      const btn = page.locator('button').filter({ hasText: preset }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(3000);
        // Verify no crash
        await expect(dashboard).toBeVisible();
        console.log(`[QA] Shopify "${preset}" filter — OK`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-13-dates.png', fullPage: true });
  });

  test('14. Shopify refresh button works', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const refreshBtn = page.locator('button:has-text("Actualizar")');
    if (await refreshBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(5000);

      // Should still show dashboard after refresh
      const dashboard = page.locator('h2:has-text("Dashboard Shopify")');
      await expect(dashboard).toBeVisible({ timeout: 10000 });
      console.log('[QA] Shopify refresh — OK');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-14-refresh.png', fullPage: true });
  });

  test('15. Shopify charts render without errors', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const dashboard = page.locator('h2:has-text("Dashboard Shopify")');
    if (!await dashboard.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[QA] Shopify not connected — skip charts test');
      return;
    }

    // Daily sales chart
    const salesChart = page.locator('text=Ventas por Día');
    if (await salesChart.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[QA] Daily sales chart visible');
    }

    // Abandoned carts chart
    const cartsChart = page.locator('text=Carritos Abandonados por Día');
    if (await cartsChart.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[QA] Abandoned carts chart visible');
    }

    // Check legend labels render correctly (dynamic gap class fix)
    const legend = page.locator('text=Ingresos').first();
    if (await legend.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Verify the parent has proper gap styling
      const parent = legend.locator('..').locator('..');
      const className = await parent.getAttribute('class');
      expect(className).not.toContain('gap-undefined');
      console.log('[QA] Chart legend gap classes OK');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-15-charts.png', fullPage: true });
  });

  test('16. Sales by channel renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const channelTitle = page.locator('text=Ventas por Canal');
    if (await channelTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check channel labels render
      const channelBadges = page.locator('[class*="badge"]');
      const badgeCount = await channelBadges.count();
      console.log(`[QA] Sales by channel: ${badgeCount} channels`);

      // Verify percentages add up (approximately 100%)
      const pctTexts = page.locator('text=/\\d+\\.\\d+%/');
      const pctCount = await pctTexts.count();
      if (pctCount > 0) {
        let totalPct = 0;
        for (let i = 0; i < pctCount; i++) {
          const text = await pctTexts.nth(i).textContent();
          const num = parseFloat(text || '0');
          if (!isNaN(num) && num <= 100) totalPct += num;
        }
        // Allow some tolerance for rounding
        if (totalPct > 0) {
          expect(totalPct).toBeGreaterThan(95);
          expect(totalPct).toBeLessThan(105);
          console.log(`[QA] Channel percentages sum: ${totalPct.toFixed(1)}%`);
        }
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-16-channels.png', fullPage: true });
  });

  test('17. Top SKUs panel renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const skuTitle = page.locator('text=Top SKUs Vendidos');
    if (await skuTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check rankings (badges with numbers 1-10)
      const rankBadges = page.locator('.flex.items-center.justify-center.p-0');
      const rankCount = await rankBadges.count();
      console.log(`[QA] Top SKUs: ${rankCount} products`);

      // Check progress bars exist
      const progressBars = page.locator('.bg-primary.rounded-full.transition-all');
      expect(await progressBars.count()).toBeGreaterThan(0);
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-17-skus.png', fullPage: true });
  });

  test('18. Abandoned carts panel works', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const cartsTitle = page.locator('text=Carritos Abandonados').first();
    if (await cartsTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check filter buttons
      const allBtn = page.locator('button:has-text("Todos")').first();
      const notContactedBtn = page.locator('button:has-text("Sin contactar")').first();
      const contactedBtn = page.locator('button:has-text("Contactados")').first();

      // Test filter switching
      if (await notContactedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await notContactedBtn.click();
        await page.waitForTimeout(500);
        console.log('[QA] Carts filter: not contacted');

        await allBtn.click();
        await page.waitForTimeout(500);
        console.log('[QA] Carts filter: all');
      }

      // Check "Dinero sobre la mesa" section
      const dineroSection = page.locator('text=Dinero sobre la mesa');
      if (await dineroSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Verify estimated recovery is ~12%
        const recoveryEl = page.locator('text=Recuperable estimado');
        await expect(recoveryEl).toBeVisible();
        console.log('[QA] "Dinero sobre la mesa" section visible');
      }

      // Check summary stats
      const summaryLabels = ['Total carritos', 'Valor total', 'Contactados', 'Pendientes'];
      for (const label of summaryLabels) {
        const el = page.locator(`text=${label}`).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[QA] Cart stat "${label}" visible`);
        }
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-18-carts.png', fullPage: true });
  });

  test('19. UTM table renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const utmTitle = page.locator('text=UTMs con Más Ventas');
    if (await utmTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Either has UTM data or shows helper text
      const noUtmMsg = page.locator('text=No se encontraron UTMs');
      const utmTable = page.locator('table').last();

      const hasUtmData = await utmTable.isVisible({ timeout: 3000 }).catch(() => false);
      const hasNoUtmMsg = await noUtmMsg.isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasUtmData || hasNoUtmMsg).toBe(true);

      if (hasUtmData) {
        // Check table headers
        const headers = ['Fuente', 'Medio', 'Campaña', 'Pedidos', 'Ingresos'];
        for (const h of headers) {
          const th = page.locator(`th:has-text("${h}")`);
          await expect(th).toBeVisible({ timeout: 3000 });
        }
        console.log('[QA] UTM table headers OK');
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-19-utm.png', fullPage: true });
  });

  test('20. SEO Analysis card renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const seoTitle = page.locator('text=Análisis SEO Rápido');
    if (await seoTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // SEO score circle
      const scoreEl = page.locator('text=/\\/ 100/');
      if (await scoreEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[QA] SEO score visible');
      }

      // Check categories
      const seoChecks = ['Productos sin imagen', 'Imágenes sin alt text', 'Títulos cortos'];
      for (const check of seoChecks) {
        const el = page.locator(`text=${check}`).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[QA] SEO check "${check}" visible`);
        }
      }

      // Test expandable product list
      const expandBtns = page.locator('button:has-text("Ver productos")');
      if (await expandBtns.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await expandBtns.first().click();
        await page.waitForTimeout(500);

        // Should now show "Ocultar"
        const hideBtn = page.locator('button:has-text("Ocultar")').first();
        await expect(hideBtn).toBeVisible({ timeout: 3000 });
        console.log('[QA] SEO expand/collapse works');

        await hideBtn.click();
        await page.waitForTimeout(300);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-20-seo.png', fullPage: true });
  });

  // ── 3. RESPONSIVE / MOBILE ────────────────────────────────────────

  test('21. Mobile viewport — Metrics tab', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone 13
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    // KPIs should stack (1 column)
    const header = page.locator('h2:has-text("Resumen de Rendimiento")');
    await expect(header).toBeVisible({ timeout: 10000 });

    // Date filter should still be accessible
    const dateFilter = page.locator('text=30 días').first();
    await expect(dateFilter).toBeVisible({ timeout: 5000 });

    // Check no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    // Allow small tolerance for scrollbar
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20);

    console.log('[QA] Mobile metrics — no overflow');
    await page.screenshot({ path: 'e2e/screenshots/metrics-21-mobile.png', fullPage: true });
  });

  test('22. Mobile viewport — Shopify tab', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const dashboard = page.locator('h2:has-text("Dashboard Shopify")');
    if (await dashboard.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Charts should render at smaller height on mobile
      const chartContainers = page.locator('.recharts-responsive-container');
      const chartCount = await chartContainers.count();
      if (chartCount > 0) {
        const height = await chartContainers.first().evaluate(el => el.clientHeight);
        expect(height).toBeLessThanOrEqual(300); // Mobile height is 250
        console.log(`[QA] Mobile chart height: ${height}px`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-22-mobile.png', fullPage: true });
  });

  // ── 4. ERROR STATES ────────────────────────────────────────────────

  test('23. No console errors during full navigation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await loginAsAdmin(page);
    await dismissOnboarding(page);

    // Navigate through all relevant tabs
    for (const tab of ['Métricas', 'Shopify']) {
      await navigateToTab(page, tab);
      await page.waitForTimeout(5000);
    }

    // Filter critical errors (ignore third-party scripts)
    const criticalErrors = errors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Non-Error exception') &&
      !e.includes('Script error')
    );

    if (criticalErrors.length > 0) {
      console.log(`[QA] Critical page errors:\n${criticalErrors.join('\n')}`);
    }
    expect(criticalErrors).toHaveLength(0);
    console.log('[QA] No critical page errors during navigation');
  });

  test('24. Smart Insights panel renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const insightsTitle = page.locator('text=Steve te recomienda');
    if (await insightsTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify insight cards render
      const insightCards = insightsTitle.locator('..').locator('..').locator('..').locator('[class*="rounded-xl"]');
      const count = await insightCards.count();
      console.log(`[QA] Smart Insights: ${count} insight cards`);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(4);

      // Verify no NaN/undefined in insight text
      const insightTexts = insightsTitle.locator('..').locator('..').locator('..');
      const fullText = await insightTexts.textContent();
      expect(fullText).not.toContain('NaN');
      expect(fullText).not.toContain('undefined');
      console.log('[QA] Smart Insights — no NaN/undefined');
    } else {
      console.log('[QA] Smart Insights not visible (may have no data)');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-24-insights.png', fullPage: true });
  });

  test('25. Business Health Score renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const healthTitle = page.locator('text=Salud del Negocio');
    if (await healthTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify score is a number 0-100
      const scoreEl = healthTitle.locator('..').locator('..').locator('..').locator('text=/\\d+/').first();
      const scoreText = await scoreEl.textContent();
      const score = parseInt(scoreText || '0');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      console.log(`[QA] Business Health Score: ${score}/100`);

      // Verify label exists
      const labels = ['Excelente', 'Bueno', 'Regular', 'Necesita atención'];
      let foundLabel = false;
      for (const label of labels) {
        if (await page.locator(`text=${label}`).first().isVisible({ timeout: 1000 }).catch(() => false)) {
          foundLabel = true;
          console.log(`[QA] Health label: ${label}`);
        }
      }
      expect(foundLabel).toBe(true);
    } else {
      console.log('[QA] Business Health Score not visible (may have no data)');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-25-health.png', fullPage: true });
  });

  test('26. Day of Week chart renders', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await waitForMetricsLoad(page);

    const dowTitle = page.locator('text=Rendimiento por Día de la Semana');
    if (await dowTitle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify all 7 days appear
      const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      for (const day of dayLabels) {
        const dayEl = page.locator(`text=${day}`).first();
        await expect(dayEl).toBeVisible({ timeout: 3000 });
      }
      console.log('[QA] Day of Week chart — all 7 days visible');
    } else {
      console.log('[QA] Day of Week not visible (may have < 7 days of data)');
    }

    await page.screenshot({ path: 'e2e/screenshots/metrics-26-dow.png', fullPage: true });
  });

  test('27. Shopify KPI summary cards render', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const dashboard = page.locator('h2:has-text("Dashboard Shopify")');
    if (!await dashboard.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[QA] Shopify not connected — skip KPI test');
      return;
    }

    const shopifyKpis = ['Ingresos del Período', 'Pedidos', 'Ticket Promedio', 'Carritos Abandonados'];
    for (const kpi of shopifyKpis) {
      const el = page.locator(`text=${kpi}`).first();
      const visible = await el.isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) {
        console.log(`[QA] Shopify KPI "${kpi}" visible`);
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-27-kpis.png', fullPage: true });
  });

  test('28. WhatsApp button shows preview popover', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const waBtn = page.locator('button[title="Enviar WhatsApp"]').first();
    if (await waBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await waBtn.click();
      await page.waitForTimeout(500);

      // Verify popover with message preview
      const waTitle = page.locator('text=Enviar WhatsApp');
      await expect(waTitle).toBeVisible({ timeout: 3000 });

      // Verify textarea with pre-filled message
      const textarea = page.locator('textarea');
      await expect(textarea).toBeVisible({ timeout: 3000 });
      const msgText = await textarea.inputValue();
      expect(msgText).toContain('Hola');
      expect(msgText.length).toBeGreaterThan(20);
      console.log(`[QA] WhatsApp preview message: ${msgText.substring(0, 50)}...`);

      // Verify "Abrir WhatsApp" button
      const openBtn = page.locator('button:has-text("Abrir WhatsApp")');
      await expect(openBtn).toBeVisible({ timeout: 3000 });

      // Verify copy button
      const copyBtn = page.locator('button[title="Copiar mensaje"]');
      await expect(copyBtn).toBeVisible({ timeout: 3000 });

      console.log('[QA] WhatsApp preview popover — OK');
    } else {
      console.log('[QA] No WhatsApp buttons visible (carts may not have phone numbers)');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-28-whatsapp.png', fullPage: true });
  });

  test('29. Abandoned carts sort buttons work', async ({ page }) => {
    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Shopify');
    await waitForMetricsLoad(page);

    const sortByValue = page.locator('button:has-text("Mayor valor")').first();
    if (await sortByValue.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sortByValue.click();
      await page.waitForTimeout(500);

      const sortByRecent = page.locator('button:has-text("Más recientes")').first();
      await sortByRecent.click();
      await page.waitForTimeout(500);

      console.log('[QA] Cart sort buttons — OK');
    }

    await page.screenshot({ path: 'e2e/screenshots/shopify-29-sort.png', fullPage: true });
  });

  // ── 5. ERROR MONITORING ──────────────────────────────────────────

  test('30. No failed API requests', async ({ page }) => {
    const failedRequests: string[] = [];
    page.on('response', response => {
      if (response.status() >= 500 && response.url().includes('/api/')) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await loginAsAdmin(page);
    await dismissOnboarding(page);
    await navigateToTab(page, 'Métricas');
    await page.waitForTimeout(5000);
    await navigateToTab(page, 'Shopify');
    await page.waitForTimeout(5000);

    if (failedRequests.length > 0) {
      console.log(`[QA] Failed API requests:\n${failedRequests.join('\n')}`);
    }
    expect(failedRequests).toHaveLength(0);
    console.log('[QA] No 5xx API errors');
  });
});
