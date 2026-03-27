import { test, expect } from '@playwright/test';
import { login } from './lib/auth';

const BASE = process.env.BASE_URL || 'https://betabgnuevosupa.vercel.app';
const ENABLE_OAUTH = process.env.ENABLE_OAUTH_TESTS === 'true';

/**
 * Nivel 3 — OAuth real (manual/opcional).
 *
 * These tests require real OAuth credentials and browser interaction.
 * They are skipped by default. Enable with:
 *   ENABLE_OAUTH_TESTS=true npx playwright test e2e/oauth-manual.spec.ts
 *
 * NOTE: qa-oauth-security.spec.ts already covers OAuth security tests.
 * These tests focus on the happy-path user flow.
 */

test.describe('OAuth Manual — Meta', () => {
  test.skip(!ENABLE_OAUTH, 'Requiere ENABLE_OAUTH_TESTS=true');

  test('click "Conectar Meta" redirige a Facebook OAuth', async ({ page }) => {
    await login(page, BASE);
    await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
    await page.waitForTimeout(1000);

    const connectBtn = page.getByRole('button', { name: /Conectar Meta/ });
    if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const navigationPromise = page.waitForURL('**/facebook.com/**', { timeout: 10000 });
      await connectBtn.click();
      await navigationPromise;
      expect(page.url()).toContain('facebook.com');
    }
  });
});

test.describe('OAuth Manual — Shopify', () => {
  test.skip(!ENABLE_OAUTH, 'Requiere ENABLE_OAUTH_TESTS=true');

  test('click "Conectar Shopify" abre Custom App Wizard', async ({ page }) => {
    await login(page, BASE);
    await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
    await page.waitForTimeout(1000);

    const connectBtn = page.getByRole('button', { name: /Conectar Shopify/ });
    if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await connectBtn.click();
      await expect(page.getByText('Conectar Shopify')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('OAuth Manual — Google', () => {
  test.skip(!ENABLE_OAUTH, 'Requiere ENABLE_OAUTH_TESTS=true');

  test('click "Conectar Google" redirige a Google OAuth', async ({ page }) => {
    await login(page, BASE);
    await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
    await page.waitForTimeout(1000);

    const connectBtn = page.getByRole('button', { name: /Conectar Google/ });
    if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const navigationPromise = page.waitForURL('**/accounts.google.com/**', { timeout: 10000 });
      await connectBtn.click();
      await navigationPromise;
      expect(page.url()).toContain('accounts.google.com');
    }
  });
});
