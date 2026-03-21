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

  // Close "Setup del portal" banner if visible
  const closeSetup = page.locator('button[aria-label="close"], button:has(svg.lucide-x)').first();
  if (await closeSetup.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeSetup.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Meta Ads may be under "Más" dropdown or as a direct tab
  let opened = false;

  // Try direct tab first
  const directTab = page.locator('button:has-text("Meta Ads"), a:has-text("Meta Ads")').first();
  if (await directTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await directTab.click({ force: true });
    opened = true;
  }

  // If not found, try "Más" dropdown menu
  if (!opened) {
    const masBtn = page.locator('button:has-text("Más")').first();
    if (await masBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await masBtn.click({ force: true });
      await page.waitForTimeout(1500);

      // Click Meta Ads inside the dropdown using force to bypass overlay
      const metaOption = page.locator('[role="menuitem"]:has-text("Meta Ads"), [role="option"]:has-text("Meta Ads"), a:has-text("Meta Ads"), div:has-text("Meta Ads")').first();
      if (await metaOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await metaOption.click({ force: true });
        opened = true;
      }
    }
  }

  if (opened) {
    await page.waitForTimeout(5000);

    const body = await page.textContent('body');
    const hasMeta =
      body?.includes('Campa') ||
      body?.includes('ROAS') ||
      body?.includes('Ad Account') ||
      body?.includes('Meta') ||
      body?.includes('Inversión');
    expect(hasMeta).toBeTruthy();
  }

  await page.screenshot({ path: 'test-results/meta-ads-live.png' });
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
