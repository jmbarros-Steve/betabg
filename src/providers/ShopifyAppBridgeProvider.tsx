import { createContext, useContext, ReactNode, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

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

interface ShopifyAppBridgeContextType {
  /** The Shopify App Bridge instance (from CDN) */
  shopify: ShopifyAppBridge | null;
  /** Whether we're running inside Shopify Admin iframe */
  isEmbedded: boolean;
  /** Whether App Bridge is ready to use */
  isReady: boolean;
  /** Whether App Bridge has been fully initialized with host+shop */
  isInitialized: boolean;
  /** Shop domain from URL params */
  shop: string | null;
  /** Host from URL params (base64 encoded) */
  host: string | null;
  /** Any initialization error */
  error: string | null;
  /** Get a fresh Session Token for API calls */
  getSessionToken: () => Promise<string | null>;
  /** Show a toast notification in Shopify Admin */
  showToast: (message: string, isError?: boolean) => void;
  /** Create headers for authenticated API calls */
  createAuthHeaders: () => Promise<HeadersInit>;
}

const ShopifyAppBridgeContext = createContext<ShopifyAppBridgeContextType>({
  shopify: null,
  isEmbedded: false,
  isReady: false,
  isInitialized: false,
  shop: null,
  host: null,
  error: null,
  getSessionToken: async () => null,
  showToast: () => {},
  createAuthHeaders: async () => ({}),
});

/**
 * Global Shopify App Bridge Provider
 * 
 * CRITICAL FOR SHOPIFY EMBEDDED APP CHECKS:
 * - Uses CDN script (https://cdn.shopify.com/shopifycloud/app-bridge.js)
 * - Provides Session Tokens via idToken() for ALL backend calls
 * - Implements heartbeat for session keep-alive
 * - Wraps the entire app to ensure consistent access
 */
export function ShopifyAppBridgeProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const [shopify, setShopify] = useState<ShopifyAppBridge | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const initializationAttempted = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  // Session Heartbeat: Keep session alive by refreshing token periodically
  useEffect(() => {
    if (!shopify || !isEmbedded) return;

    const performHeartbeat = async () => {
      try {
        const token = await shopify.idToken();
        if (token) {
          console.log('[App Bridge Provider] Session heartbeat: Token refreshed');
        }
      } catch (err) {
        console.warn('[App Bridge Provider] Session heartbeat failed:', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[App Bridge Provider] Tab visible, triggering heartbeat');
        performHeartbeat();
      }
    };

    const handleFocus = () => {
      console.log('[App Bridge Provider] Window focused, triggering heartbeat');
      performHeartbeat();
    };

    const handlePopState = () => {
      console.log('[App Bridge Provider] Navigation, triggering heartbeat');
      performHeartbeat();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('popstate', handlePopState);

    // Initial heartbeat
    performHeartbeat();

    // Periodic heartbeat every 4 minutes
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

  // Initialize App Bridge
  useEffect(() => {
    const embedded = window.self !== window.top;
    setIsEmbedded(embedded);

    if (!embedded) {
      console.log('[App Bridge Provider] Not embedded, skipping initialization');
      setIsReady(true);
      setIsInitialized(true);
      return;
    }

    if (!host || !shop) {
      console.warn('[App Bridge Provider] Missing host or shop params');
      return;
    }

    if (initializationAttempted.current) {
      return;
    }
    initializationAttempted.current = true;

    const initAppBridge = () => {
      try {
        if (window.shopify) {
          console.log('[App Bridge Provider] CDN script loaded');
          console.log('[App Bridge Provider] Config:', {
            apiKey: window.shopify.config?.apiKey,
            host: window.shopify.config?.host,
            shop: window.shopify.config?.shop,
          });

          const configHost = window.shopify.config?.host;
          const configShop = window.shopify.config?.shop;

          if (configHost && configShop) {
            console.log('[App Bridge Provider] ✓ Validation PASSED');
            console.log('[App Bridge Provider] ✓ CDN Script: LOADED');
            console.log('[App Bridge Provider] ✓ Session Token Mode: ENABLED');
            setShopify(window.shopify);
            setIsReady(true);
            setIsInitialized(true);
          } else {
            console.warn('[App Bridge Provider] Config incomplete, retrying...');
            setTimeout(initAppBridge, 100);
          }
        } else {
          console.warn('[App Bridge Provider] window.shopify not available, retrying...');
          setTimeout(initAppBridge, 100);
        }
      } catch (err: any) {
        console.error('[App Bridge Provider] Error:', err);
        setError(err.message);
        setIsReady(true);
      }
    };

    if (document.readyState === 'complete') {
      initAppBridge();
    } else {
      window.addEventListener('load', initAppBridge);
      return () => window.removeEventListener('load', initAppBridge);
    }
  }, [host, shop]);

  /**
   * Get a fresh Session Token from Shopify
   * MUST be called for EACH API request - never cache!
   */
  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (!shopify) {
      console.warn('[App Bridge Provider] Cannot get token: not initialized');
      return null;
    }

    try {
      const token = await shopify.idToken();
      console.log('[App Bridge Provider] Session token obtained');
      return token;
    } catch (err: any) {
      console.error('[App Bridge Provider] Token error:', err);
      setError(err.message);
      return null;
    }
  }, [shopify]);

  /**
   * Create authenticated headers for API calls
   * Includes Session Token and shop/host for Shopify validation
   */
  const createAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (shopify && isEmbedded) {
      const token = await getSessionToken();
      if (token) {
        headers['X-Shopify-Session-Token'] = token;
      }
      if (shopify.config?.host) {
        headers['X-Shopify-Host'] = shopify.config.host;
      }
      if (shopify.config?.shop) {
        headers['X-Shopify-Shop'] = shopify.config.shop;
      }
    }

    return headers;
  }, [shopify, isEmbedded, getSessionToken]);

  /**
   * Show toast notification in Shopify Admin
   */
  const showToast = useCallback((message: string, isError = false) => {
    if (shopify?.toast) {
      shopify.toast.show(message, { isError });
    } else {
      console.log(`[Toast] ${isError ? 'Error' : 'Info'}: ${message}`);
    }
  }, [shopify]);

  const value: ShopifyAppBridgeContextType = {
    shopify,
    isEmbedded,
    isReady,
    isInitialized,
    shop,
    host,
    error,
    getSessionToken,
    showToast,
    createAuthHeaders,
  };

  return (
    <ShopifyAppBridgeContext.Provider value={value}>
      {children}
    </ShopifyAppBridgeContext.Provider>
  );
}

/**
 * Hook to access Shopify App Bridge from any component
 */
export function useAppBridge() {
  return useContext(ShopifyAppBridgeContext);
}

/**
 * Helper hook for making authenticated API calls to Edge Functions
 */
export function useShopifyApi() {
  const { createAuthHeaders, isEmbedded, shopify } = useAppBridge();

  const callEdgeFunction = useCallback(async (
    functionName: string,
    options: {
      method?: string;
      body?: any;
    } = {}
  ) => {
    const { method = 'POST', body } = options;
    
    const headers = await createAuthHeaders();
    
    const response = await fetch(
      `https://jnqivntlkemzcpomkvwv.supabase.co/functions/v1/${functionName}`,
      {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }
    );

    return response;
  }, [createAuthHeaders]);

  return {
    callEdgeFunction,
    isEmbedded,
    shopify,
  };
}
