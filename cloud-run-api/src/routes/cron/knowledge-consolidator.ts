import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function knowledgeConsolidator(c: Context) {
  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Get categories with >15 active rules
  const { data: allRules } = await supabase
    .from('steve_knowledge')
    .select('id, categoria, titulo, contenido, orden, veces_usada')
    .eq('activo', true)
    .order('orden', { ascending: false });

  if (!allRules) return c.json({ message: 'No rules found' });

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
