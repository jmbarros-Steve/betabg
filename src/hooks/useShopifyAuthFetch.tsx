import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Hook for making authenticated API calls to Edge Functions.
 * Standalone mode: always uses Supabase auth session.
 */
export function useShopifyAuthFetch() {
  const authFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const { data: { session } } = await supabase.auth.getSession();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    return fetch(url, { ...options, headers });
  }, []);

  const callEdgeFunction = useCallback(async <T = any>(
    functionName: string,
    options: { method?: string; body?: any } = {}
  ): Promise<{ data: T | null; error: string | null }> => {
    const { method = 'POST', body } = options;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { data: null, error: errorData.error || errorData.message || `Error ${response.status}` };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err: any) {
      console.error(`[AuthFetch] Error calling ${functionName}:`, err);
      return { data: null, error: err.message };
    }
  }, []);

  const executeQuery = useCallback(async <T = any>(
    queryFn: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: string | null }> => {
    try {
      const result = await queryFn();
      if (result.error) {
        return { data: null, error: result.error.message };
      }
      return { data: result.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  }, []);

  return {
    authFetch,
    callEdgeFunction,
    executeQuery,
    isEmbedded: false,
    isInitialized: true,
  };
}
