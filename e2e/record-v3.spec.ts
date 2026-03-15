import { test } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';

test('record all features', async ({ browser }) => {
  const ctx = await browser.newContext({ 
    recordVideo: { dir: 'e2e/videos-v3/', size: { width: 1280, height: 720 } }
  });
  const page = await ctx.newPage();
  
  // Login
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'patricio.correa@jardindeeva.cl');
  await page.fill('input[type="password"]', 'Jardin2026');
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(5000);
  
  // Close onboarding - try Omitir first, then X, then Escape
  await page.click('button:has-text("Omitir")').catch(() => {});
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2000);
  
  // Now navigate through features - just scroll and click tabs
  // The video records everything
  await page.waitForTimeout(3000); // Show portal
  
  // Try clicking sidebar items
  const navItems = ['Meta', 'Métricas', 'Steve Mail', 'Email', 'Campañas'];
  for (const item of navItems) {
    const el = page.locator(`text=${item}`).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(3000);
    }
  }
  
  await page.waitForTimeout(2000);
  await ctx.close();
});
