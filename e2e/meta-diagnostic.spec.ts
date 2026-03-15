import { test, expect } from '@playwright/test';

const BASE_URL = 'https://betabgnuevosupa.vercel.app';

test('Meta diagnostic — capture portal state', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login
  await page.goto(`${BASE_URL}/auth`);
  await page.locator('#email').fill('patricio.correa@jardindeeva.cl');
  await page.locator('#password').fill('Jardin2026');
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await page.waitForURL('**/portal**', { timeout: 20000 });
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  // Dismiss onboarding — use dispatchEvent to trigger the React click handler
  const omitirBtn = page.getByText('Omitir', { exact: true });
  if (await omitirBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Use evaluate to directly trigger the click via DOM
    await omitirBtn.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(2000);
    console.log('[DIAG] Clicked Omitir via evaluate');
  }
  // If still visible, try again
  if (await omitirBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await omitirBtn.evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(2000);
  }
  // Press Escape to dismiss any remaining overlays
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1000);

  // Screenshot portal state
  await page.screenshot({ path: 'e2e/screenshots/diag-01-portal.png', fullPage: true });

  // Log all visible buttons
  const buttons = page.locator('button:visible');
  const count = await buttons.count();
  const btnTexts: string[] = [];
  for (let i = 0; i < Math.min(count, 30); i++) {
    const text = await buttons.nth(i).textContent().catch(() => '');
    const disabled = await buttons.nth(i).getAttribute('disabled');
    if (text?.trim()) btnTexts.push(`${text.trim().slice(0, 40)}${disabled !== null ? ' [DISABLED]' : ''}`);
  }
  console.log('[DIAG] Visible buttons:', btnTexts.join(' | '));

  // Try clicking "Más" dropdown
  const masBtn = page.locator('button').filter({ hasText: /Más/ }).first();
  const masVisible = await masBtn.isVisible({ timeout: 3000 }).catch(() => false);
  console.log(`[DIAG] "Más" button visible: ${masVisible}`);

  if (masVisible) {
    // Radix DropdownMenu uses pointerdown to open
    await masBtn.dispatchEvent('pointerdown', { button: 0, pointerType: 'mouse' });
    await page.waitForTimeout(300);
    await masBtn.dispatchEvent('pointerup', { button: 0, pointerType: 'mouse' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/screenshots/diag-02-mas-open.png', fullPage: true });

    // Log dropdown items
    const items = page.locator('[role="menuitem"]');
    const itemCount = await items.count();
    console.log(`[DIAG] Menu items found: ${itemCount}`);
    for (let i = 0; i < itemCount; i++) {
      const txt = await items.nth(i).textContent().catch(() => '');
      console.log(`[DIAG] Menu item ${i}: ${txt?.trim()}`);
    }

    // If no menuitems found, try regular click
    if (itemCount === 0) {
      console.log('[DIAG] No menuitems via pointerdown, trying click...');
      await masBtn.click();
      await page.waitForTimeout(1500);
      const items2 = page.locator('[role="menuitem"]');
      const count2 = await items2.count();
      console.log(`[DIAG] Menu items after click: ${count2}`);
      for (let i = 0; i < count2; i++) {
        const txt = await items2.nth(i).textContent().catch(() => '');
        console.log(`[DIAG] Menu item ${i}: ${txt?.trim()}`);
      }
      await page.screenshot({ path: 'e2e/screenshots/diag-02b-mas-click.png', fullPage: true });
    }

    // Try clicking Meta Ads — use evaluate to bypass overlay
    const metaItem = page.locator('[role="menuitem"]').filter({ hasText: /Meta Ads/ }).first();
    if (await metaItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await metaItem.evaluate((el: HTMLElement) => el.click());
      await page.waitForTimeout(3000);
      console.log('[DIAG] ✅ Navigated to Meta Ads tab');
      await page.screenshot({ path: 'e2e/screenshots/diag-03-meta-tab.png', fullPage: true });
    } else {
      console.log('[DIAG] ❌ Meta Ads menuitem not visible');
    }
  }

  // Also check all tabs in the nav
  const allNavBtns = page.locator('nav button, header button');
  const navCount = await allNavBtns.count();
  for (let i = 0; i < Math.min(navCount, 20); i++) {
    const text = await allNavBtns.nth(i).textContent().catch(() => '');
    if (text?.trim() && text.trim().length < 30) {
      console.log(`[DIAG] Nav button: "${text.trim()}"`);
    }
  }
});
