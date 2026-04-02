/**
 * Record Steve Platform Demo Video
 *
 * Uses Playwright's built-in video recording to capture a walkthrough
 * of the Steve platform. Navigates through key sections:
 *   Dashboard → Métricas → Meta Ads → Steve Chat → Steve Mail
 *
 * Run: npx playwright test e2e/record-demo.spec.ts
 * Output: test-results/ directory (*.webm) → convert to mp4 with ffmpeg
 *
 * After recording:
 *   ffmpeg -i test-results/record-demo/video.webm -c:v libx264 -crf 23 demo.mp4
 *   Upload to Supabase Storage and set STEVE_DEMO_VIDEO_URL env var.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.DEMO_BASE_URL || 'https://www.steve.cl';
const TEST_EMAIL = process.env.DEMO_EMAIL || 'patricio.correa@jardindeeva.cl';
const TEST_PASSWORD = process.env.DEMO_PASSWORD || 'Jardin2026';

// Configure video recording
test.use({
  video: 'on',
  viewport: { width: 1920, height: 1080 },
  launchOptions: {
    slowMo: 500, // Slow down actions for a smoother demo
  },
});

test('Record Steve platform demo walkthrough', async ({ page }) => {
  test.setTimeout(120_000); // 2 min timeout

  // 1. Login
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForURL('**/client-portal**', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Let animations settle

  // 2. Dashboard overview — show metrics
  console.log('[demo] Dashboard loaded');
  await page.waitForTimeout(3000); // Linger on dashboard

  // 3. Navigate to Métricas
  const metricasTab = page.locator('[data-tab="metrics"], a:has-text("Métricas"), button:has-text("Métricas")').first();
  if (await metricasTab.isVisible()) {
    await metricasTab.click();
    await page.waitForTimeout(3000);
    console.log('[demo] Métricas section');
  }

  // 4. Navigate to Meta Ads / Campañas
  const campaignsTab = page.locator('[data-tab="campaigns"], a:has-text("Campañas"), button:has-text("Campañas")').first();
  if (await campaignsTab.isVisible()) {
    await campaignsTab.click();
    await page.waitForTimeout(3000);
    console.log('[demo] Campañas section');
  }

  // 5. Navigate to Steve Chat
  const steveTab = page.locator('[data-tab="steve"], a:has-text("Steve"), button:has-text("Steve")').first();
  if (await steveTab.isVisible()) {
    await steveTab.click();
    await page.waitForTimeout(2000);

    // Type a sample message
    const chatInput = page.locator('textarea, input[placeholder*="mensaje"], input[placeholder*="Steve"]').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('¿Cómo van mis ventas esta semana?');
      await page.waitForTimeout(2000);
      // Don't actually send — just show the interface
    }
    console.log('[demo] Steve Chat section');
    await page.waitForTimeout(3000);
  }

  // 6. Navigate to Steve Mail (if accessible)
  const emailTab = page.locator('[data-tab="email"], a:has-text("Email"), button:has-text("Email"), a:has-text("Mail"), button:has-text("Mail")').first();
  if (await emailTab.isVisible()) {
    await emailTab.click();
    await page.waitForTimeout(3000);
    console.log('[demo] Steve Mail section');
  }

  // 7. Navigate to Shopify
  const shopifyTab = page.locator('[data-tab="shopify"], a:has-text("Shopify"), button:has-text("Shopify")').first();
  if (await shopifyTab.isVisible()) {
    await shopifyTab.click();
    await page.waitForTimeout(3000);
    console.log('[demo] Shopify section');
  }

  // 8. Back to dashboard to end
  const dashTab = page.locator('[data-tab="metrics"], a:has-text("Dashboard"), button:has-text("Dashboard"), a:has-text("Inicio")').first();
  if (await dashTab.isVisible()) {
    await dashTab.click();
    await page.waitForTimeout(2000);
  }

  console.log('[demo] Recording complete. Video saved to test-results/');
});
