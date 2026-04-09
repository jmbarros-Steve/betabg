import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Knowledge Decay — Task 9
 * Detects obsolete knowledge rules and automatically decays them:
 * - No update in 90 days AND orden > 50 → lower orden to 50
 * - No update in 180 days → set activo=false
 *
 * Cron: monthly (0 4 1 * *)
 * Auth: X-Cron-Secret header
 */

interface DecayResult {
  rule_id: string;
  titulo: string;
  categoria: string;
  last_updated: string;
  action: 'lowered_orden' | 'deactivated';
  days_stale: number;
}

export async function knowledgeDecay(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const ninetyDaysAgo = new Date(now - 90 * 86400000).toISOString();
  const oneEightyDaysAgo = new Date(now - 180 * 86400000).toISOString();

  // Fix Tomás W7 (2026-04-07): paginar. PostgREST corta en 1000 filas por
  // default (max-rows). Antes solo se decayaban las primeras 1000 activas,
  // el resto quedaba eternamente "fresco" aunque lleve >180d sin update.
  const rules: Array<{ id: string; titulo: string; categoria: string; orden: number | null; updated_at: string | null }> = [];
  const BATCH_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: batch, error: rulesError } = await supabase
      .from('steve_knowledge')
      .select('id, titulo, categoria, orden, updated_at')
      .eq('activo', true)
      .is('purged_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (rulesError) {
      console.error('[knowledge-decay] Failed to fetch rules:', rulesError);
      return c.json({ error: 'Failed to fetch knowledge rules' }, 500);
    }
    if (!batch || batch.length === 0) break;
    rules.push(...batch);
    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  const decayed: DecayResult[] = [];
  let loweredCount = 0;
  let deactivatedCount = 0;

  for (const rule of rules) {
    const updatedAt = rule.updated_at || '1970-01-01T00:00:00Z';
    const daysSinceUpdate = Math.floor((now - new Date(updatedAt).getTime()) / 86400000);

    // 180+ days without update → deactivate entirely
    if (updatedAt < oneEightyDaysAgo) {
      const { error: updateErr } = await supabase
        .from('steve_knowledge')
        .update({ activo: false })
        .eq('id', rule.id);

      if (!updateErr) {
        deactivatedCount++;
        decayed.push({
          rule_id: rule.id,
          titulo: rule.titulo,
          categoria: rule.categoria,
          last_updated: updatedAt,
          action: 'deactivated',
          days_stale: daysSinceUpdate,
        });
        console.warn(`[knowledge-decay] DEACTIVATED "${rule.titulo}" (${rule.id}): ${daysSinceUpdate} days stale`);
      }
    }
    // 90+ days without update AND orden > 50 → lower orden to 50
    else if (updatedAt < ninetyDaysAgo && (rule.orden || 0) > 50) {
      const { error: updateErr } = await supabase
        .from('steve_knowledge')
        .update({ orden: 50 })
        .eq('id', rule.id);

      if (!updateErr) {
        loweredCount++;
        decayed.push({
          rule_id: rule.id,
          titulo: rule.titulo,
          categoria: rule.categoria,
          last_updated: updatedAt,
          action: 'lowered_orden',
          days_stale: daysSinceUpdate,
        });
        console.warn(`[knowledge-decay] LOWERED ORDEN "${rule.titulo}" (${rule.id}): ${daysSinceUpdate} days stale, orden ${rule.orden} -> 50`);
      }
    }
  }

  // Log results to qa_log
  await supabase.from('qa_log').insert({
    check_type: 'knowledge_decay',
    status: decayed.length > 0 ? 'warn' : 'pass',
    details: {
      rules_checked: rules.length,
      lowered_orden: loweredCount,
      deactivated: deactivatedCount,
      total_decayed: decayed.length,
      decayed,
    },
  });

  if (decayed.length > 0) {
    console.log(
      `[knowledge-decay] ${decayed.length} rules decayed: ${loweredCount} lowered, ${deactivatedCount} deactivated (out of ${rules.length} checked)`
    );
  } else {
    console.log(`[knowledge-decay] All ${rules.length} knowledge rules are fresh`);
  }

  return c.json({
    success: true,
    checked_at: new Date().toISOString(),
    rules_checked: rules.length,
    lowered_orden: loweredCount,
    deactivated: deactivatedCount,
    total_decayed: decayed.length,
    decayed,
  });
}
