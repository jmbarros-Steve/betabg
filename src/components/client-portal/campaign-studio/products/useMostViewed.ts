import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';

export interface Product {
  title: string;
  image_url: string;
  price: string;
  handle: string;
  url: string;
  count: number;
}

interface UseMostViewedOptions {
  timeframe?: '7d' | '30d' | '60d' | '90d';
  limit?: number;
}

export function useMostViewed(clientId: string, options?: UseMostViewedOptions) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeframe = options?.timeframe || '30d';
  const limit = options?.limit || 10;

  const fetchProducts = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      // Find the Klaviyo connection for this client
      const { data: conn, error: connError } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'klaviyo')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (connError || !conn) {
        setError('No se encontró conexión de Klaviyo');
        setProducts([]);
        return;
      }

      const { data, error: fnError } = await callApi('fetch-klaviyo-top-products', {
        body: { connectionId: conn.id, metric: 'viewed', timeframe, limit },
      });

      if (fnError || !data?.products) {
        setError(fnError || 'Error al obtener productos más vistos');
        setProducts([]);
        return;
      }

      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, timeframe, limit]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
}
