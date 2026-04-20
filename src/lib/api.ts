import { supabase } from '@/integrations/supabase/client';

// .trim() defends against env vars with trailing whitespace/newlines (Vercel quirk)
const API_URL = ((import.meta.env.VITE_API_URL as string) || '').trim();

interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  warnings?: string[];
  rate_limited?: boolean;
  retry_after_seconds?: number | null;
}

/**
 * Unified API call function.
 * All backend calls go through Google Cloud Run.
 */
export async function callApi<T = any>(
  functionName: string,
  options: { method?: string; body?: any; timeoutMs?: number } = {}
): Promise<ApiResponse<T>> {
  const { method = 'POST', body, timeoutMs } = options;

  try {
    // getSession() returns cached token that may be expired.
    // If expired, force a refresh before using it.
    let {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      // Refresh if token expires within 60 seconds
      if (session.expires_at - now < 60) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          session = refreshed.session;
        } else {
          console.warn('[callApi] Preemptive token refresh failed — continuing with existing token', refreshError?.message);
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 90000);

    const response = await fetch(`${API_URL}/api/${functionName}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // On 401, try refreshing session once and retry
    if (response.status === 401 && session?.access_token) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('[callApi] Token refresh on 401 failed — user may need to re-login', refreshError.message);
      }
      if (refreshed?.session?.access_token) {
        headers['Authorization'] = `Bearer ${refreshed.session.access_token}`;
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), 90000);
        const retryResponse = await fetch(`${API_URL}/api/${functionName}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: retryController.signal,
        });
        clearTimeout(retryTimeout);
        if (retryResponse.ok) {
          const data = await retryResponse.json();
          return { data, error: null };
        }
        const retryError = await retryResponse.json().catch(() => ({}));
        return { data: null, error: retryError.error || `Error ${retryResponse.status}` };
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Include details from backend if available (e.g. Meta API error messages)
      const errorMsg = errorData.error || `Error ${response.status}`;
      const details = errorData.details ? `: ${errorData.details}` : '';
      return {
        data: null,
        error: `${errorMsg}${details}`,
        rate_limited: errorData.rate_limited || response.status === 429,
        retry_after_seconds: errorData.retry_after_seconds ?? null,
      };
    }

    const data = await response.json();
    return {
      data,
      error: null,
      warnings: Array.isArray(data?.warnings) ? data.warnings : undefined,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { data: null, error: 'La solicitud tardó demasiado. Inténtalo de nuevo.' };
    }
    // Network or unexpected error — surface message to caller
    return { data: null, error: err.message };
  }
}
