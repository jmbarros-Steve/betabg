import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { snapshotBeforeUpdate } from '../../lib/knowledge-versioner.js';

export async function knowledgeConsolidator(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Fix Tomás W7 (2026-04-07): paginar. PostgREST corta en 1000 filas por
  // default. Antes el consolidator solo veía las top 1000 por `orden`, así
  // que categorías grandes (>15 reglas) con reglas de baja prioridad quedaban
  // truncadas y la consolidación LLM procesaba una vista incompleta.
  // Order estable: (orden DESC, id ASC) — necesario para que `range()` no repita/saltee filas.
  const allRules: Array<{ id: string; categoria: string; titulo: string; contenido: string; orden: number; veces_usada: number | null }> = [];
  const BATCH_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('steve_knowledge')
      .select('id, categoria, titulo, contenido, orden, veces_usada')
      .eq('activo', true)
      .order('orden', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) {
      console.error('[knowledge-consolidator] fetch error:', error);
      return c.json({ error: 'Failed to fetch rules' }, 500);
    }
    if (!batch || batch.length === 0) break;
    allRules.push(...batch);
    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  if (allRules.length === 0) return c.json({ message: 'No rules found' });

  const byCategory: Record<string, typeof allRules> = {};
  for (const r of allRules) {
    if (!byCategory[r.categoria]) byCategory[r.categoria] = [];
    byCategory[r.categoria].push(r);
  }

  let consolidated = 0;
  const results: Array<{ category: string; before: number; after: number }> = [];

  for (const [categoria, rules] of Object.entries(byCategory)) {
    if (rules.length <= 15) continue;

    const rulesSummary = rules
      .map((r, i) => `[${i}] ${r.titulo}: ${r.contenido.substring(0, 300)}`)
      .join('\n\n');

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: `Tienes ${rules.length} reglas de marketing en la categoría "${categoria}".
Consolídalas en 5-8 reglas maestras que capturen todo el conocimiento sin redundancia.

REGLAS ACTUALES:
${rulesSummary}

FORMATO de cada regla consolidada:
{
  "titulo": "título claro (máx 60 chars)",
  "contenido": "CUANDO: [situación]. HAZ: 1. [paso]. 2. [paso]. PORQUE: [razón]. Máximo 600 chars.",
  "merged_indices": [0, 3, 7]
}

Responde SOLO con un JSON array. Sin markdown.`,
          }],
        }),
      });

      if (!res.ok) continue;

      const data: any = await res.json();
      const text = data.content?.[0]?.text || '[]';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      const newRules = Array.isArray(parsed) ? parsed : [];

      if (newRules.length < 3 || newRules.length > 10) continue;

      // Deactivate old rules (keep the ones not merged)
      const mergedIndices = new Set(newRules.flatMap((r: any) => r.merged_indices || []));
      const idsToDeactivate = rules
        .filter((_, i) => mergedIndices.has(i))
        .map(r => r.id);

      if (idsToDeactivate.length > 0) {
        // Snapshot before consolidation
        for (const id of idsToDeactivate) {
          await snapshotBeforeUpdate(id, 'knowledge-consolidator', `consolidated in category: ${categoria}`);
        }
        await supabase.from('steve_knowledge')
          .update({ activo: false })
          .in('id', idsToDeactivate);
      }

      // Insert consolidated rules
      const inserts = newRules.map((r: any) => ({
        categoria,
        titulo: `[CONSOLIDADA] ${r.titulo}`.slice(0, 80),
        contenido: r.contenido.slice(0, 600),
        activo: true,
        orden: 99,
        merged_from: (r.merged_indices || []).map((i: number) => rules[i]?.titulo).filter(Boolean),
      }));

      await supabase.from('steve_knowledge').insert(inserts);
      consolidated += inserts.length;
      results.push({ category: categoria, before: rules.length, after: newRules.length });
    } catch (err) {
      console.error(`[knowledge-consolidator] Error consolidating ${categoria}:`, err);
    }
  }

  // Log
  if (results.length > 0) {
    await supabase.from('qa_log').insert({
      check_type: 'knowledge_consolidation',
      status: consolidated > 0 ? 'pass' : 'skip',
      details: JSON.stringify({ consolidated, results }),
      detected_by: 'knowledge-consolidator',
    });
  }

  return c.json({ consolidated, results });
}
