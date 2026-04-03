import { getSupabaseAdmin } from './supabase.js';

interface PropagationDecision {
  criterio: {
    enforceable: boolean;
    rule_name?: string;
    category?: string;
    check_rule?: string;
    pass_example?: string;
    fail_example?: string;
    on_fail?: string;
    severity?: string;
  };
  espejo: { visual_relevant: boolean; reason?: string };
  juez: { testable: boolean; question?: string; expected_behavior?: string; category?: string };
}

/**
 * Propagate approved knowledge insights to CRITERIO, ESPEJO, and JUEZ.
 * Called fire-and-forget after JM approves insights.
 */
export async function propagateKnowledge(insightIds: string[]): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Fetch approved + not-yet-propagated insights
  const { data: insights, error: fetchErr } = await supabase
    .from('steve_knowledge')
    .select('id, titulo, contenido, categoria')
    .in('id', insightIds)
    .eq('approval_status', 'approved')
    .is('propagated_at', null);

  if (fetchErr || !insights || insights.length === 0) {
    console.log('[propagator] No unpropagated approved insights found');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[propagator] ANTHROPIC_API_KEY not set');
    return;
  }

  let totalCriterio = 0;
  let totalEspejo = 0;
  let totalJuez = 0;

  for (const insight of insights) {
    try {
      const decision = await analyzeWithHaiku(apiKey, insight);
      const propagatedTo: string[] = [];

      // 1. CRITERIO: create new rule if enforceable
      if (decision.criterio.enforceable && decision.criterio.check_rule) {
        // Generate next ID following R-### pattern
        const { count } = await supabase
          .from('criterio_rules')
          .select('id', { count: 'exact', head: true });
        const nextNum = (count || 493) + 1;
        const ruleId = `R-${String(nextNum).padStart(3, '0')}`;

        const severityMap: Record<string, string> = {
          high: 'Rechazar', medium: 'Advertencia', low: 'ALERTA',
        };

        await supabase.from('criterio_rules').insert({
          id: ruleId,
          category: decision.criterio.category || 'SWARM',
          name: decision.criterio.rule_name || insight.titulo,
          check_rule: decision.criterio.check_rule,
          pass_example: decision.criterio.pass_example || null,
          fail_example: decision.criterio.fail_example || null,
          on_fail: decision.criterio.on_fail || `Rechazar. Regla aprendida del swarm: ${insight.titulo}`,
          severity: severityMap[decision.criterio.severity || 'medium'] || 'Advertencia',
          organ: 'CRITERIO',
          auto: true,
          active: true,
          source_knowledge_id: insight.id,
          propagated_from: 'knowledge_propagator',
        });
        propagatedTo.push('criterio');
        totalCriterio++;
        console.log(`[propagator] Created criterio_rule ${ruleId} from insight ${insight.id}`);
      }

      // 2. ESPEJO: mark as visually relevant
      if (decision.espejo.visual_relevant) {
        await supabase
          .from('steve_knowledge')
          .update({ visual_relevant: true })
          .eq('id', insight.id);
        propagatedTo.push('espejo');
        totalEspejo++;
        console.log(`[propagator] Marked insight ${insight.id} as visual_relevant`);
      }

      // 3. JUEZ: create golden question
      if (decision.juez.testable && decision.juez.question && decision.juez.expected_behavior) {
        const questionId = `GD-SK-${insight.id.substring(0, 8).toUpperCase()}`;
        await supabase.from('juez_golden_questions').insert({
          id: questionId,
          category: decision.juez.category || 'SWARM_KNOWLEDGE',
          question: decision.juez.question,
          expected_behavior: decision.juez.expected_behavior,
          source_knowledge_id: insight.id,
          active: true,
        });
        propagatedTo.push('juez');
        totalJuez++;
        console.log(`[propagator] Created juez_golden_question ${questionId} from insight ${insight.id}`);
      }

      // Mark insight as propagated
      await supabase
        .from('steve_knowledge')
        .update({
          propagated_at: new Date().toISOString(),
          propagated_to: propagatedTo,
        })
        .eq('id', insight.id);

    } catch (err) {
      console.error(`[propagator] Error processing insight ${insight.id}:`, err);
    }
  }

  // Log propagation summary to qa_log
  await supabase.from('qa_log').insert({
    check_type: 'knowledge_propagation',
    status: 'pass',
    details: {
      insights_processed: insights.length,
      criterio_rules_created: totalCriterio,
      espejo_marked: totalEspejo,
      juez_questions_created: totalJuez,
    },
  });

  console.log(`[propagator] Done: ${insights.length} insights → ${totalCriterio} criterio, ${totalEspejo} espejo, ${totalJuez} juez`);
}

async function analyzeWithHaiku(apiKey: string, insight: { titulo: string; contenido: string; categoria: string }): Promise<PropagationDecision> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Analiza este insight de marketing aprobado y decide cómo propagarlo a los sistemas de calidad.

INSIGHT:
- Título: ${insight.titulo}
- Contenido: ${insight.contenido}
- Categoría: ${insight.categoria}

Decide 3 cosas:

1. CRITERIO (reglas de calidad para campañas/emails):
   ¿Este insight es ENFORZABLE como regla de calidad? Es decir, ¿se puede verificar automáticamente al evaluar un email o campaña?
   Si sí: genera los campos de la regla.

2. ESPEJO (evaluación visual):
   ¿Este insight tiene implicancia VISUAL? Es decir, ¿afecta cómo se ve un email o anuncio?

3. JUEZ (evaluación de Steve chat):
   ¿Se puede TESTEAR haciendo una pregunta a Steve? Es decir, ¿si un merchant pregunta algo relacionado, Steve debería responder diferente gracias a este insight?
   Si sí: genera la pregunta del merchant y el comportamiento esperado de Steve.

Responde SOLO en JSON válido (sin markdown, sin backticks):
{"criterio":{"enforceable":true/false,"rule_name":"nombre corto","category":"META COPY|EMAIL SUBJECT|EMAIL BODY|LANDING|SWARM","check_rule":"condición verificable (ej: subject.length < 60)","pass_example":"ejemplo que cumple","fail_example":"ejemplo que no cumple","on_fail":"Rechazar. Explicación corta","severity":"high/medium/low"},"espejo":{"visual_relevant":true/false,"reason":"..."},"juez":{"testable":true/false,"question":"...","expected_behavior":"...","category":"SWARM_KNOWLEDGE"}}`
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[propagator] Haiku API error: ${response.status} ${errText.slice(0, 200)}`);
    return defaultDecision();
  }

  const data: any = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as PropagationDecision;
  } catch {
    console.error('[propagator] Failed to parse Haiku response:', text.slice(0, 200));
    return defaultDecision();
  }
}

function defaultDecision(): PropagationDecision {
  return {
    criterio: { enforceable: false },
    espejo: { visual_relevant: false },
    juez: { testable: false },
  };
}
