/**
 * DEPRECATED: analyze-brand (monolithic)
 * Superseded by two-phase architecture:
 *   1. analyze-brand-research  (scraping, ~30s)
 *   2. analyze-brand-strategy  (Claude Opus, ~60s)
 *
 * Returns 410 Gone so stale calls fail fast instead of
 * overwriting analysis_status to 'pending' and timing out.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.warn('[analyze-brand] deprecated monolith called — returning 410. Use analyze-brand-research + analyze-brand-strategy.');

  return new Response(
    JSON.stringify({
      error: 'Deprecated. Use analyze-brand-research then analyze-brand-strategy.',
      deprecated: true,
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
