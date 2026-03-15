import { test } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';

test('login and skip onboarding', async ({ page }) => {
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(2000);
  
  await page.locator('input[type="email"]').fill('patricio.correa@jardindeeva.cl');
  await page.locator('input[type="password"]').fill('Jardin2026');
  await page.locator('button:has-text("Iniciar")').click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/login_01.png' });
  
  // Try multiple ways to close onboarding
  // 1. Omitir button
  const omitir = page.locator('button:has-text("Omitir")');
  if (await omitir.isVisible({ timeout: 2000 }).catch(() => false)) {
    await omitir.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/login_02.png' });
  
  // 2. X close button on modal
  const closeX = page.locator('[aria-label="Close"], button:has-text("×"), button:has-text("✕"), .close-button, [data-dismiss]').first();
  if (await closeX.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeX.click();
    await page.waitForTimeout(1000);
  }
  
  // 3. Click outside modal (backdrop)
  await page.mouse.click(10, 10);
  await page.waitForTimeout(500);
  
  // 4. Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/login_03.png' });
  
  // 5. Try clicking nav items directly
  await page.locator('a:has-text("Meta"), button:has-text("Meta"), [href*="meta"]').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/login_04.png' });
  
  console.log('Final URL:', page.url());
});
