import { test } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';

async function loginSkipOnboarding(page: any) {
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(4000);
  
  // Skip onboarding via localStorage (same key the app uses)
  await page.evaluate(() => {
    const userId = Object.keys(localStorage).find(k => k.startsWith('sb-'))
      ? JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('auth-token')) || '') || '{}')?.user?.id
      : null;
    // Set onboarding as seen for ALL possible user IDs
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('bg_onboarding_')) localStorage.setItem(k, 'true');
    });
    if (userId) localStorage.setItem(`bg_onboarding_${userId}`, 'true');
    // Also try a generic approach
    localStorage.setItem('bg_onboarding_seen', 'true');
  });
  
  // Reload to apply
  await page.goto(`${BASE}/portal`);
  await page.waitForTimeout(4000);
  
  // Extra: dismiss any remaining modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

const RECORDINGS: Array<{name: string, nav: string[]}> = [
  { name: 'ads_read', nav: ['Meta', 'Campañas'] },
  { name: 'ads_management', nav: ['Meta', 'Crear'] },
  { name: 'instagram_manage_messages', nav: ['Meta', 'Bandeja'] },
  { name: 'business_management', nav: ['Configuración', 'Conexiones'] },
  { name: 'pages', nav: ['Meta', 'Bandeja', 'Facebook'] },
  { name: 'catalog', nav: ['Meta', 'Crear'] },
  { name: 'pages_show_list', nav: ['Configuración', 'Conexiones'] },
];

for (const rec of RECORDINGS) {
  test(rec.name, async ({ browser }) => {
    const ctx = await browser.newContext({
      recordVideo: { dir: `e2e/videos-final/${rec.name}/`, size: { width: 1280, height: 720 } }
    });
    const page = await ctx.newPage();
    await loginSkipOnboarding(page);
    
    for (const nav of rec.nav) {
      const el = page.locator(`text=${nav}`).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        await page.waitForTimeout(2000);
      }
    }
    
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(3000);
    await ctx.close();
  });
}
