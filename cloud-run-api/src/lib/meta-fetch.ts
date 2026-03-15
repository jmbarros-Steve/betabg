/**
 * Shared Meta Graph API fetch utility.
 * Uses Authorization: Bearer header instead of access_token query param
 * to prevent token leakage in server logs, proxy logs, and stack traces.
 */

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

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

  try {
    return await fetch(url.toString(), fetchOptions);
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
    const data = await res.json();

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

  let data = await res.json();
  if (data.data) all.push(...data.data);

  nextUrl = data.paging?.next || null;

  // Follow pagination — re-add auth header (cursor URLs don't include token)
  while (nextUrl) {
    // Remove access_token from cursor URL if present (we use header instead)
    const cursorUrl = new URL(nextUrl);
    cursorUrl.searchParams.delete('access_token');

    const pageRes = await metaApiFetch(cursorUrl.toString(), token);
    if (!pageRes.ok) break;

    data = await pageRes.json();
    if (data.data) all.push(...data.data);
    nextUrl = data.paging?.next || null;
  }

  return all;
}
