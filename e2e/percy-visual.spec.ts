import { test, expect } from '@playwright/test';

const LOGIN_EMAIL = 'patricio.correa@jardindeeva.cl';
const LOGIN_PASSWORD = 'Jardin2026';

// Percy snapshot helper — falls back to Playwright screenshot if Percy not available
async function percySnapshot(page: any, name: string) {
  try {
    // If @percy/playwright is available, use it
    const percy = await import('@percy/playwright').catch(() => null);
    if (percy?.percySnapshot) {
      await percy.percySnapshot(page, name);
    } else {
      // Fallback: Playwright screenshot
      await page.screenshot({ path: `percy-fallback/${name.replace(/\s/g, '-')}.png`, fullPage: true });
    }
  } catch {
    await page.screenshot({ path: `percy-fallback/${name.replace(/\s/g, '-')}.png`, fullPage: true });
  }
}

test.describe('Percy Visual Snapshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
  });

  test('Auth page snapshot', async ({ page }) => {
    await page.waitForTimeout(2000);
    await percySnapshot(page, 'Auth Page');
  });

  test('Portal after login', async ({ page }) => {
    // Login
    await page.fill('input[type="email"]', LOGIN_EMAIL);
    await page.fill('input[type="password"]', LOGIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);

    // Connections tab
    await page.keyboard.press('4');
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'Portal - Connections');

    // Steve Chat
    await page.keyboard.press('1');
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'Portal - Steve Chat');

    // Metrics
    await page.keyboard.press('3');
    await page.waitForTimeout(3000);
    await percySnapshot(page, 'Portal - Metrics');

    // Academy (if available)
    const academyTab = page.locator('text=Academy').first();
    if (await academyTab.isVisible().catch(() => false)) {
      await academyTab.click();
      await page.waitForTimeout(3000);
      await percySnapshot(page, 'Portal - Academy');
    }
  });
});
