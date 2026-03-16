import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';

test('all features', async ({ browser }) => {
  const ctx = await browser.newContext({ 
    recordVideo: { dir: 'e2e/meta-videos/all/', size: { width: 1280, height: 720 } }
  });
  const page = await ctx.newPage();
  
  // Login
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'patricio.correa@jardindeeva.cl');
  await page.fill('input[type="password"]', 'Jardin2026');
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(8000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  
  // Screenshot to see what nav exists
  await page.screenshot({ path: 'e2e/meta-videos/nav-check.png' });
  
  // Get all clickable nav text
  const navTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, [role="tab"]'))
      .map(el => el.textContent?.trim())
      .filter(t => t && t.length < 30);
  });
  console.log('NAV ITEMS:', JSON.stringify(navTexts));
  
  // Click through ALL tabs we can find
  const tabs = ['Steve', 'Brief', 'Métricas', 'Conexiones', 'Configuración', 'Más',
                'Meta', 'Meta Ads', 'Campañas', 'Bandeja', 'Email', 'Steve Mail'];
  
  for (const tab of tabs) {
    const el = page.locator(`text=${tab}`).first();
    if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`Clicking: ${tab}`);
      await el.click().catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  
  // Scroll down
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(2000);
  
  await ctx.close();
});
