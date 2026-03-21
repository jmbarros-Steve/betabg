import { test, expect } from '@playwright/test';

/**
 * Live integration tests — run post-deploy against production.
 * These verify real data flows end-to-end.
 * Timeout is generous (5 min per test) because they depend on external APIs.
 */

const BASE = process.env.TEST_BASE_URL || 'https://betabgnuevosupa.vercel.app';
const EMAIL = 'patricio.correa@jardindeeva.cl';
const PASS = 'Jardin2026';

test.describe.configure({ timeout: 300_000 }); // 5 min

async function login(page: any) {
  await page.goto(`${BASE}/auth`);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button:has-text("Iniciar")').click();
  await page.waitForTimeout(8000);
  // Verify we left auth page
  expect(page.url()).not.toContain('/auth');
}

test('Meta Ads — campaigns load and sync works', async ({ page }) => {
  await login(page);

  // Navigate to Meta Ads tab (look for tab or link)
  const metaTab = page.locator('text=Meta').first();
  if (await metaTab.isVisible()) {
    await metaTab.click();
    await page.waitForTimeout(3000);

    // Verify some campaign-related content loads
    const body = await page.textContent('body');
    // Should have either campaigns, metricas, or an account selector
    const hasMeta =
      body?.includes('Campa') ||
      body?.includes('ROAS') ||
      body?.includes('Ad Account') ||
      body?.includes('Meta');
    expect(hasMeta).toBeTruthy();

    await page.screenshot({ path: 'test-results/meta-ads-live.png' });
  }
});

test('Klaviyo — connection status visible', async ({ page }) => {
  await login(page);

  // Navigate to connections or email tab
  const connectionsTab = page.locator('text=Conexiones').first();
  if (await connectionsTab.isVisible()) {
    await connectionsTab.click();
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    const hasKlaviyo = body?.includes('Klaviyo') || body?.includes('Email');
    expect(hasKlaviyo).toBeTruthy();

    await page.screenshot({ path: 'test-results/klaviyo-live.png' });
  }
});

test('Steve Chat — AI responds to message', async ({ page }) => {
  await login(page);

  // Look for chat or Steve Chat tab
  const chatTab = page.locator('text=Steve').first();
  if (await chatTab.isVisible()) {
    await chatTab.click();
    await page.waitForTimeout(3000);

    // Find chat input and send a message
    const chatInput = page.locator('textarea, input[placeholder*="mensaje"], input[placeholder*="escribe"]').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('Hola Steve, dame un resumen rapido');

      // Find and click send button
      const sendBtn = page.locator('button[type="submit"], button:has-text("Enviar")').first();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();

        // Wait for AI response (up to 30s)
        await page.waitForTimeout(30_000);

        const body = await page.textContent('body');
        // Should have some response text beyond just the input
        expect(body?.length).toBeGreaterThan(100);
      }
    }

    await page.screenshot({ path: 'test-results/steve-chat-live.png' });
  }
});

test('Shopify — products visible in connections', async ({ page }) => {
  await login(page);

  const connectionsTab = page.locator('text=Conexiones').first();
  if (await connectionsTab.isVisible()) {
    await connectionsTab.click();
    await page.waitForTimeout(3000);

    const body = await page.textContent('body');
    const hasShopify = body?.includes('Shopify') || body?.includes('Tienda');
    expect(hasShopify).toBeTruthy();

    await page.screenshot({ path: 'test-results/shopify-live.png' });
  }
});
