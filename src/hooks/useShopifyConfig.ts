import { useEffect, useState } from 'react';

/**
 * Hook que obtiene la configuracion de Shopify desde el backend.
 * Controla que flujo mostrar (Custom App vs App Store) segun la env var
 * SHOPIFY_MODE del Cloud Run.
 *
 * Mientras Shopify no apruebe la public app: SHOPIFY_MODE=custom → solo
 * se muestra el wizard Custom App.
 *
 * Cuando aprueben: SHOPIFY_MODE=both → se muestra una pantalla de seleccion
 * con ambas opciones. SHOPIFY_MODE=appstore → solo el flujo de 1 clic.
 */
export type ShopifyMode = 'custom' | 'appstore' | 'both';

export interface ShopifyConfig {
  mode: ShopifyMode;
  appStoreAvailable: boolean;
  customAppAvailable: boolean;
  appStoreUrl: string | null;
}

const DEFAULT_CONFIG: ShopifyConfig = {
  mode: 'custom',
  appStoreAvailable: false,
  customAppAvailable: true,
  appStoreUrl: null,
};

const API_BASE = (import.meta.env.VITE_API_URL || '').trim();

export function useShopifyConfig() {
  const [config, setConfig] = useState<ShopifyConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!API_BASE) {
        setLoading(false);
        return;
      }
      try {
        const resp = await fetch(`${API_BASE}/api/shopify/config`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        setConfig({
          mode: data.mode || 'custom',
          appStoreAvailable: !!data.appStoreAvailable,
          customAppAvailable: data.customAppAvailable !== false,
          appStoreUrl: data.appStoreUrl || null,
        });
      } catch (err) {
        console.warn('[useShopifyConfig] Failed to load config, using defaults:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { config, loading };
}
