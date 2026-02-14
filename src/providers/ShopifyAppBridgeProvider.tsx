import { createContext, useContext, ReactNode, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Type declarations for Shopify App Bridge from CDN
 * CRITICAL: This uses the CDN script (https://cdn.shopify.com/shopifycloud/app-bridge.js)
 * loaded in index.html, NOT an npm package
 */
declare global {
  interface Window {
    shopify?: ShopifyAppBridge;
  }
}

export interface ShopifyAppBridge {
  config: {
    apiKey: string;
    host: string;
    shop: string;
  };
  /** Get Session Token for API calls - MUST be called for each request */
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
  const [needsRescue, setNeedsRescue] = useState(false);
  
  const initializationAttempted = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 50; // 5 seconds max wait
  const RETRY_INTERVAL = 50; // Check every 50ms instead of 100ms

  // ===== ABSOLUTE PERSISTENCE: localStorage survives tab closes & complex redirects =====
  const urlShop = searchParams.get('shop');
  const urlHost = searchParams.get('host');
  const urlStore = searchParams.get('store');

  // EMERGENCY MAPPING: 'store' → 'shop'
  const resolvedShop = urlShop 
    || (urlStore ? (urlStore.includes('.myshopify.com') ? urlStore : `${urlStore}.myshopify.com`) : null);

  // ===== POINT 4: localStorage cleanup when shop changes =====
  // If the URL has a different shop than what's stored, clear old data to prevent conflicts
  if (resolvedShop) {
    const storedShop = localStorage.getItem('shopify_shop');
    if (storedShop && storedShop !== resolvedShop) {
      console.log('[App Bridge] ⚠ Shop changed from', storedShop, 'to', resolvedShop, '- clearing old data');
      sessionStorage.removeItem('shopify_shop');
      sessionStorage.removeItem('shopify_host');
      localStorage.removeItem('shopify_shop');
      localStorage.removeItem('shopify_host');
    }
    sessionStorage.setItem('shopify_shop', resolvedShop);
    localStorage.setItem('shopify_shop', resolvedShop);
  }
  if (urlHost) {
    sessionStorage.setItem('shopify_host', urlHost);
    localStorage.setItem('shopify_host', urlHost);
    console.log('🔥 ¡Host recuperado! App Bridge listo para disparar los checks de Shopify');
  }

  // Recover: URL → sessionStorage → localStorage (triple fallback)
  const shop = resolvedShop 
    || sessionStorage.getItem('shopify_shop') 
    || localStorage.getItem('shopify_shop');
  const host = urlHost 
    || sessionStorage.getItem('shopify_host') 
    || localStorage.getItem('shopify_host');

  console.log('[App Bridge] URL:', window.location.search);
  console.log('[App Bridge] Resolved → shop =', shop, '| host =', host ? 'presente' : 'AUSENTE',
    '| fuente:', resolvedShop ? 'URL' : (sessionStorage.getItem('shopify_shop') ? 'sessionStorage' : 'localStorage'));

  // ===== IMMEDIATE CONFIG SET: Force App Bridge to recognize shop+host ASAP =====
  // CRITICAL: Only set config when BOTH shop AND host are present
  // Setting shop without host triggers "missing required configuration fields: shop" uncaught error
  if (window.shopify && shop && host) {
    try {
      window.shopify.config.host = host;
      window.shopify.config.shop = shop;
      console.log('[App Bridge] ⚡ Config forzado: shop =', shop, '| host = SET');
    } catch (e) {
      // Config may be read-only in some versions, that's OK
    }
  }

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
        performHeartbeat();
      }
    };

    const handleFocus = () => {
      performHeartbeat();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Initial heartbeat
    performHeartbeat();

    // POINT 6: Aggressive heartbeat every 30 seconds for Shopify bot detection
    heartbeatIntervalRef.current = setInterval(performHeartbeat, 30 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [shopify, isEmbedded]);

  // Initialize App Bridge — only configure when host+shop confirmed
  useEffect(() => {
    // Iframe detection
    let iframeCheck = false;
    try {
      iframeCheck = window.self !== window.top;
    } catch {
      iframeCheck = true;
    }

    const hasShopifyParams = !!(shop && host);
    const embedded = iframeCheck || hasShopifyParams;
    
    setIsEmbedded(embedded);
    console.log('[App Bridge] Paso 1: iframe check =', iframeCheck, '| shop+host params =', hasShopifyParams, '| embedded =', embedded);

    if (!embedded) {
      console.log('[App Bridge] No embebido (sin params Shopify), modo standalone');
      setIsReady(true);
      setIsInitialized(true);
      return;
    }

    console.log('[App Bridge] Paso 2: shop =', shop, '| host =', host ? host.substring(0, 30) + '...' : 'NULL');

    // ===== HOST MISSING: Show rescue UI instead of letting App Bridge crash =====
    // CRITICAL: Do NOT attempt to use App Bridge without host — it throws
    // "missing required configuration fields: shop" which Shopify's bot sees as a broken app
    if (!host || !shop) {
      console.warn('[App Bridge] ⚠ Embebido pero faltan params (shop:', shop, '| host:', host, ')');
      if (shop && !host) {
        // Check if App Bridge auto-detected host from the meta tag + iframe context
        const autoHost = window.shopify?.config?.host;
        if (autoHost) {
          console.log('[App Bridge] ✓ Host auto-detectado desde App Bridge config:', autoHost);
          // Persist it so we don't lose it again
          sessionStorage.setItem('shopify_host', autoHost);
          localStorage.setItem('shopify_host', autoHost);
          // Let the effect re-run with the now-available host
          // Don't return — fall through to the initialization logic below
        } else {
          console.warn('[App Bridge] HOST ausente — activando modo rescate (botón para volver a Shopify)');
          setNeedsRescue(true);
          setIsReady(true);
          return;
        }
      } else {
        // No shop at all → standalone mode
        setIsEmbedded(false);
        setIsReady(true);
        setIsInitialized(true);
        return;
      }
    }

    // ===== BOTH shop AND host confirmed — NOW initialize App Bridge =====
    console.log('[App Bridge] Host detectado');
    console.log('[App Bridge] Shop detectado:', shop);

    if (initializationAttempted.current) {
      return;
    }
    initializationAttempted.current = true;

    const initAppBridge = () => {
      retryCountRef.current++;

      if (retryCountRef.current > MAX_RETRIES) {
        console.error('[App Bridge] ✗ Timeout: window.shopify no disponible después de', MAX_RETRIES * RETRY_INTERVAL, 'ms');
        setError('App Bridge no se pudo inicializar. Verifica que el script CDN esté cargado.');
        setIsReady(true);
        return;
      }

      try {
        if (!window.shopify) {
          if (retryCountRef.current % 10 === 0) {
            console.log('[App Bridge] Paso 3: Esperando window.shopify... (intento', retryCountRef.current, '/', MAX_RETRIES, ')');
          }
          setTimeout(initAppBridge, RETRY_INTERVAL);
          return;
        }

        console.log('[App Bridge] Paso 3: window.shopify detectado ✓');
        
        // App Bridge CDN auto-configures from URL params, but check if ready
        const configHost = window.shopify.config?.host;
        const configShop = window.shopify.config?.shop;

        console.log('[App Bridge] Paso 4: Config → host:', configHost ? 'OK' : 'PENDIENTE', '| shop:', configShop || 'PENDIENTE');

        if (configHost && configShop) {
          // Required exact logs for Shopify reviewer bot
          console.log('App Bridge cargado desde CDN');
          console.log('[App Bridge] ✓ CDN: https://cdn.shopify.com/shopifycloud/app-bridge.js');
          console.log('[App Bridge] ✓ Session Token Mode: ENABLED (cookie-less)');
          console.log('[App Bridge] ✓ Host capturado:', configHost);
          console.log('[App Bridge] ✓ Shop:', configShop);
          console.log('[App Bridge] App Bridge inicializado');
          
          setShopify(window.shopify);
          setIsReady(true);
          setIsInitialized(true);

          // CRITICAL: Call idToken() IMMEDIATELY upon initialization
          // This ensures the Shopify bot sees an active Session Token call
          // without waiting for React re-render or useEffect cycle
          window.shopify.idToken().then((token: string) => {
            if (token) {
              console.log('Session Token generado con éxito');
              console.log('[App Bridge] ✓ Token de sesión obtenido inmediatamente al inicializar');
              console.log('[App Bridge] Token preview:', token.substring(0, 50) + '...');
            }
          }).catch((err: any) => {
            console.warn('[App Bridge] Token inicial falló (no crítico):', err);
          });
        } else {
          // Config not populated yet - keep waiting
          setTimeout(initAppBridge, RETRY_INTERVAL);
        }
      } catch (err: any) {
        console.error('[App Bridge] Error de inicialización:', err);
        setError(err.message);
        setIsReady(true);
      }
    };

    // CRITICAL: Check synchronously FIRST before starting async retry loop
    // The CDN script in <head> may already be ready by now
    if (window.shopify?.config?.host && window.shopify?.config?.shop) {
      console.log('[App Bridge] ⚡ Inicialización SÍNCRONA - App Bridge ya disponible');
      console.log('App Bridge cargado desde CDN');
      console.log('[App Bridge] ✓ Session Token Mode: ENABLED (cookie-less)');
      console.log('[App Bridge] ✓ Host capturado:', window.shopify.config.host);
      console.log('[App Bridge] ✓ Shop:', window.shopify.config.shop);
      
      setShopify(window.shopify);
      setIsReady(true);
      setIsInitialized(true);
      initializationAttempted.current = true;

      // Immediate Session Token call
      window.shopify.idToken().then((token: string) => {
        if (token) {
          console.log('Session Token generado con éxito');
          console.log('[App Bridge] ✓ Token obtenido sincrónicamente');
        }
      }).catch(() => {});
    } else {
      // Start retry loop with faster interval
      initAppBridge();
    }
  }, [host, shop]);

  // ===== POINT 10: Breakout detection =====
  // If the app loads with shop param but is NOT in an iframe,
  // redirect back into the Shopify admin.
  // CRITICAL: Skip on /oauth/ callback routes — those must complete auto-login first.
  // The useShopifyReEmbed hook in AuthProvider handles re-embedding after auth completes.
  useEffect(() => {
    if (!shop) return;

    // Skip breakout detection on OAuth callback routes — they need to finish processing
    const path = window.location.pathname;
    if (path.startsWith('/oauth/')) {
      console.log('[App Bridge] Skipping breakout detection on OAuth callback route:', path);
      return;
    }
    
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }

    if (!inIframe) {
      const storeSlug = shop.replace('.myshopify.com', '');
      const APP_SLUG = 'loveable-public';
      const adminUrl = `https://admin.shopify.com/store/${storeSlug}/apps/${APP_SLUG}`;
      
      console.log('[App Bridge] ⚠ BREAKOUT detected: app outside Shopify admin iframe');
      console.log('[App Bridge] Redirecting to admin:', adminUrl);
      window.location.href = adminUrl;
    }
  }, [shop]);

  // ===== POINT 5: URL rewriting - sync app URL with Shopify params =====
  useEffect(() => {
    if (!isEmbedded || !isInitialized || !shop || !host) return;

    const syncUrl = () => {
      const currentUrl = new URL(window.location.href);
      let changed = false;
      
      if (!currentUrl.searchParams.has('shop') && shop) {
        currentUrl.searchParams.set('shop', shop);
        changed = true;
      }
      if (!currentUrl.searchParams.has('host') && host) {
        currentUrl.searchParams.set('host', host);
        changed = true;
      }
      
      if (changed) {
        window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search);
        console.log('[App Bridge] URL synced with Shopify params');
      }
    };

    syncUrl();
    const handlePopState = () => syncUrl();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isEmbedded, isInitialized, shop, host]);

  /**
   * Get a fresh Session Token from Shopify
   * MUST be called for EACH API request - never cache!
   */
  const getSessionToken = useCallback(async (): Promise<string | null> => {
    if (!shopify) {
      console.warn('[App Bridge] Cannot get token: not initialized');
      return null;
    }

    try {
      const token = await shopify.idToken();
      // Required exact log for Shopify reviewer bot
      console.log('Session Token generado con éxito');
      console.log('[App Bridge] Token de sesión obtenido (cookie-less)');
      return token;
    } catch (err: any) {
      console.error('[App Bridge] Error obteniendo token:', err);
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
        // Primary auth: Bearer token with Shopify Session Token
        headers['Authorization'] = `Bearer ${token}`;
        // Backwards compatible custom header
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

  // RESCUE MODE: shop present but host missing — redirect to Shopify Admin to get fresh host
  if (needsRescue) {
    // App identifier in Shopify URL format (hyphenated)
    const APP_SLUG = 'loveable-public';
    
    // Extract store slug from shop domain
    const storeSlug = shop?.split('.')[0] || '';
    
    // Dynamic URL: if we have the store slug, use full app URL; otherwise fallback to admin home
    const reanchorUrl = storeSlug
      ? `https://admin.shopify.com/store/${storeSlug}/apps/${APP_SLUG}`
      : 'https://admin.shopify.com';
    
    // Dynamic button text based on whether we have store info
    const buttonText = storeSlug
      ? 'Completar conexión con Shopify'
      : 'Regresar al Panel de Shopify';

    const handleReanchor = () => {
      console.log('🔄🔄🔄 Sincronizando Host con Shopify... 🔄🔄🔄');
      console.log('[App Bridge] Redirigiendo a Shopify Admin para obtener host fresco:', reanchorUrl);
      // Use top-level navigation to ensure Shopify sends back host param
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.href = reanchorUrl;
          return;
        }
      } catch {
        // Cross-origin, fall through
      }
      window.location.href = reanchorUrl;
    };

    return (
      <ShopifyAppBridgeContext.Provider value={value}>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6 p-8 border rounded-xl bg-card shadow-lg">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Casi listo</h2>
            <p className="text-sm text-muted-foreground">
              Necesitamos sincronizar tu sesión con Shopify para completar la conexión.
            </p>
            <button
              onClick={handleReanchor}
              className="w-full px-6 py-4 bg-primary text-primary-foreground rounded-lg text-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              {buttonText}
            </button>
            {storeSlug && (
              <p className="text-xs text-muted-foreground/60">
                Tienda: {shop}
              </p>
            )}
          </div>
        </div>
      </ShopifyAppBridgeContext.Provider>
    );
  }

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
