import { test } from '@playwright/test';
const BASE = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';

async function login(page: any) {
  await page.goto(`${BASE}/auth`);
  await page.waitForTimeout(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button:has-text("Iniciar")');
  await page.waitForTimeout(6000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

test('1_ads_read', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/ads_read/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Campañas').catch(() => {});
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(2000);
  await ctx.close();
});

test('2_ads_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/ads_management/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Crear').catch(() => {});
  await page.waitForTimeout(5000);
  await ctx.close();
});

test('3_instagram_messages', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/instagram/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Bandeja').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('4_business_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/business/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Conexiones').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('5_pages_messaging', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/pages/', size: { width: 1280, height: 720 } } });
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
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/catalog/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Crear').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Siguiente').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

test('7_pages_show_list', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/meta-videos/pages_list/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.click('text=Conexiones').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('text=Meta').catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});
