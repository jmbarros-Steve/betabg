import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';

test('meta ads via secondary tabs', async ({ browser }) => {
  const ctx = await browser.newContext({ 
    recordVideo: { dir: 'e2e/meta-videos/v5/', size: { width: 1280, height: 720 } }
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
  
  // Click Configuración first
  await page.click('text=Configuración');
  await page.waitForTimeout(2000);
  
  // Now look for Meta to the RIGHT of Configuración
  // Get all tabs/buttons and their positions
  const allTabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, a, [role="tab"]'))
      .map(el => ({ text: el.textContent?.trim(), x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y }))
      .filter(t => t.text && t.text.length < 30);
  });
  console.log('ALL TABS:', JSON.stringify(allTabs.slice(0, 30)));
  
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/config-view.png' });
  
  // Try scrolling the tab bar right
  const tabBar = page.locator('nav, [role="tablist"], .tabs').first();
  if (await tabBar.isVisible().catch(() => false)) {
    await tabBar.evaluate(el => el.scrollLeft += 300);
    await page.waitForTimeout(1000);
  }
  
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/config-scrolled.png' });
  
  // Try clicking Meta Ads in any form
  for (const text of ['Meta Ads', 'Meta', 'Anuncios Meta', 'Steve Mail', 'Email']) {
    const el = page.locator(`text="${text}"`).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`CLICKING: ${text}`);
      await el.click();
      await page.waitForTimeout(4000);
      
      // Sub-tabs
      for (const sub of ['Campañas', 'Crear', 'Bandeja', 'Competencia', 'Social']) {
        const s = page.locator(`text="${sub}"`).first();
        if (await s.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log(`  SUB: ${sub}`);
          await s.click();
          await page.waitForTimeout(3000);
        }
      }
    }
  }
  
  // Show Conexiones
  await page.click('text=Conexiones').catch(() => {});
  await page.waitForTimeout(3000);
  
  await ctx.close();
});
