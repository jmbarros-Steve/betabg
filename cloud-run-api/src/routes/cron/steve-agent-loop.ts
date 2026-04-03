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
    const { data: recentAlerts } = await supabase
      .from('qa_log')
      .select('check_type, status, details, created_at')
      .in('status', ['fail', 'warn'])
      .gte('created_at', new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    // Get knowledge stats
    const { data: knowledgeStats } = await supabase
      .from('steve_knowledge')
      .select('categoria, approval_status, activo')
      .eq('activo', true);

    const pendingCount = (knowledgeStats || []).filter(k => k.approval_status === 'pending').length;
    const activeCount = (knowledgeStats || []).filter(k => k.approval_status === 'approved').length;
    const categories = [...new Set((knowledgeStats || []).map(k => k.categoria))];

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

    const worldState = {
      alerts: (recentAlerts || []).map(a => `${a.check_type}: ${a.status}`).join(', '),
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
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      actions = parsed.actions || [];
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
    const { data: dueCommitments } = await supabase
      .from('steve_commitments')
      .select('id, client_id, commitment')
      .eq('status', 'pending')
      .lte('follow_up_date', now.toISOString())
      .limit(5);

    if (dueCommitments && dueCommitments.length > 0) {
      log.push(`${dueCommitments.length} commitments due for follow-up`);
      // Mark as expired if older than 30 days
      for (const commit of dueCommitments) {
        const age = now.getTime() - new Date((commit as any).agreed_date || now).getTime();
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

    // Log to qa_log
    await supabase.from('qa_log').insert({
      check_type: 'agent_loop',
      status: 'pass',
      details: JSON.stringify({ actions: actions.length, log }),
      detected_by: 'steve-agent-loop',
    });

    return c.json({ success: true, actions, log });
  } catch (err: any) {
    console.error('[steve-agent-loop]', err);
    return c.json({ error: err.message }, 500);
  }
}
