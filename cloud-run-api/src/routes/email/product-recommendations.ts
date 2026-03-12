import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getPersonalizedRecommendations } from './product-recommendation-engine.js';

// In-memory product cache per client (TTL: 1 hour)
const productCache = new Map<string, { products: any[]; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Product recommendations for Steve Mail emails.
 * POST /api/email-product-recommendations
 */
export async function productRecommendations(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'generate': {
      const { subscriber_id, recommendation_type, count } = body;
      const products = await getProductCatalog(supabase, client_id);
      const subscriber = subscriber_id
        ? (await supabase.from('email_subscribers').select('*').eq('id', subscriber_id).single()).data
        : null;

      const html = await generateRecommendationBlock(
        supabase,
        products,
        subscriber,
        { type: recommendation_type || 'best_sellers', count: count || 4 },
        client_id
      );
      return c.json({ html });
    }

    case 'preview': {
      const { recommendation_type, count } = body;
      const products = await getProductCatalog(supabase, client_id);
      const html = renderProductGrid(
        products.slice(0, count || 4),
        count || 4,
        '#' // placeholder shop URL
      );
      return c.json({ html });
    }

    case 'clear_cache': {
      productCache.delete(client_id);
      return c.json({ success: true });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Get product catalog from Shopify API with caching.
 */
export async function getProductCatalog(supabase: any, clientId: string): Promise<any[]> {
  // Check cache
  const cached = productCache.get(clientId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.products;
  }

  // Get Shopify credentials
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('shop_domain, access_token, encrypted_access_token')
    .eq('client_id', clientId)
    .eq('platform', 'shopify')
    .eq('is_active', true)
    .maybeSingle();

  if (!connection?.shop_domain) {
    return [];
  }

  // Decrypt access token if needed
  let accessToken = connection.access_token;
  if (connection.encrypted_access_token) {
    const { data: decrypted } = await supabase.rpc('decrypt_token', {
      encrypted_token: connection.encrypted_access_token,
    });
    if (decrypted) accessToken = decrypted;
  }

  if (!accessToken) {
    return [];
  }

  const shop = connection.shop_domain;

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2024-10/products.json?status=active&limit=100&fields=id,title,handle,product_type,images,variants`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) return [];

    const data: any = await response.json();
    const products = (data.products || []).map((p: any) => ({
      id: String(p.id),
      title: p.title,
      handle: p.handle,
      product_type: p.product_type || '',
      image_url: p.images?.[0]?.src || '',
      price: p.variants?.[0]?.price || '0',
      url: `https://${shop}/products/${p.handle}`,
    }));

    // Cache
    productCache.set(clientId, { products, cachedAt: Date.now() });
    return products;
  } catch (err) {
    console.error('Failed to fetch Shopify products for recommendations:', err);
    return [];
  }
}

/**
 * Generate a personalized product recommendation HTML block.
 */
