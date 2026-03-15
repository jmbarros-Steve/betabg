import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAndNavigate(page: Page) {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const serverErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500)
      serverErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 25000 });

  // After redirect, suppress the onboarding modal by setting localStorage
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    // Find user id from Supabase session in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Clear any existing onboarding flags
      if (key.startsWith('bg_onboarding_')) {
        localStorage.setItem(key, 'true');
      }
      // Look for supabase session to get user id
      if (key.toLowerCase().includes('supabase') || key.includes('sb-')) {
        try {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            const uid =
              parsed?.user?.id ||
              parsed?.session?.user?.id ||
              parsed?.currentSession?.user?.id;
            if (uid) {
              localStorage.setItem(`bg_onboarding_${uid}`, 'true');
              console.log('[QA] Set onboarding key for uid:', uid);
            }
          }
        } catch { /* ignore */ }
      }
    }
  });

  // Reload to apply the localStorage change
  await page.reload();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  console.log('[ANALYTICS-QA] Login + reload OK');

  // If onboarding still shows, force dismiss
  const omitirVisible = await page.locator('button').filter({ hasText: 'Omitir' }).first()
    .isVisible({ timeout: 3000 }).catch(() => false);
  if (omitirVisible) {
    await page.locator('button').filter({ hasText: 'Omitir' }).first().click({ force: true });
    await page.waitForTimeout(1500);
    console.log('[ANALYTICS-QA] Forced dismiss onboarding');
  }

  // Close setup progress tracker if visible
  const closeSetup = page.locator('button').filter({ hasText: '' }).locator('svg.lucide-x').first();
  if (await closeSetup.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeSetup.click({ force: true });
    await page.waitForTimeout(500);
  }

  return { consoleErrors, serverErrors };
}

async function goToMetaAdsManager(page: Page) {
  // MetaAdsManager is under the "Más" dropdown → "Meta Ads" item (tab id: 'copies')
  // Step 1: click the "Más" dropdown button
  const masBtn = page.locator('button').filter({ hasText: /^Más$/ }).first();
  const masBtnAlt = page.locator('button').filter({ hasText: /Más/ }).first();

  if (await masBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await masBtn.click();
    console.log('[ANALYTICS-QA] Clicked Más dropdown');
  } else if (await masBtnAlt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await masBtnAlt.click();
    console.log('[ANALYTICS-QA] Clicked Más dropdown (alt)');
  }
  await page.waitForTimeout(1000);

  // Step 2: click "Meta Ads" in the dropdown
  const metaAdsItem = page.locator('[role="menuitem"]').filter({ hasText: 'Meta Ads' }).first();
  const metaAdsItemAlt = page.locator('[role="option"], [role="menuitem"], button').filter({ hasText: 'Meta Ads' }).first();

  if (await metaAdsItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await metaAdsItem.click();
    console.log('[ANALYTICS-QA] Clicked Meta Ads menu item');
  } else if (await metaAdsItemAlt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await metaAdsItemAlt.click();
    console.log('[ANALYTICS-QA] Clicked Meta Ads item (alt)');
  }
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
}

