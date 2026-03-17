import type { Page, Locator } from '@playwright/test';

/**
 * C.4 — Self-Healing Test Locators
 *
 * When the primary selector breaks (UI change), tries fallback selectors.
 * Logs every self-heal to qa_log so the team knows which selectors drifted.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zpswjccsxjtnhetkkqde.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

interface HealResult {
  usedSelector: string;
  healed: boolean;
  element: Locator;
}

/** Log a self-heal event to qa_log via Supabase REST */
async function logHealing(original: string, healed: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/qa_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        check_type: 'test_self_healed',
        error_type: 'test_self_healed',
        error_detail: `Locator reparado: ${original} → ${healed}`,
        detected_by: 'healing-locator',
        status: 'auto_fixed',
      }),
    });
  } catch {
    // Non-critical — don't fail the test
  }
}

/**
 * Try the primary selector first; on failure walk fallbacks.
 * Returns the Locator that worked + whether healing occurred.
 */
export async function resilientLocator(
  page: Page,
  selectors: string[],
  { timeout = 3000 }: { timeout?: number } = {}
): Promise<HealResult> {
  if (selectors.length === 0) {
    throw new Error('[healing-locator] At least one selector required');
  }

  const primary = selectors[0];

  for (let i = 0; i < selectors.length; i++) {
    const sel = selectors[i];
    try {
      const el = page.locator(sel);
      if (await el.isVisible({ timeout })) {
        if (i > 0) {
          console.log(`[HEAL] ${primary} → ${sel}`);
          await logHealing(primary, sel);
        }
        return { usedSelector: sel, healed: i > 0, element: el };
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    `[healing-locator] Ningún selector funcionó: ${selectors.join(', ')}`
  );
}

/**
 * Convenience: resilientClick — find the first visible selector and click it.
 */
export async function resilientClick(
  page: Page,
  selectors: string[],
  options?: { timeout?: number }
): Promise<string> {
  const result = await resilientLocator(page, selectors, options);
  await result.element.click();
  return result.usedSelector;
}

/**
 * Convenience: resilientFill — find the first visible input and fill it.
 */
export async function resilientFill(
  page: Page,
  selectors: string[],
  value: string,
  options?: { timeout?: number }
): Promise<string> {
  const result = await resilientLocator(page, selectors, options);
  await result.element.fill(value);
  return result.usedSelector;
}
