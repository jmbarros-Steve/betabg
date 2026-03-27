import type { Page } from '@playwright/test';

const DEFAULT_EMAIL = 'patricio.correa@jardindeeva.cl';
const DEFAULT_PASSWORD = 'Jardin2026';

/**
 * Dismiss any onboarding modal/overlay that may appear after login.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  // Try "Omitir" button
  const omitir = page.locator('button:has-text("Omitir")');
  if (await omitir.isVisible({ timeout: 2000 }).catch(() => false)) {
    await omitir.click();
    await page.waitForTimeout(500);
  }

  // Try close button on modal
  const closeX = page.locator('[aria-label="Close"]').first();
  if (await closeX.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeX.click();
    await page.waitForTimeout(500);
  }

  // Escape key as last resort
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/**
 * Login to the app and wait for the portal to load.
 */
export async function login(
  page: Page,
  baseUrl: string,
  email = DEFAULT_EMAIL,
  password = DEFAULT_PASSWORD,
): Promise<void> {
  await page.goto(`${baseUrl}/auth`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /Iniciar Sesión/i }).click();
  await page.waitForURL('**/portal**', { timeout: 20_000 });
  await dismissOnboarding(page);
}
