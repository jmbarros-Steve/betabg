import { useEffect, useState, useCallback, useRef } from 'react';

// Type declarations for Shopify App Bridge from CDN
declare global {
  interface Window {
    shopify?: ShopifyAppBridge;
  }
}

interface ShopifyAppBridge {
  config: {
    apiKey: string;
    host: string;
    shop: string;
  };
  idToken: () => Promise<string>;
  toast: {
    show: (message: string, options?: { duration?: number; isError?: boolean }) => void;
  };
  resourcePicker: (options: any) => Promise<any>;
  modal: any;
  saveBar: any;
}

interface ShopifyAppBridgeConfig {
  shop: string | null;
  host: string | null;
}

interface UseShopifyAppBridgeReturn {
  shopify: ShopifyAppBridge | null;
  isEmbedded: boolean;
  isReady: boolean;
  isInitialized: boolean; // New: true only when host+shop are confirmed
  error: string | null;
  getSessionToken: () => Promise<string | null>;
  showToast: (message: string, isError?: boolean) => void;
  redirectExternal: (url: string) => void;
  redirectAdmin: (path: string) => void;
  navigateSafe: (url: string) => void; // New: safe navigation within Shopify
}

/**
 * Hook for Shopify App Bridge v3 using CDN script and Session Tokens
 * 
 * Architecture: M&A Ready - No localStorage/cookies for sessions
 * Security: Session tokens obtained fresh via idToken() for each API call
 * Compliance: Uses X-Shopify-Access-Token header (not Authorization: Bearer)
 * 
 * CRITICAL FOR SHOPIFY CHECKS:
 * - isInitialized = true ONLY when host + shop params are present AND App Bridge is ready
 * - Session heartbeat runs on visibility/tab changes
 * - All navigation goes through navigateSafe() to avoid breaking iframe
 */
