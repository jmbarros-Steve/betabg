import type { Page } from '@playwright/test';

/** Primary tabs that are directly visible in the tab bar. */
const PRIMARY_TABS = ['steve', 'brief', 'metrics', 'connections', 'config'];

/**
 * Navigate to a tab by name.
 *
 * - Primary tabs: clicked directly via their button text.
 * - Secondary tabs (inside "Más" dropdown): opens the dropdown first,
 *   then clicks the menu item. Uses `pointerdown` for Radix compatibility.
 */
export async function goToTab(page: Page, tabName: string): Promise<void> {
  // Map of tab id -> display label
  const tabLabels: Record<string, string> = {
    steve: 'Steve',
    brief: 'Brief',
    metrics: 'Métricas',
    connections: 'Conexiones',
    config: 'Configuración',
    shopify: 'Shopify',
    campaigns: 'Campañas',
    deepdive: 'Deep Dive',
    estrategia: 'Estrategia',
    copies: 'Meta Ads',
    instagram: 'Instagram',
    google: 'Google Ads',
    klaviyo: 'Klaviyo',
    email: 'Steve Mail',
    wa_credits: 'WhatsApp',
    academy: 'Academy',
  };

  const label = tabLabels[tabName] || tabName;

  if (PRIMARY_TABS.includes(tabName)) {
    // Primary tab: click the button directly
    await page.getByRole('button', { name: label, exact: true }).click();
  } else {
    // Secondary tab: open "Más" dropdown, then click menu item
    // The dropdown trigger shows "Más" or the active secondary tab name
    const trigger = page.locator('button:has-text("Más"), button:has-text("Shopify"), button:has-text("Campañas"), button:has-text("Deep Dive"), button:has-text("Estrategia"), button:has-text("Meta Ads"), button:has-text("Instagram"), button:has-text("Google Ads"), button:has-text("Klaviyo"), button:has-text("Steve Mail"), button:has-text("WhatsApp"), button:has-text("Academy")').filter({ has: page.locator('svg.w-4.h-4') }).first();

    // Radix dropdown requires pointerdown event
    await trigger.dispatchEvent('pointerdown');
    await page.waitForTimeout(300);

    // Click the menu item
    await page.getByRole('menuitem', { name: label }).click();
  }

  // Wait for content to settle
  await page.waitForTimeout(500);
}
