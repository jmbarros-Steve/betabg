import { getProductCatalog } from './product-recommendations.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendationConfig {
  type: 'best_sellers' | 'new_arrivals' | 'complementary' | 'personalized' | 'not_purchased' | 'recently_viewed' | 'abandoned_cart' | 'all';
  count: number;
}

export interface ScoredProduct {
  id: string;
  title: string;
  handle: string;
  product_type: string;
  image_url: string;
  price: string;
  url: string;
  score: number;
}

export interface SubscriberHistory {
  purchasedProductIds: Set<string>;
  purchasedProductTypes: Set<string>;
  clickedUrls: string[];
  clickedProductHandles: Set<string>;
}

// ---------------------------------------------------------------------------
// 1. getPersonalizedRecommendations
// ---------------------------------------------------------------------------

/**
 * Get personalized product recommendations for a specific subscriber.
 * Uses purchase history, click history, and product scoring to rank products.
 *
 * For `personalized` type:
 *   - Fetches subscriber purchase & click history from email_events
 *   - Scores products by category overlap, click similarity, popularity, recency
 *   - Falls back to best_sellers if no purchase history exists
 *
 * For `not_purchased` type:
 *   - Returns products the subscriber has NOT purchased, prioritizing popular ones
 */
export async function getPersonalizedRecommendations(
  supabase: any,
  clientId: string,
  subscriberId: string,
  config: { type: 'personalized' | 'not_purchased'; count: number }
): Promise<ScoredProduct[]> {
  // Fetch product catalog and subscriber history in parallel
  const [allProducts, history] = await Promise.all([
    getProductCatalog(supabase, clientId),
    getSubscriberHistory(supabase, clientId, subscriberId),
  ]);

  if (allProducts.length === 0) {
    return [];
  }

  if (config.type === 'not_purchased') {
    return getNotPurchasedRecommendations(supabase, allProducts, history, clientId, config.count);
  }

  // personalized type
  return getPersonalizedScoredRecommendations(supabase, allProducts, history, clientId, config.count);
}

/**
 * Personalized scoring: find products in same categories as purchased,
 * exclude already-purchased, and score by relevance signals.
 * Falls back to best_sellers if subscriber has no purchase history.
 */
async function getPersonalizedScoredRecommendations(
  supabase: any,
  allProducts: any[],
  history: SubscriberHistory,
  clientId: string,
  count: number
): Promise<ScoredProduct[]> {
  // If no purchase history, fall back to best sellers
  if (history.purchasedProductIds.size === 0) {
    return getBestSellersFallback(supabase, allProducts, clientId, count);
  }

  // Get global popularity counts for the +1 popular signal
  const popularityMap = await getProductPopularity(supabase, clientId);

  // Score all products that the subscriber has NOT purchased
  const candidates = allProducts.filter(p => !history.purchasedProductIds.has(p.id));

  if (candidates.length === 0) {
    // Subscriber has purchased everything -- return newest products
    return allProducts.slice(0, count).map(p => ({ ...p, score: 0 }));
  }

  const scored = scoreProducts(candidates, history, popularityMap);

  return scored.slice(0, count);
}

/**
 * Not-purchased: return products the subscriber has NOT bought,
 * prioritized by global popularity.
 */
