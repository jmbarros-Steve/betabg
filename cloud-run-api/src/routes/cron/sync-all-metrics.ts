import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';

/**
 * Cron endpoint: sync metrics for all active platform connections.
 * Designed to be called by Cloud Scheduler every 6 hours.
 *
 * Security: validates a shared secret via X-Cron-Secret header
 * (set CRON_SECRET env var on Cloud Run and Cloud Scheduler).
 */
export async function syncAllMetrics(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const cronSecret = process.env.CRON_SECRET!;

  const supabase = getSupabaseAdmin();

  // Mutex: prevent overlapping cron runs using steve_knowledge as lock table
  const lockKey = 'cron_lock_sync_all_metrics';
  const { data: lockRow } = await supabase
    .from('steve_knowledge')
    .select('id, contenido')
    .eq('categoria', 'system')
    .eq('titulo', lockKey)
    .maybeSingle();

  const now = new Date();
  if (lockRow) {
    const lockedAt = new Date(lockRow.contenido || '');
    const lockAgeMinutes = (now.getTime() - lockedAt.getTime()) / 60000;
    if (lockAgeMinutes < 10) {
      console.log(`[cron] sync-all-metrics already running (locked ${Math.round(lockAgeMinutes)}min ago), skipping`);
      return c.json({ skipped: true, reason: 'Another run in progress' });
    }
  }

  // Acquire lock
  const { error: lockErr } = await supabase.from('steve_knowledge').upsert(
    { categoria: 'system', titulo: lockKey, contenido: now.toISOString(), activo: true, orden: 0 },
    { onConflict: 'categoria,titulo' },
  );
  if (lockErr) {
    console.error('[cron] Failed to acquire sync-all-metrics lock:', lockErr);
    return c.json({ error: 'Failed to acquire lock' }, 500);
  }

  try {
  const results: Array<{ connection_id: string; platform: string; status: string; error?: string }> = [];

  // Fetch all active connections, then filter in JS to avoid fragile .or() with RLS
  const { data: allConnections, error: fetchErr } = await supabase
    .from('platform_connections')
    .select('id, platform, account_id, access_token_encrypted, api_key_encrypted, store_url, client_id, connection_type')
    .eq('is_active', true);

  if (fetchErr || !allConnections) {
    console.error('[cron] Failed to fetch connections:', fetchErr);
    return c.json({ error: 'Failed to fetch connections' }, 500);
  }

  const connections = allConnections.filter(c =>
    c.access_token_encrypted || c.api_key_encrypted ||
    c.connection_type === 'bm_partner' || c.connection_type === 'leadsie'
  );

  console.log(`[cron] Found ${connections.length} active connections to sync`);

  const baseUrl = process.env.SELF_URL;
  if (!baseUrl) {
    console.error('[cron] SELF_URL env var is not set');
    return c.json({ error: 'SELF_URL not configured' }, 500);
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];

    // Delay between Meta connections to spread out API calls
    if (i > 0 && conn.platform === 'meta') {
      console.log(`[cron] Waiting 2s before syncing next Meta connection...`);
      await sleep(2000);
    }

    try {
      let endpoint: string;
      let body: Record<string, string>;

      switch (conn.platform) {
        case 'meta':
          endpoint = '/api/sync-meta-metrics';
          body = { connection_id: conn.id };
          break;
        case 'shopify':
          endpoint = '/api/sync-shopify-metrics';
          body = { connectionId: conn.id };
          break;
        case 'google':
          endpoint = '/api/sync-campaign-metrics';
          body = { connection_id: conn.id, platform: 'google' };
          break;
        case 'klaviyo':
          endpoint = '/api/sync-klaviyo-metrics';
          body = { connectionId: conn.id };
          break;
        default:
          results.push({ connection_id: conn.id, platform: conn.platform, status: 'skipped' });
          continue;
      }

      // Internal call: pass service role key so authMiddleware allows it
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'X-Internal-Key': serviceKey,
          'X-Cron-Secret': cronSecret!,
        },
        body: JSON.stringify(body),
      });

      const status = response.ok ? 'success' : 'error';
      const detail = response.ok ? undefined : await response.text().catch(() => 'unknown');
      results.push({ connection_id: conn.id, platform: conn.platform, status, error: detail });

      console.log(`[cron] ${conn.platform} ${conn.id}: ${status}`);
    } catch (err: any) {
      console.error(`[cron] ${conn.platform} ${conn.id} failed:`, err.message);
      results.push({ connection_id: conn.id, platform: conn.platform, status: 'error', error: err.message });
    }
  }

  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log(`[cron] Sync complete: ${succeeded} succeeded, ${failed} failed out of ${connections.length}`);

  return c.json({
    total: connections.length,
    succeeded,
    failed,
    results,
  });
  } finally {
    // Release mutex lock
    await supabase
      .from('steve_knowledge')
      .delete()
      .eq('categoria', 'system')
      .eq('titulo', lockKey);
  }
}
