import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ShopifyContextType {
  /** Whether this appears to be a Shopify embedded context (has shop+host params) */
  isShopifyContext: boolean;
  /** The shop domain from URL params */
  shop: string | null;
  /** The host param from URL (base64 encoded) */
  host: string | null;
  /** Whether HMAC is present (fresh install flow) */
  hasHmac: boolean;
  /** Whether we should bypass normal auth flow */
  shouldBypassAuth: boolean;
}

const ShopifyContext = createContext<ShopifyContextType>({
  isShopifyContext: false,
  shop: null,
  host: null,
  hasHmac: false,
  shouldBypassAuth: false,
});

/**
 * Provider that detects Shopify embedded context from URL params.
 * Must be placed INSIDE BrowserRouter but OUTSIDE routes that need auth.
 * 
 * When shop+host params are present, this signals that we're in Shopify Admin
 * and should attempt auto-login instead of redirecting to /auth.
 */
export function ShopifyContextProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();

  const value = useMemo(() => {
    const shop = searchParams.get('shop');
    const host = searchParams.get('host');
    const hmac = searchParams.get('hmac');

    // We're in Shopify context if we have both shop and host params
    const isShopifyContext = !!(shop && host);
    
    // We should bypass auth redirects if we're in Shopify context
    // This allows auto-login to complete before any redirect to /auth
    const shouldBypassAuth = isShopifyContext;

    return {
      isShopifyContext,
      shop,
      host,
      hasHmac: !!hmac,
      shouldBypassAuth,
    };
  }, [searchParams]);

  return (
    <ShopifyContext.Provider value={value}>
      {children}
    </ShopifyContext.Provider>
  );
}

/**
 * Hook to access Shopify context detection.
 * 
 * Use this in components that need to know if we're in Shopify embedded mode
 * BEFORE attempting any auth-related redirects.
 */
export function useShopifyContext() {
  return useContext(ShopifyContext);
}