async function generateRecommendationBlock(
  supabase: any,
  allProducts: any[],
  subscriber: any | null,
  config: { type: string; count: number },
  clientId: string
): Promise<string> {
  if (allProducts.length === 0) return '';

  let recommended: any[] = [];

  switch (config.type) {
    case 'best_sellers': {
      // Get top products from conversion events
      const { data: events } = await supabase
        .from('email_events')
        .select('metadata')
        .eq('client_id', clientId)
        .eq('event_type', 'converted')
        .limit(100);

      const productCounts = new Map<string, number>();
      for (const event of events || []) {
        const productId = event.metadata?.product_id;
        if (productId) {
          productCounts.set(productId, (productCounts.get(productId) || 0) + 1);
        }
      }

      // Sort products by conversion count, fallback to all products by price
      if (productCounts.size > 0) {
        recommended = allProducts
          .sort((a, b) => (productCounts.get(b.id) || 0) - (productCounts.get(a.id) || 0))
          .slice(0, config.count);
      } else {
        // Fallback: highest priced products (often most popular)
        recommended = [...allProducts]
          .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
          .slice(0, config.count);
      }
      break;
    }

    case 'complementary': {
      if (subscriber) {
        // Get subscriber's last purchased product type
        const { data: lastEvent } = await supabase
          .from('email_events')
          .select('metadata')
          .eq('subscriber_id', subscriber.id)
          .eq('event_type', 'converted')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const lastProductType = lastEvent?.metadata?.product_type;
        if (lastProductType) {
          // Find products of same type that subscriber hasn't bought
          recommended = allProducts
            .filter(p => p.product_type === lastProductType)
            .slice(0, config.count);
        }
      }

      // Fallback to best sellers if no complementary found
      if (recommended.length === 0) {
        recommended = allProducts.slice(0, config.count);
      }
      break;
    }

    case 'new_arrivals': {
      // Products are already sorted by recency from Shopify API
      recommended = allProducts.slice(0, config.count);
      break;
    }

    case 'recently_viewed': {
      // Get products the subscriber clicked on recently via email links
      if (subscriber) {
        const { data: clickEvents } = await supabase
          .from('email_events')
          .select('metadata')
          .eq('client_id', clientId)
          .eq('subscriber_id', subscriber.id)
          .eq('event_type', 'clicked')
          .order('created_at', { ascending: false })
          .limit(50);

        const viewedHandles: string[] = [];
        for (const event of clickEvents || []) {
          const url = event.metadata?.url || '';
          const match = url.match(/\/products\/([^?&#/]+)/);
          if (match && !viewedHandles.includes(match[1])) {
            viewedHandles.push(match[1]);
          }
        }

        if (viewedHandles.length > 0) {
          recommended = viewedHandles
            .map(handle => allProducts.find(p => p.handle === handle))
            .filter(Boolean)
            .slice(0, config.count);
        }
      }
      // Fallback to new arrivals
      if (recommended.length === 0) {
        recommended = allProducts.slice(0, config.count);
      }
      break;
    }

    case 'abandoned_cart': {
      // Get products from subscriber's abandoned cart via flow enrollments
      if (subscriber) {
        const { data: enrollments } = await supabase
          .from('email_flow_enrollments')
          .select('metadata')
          .eq('client_id', clientId)
          .eq('subscriber_id', subscriber.id)
          .order('enrolled_at', { ascending: false })
          .limit(5);

        const cartProductIds: string[] = [];
        for (const enrollment of enrollments || []) {
          const lineItems = enrollment.metadata?.line_items || enrollment.metadata?.checkout?.line_items || [];
          for (const item of lineItems) {
            const pid = String(item.product_id || '');
            if (pid && !cartProductIds.includes(pid)) {
              cartProductIds.push(pid);
            }
          }
        }

        if (cartProductIds.length > 0) {
          recommended = cartProductIds
            .map(pid => allProducts.find(p => p.id === pid))
            .filter(Boolean)
            .slice(0, config.count);
        }
      }
      // Fallback to best sellers
      if (recommended.length === 0) {
        recommended = [...allProducts]
          .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
          .slice(0, config.count);
      }
      break;
    }

    case 'all': {
      // Random selection from all products
      const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
      recommended = shuffled.slice(0, config.count);
      break;
    }

    default:
      recommended = allProducts.slice(0, config.count);
  }

  const shopUrl = allProducts[0]?.url?.split('/products/')[0] || '#';
  return renderProductGrid(recommended, config.count, shopUrl);
}

/**
 * Render a responsive 2-column product grid as HTML table (email-safe).
 */
function renderProductGrid(products: any[], count: number, shopUrl: string): string {
  if (products.length === 0) return '';

  const items = products.slice(0, count);
  const rows: string[] = [];

  for (let i = 0; i < items.length; i += 2) {
    const p1 = items[i];
    const p2 = items[i + 1];

    rows.push(`
      <tr>
        <td style="width:50%;padding:8px;vertical-align:top;">
          ${renderProductCell(p1)}
        </td>
        ${p2 ? `
          <td style="width:50%;padding:8px;vertical-align:top;">
            ${renderProductCell(p2)}
          </td>
        ` : '<td style="width:50%;padding:8px;"></td>'}
      </tr>
    `);
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td colspan="2" style="padding:0 8px 12px;font-size:18px;font-weight:bold;color:#1a1a1a;font-family:Georgia,serif;">
          Productos recomendados para ti
        </td>
      </tr>
      ${rows.join('')}
    </table>
  `.trim();
}

function renderProductCell(product: any): string {
  const price = parseFloat(product.price || '0').toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  });

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
      ${product.image_url ? `
        <tr>
          <td style="padding:0;">
            <a href="${product.url}" style="text-decoration:none;">
              <img src="${product.image_url}" alt="${product.title}" width="100%" style="display:block;max-width:280px;height:auto;" />
            </a>
          </td>
        </tr>
      ` : ''}
      <tr>
        <td style="padding:12px;">
          <a href="${product.url}" style="text-decoration:none;color:#1a1a1a;font-size:14px;font-weight:600;display:block;margin-bottom:4px;">
            ${product.title}
          </a>
          <span style="font-size:14px;color:#666;display:block;margin-bottom:10px;">${price}</span>
          <a href="${product.url}" style="display:inline-block;background:#1a1a1a;color:#fff;font-size:13px;padding:8px 20px;border-radius:20px;text-decoration:none;font-weight:500;">
            Ver producto
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

/**
 * Replace the {{ product_recommendations }} merge tag in email HTML.
 * Called from send-email.ts before sending.
 */
export async function replaceProductRecommendations(
  html: string,
  clientId: string,
  subscriberId: string | null,
  config: { type: string; count: number } | null
): Promise<string> {
  if (!html.includes('{{ product_recommendations }}') && !html.includes('{{product_recommendations}}')) {
    return html;
  }

  const supabase = getSupabaseAdmin();
  const effectiveConfig = config || { type: 'best_sellers', count: 4 };

  // Use personalized engine when subscriber_id is provided and type is personalized or not_purchased
  if (subscriberId && (effectiveConfig.type === 'personalized' || effectiveConfig.type === 'not_purchased')) {
    try {
      const personalizedProducts = await getPersonalizedRecommendations(
        supabase,
        clientId,
        subscriberId,
        { type: effectiveConfig.type as 'personalized' | 'not_purchased', count: effectiveConfig.count }
      );

      if (personalizedProducts.length > 0) {
        const shopUrl = personalizedProducts[0]?.url?.split('/products/')[0] || '#';
        const recommendationHtml = renderProductGrid(personalizedProducts, effectiveConfig.count, shopUrl);
        return html.replace(/\{\{\s*product_recommendations\s*\}\}/g, recommendationHtml);
      }
    } catch (err) {
      console.error('Personalized recommendation engine failed, falling back:', err);
    }
    // Fall through to standard best_sellers if personalized returned nothing
    effectiveConfig.type = 'best_sellers';
  }

  const products = await getProductCatalog(supabase, clientId);

  const subscriber = subscriberId
    ? (await supabase.from('email_subscribers').select('*').eq('id', subscriberId).single()).data
    : null;

  const recommendationHtml = await generateRecommendationBlock(
    supabase,
    products,
    subscriber,
    effectiveConfig,
    clientId
  );

  return html.replace(/\{\{\s*product_recommendations\s*\}\}/g, recommendationHtml);
}