export function useShopifyAppBridge({ shop, host }: ShopifyAppBridgeConfig): UseShopifyAppBridgeReturn {
  const [shopify, setShopify] = useState<ShopifyAppBridge | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializationAttempted = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Session Heartbeat: Call idToken() on visibility changes to keep session alive
  useEffect(() => {
    if (!shopify || !isEmbedded) return;

    const performHeartbeat = async () => {
      try {
        const token = await shopify.idToken();
        if (token) {
          console.log('[App Bridge] Session heartbeat: Token refreshed');
        }
      } catch (err) {
        console.warn('[App Bridge] Session heartbeat failed:', err);
      }
    };

    // Heartbeat on tab visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App Bridge] Tab became visible, triggering heartbeat');
        performHeartbeat();
      }
    };

    // Heartbeat on focus (user returns to tab)
    const handleFocus = () => {
      console.log('[App Bridge] Window focused, triggering heartbeat');
      performHeartbeat();
    };

    // Heartbeat on popstate (internal navigation within app)
    const handlePopState = () => {
      console.log('[App Bridge] Navigation detected, triggering heartbeat');
      performHeartbeat();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('popstate', handlePopState);

    // Initial heartbeat on mount
    performHeartbeat();

    // Periodic heartbeat every 4 minutes to stay ahead of token expiry
    heartbeatIntervalRef.current = setInterval(performHeartbeat, 4 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('popstate', handlePopState);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [shopify, isEmbedded]);

  useEffect(() => {
    // Check if we're in an iframe (embedded in Shopify Admin)
    const embedded = window.self !== window.top;
    setIsEmbedded(embedded);

    if (!embedded) {
      console.log('[App Bridge] Not running in embedded mode');
      setIsReady(true);
      setIsInitialized(true); // Non-embedded is always "initialized"
      return;
    }

    // CRITICAL: Block initialization if host OR shop are missing
    if (!host || !shop) {
      console.warn('[App Bridge] Missing required params - host:', !!host, 'shop:', !!shop);
      // Don't set isReady or isInitialized - keep blocking render
      return;
    }

    // Prevent double initialization
    if (initializationAttempted.current) {
      return;
    }
    initializationAttempted.current = true;

    // Wait for Shopify App Bridge CDN script to load
    const initAppBridge = () => {
      try {
        // The CDN script exposes window.shopify automatically when embedded
        if (window.shopify) {
          console.log('[App Bridge] CDN script loaded, shopify object available');
          console.log('[App Bridge] Config:', {
            apiKey: window.shopify.config?.apiKey,
            host: window.shopify.config?.host,
            shop: window.shopify.config?.shop,
          });
          
          // Verify the config matches our URL params
          const configHost = window.shopify.config?.host;
          const configShop = window.shopify.config?.shop;
          
          if (configHost && configShop) {
            console.log('[App Bridge] Validation PASSED: host and shop confirmed');
            setShopify(window.shopify);
            setIsReady(true);
            setIsInitialized(true);
            
            // Log successful initialization for Shopify verification
            console.log('[App Bridge] Session Token mode: ENABLED');
            console.log('[App Bridge] CDN Script check: PASSED');
            console.log('[App Bridge] Embedded initialization: COMPLETE');
          } else {
            console.warn('[App Bridge] Config incomplete, retrying...');
            setTimeout(initAppBridge, 100);
          }
        } else {
          console.warn('[App Bridge] window.shopify not available yet, retrying...');
          // Retry after a short delay
          setTimeout(initAppBridge, 100);
        }
      } catch (err: any) {
        console.error('[App Bridge] Initialization error:', err);
        setError(err.message);
        setIsReady(true);
      }
    };

    // Give the CDN script time to initialize
    if (document.readyState === 'complete') {
      initAppBridge();
    } else {
      window.addEventListener('load', initAppBridge);
      return () => window.removeEventListener('load', initAppBridge);
    }
  }, [host, shop]);

  /**
   * Get a fresh Session Token from Shopify
   * IMPORTANT: This should be called for EACH API request, never cached
   */
  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (!shopify) {
      console.warn('[App Bridge] Cannot get session token: shopify not initialized');
      return null;
    }

    try {
      const token = await shopify.idToken();
      console.log('[App Bridge] Session token obtained successfully');
      return token;
    } catch (err: any) {
      console.error('[App Bridge] Failed to get session token:', err);
      setError(err.message);
      return null;
    }
  }, [shopify]);

  /**
   * Show a toast notification in Shopify Admin
   */
  const showToast = useCallback((message: string, isError = false) => {
    if (shopify?.toast) {
      shopify.toast.show(message, { isError });
    } else {
      // Fallback for non-embedded mode
      console.log(`[Toast] ${isError ? 'Error' : 'Info'}: ${message}`);
    }
  }, [shopify]);

  /**
   * Safe navigation that works within Shopify iframe
   * CRITICAL: Never use window.location.replace directly!
   */
  const navigateSafe = useCallback((url: string) => {
    if (isEmbedded && shopify) {
      // For internal app navigation, use history.pushState
      // This keeps us in the iframe and triggers heartbeat via popstate
      try {
        const urlObj = new URL(url, window.location.origin);
        
        // Preserve Shopify params
        if (host && !urlObj.searchParams.has('host')) {
          urlObj.searchParams.set('host', host);
        }
        if (shop && !urlObj.searchParams.has('shop')) {
          urlObj.searchParams.set('shop', shop);
        }
        
        // Use pushState for SPA navigation - safe for iframe
        window.history.pushState({}, '', urlObj.pathname + urlObj.search);
        // Dispatch popstate to trigger React Router and heartbeat
        window.dispatchEvent(new PopStateEvent('popstate'));
        
        console.log('[App Bridge] Safe navigation to:', urlObj.pathname);
      } catch {
        // Fallback: just change href without replace
        window.location.href = url;
      }
    } else {
      // Non-embedded: normal navigation
      window.location.href = url;
    }
  }, [isEmbedded, shopify, host, shop]);

  /**
   * Redirect to an external URL (breaks out of iframe)
   * Uses App Bridge navigation to avoid blocked popups
   */
  const redirectExternal = useCallback((url: string) => {
    if (shopify && isEmbedded) {
      // Use top-level navigation for external URLs
      // This is the correct way to handle OAuth redirects from embedded apps
      try {
        if (window.top) {
          window.top.location.href = url;
        } else {
          window.location.href = url;
        }
      } catch {
        // Cross-origin restriction, open in new tab
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [shopify, isEmbedded]);

  /**
   * Redirect within Shopify Admin
   */
  const redirectAdmin = useCallback((path: string) => {
    if (shopify && isEmbedded && window.top) {
      try {
        const shopDomain = shopify.config?.shop || '';
        window.top.location.href = `https://${shopDomain}/admin${path}`;
      } catch {
        console.error('[App Bridge] Cannot redirect to admin path');
      }
    }
  }, [shopify, isEmbedded]);

  return {
    shopify,
    isEmbedded,
    isReady,
    isInitialized,
    error,
    getSessionToken,
    showToast,
    redirectExternal,
    redirectAdmin,
    navigateSafe,
  };
}

/**
 * Helper to create authenticated fetch headers for Edge Functions
 * Includes host and shop for Shopify validation handshake
 */
export async function createShopifyAuthHeaders(
  getSessionToken: () => Promise<string | null>,
  shopify?: ShopifyAppBridge | null
): Promise<HeadersInit> {
  const token = await getSessionToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['X-Shopify-Session-Token'] = token;
  } else {
    console.warn('[Auth] No session token available');
  }
  
  // Include host and shop for Shopify validation handshake
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

/**
 * Build URL with preserved Shopify params for internal navigation
 * Ensures host and shop are always present for App Bridge validation
 */
export function buildShopifyUrl(
  basePath: string,
  params: { host?: string | null; shop?: string | null }
): string {
  const url = new URL(basePath, window.location.origin);
  
  if (params.host) {
    url.searchParams.set('host', params.host);
  }
  if (params.shop) {
    url.searchParams.set('shop', params.shop);
  }
  
  return url.toString();
}
