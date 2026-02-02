import { useCallback } from 'react';
import { useAppBridge } from '@/providers/ShopifyAppBridgeProvider';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for making authenticated API calls with Shopify Session Tokens
 * 
 * CRITICAL FOR SHOPIFY EMBEDDED APP:
 * - When embedded: Uses X-Shopify-Session-Token header from App Bridge CDN
 * - When not embedded: Uses standard Supabase auth session
 * 
 * This ensures ALL backend calls comply with Shopify's Session Token requirements
 */
export function useShopifyAuthFetch() {
  const { isEmbedded, isInitialized, getSessionToken, shopify, createAuthHeaders } = useAppBridge();

  /**
   * Make an authenticated fetch request
   * Automatically includes Shopify Session Token when embedded
   */
  const authFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    let headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (isEmbedded && isInitialized && shopify) {
      // Get fresh Session Token from App Bridge CDN
      console.log('[AuthFetch] Embedded mode - getting Session Token...');
      const sessionToken = await getSessionToken();
      
      if (sessionToken) {
        console.log('[AuthFetch] ✓ Session Token obtained, adding to headers');
        headers = {
          ...headers,
          'X-Shopify-Session-Token': sessionToken,
        };
        
        // Also include shop/host for validation handshake
        if (shopify.config?.host) {
          (headers as Record<string, string>)['X-Shopify-Host'] = shopify.config.host;
        }
        if (shopify.config?.shop) {
          (headers as Record<string, string>)['X-Shopify-Shop'] = shopify.config.shop;
        }
      } else {
        console.warn('[AuthFetch] No Session Token available');
      }
    } else {
      // Not embedded - use Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers = {
          ...headers,
          'Authorization': `Bearer ${session.access_token}`,
        };
      }
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }, [isEmbedded, isInitialized, getSessionToken, shopify]);

  /**
   * Make an authenticated call to a Supabase Edge Function
   */
  const callEdgeFunction = useCallback(async <T = any>(
    functionName: string,
    options: {
      method?: string;
      body?: any;
    } = {}
  ): Promise<{ data: T | null; error: string | null }> => {
    const { method = 'POST', body } = options;
    
    try {
      const headers = await createAuthHeaders();
      
      const response = await fetch(
        `https://jnqivntlkemzcpomkvwv.supabase.co/functions/v1/${functionName}`,
        {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { 
          data: null, 
          error: errorData.error || errorData.message || `Error ${response.status}` 
        };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err: any) {
      console.error(`[AuthFetch] Error calling ${functionName}:`, err);
      return { data: null, error: err.message };
    }
  }, [createAuthHeaders]);

  /**
   * Execute a custom query function with error handling
   * For embedded apps, this provides consistent error handling
   */
  const executeQuery = useCallback(async <T = any>(
    queryFn: () => Promise<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: string | null }> => {
    try {
      // Execute the query function directly
      const result = await queryFn();
      
      if (result.error) {
        console.error('[AuthFetch] Query error:', result.error);
        return { data: null, error: result.error.message };
      }
      
      return { data: result.data, error: null };
    } catch (err: any) {
      console.error('[AuthFetch] Exception:', err);
      return { data: null, error: err.message };
    }
  }, []);

  return {
    authFetch,
    callEdgeFunction,
    executeQuery,
    isEmbedded,
    isInitialized,
  };
}

/**
 * Helper to create headers manually (for use outside React components)
 */
export async function createShopifyHeaders(shopify: any): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (shopify?.idToken) {
    try {
      const token = await shopify.idToken();
      if (token) {
        headers['X-Shopify-Session-Token'] = token;
      }
    } catch (err) {
      console.warn('[createShopifyHeaders] Failed to get token:', err);
    }
  }

  if (shopify?.config) {
    if (shopify.config.host) {
      headers['X-Shopify-Host'] = shopify.config.host;
    }
    if (shopify.config.shop) {
      headers['X-Shopify-Shop'] = shopify.config.shop;
    }
  }

  return headers;
}
