import { test } from '@playwright/test';

const BASE = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';
const DIR = 'logs/qa/screenshots';

const PAGES = [
  { name: 'landing', path: '/', needsAuth: false },
  { name: 'auth', path: '/auth', needsAuth: false },
  { name: 'portal', path: '/portal', needsAuth: true },
  { name: 'meta-ads', path: '/portal', needsAuth: true, nav: 'Meta' },
  { name: 'metricas', path: '/portal', needsAuth: true, nav: 'Métrica' },
];

test('screenshot all pages', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  let loggedIn = false;

  for (const pg of PAGES) {
    if (pg.needsAuth && !loggedIn) {
      await page.goto(`${BASE}/auth`);
      await page.waitForTimeout(2000);
      const emailField = page.locator('input[type="email"], input[placeholder*="email"]').first();
      if (await emailField.isVisible()) {
        await emailField.fill(EMAIL);
        await page.locator('input[type="password"]').first().fill(PASS);
        await page.locator('button:has-text("Iniciar"), button:has-text("Login")').first().click();
        await page.waitForTimeout(5000);
      }
      const skipBtn = page.locator('button:has-text("Omitir"), button:has-text("Skip"), button:has-text("Cerrar")').first();
      if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(2000);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      loggedIn = true;
    }

    if (!pg.needsAuth) {
      await page.goto(`${BASE}${pg.path}`);
    } else if (pg.nav) {
      const navEl = page.locator(`a:has-text("${pg.nav}"), button:has-text("${pg.nav}")`).first();
      if (await navEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await navEl.click();
      }
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${DIR}/${pg.name}.png`, fullPage: true });
  }
  await ctx.close();
});