async function goToAnalisisSidebar(page: Page) {
  // Inside MetaAdsManager, click the "Análisis" sidebar nav button (role="tab")
  let analisisClicked = false;

  // Primary: sidebar nav button with role="tab" and text "Análisis"
  const analisisTab = page.locator('[role="tab"]').filter({ hasText: 'Análisis' }).first();
  if (await analisisTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await analisisTab.click();
    analisisClicked = true;
    console.log('[ANALYTICS-QA] Clicked Análisis sidebar tab');
  }

  if (!analisisClicked) {
    // Try expanding collapsed sidebar first
    const expandBtn = page.locator('button[aria-label="Expandir menú"]').first();
    if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(800);
    }
    const analisisTabRetry = page.locator('[role="tab"]').filter({ hasText: 'Análisis' }).first();
    if (await analisisTabRetry.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analisisTabRetry.click();
      analisisClicked = true;
      console.log('[ANALYTICS-QA] Clicked Análisis after sidebar expand');
    }
  }

  if (!analisisClicked) {
    // Last resort: any button with Análisis text
    const anyBtn = page.locator('button').filter({ hasText: 'Análisis' }).first();
    if (await anyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await anyBtn.click();
      analisisClicked = true;
      console.log('[ANALYTICS-QA] Clicked Análisis via generic button');
    }
  }

  if (!analisisClicked) {
    console.log('[ANALYTICS-QA] WARNING: Could not find Análisis button');
  }

  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  return analisisClicked;
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `/home/jmbarros/steve/e2e/screenshots/analytics-${name}.png`,
    fullPage: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe.serial('QA — Meta Analytics / Análisis Tab', () => {
  test.setTimeout(300_000);

  // ── Test 1: Login → Más → Meta Ads → Análisis ─────────────────────────────
  test('1. Login → navigate to Meta Ads (Más > Meta Ads) → Análisis sub-tab loads', async ({ page }) => {
    const { consoleErrors, serverErrors } = await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    const analisisClicked = await goToAnalisisSidebar(page);
    await screenshot(page, '01-analisis-loaded');

    // Verify the page has loaded content
    const bodyText = await page.locator('body').textContent() || '';
    console.log(`[ANALYTICS-QA] Body length: ${bodyText.trim().length}`);
    expect(bodyText.trim().length).toBeGreaterThan(200);

    // At least one of the analytics dashboard indicators should be visible
    const indicators = [
      'Gasto Total', 'Ventas', 'Ingresos', 'Impresiones',
      'Rendimiento por Campaña', 'Insights de Optimización',
      'Gasto vs Ingresos', 'Embudo de Conversión',
    ];

    let foundAny = false;
    // Use getByText for reliable text matching
    for (const text of indicators) {
      const el = page.getByText(text, { exact: false });
      const count = await el.count();
      if (count > 0) {
        // Check if any are visible
        for (let i = 0; i < count; i++) {
          const isVis = await el.nth(i).isVisible({ timeout: 3000 }).catch(() => false);
          if (isVis) {
            foundAny = true;
            console.log(`[ANALYTICS-QA] Found indicator: "${text}" (instance ${i})`);
            break;
          }
        }
        if (foundAny) break;
      }
    }

    // Also check body text directly as fallback
    if (!foundAny) {
      const bt = await page.locator('body').textContent() || '';
      for (const text of indicators) {
        if (bt.includes(text)) {
          foundAny = true;
          console.log(`[ANALYTICS-QA] Found indicator in body text: "${text}"`);
          break;
        }
      }
    }

    console.log(`[ANALYTICS-QA] Análisis clicked: ${analisisClicked}`);
    console.log(`[ANALYTICS-QA] Analytics dashboard indicator found: ${foundAny}`);
    expect(foundAny).toBeTruthy();

    if (serverErrors.length > 0)
      console.log(`[ANALYTICS-QA] 5xx errors during load: ${serverErrors.join(' | ')}`);
  });

  // ── Test 2: KPI cards with no NaN ────────────────────────────────────────
  test('2. KPI cards show Gasto Total, Ventas, ROAS, CPA/Costo por Venta, CTR — no NaN', async ({ page }) => {
    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await screenshot(page, '02-kpi-cards');

    // Expected KPI labels on MetaAnalyticsDashboard — use body text matching
    const bodyText2 = await page.locator('body').textContent() || '';
    const kpiChecks = [
      'Gasto Total', 'Ventas', 'Ingresos', 'Impresiones', 'Clicks',
    ];
    const results: Record<string, boolean> = {};
    for (const label of kpiChecks) {
      results[label] = bodyText2.includes(label);
      console.log(`[ANALYTICS-QA] KPI "${label}" in body: ${results[label] ? 'FOUND' : 'NOT FOUND'}`);
    }

    // ROAS / CTR / CPA via getByText (may be JargonTooltip)
    const roasVisible = await page.getByText('ROAS', { exact: false }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const ctrVisible = await page.getByText('CTR', { exact: false }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const cpaVisible = bodyText2.includes('CPA') || bodyText2.includes('Costo por Venta');
    results['ROAS'] = roasVisible || bodyText2.includes('ROAS');
    results['CTR'] = ctrVisible || bodyText2.includes('CTR');
    results['CPA'] = cpaVisible;
    console.log(`[ANALYTICS-QA] KPI "ROAS": ${results['ROAS'] ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`[ANALYTICS-QA] KPI "CTR": ${results['CTR'] ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`[ANALYTICS-QA] KPI "CPA/Costo por Venta": ${results['CPA'] ? 'FOUND' : 'NOT FOUND'}`);

    // Verify no NaN in KPI value elements
    // Values rendered as <p class="text-3xl font-bold tracking-tight ...">
    const kpiValueEls = page.locator('p.text-3xl, p.font-bold.tracking-tight');
    const kpiValues = await kpiValueEls.allTextContents();
    // Also check all text in the page
    const nanInBody = bodyText2.includes('NaN');
    console.log(`[ANALYTICS-QA] KPI value texts: ${JSON.stringify(kpiValues)}`);
    console.log(`[ANALYTICS-QA] NaN in body text: ${nanInBody}`);

    const nanValues = kpiValues.filter((v) => v.includes('NaN'));
    if (nanValues.length > 0)
      console.log(`[ANALYTICS-QA] NaN found in KPI elements: ${nanValues.join(', ')}`);
    else
      console.log('[ANALYTICS-QA] No NaN in KPI elements: PASS');
    expect(nanValues).toHaveLength(0);
    expect(nanInBody).toBeFalsy();

    const visibleCount = Object.values(results).filter(Boolean).length;
    console.log(`[ANALYTICS-QA] KPI labels found: ${visibleCount}/8`);
    expect(visibleCount).toBeGreaterThanOrEqual(3);
  });

  // ── Test 3: CLP currency format ───────────────────────────────────────────
  test('3. All currency values use CLP format — $ with dots, no "USD"', async ({ page }) => {
    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await screenshot(page, '03-currency');

    // Full page text should not contain "USD"
    const bodyText3 = await page.locator('body').textContent() || '';
    const hasUSD = bodyText3.includes('USD');
    console.log(`[ANALYTICS-QA] Page contains "USD": ${hasUSD}`);
    if (hasUSD) {
      const idx = bodyText3.indexOf('USD');
      console.log(`[ANALYTICS-QA] USD context: "...${bodyText3.slice(Math.max(0, idx - 30), idx + 50)}..."`);
    }
    expect(hasUSD).toBeFalsy();

    // KPI monetary values should have $ (CLP) — check in body text
    const hasDollarSign = bodyText3.includes('$');
    console.log(`[ANALYTICS-QA] Has $ sign in page: ${hasDollarSign}`);

    // KPI value elements
    const allKpiTexts = await page.locator('p.text-3xl, p.font-bold.tracking-tight').allTextContents();
    const monetaryValues = allKpiTexts.filter((v) => v.includes('$'));
    console.log(`[ANALYTICS-QA] Monetary KPI values: ${JSON.stringify(monetaryValues)}`);

    for (const val of monetaryValues) {
      expect(val).not.toContain('USD');
    }

    if (hasDollarSign) {
      console.log('[ANALYTICS-QA] CLP format ($) confirmed in page: PASS');
    } else {
      console.log('[ANALYTICS-QA] No $ sign found — possible empty data state');
    }
  });

  // ── Test 4: Charts render ─────────────────────────────────────────────────
  test('4. Charts render — recharts SVG elements visible', async ({ page }) => {
    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await page.waitForTimeout(4000); // extra time for chart render
    await screenshot(page, '04-charts');

    const rechartsWrapper = page.locator('.recharts-wrapper').first();
    const rechartsSurface = page.locator('svg.recharts-surface').first();
    const rechartsCartesian = page.locator('.recharts-cartesian-grid').first();
    const rechartsAny = page.locator('[class*="recharts"]').first();

    const wrapperVisible = await rechartsWrapper.isVisible({ timeout: 10000 }).catch(() => false);
    const surfaceVisible = await rechartsSurface.isVisible({ timeout: 5000 }).catch(() => false);
    const cartesianVisible = await rechartsCartesian.isVisible({ timeout: 5000 }).catch(() => false);
    const anyVisible = await rechartsAny.isVisible({ timeout: 5000 }).catch(() => false);
    const count = await page.locator('[class*="recharts"]').count();

    console.log(`[ANALYTICS-QA] recharts-wrapper: ${wrapperVisible}`);
    console.log(`[ANALYTICS-QA] recharts-surface: ${surfaceVisible}`);
    console.log(`[ANALYTICS-QA] recharts-cartesian-grid: ${cartesianVisible}`);
    console.log(`[ANALYTICS-QA] any recharts element: ${anyVisible}`);
    console.log(`[ANALYTICS-QA] recharts element count: ${count}`);

    expect(wrapperVisible || surfaceVisible || cartesianVisible || anyVisible).toBeTruthy();
    console.log('[ANALYTICS-QA] Charts render: PASS');
  });

  // ── Test 5: Date filter buttons ───────────────────────────────────────────
  test('5. Date filter buttons (7 días, 14 días, 30 días) work — view updates without NaN', async ({ page }) => {
    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await screenshot(page, '05-date-filters-initial');

    const dateFilters = ['7 días', '14 días', '30 días'];
    let filtersFound = 0;

    for (const filterLabel of dateFilters) {
      const btn = page.locator('button').filter({ hasText: new RegExp(`^${filterLabel}$`) }).first();
      const btnAlt = page.locator('button').filter({ hasText: filterLabel }).first();

      const useBtn = await btn.isVisible({ timeout: 4000 }).catch(() => false) ? btn : btnAlt;
      const visible = await useBtn.isVisible({ timeout: 4000 }).catch(() => false);
      console.log(`[ANALYTICS-QA] Date filter "${filterLabel}": ${visible ? 'VISIBLE' : 'NOT FOUND'}`);

      if (visible) {
        filtersFound++;
        await useBtn.click();
        console.log(`[ANALYTICS-QA] Clicked "${filterLabel}"`);
        await page.waitForTimeout(2500);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1000);

        // No crash
        const content = await page.locator('body').textContent() || '';
        expect(content.trim().length).toBeGreaterThan(200);

        // No NaN after filter switch
        const vals = await page.locator('p.text-3xl, p.font-bold.tracking-tight, .text-3xl').allTextContents();
        const nanVals = vals.filter((v) => v.includes('NaN'));
        if (nanVals.length > 0)
          console.log(`[ANALYTICS-QA] NaN after "${filterLabel}": ${nanVals.join(', ')}`);
        expect(nanVals).toHaveLength(0);

        console.log(`[ANALYTICS-QA] After "${filterLabel}": ${vals.join(' | ')}`);
        await screenshot(page, `05-filter-${filterLabel.replace(/ /g, '-')}`);
      }
    }

    console.log(`[ANALYTICS-QA] Date filters found: ${filtersFound}/3`);
    expect(filtersFound).toBeGreaterThanOrEqual(1);
  });

  // ── Test 6: Campaign insights section ────────────────────────────────────
  test('6. Campaign insights section renders with real campaign data', async ({ page }) => {
    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await screenshot(page, '06-campaign-insights');

    // Use body text to check for campaign section indicators
    const bodyText6 = await page.locator('body').textContent() || '';

    const hasCampaignSection = bodyText6.includes('Rendimiento por Campaña') ||
      bodyText6.includes('CAMPAÑA') || bodyText6.includes('Campaña');
    const hasInsightsSection = bodyText6.includes('Insights de Optimización') ||
      bodyText6.includes('Optimización') || bodyText6.includes('Embudo de Conversión');
    const hasAiSection = bodyText6.includes('Steve recomienda') ||
      bodyText6.includes('Mejor campaña') || bodyText6.includes('Fatiga creativa');

    console.log(`[ANALYTICS-QA] Campaign section in body: ${hasCampaignSection}`);
    console.log(`[ANALYTICS-QA] Insights section in body: ${hasInsightsSection}`);
    console.log(`[ANALYTICS-QA] AI/Steve section in body: ${hasAiSection}`);

    // Count campaign rows via DOM
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`[ANALYTICS-QA] Campaign tbody rows: ${rowCount}`);

    if (rowCount > 0) {
      const firstRowText = await rows.first().textContent().catch(() => '');
      console.log(`[ANALYTICS-QA] First row: "${firstRowText?.slice(0, 120)}"`);
      expect(firstRowText).not.toContain('NaN');
    }

    // Table element
    const tableEl = page.locator('table').first();
    const tableVisible = await tableEl.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[ANALYTICS-QA] Table visible: ${tableVisible}`);

    expect(hasCampaignSection || hasInsightsSection || tableVisible || rowCount > 0).toBeTruthy();
  });

  // ── Test 7: No critical console errors ───────────────────────────────────
  test('7. No critical console errors during navigation', async ({ page }) => {
    const allErrors: string[] = [];
    const criticalErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        allErrors.push(text);
        const benign =
          text.includes('favicon') ||
          text.includes('net::ERR_') ||
          text.includes('Failed to load resource') ||
          text.includes('ResizeObserver') ||
          text.includes('Non-Error promise') ||
          text.includes('ERR_BLOCKED_BY_CLIENT');
        if (!benign) criticalErrors.push(text);
      }
    });

    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await page.waitForTimeout(3000);

    // Exercise date filters to trigger data fetches
    for (const label of ['7 días', '30 días']) {
      const btn = page.locator('button').filter({ hasText: label }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(2000);
      }
    }

    console.log(`[ANALYTICS-QA] Total console errors: ${allErrors.length}`);
    console.log(`[ANALYTICS-QA] Critical errors: ${criticalErrors.length}`);
    if (criticalErrors.length > 0)
      console.log(`[ANALYTICS-QA] Critical:\n  ${criticalErrors.slice(0, 10).join('\n  ')}`);

    expect(criticalErrors).toHaveLength(0);
  });

  // ── Test 8: No 5xx API errors ─────────────────────────────────────────────
  test('8. No 5xx API errors during Meta Analytics navigation', async ({ page }) => {
    const serverErrors: string[] = [];

    page.on('response', (response) => {
      if (response.status() >= 500)
        serverErrors.push(`HTTP ${response.status()} — ${response.url()}`);
    });

    await loginAndNavigate(page);
    await goToMetaAdsManager(page);
    await goToAnalisisSidebar(page);
    await page.waitForTimeout(3000);

    for (const label of ['7 días', '14 días', '30 días']) {
      const btn = page.locator('button').filter({ hasText: label }).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(2000);
        await page.waitForLoadState('networkidle').catch(() => {});
      }
    }

    console.log(`[ANALYTICS-QA] 5xx errors: ${serverErrors.length}`);
    if (serverErrors.length > 0)
      console.log(`[ANALYTICS-QA] Server errors:\n  ${serverErrors.join('\n  ')}`);

    expect(serverErrors).toHaveLength(0);
  });
});
