import { useEffect, useRef } from 'react';

/**
 * Shopify App Handle — must match the slug in the Shopify Partners Dashboard.
 */
const APP_HANDLE = 'loveable-public';

/**
 * Detects if the app is running as a top-level page (outside Shopify admin iframe)
 * and redirects back into the Shopify admin embedded URL.
 *
 * This prevents the "iframe escape" that Shopify's automated reviewer flags.
 *
 * @param isAuthenticated  Whether the user has an active session
 */
export function useShopifyReEmbed(isAuthenticated: boolean) {
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    if (!isAuthenticated) return;

    // 1. Are we top-level (NOT inside an iframe)?
    let isTopLevel = true;
    try {
      isTopLevel = window.self === window.top;
    } catch {
      // Cross-origin → we ARE in an iframe
      isTopLevel = false;
    }
    if (!isTopLevel) return; // Already embedded — nothing to do

    // 2. Do we have a stored shop from a previous Shopify session?
    const storedShop =
      localStorage.getItem('shopify_shop') ||
      sessionStorage.getItem('shopify_shop');

    if (!storedShop) return; // Not a Shopify merchant — skip

    // 3. Build the admin URL and redirect
    const shopName = storedShop.replace('.myshopify.com', '');
    const adminUrl = `https://admin.shopify.com/store/${shopName}/apps/${APP_HANDLE}`;

    console.log('[ReEmbed] Top-level + authenticated + storedShop detected');
    console.log('[ReEmbed] Redirecting to Shopify Admin:', adminUrl);

    hasRedirected.current = true;
    window.location.href = adminUrl;
  }, [isAuthenticated]);
}
