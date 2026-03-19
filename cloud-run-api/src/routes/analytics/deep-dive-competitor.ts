import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface DeepDiveResult {
  tech_stack: {
    platform: string | null; // 'shopify', 'magento', 'vtex', 'woocommerce', 'custom'
    platform_evidence: string | null;
    cms_detected: string | null;
  };
  irresistible_offer: {
    h1: string | null;
    hero_text: string | null;
    featured_products: Array<{
      name: string;
      price: string;
      compare_price?: string;
    }>;
    discount_messaging: string | null;
  };
  tracking_scripts: {
    meta_pixel: boolean;
    google_tag_manager: boolean;
    google_analytics: boolean;
    tiktok_pixel: boolean;
    klaviyo: boolean;
    hotjar: boolean;
    other: string[];
    marketing_sophistication: 'basic' | 'intermediate' | 'advanced';
  };
  page_meta: {
    title: string | null;
    description: string | null;
    og_image: string | null;
    language: string | null;
  };
}

function detectPlatform(html: string, markdown: string): DeepDiveResult['tech_stack'] {
  const htmlLower = html.toLowerCase();

  if (htmlLower.includes('myshopify.com') || htmlLower.includes('cdn.shopify.com') || htmlLower.includes('shopify.com/s/')) {
    return { platform: 'shopify', platform_evidence: 'cdn.shopify.com / myshopify.com detected', cms_detected: 'Shopify' };
  }
  if (htmlLower.includes('magento') || htmlLower.includes('mage/cookies')) {
    return { platform: 'magento', platform_evidence: 'Magento JS/cookies detected', cms_detected: 'Magento' };
  }
  if (htmlLower.includes('vtex') || htmlLower.includes('vteximg.com') || htmlLower.includes('vtexcommercestable')) {
    return { platform: 'vtex', platform_evidence: 'VTEX scripts/CDN detected', cms_detected: 'VTEX' };
  }
  if (htmlLower.includes('woocommerce') || htmlLower.includes('wc-ajax') || htmlLower.includes('wp-content')) {
    return { platform: 'woocommerce', platform_evidence: 'WooCommerce/WordPress detected', cms_detected: 'WooCommerce' };
  }
  if (htmlLower.includes('prestashop') || htmlLower.includes('prestashop.js')) {
    return { platform: 'prestashop', platform_evidence: 'PrestaShop detected', cms_detected: 'PrestaShop' };
  }
  if (htmlLower.includes('tiendanube') || htmlLower.includes('nuvemshop')) {
    return { platform: 'tiendanube', platform_evidence: 'Tienda Nube detected', cms_detected: 'Tienda Nube' };
  }
  if (htmlLower.includes('jumpseller')) {
    return { platform: 'jumpseller', platform_evidence: 'Jumpseller detected', cms_detected: 'Jumpseller' };
  }

  return { platform: 'custom', platform_evidence: 'No known platform signature found', cms_detected: null };
}

function detectTrackingScripts(html: string): DeepDiveResult['tracking_scripts'] {
  const htmlLower = html.toLowerCase();
  const other: string[] = [];

  const metaPixel = htmlLower.includes('fbq(') || htmlLower.includes('facebook.com/tr') || htmlLower.includes('connect.facebook.net');
  const gtm = htmlLower.includes('googletagmanager.com') || htmlLower.includes('gtm.js');
  const ga = htmlLower.includes('google-analytics.com') || htmlLower.includes('gtag(') || htmlLower.includes('analytics.js');
  const tiktok = htmlLower.includes('analytics.tiktok.com') || htmlLower.includes('ttq.load');
  const klaviyo = htmlLower.includes('klaviyo.com') || htmlLower.includes('_learnq');
  const hotjar = htmlLower.includes('hotjar.com') || htmlLower.includes('hj(');

  // Additional detections
  if (htmlLower.includes('snap.licdn.com') || htmlLower.includes('linkedin.com/px')) other.push('LinkedIn Pixel');
  if (htmlLower.includes('ads.pinterest.com') || htmlLower.includes('pintrk(')) other.push('Pinterest Tag');
  if (htmlLower.includes('twitter.com/i/adsct') || htmlLower.includes('twq(')) other.push('Twitter/X Pixel');
  if (htmlLower.includes('criteo.com') || htmlLower.includes('criteo.net')) other.push('Criteo');
  if (htmlLower.includes('clarity.ms')) other.push('Microsoft Clarity');
  if (htmlLower.includes('segment.com') || htmlLower.includes('analytics.js')) other.push('Segment');
  if (htmlLower.includes('intercom.com') || htmlLower.includes('intercomSettings')) other.push('Intercom');
  if (htmlLower.includes('zendesk.com')) other.push('Zendesk');

  // Calculate sophistication
  const trackerCount = [metaPixel, gtm, ga, tiktok, klaviyo, hotjar].filter(Boolean).length + other.length;
  let sophistication: 'basic' | 'intermediate' | 'advanced' = 'basic';
  if (trackerCount >= 5 || (gtm && klaviyo)) sophistication = 'advanced';
  else if (trackerCount >= 3) sophistication = 'intermediate';

  return {
    meta_pixel: metaPixel,
    google_tag_manager: gtm,
    google_analytics: ga,
    tiktok_pixel: tiktok,
    klaviyo,
    hotjar,
    other,
    marketing_sophistication: sophistication,
  };
}

