import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Cron endpoint: sync metrics for all active platform connections.
 * Designed to be called by Cloud Scheduler every 6 hours.
 *
 * Security: validates a shared secret via X-Cron-Secret header
 * (set CRON_SECRET env var on Cloud Run and Cloud Scheduler).
 */
export async function syncAllMetrics(c: Context) {
  // Validate cron secret
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = c.req.header('X-Cron-Secret');

  if (!cronSecret || providedSecret !== cronSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseAdmin();
  const results: Array<{ connection_id: string; platform: string; status: string; error?: string }> = [];

  // Fetch all active connections with valid tokens
  const { data: connections, error: fetchErr } = await supabase
    .from('platform_connections')
    .select('id, platform, account_id, access_token_encrypted, store_url, client_id')
    .eq('is_active', true)
    .not('access_token_encrypted', 'is', null);

  if (fetchErr || !connections) {
    console.error('[cron] Failed to fetch connections:', fetchErr);
    return c.json({ error: 'Failed to fetch connections' }, 500);
  }

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
        case 'google_ads':
          endpoint = '/api/sync-google-ads-metrics';
          body = { connection_id: conn.id };
          break;
        case 'klaviyo':
          endpoint = '/api/sync-klaviyo-metrics';
          body = { connection_id: conn.id };
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
}
