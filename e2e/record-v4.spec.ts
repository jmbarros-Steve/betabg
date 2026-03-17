import { test } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';

async function login(page: any) {
  // First visit to set localStorage before login
  await page.goto(BASE);
  await page.waitForTimeout(1000);
  
  // Pre-set ALL onboarding flags to skip it
  await page.evaluate(() => {
    // Mark onboarding as seen for every possible key pattern
    for (let i = 0; i < 100; i++) {
      const fakeId = localStorage.key(i);
      if (fakeId) continue;
    }
    // Brute force: set the flag for common UUID patterns
    localStorage.setItem('bg_onboarding_seen', 'true');
    localStorage.setItem('bg_portal_session_toast', 'true');
    // The app uses bg_onboarding_{userId} - we'll set it after login
  });
  
  // Login
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(4000);
  
  // Now set onboarding with the actual user ID from Supabase session
  await page.evaluate(() => {
    // Find the Supabase auth token in localStorage
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      try {
        const val = localStorage.getItem(k);
        if (val && val.includes('access_token')) {
          const parsed = JSON.parse(val);
          const userId = parsed?.user?.id;
          if (userId) {
            localStorage.setItem(`bg_onboarding_${userId}`, 'true');
          }
        }
      } catch {}
    }
    // Also dismiss any current modal by setting all bg_onboarding_ keys
    keys.filter(k => k.startsWith('bg_onboarding_')).forEach(k => localStorage.setItem(k, 'true'));
  });
  
  // Reload without onboarding
  await page.goto(`${BASE}/portal`);
  await page.waitForTimeout(4000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

test('1_ads_read', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/ads_read/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(3000);
  await page.click('text=Campañas').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('2_ads_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/ads_management/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Crear').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('3_instagram', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/instagram/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Bandeja').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('4_business', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/business/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Conexiones').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('5_pages', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/pages/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Bandeja').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Facebook').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('6_catalog', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/catalog/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Crear').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Producto').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('7_pages_list', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-done/pages_list/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Conexiones').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});
