import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';

test('check production state', async ({ page }) => {
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', 'patricio.correa@jardindeeva.cl');
  await page.fill('input[type="password"]', 'Jardin2026');
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/prod_01_after_login.png', fullPage: true });
  
  // Try navigate to Meta
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/prod_02_meta.png', fullPage: true });
  
  // Try Campañas
  await page.click('text=Campañas').catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/home/jmbarros/.openclaw/workspace/prod_03_campaigns.png', fullPage: true });
});
