import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ImageData {
  src: string;
  alt: string;
  position: number;
}

export interface PlatformListing {
  id: string;
  platform: string;
  platformItemId: string | null;
  platformSku: string | null;
  platformPrice: number;
  platformStock: number;
  platformUrl: string | null;
  isPublished: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
  metadata: Record<string, any>;
}

export interface VariantWithListings {
  id: string;
  sku: string | null;
  title: string | null;
  attributes: Record<string, string>;
  price: number;
  costPrice: number;
  stock: number;
  barcode: string | null;
  weightKg: number | null;
  isDefault: boolean;
  listings: PlatformListing[];
}

export interface ProductWithDetails {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  description: string | null;
  images: ImageData[];
  costPrice: number;
  basePrice: number;
  status: string;
  tags: string[];
  metadata: Record<string, any>;
  variants: VariantWithListings[];
  // Computed
  totalStock: number;
  platforms: string[];
  shopifyPrice: number | null;
  mlPrice: number | null;
}

function mapProduct(raw: any): ProductWithDetails {
  const variants: VariantWithListings[] = (raw.product_variants || []).map((v: any) => {
    const listings: PlatformListing[] = (v.product_platform_listings || []).map((l: any) => ({
      id: l.id,
      platform: l.platform,
      platformItemId: l.platform_item_id,
      platformSku: l.platform_sku,
      platformPrice: l.platform_price || 0,
      platformStock: l.platform_stock || 0,
      platformUrl: l.platform_url,
      isPublished: l.is_published || false,
      syncStatus: l.sync_status || 'pending',
      lastSyncedAt: l.last_synced_at,
      metadata: l.metadata || {},
    }));

    return {
      id: v.id,
      sku: v.sku,
      title: v.title,
      attributes: v.attributes || {},
      price: v.price || 0,
      costPrice: v.cost_price || 0,
      stock: v.stock || 0,
      barcode: v.barcode,
      weightKg: v.weight_kg,
      isDefault: v.is_default || false,
      listings,
    };
  });

  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
  const allListings = variants.flatMap((v) => v.listings);
  const platforms = [...new Set(allListings.filter((l) => l.isPublished).map((l) => l.platform))];

  const shopifyListing = allListings.find((l) => l.platform === 'shopify');
  const mlListing = allListings.find((l) => l.platform === 'mercadolibre');

  return {
    id: raw.id,
    sku: raw.sku,
    name: raw.name,
    brand: raw.brand,
    category: raw.category,
    description: raw.description,
    images: raw.images || [],
    costPrice: raw.cost_price || 0,
    basePrice: raw.base_price || 0,
    status: raw.status || 'active',
    tags: raw.tags || [],
    metadata: raw.metadata || {},
    variants,
    totalStock,
    platforms,
    shopifyPrice: shopifyListing?.platformPrice ?? null,
    mlPrice: mlListing?.platformPrice ?? null,
  };
}

export function useProducts(clientId: string | undefined) {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('products')
        .select(`
          *,
          product_variants (
            *,
            product_platform_listings (*)
          )
        `)
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setProducts((data || []).map(mapProduct));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const stats = {
    total: products.length,
    inShopify: products.filter((p) => p.platforms.includes('shopify')).length,
    inML: products.filter((p) => p.platforms.includes('mercadolibre')).length,
    totalStock: products.reduce((sum, p) => sum + p.totalStock, 0),
  };

  return { products, loading, error, refetch: fetchProducts, stats };
}
