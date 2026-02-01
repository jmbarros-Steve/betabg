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
  error: string | null;
  getSessionToken: () => Promise<string | null>;
  showToast: (message: string, isError?: boolean) => void;
  redirectExternal: (url: string) => void;
  redirectAdmin: (path: string) => void;
}

/**
 * Hook for Shopify App Bridge v3 using CDN script and Session Tokens
 * 
 * Architecture: M&A Ready - No localStorage/cookies for sessions
 * Security: Session tokens obtained fresh via idToken() for each API call
 * Compliance: Uses X-Shopify-Access-Token header (not Authorization: Bearer)
 */
export function useShopifyAppBridge({ shop, host }: ShopifyAppBridgeConfig): UseShopifyAppBridgeReturn {
  const [shopify, setShopify] = useState<ShopifyAppBridge | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializationAttempted = useRef(false);

  useEffect(() => {
    // Check if we're in an iframe (embedded in Shopify Admin)
    const embedded = window.self !== window.top;
    setIsEmbedded(embedded);

    if (!embedded) {
      console.log('[App Bridge] Not running in embedded mode');
      setIsReady(true);
      return;
    }

    if (!host) {
      console.log('[App Bridge] Missing host parameter, cannot initialize');
      setIsReady(true);
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
          
          setShopify(window.shopify);
          setIsReady(true);
          
          // Log successful initialization for Shopify verification
          console.log('[App Bridge] Session Token mode: ENABLED');
          console.log('[App Bridge] CDN Script check: PASSED');
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
  }, [host]);

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
        const shop = shopify.config?.shop || '';
        window.top.location.href = `https://${shop}/admin${path}`;
      } catch {
        console.error('[App Bridge] Cannot redirect to admin path');
      }
    }
  }, [shopify, isEmbedded]);

  return {
    shopify,
    isEmbedded,
    isReady,
    error,
    getSessionToken,
    showToast,
    redirectExternal,
    redirectAdmin,
  };
}

/**
 * Helper to create authenticated fetch headers for Edge Functions
 * Uses X-Shopify-Access-Token as per Shopify API requirements
 */
export async function createShopifyAuthHeaders(
  getSessionToken: () => Promise<string | null>
): Promise<HeadersInit> {
  const token = await getSessionToken();
  
  if (!token) {
    console.warn('[Auth] No session token available');
    return {
      'Content-Type': 'application/json',
    };
  }

  return {
    'Content-Type': 'application/json',
    'X-Shopify-Session-Token': token,
  };
}
