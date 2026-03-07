import { Context } from 'hono';

/**
 * DEPRECATED: analyze-brand (monolithic)
 * Superseded by two-phase architecture:
 *   1. analyze-brand-research  (scraping, ~30s)
 *   2. analyze-brand-strategy  (Claude Opus, ~60s)
 *
 * Returns 410 Gone so stale calls fail fast instead of
 * overwriting analysis_status to 'pending' and timing out.
 */
export async function analyzeBrand(c: Context) {
  console.warn('[analyze-brand] deprecated monolith called — returning 410. Use analyze-brand-research + analyze-brand-strategy.');

  return c.json(
    {
      error: 'Deprecated. Use analyze-brand-research then analyze-brand-strategy.',
      deprecated: true,
    },
    410
  );
}
