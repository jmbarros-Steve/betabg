// El Chino — Runner principal (runChinoPatrol)
// Executes ALL check types: api_compare, token_health, performance,
// visual, functional, data_quality, security

import { getSupabaseAdmin } from '../lib/supabase.js';
import { decryptPlatformToken } from '../lib/decrypt-token.js';
import { executeApiCompare } from './checks/api-compare.js';
import { executeTokenHealth } from './checks/token-health.js';
import { executePerformance } from './checks/performance.js';
import { executeVisual } from './checks/visual.js';
import { executeFunctional } from './checks/functional.js';
import { executeDataQuality } from './checks/data-quality.js';
import { executeSecurity } from './checks/security.js';
import { generateFixPrompt } from './fix-generator.js';
import { sendCriticalAlert } from './whatsapp.js';
import type { ChinoCheck, MerchantConn, CheckResult, PatrolResult, PatrolDetail } from './types.js';

// All supported check types
const ALL_CHECK_TYPES = [
  'api_compare', 'api_exists', 'token_health', 'performance',
  'visual', 'functional', 'data_quality', 'security',
] as const;

// Concurrency limit for parallel check execution
const CONCURRENCY = 10;

// Check types that don't need a merchant connection
const NO_MERCHANT_TYPES = new Set(['performance', 'visual', 'api_exists']);

// Check types that don't need a decrypted token
const NO_TOKEN_TYPES = new Set(['performance', 'visual', 'api_exists']);

// ─── Get merchant connections ────────────────────────────────────

async function getMerchantConnections(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<MerchantConn[]> {
  const { data, error } = await supabase
    .from('platform_connections')
    .select(`
      id,
      client_id,
      platform,
      access_token_encrypted,
      api_key_encrypted,
      store_url,
      account_id,
      clients!inner(name)
    `)
    .eq('is_active', true);

  if (error) {
    console.error('[chino] Error fetching merchant connections:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    connection_id: row.id,
    client_id: row.client_id,
    client_name: (row.clients as any)?.name || 'Unknown',
    platform: row.platform,
    access_token_encrypted: row.access_token_encrypted,
    api_key_encrypted: row.api_key_encrypted,
    store_url: row.store_url,
    account_id: row.account_id,
  }));
}

// ─── Save report to chino_reports ────────────────────────────────

async function saveReport(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  runId: string,
  check: ChinoCheck,
  result: CheckResult,
  merchantId?: string,
  merchantName?: string
): Promise<void> {
  const { error } = await supabase.from('chino_reports').insert({
    run_id: runId,
    check_number: check.check_number,
    check_description: check.description,
    check_type: check.check_type,
    platform: check.platform,
    severity: check.severity,
    result: result.result,
    steve_value: result.steve_value != null ? String(result.steve_value) : null,
    real_value: result.real_value != null ? String(result.real_value) : null,
    error_message: result.error_message || null,
    duration_ms: result.duration_ms,
    merchant_id: merchantId || null,
    merchant_name: merchantName || null,
    screenshot_url: result.screenshot_url || null,
  });

  if (error) {
    console.error(`[chino] Error saving report for check #${check.check_number}:`, error.message);
  }
}

// ─── Update check status in chino_routine ────────────────────────

async function updateCheckStatus(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  check: ChinoCheck,
  result: CheckResult
): Promise<void> {
  const newConsecutiveFails = result.result === 'fail' || result.result === 'error'
    ? check.consecutive_fails + 1
    : 0;

  const { error } = await supabase
    .from('chino_routine')
    .update({
      last_checked_at: new Date().toISOString(),
      last_result: result.result,
      consecutive_fails: newConsecutiveFails,
    })
    .eq('id', check.id);

  if (error) {
    console.error(`[chino] Error updating check #${check.check_number}:`, error.message);
  }
}

// ─── Enqueue fix for a failed check ──────────────────────────────

