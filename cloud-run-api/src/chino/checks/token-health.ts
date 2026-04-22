// El Chino — token_health executor
// Checks 4-5, 59, 86-88: verify tokens are valid and not expired

import type { SupabaseClient } from '@supabase/supabase-js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';
import type { ChinoCheck, MerchantConn, CheckResult } from '../types.js';

const FETCH_TIMEOUT = 30_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Infra token checks (no merchant/platform token needed) ─────

async function checkAnthropicKey(start: number): Promise<CheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { result: 'fail', error_message: 'ANTHROPIC_API_KEY not set', duration_ms: Date.now() - start };
  }
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  }, 15_000);

  if (res.status === 401 || res.status === 403) {
    return { result: 'fail', error_message: `Anthropic API key invalid (${res.status})`, duration_ms: Date.now() - start };
  }
  if (res.status === 429) {
    return { result: 'pass', steve_value: 'Rate limited but key valid', duration_ms: Date.now() - start };
  }
  if (res.ok || res.status < 500) {
    return { result: 'pass', steve_value: 'Anthropic API key válida', duration_ms: Date.now() - start };
  }
  return { result: 'error', error_message: `Anthropic API returned ${res.status}`, duration_ms: Date.now() - start };
}

async function checkTwilioCredentials(start: number): Promise<CheckResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return { result: 'fail', error_message: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set', duration_ms: Date.now() - start };
  }
  const res = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { 'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
  }, 15_000);

  if (res.status === 401) {
    return { result: 'fail', error_message: 'Twilio credentials inválidas (401)', duration_ms: Date.now() - start };
  }
  if (res.ok) {
    return { result: 'pass', steve_value: 'Twilio credentials válidas', duration_ms: Date.now() - start };
  }
  return { result: 'error', error_message: `Twilio API returned ${res.status}`, duration_ms: Date.now() - start };
}

async function checkResendKey(start: number): Promise<CheckResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { result: 'fail', error_message: 'RESEND_API_KEY not set', duration_ms: Date.now() - start };
  }
  const res = await fetchWithTimeout('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  }, 15_000);

  if (res.status === 401 || res.status === 403) {
    return { result: 'fail', error_message: `Resend API key inválida (${res.status})`, duration_ms: Date.now() - start };
  }
  if (res.ok) {
    return { result: 'pass', steve_value: 'Resend API key válida', duration_ms: Date.now() - start };
  }
  return { result: 'error', error_message: `Resend API returned ${res.status}`, duration_ms: Date.now() - start };
}

export async function executeTokenHealth(
  supabase: SupabaseClient,
  check: ChinoCheck,
  merchant: MerchantConn | null,
  decryptedToken: string | null
): Promise<CheckResult> {
  const start = Date.now();

  try {
    // ── Infra token checks (no merchant token needed) ──
    if (check.check_number === 86) return await checkAnthropicKey(start);
    if (check.check_number === 87) return await checkTwilioCredentials(start);
    if (check.check_number === 88) return await checkResendKey(start);

    // ── Klaviyo API key check ──
    if (check.check_number === 59) {
      if (!decryptedToken) {
        return { result: 'fail', error_message: 'No hay API key de Klaviyo', duration_ms: Date.now() - start };
      }
      const res = await fetchWithTimeout('https://a.klaviyo.com/api/accounts/', {
        headers: {
          'Authorization': `Klaviyo-API-Key ${decryptedToken}`,
          'revision': '2024-10-15',
          'accept': 'application/json',
        },
      }, 15_000);
      if (res.ok) {
        return { result: 'pass', steve_value: 'Klaviyo API key válida', duration_ms: Date.now() - start };
      }
      return {
        result: 'fail',
        error_message: `Klaviyo API key check returned ${res.status}`,
        duration_ms: Date.now() - start,
      };
    }

    if (!decryptedToken) {
      return {
        result: 'fail',
        error_message: 'No hay token',
        duration_ms: Date.now() - start,
      };
    }

    if (check.check_number === 4) {
      // Shopify: token doesn't expire, just verify it responds 200
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(
          `https://${merchant?.store_url}/admin/api/2025-01/shop.json`,
          {
            headers: { 'X-Shopify-Access-Token': decryptedToken },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (res.ok) {
          return { result: 'pass', duration_ms: Date.now() - start };
        }
        return {
          result: 'fail',
          error_message: `Shopify token check returned ${res.status}`,
          duration_ms: Date.now() - start,
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    if (check.check_number === 5) {
      // Meta: verify token works + check age
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(
          'https://graph.facebook.com/v23.0/me?fields=id,name',
          {
            headers: { Authorization: `Bearer ${decryptedToken}` },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (!res.ok) {
          return {
            result: 'fail',
            error_message: `Meta token check returned ${res.status}`,
            duration_ms: Date.now() - start,
          };
        }

        // Check token age if max_age_days is configured
        const maxAgeDays = check.check_config?.max_age_days as number | undefined;
        if (maxAgeDays && merchant?.connection_id) {
          const conn = await safeQuerySingleOrDefault<{ updated_at: string }>(
            supabase
              .from('platform_connections')
              .select('updated_at')
              .eq('id', merchant!.connection_id)
              .single(),
            null,
            'tokenHealth.fetchConnectionUpdatedAt',
          );

          if (conn?.updated_at) {
            const ageDays = (Date.now() - new Date(conn.updated_at).getTime()) / 86400_000;
            if (ageDays > maxAgeDays) {
              return {
                result: 'fail',
                steve_value: `${ageDays.toFixed(1)} days`,
                real_value: `max ${maxAgeDays} days`,
                error_message: `Token tiene ${ageDays.toFixed(1)} días (máximo: ${maxAgeDays})`,
                duration_ms: Date.now() - start,
              };
            }
          }
        }

        return { result: 'pass', duration_ms: Date.now() - start };
      } finally {
        clearTimeout(timeout);
      }
    }

    return {
      result: 'skip',
      error_message: `token_health not implemented for check #${check.check_number}`,
      duration_ms: Date.now() - start,
    };
  } catch (err: any) {
    return {
      result: 'error',
      error_message: err.name === 'AbortError' ? 'Timeout (30s)' : err.message,
      duration_ms: Date.now() - start,
    };
  }
}
