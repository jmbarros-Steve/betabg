import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { propagateKnowledge } from '../../lib/knowledge-propagator.js';

/**
 * Safety-net cron: catches approved rules that were never propagated.
 * Runs piggybacking on knowledge-quality-score (Sundays 5am) or manually.
 */
export async function knowledgePropagationCatchup(c: Context) {
  try {
    const cronSecret = c.req.header('X-Cron-Secret')?.trim();
    const expected = process.env.CRON_SECRET;
    if (!expected || cronSecret !== expected) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = getSupabaseAdmin();

    // Find approved rules that were never propagated
    const { data: unpropagated, error } = await supabase
      .from('steve_knowledge')
      .select('id')
      .eq('approval_status', 'approved')
      .eq('activo', true)
      .is('propagated_at', null)
      .is('purged_at', null)
      .limit(50);

    if (error) {
      console.error('[propagation-catchup] Query error:', error.message);
      return c.json({ error: error.message }, 500);
    }

    if (!unpropagated?.length) {
      return c.json({ status: 'ok', message: 'No unpropagated rules found', count: 0 });
    }

    const ids = unpropagated.map(r => r.id);
    console.log(`[propagation-catchup] Found ${ids.length} unpropagated approved rules, propagating...`);

    await propagateKnowledge(ids);

    return c.json({ status: 'ok', propagated: ids.length });
  } catch (err: any) {
    console.error('[propagation-catchup]', err);
    return c.json({ error: err.message }, 500);
  }
}
