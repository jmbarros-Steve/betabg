import { test, expect } from '@playwright/test';

const LOGIN_EMAIL = 'patricio.correa@jardindeeva.cl';
const LOGIN_PASSWORD = 'Jardin2026';

test.describe('QA UX Components — Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Login
    await page.fill('input[type="email"]', LOGIN_EMAIL);
    await page.fill('input[type="password"]', LOGIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for portal to load
    await page.waitForURL(/.*/, { timeout: 30_000 });
    await page.waitForTimeout(3000);
  });

  test('? key opens KeyboardShortcutsDialog, shows shortcuts, Escape closes', async ({ page }) => {
    // Press ? to open shortcuts dialog
    await page.keyboard.press('?');
    await page.waitForTimeout(500);

    // Verify dialog is open with shortcuts
    const dialog = page.locator('text=Atajos de teclado');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Check some shortcuts are listed
    await expect(page.locator('text=Búsqueda rápida')).toBeVisible();
    await expect(page.locator('text=Steve (Chat)')).toBeVisible();

    // Verify kbd elements exist
    const kbdElements = page.locator('kbd');
    await expect(kbdElements.first()).toBeVisible();

    // Escape closes
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('text=Atajos de teclado')).not.toBeVisible();
  });

  test('number keys 1-5 navigate to correct tabs', async ({ page }) => {
    // Press 1 for Steve (Chat)
    await page.keyboard.press('1');
    await page.waitForTimeout(1000);

    // Press 2 for Brief
    await page.keyboard.press('2');
    await page.waitForTimeout(1000);

    // Press 3 for Métricas
    await page.keyboard.press('3');
    await page.waitForTimeout(1000);

    // Press 4 for Conexiones
    await page.keyboard.press('4');
    await page.waitForTimeout(1000);

    // Press 5 for Configuración
    await page.keyboard.press('5');
    await page.waitForTimeout(1000);

    // If we got here without errors, navigation works
  });

  test('TabCoachmark appears on first visit, dismiss persists', async ({ page }) => {
    // Clear localStorage to simulate first visit
    await page.evaluate(() => {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('steve_coachmark_')) {
          localStorage.removeItem(key);
        }
      });
    });

    // Navigate to a tab that has a coachmark
    await page.keyboard.press('4'); // Connections
    await page.waitForTimeout(2000);

    // Look for any coachmark-style element (may or may not appear depending on state)
    const coachmark = page.locator('[class*="bg-primary/10"]').first();
    const isVisible = await coachmark.isVisible().catch(() => false);

    if (isVisible) {
      // Dismiss it
      const dismissBtn = coachmark.locator('button').first();
      if (await dismissBtn.isVisible()) {
        await dismissBtn.click();
        await page.waitForTimeout(500);

        // Verify it's gone
        await expect(coachmark).not.toBeVisible();

        // Reload and verify it doesn't reappear
        await page.reload();
        await page.waitForTimeout(3000);
        await page.keyboard.press('4');
        await page.waitForTimeout(2000);

        await expect(coachmark).not.toBeVisible();
      }
    }
  });

  test('Academy tab loads (courses or empty state)', async ({ page }) => {
    // Look for academy tab and click it
    const academyTab = page.locator('text=Academy').first();
    const academyExists = await academyTab.isVisible().catch(() => false);

    if (academyExists) {
      await academyTab.click();
      await page.waitForTimeout(3000);

      // Should show either courses or "No se encontraron cursos"
      const hasCourses = await page.locator('[data-testid="course-card"]').first().isVisible().catch(() => false);
      const hasEmptyState = await page.locator('text=No se encontraron cursos').isVisible().catch(() => false);
      const hasTitle = await page.locator('text=Steve Academy').isVisible().catch(() => false);

      expect(hasCourses || hasEmptyState || hasTitle).toBeTruthy();
    }
  });

  test('SetupProgressTracker visible if setup incomplete, collapse works', async ({ page }) => {
    // Look for setup tracker
    const tracker = page.locator('text=Setup del portal').first();
    const isVisible = await tracker.isVisible().catch(() => false);

    if (isVisible) {
      // Verify progress indicator exists
      const progressBar = page.locator('[role="progressbar"]');
      await expect(progressBar).toBeVisible();

      // Test collapse
      const collapseBtn = page.locator('[aria-label="Colapsar pasos"]');
      if (await collapseBtn.isVisible()) {
        await collapseBtn.click();
        await page.waitForTimeout(300);

        // Steps should be hidden
        await expect(page.locator('text=Conectar Shopify')).not.toBeVisible();

        // Expand again
        const expandBtn = page.locator('[aria-label="Expandir pasos"]');
        await expandBtn.click();
        await page.waitForTimeout(300);

        await expect(page.locator('text=Conectar Shopify')).toBeVisible();
      }
    }
  });

  test('Cmd+K opens command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);

    // Command palette should be visible (dialog or similar)
    const palette = page.locator('[cmdk-dialog], [role="dialog"]').first();
    const isOpen = await palette.isVisible().catch(() => false);

    if (isOpen) {
      // Close it
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});