async function getNotPurchasedRecommendations(
  supabase: any,
  allProducts: any[],
  history: SubscriberHistory,
  clientId: string,
  count: number
): Promise<ScoredProduct[]> {
  const popularityMap = await getProductPopularity(supabase, clientId);

  const notPurchased = allProducts.filter(p => !history.purchasedProductIds.has(p.id));

  if (notPurchased.length === 0) {
    return [];
  }

  // Sort by popularity descending, break ties by price descending
  const sorted = notPurchased
    .map(p => ({ ...p, score: popularityMap.get(p.id) || 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return parseFloat(b.price) - parseFloat(a.price);
    });

  return sorted.slice(0, count);
}

/**
 * Fallback: best sellers by conversion count. Used when subscriber has no
 * purchase history for the personalized path.
 */
async function getBestSellersFallback(
  supabase: any,
  allProducts: any[],
  clientId: string,
  count: number
): Promise<ScoredProduct[]> {
  const popularityMap = await getProductPopularity(supabase, clientId);

  if (popularityMap.size > 0) {
    return allProducts
      .map(p => ({ ...p, score: popularityMap.get(p.id) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  // No conversion data at all -- return highest priced products
  return [...allProducts]
    .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    .slice(0, count)
    .map(p => ({ ...p, score: 0 }));
}

// ---------------------------------------------------------------------------
// 2. getShopifyRecommendations
// ---------------------------------------------------------------------------

/**
 * Fetch product recommendations from Shopify's Product Recommendations API.
 * Used when a subscriber has a known last-purchased product.
 *
 * Calls: GET /recommendations/products.json?product_id={id}&limit={count}
 *
 * @returns Array of recommended products in our normalized format, or [] on failure.
 */
export async function getShopifyRecommendations(
  shopDomain: string,
  accessToken: string,
  productId: string,
  count: number = 4
): Promise<any[]> {
  try {
    const response = await fetch(
      `https://${shopDomain}/recommendations/products.json?product_id=${productId}&limit=${count}`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`Shopify recommendations API returned ${response.status} for product ${productId}`);
      return [];
    }

    const data: any = await response.json();
    const products = (data.products || []).map((p: any) => ({
      id: String(p.id),
      title: p.title,
      handle: p.handle,
      product_type: p.product_type || '',
      image_url: p.images?.[0]?.src || '',
      price: p.variants?.[0]?.price || '0',
      url: `https://${shopDomain}/products/${p.handle}`,
    }));

    return products;
  } catch (err) {
    console.error('Failed to fetch Shopify product recommendations:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. scoreProducts (exported for testing / external use)
// ---------------------------------------------------------------------------

/**
 * Score a list of candidate products based on subscriber history signals.
 *
 * Scoring rules:
 *   - same_category as a purchased product:    +3
 *   - clicked_similar (handle appears in clicks): +2
 *   - popular (has global conversions):          +1
 *   - new (appears early in catalog, i.e. recently added): +1
 *
 * Products are returned sorted by score descending, with ties broken by
 * price descending (higher priced items first).
 */
export function scoreProducts(
  products: any[],
  subscriberHistory: SubscriberHistory,
  popularityMap?: Map<string, number>
): ScoredProduct[] {
  const totalProducts = products.length;

  const scored: ScoredProduct[] = products.map((product, index) => {
    let score = 0;

    // +3 if product is in same category as something the subscriber purchased
    if (product.product_type && subscriberHistory.purchasedProductTypes.has(product.product_type)) {
      score += 3;
    }

    // +2 if subscriber clicked on a link containing this product's handle
    if (product.handle && subscriberHistory.clickedProductHandles.has(product.handle)) {
      score += 2;
    }

    // +1 if product has global conversions (is popular)
    if (popularityMap && (popularityMap.get(product.id) || 0) > 0) {
      score += 1;
    }

    // +1 for "new" products: products in the first 25% of the catalog
    // (Shopify returns products sorted by created_at desc by default)
    if (index < totalProducts * 0.25) {
      score += 1;
    }

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      product_type: product.product_type,
      image_url: product.image_url,
      price: product.price,
      url: product.url,
      score,
    };
  });

  // Sort by score desc, then price desc for tie-breaking
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return parseFloat(b.price) - parseFloat(a.price);
  });

  return scored;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Retrieve a subscriber's purchase and click history from email_events.
 */
async function getSubscriberHistory(
  supabase: any,
  clientId: string,
  subscriberId: string
): Promise<SubscriberHistory> {
  // Fetch purchase events (converted) and click events in parallel
  const [purchaseResult, clickResult] = await Promise.all([
    supabase
      .from('email_events')
      .select('metadata')
      .eq('client_id', clientId)
      .eq('subscriber_id', subscriberId)
      .eq('event_type', 'converted')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('email_events')
      .select('metadata')
      .eq('client_id', clientId)
      .eq('subscriber_id', subscriberId)
      .eq('event_type', 'clicked')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const purchasedProductIds = new Set<string>();
  const purchasedProductTypes = new Set<string>();

  for (const event of purchaseResult.data || []) {
    const meta = event.metadata;
    if (meta?.product_id) {
      purchasedProductIds.add(String(meta.product_id));
    }
    if (meta?.product_type) {
      purchasedProductTypes.add(meta.product_type);
    }
  }

  const clickedUrls: string[] = [];
  const clickedProductHandles = new Set<string>();

  for (const event of clickResult.data || []) {
    const url = event.metadata?.url;
    if (url) {
      clickedUrls.push(url);
      // Extract product handle from Shopify URLs like /products/my-product-handle
      const handleMatch = url.match(/\/products\/([^?&#/]+)/);
      if (handleMatch) {
        clickedProductHandles.add(handleMatch[1]);
      }
    }
  }

  return {
    purchasedProductIds,
    purchasedProductTypes,
    clickedUrls,
    clickedProductHandles,
  };
}

/**
 * Get global product popularity (conversion counts) across all subscribers
 * for the given client. Returns a Map of productId -> conversion count.
 */
async function getProductPopularity(
  supabase: any,
  clientId: string
): Promise<Map<string, number>> {
  const { data: events } = await supabase
    .from('email_events')
    .select('metadata')
    .eq('client_id', clientId)
    .eq('event_type', 'converted')
    .limit(500);

  const counts = new Map<string, number>();
  for (const event of events || []) {
    const productId = event.metadata?.product_id;
    if (productId) {
      counts.set(String(productId), (counts.get(String(productId)) || 0) + 1);
    }
  }

  return counts;
}
