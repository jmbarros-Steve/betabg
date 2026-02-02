import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useShopifyAppBridge } from './useShopifyAppBridge';

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
 * When running in Shopify Admin iframe with valid shop+host params,
 * this hook will:
 * 1. Get a fresh session token from Shopify App Bridge
 * 2. Validate the token with our backend
 * 3. Automatically sign in the user to Supabase
 * 4. Return authentication state for route guards
 */
export function useShopifyAutoLogin(shop: string | null, host: string | null): ShopifyAutoLoginResult {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const { shopify, isEmbedded, isInitialized, getSessionToken } = useShopifyAppBridge({ shop, host });

  const performAutoLogin = useCallback(async () => {
    // Only attempt auto-login if we're in embedded mode with proper params
    if (!isEmbedded || !isInitialized || !shop || !host) {
      console.log('[AutoLogin] Not in embedded mode or missing params, skipping');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get fresh session token from Shopify
      const sessionToken = await getSessionToken();
      
      if (!sessionToken) {
        console.error('[AutoLogin] Failed to get session token from Shopify');
        setError('No se pudo obtener el token de sesión de Shopify');
        setIsLoading(false);
        return;
      }

      console.log('[AutoLogin] Got session token, validating with backend...');

      // Validate token with our backend
      const response = await fetch(
        `https://jnqivntlkemzcpomkvwv.supabase.co/functions/v1/shopify-session-validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Session-Token': sessionToken,
            'X-Shopify-Host': host,
            'X-Shopify-Shop': shop,
          },
        }
      );

      const data: ValidationResponse = await response.json();

      if (!response.ok || !data.valid) {
        console.error('[AutoLogin] Token validation failed:', data.error);
        setError(data.error || 'Token de sesión inválido');
        setIsLoading(false);
        return;
      }

      console.log('[AutoLogin] Token validated, shop:', data.shopDomain);
      setShopDomain(data.shopDomain);
      setIsInstalled(data.installed);

      if (data.connection) {
        setConnectionId(data.connection.id);
      }

      if (data.client) {
        setClientId(data.client.id);
      }

      // If we got an auth token, use it to sign in
      if (data.authenticated && data.authToken && data.authEmail) {
        console.log('[AutoLogin] Signing in with magic link token...');
        
        // Verify OTP token
        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
          email: data.authEmail,
          token: data.authToken,
          type: 'magiclink',
        });

        if (authError) {
          console.error('[AutoLogin] Sign in failed:', authError);
          // Don't set error - user can still use the app, just not authenticated
          // They might need to complete registration
          setIsAuthenticated(false);
        } else if (authData.session) {
          console.log('[AutoLogin] Successfully signed in!');
          setIsAuthenticated(true);
        }
      } else {
        console.log('[AutoLogin] No auth token available, user needs to complete setup');
        setIsAuthenticated(false);
      }

      setIsLoading(false);

    } catch (err: any) {
      console.error('[AutoLogin] Error:', err);
      setError(err.message || 'Error de autenticación');
      setIsLoading(false);
    }
  }, [isEmbedded, isInitialized, shop, host, getSessionToken]);

  // Attempt auto-login when App Bridge is ready
  useEffect(() => {
    if (isEmbedded && isInitialized && shop && host) {
      performAutoLogin();
    } else if (!isEmbedded) {
      // Not embedded, skip auto-login
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
