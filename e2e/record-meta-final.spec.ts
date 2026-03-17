import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';

test('meta ads complete tour', async ({ browser }) => {
  const ctx = await browser.newContext({ 
    recordVideo: { dir: 'e2e/meta-videos/final/', size: { width: 1280, height: 720 } }
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
  
  // Click Más dropdown
  await page.click('text=Más');
  await page.waitForTimeout(1500);
  
  // Click Meta Ads
  await page.click('text=Meta Ads');
  await page.waitForTimeout(5000);
  
  // Try all sub-tabs within Meta Ads
  const subTabs = ['Campañas', 'Crear', 'Bandeja', 'Social', 'Competencia', 'Reglas', 'Testing'];
  for (const tab of subTabs) {
    const el = page.locator(`button:has-text("${tab}"), a:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      await el.click().catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  
  // Scroll to show content
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(2000);
  
  // Go back to Más and click Steve Mail
  await page.click('text=Más').catch(() => {});
  await page.waitForTimeout(1000);
  await page.click('text=Steve Mail').catch(() => {});
  await page.waitForTimeout(5000);
  
  // Also show Conexiones
  await page.click('text=Conexiones').catch(() => {});
  await page.waitForTimeout(3000);
  
  await ctx.close();
});
