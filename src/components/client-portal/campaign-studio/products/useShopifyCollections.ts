import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callApi } from '@/lib/api';

export interface Collection {
  id: number;
  title: string;
  handle: string;
  image: string;
  products_count: number;
  type: 'custom' | 'smart';
}

export interface CollectionProduct {
  id: number;
  title: string;
  handle: string;
  image_url: string;
  price: string;
  url: string;
}

export function useShopifyCollections(clientId: string) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      // Find the Shopify connection for this client
      const { data: conn, error: connError } = await supabase
        .from('platform_connections')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'shopify')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (connError || !conn) {
        setError('No se encontró conexión de Shopify');
        setCollections([]);
        return;
      }

      setConnectionId(conn.id);

      const { data, error: fnError } = await callApi('fetch-shopify-collections', {
        body: { connectionId: conn.id },
      });

      if (fnError || !data?.collections) {
        setError(fnError || 'Error al obtener colecciones');
        setCollections([]);
        return;
      }

      setCollections(data.collections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const fetchProducts = useCallback(async (collectionId: number): Promise<CollectionProduct[]> => {
    if (!connectionId) {
      throw new Error('No Shopify connection available');
    }

    const { data, error: fnError } = await callApi('fetch-shopify-collections', {
      body: { connectionId, collectionId },
    });

    if (fnError || !data?.products) {
      throw new Error(fnError || 'Error al obtener productos de la colección');
    }

    return data.products;
  }, [connectionId]);

  return { collections, loading, error, fetchProducts, refetch: fetchCollections };
}
