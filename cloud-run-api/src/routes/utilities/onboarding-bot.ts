import { Context } from 'hono';

/**
 * POST /api/onboarding-bot
 * Placeholder for Skyvern onboarding bot integration.
 * Will orchestrate platform connections via browser automation.
 */
export async function onboardingBot(c: Context) {
  return c.json({ error: 'Onboarding bot not yet implemented. Use manual platform connections.' }, 501);
}
