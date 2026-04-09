import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

/**
 * P2-7: Dashboard de salud de la email_send_queue.
 *
 * GET /api/email-queue-health?client_id=UUID (opcional, si no viene = global)
 *
 * Retorna:
 *   - statusCounts: { queued, processing, sent, failed, cancelled }
 *   - stuckItems: items en 'processing' > 10 min (posibles dead jobs)
 *   - throughputLastHour: cuántos items se procesaron en la última hora
 *   - topClients: top 10 clientes por items en cola
 *   - recentErrors: últimos 20 items con last_error poblado
 *   - oldestQueued: item más viejo en status='queued' (nos dice si la cola está atorada)
 *
 * Autor: Valentina W1 — 2026-04-08
 */
export async function queueHealthHandler(c: Context) {
  const supabase = getSupabaseAdmin();
  const clientId = c.req.query('client_id');

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Helper para scopear queries por cliente si aplica.
  const scope = <T>(q: any): any => (clientId ? q.eq('client_id', clientId) : q);

  try {
    // 1. Status counts
    const statuses = ['queued', 'processing', 'sent', 'failed', 'cancelled'] as const;
    const statusCounts: Record<string, number> = {};
    await Promise.all(
      statuses.map(async (s) => {
        const { count } = await scope(
          supabase.from('email_send_queue').select('*', { count: 'exact', head: true }).eq('status', s),
        );
        statusCounts[s] = count || 0;
      }),
    );

    // 2. Stuck items (processing > 10 min)
    const { data: stuckItems } = await scope(
      supabase
        .from('email_send_queue')
        .select('id, client_id, campaign_id, flow_id, subscriber_id, processed_at, attempts, last_error')
        .eq('status', 'processing')
        .lt('processed_at', tenMinutesAgo)
        .order('processed_at', { ascending: true })
        .limit(50),
    );

    // 3. Throughput última hora (items procesados)
    const { count: throughputSent } = await scope(
      supabase
        .from('email_send_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('processed_at', oneHourAgo),
    );
    const { count: throughputFailed } = await scope(
      supabase
        .from('email_send_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('processed_at', oneHourAgo),
    );

    // 4. Top clientes por items en cola (solo si es vista global)
    let topClients: Array<{ client_id: string; queued: number }> = [];
    if (!clientId) {
      const queuedRows = await safeQueryOrDefault<any>(
        supabase
          .from('email_send_queue')
          .select('client_id')
          .eq('status', 'queued')
          .limit(5000),
        [],
        'emailQueueHealth.getQueuedRows',
      );
      const counts: Record<string, number> = {};
      for (const row of queuedRows || []) {
        const cid = (row as any).client_id as string;
        counts[cid] = (counts[cid] || 0) + 1;
      }
      topClients = Object.entries(counts)
        .map(([client_id, queued]) => ({ client_id, queued }))
        .sort((a, b) => b.queued - a.queued)
        .slice(0, 10);
    }

    // 5. Últimos 20 errores
    const { data: recentErrors } = await scope(
      supabase
        .from('email_send_queue')
        .select('id, client_id, campaign_id, flow_id, last_error, processed_at, attempts')
        .not('last_error', 'is', null)
        .order('processed_at', { ascending: false })
        .limit(20),
    );

    // 6. Item más viejo en queued (detecta cola atorada)
    const { data: oldestQueuedArr } = await scope(
      supabase
        .from('email_send_queue')
        .select('id, client_id, scheduled_for, created_at, attempts')
        .eq('status', 'queued')
        .order('scheduled_for', { ascending: true })
        .limit(1),
    );
    const oldestQueued = oldestQueuedArr && oldestQueuedArr.length > 0 ? oldestQueuedArr[0] : null;

    // 7. Health verdict — reglas simples:
    //    - stuck > 0 → warning
    //    - failed última hora > 10% del sent → warning
    //    - oldestQueued > 30 min en el pasado → critical
    let verdict: 'ok' | 'warning' | 'critical' = 'ok';
    const warnings: string[] = [];

    if ((stuckItems?.length || 0) > 0) {
      verdict = 'warning';
      warnings.push(`${stuckItems!.length} items atascados en 'processing' > 10 min`);
    }

    const sentH = throughputSent || 0;
    const failedH = throughputFailed || 0;
    const totalProcessed = sentH + failedH;
    const failRate = totalProcessed > 0 ? (failedH / totalProcessed) * 100 : 0;
    if (failRate > 10 && totalProcessed >= 20) {
      verdict = 'warning';
      warnings.push(`Fail rate ${failRate.toFixed(1)}% en última hora (${failedH}/${totalProcessed})`);
    }

    if (oldestQueued && oldestQueued.scheduled_for) {
      const scheduledTs = new Date(oldestQueued.scheduled_for).getTime();
      const ageMinutes = (Date.now() - scheduledTs) / 60000;
      if (ageMinutes > 30) {
        verdict = 'critical';
        warnings.push(`Item más viejo en queued lleva ${Math.round(ageMinutes)} min esperando`);
      }
    }

    return c.json({
      verdict,
      warnings,
      scope: clientId ? 'client' : 'global',
      statusCounts,
      stuckItems: stuckItems || [],
      throughputLastHour: {
        sent: sentH,
        failed: failedH,
        total: totalProcessed,
        fail_rate_pct: Number(failRate.toFixed(2)),
      },
      topClients,
      recentErrors: recentErrors || [],
      oldestQueued,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[queue-health] error:', err);
    return c.json({ error: err.message || 'Failed to compute queue health' }, 500);
  }
}
