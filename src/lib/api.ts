import { supabase } from '@/integrations/supabase/client';

const API_URL = import.meta.env.VITE_API_URL as string;

interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
}

/**
 * Unified API call function.
 * All backend calls go through Google Cloud Run.
 */
export async function callApi<T = any>(
  functionName: string,
  options: { method?: string; body?: any } = {}
): Promise<ApiResponse<T>> {
  const { method = 'POST', body } = options;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${API_URL}/api/${functionName}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Include details from backend if available (e.g. Meta API error messages)
      const errorMsg = errorData.error || `Error ${response.status}`;
      const details = errorData.details ? `: ${errorData.details}` : '';
      return {
        data: null,
        error: `${errorMsg}${details}`,
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err: any) {
    // Network or unexpected error — surface message to caller
    return { data: null, error: err.message };
  }
}
