import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppBridge } from '@/providers/ShopifyAppBridgeProvider';

interface ShopifyAutoLoginResult {
  isLoading: boolean;
  isAuthenticated: boolean;
  isInstalled: boolean;
  error: string | null;
  shopDomain: string | null;
  clientId: string | null;
  connectionId: string | null;
  retryLogin: () => Promise<void>;
}

interface ValidationResponse {
  valid: boolean;
  shopDomain: string;
  installed: boolean;
  authenticated?: boolean;
  authToken?: string;
  authTokenType?: string;
  authEmail?: string;
  error?: string;
  message?: string;
  connection?: {
    id: string;
    storeName: string;
    isActive: boolean;
  };
  client?: {
    id: string;
    name: string;
    email: string;
    userId?: string;
  };
}

/**
 * Hook for automatic Shopify embedded app authentication
 * 
 * CRITICAL FOR SHOPIFY CHECKS:
 * - Uses Session Token from App Bridge CDN (not custom implementation)
 * - Sends token in X-Shopify-Session-Token header
 * - Validates via shopify-session-validate Edge Function
 * - Silent Supabase login via magic link OTP
 */
export function useShopifyAutoLogin(shop: string | null, host: string | null): ShopifyAutoLoginResult {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Use the global App Bridge Provider
  const { isEmbedded, isInitialized, getSessionToken, createAuthHeaders } = useAppBridge();

  const performAutoLogin = useCallback(async () => {
    if (!isEmbedded || !isInitialized || !shop || !host) {
      console.log('[AutoLogin] Not in embedded mode or missing params, skipping');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get fresh session token from Shopify App Bridge CDN
      const sessionToken = await getSessionToken();
      
      if (!sessionToken) {
        console.error('[AutoLogin] Failed to get session token from App Bridge CDN');
        setError('No se pudo obtener el token de sesión de Shopify');
        setIsLoading(false);
        return;
      }

      console.log('[AutoLogin] ✓ Session token obtained from CDN');
      console.log('[AutoLogin] Validating with backend...');

      // Use createAuthHeaders to get properly formatted headers
      const headers = await createAuthHeaders();

      // Validate token with our backend
      const response = await fetch(
        `https://jnqivntlkemzcpomkvwv.supabase.co/functions/v1/shopify-session-validate`,
        {
          method: 'POST',
          headers,
        }
      );

      const data: ValidationResponse = await response.json();

      if (!response.ok || !data.valid) {
        console.error('[AutoLogin] Token validation failed:', data.error);
        setError(data.error || 'Token de sesión inválido');
        setIsLoading(false);
        return;
      }

      console.log('[AutoLogin] ✓ Token validated, shop:', data.shopDomain);
      setShopDomain(data.shopDomain);
      setIsInstalled(data.installed);

      if (data.connection) {
        setConnectionId(data.connection.id);
      }

      if (data.client) {
        setClientId(data.client.id);
      }

      // If we got an auth token, use it to sign in silently
      if (data.authenticated && data.authToken && data.authEmail) {
        console.log('[AutoLogin] Signing in with magic link token...');
        
        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
          email: data.authEmail,
          token: data.authToken,
          type: 'magiclink',
        });

        if (authError) {
          console.error('[AutoLogin] Sign in failed:', authError);
          setIsAuthenticated(false);
        } else if (authData.session) {
          console.log('[AutoLogin] ✓ Successfully signed in!');
          setIsAuthenticated(true);
        }
      } else {
        console.log('[AutoLogin] No auth token, user needs setup');
        setIsAuthenticated(false);
      }

      setIsLoading(false);

    } catch (err: any) {
      console.error('[AutoLogin] Error:', err);
      setError(err.message || 'Error de autenticación');
      setIsLoading(false);
    }
  }, [isEmbedded, isInitialized, shop, host, getSessionToken, createAuthHeaders]);

  // Attempt auto-login when App Bridge is ready
  useEffect(() => {
    if (isEmbedded && isInitialized && shop && host) {
      performAutoLogin();
    } else if (!isEmbedded) {
      setIsLoading(false);
    }
  }, [isEmbedded, isInitialized, shop, host, performAutoLogin]);

  return {
    isLoading,
    isAuthenticated,
    isInstalled,
    error,
    shopDomain,
    clientId,
    connectionId,
    retryLogin: performAutoLogin,
  };
}