async function enqueueFixIfNeeded(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  check: ChinoCheck,
  result: CheckResult
): Promise<void> {
  if (result.result !== 'fail') return;

  try {
    // Only generate fix if no active fix already exists for this check
    const { data: existingFix } = await supabase
      .from('steve_fix_queue')
      .select('id, status')
      .eq('check_id', check.id)
      .in('status', ['pending', 'assigned', 'fixing', 'deployed', 'verifying'])
      .maybeSingle();

    if (existingFix) {
      console.log(`[chino] Fix already in queue for check #${check.check_number} (status: ${existingFix.status})`);
      return;
    }

    // Generate fix prompt via Claude
    const fix = await generateFixPrompt({
      check_number: check.check_number,
      description: check.description,
      check_type: check.check_type,
      platform: check.platform,
      severity: check.severity,
      steve_value: result.steve_value != null ? String(result.steve_value) : null,
      real_value: result.real_value != null ? String(result.real_value) : null,
      error_message: result.error_message || null,
      screenshot_url: result.screenshot_url || null,
    });

    const { error } = await supabase.from('steve_fix_queue').insert({
      check_id: check.id,
      check_number: check.check_number,
      check_result: {
        steve_value: result.steve_value,
        real_value: result.real_value,
        error_message: result.error_message,
        screenshot_url: result.screenshot_url,
      },
      fix_prompt: fix.fix_prompt,
      probable_cause: fix.probable_cause,
      files_to_check: fix.files_to_check,
      status: 'pending',
      attempt: 1,
    });

    if (error) {
      console.error(`[chino] Error inserting fix for check #${check.check_number}:`, error.message);
    } else {
      console.log(`[chino] Fix enqueued for check #${check.check_number}: ${fix.probable_cause}`);
    }
  } catch (err: any) {
    // Never let fix generation crash the patrol
    console.error(`[chino] Fix generation failed for check #${check.check_number}:`, err.message);
  }
}

// ─── Decrypt token helper ────────────────────────────────────────

async function getDecryptedToken(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  merchant: MerchantConn
): Promise<string | null> {
  try {
    const encrypted = merchant.platform === 'klaviyo'
      ? merchant.api_key_encrypted
      : merchant.access_token_encrypted;

    return await decryptPlatformToken(supabase, encrypted);
  } catch (err: any) {
    console.error(`[chino] Token decrypt failed for merchant ${merchant.client_id} (${merchant.platform}):`, err.message);
    return null;
  }
}

// ─── Execute a single check ─────────────────────────────────────

async function executeCheck(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  check: ChinoCheck,
  merchant: MerchantConn | null,
  decryptedToken: string | null
): Promise<CheckResult> {
  const start = Date.now();

  try {
    switch (check.check_type) {
      case 'api_compare':
        return await executeApiCompare(supabase, check, merchant!, decryptedToken);

      case 'api_exists':
        return await executePerformance(check); // api_exists checks endpoint reachability like performance

      case 'token_health':
        return await executeTokenHealth(supabase, check, merchant!, decryptedToken);

      case 'performance':
        return await executePerformance(check);

      case 'visual':
        return await executeVisual(supabase, check, merchant);

      case 'functional':
        return await executeFunctional(supabase, check, merchant!, decryptedToken);

      case 'data_quality':
        return await executeDataQuality(supabase, check, merchant, decryptedToken);

      case 'security':
        return await executeSecurity(supabase, check, merchant!);

      default:
        return {
          result: 'skip',
          error_message: `check_type ${check.check_type} not implemented`,
          duration_ms: 0,
        };
    }
  } catch (err: any) {
    return {
      result: 'error',
      error_message: `Check #${check.check_number} crashed: ${err.message}`,
      duration_ms: Date.now() - start,
    };
  }
}

// ─── Main patrol runner ──────────────────────────────────────────

