import { test } from '@playwright/test';
const BASE = 'https://www.steve.cl';

test('check production state', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', 'patricio.correa@jardindeeva.cl');
  await page.fill('input[type="password"]', 'Jardin2026');
  await page.click('button:has-text("Iniciar")');
  await page.waitForURL('**/portal**', { timeout: 20000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'e2e/screenshots/prod_01_after_login.png', fullPage: true });

  // Navigate to Meta Ads via Más dropdown
  const masBtn = page.locator('.hidden.md\\:flex').locator('button').filter({ has: page.locator('.lucide-chevron-down') }).first();
  await masBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const metaItem = page.locator('[role="menuitem"]:has-text("Meta Ads")').first();
  if (await metaItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await metaItem.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'e2e/screenshots/prod_02_meta.png', fullPage: true });
  }

  // Navigate to Campañas via Más dropdown
  await masBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const campItem = page.locator('[role="menuitem"]:has-text("Campañas")').first();
  if (await campItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await campItem.click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'e2e/screenshots/prod_03_campaigns.png', fullPage: true });
  }
});