function extractOffer(html: string, markdown: string): DeepDiveResult['irresistible_offer'] {
  // Extract H1
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').trim() : null;

  // Extract hero text (first large text block)
  const heroMatch = html.match(/<(?:h1|h2|p)[^>]*class="[^"]*hero[^"]*"[^>]*>(.*?)<\/(?:h1|h2|p)>/is);
  const heroText = heroMatch ? heroMatch[1].replace(/<[^>]*>/g, '').trim() : null;

  // Extract prices (look for common price patterns)
  const products: Array<{ name: string; price: string; compare_price?: string }> = [];

  // Shopify product JSON
  const productJsonMatch = html.match(/var\s+meta\s*=\s*(\{.*?"product".*?\});/s);
  if (productJsonMatch) {
    try {
      const meta = JSON.parse(productJsonMatch[1]);
      if (meta.product) {
        products.push({
          name: meta.product.type || 'Product',
          price: `$${(meta.product.variants?.[0]?.price / 100 || 0).toLocaleString()}`,
        });
      }
    } catch {}
  }

  // Generic price extraction from structured data
  const ldJsonMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis);
  for (const match of ldJsonMatches) {
    try {
      const ld = JSON.parse(match[1]);
      if (ld['@type'] === 'Product' || ld['@type']?.includes?.('Product')) {
        products.push({
          name: ld.name || 'Product',
          price: ld.offers?.price ? `$${ld.offers.price}` : (ld.offers?.lowPrice ? `$${ld.offers.lowPrice}` : 'N/A'),
          compare_price: ld.offers?.highPrice ? `$${ld.offers.highPrice}` : undefined,
        });
      }
    } catch {}
  }

  // Extract discount messaging
  const discountPatterns = [
    /(\d+%\s*(?:off|descuento|dto|de descuento))/i,
    /(envío\s*gratis|free\s*shipping)/i,
    /(compra\s*\d+.*?(?:gratis|free))/i,
    /(cuotas?\s*sin\s*interés)/i,
  ];
  let discountMessaging: string | null = null;
  for (const pattern of discountPatterns) {
    const match = markdown.match(pattern);
    if (match) {
      discountMessaging = match[1];
      break;
    }
  }

  return {
    h1,
    hero_text: heroText,
    featured_products: products.slice(0, 5),
    discount_messaging: discountMessaging,
  };
}

function extractPageMeta(html: string): DeepDiveResult['page_meta'] {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/is)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/is);
  const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/is)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:image"[^>]*>/is);
  const langMatch = html.match(/<html[^>]*lang="([^"]*)"[^>]*>/is);

  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    description: descMatch ? descMatch[1].trim() : null,
    og_image: ogImageMatch ? ogImageMatch[1].trim() : null,
    language: langMatch ? langMatch[1].trim() : null,
  };
}

export async function deepDiveCompetitor(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const apifyToken = process.env.APIFY_TOKEN;

    if (!apifyToken) {
      return c.json({ error: 'Apify not configured' }, 500);
    }

    // Auth — user is set by authMiddleware
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Missing authorization' }, 401);
    }

    const { client_id, tracking_id, store_url } = await c.req.json();

    if (!client_id || !tracking_id || !store_url) {
      return c.json({ error: 'client_id, tracking_id, and store_url required' }, 400);
    }

    // Verify ownership
    const { data: client } = await supabase
      .from('clients')
      .select('id, user_id, client_user_id')
      .eq('id', client_id)
      .single();

    if (!client || (client.user_id !== user.id && client.client_user_id !== user.id)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Format URL
    let url = store_url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    console.log(`[deep-dive] Scraping: ${url}`);

    // Scrape with Apify - get markdown content
    const scrapeResponse = await fetch(
      `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxCrawlPages: 1,
          outputFormats: ['markdown'],
        }),
      }
    );

    if (!scrapeResponse.ok) {
      const errData: any = await scrapeResponse.json();
      console.error('[deep-dive] Apify error:', errData);
      return c.json({ error: 'Failed to scrape store', details: errData.error || 'Unknown' }, 502);
    }

    const items: any = await scrapeResponse.json();
    const markdown = items?.[0]?.text || items?.[0]?.markdown || '';
    // Apify website-content-crawler returns HTML in the html field when available
    const html = items?.[0]?.html || '';

    if (!html && !markdown) {
      return c.json({ error: 'No content extracted from URL' }, 422);
    }

    console.log(`[deep-dive] Got ${html.length} chars HTML, ${markdown.length} chars markdown`);

    // Analyze
    const result: DeepDiveResult = {
      tech_stack: detectPlatform(html, markdown),
      irresistible_offer: extractOffer(html, markdown),
      tracking_scripts: detectTrackingScripts(html),
      page_meta: extractPageMeta(html),
    };

    console.log(`[deep-dive] Platform: ${result.tech_stack.platform}, Sophistication: ${result.tracking_scripts.marketing_sophistication}`);

    // Store results
    const { error: updateError } = await supabase
      .from('competitor_tracking')
      .update({
        deep_dive_data: result,
        store_url: url,
        last_deep_dive_at: new Date().toISOString(),
      })
      .eq('id', tracking_id);

    if (updateError) {
      console.error('[deep-dive] Update error:', updateError);
      return c.json({ error: 'Failed to save results', details: updateError.message }, 500);
    }

    return c.json({ success: true, data: result });

  } catch (error) {
    console.error('[deep-dive] Error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
