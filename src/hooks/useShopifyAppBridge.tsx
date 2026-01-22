import { useEffect, useState, useCallback } from 'react';
import createApp, { ClientApplication } from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

interface ShopifyAppBridgeConfig {
  shop: string | null;
  host: string | null;
}

export function useShopifyAppBridge({ shop, host }: ShopifyAppBridgeConfig) {
  const [app, setApp] = useState<ClientApplication<any> | null>(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if we're in an iframe (embedded in Shopify Admin)
    const embedded = window.self !== window.top;
    setIsEmbedded(embedded);

    if (!embedded || !host) {
      console.log('App Bridge: Not embedded or missing host parameter');
      return;
    }

    try {
      const apiKey = '933109488c1e95e5fd630abb7e03809e';
      
      const appBridge = createApp({
        apiKey,
        host,
        forceRedirect: false,
      });

      setApp(appBridge);
      console.log('App Bridge initialized successfully');
    } catch (err: any) {
      console.error('App Bridge initialization error:', err);
      setError(err.message);
    }
  }, [host]);

  // Redirect to external URL (opens in new tab or redirects top)
  const redirectExternal = useCallback((url: string) => {
    if (app) {
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.REMOTE, url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [app]);

  // Redirect within Shopify Admin
  const redirectAdmin = useCallback((path: string) => {
    if (app) {
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.ADMIN_PATH, path);
    }
  }, [app]);

  return {
    app,
    isEmbedded,
    error,
    redirectExternal,
    redirectAdmin,
  };
}
