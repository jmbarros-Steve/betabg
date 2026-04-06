// El Chino — Auto-Fixer
// Classifies checks as auto/manual and executes auto-fixes without Claude.
// Auto-fixable: token refreshes, stale data syncs, data quality syncs.
// Everything else → manual (requires JM approval).

import { getSupabaseAdmin } from '../lib/supabase.js';
import { handleTokenExpired } from '../lib/meta-token-refresh.js';
import type { ChinoCheck, CheckResult } from './types.js';

const AUTO_TOKEN_PLATFORMS = new Set(['meta', 'shopify']);
const MANUAL_CHECK_TYPES = new Set(['visual', 'security', 'functional']);
const MANUAL_SEVERITIES = new Set(['critical', 'high']);

// ─── Classify a failed check as auto or manual ──────────────────

export function classifyFix(
  check: ChinoCheck,
  result: CheckResult
): 'auto' | 'manual' {
  // Hard manual: dangerous check types
  if (MANUAL_CHECK_TYPES.has(check.check_type)) return 'manual';

  // Hard manual: high severity
  if (MANUAL_SEVERITIES.has(check.severity)) return 'manual';

  // Hard manual: repeated failures (something deeper is wrong)
  if (check.consecutive_fails >= 3) return 'manual';

  // Auto: token health for supported platforms
  if (check.check_type === 'token_health' && AUTO_TOKEN_PLATFORMS.has(check.platform)) {
    return 'auto';
  }

  // Auto: stale data / sync issues
  if (check.check_type === 'api_compare') {
    const err = (result.error_message || '').toLowerCase();
    if (err.includes('stale') || err.includes('sync') || err.includes('desactualiz')) {
      return 'auto';
    }
  }

  // Auto: data quality sync errors
  if (check.check_type === 'data_quality') {
    const err = (result.error_message || '').toLowerCase();
    if (err.includes('sync') || err.includes('desactualiz') || err.includes('stale')) {
      return 'auto';
    }
  }

  // Default: manual (safe)
  return 'manual';
}

// ─── Execute an auto-fix (no Claude, no cost) ───────────────────

export async function executeAutoFix(
  check: ChinoCheck,
  result: CheckResult
): Promise<{ success: boolean; action: string }> {
  const supabase = getSupabaseAdmin();

  try {
    // Token refresh
    if (check.check_type === 'token_health' && check.platform === 'meta') {
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('platform', 'meta')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (conn) {
        const newToken = await handleTokenExpired(conn.id);
        if (newToken) {
          return { success: true, action: 'Meta token refreshed via long-lived exchange' };
        }
        return { success: false, action: 'Meta token refresh failed (token may be fully expired)' };
      }
      return { success: false, action: 'No active Meta connection found for token refresh' };
    }

    // Trigger sync-all-metrics for stale data
    if (check.check_type === 'api_compare' || check.check_type === 'data_quality') {
      const baseUrl = process.env.CLOUD_RUN_URL || 'https://steve-api-850416724643.us-central1.run.app';
      const cronSecret = process.env.CRON_SECRET || 'steve-cron-secret-2024';

      const res = await fetch(`${baseUrl}/api/cron/sync-all-metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': cronSecret,
        },
      });

      if (res.ok) {
        return { success: true, action: `Triggered sync-all-metrics (status ${res.status})` };
      }
      return { success: false, action: `sync-all-metrics failed with status ${res.status}` };
    }

    return { success: false, action: `No auto-fix handler for ${check.check_type}/${check.platform}` };
  } catch (err: any) {
    console.error(`[chino/auto-fixer] Error executing auto-fix for check #${check.check_number}:`, err.message);
    return { success: false, action: `Auto-fix error: ${err.message}` };
  }
}
