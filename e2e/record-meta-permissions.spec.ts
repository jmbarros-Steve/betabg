import { test } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';

async function login(page: any) {
  await page.goto(`${BASE}/portal`);
  await page.waitForTimeout(2000);
  const emailField = page.locator('input[type="email"], input[placeholder*="email"]').first();
  if (await emailField.isVisible()) {
    await emailField.fill(EMAIL);
    const passField = page.locator('input[type="password"]').first();
    await passField.fill(PASS);
    await page.locator('button:has-text("Iniciar"), button:has-text("Login"), button:has-text("Acceder")').first().click();
    await page.waitForTimeout(4000);
  }
}

// 1. Instagram Manage Messages
test('instagram_manage_messages', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/instagram_manage_messages/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  await page.screenshot({ path: 'e2e/videos/instagram_manage_messages/01-logged-in.png' });
  
  // Navigate to Meta section
  const metaNav = page.locator('text=Meta').first();
  if (await metaNav.isVisible()) { await metaNav.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/instagram_manage_messages/02-meta.png' });
  
  // Social Inbox
  const inbox = page.locator('text=Bandeja, text=Social, text=Inbox').first();
  if (await inbox.isVisible()) { await inbox.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/instagram_manage_messages/03-inbox.png' });
  
  // Instagram tab
  const igTab = page.locator('text=Instagram').first();
  if (await igTab.isVisible()) { await igTab.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/instagram_manage_messages/04-ig-messages.png' });
  await page.waitForTimeout(3000);
  await ctx.close();
});

// 2. ads_read + read_insights
test('ads_read_and_insights', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/ads_read/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  
  // Navigate to Meta Ads dashboard/campaigns
  const metaNav = page.locator('text=Meta').first();
  if (await metaNav.isVisible()) { await metaNav.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/ads_read/01-meta-dashboard.png' });
  
  // Campaigns tab
  const campaigns = page.locator('text=Campaña, text=Campaign').first();
  if (await campaigns.isVisible()) { await campaigns.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/ads_read/02-campaigns.png' });
  
  // Metrics/insights
  const metrics = page.locator('text=Métrica, text=Rendimiento, text=Dashboard').first();
  if (await metrics.isVisible()) { await metrics.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/ads_read/03-insights.png' });
  await page.waitForTimeout(3000);
  await ctx.close();
});

// 3. ads_management
test('ads_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/ads_management/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  
  const metaNav = page.locator('text=Meta').first();
  if (await metaNav.isVisible()) { await metaNav.click(); await page.waitForTimeout(2000); }
  
  // Create campaign button
  const createBtn = page.locator('text=Crear, text=Nueva campaña, text=Create').first();
  if (await createBtn.isVisible()) { await createBtn.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/ads_management/01-create-wizard.png' });
  
  // Show wizard steps
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/videos/ads_management/02-wizard-steps.png' });
  await ctx.close();
});

// 4. business_management
test('business_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/business_management/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  
  // Connections page
  const connections = page.locator('text=Conexion, text=Integrac').first();
  if (await connections.isVisible()) { await connections.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/business_management/01-connections.png' });
  
  // Meta connection details
  const metaConn = page.locator('text=Meta').first();
  if (await metaConn.isVisible()) { await metaConn.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/business_management/02-meta-connected.png' });
  await page.waitForTimeout(3000);
  await ctx.close();
});

// 5. pages_read_engagement + pages_manage_ads + pages_messaging
test('pages_permissions', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/pages/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  
  const metaNav = page.locator('text=Meta').first();
  if (await metaNav.isVisible()) { await metaNav.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/pages/01-meta-section.png' });
  
  // Social inbox for pages_messaging + pages_read_engagement
  const inbox = page.locator('text=Bandeja, text=Social, text=Inbox').first();
  if (await inbox.isVisible()) { await inbox.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/pages/02-social-inbox.png' });
  
  // Show Facebook messages
  const fbTab = page.locator('text=Facebook, text=Messenger').first();
  if (await fbTab.isVisible()) { await fbTab.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/pages/03-fb-messages.png' });
  await page.waitForTimeout(3000);
  await ctx.close();
});

// 6. catalog_management
test('catalog_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/catalog/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  
  const metaNav = page.locator('text=Meta').first();
  if (await metaNav.isVisible()) { await metaNav.click(); await page.waitForTimeout(2000); }
  
  // Create campaign to show catalog/product selection
  const createBtn = page.locator('text=Crear, text=Nueva').first();
  if (await createBtn.isVisible()) { await createBtn.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/catalog/01-campaign-products.png' });
  
  // Look for product/catalog section
  const products = page.locator('text=Producto, text=Catálogo, text=Product').first();
  if (await products.isVisible()) { await products.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/catalog/02-catalog.png' });
  await page.waitForTimeout(3000);
  await ctx.close();
});

// 7. pages_show_list
test('pages_show_list', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos/pages_show_list/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await login(page);
  
  // Connections to show connected pages
  const connections = page.locator('text=Conexion, text=Integrac').first();
  if (await connections.isVisible()) { await connections.click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: 'e2e/videos/pages_show_list/01-connections.png' });
  
  // Meta connection showing pages
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'e2e/videos/pages_show_list/02-pages-list.png' });
  await ctx.close();
});
