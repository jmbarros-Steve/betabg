/**
 * Sales Learning Loop — Auto-aprendizaje de conversaciones.
 *
 * Runs at 8pm Chile (11pm UTC): analyzes converted/lost prospect conversations
 * and extracts sales learnings into steve_knowledge for future use.
 *
 * Pipeline:
 * 1. Find converted/lost prospects without learning_extracted
 * 2. Load full conversation from wa_messages
 * 3. Analyze with Claude Sonnet (worth the cost for quality)
 * 4. Save learnings to steve_knowledge (categoria='sales_learning')
 * 5. Every 10+ learnings: generate meta-patterns (categoria='sales_strategy')
 *
 * Cron: 0 23 * * * (11pm UTC = 8pm Chile)
 * Auth: X-Cron-Secret header
 */

import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuery } from '../../lib/safe-supabase.js';

export async function salesLearningLoop(c: Context) {
  const cronSecret = c.req.header('X-Cron-Secret')?.trim();
  const expected = process.env.CRON_SECRET;
  if (!expected || cronSecret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const results = { analyzed: 0, learnings_created: 0, meta_patterns: 0, errors: 0 };

  try {
    // ============================================================
    // STEP 1: Find unanalyzed converted/lost prospects
    // ============================================================
    const prospects = await safeQuery<{ id: string; phone: string; name: string | null; profile_name: string | null; what_they_sell: string | null; stage: string; lead_score: number | null; lost_reason: string | null; pain_points: string[] | null; current_marketing: string | null; message_count: number | null }>(
      supabase
        .from('wa_prospects')
        .select('id, phone, name, profile_name, what_they_sell, stage, lead_score, lost_reason, pain_points, current_marketing, message_count')
        .in('stage', ['converted', 'lost'])
        .eq('learning_extracted', false)
        .order('updated_at', { ascending: true })
        .limit(10),
      'salesLearningLoop.fetchProspects',
    );

    if (!prospects.length) {
      return c.json({ success: true, message: 'No unanalyzed prospects', ...results });
    }

    for (const prospect of prospects) {
      try {
        // STEP 2: Load full conversation
        const messages = await safeQuery<{ direction: string; body: string; created_at: string }>(
          supabase
            .from('wa_messages')
            .select('direction, body, created_at')
            .eq('contact_phone', prospect.phone)
            .eq('channel', 'prospect')
            .is('client_id', null)
            .order('created_at', { ascending: true })
            .limit(100),
          'salesLearningLoop.fetchMessages',
        );

        if (!messages.length || messages.length < 4) {
          // Too few messages to learn from
          await supabase
            .from('wa_prospects')
            .update({ learning_extracted: true })
            .eq('id', prospect.id);
          continue;
        }

        const conversation = messages.map((m: any) =>
          `${m.direction === 'inbound' ? 'Prospecto' : 'Steve'}: ${m.body}`
        ).join('\n');

        const outcome = prospect.stage === 'converted' ? 'CONVERTIDO (éxito)' : `PERDIDO (${prospect.lost_reason || 'sin razón'})`;
        const industry = prospect.what_they_sell || 'desconocido';

        // STEP 3: Analyze with Sonnet (worth the cost)
        const analysisPrompt = `Eres un analista de ventas senior. Analiza esta conversación de WhatsApp entre Steve (vendedor AI) y un prospecto.

RESULTADO: ${outcome}
INDUSTRIA: ${industry}
SCORE FINAL: ${prospect.lead_score || 0}/100
MENSAJES: ${messages.length}
${prospect.pain_points?.length ? `DOLORES: ${prospect.pain_points.join(', ')}` : ''}
${prospect.current_marketing ? `MARKETING ACTUAL: ${prospect.current_marketing}` : ''}

CONVERSACIÓN COMPLETA:
${conversation.slice(0, 8000)}

Analiza y responde SOLO con un JSON (sin markdown):
{
  "techniques_that_worked": ["técnica 1 con ejemplo específico del mensaje", "técnica 2..."],
  "techniques_that_failed": ["técnica fallida 1 con ejemplo", "técnica fallida 2..."],
  "turning_point": "El momento exacto donde la conversación cambió (positivo o negativo). Cita el mensaje.",
  "prospect_personality": "Tipo: directo/cauteloso/emocional/analítico. Qué lo motivaba.",
  "key_learning": "La lección más importante de esta conversación en 1-2 oraciones.",
  "what_to_replicate": "Qué hacer igual en conversaciones similares.",
  "what_to_avoid": "Qué NO hacer en conversaciones similares."
}`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 800,
            messages: [{ role: 'user', content: analysisPrompt }],
          }),
        });

        if (!aiRes.ok) {
          console.error(`[sales-learning] API error for ${prospect.phone}:`, aiRes.status);
          results.errors++;
          continue;
        }

        const aiData: any = await aiRes.json();
        const rawText = (aiData.content?.[0]?.text || '').trim();
        const jsonStr = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();

        let analysis: any;
        try {
          analysis = JSON.parse(jsonStr);
        } catch {
          console.error(`[sales-learning] JSON parse error for ${prospect.phone}`);
          results.errors++;
          continue;
        }

        // STEP 4: Save learnings to steve_knowledge
        const learningTitle = `${prospect.stage === 'converted' ? '✅' : '❌'} ${industry} — ${analysis.key_learning?.slice(0, 100) || 'Sin título'}`;
        const learningContent = [
          `Resultado: ${outcome}`,
          `Score: ${prospect.lead_score || 0}/100`,
          `Personalidad: ${analysis.prospect_personality || 'N/A'}`,
          '',
          `🎯 Punto de quiebre: ${analysis.turning_point || 'N/A'}`,
          '',
          `✅ Técnicas que funcionaron:`,
          ...(analysis.techniques_that_worked || []).map((t: string) => `  - ${t}`),
          '',
          `❌ Técnicas que fallaron:`,
          ...(analysis.techniques_that_failed || []).map((t: string) => `  - ${t}`),
          '',
          `📝 Replicar: ${analysis.what_to_replicate || 'N/A'}`,
          `⚠️ Evitar: ${analysis.what_to_avoid || 'N/A'}`,
        ].join('\n');

        await supabase.from('steve_knowledge').insert({
          categoria: 'sales_learning',
          titulo: learningTitle,
          contenido: learningContent,
          activo: true,
          orden: 0,
        });

        results.learnings_created++;

        // Mark prospect as analyzed
        await supabase
          .from('wa_prospects')
          .update({ learning_extracted: true })
          .eq('id', prospect.id);

        results.analyzed++;
        console.log(`[sales-learning] Analyzed ${prospect.phone} (${outcome}): ${learningTitle.slice(0, 60)}`);
      } catch (err) {
        console.error(`[sales-learning] Error for ${prospect.phone}:`, err);
        results.errors++;
      }
    }

    // ============================================================
    // STEP 5: Generate meta-patterns if 10+ learnings exist
    // ============================================================
    const { count: learningCount } = await supabase
      .from('steve_knowledge')
      .select('id', { count: 'exact', head: true })
      .eq('categoria', 'sales_learning')
      .eq('activo', true)
      .is('purged_at', null);

    const { count: strategyCount } = await supabase
      .from('steve_knowledge')
      .select('id', { count: 'exact', head: true })
      .eq('categoria', 'sales_strategy')
      .eq('activo', true)
      .is('purged_at', null);

    // Generate meta-patterns every 10 new learnings
    if ((learningCount || 0) >= 10 && (learningCount || 0) > ((strategyCount || 0) * 10)) {
      try {
        // Load all learnings
        const allLearnings = await safeQuery<{ titulo: string; contenido: string }>(
          supabase
            .from('steve_knowledge')
            .select('titulo, contenido')
            .eq('categoria', 'sales_learning')
            .eq('activo', true)
            .is('purged_at', null)
            .order('created_at', { ascending: false })
            .limit(30),
          'salesLearningLoop.fetchAllLearnings',
        );

        if (allLearnings.length) {
          const learningsSummary = allLearnings
            .map((l: any) => `${l.titulo}: ${(l.contenido || '').slice(0, 200)}`)
            .join('\n\n');

          const metaPrompt = `Eres un estratega de ventas senior. Analiza estos ${allLearnings.length} aprendizajes de conversaciones de ventas por WhatsApp y genera META-PATRONES — reglas generales que aplican a múltiples conversaciones.

APRENDIZAJES:
${learningsSummary.slice(0, 6000)}

Genera 3-5 meta-patrones. Cada uno debe ser una regla accionable con evidencia de múltiples conversaciones.
Formato: una regla por línea, directa y accionable.
Ejemplo: "Prospectos de moda responden mejor a presión con datos de competencia que a presión de urgencia."
Ejemplo: "Cuando mencionan 'agencia', validar frustración ANTES de preguntar por BM convierte 80% más."

Responde SOLO con los patrones, uno por línea. Nada más.`;

          const metaRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 500,
              messages: [{ role: 'user', content: metaPrompt }],
            }),
          });

          if (metaRes.ok) {
            const metaData: any = await metaRes.json();
            const patterns = (metaData.content?.[0]?.text || '').trim();

            if (patterns) {
              await supabase.from('steve_knowledge').insert({
                categoria: 'sales_strategy',
                titulo: `Meta-patrones (${new Date().toISOString().split('T')[0]}) — ${allLearnings.length} conversaciones`,
                contenido: patterns,
                activo: true,
                orden: 100,
              });

              results.meta_patterns++;
              console.log('[sales-learning] Meta-patterns generated');
            }
          }
        }
      } catch (err) {
        console.error('[sales-learning] Meta-pattern error:', err);
      }
    }

    console.log('[sales-learning] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[sales-learning] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
