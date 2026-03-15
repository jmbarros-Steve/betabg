import { test, Page } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASSWORD = 'Jardin2026';

async function login(page: Page) {
  await page.goto(`${BASE}/auth`);
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 25000 });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 5; i++) {
    const btn = page.getByText('Omitir', { exact: true });
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(1000);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const m = page.locator('[role="dialog"], .fixed.inset-0').first();
      if (!(await m.isVisible({ timeout: 500 }).catch(() => false))) break;
    }
  }
  await page.waitForTimeout(1500);
}

async function goToSteveMail(page: Page) {
  // Try direct
  let tab = page.locator('button, a, [role="tab"]').filter({ hasText: /Steve Mail/ }).first();
  if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tab.click({ force: true });
    await page.waitForTimeout(3000);
    return;
  }
  // Via Más dropdown
  const mas = page.locator('button').filter({ hasText: /^Más/ }).first();
  if (await mas.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mas.click({ force: true });
    await page.waitForTimeout(800);
    const item = page.locator('[role="menuitem"]').filter({ hasText: /Steve Mail/ }).first();
    if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
      await item.click({ force: true });
      await page.waitForTimeout(3000);
    }
  }
}

const ss = (page: Page, name: string) =>
  page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

test('Capture all Steve Mail tabs', async ({ page }) => {
  await login(page);
  await goToSteveMail(page);
  await page.waitForTimeout(2000);

  // 1. Campañas (default)
  await ss(page, '01-campanas');

  // Click "Nueva Campaña" if visible
  const newBtn = page.getByRole('button', { name: /Nueva Campa/ }).first();
  if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(3000);
    await ss(page, '02-campana-crear');
    // Go back
    const back = page.locator('button').filter({ hasText: /Volver|Cancelar/ }).first();
    if (await back.isVisible({ timeout: 2000 }).catch(() => false)) await back.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
  }

  // 2. Contactos
  const contactos = page.getByRole('tab', { name: /Contactos/ }).first();
  if (await contactos.isVisible({ timeout: 3000 }).catch(() => false)) {
    await contactos.click();
    await page.waitForTimeout(3000);
    await ss(page, '03-contactos');
  }

  // 3. Automatizaciones
  const auto = page.getByRole('tab', { name: /Automatizaciones/ }).first();
  if (await auto.isVisible({ timeout: 3000 }).catch(() => false)) {
    await auto.click();
    await page.waitForTimeout(3000);
    await ss(page, '04-automatizaciones');
  }

  // 4. Formularios
  const forms = page.getByRole('tab', { name: /Formularios/ }).first();
  if (await forms.isVisible({ timeout: 3000 }).catch(() => false)) {
    await forms.click();
    await page.waitForTimeout(3000);
    await ss(page, '05-formularios');
  }

  // 5. Rendimiento
  const rend = page.getByRole('tab', { name: /Rendimiento/ }).first();
  if (await rend.isVisible({ timeout: 3000 }).catch(() => false)) {
    await rend.click();
    await page.waitForTimeout(3000);
    await ss(page, '06-rendimiento');
  }

  // 6. Settings gear
  const gear = page.locator('button[title*="dominio"], button[title*="Configuración"]').first();
  if (!(await gear.isVisible({ timeout: 2000 }).catch(() => false))) {
    // try svg icon
    const gearAlt = page.locator('button').filter({ has: page.locator('.lucide-settings') }).first();
    if (await gearAlt.isVisible({ timeout: 2000 }).catch(() => false)) await gearAlt.click();
  } else {
    await gear.click();
  }
  await page.waitForTimeout(2000);
  await ss(page, '07-settings');
  await page.keyboard.press('Escape');

  // 7. Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1500);
  await ss(page, '08-mobile');

  console.log('[QA] All screenshots captured');
});
