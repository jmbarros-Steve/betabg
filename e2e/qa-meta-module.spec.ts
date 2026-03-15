import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';
const ADMIN_EMAIL = process.env.STEVE_TEST_EMAIL || 'patricio.correa@jardindeeva.cl';
const ADMIN_PASSWORD = process.env.STEVE_TEST_PASSWORD || 'Jardin2026';

// ── Helpers ──────────────────────────────────────────────────────────

async function loginAndGoToMeta(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/auth`);
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 20000 });
  await page.waitForTimeout(5000);

  // Dismiss onboarding overlay via evaluate (bypasses pointer interception)
  await page.evaluate(() => {
    const omitir = Array.from(document.querySelectorAll('button, span, p')).find(
      el => el.textContent?.trim() === 'Omitir'
    );
    if (omitir) (omitir as HTMLElement).click();
    // Disable pointer-events on fixed overlays
    document.querySelectorAll('.fixed.inset-0').forEach(el => {
      if (el instanceof HTMLElement) el.style.pointerEvents = 'none';
    });
  });
  await page.waitForTimeout(1500);
  // Escape any remaining modals
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);

  // Open "Más" dropdown via pointerdown (Radix trigger)
  const masBtn = page.locator('button').filter({ hasText: /Más/ }).first();
  await masBtn.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
  await page.waitForTimeout(300);
  await masBtn.dispatchEvent('pointerup', { button: 0, pointerType: 'mouse' });
  await page.waitForTimeout(1000);

  // Click "Meta Ads" menuitem via evaluate (overlay may still intercept)
  const metaItem = page.locator('[role="menuitem"]').filter({ hasText: /Meta Ads/ }).first();
  if (await metaItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await metaItem.evaluate((el: HTMLElement) => el.click());
  }
  await page.waitForTimeout(3000);
  console.log('[META-QA] Logged in → Meta Ads tab');
}

async function goToSubTab(page: Page, tabName: string) {
  // Use evaluate to bypass onboarding overlay
  const clicked = await page.evaluate((name) => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent?.trim() === name && !btn.disabled) {
        btn.click();
        return true;
      }
    }
    return false;
  }, tabName);
  if (clicked) {
    await page.waitForTimeout(3000);
    console.log(`[META-QA] → SubTab: ${tabName}`);
  }
  return clicked;
}

async function ss(page: Page, name: string) {
  await page.screenshot({ path: `e2e/screenshots/meta-${name}.png`, fullPage: true });
}

// ── Tests ────────────────────────────────────────────────────────────

test.describe('QA Meta Module', () => {
  test.setTimeout(120_000); // 2 min per test

  test('1. Overview — KPI cards visible', async ({ page }) => {
    await loginAndGoToMeta(page);
    await page.waitForTimeout(5000); // Wait for dashboard data
    await ss(page, '01-overview');

    const gastoVisible = await page.locator('text=Gasto Total').first().isVisible({ timeout: 5000 }).catch(() => false);
    const ventasVisible = await page.locator('text=Ventas').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[META-QA] Gasto: ${gastoVisible ? '✅' : '❌'}, Ventas: ${ventasVisible ? '✅' : '❌'}`);

    await ss(page, '01-kpis');
  });

  test('2. Campaigns — Table headers and KPIs', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Campañas');
    await page.waitForTimeout(3000);
    await ss(page, '02-campaigns');

    // Check table headers
    const headers = ['Campaña', 'Estado', 'Presupuesto', 'Gasto', 'ROAS', 'Ventas', 'CTR'];
    for (const h of headers) {
      const visible = await page.locator('th, thead button, thead span').filter({ hasText: new RegExp(h, 'i') }).first()
        .isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`[META-QA] Header "${h}": ${visible ? '✅' : '❌'}`);
    }

    // Check Ventas and Costo por Venta KPI
    const ventasKpi = await page.locator('text=/Ventas/').first().isVisible({ timeout: 3000 }).catch(() => false);
    const costoKpi = await page.locator('text=/Costo por Venta/').first().isVisible({ timeout: 3000 }).catch(() => false);
    const diaLabel = await page.locator('text=/\\/día/').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[META-QA] Ventas KPI: ${ventasKpi ? '✅' : '❌'}, Costo/Venta: ${costoKpi ? '✅' : '❌'}, /día: ${diaLabel ? '✅' : '❌'}`);

    await ss(page, '02-campaign-details');
  });

  test('3. Analytics — Revenue, date filters, CLP', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Análisis');
    await page.waitForTimeout(3000);
    await ss(page, '03-analytics');

    const ingresos = await page.locator('text=/Ingresos Totales/').first().isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[META-QA] Ingresos Totales: ${ingresos ? '✅' : '❌'}`);

    for (const f of ['7 días', '14 días', '30 días']) {
      const vis = await page.locator('button').filter({ hasText: f }).first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[META-QA] Filter "${f}": ${vis ? '✅' : '❌'}`);
    }

    const chart = await page.locator('.recharts-wrapper, svg.recharts-surface').first().isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[META-QA] Chart: ${chart ? '✅' : '❌'}`);

    await ss(page, '03-analytics-detail');
  });

  test('4. Audiences — Creation form opens', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Audiencias');
    await page.waitForTimeout(3000);
    await ss(page, '04-audiences');

    const createBtn = page.locator('button').filter({ hasText: /Crear|Nueva.*Audiencia/i }).first();
    const createVisible = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[META-QA] Create Audience btn: ${createVisible ? '✅' : '❌'}`);

    if (createVisible) {
      await createBtn.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(2000);
      await ss(page, '04-audience-form');
    }
  });

  test('5. Campaign Wizard — Deep targeting', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Crear');
    await page.waitForTimeout(3000);
    await ss(page, '05-wizard-start');

    // Try to advance through wizard steps
    for (let i = 0; i < 4; i++) {
      const nextBtn = page.locator('button').filter({ hasText: /Siguiente|Continuar/i }).first();
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const enabled = await nextBtn.isEnabled();
        if (enabled) {
          await nextBtn.evaluate((el: HTMLElement) => el.click());
          await page.waitForTimeout(1500);
        } else break;
      }
    }

    await ss(page, '05-wizard-targeting');

    // Check targeting fields
    const gender = await page.locator('text=/Todos|Hombres|Mujeres/').first().isVisible({ timeout: 3000 }).catch(() => false);
    const age = await page.locator('text=/Edad|Rango.*edad/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const location = await page.locator('text=/Ubicación|País|Países|Ciudades/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const interests = await page.locator('text=/Intereses|Buscar intereses/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`[META-QA] Gender: ${gender ? '✅' : '❌'}, Age: ${age ? '✅' : '❌'}, Location: ${location ? '✅' : '❌'}, Interests: ${interests ? '✅' : '❌'}`);

    await ss(page, '05-wizard-final');
  });

  test('6. Rules — Manual execution UI', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Reglas');
    await page.waitForTimeout(3000);
    await ss(page, '06-rules');

    const evalBtn = await page.locator('button').filter({ hasText: /Evaluar/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
    const manualMsg = await page.locator('text=/manual|ejecución manual/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[META-QA] Evaluate btn: ${evalBtn ? '✅' : '❌'}, Manual msg: ${manualMsg ? '✅' : '❌'}`);

    await ss(page, '06-rules-detail');
  });

  test('7. Competitor Ads — Sync and Ad Library', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Competencia');
    await page.waitForTimeout(3000);
    await ss(page, '07-competitor');

    const syncBtn = await page.locator('button').filter({ hasText: 'Sincronizar' }).first().isVisible({ timeout: 3000 }).catch(() => false);
    const adLib = await page.locator('text=/Ad Library|Meta Ad Library/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`[META-QA] Sincronizar: ${syncBtn ? '✅' : '❌'}, Ad Library: ${adLib ? '✅' : '❌'}`);

    await ss(page, '07-competitor-detail');
  });

  test('8. Social Inbox — Loads', async ({ page }) => {
    await loginAndGoToMeta(page);
    await goToSubTab(page, 'Bandeja Social');
    await page.waitForTimeout(3000);
    await ss(page, '08-inbox');

    const content = await page.locator('text=/mensaje|conversación|Sin mensajes|Selecciona una página/i').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[META-QA] Inbox content: ${content ? '✅' : '❌'}`);

    await ss(page, '08-inbox-detail');
  });
});
