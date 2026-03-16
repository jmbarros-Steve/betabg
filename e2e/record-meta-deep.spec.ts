import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';

test('meta ads deep navigation', async ({ browser }) => {
  const ctx = await browser.newContext({ 
    recordVideo: { dir: 'e2e/meta-videos/deep/', size: { width: 1280, height: 720 } }
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
  
  // Click "Más" dropdown
  await page.click('text=Más').catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'e2e/meta-videos/mas-dropdown.png' });
  
  // Log what's in the dropdown
  const dropdownItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], .dropdown-item, [data-radix-collection-item], li, a'))
      .map(el => el.textContent?.trim())
      .filter(t => t && t.length < 40 && t.length > 1);
  });
  console.log('DROPDOWN:', JSON.stringify(dropdownItems));
  
  // Try clicking Meta Ads or similar
  const metaOptions = ['Meta Ads', 'Meta', 'Anuncios', 'Ads', 'Steve Mail', 'Email'];
  for (const opt of metaOptions) {
    const el = page.locator(`text=${opt}`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`Found and clicking: ${opt}`);
      await el.click().catch(() => {});
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `e2e/meta-videos/${opt.replace(/\s/g, '_')}.png` });
    }
  }
  
  // Also try clicking all sub-tabs within whatever section we land on
  const subTabs = ['Campañas', 'Crear', 'Bandeja', 'Competencia', 'Reglas', 'Social', 'Inbox'];
  for (const tab of subTabs) {
    const el = page.locator(`text=${tab}`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`Sub-tab found: ${tab}`);
      await el.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  
  await page.waitForTimeout(2000);
  await ctx.close();
});