export async function runChinoPatrol(): Promise<PatrolResult> {
  const patrolStart = Date.now();
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const supabase = getSupabaseAdmin();

  console.log(`[chino] Starting patrol ${runId}`);

  // 1. Fetch ALL active checks
  const { data: checks, error: checksErr } = await supabase
    .from('chino_routine')
    .select('*')
    .eq('is_active', true)
    .in('check_type', ALL_CHECK_TYPES as unknown as string[])
    .order('check_number', { ascending: true });

  if (checksErr || !checks?.length) {
    console.error('[chino] No active checks found:', checksErr?.message);
    return {
      run_id: runId,
      total: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      skipped: 0,
      duration_ms: Date.now() - patrolStart,
      details: [],
    };
  }

  console.log(`[chino] Found ${checks.length} active checks`);

  // 2. Fetch all merchant connections
  const merchants = await getMerchantConnections(supabase);
  console.log(`[chino] Found ${merchants.length} active connections`);

  // Group merchants by platform
  const merchantsByPlatform = new Map<string, MerchantConn[]>();
  for (const m of merchants) {
    const list = merchantsByPlatform.get(m.platform) || [];
    list.push(m);
    merchantsByPlatform.set(m.platform, list);
  }

  // 3. Token cache to avoid re-decrypting
  const tokenCache = new Map<string, string | null>();

  async function getCachedToken(merchant: MerchantConn): Promise<string | null> {
    const key = merchant.connection_id;
    if (tokenCache.has(key)) return tokenCache.get(key)!;
    const token = await getDecryptedToken(supabase, merchant);
    tokenCache.set(key, token);
    return token;
  }

  // 4. Execute checks in parallel batches (CONCURRENCY at a time)
  const details: PatrolDetail[] = [];
  let passed = 0, failed = 0, errors = 0, skipped = 0;

  function tallyResult(result: CheckResult) {
    if (result.result === 'pass') passed++;
    else if (result.result === 'fail') failed++;
    else if (result.result === 'error') errors++;
    else skipped++;
  }

  // Process a single check (may produce multiple details if per-merchant)
  async function processCheck(check: ChinoCheck): Promise<PatrolDetail[]> {
    const localDetails: PatrolDetail[] = [];
    const needsMerchant = !NO_MERCHANT_TYPES.has(check.check_type);
    const needsToken = !NO_TOKEN_TYPES.has(check.check_type);

    // ── Checks that DON'T need a merchant ──
    if (!needsMerchant || ['infra', 'security', 'stevemail', 'steve_chat', 'brief', 'scraping'].includes(check.platform)) {
      const result = await executeCheck(supabase, check, null, null);
      localDetails.push({
        check_number: check.check_number,
        description: check.description,
        platform: check.platform,
        result,
      });
      await saveReport(supabase, runId, check, result);
      await updateCheckStatus(supabase, check, result);
      await enqueueFixIfNeeded(supabase, check, result);
      return localDetails;
    }

    // ── Checks that run per merchant ──
    let targetMerchants: MerchantConn[];

    if (check.platform === 'all') {
      targetMerchants = merchants;
    } else {
      targetMerchants = merchantsByPlatform.get(check.platform) || [];
    }

    if (targetMerchants.length === 0) {
      if (!needsMerchant || !needsToken) {
        const result = await executeCheck(supabase, check, null, null);
        localDetails.push({
          check_number: check.check_number,
          description: check.description,
          platform: check.platform,
          result,
        });
        await saveReport(supabase, runId, check, result);
        await updateCheckStatus(supabase, check, result);
        await enqueueFixIfNeeded(supabase, check, result);
        return localDetails;
      }

      const skipResult: CheckResult = {
        result: 'skip',
        error_message: `No hay conexiones activas para ${check.platform}`,
        duration_ms: 0,
      };
      localDetails.push({
        check_number: check.check_number,
        description: check.description,
        platform: check.platform,
        result: skipResult,
      });
      await saveReport(supabase, runId, check, skipResult);
      await updateCheckStatus(supabase, check, skipResult);
      return localDetails;
    }

    // Execute for each target merchant
    let lastResult: CheckResult | null = null;
    for (const merchant of targetMerchants) {
      let token: string | null = null;

      if (needsToken) {
        token = await getCachedToken(merchant);
        if (!token) {
          const skipResult: CheckResult = {
            result: 'skip',
            error_message: 'Token no disponible',
            duration_ms: 0,
          };
          localDetails.push({
            check_number: check.check_number,
            description: check.description,
            platform: check.platform,
            merchant_id: merchant.client_id,
            merchant_name: merchant.client_name,
            result: skipResult,
          });
          await saveReport(supabase, runId, check, skipResult, merchant.client_id, merchant.client_name);
          lastResult = skipResult;
          continue;
        }
      }

      const result = await executeCheck(supabase, check, merchant, token);
      localDetails.push({
        check_number: check.check_number,
        description: check.description,
        platform: check.platform,
        merchant_id: merchant.client_id,
        merchant_name: merchant.client_name,
        result,
      });

      await saveReport(supabase, runId, check, result, merchant.client_id, merchant.client_name);
      lastResult = result;
    }

    if (lastResult) {
      await updateCheckStatus(supabase, check, lastResult);
      await enqueueFixIfNeeded(supabase, check, lastResult);
    }
    return localDetails;
  }

  // Run in batches of CONCURRENCY
  const typedChecks = checks as ChinoCheck[];
  for (let i = 0; i < typedChecks.length; i += CONCURRENCY) {
    const batch = typedChecks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map((c) => processCheck(c)));
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        for (const d of result.value) {
          details.push(d);
          tallyResult(d.result);
        }
      } else {
        errors++;
        console.error(`[chino] Batch check error:`, result.reason);
      }
    }
  }

  const total = passed + failed + errors + skipped;
  const durationMs = Date.now() - patrolStart;

  console.log(`[chino] Patrol ${runId} complete: ${total} checks (${passed} pass, ${failed} fail, ${errors} error, ${skipped} skip) in ${durationMs}ms`);

  // ── Send critical alert if any critical checks failed ──
  const criticalFails = details.filter(
    (d) => d.result.result === 'fail' && (checks as ChinoCheck[]).find(
      (c) => c.check_number === d.check_number && c.severity === 'critical'
    )
  );

  if (criticalFails.length > 0) {
    sendCriticalAlert(
      criticalFails.map((d) => ({
        check_number: d.check_number,
        description: d.description,
        error_message: d.result.error_message,
      }))
    ).catch((err) => console.error('[chino] Critical alert failed:', err.message));
  }

  return {
    run_id: runId,
    total,
    passed,
    failed,
    errors,
    skipped,
    duration_ms: durationMs,
    details,
  };
}
