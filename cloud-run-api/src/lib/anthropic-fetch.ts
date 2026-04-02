/**
 * Anthropic API fetch wrapper with retry, backoff, and circuit breaker.
 * Inspired by meta-fetch.ts — protects critical-path AI calls
 * (Strategist, Conversationalist, client chat, prospect fallback).
 *
 * - Retries up to 2x on 429/529/500+ (NOT on 400/401/403)
 * - Backoff: 1s, 2s with random jitter
 * - Circuit breaker via circuit-breaker.ts (service: 'anthropic')
 * - Timeout: 25s default (AbortController)
 * - Never throws — returns { ok, data, status }
 */

import { canRequest, recordSuccess, recordFailure } from './circuit-breaker.js';

const CIRCUIT_SERVICE = 'anthropic';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const BACKOFF_BASE_MS = 1000; // 1s, 2s

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface AnthropicFetchResult {
  ok: boolean;
  data: any;
  status: number;
}

/**
 * Fetch from Anthropic Messages API with retry + backoff + circuit breaker.
 * Never throws — always returns { ok, data, status }.
 */
export async function anthropicFetch(
  body: object,
  apiKey: string,
  opts?: { maxRetries?: number; timeoutMs?: number },
): Promise<AnthropicFetchResult> {
  const maxRetries = opts?.maxRetries ?? MAX_RETRIES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Circuit breaker check
  if (!canRequest(CIRCUIT_SERVICE)) {
    console.warn('[anthropic-fetch] Circuit breaker OPEN — skipping request');
    return { ok: false, data: { error: 'Circuit breaker open' }, status: 503 };
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const isRateLimit = res.status === 429;
      const isOverloaded = res.status === 529;
      const isServerError = res.status >= 500 && res.status !== 529; // 529 handled separately

      if (isRateLimit || isOverloaded || isServerError) {
        recordFailure(CIRCUIT_SERVICE, `HTTP ${res.status}`, isRateLimit);

        if (attempt < maxRetries) {
          // Respect Retry-After header if present
          const retryAfter = res.headers.get('Retry-After');
          let waitMs: number;

          if (retryAfter) {
            const secs = parseInt(retryAfter, 10);
            waitMs = (isNaN(secs) ? BACKOFF_BASE_MS : secs * 1000) + Math.random() * 500;
          } else {
            // Backoff: 1s, 2s + jitter
            waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
          }

          console.warn(
            `[anthropic-fetch] HTTP ${res.status} — retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs)}ms`,
          );
          await sleep(waitMs);

          // Re-check circuit breaker before retry
          if (!canRequest(CIRCUIT_SERVICE)) {
            console.warn('[anthropic-fetch] Circuit breaker OPEN after retry wait');
            return { ok: false, data: { error: 'Circuit breaker open' }, status: 503 };
          }
          continue;
        }

        // Exhausted retries — return error
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, data: errData, status: res.status };
      }

      // Client errors (400/401/403) — do NOT retry
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { ok: false, data: errData, status: res.status };
      }

      // Success
      const data = await res.json();
      recordSuccess(CIRCUIT_SERVICE);
      return { ok: true, data, status: res.status };
    } catch (err: any) {
      clearTimeout(timeoutId);

      const isTimeout = err.name === 'AbortError';
      recordFailure(CIRCUIT_SERVICE, isTimeout ? 'timeout' : err.message, false);

      if (attempt < maxRetries && !isTimeout) {
        // Retry network errors (but not timeouts — they're slow by nature)
        const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(
          `[anthropic-fetch] Network error: ${err.message} — retry ${attempt + 1}/${maxRetries} in ${Math.round(waitMs)}ms`,
        );
        await sleep(waitMs);
        if (!canRequest(CIRCUIT_SERVICE)) {
          return { ok: false, data: { error: 'Circuit breaker open' }, status: 503 };
        }
        continue;
      }

      // Exhausted retries or timeout
      return {
        ok: false,
        data: { error: isTimeout ? 'Request timeout' : err.message },
        status: isTimeout ? 408 : 500,
      };
    }
  }

  // Should never reach here
  return { ok: false, data: { error: 'Exhausted all retries' }, status: 500 };
}
