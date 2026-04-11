import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

export async function knowledgeDedup(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Fix Tomás W7 (2026-04-07): paginar. PostgREST corta en 1000 filas por
  // default y acá tenemos ~1434 activas. Antes el dedup solo consideraba las
  // primeras 1000 y no detectaba duplicados fuera de esa ventana.
  // Order estable: (orden DESC, id ASC) — `orden` puede tener empates, `id` los rompe.
  const rules: Array<{ id: string; categoria: string; titulo: string; contenido: string; orden: number }> = [];
  const BATCH_SIZE = 1000;
  let offset = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('steve_knowledge')
      .select('id, categoria, titulo, contenido, orden')
      .eq('activo', true)
      .is('purged_at', null)
      .order('orden', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) {
      console.error('[knowledge-dedup] fetch error:', error);
      return c.json({ error: 'Failed to fetch rules' }, 500);
    }
    if (!batch || batch.length === 0) break;
    rules.push(...batch);
    if (batch.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  if (rules.length < 5) {
    return c.json({ message: 'Not enough rules to dedup' });
  }

  // Group by category for comparison
  const byCategory: Record<string, typeof rules> = {};
  for (const r of rules) {
    if (!byCategory[r.categoria]) byCategory[r.categoria] = [];
    byCategory[r.categoria].push(r);
  }

  let mergedCount = 0;
  const mergeResults: Array<{ kept: string; removed: string[]; reason: string }> = [];

  // PROTECCIÓN: Estas categorías contienen reglas de ventas curadas manualmente
  // (stages, pitch, objeciones, valor primero). Haiku con 150 chars de contexto
  // las confundió como "duplicados semánticos" y desactivó Discovery, Pitch Steve,
  // Objeciones comunes y Valor primero — causando que Steve vendiera sin estrategia
  // de primer contacto ni manejo de objeciones. Detectado 2026-04-11.
  // Ver: commit 4211b6a1 (feat(knowledge): 10 rule quality improvements)
  const PROTECTED_CATEGORIES = new Set(['prospecting', 'sales_learning']);

  for (const [categoria, catRules] of Object.entries(byCategory)) {
    if (catRules.length < 3) continue;
    if (PROTECTED_CATEGORIES.has(categoria)) {
      console.log(`[knowledge-dedup] Skipping protected category: ${categoria} (${catRules.length} rules)`);
      continue;
    }

    const titles = catRules.map((r, i) => `[${i}] ${r.titulo}: ${r.contenido.substring(0, 150)}`).join('\n');

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
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Busca DUPLICADOS semánticos en estas reglas de la categoría "${categoria}".
Dos reglas son duplicadas si dicen esencialmente lo mismo con diferentes palabras.

${titles}

Si hay duplicados, responde con JSON:
{"duplicates": [{"keep": 0, "remove": [3, 7], "reason": "ambas hablan de X"}]}

Si NO hay duplicados: {"duplicates": []}
Solo JSON, sin markdown.`,
          }],
        }),
      });

      if (!res.ok) continue;

      const data: any = await res.json();
      const text = data.content?.[0]?.text || '{"duplicates":[]}';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

      for (const dup of (parsed.duplicates || [])) {
        const keepRule = catRules[dup.keep];
        const removeIndices: number[] = dup.remove || [];
        const removeRules = removeIndices.map(i => catRules[i]).filter(Boolean);

        if (!keepRule || removeRules.length === 0) continue;

        // Deactivate duplicates
        const removeIds = removeRules.map(r => r.id);
        await supabase.from('steve_knowledge')
          .update({ activo: false })
          .in('id', removeIds);

        // Update kept rule with merged_from
        await supabase.from('steve_knowledge')
          .update({
            merged_from: removeRules.map(r => r.titulo),
            orden: Math.max(keepRule.orden, ...removeRules.map(r => r.orden)),
          })
          .eq('id', keepRule.id);

        mergedCount += removeRules.length;
        mergeResults.push({
          kept: keepRule.titulo,
          removed: removeRules.map(r => r.titulo),
          reason: dup.reason,
        });
      }
    } catch (err) {
      console.error(`[knowledge-dedup] Error deduping ${categoria}:`, err);
    }
  }

  if (mergeResults.length > 0) {
    await supabase.from('qa_log').insert({
      check_type: 'knowledge_dedup',
      status: mergedCount > 0 ? 'pass' : 'skip',
      details: JSON.stringify({ merged: mergedCount, results: mergeResults }),
      detected_by: 'knowledge-dedup',
    });
  }

  return c.json({ merged: mergedCount, results: mergeResults });
}
