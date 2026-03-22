import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

interface DeepDiveResult {
  tech_stack: {
    platform: string | null; // 'shopify', 'magento', 'vtex', 'woocommerce', 'custom', etc.
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
  ai_insights?: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
    digital_sophistication: string;
  } | null;
  partial?: boolean;
  html_source?: 'direct' | 'apify' | 'none';
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
  // New platforms
  if (htmlLower.includes('static.wixstatic.com') || htmlLower.includes('wix.com')) {
    return { platform: 'wix', platform_evidence: 'Wix static assets detected', cms_detected: 'Wix' };
  }
  if (htmlLower.includes('squarespace.com') || htmlLower.includes('static1.squarespace.com')) {
    return { platform: 'squarespace', platform_evidence: 'Squarespace CDN detected', cms_detected: 'Squarespace' };
  }
  if (htmlLower.includes('bigcommerce.com') || htmlLower.includes('cdn11.bigcommerce.com')) {
    return { platform: 'bigcommerce', platform_evidence: 'BigCommerce CDN detected', cms_detected: 'BigCommerce' };
  }
  if (htmlLower.includes('webflow.com') || htmlLower.includes('assets.website-files.com')) {
    return { platform: 'webflow', platform_evidence: 'Webflow assets detected', cms_detected: 'Webflow' };
  }
  if (htmlLower.includes('bootic.io')) {
    return { platform: 'bootic', platform_evidence: 'Bootic platform detected', cms_detected: 'Bootic' };
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
  if (htmlLower.includes('intercom.com') || htmlLower.includes('intercomsettings')) other.push('Intercom');
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
  const searchText = markdown || html;
  for (const pattern of discountPatterns) {
    const match = searchText.match(pattern);
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

async function fetchDirectHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.log(`[deep-dive] Direct fetch failed: HTTP ${resp.status}`);
      return '';
    }

    const text = await resp.text();
    return text;
  } catch (err: any) {
    console.log(`[deep-dive] Direct fetch error: ${err.message}`);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAIInsights(
  result: Omit<DeepDiveResult, 'ai_insights' | 'partial' | 'html_source'>,
  markdown: string,
  url: string
): Promise<DeepDiveResult['ai_insights']> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.log('[deep-dive] ANTHROPIC_API_KEY not configured, skipping AI insights');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const analysisContext = `
URL: ${url}
Plataforma: ${result.tech_stack.platform || 'No detectada'} (${result.tech_stack.platform_evidence || ''})
Tracking Scripts: Meta Pixel=${result.tracking_scripts.meta_pixel}, GTM=${result.tracking_scripts.google_tag_manager}, GA=${result.tracking_scripts.google_analytics}, TikTok=${result.tracking_scripts.tiktok_pixel}, Klaviyo=${result.tracking_scripts.klaviyo}, Hotjar=${result.tracking_scripts.hotjar}
Otros scripts: ${result.tracking_scripts.other.join(', ') || 'Ninguno'}
Nivel marketing: ${result.tracking_scripts.marketing_sophistication}
Título: ${result.page_meta.title || 'No detectado'}
Descripción: ${result.page_meta.description || 'No detectada'}
H1: ${result.irresistible_offer.h1 || 'No detectado'}
Descuento: ${result.irresistible_offer.discount_messaging || 'No detectado'}
Productos: ${result.irresistible_offer.featured_products.length}

Contenido de la página (primeros 3000 chars):
${markdown.slice(0, 3000)}
`.trim();

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Eres Steve, un analista de marketing digital experto. Analiza esta tienda online de un competidor y genera insights estratégicos en español.

${analysisContext}

Responde SOLO con JSON válido (sin markdown, sin backticks), con esta estructura exacta:
{
  "summary": "Resumen ejecutivo de 1-2 oraciones sobre la tienda",
  "strengths": ["Fortaleza 1", "Fortaleza 2", "Fortaleza 3"],
  "weaknesses": ["Debilidad 1", "Debilidad 2"],
  "recommendations": ["Recomendación 1 para superar a este competidor", "Recomendación 2"],
  "digital_sophistication": "Una evaluación breve del nivel digital (ej: 'Nivel medio-alto con buen stack de tracking pero sin personalización avanzada')"
}`
        }],
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.error(`[deep-dive] AI insights API error: ${resp.status}`);
      return null;
    }

    const aiData: any = await resp.json();
    const text = aiData.content?.[0]?.text || '';

    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || '',
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      recommendations: parsed.recommendations || [],
      digital_sophistication: parsed.digital_sophistication || '',
    };
  } catch (err: any) {
    console.error(`[deep-dive] AI insights error: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

    console.log(`[deep-dive] Starting analysis for: ${url}`);

    // === STEP 1: Direct fetch for raw HTML (fast, free) ===
    console.log(`[deep-dive] Step 1: Direct HTML fetch...`);
    const directHtml = await fetchDirectHtml(url);
    console.log(`[deep-dive] Direct fetch: ${directHtml.length} chars`);

    // === STEP 2: Apify for markdown + rendered HTML ===
    console.log(`[deep-dive] Step 2: Apify crawl (markdown + html)...`);
    let apifyHtml = '';
    let markdown = '';

    try {
      const scrapeResponse = await fetch(
        `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${encodeURIComponent(apifyToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url }],
            maxCrawlPages: 1,
            outputFormats: ['markdown', 'html'],
          }),
        }
      );

      if (scrapeResponse.ok) {
        const items: any = await scrapeResponse.json();
        markdown = items?.[0]?.text || items?.[0]?.markdown || '';
        apifyHtml = items?.[0]?.html || '';
        console.log(`[deep-dive] Apify: ${apifyHtml.length} chars HTML, ${markdown.length} chars markdown`);
      } else {
        const errData: any = await scrapeResponse.json().catch(() => ({}));
        console.error('[deep-dive] Apify error:', errData);
      }
    } catch (apifyErr: any) {
      console.error(`[deep-dive] Apify fetch error: ${apifyErr.message}`);
    }

    // === STEP 3: Choose best HTML source ===
    // Prefer direct HTML (more complete for scripts/meta tags)
    // Fallback to Apify HTML if direct failed
    let html: string;
    let htmlSource: 'direct' | 'apify' | 'none';

    if (directHtml.length > 500) {
      html = directHtml;
      htmlSource = 'direct';
    } else if (apifyHtml.length > 500) {
      html = apifyHtml;
      htmlSource = 'apify';
    } else {
      html = directHtml || apifyHtml;
      htmlSource = 'none';
    }

    console.log(`[deep-dive] Using HTML from: ${htmlSource} (${html.length} chars)`);

    if (!html && !markdown) {
      return c.json({ error: 'No content extracted from URL. The site may be blocking automated requests.' }, 422);
    }

    // === STEP 4: Analyze ===
    console.log(`[deep-dive] Step 3: Running analysis...`);

    const techStack = detectPlatform(html, markdown);
    const trackingScripts = detectTrackingScripts(html);
    const offer = extractOffer(html, markdown);
    const pageMeta = extractPageMeta(html);

    console.log(`[deep-dive] Platform: ${techStack.platform}, Sophistication: ${trackingScripts.marketing_sophistication}`);
    console.log(`[deep-dive] Meta Pixel: ${trackingScripts.meta_pixel}, GTM: ${trackingScripts.google_tag_manager}, Klaviyo: ${trackingScripts.klaviyo}`);
    console.log(`[deep-dive] Title: ${pageMeta.title?.slice(0, 60) || 'none'}`);

    // === STEP 5: AI Insights ===
    console.log(`[deep-dive] Step 4: Generating AI insights...`);
    const baseResult = {
      tech_stack: techStack,
      irresistible_offer: offer,
      tracking_scripts: trackingScripts,
      page_meta: pageMeta,
    };
    const aiInsights = await generateAIInsights(baseResult, markdown, url);
    console.log(`[deep-dive] AI insights: ${aiInsights ? 'generated' : 'skipped/failed'}`);

    // === Build final result ===
    const result: DeepDiveResult = {
      ...baseResult,
      ai_insights: aiInsights,
      partial: htmlSource === 'none',
      html_source: htmlSource,
    };

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

    console.log(`[deep-dive] Analysis complete for ${url}`);
    return c.json({ success: true, data: result });

  } catch (error) {
    console.error('[deep-dive] Error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
