import { test } from '@playwright/test';

const BASE = 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';

async function loginAndSkipOnboarding(page: any) {
  await page.goto(`${BASE}/portal`);
  await page.waitForTimeout(2000);
  
  // Login
  const emailField = page.locator('input[type="email"], input[placeholder*="email"]').first();
  if (await emailField.isVisible()) {
    await emailField.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button:has-text("Iniciar"), button:has-text("Login")').first().click();
    await page.waitForTimeout(5000);
  }
  
  // Skip onboarding wizard if it appears
  const skipBtn = page.locator('button:has-text("Omitir"), button:has-text("Skip"), button:has-text("Cerrar")').first();
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(2000);
  }
  
  // Close any modals
  const closeBtn = page.locator('[aria-label="Close"], button:has-text("×"), .modal-close').first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(1000);
  }
  
  // Also try pressing Escape to dismiss modals
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
}

// ads_read + read_insights: Show campaigns dashboard with metrics
test('ads_read', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/ads_read/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  // Click Meta Ads in sidebar
  await page.locator('a[href*="meta"], button:has-text("Meta"), [data-testid*="meta"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Click Campañas tab
  await page.locator('button:has-text("Campaña"), a:has-text("Campaña")').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Scroll to show metrics
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(3000);
  await ctx.close();
});

// ads_management: Show campaign creation wizard
test('ads_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/ads_management/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  await page.locator('a[href*="meta"], button:has-text("Meta")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  // Click Create / Crear
  await page.locator('button:has-text("Crear"), button:has-text("Nueva"), button:has-text("Create")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Show the wizard steps
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(4000);
  await ctx.close();
});

// business_management: Show connections page with Meta connected
test('business_management', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/business_management/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  // Navigate to connections/settings
  await page.locator('a[href*="conexion"], button:has-text("Conexion"), a[href*="config"], button:has-text("Configuración")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Show Meta connection status
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(4000);
  await ctx.close();
});

// instagram_manage_messages: Show social inbox with Instagram messages
test('instagram_manage_messages', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/instagram_manage_messages/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  await page.locator('a[href*="meta"], button:has-text("Meta")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  // Social Inbox tab
  await page.locator('button:has-text("Bandeja"), button:has-text("Social"), button:has-text("Inbox")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  // Instagram tab
  await page.locator('button:has-text("Instagram")').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

// pages_messaging + pages_read_engagement: Show FB messages in social inbox
test('pages', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/pages/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  await page.locator('a[href*="meta"], button:has-text("Meta")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  await page.locator('button:has-text("Bandeja"), button:has-text("Social")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  // Facebook/Messenger tab  
  await page.locator('button:has-text("Facebook"), button:has-text("Messenger")').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

// catalog_management: Show product catalog in campaign creation
test('catalog', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/catalog/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  await page.locator('a[href*="meta"], button:has-text("Meta")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  
  // Navigate to create campaign to show product selection
  await page.locator('button:has-text("Crear"), button:has-text("Nueva")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Look for product/catalog step
  await page.locator('button:has-text("Producto"), button:has-text("Catálogo"), button:has-text("Siguiente")').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});

// pages_show_list: Show page selection in connections
test('pages_show_list', async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: 'e2e/videos-v2/pages_show_list/', size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  await loginAndSkipOnboarding(page);
  
  await page.locator('a[href*="conexion"], button:has-text("Conexion"), a[href*="config"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000);
  
  // Show connected pages list
  await page.locator('text=Meta, text=Facebook').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await ctx.close();
});
