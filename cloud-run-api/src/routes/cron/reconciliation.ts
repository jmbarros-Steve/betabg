import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { decryptPlatformToken } from '../../lib/decrypt-token.js';
import { metaApiFetch } from '../../lib/meta-fetch.js';
import { createTask } from '../../lib/task-creator.js';
import { isValidCronSecret } from '../../lib/cron-auth.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

/**
 * Reconciliation Cron — Fase 6 paso B.6
 * Runs every 6 hours: 0 *​/6 * * *
 * Auth: X-Cron-Secret header
 *
 * Checks:
 * 1. Shopify products drift — compares Shopify product count vs local campaign references
 * 2. Meta phantom campaigns — campaigns in our DB not found in Meta
 * 3. Dead tokens — platform_connections with expired or invalid tokens
 * 4. Stuck tasks — email_send_queue or email_flow_enrollments stuck >48hrs
 *
 * Results go to qa_log table for OJOS monitoring.
 */

interface ReconciliationResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  details: Record<string, any>;
}

// ────────────────────────────────────────────────────────
// 1. Shopify product drift
// ────────────────────────────────────────────────────────
async function checkShopifyProductDrift(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<ReconciliationResult> {
  const check = 'shopify_product_drift';
  try {
    // Get all Shopify connections
    const { data: conns, error } = await supabase
      .from('platform_connections')
      .select('id, client_id, store_url, access_token_encrypted')
      .eq('platform', 'shopify')
      .not('access_token_encrypted', 'is', null);

    if (error || !conns?.length) {
      return { check, status: 'pass', details: { message: 'No Shopify connections', connections: 0 } };
    }

    const drifts: Array<{ client_id: string; store_url: string; shopify_count: number; local_refs: number }> = [];

    for (const conn of conns) {
      try {
        const token = await decryptPlatformToken(supabase, conn.access_token_encrypted);
        if (!token) continue;

        // Fetch product count from Shopify
        const res = await fetch(
          `https://${conn.store_url}/admin/api/2024-01/products/count.json`,
          {
            headers: { 'X-Shopify-Access-Token': token },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) continue;
        const { count: shopifyCount } = await res.json() as { count: number };

        // Count local product alert references for this client
        const { count: localRefs } = await supabase
          .from('product_alerts')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', conn.client_id)
          .eq('status', 'active');

        // Drift = Shopify has 0 products but we have active alerts
        if (shopifyCount === 0 && (localRefs ?? 0) > 0) {
          drifts.push({
            client_id: conn.client_id,
            store_url: conn.store_url,
            shopify_count: shopifyCount,
            local_refs: localRefs ?? 0,
          });
        }
      } catch {
        // Individual store failure — skip, don't block entire check
      }
    }

    if (drifts.length > 0) {
      return {
        check,
        status: 'warn',
        details: { message: `${drifts.length} stores with product drift`, drifts },
      };
    }
    return { check, status: 'pass', details: { stores_checked: conns.length, drifts: 0 } };
  } catch (err: any) {
    return { check, status: 'fail', details: { error: err.message } };
  }
}

// ────────────────────────────────────────────────────────
// 2. Meta phantom campaigns
// ────────────────────────────────────────────────────────
async function checkMetaPhantomCampaigns(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<ReconciliationResult> {
  const check = 'meta_phantom_campaigns';
  try {
    // Get all Meta connections
    const { data: conns, error } = await supabase
      .from('platform_connections')
      .select('id, client_id, account_id, connection_type')
      .eq('platform', 'meta')
      .eq('is_active', true)
      .not('account_id', 'is', null);

    if (error || !conns?.length) {
      return { check, status: 'pass', details: { message: 'No Meta connections', connections: 0 } };
    }

    const phantoms: Array<{ client_id: string; campaign_id: string; campaign_name: string }> = [];

    for (const conn of conns) {
      try {
        const token = await getTokenForConnection(supabase, conn);
        if (!token) continue;

        // Get campaigns we track in DB (last 30 days metrics)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const localCampaigns = await safeQueryOrDefault<{ campaign_id: string; campaign_name: string }>(
          supabase
            .from('campaign_metrics')
            .select('campaign_id, campaign_name')
            .eq('connection_id', conn.id)
            .gte('metric_date', thirtyDaysAgo),
          [],
          'reconciliation.fetchLocalCampaigns',
        );

        if (!localCampaigns.length) continue;

        // Deduplicate campaign IDs
        const uniqueIds = [...new Set(localCampaigns.map(c => c.campaign_id))];

        // Fetch active campaigns from Meta
        const accountId = conn.account_id.startsWith('act_')
          ? conn.account_id
          : `act_${conn.account_id}`;
        const metaRes = await metaApiFetch(
          `/${accountId}/campaigns`,
          token,
          {
            params: {
              fields: 'id,name,status',
              limit: '500',
            },
            timeout: 15000,
          }
        );

        if (!metaRes.ok) continue;
        const metaData = await metaRes.json() as { data?: Array<{ id: string; name: string; status: string }> };
        const metaIds = new Set((metaData.data || []).map(c => c.id));

        // Find campaigns in our DB but not in Meta
        for (const localId of uniqueIds) {
          if (!metaIds.has(localId)) {
            const name = localCampaigns.find(c => c.campaign_id === localId)?.campaign_name || 'unknown';
            phantoms.push({ client_id: conn.client_id, campaign_id: localId, campaign_name: name });
          }
        }
      } catch {
        // Individual connection failure — skip
      }
    }

    if (phantoms.length > 0) {
      return {
        check,
        status: 'warn',
        details: { message: `${phantoms.length} phantom campaigns detected`, phantoms: phantoms.slice(0, 50) },
      };
    }
    return { check, status: 'pass', details: { connections_checked: conns.length, phantoms: 0 } };
  } catch (err: any) {
    return { check, status: 'fail', details: { error: err.message } };
  }
}

// ────────────────────────────────────────────────────────
// 3. Dead tokens
// ────────────────────────────────────────────────────────
async function checkDeadTokens(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<ReconciliationResult> {
  const check = 'dead_tokens';
  try {
    const now = new Date().toISOString();

    // Find connections where token_expires_at is in the past
    const { data: expired, error } = await supabase
      .from('platform_connections')
      .select('id, client_id, platform, token_expires_at, last_sync_at')
      .not('access_token_encrypted', 'is', null)
      .lt('token_expires_at', now);

    if (error) {
      return { check, status: 'fail', details: { error: error.message } };
    }

    // Also find connections with no token_expires_at that haven't synced in 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const stale = await safeQueryOrDefault<{
      id: string;
      client_id: string;
      platform: string;
      last_sync_at: string | null;
    }>(
      supabase
        .from('platform_connections')
        .select('id, client_id, platform, last_sync_at')
        .not('access_token_encrypted', 'is', null)
        .is('token_expires_at', null)
        .lt('last_sync_at', sevenDaysAgo),
      [],
      'reconciliation.fetchStaleConnections',
    );

    const deadTokens = [
      ...(expired || []).map(c => ({
        connection_id: c.id,
        client_id: c.client_id,
        platform: c.platform,
        reason: 'token_expired',
        token_expires_at: c.token_expires_at,
      })),
      ...stale.map(c => ({
        connection_id: c.id,
        client_id: c.client_id,
        platform: c.platform,
        reason: 'no_sync_7d',
        last_sync_at: c.last_sync_at,
      })),
    ];

    if (deadTokens.length > 0) {
      return {
        check,
        status: deadTokens.some(t => t.reason === 'token_expired') ? 'fail' : 'warn',
        details: {
          message: `${deadTokens.length} dead/stale tokens found`,
          expired_count: (expired || []).length,
          stale_count: stale.length,
          tokens: deadTokens.slice(0, 50),
        },
      };
    }
    return { check, status: 'pass', details: { message: 'All tokens healthy' } };
  } catch (err: any) {
    return { check, status: 'fail', details: { error: err.message } };
  }
}

// ────────────────────────────────────────────────────────
// 4. Stuck tasks (>48 hours)
// ────────────────────────────────────────────────────────
async function checkStuckTasks(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<ReconciliationResult> {
  const check = 'stuck_tasks';
  try {
    const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
    const stuck: Array<{ table: string; count: number; sample_ids: string[] }> = [];

    // Check email_send_queue — stuck in 'queued' or 'processing' >48h
    const { data: stuckQueue, error: qErr } = await supabase
      .from('email_send_queue')
      .select('id')
      .in('status', ['queued', 'processing'])
      .lt('created_at', cutoff)
      .limit(100);

    if (!qErr && stuckQueue?.length) {
      stuck.push({
        table: 'email_send_queue',
        count: stuckQueue.length,
        sample_ids: stuckQueue.slice(0, 10).map(r => r.id),
      });
    }

    // Check email_flow_enrollments — stuck in 'active' with no progress >48h
    const { data: stuckEnroll, error: eErr } = await supabase
      .from('email_flow_enrollments')
      .select('id')
      .eq('status', 'active')
      .lt('updated_at', cutoff)
      .limit(100);

    if (!eErr && stuckEnroll?.length) {
      stuck.push({
        table: 'email_flow_enrollments',
        count: stuckEnroll.length,
        sample_ids: stuckEnroll.slice(0, 10).map(r => r.id),
      });
    }

    // Check learning_queue — stuck in 'processing' >48h
    const { data: stuckLearning, error: lErr } = await supabase
      .from('learning_queue')
      .select('id')
      .eq('status', 'processing')
      .lt('created_at', cutoff)
      .limit(100);

    if (!lErr && stuckLearning?.length) {
      stuck.push({
        table: 'learning_queue',
        count: stuckLearning.length,
        sample_ids: stuckLearning.slice(0, 10).map(r => r.id),
      });
    }

    if (stuck.length > 0) {
      const totalStuck = stuck.reduce((sum, s) => sum + s.count, 0);
      return {
        check,
        status: totalStuck > 20 ? 'fail' : 'warn',
        details: {
          message: `${totalStuck} tasks stuck >48h across ${stuck.length} tables`,
          tables: stuck,
        },
      };
    }
    return { check, status: 'pass', details: { message: 'No stuck tasks' } };
  } catch (err: any) {
    return { check, status: 'fail', details: { error: err.message } };
  }
}

// ────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────
export async function reconciliation(c: Context) {
  if (!isValidCronSecret(c.req.header('X-Cron-Secret'))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const startMs = Date.now();
  const supabase = getSupabaseAdmin();
  console.log('[reconciliation] Starting reconciliation checks...');

  // Run all checks concurrently
  const results = await Promise.allSettled([
    checkShopifyProductDrift(supabase),
    checkMetaPhantomCampaigns(supabase),
    checkDeadTokens(supabase),
    checkStuckTasks(supabase),
  ]);

  const checks: ReconciliationResult[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['shopify_product_drift', 'meta_phantom_campaigns', 'dead_tokens', 'stuck_tasks'];
    return { check: names[i], status: 'fail' as const, details: { error: (r.reason as Error)?.message || 'Unknown error' } };
  });

  // Insert each result into qa_log
  const qaRows = checks.map(ch => ({
    check_type: `reconciliation:${ch.check}`,
    status: ch.status,
    details: ch.details,
  }));

  const { error: insertErr } = await supabase.from('qa_log').insert(qaRows);
  if (insertErr) {
    console.error('[reconciliation] Failed to write qa_log:', insertErr.message);
  }

  // For critical failures, create criterio_results entries for OJOS alerting
  const criticals = checks.filter(ch => ch.status === 'fail');
  if (criticals.length > 0) {
    const criterioRows = criticals.map(ch => ({
      rule_id: 'R-RECON',
      shop_id: null,
      entity_type: 'health_check',
      entity_id: `reconciliation:${ch.check}`,
      passed: false,
      actual_value: ch.status,
      expected_value: 'pass',
      details: JSON.stringify(ch.details).slice(0, 2000),
      evaluated_by: 'ojos',
    }));

    const { error: crErr } = await supabase.from('criterio_results').insert(criterioRows);
    if (crErr) {
      console.error('[reconciliation] Failed to write criterio_results:', crErr.message);
    }

    // Create tasks for critical diffs
    for (const ch of criticals) {
      try {
        await createTask({
          title: `RECONCILIACION: ${ch.check} — ${ch.details.message || 'fallo critico'}`,
          description: `Reconciliacion detectó fallo en ${ch.check}.\n\n${JSON.stringify(ch.details, null, 2).slice(0, 1000)}`,
          priority: 'critica',
          type: 'bug',
          source: 'ojos',
        });
      } catch (taskErr: any) {
        console.error(`[reconciliation] Failed to create task for ${ch.check}:`, taskErr.message);
      }
    }
  }

  // Create tasks for warnings with high impact (>10 items affected)
  const highImpactWarns = checks.filter(ch => {
    if (ch.status !== 'warn') return false;
    const d = ch.details;
    const count = d.drifts?.length || d.phantoms?.length || d.tokens?.length || d.tables?.reduce((s: number, t: any) => s + t.count, 0) || 0;
    return count >= 10;
  });
  for (const ch of highImpactWarns) {
    try {
      await createTask({
        title: `RECONCILIACION: ${ch.check} — ${ch.details.message || 'alerta alta'}`,
        description: `Reconciliacion detectó alerta de alto impacto en ${ch.check}.\n\n${JSON.stringify(ch.details, null, 2).slice(0, 1000)}`,
        priority: 'alta',
        type: 'bug',
        source: 'ojos',
      });
    } catch (taskErr: any) {
      console.error(`[reconciliation] Failed to create warn task for ${ch.check}:`, taskErr.message);
    }
  }

  const elapsed = Date.now() - startMs;
  const summary = {
    duration_ms: elapsed,
    total_checks: checks.length,
    passed: checks.filter(c => c.status === 'pass').length,
    warnings: checks.filter(c => c.status === 'warn').length,
    failures: checks.filter(c => c.status === 'fail').length,
    checks,
  };

  console.log(
    `[reconciliation] Done in ${elapsed}ms — ${summary.passed} pass, ${summary.warnings} warn, ${summary.failures} fail`
  );

  return c.json(summary);
}
