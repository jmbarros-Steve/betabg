import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function steveAgentLoop(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  const now = new Date();
  const log: string[] = [];

  try {
    // ========== 1. PERCEIVE ==========
    log.push('=== PERCEIVE ===');

    // Get recent alerts
    // Fix Tomás W7 (2026-04-07): qa_log usa `checked_at`, no `created_at`.
    // Antes la query fallaba silenciosamente y el LLM recibía alerts="" siempre
    // → el agente autónomo tomaba decisiones a ciegas.
    const { data: recentAlerts, error: alertsError } = await supabase
      .from('qa_log')
      .select('check_type, status, details, checked_at')
      .in('status', ['fail', 'warn'])
      .gte('checked_at', new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString())
      .order('checked_at', { ascending: false })
      .limit(10);
    if (alertsError) {
      log.push(`recent-alerts fetch error: ${alertsError.message}`);
    }

    // Fix Tomás W7 (2026-04-07): paginar. PostgREST corta en 1000 filas por
    // default. Antes los contadores (pending/active/categorías) del PERCEIVE
    // quedaban sesgados hacia las primeras 1000 reglas, afectando el razonamiento
    // downstream del agente autónomo.
    const knowledgeStats: Array<{ id: string; categoria: string; approval_status: string; activo: boolean }> = [];
    const BATCH_SIZE = 1000;
    let offset = 0;
    let knowledgeStatsError: string | null = null;
    while (true) {
      const { data: batch, error } = await supabase
        .from('steve_knowledge')
        .select('id, categoria, approval_status, activo')
        .eq('activo', true)
        .order('id', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        // Isidora W6 review: antes solo `log.push+break` enmascaraba el error.
        // Ahora lo capturamos para degradar el qa_log.status a 'warn' abajo.
        knowledgeStatsError = error.message;
        log.push(`knowledge-stats fetch error: ${error.message}`);
        break;
      }
      if (!batch || batch.length === 0) break;
      knowledgeStats.push(...batch);
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    const pendingCount = knowledgeStats.filter(k => k.approval_status === 'pending').length;
    const activeCount = knowledgeStats.filter(k => k.approval_status === 'approved').length;
    const categories = [...new Set(knowledgeStats.map(k => k.categoria))];

    // Get recent feedback
    const { data: recentFeedback } = await supabase
      .from('steve_feedback')
      .select('feedback_type, created_at')
      .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

    const positiveFb = (recentFeedback || []).filter(f => f.feedback_type === 'positive').length;
    const negativeFb = (recentFeedback || []).filter(f => f.feedback_type === 'negative').length;

    // Get client metrics summary
    const { data: recentMetrics } = await supabase
      .from('campaign_metrics')
      .select('connection_id, spend, conversion_value')
      .gte('metric_date', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    const totalSpend = (recentMetrics || []).reduce((a, m) => a + (Number(m.spend) || 0), 0);
    const totalRevenue = (recentMetrics || []).reduce((a, m) => a + (Number(m.conversion_value) || 0), 0);
    const overallROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    log.push(`Alerts: ${(recentAlerts || []).length} | Knowledge: ${activeCount} active, ${pendingCount} pending`);
    log.push(`Feedback: ${positiveFb} positive, ${negativeFb} negative | ROAS: ${overallROAS.toFixed(2)}x`);

    // ========== 2. REASON ==========
    log.push('=== REASON ===');

    // Fix Tomás W7 (2026-04-07, Fase 1 deuda técnica):
    // Isidora W6 observó que cuando `alertsError` ocurre, el LLM recibía
    // alerts="" igual que si no hubiera alertas → razonaba con info falsa.
    // Ahora marcamos FETCH_ERROR explícitamente para que el agente lo sepa
    // y pueda degradar a "no action" en vez de decidir a ciegas.
    const worldState = {
      alerts: alertsError
        ? `FETCH_ERROR: ${alertsError.message}`
        : (recentAlerts || []).map(a => `${a.check_type}: ${a.status}`).join(', '),
      knowledge: `${activeCount} active rules in ${categories.length} categories, ${pendingCount} pending approval`,
      feedback: `${positiveFb} positive, ${negativeFb} negative in last 24h`,
      performance: `Overall ROAS: ${overallROAS.toFixed(2)}x, spend: $${totalSpend.toFixed(0)}, revenue: $${totalRevenue.toFixed(0)}`,
      timestamp: now.toISOString(),
    };

    const reasonRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Eres Steve, agente autónomo de marketing. Analiza este estado y decide qué hacer.

ESTADO ACTUAL:
${JSON.stringify(worldState, null, 2)}

CATEGORÍAS CON REGLAS: ${categories.join(', ')}

Decide las 2-3 acciones más importantes. Opciones:
- "search_topic": buscar contenido sobre un tema que falta (especifica el tema)
- "evaluate_rules": evaluar si reglas recientes funcionaron
- "alert_client": alertar a un cliente sobre un problema
- "improve_knowledge": mejorar reglas de baja calidad
- "nothing": todo está bien, no hacer nada

Responde JSON: {"actions": [{"type": "search_topic", "detail": "..."}]}
Sin markdown.`,
        }],
      }),
    });

    let actions: Array<{ type: string; detail: string }> = [];
    if (reasonRes.ok) {
      const reasonData: any = await reasonRes.json();
      const text = (reasonData.content?.[0]?.text || '{"actions":[]}').trim();
      // Fix Tomás W7 (2026-04-07): try/catch en JSON.parse. Antes si Haiku
      // devolvía texto no-JSON, crasheaba el loop completo con 500.
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        actions = parsed.actions || [];
      } catch (parseErr: any) {
        log.push(`reason JSON parse failed: ${parseErr.message}. Raw: ${text.slice(0, 200)}`);
        actions = [];
      }
    }

    log.push(`Decided: ${actions.map(a => `${a.type}(${a.detail})`).join(', ')}`);

    // ========== 3. ACT ==========
    log.push('=== ACT ===');

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'search_topic': {
            // Search YouTube for the topic
            const searchQuery = encodeURIComponent(action.detail);
            const searchRes = await fetch(`https://www.youtube.com/results?search_query=${searchQuery}+marketing+2026`, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
            });

            if (searchRes.ok) {
              const html = await searchRes.text();
              const videoIds = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)]
                .map(m => m[1])
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .slice(0, 2);

              for (const videoId of videoIds) {
                // Queue for processing
                await supabase.from('learning_queue').insert({
                  source_type: 'youtube',
                  source_content: `https://www.youtube.com/watch?v=${videoId}`,
                  status: 'pending',
                  submitted_by: 'steve-agent',
                });
              }
              log.push(`Queued ${videoIds.length} videos about "${action.detail}"`);
            }
            break;
          }

          case 'improve_knowledge': {
            // Find low-quality rules and improve them
            const { data: lowQuality } = await supabase
              .from('steve_knowledge')
              .select('id, titulo, contenido, quality_score')
              .eq('activo', true)
              .eq('approval_status', 'approved')
              .lt('quality_score', 40)
              .order('quality_score', { ascending: true })
              .limit(3);

            for (const rule of (lowQuality || [])) {
              const improveRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'x-api-key': ANTHROPIC_API_KEY,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'claude-haiku-4-5-20251001',
                  max_tokens: 400,
                  messages: [{
                    role: 'user',
                    content: `Mejora esta regla de marketing. Hazla más accionable y específica.

Actual: ${rule.titulo}: ${rule.contenido}

Reescribe en formato: CUANDO: [situación]. HAZ: 1. [acción]. 2. [acción]. PORQUE: [razón].
Máx 500 chars. Solo la regla mejorada.`,
                  }],
                }),
              });

              if (improveRes.ok) {
                const improveData: any = await improveRes.json();
                const improved = (improveData.content?.[0]?.text || '').trim();
                if (improved && improved.length > 50) {
                  await supabase.from('steve_knowledge')
                    .update({ contenido: improved, quality_score: 60 })
                    .eq('id', rule.id);
                }
              }
            }
            log.push(`Improved ${(lowQuality || []).length} low-quality rules`);
            break;
          }

          case 'evaluate_rules': {
            log.push('Evaluation delegated to existing crons');
            break;
          }

          case 'nothing': {
            log.push('No action needed');
            break;
          }
        }
      } catch (err) {
        log.push(`Error in action ${action.type}: ${err}`);
      }
    }

    // ========== 4. EVALUATE ==========
    log.push('=== EVALUATE ===');

    // Check commitments that need follow-up
    // Fix Tomás W7 (2026-04-07): agregar `agreed_date` al SELECT. Antes no
    // estaba, entonces `commit.agreed_date` era undefined → `|| now` → age=0
    // → ningún commitment se marcaba como expired jamás.
    // Fix Tomás W7 (2026-04-07, Fase 1 deuda técnica): Isidora W6 observó
    // que si `agreed_date` viniera null por alguna razón, el fallback `|| now`
    // daba age=0 (pesimista). Ahora cascada: agreed_date → created_at → now.
    // created_at siempre existe en steve_commitments (verified).
    const { data: dueCommitments } = await supabase
      .from('steve_commitments')
      .select('id, client_id, commitment, agreed_date, created_at')
      .eq('status', 'pending')
      .lte('follow_up_date', now.toISOString())
      .limit(5);

    if (dueCommitments && dueCommitments.length > 0) {
      log.push(`${dueCommitments.length} commitments due for follow-up`);
      // Mark as expired if older than 30 days
      for (const commit of dueCommitments) {
        const age = now.getTime() - new Date(commit.agreed_date || commit.created_at || now).getTime();
        if (age > 30 * 24 * 60 * 60 * 1000) {
          await supabase.from('steve_commitments').update({ status: 'expired' }).eq('id', commit.id);
        }
      }
    }

    // Save episodic memory of this run
    await supabase.from('steve_episodic_memory').insert({
      event_type: 'agent_loop',
      summary: `Agent loop: ${actions.length} actions taken. ${log.filter(l => l.includes('Queued') || l.includes('Improved')).join('. ')}`,
      data: { worldState, actions, log },
    });

    // Log to qa_log. Si el fetch paginado de knowledge_stats falló parcial,
    // marcamos warn en lugar de pass para que Chino/OJOS lo detecten.
    await supabase.from('qa_log').insert({
      check_type: 'agent_loop',
      status: knowledgeStatsError ? 'warn' : 'pass',
      details: JSON.stringify({
        actions: actions.length,
        log,
        ...(knowledgeStatsError ? { knowledge_stats_error: knowledgeStatsError, degraded: true } : {}),
      }),
      detected_by: 'steve-agent-loop',
    });

    return c.json({ success: true, actions, log });
  } catch (err: any) {
    console.error('[steve-agent-loop]', err);
    return c.json({ error: err.message }, 500);
  }
}
