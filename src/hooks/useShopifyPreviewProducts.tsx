import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ShopifyPreviewProduct {
  title: string;
  price: string;
  image_url: string;
  handle: string;
}

export function useShopifyPreviewProducts(clientId?: string, count = 6) {
  const [products, setProducts] = useState<ShopifyPreviewProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        // Find the Shopify connection for this client
        const { data: conn } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'shopify')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!conn || cancelled) { setLoading(false); return; }

        const { data, error } = await supabase.functions.invoke('fetch-shopify-products', {
          body: { connectionId: conn.id },
        });

        if (cancelled) return;
        if (error || !data?.products) { setLoading(false); return; }

        const mapped: ShopifyPreviewProduct[] = (data.products as any[]).slice(0, count).map((p: any) => ({
          title: p.title || 'Producto',
          price: p.variants?.[0]?.price || p.price || '0',
          image_url: p.image?.src || p.images?.[0]?.src || '',
          handle: p.handle || '',
        }));

        setProducts(mapped);
      } catch {
        // silent fail – preview is optional
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();
    return () => { cancelled = true; };
  }, [clientId, count]);

  return { products, loading };
}
