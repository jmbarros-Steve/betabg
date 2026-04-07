import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { emailSendQueue } from '../email/send-queue.js';

/**
 * Email Queue Tick — cron que procesa email_send_queue cada 1 minuto.
 *
 * Schedule: cada 1 minuto
 * Auth: X-Cron-Secret header
 *
 * Flow:
 *   0. Pre-sweep: recupera items stuck en 'processing' > 30 min (crash recovery).
 *   1. Query distinct client_id con items status='queued' y scheduled_for <= now().
 *   2. Procesa clientes en paralelo con chunks de CONCURRENCY para no exceder
 *      el timeout de Cloud Run (60s default) ni saturar Resend.
 *   3. Agrega resumen por cliente.
 *
 * Autor: Valentina W1 (Steve Mail) — 2026-04-08
 */
const CONCURRENCY = 5;
const STUCK_PROCESSING_MINUTES = 30;

export async function emailQueueTick(c: Context) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();

  // 0. Pre-sweep: recover items stuck in 'processing' (crash recovery).
  // If a tick was killed mid-loop, items stay locked in 'processing'.
  // We look for items whose processed_at (set when transitioning to
  // 'processing') is older than STUCK_PROCESSING_MINUTES and reset them
  // to 'queued' so the next tick retries them.
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000).toISOString();
  let recoveredStuck = 0;
  try {
    const { data: recovered, error: sweepErr } = await supabase
      .from('email_send_queue')
      .update({ status: 'queued', last_error: 'recovered from stuck processing state' })
      .eq('status', 'processing')
      .lt('processed_at', stuckCutoff)
      .select('id');
    if (sweepErr) {
      console.error('[email-queue-tick] stuck sweep error:', sweepErr.message);
    } else {
      recoveredStuck = recovered?.length || 0;
      if (recoveredStuck > 0) {
        console.warn(`[email-queue-tick] recovered ${recoveredStuck} stuck items`);
      }
    }
  } catch (err: any) {
    console.error('[email-queue-tick] stuck sweep threw:', err?.message);
  }

  // 1. Encontrar clientes con items en cola listos para procesar.
  const { data: queueRows, error: queueErr } = await supabase
    .from('email_send_queue')
    .select('client_id')
    .eq('status', 'queued')
    .lte('scheduled_for', new Date().toISOString())
    .limit(1000);

  if (queueErr) {
    console.error('[email-queue-tick] query error:', queueErr.message);
    return c.json({ error: queueErr.message }, 500);
  }

  if (!queueRows || queueRows.length === 0) {
    return c.json({
      processed_clients: 0,
      total_sent: 0,
      total_failed: 0,
      recovered_stuck: recoveredStuck,
      duration_ms: Date.now() - startedAt,
    });
  }

  const clientIds = [...new Set(queueRows.map((r) => r.client_id))];
  const results: Array<{ client_id: string; processed: number; sent: number; failed: number; error?: string }> = [];
  let totalSent = 0;
  let totalFailed = 0;

  // 2. Procesar clientes en paralelo con chunks de CONCURRENCY.
  // Esto permite procesar hasta 60 clientes/min sin reventar el timeout de
  // Cloud Run (60s default) ni saturar la API de Resend.
  const processClient = async (clientId: string) => {
    try {
      // Construir un pseudo-context para reutilizar el handler existente.
      const fakeContext = {
        req: {
          json: async () => ({ action: 'process', client_id: clientId }),
        },
        req_raw: null,
        header: (_name: string) => undefined,
        json: (data: any) => ({ _body: data }),
      } as any;

      const response: any = await emailSendQueue(fakeContext);
      const payload = response?._body || {};
      const sent = payload.sent ?? 0;
      const failed = payload.failed ?? 0;
      const processed = payload.processed ?? 0;
      return { client_id: clientId, processed, sent, failed };
    } catch (err: any) {
      console.error(`[email-queue-tick] client ${clientId} failed:`, err?.message);
      return { client_id: clientId, processed: 0, sent: 0, failed: 0, error: err?.message || 'unknown' };
    }
  };

  for (let i = 0; i < clientIds.length; i += CONCURRENCY) {
    const chunk = clientIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((id) => processClient(id)));
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        const v = r.value;
        totalSent += v.sent;
        totalFailed += v.failed;
        results.push(v);
      } else {
        results.push({ client_id: 'unknown', processed: 0, sent: 0, failed: 0, error: String(r.reason) });
      }
    }
  }

  return c.json({
    processed_clients: clientIds.length,
    total_sent: totalSent,
    total_failed: totalFailed,
    recovered_stuck: recoveredStuck,
    duration_ms: Date.now() - startedAt,
    results,
  });
}
