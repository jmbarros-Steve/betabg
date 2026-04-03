import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function knowledgeDedup(c: Context) {
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

  const { data: rules } = await supabase
    .from('steve_knowledge')
    .select('id, categoria, titulo, contenido, orden')
    .eq('activo', true)
    .order('orden', { ascending: false });

  if (!rules || rules.length < 5) {
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

  for (const [categoria, catRules] of Object.entries(byCategory)) {
    if (catRules.length < 3) continue;

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
