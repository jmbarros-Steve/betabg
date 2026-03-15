import { isTokenExpiredError, handleTokenExpired } from './meta-token-refresh.js';

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string>;
  body?: Record<string, any> | FormData;
  timeout?: number;
}

export async function metaApiFetch(
  path: string, token: string, options: MetaFetchOptions = {}
): Promise<Response> {
  const { method = 'GET', params, body, timeout = 30000 } = options;

  const url = path.startsWith('http')
    ? new URL(path)
    : new URL(`${META_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const fetchOptions: RequestInit = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      body.append('access_token', token);
      fetchOptions.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify({ ...body, access_token: token });
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  fetchOptions.signal = controller.signal;

  try {
    return await fetch(url.toString(), fetchOptions);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function metaApiJson<T = any>(
  path: string, token: string, options: MetaFetchOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; error: any; status: number }> {
  try {
    const res = await metaApiFetch(path, token, options);
    const data = await res.json();
    if (!res.ok || data.error) return { ok: false, error: data.error || data, status: res.status };
    return { ok: true, data: data as T };
  } catch (err: any) {
    if (err.name === 'AbortError') return { ok: false, error: { message: 'Request timeout' }, status: 408 };
    return { ok: false, error: { message: err.message }, status: 500 };
  }
}

export async function metaApiJsonWithRefresh<T = any>(
  path: string, token: string, connectionId: string, options: MetaFetchOptions = {}
): Promise<{ ok: true; data: T; token: string } | { ok: false; error: any; status: number; tokenExpired?: boolean }> {
  const result = await metaApiJson<T>(path, token, options);

  if (!result.ok && isTokenExpiredError(result.error)) {
    console.log(`[meta-fetch] Token expired for ${connectionId}, attempting refresh...`);
    const newToken = await handleTokenExpired(connectionId);
    if (newToken) {
      const retryResult = await metaApiJson<T>(path, newToken, options);
      if (retryResult.ok) return { ...retryResult, token: newToken };
      return { ...retryResult, tokenExpired: true };
    }
    return { ...result, tokenExpired: true };
  }

  if (result.ok) return { ...result, token };
  return result;
}

export async function metaApiPaginateAll<T = any>(
  path: string, token: string, params?: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];
  const res = await metaApiFetch(path, token, { params });
  if (!res.ok) return all;

  let data = await res.json();
  if (data.data) all.push(...data.data);
  let nextUrl: string | null = data.paging?.next || null;

  while (nextUrl) {
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
