import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { sendWhatsApp } from '../../lib/twilio-client.js';
import { safeQuery } from '../../lib/safe-supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { loadKnowledge } from '../../lib/knowledge-loader.js';

/**
 * Churn Detector — Steve Post-Venta
 *
 * Runs daily at 2pm UTC. Detects inactive merchants:
 * - 7-14 days inactive → churn_risk = low
 * - 14-21 days inactive → churn_risk = medium → WA check-in
 * - 21+ days inactive → churn_risk = high → WA + admin task
 *
 * Cron: 0 14 * * *
 * Auth: X-Cron-Secret header
 */
export async function churnDetector(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const results = { low: 0, medium: 0, high: 0, wa_sent: 0, tasks_created: 0, errors: 0 };

  try {
    // Find clients with last_active_at tracking
    const clients = await safeQuery<{ id: string; name: string | null; email: string | null; whatsapp_phone: string | null; last_active_at: string | null; churn_risk: string | null }>(
      supabase
        .from('clients')
        .select('id, name, email, whatsapp_phone, last_active_at, churn_risk')
        .not('last_active_at', 'is', null)
        .not('whatsapp_phone', 'is', null)
        .order('last_active_at', { ascending: true })
        .limit(30),
      'churnDetector.fetchClients',
    );

    if (clients.length === 0) {
      return c.json({ success: true, message: 'No clients with activity data', ...results });
    }

    // Load Steve Brain knowledge for better check-in messages
    const { knowledgeBlock } = await loadKnowledge(['analisis', 'shopify'], { limit: 5, label: 'CONTEXTO DE NEGOCIO APRENDIDO', audit: { source: 'churn-detector' } });

    for (const client of clients) {
      try {
        if (!client.last_active_at || !client.whatsapp_phone) continue;

        const daysSinceActive = (now.getTime() - new Date(client.last_active_at).getTime()) / (1000 * 60 * 60 * 24);
        const phone = client.whatsapp_phone.replace(/^\+/, '');
        const clientName = client.name || client.email?.split('@')[0] || '';

        let newRisk: 'none' | 'low' | 'medium' | 'high';
        if (daysSinceActive >= 21) {
          newRisk = 'high';
          results.high++;
        } else if (daysSinceActive >= 14) {
          newRisk = 'medium';
          results.medium++;
        } else if (daysSinceActive >= 7) {
          newRisk = 'low';
          results.low++;
        } else {
          // Active recently — reset risk
          if (client.churn_risk !== 'none') {
            const { error: resetErr } = await supabase.from('clients').update({ churn_risk: 'none' }).eq('id', client.id);
            if (resetErr) console.error(`[churn-detector] Failed to reset churn_risk for client ${client.id}:`, resetErr);
          }
          continue;
        }

        // Only send WA for medium/high if risk just escalated.
        // Re-read churn_risk from DB to minimize stale data (another cron or admin may have changed it).
        const { data: freshClient } = await supabase
          .from('clients')
          .select('churn_risk')
          .eq('id', client.id)
          .single();
        const previousRisk = freshClient?.churn_risk || client.churn_risk || 'none';

        // Update risk level
        await supabase.from('clients').update({ churn_risk: newRisk }).eq('id', client.id);
        const riskOrder: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };
        // Bug #59 fix: default to 0 if previousRisk has an unexpected value
        const previousRiskLevel = riskOrder[previousRisk] ?? 0;
        const justEscalated = riskOrder[newRisk] > previousRiskLevel;

        if (!justEscalated) continue;

        if (newRisk === 'medium' || newRisk === 'high') {
          // Fetch a relevant metric to personalize the message
          const connections = await safeQuery<{ id: string }>(
            supabase
              .from('platform_connections')
              .select('id')
              .eq('client_id', client.id)
              .eq('is_active', true)
              .limit(3),
            'churnDetector.fetchConnections',
          );

          let metricContext = '';
          // Bug #84 fix: Guard against empty array passed to .in() which can error or return all rows
          const connectionIds = connections.map((c: any) => c.id).filter(Boolean);
          if (connectionIds.length > 0) {
            const recentMetrics = await safeQuery<{ metric_type: string; metric_value: number | string }>(
              supabase
                .from('platform_metrics')
                .select('metric_type, metric_value')
                .in('connection_id', connectionIds)
                .order('metric_date', { ascending: false })
                .limit(5),
              'churnDetector.fetchRecentMetrics',
            );

            if (recentMetrics.length > 0) {
              metricContext = `Sus últimas métricas: ${recentMetrics.map((m: any) => `${m.metric_type}: ${m.metric_value}`).join(', ')}.`;
            }
          }

          // Generate check-in message
          const severity = newRisk === 'high' ? 'muy importante' : 'amable';
          const prompt = `Genera un mensaje de WhatsApp ${severity} (max 3 líneas) para "${clientName}", un cliente de Steve que lleva ${Math.round(daysSinceActive)} días sin entrar a la plataforma. ${metricContext} Hazle un check-in genuino. Pregunta cómo va todo. Tono: cálido, preocupado, en español neutro.
${knowledgeBlock}
Responde SOLO con el mensaje.`;

          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 200,
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(15_000),
          });

          if (aiRes.ok) {
            const aiData: any = await aiRes.json();
            let msg = (aiData.content?.[0]?.text || '').trim();
            if (msg) {
              if (msg.length > 400) msg = msg.slice(0, 397) + '...';

              await sendWhatsApp(`+${phone}`, msg);

              const { error: insertErr } = await supabase.from('wa_messages').insert({
                client_id: client.id,
                channel: 'steve_chat',
                direction: 'outbound',
                from_number: process.env.STEVE_WA_NUMBER || process.env.TWILIO_PHONE_NUMBER || '',
                to_number: phone,
                body: msg,
                contact_name: clientName,
                contact_phone: phone,
              });
              if (insertErr) {
                console.error(`[churn-detector] wa_messages insert failed after send:`, insertErr.message);
              }

              results.wa_sent++;
              console.log(`[churn-detector] Check-in sent to ${phone} (risk: ${newRisk}, ${Math.round(daysSinceActive)}d inactive)`);
            }
          }

          // High risk → create admin task
          // Bug #94 fix: Check for existing pending CHURN task before creating a duplicate
          if (newRisk === 'high') {
            const { data: existingTask } = await supabase
              .from('tasks')
              .select('id')
              .eq('shop_id', client.id)
              .eq('status', 'pending')
              .ilike('title', '%CHURN%')
              .maybeSingle();

            if (!existingTask) {
              const taskResult = await supabase.from('tasks').insert({
                title: `[CHURN] ${clientName} lleva ${Math.round(daysSinceActive)} días inactivo`,
                description: `Cliente ${clientName} (${client.email}) no ha entrado a Steve en ${Math.round(daysSinceActive)} días. Riesgo alto de churn. Requiere atención personal.`,
                priority: 'high',
                status: 'pending',
                type: 'churn_alert',
                shop_id: client.id,
                assigned_agent: '3d195082-aa83-48c0-b514-a8052264a1e7',
                created_at: now.toISOString(),
              });
              if (!taskResult.error) results.tasks_created++;
            }
          }
        }

      } catch (err) {
        console.error(`[churn-detector] Error for client ${client.id}:`, err);
        results.errors++;
      }
    }

    console.log('[churn-detector] Done:', JSON.stringify(results));
    return c.json({ success: true, ...results });

  } catch (err: any) {
    console.error('[churn-detector] Fatal error:', err);
    return c.json({ error: err.message }, 500);
  }
}
