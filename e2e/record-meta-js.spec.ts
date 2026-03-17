import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';

test('meta ads + stevemail + conexiones', async ({ browser }) => {
  const ctx = await browser.newContext({ 
    recordVideo: { dir: 'e2e/meta-videos/js/', size: { width: 1280, height: 720 } }
  });
  const page = await ctx.newPage();
  
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'patricio.correa@jardindeeva.cl');
  await page.fill('input[type="password"]', 'Jardin2026');
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(8000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

  // SHOW: Conexiones (business_management, pages_show_list)
  await page.click('text=Conexiones');
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(2000);
  
  // Navigate to Meta Ads via "Más" dropdown - use keyboard
  await page.click('text=Más');
  await page.waitForTimeout(500);
  // Click the item immediately
  await page.locator('text=Meta Ads').click({ timeout: 2000 }).catch(async () => {
    // Fallback: click "Más" again and try
    await page.click('text=Más');
    await page.waitForTimeout(300);
    await page.locator('text=Meta Ads').click({ force: true }).catch(() => {});
  });
  await page.waitForTimeout(5000);
  
  // SHOW: Meta Ads section (ads_read, ads_management)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2000);
  
  // Try sub-tabs
  for (const sub of ['Campañas', 'Crear', 'Bandeja Social', 'Bandeja', 'Competencia']) {
    const el = page.locator(`text="${sub}"`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(3000);
    }
  }
  
  // Navigate to Steve Mail
  await page.click('text=Más').catch(() => {});
  await page.waitForTimeout(500);
  await page.locator('text=Steve Mail').click({ timeout: 2000 }).catch(async () => {
    await page.click('text=Más');
    await page.waitForTimeout(300);
    await page.locator('text=Steve Mail').click({ force: true }).catch(() => {});
  });
  await page.waitForTimeout(5000);
  
  // SHOW: Métricas
  await page.click('text=Métricas');
  await page.waitForTimeout(4000);
  
  await ctx.close();
});
