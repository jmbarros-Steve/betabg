import { test, expect } from '@playwright/test';
import { login } from './lib/auth';
import { allConnected, noConnections, partialConnections } from './fixtures/connections';

const BASE = process.env.BASE_URL || 'https://betabgnuevosupa.vercel.app';

/**
 * Intercept Supabase platform_connections queries and return mock data.
 * Must be called BEFORE navigating to Conexiones tab.
 */
async function mockConnections(page: import('@playwright/test').Page, data: unknown[]) {
  await page.route('**/rest/v1/platform_connections**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
}

/**
 * Login and navigate to Conexiones tab.
 * Mocks should be set up BEFORE calling this.
 */
async function loginAndGoToConexiones(page: import('@playwright/test').Page) {
  await login(page, BASE);
  await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
  await page.waitForTimeout(1500);
}

test.describe('Mock — Sin conexiones', () => {
  test('muestra 4 botones "Conectar"', async ({ page }) => {
    await mockConnections(page, noConnections);
    await loginAndGoToConexiones(page);

    // Use exact match to avoid matching onboarding checklist buttons
    await expect(page.getByRole('button', { name: 'Conectar Shopify', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conectar Meta', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conectar Google', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conectar Klaviyo', exact: true })).toBeVisible();
  });
});

test.describe('Mock — Todas conectadas', () => {
  test('muestra las 4 connection cards', async ({ page }) => {
    await mockConnections(page, allConnected);
    await page.route('**/rest/v1/clients**', (route, request) => {
      if (request.url().includes('whatsapp_phone')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ whatsapp_phone: '+56912345678' }),
        });
      } else {
        route.continue();
      }
    });
    await loginAndGoToConexiones(page);

    // Verify mock data rendered: store names / account IDs from fixtures
    await expect(page.getByText('Test Store')).toBeVisible();
    await expect(page.getByText('act_123456')).toBeVisible();
    await expect(page.getByText('123-456-7890')).toBeVisible();

    // Should show multiple "Activo" badges
    const activeBadges = page.getByText('Activo');
    expect(await activeBadges.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Mock — Conexion parcial', () => {
  test('Shopify activo + Meta inactivo muestra badges correctos', async ({ page }) => {
    await mockConnections(page, partialConnections);
    await loginAndGoToConexiones(page);

    // Should see both "Activo" and "Inactivo" text
    await expect(page.getByText('Activo').first()).toBeVisible();
    await expect(page.getByText('Inactivo').first()).toBeVisible();

    // Google and Klaviyo connect buttons (exact match avoids onboarding checklist)
    await expect(page.getByRole('button', { name: 'Conectar Google', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Conectar Klaviyo', exact: true })).toBeVisible();
  });
});

test.describe('Mock — Error de Supabase', () => {
  test('muestra estado degradado sin crash', async ({ page }) => {
    await page.route('**/rest/v1/platform_connections**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });
    await loginAndGoToConexiones(page);

    // Page should still render without crashing
    await expect(page.getByText('Mis Conexiones')).toBeVisible();
    await expect(page.getByText('Conectar Nueva Plataforma')).toBeVisible();
  });
});

test.describe('Mock — Sync en progreso', () => {
  test('boton muestra "Sincronizando..." al hacer sync', async ({ page }) => {
    await mockConnections(page, partialConnections);
    await loginAndGoToConexiones(page);

    // Mock the sync endpoint to be slow (both edge function and cloud run)
    await page.route('**/functions/v1/sync-shopify-metrics**', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/api/sync-shopify-metrics**', async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
    });

    // Click sync on Shopify
    const syncBtn = page.getByText('Sincronizar').first();
    await syncBtn.click();

    // Should show "Sincronizando..." in the button specifically
    await expect(page.getByRole('button', { name: /Sincronizando/ })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Mock — Desconectar flow', () => {
  test('click desconectar abre dialog de confirmacion', async ({ page }) => {
    await mockConnections(page, partialConnections);
    await loginAndGoToConexiones(page);

    // Click disconnect button (aria-label="Desconectar")
    const disconnectBtn = page.getByLabel('Desconectar').first();
    await disconnectBtn.click();

    // Should show confirmation dialog
    await expect(page.getByText('¿Estás seguro?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  });
});

test.describe('Mock — Klaviyo dialog', () => {
  test('click "Conectar Klaviyo" abre dialog con input API key', async ({ page }) => {
    await mockConnections(page, noConnections);
    await loginAndGoToConexiones(page);

    // Click connect Klaviyo (exact match avoids onboarding)
    await page.getByRole('button', { name: 'Conectar Klaviyo', exact: true }).click();

    // Dialog should open with API key input
    await expect(page.locator('#klaviyo-api-key')).toBeVisible();
    await expect(page.getByText('Private API Key', { exact: true })).toBeVisible();

    // Cancel button in dialog
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });
});
