/**
 * Shared Meta Graph API fetch utility.
 * Uses Authorization: Bearer header instead of access_token query param
 * to prevent token leakage in server logs, proxy logs, and stack traces.
 * Protected by circuit breaker to avoid hammering Meta during rate limits.
 * Includes retry with exponential backoff and inter-request delays.
 */

import { canRequest, recordSuccess, recordFailure } from './circuit-breaker.js';

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const CIRCUIT_SERVICE = 'meta-graph-api';

/** Delay between consecutive Meta API requests (ms) — max ~300 req/min */
const META_INTER_REQUEST_DELAY_MS = 200;
/** Max retries on rate-limit / server errors */
const MAX_RETRIES = 3;
/** Base delay for exponential backoff (ms) */
const BACKOFF_BASE_MS = 2000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface MetaFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string>;
  body?: Record<string, any> | FormData;
  /** Override timeout in ms (default: 30000) */
  timeout?: number;
  /** Skip the inter-request delay (e.g. for the very first call) */
  skipDelay?: boolean;
}

/**
 * Fetch from Meta Graph API with token in Authorization header.
 * Includes inter-request delay, retry with exponential backoff,
 * and Retry-After header support.
 * @param path - API path (e.g., "/me/adaccounts" or full URL for pagination)
 * @param token - Decrypted access token
 * @param options - Fetch options
 */
export async function metaApiFetch(
  path: string,
  token: string,
  options: MetaFetchOptions = {}
): Promise<Response> {
  const { method = 'GET', params, body, timeout = 30000, skipDelay = false } = options;

  // Inter-request delay to avoid saturating Meta API
  if (!skipDelay) {
    await sleep(META_INTER_REQUEST_DELAY_MS);
  }

  // Support full URLs (for pagination cursors) or relative paths
  const url = path.startsWith('http')
    ? new URL(path)
    : new URL(`${META_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);

  // Add query params for GET requests
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const fetchOptions: RequestInit = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      // FormData — don't set Content-Type (browser/node sets boundary)
      // For FormData, Meta requires access_token in the form data itself
      body.append('access_token', token);
      fetchOptions.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }
  }

  // Circuit breaker check
  if (!canRequest(CIRCUIT_SERVICE)) {
    return new Response(
      JSON.stringify({ error: { message: 'Circuit breaker open — Meta API temporarily blocked', code: 'CIRCUIT_OPEN' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url.toString(), { ...fetchOptions, signal: controller.signal });
      clearTimeout(timeoutId);

      // Check for rate-limit or server errors
      const isRateLimit = res.status === 429;
      const isServerError = res.status >= 500;

      if (isRateLimit || isServerError) {
        // Check if it's a Meta rate-limit error code
        let isMetaRateLimit = isRateLimit;
        if (res.status === 403 || res.status === 400) {
          const cloned = res.clone();
          const errBody: any = await cloned.json().catch(() => ({}));
          const errCode = errBody?.error?.code;
          if (errCode === 4 || errCode === 80004 || errCode === 32) {
            isMetaRateLimit = true;
          }
        }

        recordFailure(CIRCUIT_SERVICE, `HTTP ${res.status}`, isRateLimit || isMetaRateLimit);

        // If we have retries left, wait and retry
        if (attempt < MAX_RETRIES) {
          // Read Retry-After header if present
          const retryAfter = res.headers.get('Retry-After');
          let waitMs: number;

          if (retryAfter) {
            const retrySeconds = parseInt(retryAfter, 10);
            waitMs = (isNaN(retrySeconds) ? BACKOFF_BASE_MS : retrySeconds * 1000) + Math.random() * 1000;
          } else {
            // Exponential backoff: 2s, 4s, 8s + jitter
            waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 1000;
          }

          console.warn(`[meta-fetch] HTTP ${res.status} on ${method} ${url.pathname} — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs)}ms`);
          await sleep(waitMs);

          // Re-check circuit breaker before retry
          if (!canRequest(CIRCUIT_SERVICE)) {
            return new Response(
              JSON.stringify({ error: { message: 'Circuit breaker open after retry — Meta API temporarily blocked', code: 'CIRCUIT_OPEN' } }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            );
          }
          continue;
        }

        // No retries left — return the error response
        return res;
      }

      // Check for rate-limit error codes in 403/400 responses
      if (res.status === 403) {
        const cloned = res.clone();
        const errBody: any = await cloned.json().catch(() => ({}));
        const errCode = errBody?.error?.code;
        if (errCode === 4 || errCode === 80004 || errCode === 32) {
          recordFailure(CIRCUIT_SERVICE, `Meta error code ${errCode}: ${errBody?.error?.message || ''}`, true);

          if (attempt < MAX_RETRIES) {
            const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 1000;
            console.warn(`[meta-fetch] Meta rate-limit code ${errCode} — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs)}ms`);
            await sleep(waitMs);
            if (!canRequest(CIRCUIT_SERVICE)) {
              return new Response(
                JSON.stringify({ error: { message: 'Circuit breaker open — Meta API temporarily blocked', code: 'CIRCUIT_OPEN' } }),
                { status: 503, headers: { 'Content-Type': 'application/json' } },
              );
            }
            continue;
          }
          return res;
        }
        // Non-rate-limit 403 (e.g. auth error) — don't retry
      }

      if (res.ok) {
        recordSuccess(CIRCUIT_SERVICE);
      }

      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        // Timeout — don't retry timeouts (they're slow by nature)
        throw err;
      }

      // Network errors trip the circuit
      recordFailure(CIRCUIT_SERVICE, err.message, false);

      if (attempt < MAX_RETRIES) {
        const waitMs = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`[meta-fetch] Network error: ${err.message} — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(waitMs)}ms`);
        await sleep(waitMs);
        if (!canRequest(CIRCUIT_SERVICE)) {
          throw new Error('Circuit breaker open after network error — Meta API temporarily blocked');
        }
        continue;
      }
      throw err;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('[meta-fetch] Exhausted all retries');
}

/**
 * Fetch JSON from Meta API with automatic error checking.
 */
export async function metaApiJson<T = any>(
  path: string,
  token: string,
  options: MetaFetchOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; error: any; status: number }> {
  try {
    const res = await metaApiFetch(path, token, options);
    const data: any = await res.json();

    if (!res.ok || data.error) {
      return { ok: false, error: data.error || data, status: res.status };
    }

    return { ok: true, data: data as T };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, error: { message: 'Request timeout' }, status: 408 };
    }
    console.error('[metaApiJson] ERROR:', err.message, err.stack);
    return { ok: false, error: { message: err.message }, status: 500 };
  }
}

/**
 * Paginate through all pages of a Meta API endpoint.
 * Includes inter-request delay between pages.
 */
export async function metaApiPaginateAll<T = any>(
  path: string,
  token: string,
  params?: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = null;

  // First request
  const res = await metaApiFetch(path, token, { params });
  if (!res.ok) return all;

  let data: any = await res.json();
  if (data.data) all.push(...data.data);

  nextUrl = data.paging?.next || null;

  // Follow pagination — re-add auth header (cursor URLs don't include token)
  while (nextUrl) {
    // Remove access_token from cursor URL if present (we use header instead)
    const cursorUrl = new URL(nextUrl);
    cursorUrl.searchParams.delete('access_token');

    // Delay between pages is handled inside metaApiFetch (META_INTER_REQUEST_DELAY_MS)
    const pageRes = await metaApiFetch(cursorUrl.toString(), token);
    if (!pageRes.ok) break;

    data = await pageRes.json() as any;
    if (data.data) all.push(...data.data);
    nextUrl = data.paging?.next || null;
  }

  return all;
}
