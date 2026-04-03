// El Chino — Fixer Loop
// Processes the fix queue: re-tests deployed fixes, retries or escalates.
// Called via POST /api/chino/fixer (cron every 5-10 minutes)

import { getSupabaseAdmin } from '../lib/supabase.js';
import { decryptPlatformToken } from '../lib/decrypt-token.js';
import { generateFixPrompt } from './fix-generator.js';
import { sendEscalationWhatsApp } from './whatsapp.js';
import { executeApiCompare } from './checks/api-compare.js';
import { executeTokenHealth } from './checks/token-health.js';
import { executePerformance } from './checks/performance.js';
import { executeVisual } from './checks/visual.js';
import { executeFunctional } from './checks/functional.js';
import { executeDataQuality } from './checks/data-quality.js';
import { executeSecurity } from './checks/security.js';
import type { ChinoCheck, MerchantConn, CheckResult } from './types.js';

export interface FixerResult {
  verified: number;
  fixed: number;
  retried: number;
  escalated: number;
  assigned: number;
}

// ─── Re-execute a single check (for re-testing after fix) ────────

async function reExecuteCheck(
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
        return { result: 'skip', error_message: `Unknown check_type: ${check.check_type}`, duration_ms: 0 };
    }
  } catch (err: any) {
    return { result: 'error', error_message: err.message, duration_ms: Date.now() - start };
  }
}

// ─── Get merchant + token for a check ────────────────────────────

async function getMerchantForCheck(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  check: ChinoCheck
): Promise<{ merchant: MerchantConn | null; token: string | null }> {
  if (['performance'].includes(check.check_type) || check.platform === 'infra') {
    return { merchant: null, token: null };
  }

  // Get first active connection for this platform
  let query = supabase
    .from('platform_connections')
    .select('id, client_id, platform, access_token_encrypted, api_key_encrypted, store_url, account_id, clients!inner(name)')
    .eq('is_active', true)
    .limit(1);

  if (check.platform !== 'all') {
    query = query.eq('platform', check.platform);
  }

  const { data } = await query.maybeSingle();
  if (!data) return { merchant: null, token: null };

  const merchant: MerchantConn = {
    connection_id: data.id,
    client_id: data.client_id,
    client_name: (data.clients as any)?.name || 'Unknown',
    platform: data.platform,
    access_token_encrypted: data.access_token_encrypted,
    api_key_encrypted: data.api_key_encrypted,
    store_url: data.store_url,
    account_id: data.account_id,
  };

  const encrypted = merchant.platform === 'klaviyo'
    ? merchant.api_key_encrypted
    : merchant.access_token_encrypted;
  const token = await decryptPlatformToken(supabase, encrypted).catch(() => null);

  return { merchant, token };
}

// ─── Main fixer loop ─────────────────────────────────────────────

export async function runChinoFixer(): Promise<FixerResult> {
  const supabase = getSupabaseAdmin();
  const result: FixerResult = { verified: 0, fixed: 0, retried: 0, escalated: 0, assigned: 0 };

  console.log('[chino/fixer] Starting fix verification loop');

  // ── STEP A: Re-test deployed fixes (deployed > 5 minutes ago) ──
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();

  const { data: deployedFixes } = await supabase
    .from('steve_fix_queue')
    .select('*')
    .eq('status', 'deployed')
    .lt('deploy_timestamp', fiveMinAgo)
    .order('created_at', { ascending: true })
    .limit(10); // Process max 10 per run

  for (const fix of deployedFixes || []) {
    result.verified++;

    // Mark as verifying
    await supabase
      .from('steve_fix_queue')
      .update({ status: 'verifying' })
      .eq('id', fix.id);

    // Get the check definition
    const { data: check } = await supabase
      .from('chino_routine')
      .select('*')
      .eq('id', fix.check_id)
      .maybeSingle();

    if (!check) {
      await supabase
        .from('steve_fix_queue')
        .update({ status: 'failed', retest_result: 'error: check not found' })
        .eq('id', fix.id);
      continue;
    }

    // Get merchant context
    const { merchant, token } = await getMerchantForCheck(supabase, check as ChinoCheck);

    // Re-test
    const testResult = await reExecuteCheck(supabase, check as ChinoCheck, merchant, token);

    if (testResult.result === 'pass') {
      // ── FIX WORKED ──
      result.fixed++;
      console.log(`[chino/fixer] Fix #${fix.check_number} PASSED re-test`);

      await supabase
        .from('steve_fix_queue')
        .update({ status: 'fixed', retest_result: 'pass' })
        .eq('id', fix.id);

      await supabase
        .from('chino_routine')
        .update({ consecutive_fails: 0, last_result: 'pass', last_checked_at: new Date().toISOString() })
        .eq('id', fix.check_id);

    } else if (fix.attempt < 2) {
      // ── FIRST ATTEMPT FAILED → generate retry with more context ──
      result.retried++;
      console.log(`[chino/fixer] Fix #${fix.check_number} FAILED re-test, generating retry prompt`);

      const retryFix = await generateFixPrompt({
        check_number: fix.check_number,
        description: check.description,
        check_type: check.check_type,
        platform: check.platform,
        severity: check.severity,
        steve_value: testResult.steve_value != null ? String(testResult.steve_value) : null,
        real_value: testResult.real_value != null ? String(testResult.real_value) : null,
        error_message: testResult.error_message || null,
        screenshot_url: testResult.screenshot_url || null,
        previous_fix_prompt: fix.fix_prompt,
      });

      await supabase
        .from('steve_fix_queue')
        .update({
          status: 'pending',
          attempt: 2,
          fix_prompt: retryFix.fix_prompt,
          probable_cause: retryFix.probable_cause,
          files_to_check: retryFix.files_to_check,
          retest_result: 'fail',
          agent_response: null,
          deploy_timestamp: null,
        })
        .eq('id', fix.id);

    } else {
      // ── SECOND ATTEMPT FAILED → ESCALATE TO JM ──
      result.escalated++;
      console.log(`[chino/fixer] Fix #${fix.check_number} ESCALATED after 2 failed attempts`);

      await supabase
        .from('steve_fix_queue')
        .update({
          status: 'escalated',
          escalated: true,
          retest_result: 'fail',
        })
        .eq('id', fix.id);

      // Enrich fix with check data for WhatsApp
      const enrichedFix = {
        ...fix,
        chino_routine: check,
      };
      await sendEscalationWhatsApp(enrichedFix);
    }
  }

  // ── STEP B: Assign pending fixes to agents ──
  const { data: pendingFixes } = await supabase
    .from('steve_fix_queue')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  for (const fix of pendingFixes || []) {
    await supabase
      .from('steve_fix_queue')
      .update({ status: 'assigned' })
      .eq('id', fix.id);
    result.assigned++;
  }

  console.log(`[chino/fixer] Done: ${result.verified} verified, ${result.fixed} fixed, ${result.retried} retried, ${result.escalated} escalated, ${result.assigned} assigned`);

  return result;
}
