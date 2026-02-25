import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ShopifyPreviewProduct {
  title: string;
  price: string;
  image_url: string;
  handle: string;
}

const FALLBACK_PRODUCTS: ShopifyPreviewProduct[] = [
  { title: 'Sérum Vitamina C', price: '24990', image_url: 'https://placehold.co/400x400/f8f0e3/333?text=Sérum+C', handle: 'serum-vitamina-c' },
  { title: 'Crema Hidratante Pro', price: '18990', image_url: 'https://placehold.co/400x400/e3f0f8/333?text=Crema+Pro', handle: 'crema-hidratante' },
  { title: 'Aceite de Rosa Mosqueta', price: '15990', image_url: 'https://placehold.co/400x400/f8e3f0/333?text=Aceite+Rosa', handle: 'aceite-rosa' },
  { title: 'Mascarilla Detox', price: '12990', image_url: 'https://placehold.co/400x400/e3f8e6/333?text=Mascarilla', handle: 'mascarilla-detox' },
  { title: 'Protector Solar SPF50', price: '21990', image_url: 'https://placehold.co/400x400/f8f8e3/333?text=SPF50', handle: 'protector-solar' },
  { title: 'Tónico Facial', price: '9990', image_url: 'https://placehold.co/400x400/e3e8f8/333?text=Tónico', handle: 'tonico-facial' },
];

export function useShopifyPreviewProducts(clientId?: string, count = 6) {
  const [products, setProducts] = useState<ShopifyPreviewProduct[]>(FALLBACK_PRODUCTS.slice(0, count));
  const [loading, setLoading] = useState(false);
  const [isRealData, setIsRealData] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setProducts(prev => prev.length ? prev : FALLBACK_PRODUCTS.slice(0, count));
      return;
    }

    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const { data: conn } = await supabase
          .from('platform_connections')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'shopify')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (!conn || cancelled) {
          if (!cancelled) {
            console.log('[Preview] No Shopify connection, using fallback products');
            setProducts(FALLBACK_PRODUCTS.slice(0, count));
            setIsRealData(false);
          }
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke('fetch-shopify-products', {
          body: { connectionId: conn.id },
        });

        if (cancelled) return;
        if (error || !data?.products) {
          console.log('[Preview] Edge function failed, using fallback products');
          setProducts(FALLBACK_PRODUCTS.slice(0, count));
          setIsRealData(false);
          setLoading(false);
          return;
        }

        const mapped: ShopifyPreviewProduct[] = (data.products as any[]).slice(0, count).map((p: any) => ({
          title: p.title || 'Producto',
          price: p.variants?.[0]?.price || p.price || '0',
          image_url: p.image?.src || p.images?.[0]?.src || '',
          handle: p.handle || '',
        }));

        if (mapped.length > 0) {
          setProducts(mapped);
          setIsRealData(true);
        } else {
          setProducts(FALLBACK_PRODUCTS.slice(0, count));
          setIsRealData(false);
        }
      } catch {
        if (!cancelled) {
          setProducts(FALLBACK_PRODUCTS.slice(0, count));
          setIsRealData(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();
    return () => { cancelled = true; };
  }, [clientId, count]);

  return { products, loading, isRealData };
}
