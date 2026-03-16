import { test } from '@playwright/test';
import fs from 'fs';
const BASE = 'https://www.steve.cl';
const OUT = '/home/jmbarros/.openclaw/workspace/';

test('capture all 404s and errors', async ({ page }) => {
  test.setTimeout(120_000);
  const issues: string[] = [];

  page.on('response', resp => {
    if (resp.status() === 404) {
      issues.push(`404: ${resp.url()}`);
    }
  });
  page.on('pageerror', e => issues.push(`PAGE_ERROR: ${e.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') issues.push(`CONSOLE: ${msg.text()}`);
  });

  // Login
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(2000);
  await page.fill('input[type="email"]', 'patricio.correa@jardindeeva.cl');
  await page.fill('input[type="password"]', 'Jardin2026');
  await page.click('button:has-text("Iniciar")');
  await page.waitForURL('**/portal**', { timeout: 20000 });
  await page.waitForTimeout(5000);

  // Dismiss onboarding
  const omitir = page.getByText('Omitir', { exact: true });
  if (await omitir.isVisible({ timeout: 3000 }).catch(() => false)) {
    await omitir.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  // Write partial results helper
  const writeResults = () => {
    fs.writeFileSync(`${OUT}diagnose_404.txt`, issues.join('\n') || 'NO ISSUES');
  };

  // Navigate primary tabs (desktop - hidden md:flex)
  for (const tab of ['Brief', 'Métricas', 'Conexiones', 'Configuración']) {
    const el = page.locator(`.hidden.md\\:flex button:has-text("${tab}")`).first();
    await el.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  // Navigate secondary tabs via "Más" dropdown (desktop)
  const mas = page.locator('.hidden.md\\:flex button:has-text("Más")').first();
  for (const tab of ['Meta Ads', 'Campañas', 'Shopify', 'Klaviyo', 'Steve Mail']) {
    try {
      await mas.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      const item = page.locator(`[role="menuitem"]:has-text("${tab}")`).first();
      if (await item.isVisible({ timeout: 2000 }).catch(() => false)) {
        await item.click();
        await page.waitForTimeout(4000);
      }
    } catch { /* skip */ }
  }

  writeResults();
  console.log(`=== ${issues.length} issues found ===`);
  issues.forEach(i => console.log(i));
});
