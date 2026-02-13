import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ShopifyContextType {
  /** Whether this appears to be a Shopify embedded context (has shop+host params) */
  isShopifyContext: boolean;
  /** The shop domain from URL params or sessionStorage */
  shop: string | null;
  /** The host param from URL or sessionStorage (base64 encoded) */
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
 * Provider that detects Shopify embedded context from URL params OR sessionStorage.
 * Must be placed INSIDE BrowserRouter but OUTSIDE routes that need auth.
 * 
 * CRITICAL: Recovers shop/host from sessionStorage after internal redirects
 * (e.g. / → /auth) so that shouldBypassAuth remains true and the app
 * never redirects to Google login when inside Shopify Admin.
 */
export function ShopifyContextProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();

  const value = useMemo(() => {
    const urlShop = searchParams.get('shop');
    const urlHost = searchParams.get('host');
    const urlStore = searchParams.get('store');
    const hmac = searchParams.get('hmac');

    // Resolve shop from 'shop' or 'store' param
    const resolvedShop = urlShop
      || (urlStore ? (urlStore.includes('.myshopify.com') ? urlStore : `${urlStore}.myshopify.com`) : null);

    // Persist to BOTH sessionStorage and localStorage
    if (resolvedShop) {
      sessionStorage.setItem('shopify_shop', resolvedShop);
      localStorage.setItem('shopify_shop', resolvedShop);
    }
    if (urlHost) {
      sessionStorage.setItem('shopify_host', urlHost);
      localStorage.setItem('shopify_host', urlHost);
    }

    // Triple fallback: URL → sessionStorage → localStorage
    const shop = resolvedShop 
      || sessionStorage.getItem('shopify_shop') 
      || localStorage.getItem('shopify_shop');
    const host = urlHost 
      || sessionStorage.getItem('shopify_host') 
      || localStorage.getItem('shopify_host');

    // We're in Shopify context if we have both shop and host (from URL or storage)
    const isShopifyContext = !!(shop && host);
    
    // Bypass auth redirects when in Shopify context
    // This prevents the redirect to /auth → Google login flow
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
 */
export function useShopifyContext() {
  return useContext(ShopifyContext);
}
