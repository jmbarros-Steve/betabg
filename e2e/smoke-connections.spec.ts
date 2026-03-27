import { test, expect } from '@playwright/test';
import { login } from './lib/auth';

const BASE = process.env.BASE_URL || 'https://betabgnuevosupa.vercel.app';

test.describe('Smoke — Conexiones (produccion)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, BASE);
    // Navigate to Conexiones tab (it's a primary tab)
    await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
    await page.waitForTimeout(1000);
  });

  test('ve el titulo "Mis Conexiones"', async ({ page }) => {
    await expect(page.getByText('Mis Conexiones')).toBeVisible();
  });

  test('muestra la seccion "Conectar Nueva Plataforma"', async ({ page }) => {
    await expect(page.getByText('Conectar Nueva Plataforma')).toBeVisible();
  });

  test('muestra cards de plataformas conocidas', async ({ page }) => {
    const platformTexts = ['Shopify', 'Meta Ads', 'Google Ads', 'Klaviyo'];
    let found = 0;
    for (const name of platformTexts) {
      const el = page.getByText(name, { exact: true }).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('muestra badges de estado (Activo o Inactivo)', async ({ page }) => {
    const activo = page.getByText('Activo');
    const inactivo = page.getByText('Inactivo');
    const hasActivo = await activo.first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasInactivo = await inactivo.first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasActivo || hasInactivo).toBe(true);
  });

  test('boton Sincronizar visible en conexiones activas', async ({ page }) => {
    const syncBtn = page.getByText('Sincronizar').first();
    const hasSyncBtn = await syncBtn.isVisible({ timeout: 3000 }).catch(() => false);
    const hasConnections = await page.getByText('Activo').first().isVisible({ timeout: 2000 }).catch(() => false);
    if (hasConnections) {
      expect(hasSyncBtn).toBe(true);
    }
  });

  test('seccion WhatsApp visible', async ({ page }) => {
    const whatsappInput = page.locator('input[type="tel"]');
    const whatsappConnected = page.getByText('WhatsApp Conectado');
    const hasInput = await whatsappInput.isVisible({ timeout: 3000 }).catch(() => false);
    const hasConnected = await whatsappConnected.isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasInput || hasConnected).toBe(true);
  });
});

test.describe('Smoke — Conexiones responsive (Pixel 5)', () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test('conexiones se ve correctamente en mobile', async ({ page }) => {
    await login(page, BASE);
    await page.getByRole('button', { name: 'Conexiones', exact: true }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText('Mis Conexiones')).toBeVisible();
    await expect(page.getByText('Conectar Nueva Plataforma')).toBeVisible();
  });
});
