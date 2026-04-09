import { SupabaseClient } from '@supabase/supabase-js';
import { safeQueryOrDefault } from './safe-supabase.js';

interface KnowledgeRule {
  categoria: string;
  titulo: string;
  contenido: string;
}

interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Array<{
    newRule: string;
    existingRule: string;
    existingTitulo: string;
    reason: string;
  }>;
  safeRules: KnowledgeRule[];
  conflictingRules: KnowledgeRule[];
}

/**
 * Detects semantic conflicts between new rules and existing steve_knowledge.
 * Uses Claude Haiku to check if any new rule contradicts existing ones in the same category.
 * Returns safe rules (no conflict) and conflicting rules (with explanation).
 */
export async function detectKnowledgeConflicts(
  supabase: SupabaseClient,
  newRules: KnowledgeRule[],
  anthropicApiKey: string
): Promise<ConflictResult> {
  const result: ConflictResult = {
    hasConflicts: false,
    conflicts: [],
    safeRules: [],
    conflictingRules: [],
  };

  if (!anthropicApiKey || newRules.length === 0) {
    result.safeRules = newRules;
    return result;
  }

  // Get categories of new rules
  const categories = [...new Set(newRules.map(r => r.categoria))];

  // Fetch existing rules in the same categories
  const existing = await safeQueryOrDefault<{ categoria: string; titulo: string; contenido: string }>(
    supabase
      .from('steve_knowledge')
      .select('categoria, titulo, contenido')
      .in('categoria', categories)
      .eq('activo', true)
      .is('purged_at', null)
      .order('orden', { ascending: false })
      .limit(50),
    [],
    'knowledge-conflict-detector.fetchExisting',
  );

  if (!existing || existing.length === 0) {
    result.safeRules = newRules;
    return result;
  }

  // Build existing rules summary per category
  const existingByCategory: Record<string, string[]> = {};
  for (const r of existing) {
    if (!existingByCategory[r.categoria]) existingByCategory[r.categoria] = [];
    existingByCategory[r.categoria].push(`- ${r.titulo}: ${r.contenido.substring(0, 150)}`);
  }

  // Check each new rule for conflicts (batch by category to reduce API calls)
  for (const categoria of categories) {
    const rulesInCat = newRules.filter(r => r.categoria === categoria);
    const existingInCat = existingByCategory[categoria];

    if (!existingInCat || existingInCat.length === 0) {
      result.safeRules.push(...rulesInCat);
      continue;
    }

    const newRulesSummary = rulesInCat
      .map((r, i) => `[NEW-${i}] ${r.titulo}: ${r.contenido.substring(0, 150)}`)
      .join('\n');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Detecta CONFLICTOS entre reglas NUEVAS y EXISTENTES de marketing.

REGLAS EXISTENTES (categoría: ${categoria}):
${existingInCat.join('\n')}

REGLAS NUEVAS:
${newRulesSummary}

¿Alguna regla nueva CONTRADICE directamente una existente? (ej: una dice "usar descuentos" y otra dice "evitar descuentos")

Responde SOLO JSON:
{"conflicts": [{"new_index": 0, "existing_titulo": "...", "reason": "contradicción breve"}]}
Si no hay conflictos: {"conflicts": []}`,
          }],
        }),
      });

      if (!response.ok) {
        // If API fails, let all rules through (fail-open)
        result.safeRules.push(...rulesInCat);
        continue;
      }

      const aiData: any = await response.json();
      const text = aiData.content?.[0]?.text || '{"conflicts":[]}';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

      const conflictIndices = new Set(
        (parsed.conflicts || []).map((c: { new_index: number }) => c.new_index)
      );

      for (let i = 0; i < rulesInCat.length; i++) {
        if (conflictIndices.has(i)) {
          const conflict = parsed.conflicts.find((c: { new_index: number }) => c.new_index === i);
          result.conflicts.push({
            newRule: rulesInCat[i].titulo,
            existingRule: conflict?.existing_titulo || 'unknown',
            existingTitulo: conflict?.existing_titulo || '',
            reason: conflict?.reason || 'Conflicto detectado',
          });
          result.conflictingRules.push(rulesInCat[i]);
        } else {
          result.safeRules.push(rulesInCat[i]);
        }
      }
    } catch (err) {
      // Fail-open: if conflict detection fails, let rules through
      console.error(`[conflict-detector] Error checking category ${categoria}:`, err);
      result.safeRules.push(...rulesInCat);
    }
  }

  result.hasConflicts = result.conflicts.length > 0;

  if (result.hasConflicts) {
    // Log conflicts to qa_log
    await supabase.from('qa_log').insert({
      check_type: 'knowledge_conflict',
      status: 'warn',
      details: JSON.stringify({
        total_new: newRules.length,
        conflicts_found: result.conflicts.length,
        safe_rules: result.safeRules.length,
        conflicts: result.conflicts,
      }),
      detected_by: 'conflict-detector',
    });

    console.warn(
      `[conflict-detector] ${result.conflicts.length} conflicts found:`,
      result.conflicts.map(c => `"${c.newRule}" vs "${c.existingRule}": ${c.reason}`)
    );
  }

  return result;
}
