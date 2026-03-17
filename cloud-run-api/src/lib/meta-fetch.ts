/**
 * Shared Meta Graph API fetch utility.
 * Uses Authorization: Bearer header instead of access_token query param
 * to prevent token leakage in server logs, proxy logs, and stack traces.
 * Protected by circuit breaker to avoid hammering Meta during rate limits.
 */

import { canRequest, recordSuccess, recordFailure } from './circuit-breaker.js';

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const CIRCUIT_SERVICE = 'meta-graph-api';

export interface MetaFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string>;
  body?: Record<string, any> | FormData;
  /** Override timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Fetch from Meta Graph API with token in Authorization header.
 * @param path - API path (e.g., "/me/adaccounts" or full URL for pagination)
 * @param token - Decrypted access token
 * @param options - Fetch options
 */
export async function metaApiFetch(
  path: string,
  token: string,
  options: MetaFetchOptions = {}
): Promise<Response> {
  const { method = 'GET', params, body, timeout = 30000 } = options;

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
      fetchOptions.body = JSON.stringify({ ...body, access_token: token });
    }
  }

  // Add timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  fetchOptions.signal = controller.signal;

  // Circuit breaker check
  if (!canRequest(CIRCUIT_SERVICE)) {
    clearTimeout(timeoutId);
    return new Response(
      JSON.stringify({ error: { message: 'Circuit breaker open — Meta API temporarily blocked', code: 'CIRCUIT_OPEN' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const res = await fetch(url.toString(), fetchOptions);

    // Rate limit (code 4, 80004) or server errors → record failure
    if (res.status === 429 || res.status >= 500) {
      recordFailure(CIRCUIT_SERVICE, `HTTP ${res.status}`);
    } else if (res.status === 403) {
      // Check if it's a rate limit (code 4) vs auth error
      const cloned = res.clone();
      const body: any = await cloned.json().catch(() => ({}));
      const errCode = body?.error?.code;
      if (errCode === 4 || errCode === 80004 || errCode === 32) {
        recordFailure(CIRCUIT_SERVICE, `Meta error code ${errCode}: ${body?.error?.message || ''}`);
      }
      // Auth errors (code 190 etc.) don't trip the circuit
    } else if (res.ok) {
      recordSuccess(CIRCUIT_SERVICE);
    }

    return res;
  } catch (err: any) {
    // Network errors trip the circuit
    if (err.name !== 'AbortError') {
      recordFailure(CIRCUIT_SERVICE, err.message);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
    return { ok: false, error: { message: err.message }, status: 500 };
  }
}

/**
 * Paginate through all pages of a Meta API endpoint.
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

    const pageRes = await metaApiFetch(cursorUrl.toString(), token);
    if (!pageRes.ok) break;

    data = await pageRes.json() as any;
    if (data.data) all.push(...data.data);
    nextUrl = data.paging?.next || null;
  }

  return all;
}
