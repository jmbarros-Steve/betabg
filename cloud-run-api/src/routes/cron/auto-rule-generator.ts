import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

/**
 * C.5 — Auto-generación de reglas
 *
 * When qa_log receives an error that no criterio_rule covers,
 * this endpoint asks Claude Haiku to generate a new rule and inserts it.
 *
 * Called via POST /cron/auto-rule-generator
 * Body: { error_detail, error_type, entity_type }
 * Auth: X-Cron-Secret header
 */

export async function autoRuleGenerator(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json();
  const { error_detail, error_type, entity_type } = body;

  if (!error_detail) {
    return c.json({ error: 'error_detail is required' }, 400);
  }

  const supabase = getSupabaseAdmin();

  // 1. Fetch active rules (id + name + check only for prompt size)
  const existingRules = await safeQuery<{ id: string; name: string; check_rule: string }>(
    supabase
      .from('criterio_rules')
      .select('id, name, check_rule')
      .eq('active', true),
    'autoRuleGenerator.fetchActiveRules',
  );

  // 2. Ask Claude Haiku if an existing rule should cover this, or generate a new one
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  // Load Steve Brain knowledge to avoid duplicating known patterns
  let knowledgeBlock = '';
  try {
    ({ knowledgeBlock } = await loadKnowledge(['analisis'], { limit: 5, label: 'REGLAS YA APRENDIDAS POR STEVE', audit: { source: 'auto-rule-generator' } }));
  } catch (e) {
    console.error('[auto-rule-gen] loadKnowledge failed, continuing without:', e);
  }

  const rulesSnippet = existingRules
    .slice(0, 200) // limit prompt size
    .map((r) => `${r.id}: ${r.name} — ${r.check_rule}`)
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `Un error ocurrió en Steve Ads que ninguna regla detectó.
${knowledgeBlock}
ERROR: ${error_detail}
TIPO: ${error_type || 'unknown'}
ENTIDAD: ${entity_type || 'unknown'}

REGLAS EXISTENTES (resumen):
${rulesSnippet}

¿Alguna regla existente debería haber atrapado esto? Si sí, ¿cuál y por qué no lo hizo?
Si no, genera una NUEVA regla en JSON:
{
  "existing_covers": false,
  "new_rule": {
    "category": "META COPY|EMAIL BODY|STEVE DATOS|etc",
    "name": "nombre corto",
    "check_rule": "qué verificar exactamente",
    "pass_example": "ejemplo que pasa",
    "fail_example": "ejemplo que falla",
    "on_fail": "qué hacer si falla",
    "severity": "Rechazar|Advertencia|BLOQUEAR|ALERTA",
    "weight": 1,
    "organ": "CRITERIO|OJOS|JUEZ|ESPEJO"
  }
}
Si ya hay regla que cubre, responde: {"existing_covers": true, "rule_id": "R-XXX", "reason": "por qué no lo atrapó"}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`[auto-rule-gen] Anthropic API error: ${response.status}`);
    return c.json({ error: `AI API error: ${response.status}` }, 502);
  }

  let aiResponse: any;
  try {
    aiResponse = await response.json();
  } catch {
    console.error('[auto-rule-gen] Failed to parse Anthropic response as JSON');
    return c.json({ error: 'AI response not valid JSON' }, 502);
  }

  let result: any;
  try {
    const text = aiResponse.content?.[0]?.text || '';
    result = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    console.error('[auto-rule-gen] Failed to parse AI response content');
    return c.json({ error: 'AI response parse failed' }, 500);
  }

  // 3. If no existing rule covers it, insert the new one
  if (!result.existing_covers && result.new_rule) {
    // Generate next rule ID
    const { count } = await supabase
      .from('criterio_rules')
      .select('id', { count: 'exact', head: true });

    const nextNum = (count || 493) + 1;
    const newId = `R-${String(nextNum).padStart(3, '0')}`;

    const { error: insertError } = await supabase.from('criterio_rules').insert({
      id: newId,
      category: result.new_rule.category || 'AUTO',
      name: result.new_rule.name || 'Regla auto-generada',
      check_rule: result.new_rule.check_rule || error_detail.substring(0, 200),
      pass_example: result.new_rule.pass_example || '',
      fail_example: result.new_rule.fail_example || '',
      on_fail: result.new_rule.on_fail || 'Advertencia',
      severity: result.new_rule.severity || 'Advertencia',
      weight: result.new_rule.weight || 1,
      auto: true,
      organ: result.new_rule.organ || 'CRITERIO',
      active: true,
    });

    if (insertError) {
      console.error('[auto-rule-gen] Insert error:', insertError);
      return c.json({ error: 'Failed to insert new rule' }, 500);
    }

    // Log the creation
    await supabase.from('qa_log').insert({
      check_type: 'auto_rule_generated',
      error_type: 'auto_rule_generated',
      error_detail: `Regla ${newId} creada: ${result.new_rule.name}. Triggered by: ${error_detail.substring(0, 100)}`,
      detected_by: 'auto-rule-generator',
      status: 'info',
    });

    console.log(`[auto-rule-gen] Created rule ${newId}: ${result.new_rule.name}`);

    return c.json({ created: true, rule_id: newId, rule: result.new_rule });
  }

  return c.json({
    created: false,
    existing_covers: true,
    rule_id: result.rule_id,
    reason: result.reason,
  });
}
