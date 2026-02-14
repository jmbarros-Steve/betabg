import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppBridge } from '@/providers/ShopifyAppBridgeProvider';

interface ShopifyAutoLoginResult {
  isLoading: boolean;
  isAuthenticated: boolean;
  isInstalled: boolean;
  error: string | null;
  errorCode: string | null;
  requiresOAuth: boolean;
  shopDomain: string | null;
  clientId: string | null;
  connectionId: string | null;
  retryLogin: () => Promise<void>;
  redirectToOAuth: () => void;
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
  errorCode?: string;
  requiresOAuth?: boolean;
  installUrl?: string;
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

const SUPABASE_URL = 'https://jnqivntlkemzcpomkvwv.supabase.co';

/**
 * Hook for automatic Shopify embedded app authentication
 * 
 * CRITICAL FOR SHOPIFY CHECKS:
 * - Uses Session Token from App Bridge CDN
 * - Sends token in X-Shopify-Session-Token header
 * - Validates via shopify-session-validate Edge Function
 * - Handles OAuth redirect if token validation fails
 */
export function useShopifyAutoLogin(shop: string | null, host: string | null): ShopifyAutoLoginResult {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [requiresOAuth, setRequiresOAuth] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  
  const retryCount = useRef(0);
  const maxRetries = 3;

  // Use the global App Bridge Provider
  const { isEmbedded, isInitialized, getSessionToken, createAuthHeaders, shopify } = useAppBridge();

  /**
   * Redirect to Shopify OAuth flow
   * Used when session token validation fails
   */
  const redirectToOAuth = useCallback(() => {
    if (!shop) {
      console.error('[AutoLogin] Cannot redirect to OAuth: no shop');
      return;
    }

    const installUrl = `${SUPABASE_URL}/functions/v1/shopify-install?shop=${encodeURIComponent(shop)}`;
    console.log('[AutoLogin] Redirecting to OAuth:', installUrl);

    // Use top-level navigation to break out of iframe
    if (isEmbedded && window.top) {
      try {
        window.top.location.href = installUrl;
        return;
      } catch {
        // Cross-origin blocked, fall through to window.open
      }
    }
    
    window.location.href = installUrl;
  }, [shop, isEmbedded]);

  const performAutoLogin = useCallback(async () => {
    // CRITICAL: Only require shop + embedded mode for auto-login
    // host is needed for App Bridge UI but NOT for session token authentication
    // The session token itself contains the shop identity
    if (!isEmbedded || !shop) {
      console.log('[AutoLogin] Not in embedded mode or missing shop, skipping');
      setIsLoading(false);
      return;
    }

    // Wait for App Bridge to be initialized OR for getSessionToken to be available
    if (!isInitialized && !shopify) {
      console.log('[AutoLogin] Waiting for App Bridge initialization...');
      return; // Will retry when isInitialized changes
    }

    setIsLoading(true);
    setError(null);
    setErrorCode(null);
    setRequiresOAuth(false);

    try {
      // Get fresh session token from Shopify App Bridge CDN
      console.log('[AutoLogin] Getting session token from App Bridge...');
      const sessionToken = await getSessionToken();
      
      if (!sessionToken) {
        console.error('[AutoLogin] Failed to get session token from App Bridge CDN');
        
        // Retry getting token a few times before giving up
        if (retryCount.current < maxRetries) {
          retryCount.current++;
          console.log(`[AutoLogin] Retrying... (${retryCount.current}/${maxRetries})`);
          setTimeout(performAutoLogin, 1000 * retryCount.current);
          return;
        }
        
        setError('No se pudo obtener el token de sesión de Shopify');
        setErrorCode('NO_TOKEN');
        setRequiresOAuth(true);
        setIsLoading(false);
        return;
      }

      console.log('[AutoLogin] ✓ Session token obtained from CDN');
      console.log('[AutoLogin] Token preview:', sessionToken.substring(0, 50) + '...');
      console.log('[AutoLogin] Validating with backend...');

      // Use createAuthHeaders to get properly formatted headers
      const headers = await createAuthHeaders();

      // Validate token with our backend
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/shopify-session-validate`,
        {
          method: 'POST',
          headers,
        }
      );

      const data: ValidationResponse = await response.json();

      console.log('[AutoLogin] Backend response:', {
        status: response.status,
        valid: data.valid,
        authenticated: data.authenticated,
        installed: data.installed,
        error: data.error,
        errorCode: data.errorCode,
      });

      // Handle validation failure
      if (!response.ok || !data.valid) {
        console.error('[AutoLogin] Token validation failed:', data.error, data.errorCode);
        
        setError(data.error || data.message || 'Token de sesión inválido');
        setErrorCode(data.errorCode || 'VALIDATION_FAILED');
        setRequiresOAuth(data.requiresOAuth || false);
        setIsLoading(false);
        
        // Auto-redirect to OAuth if required
        if (data.requiresOAuth && data.installUrl) {
          console.log('[AutoLogin] Auto-redirecting to OAuth...');
          setTimeout(() => {
            if (window.top) {
              try {
                window.top.location.href = data.installUrl!;
              } catch {
                window.location.href = data.installUrl!;
              }
            }
          }, 2000);
        }
        return;
      }

      console.log('[AutoLogin] ✓ Token validated, shop:', data.shopDomain);
      console.log('[AutoLogin] Backend response details:', {
        installed: data.installed,
        authenticated: data.authenticated,
        hasAuthToken: !!data.authToken,
        hasAuthEmail: !!data.authEmail,
        clientId: data.client?.id,
        connectionId: data.connection?.id,
      });
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
        console.log('[AutoLogin] Signing in with magic link token for:', data.authEmail);
        
        const { data: authData, error: authError } = await supabase.auth.verifyOtp({
          email: data.authEmail,
          token: data.authToken,
          type: 'magiclink',
        });

        if (authError) {
          console.error('[AutoLogin] ❌ Sign in failed:', authError.message);
          setIsAuthenticated(false);
          setError('Error al iniciar sesión: ' + authError.message);
        } else if (authData.session) {
          console.log('[AutoLogin] ✓ Successfully signed in! Session user:', authData.session.user.email);
          setIsAuthenticated(true);
          retryCount.current = 0;
        } else {
          console.error('[AutoLogin] ❌ verifyOtp returned no session and no error');
          setIsAuthenticated(false);
        }
      } else {
        console.log('[AutoLogin] ⚠ No auth token returned from backend. installed:', data.installed, 'authenticated:', data.authenticated);
        console.log('[AutoLogin] This means the shop has no linked user account or connection not found.');
        setIsAuthenticated(false);
      }

      setIsLoading(false);

    } catch (err: any) {
      console.error('[AutoLogin] Error:', err);
      setError(err.message || 'Error de autenticación');
      setErrorCode('NETWORK_ERROR');
      
      // Retry on network errors
      if (retryCount.current < maxRetries) {
        retryCount.current++;
        console.log(`[AutoLogin] Network error, retrying... (${retryCount.current}/${maxRetries})`);
        setTimeout(performAutoLogin, 1000 * retryCount.current);
        return;
      }
      
      setIsLoading(false);
    }
  }, [isEmbedded, isInitialized, shop, getSessionToken, createAuthHeaders, shopify]);

  // Attempt auto-login when App Bridge is ready
  // CRITICAL: Don't require host — shop + session token is enough for auth
  useEffect(() => {
    if (isEmbedded && shop && (isInitialized || shopify)) {
      performAutoLogin();
    } else if (!isEmbedded) {
      setIsLoading(false);
    }
  }, [isEmbedded, isInitialized, shop, shopify, performAutoLogin]);

  // CRITICAL FOR SHOPIFY CHECKS: Periodically validate session token
  // Shopify's bot verifies every 2 hours that the app generates session data
  useEffect(() => {
    if (!isEmbedded || !isInitialized || !shop) return;

    const validateSessionPeriodically = async () => {
      try {
        const token = await getSessionToken();
        if (!token) return;

        const headers = await createAuthHeaders();
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/shopify-session-validate`,
          { method: 'POST', headers }
        );
        const data = await res.json();
        console.log('[Shopify Check] Periodic session validation:', data.valid ? 'PASSED' : 'FAILED');
      } catch (err) {
        console.warn('[Shopify Check] Periodic validation error:', err);
      }
    };

    // Validate every 30 minutes to ensure Shopify always sees activity
    const interval = setInterval(validateSessionPeriodically, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isEmbedded, isInitialized, shop, getSessionToken, createAuthHeaders]);

  return {
    isLoading,
    isAuthenticated,
    isInstalled,
    error,
    errorCode,
    requiresOAuth,
    shopDomain,
    clientId,
    connectionId,
    retryLogin: performAutoLogin,
    redirectToOAuth,
  };
}
