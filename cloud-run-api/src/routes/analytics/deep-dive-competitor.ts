import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

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

  // Fallback: search in markdown when HTML is empty/blocked
  if (markdown) {
    const mdLower = markdown.toLowerCase();
    if (mdLower.includes('shopify') || mdLower.includes('myshopify')) {
      return { platform: 'shopify', platform_evidence: 'Shopify reference found in page content', cms_detected: 'Shopify' };
    }
    if (mdLower.includes('woocommerce') || mdLower.includes('wordpress') || mdLower.includes('wp-content')) {
      return { platform: 'woocommerce', platform_evidence: 'WooCommerce/WordPress reference in content', cms_detected: 'WooCommerce' };
    }
    if (mdLower.includes('wix.com') || mdLower.includes('wixstatic')) {
      return { platform: 'wix', platform_evidence: 'Wix reference found in content', cms_detected: 'Wix' };
    }
    if (mdLower.includes('squarespace')) {
      return { platform: 'squarespace', platform_evidence: 'Squarespace reference in content', cms_detected: 'Squarespace' };
    }
    if (mdLower.includes('magento')) {
      return { platform: 'magento', platform_evidence: 'Magento reference in content', cms_detected: 'Magento' };
    }
    if (mdLower.includes('vtex')) {
      return { platform: 'vtex', platform_evidence: 'VTEX reference in content', cms_detected: 'VTEX' };
    }
    if (mdLower.includes('tiendanube') || mdLower.includes('nuvemshop')) {
      return { platform: 'tiendanube', platform_evidence: 'Tienda Nube reference in content', cms_detected: 'Tienda Nube' };
    }
    if (mdLower.includes('jumpseller')) {
      return { platform: 'jumpseller', platform_evidence: 'Jumpseller reference in content', cms_detected: 'Jumpseller' };
    }
    if (mdLower.includes('prestashop')) {
      return { platform: 'prestashop', platform_evidence: 'PrestaShop reference in content', cms_detected: 'PrestaShop' };
    }
    if (mdLower.includes('bigcommerce')) {
      return { platform: 'bigcommerce', platform_evidence: 'BigCommerce reference in content', cms_detected: 'BigCommerce' };
    }
    if (mdLower.includes('webflow')) {
      return { platform: 'webflow', platform_evidence: 'Webflow reference in content', cms_detected: 'Webflow' };
    }
    if (mdLower.includes('bootic')) {
      return { platform: 'bootic', platform_evidence: 'Bootic reference in content', cms_detected: 'Bootic' };
    }
  }

  return { platform: 'custom', platform_evidence: 'No known platform signature found', cms_detected: null };
}

function detectTrackingScripts(html: string, markdown: string): DeepDiveResult['tracking_scripts'] {
  // Combine HTML + markdown for broader detection (markdown captures links/references when HTML is empty)
  const combined = (html + ' ' + markdown).toLowerCase();
  const other: string[] = [];

  const metaPixel = combined.includes('fbq(') || combined.includes('facebook.com/tr') || combined.includes('connect.facebook.net');
  const gtm = combined.includes('googletagmanager.com') || combined.includes('gtm.js');
  const ga = combined.includes('google-analytics.com') || combined.includes('gtag(') || combined.includes('analytics.js');
  const tiktok = combined.includes('analytics.tiktok.com') || combined.includes('ttq.load');
  const klaviyo = combined.includes('klaviyo.com') || combined.includes('_learnq');
  const hotjar = combined.includes('hotjar.com') || combined.includes('hj(');

  // Additional detections
  if (combined.includes('snap.licdn.com') || combined.includes('linkedin.com/px')) other.push('LinkedIn Pixel');
  if (combined.includes('ads.pinterest.com') || combined.includes('pintrk(')) other.push('Pinterest Tag');
  if (combined.includes('twitter.com/i/adsct') || combined.includes('twq(')) other.push('Twitter/X Pixel');
  if (combined.includes('criteo.com') || combined.includes('criteo.net')) other.push('Criteo');
  if (combined.includes('clarity.ms')) other.push('Microsoft Clarity');
  if (combined.includes('segment.com') || combined.includes('analytics.js')) other.push('Segment');
  if (combined.includes('intercom.com') || combined.includes('intercomsettings')) other.push('Intercom');
  if (combined.includes('zendesk.com')) other.push('Zendesk');

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

function extractPageMeta(html: string, markdown: string): DeepDiveResult['page_meta'] {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/is)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/is);
  const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/is)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:image"[^>]*>/is);
  const langMatch = html.match(/<html[^>]*lang="([^"]*)"[^>]*>/is);

  let title = titleMatch ? titleMatch[1].trim() : null;
  let description = descMatch ? descMatch[1].trim() : null;
  const ogImage = ogImageMatch ? ogImageMatch[1].trim() : null;
  const language = langMatch ? langMatch[1].trim() : null;

  // Fallback to markdown when HTML meta is empty
  if ((!title || !description) && markdown) {
    const lines = markdown.split('\n').filter(l => l.trim());
    if (!title) {
      // First heading (# Title) as title
      const headingMatch = markdown.match(/^#{1,2}\s+(.+)$/m);
      if (headingMatch) title = headingMatch[1].trim();
      else if (lines.length > 0) title = lines[0].trim().slice(0, 120);
    }
    if (!description) {
      // First non-heading paragraph as description
      const paragraph = lines.find(l => !l.startsWith('#') && l.length > 20);
      if (paragraph) description = paragraph.trim().slice(0, 300);
    }
  }

  return { title, description, og_image: ogImage, language };
}

/**
 * Sanitize fetched web content before injecting into AI prompts.
 * Strips common prompt-injection patterns and limits length.
 */
function sanitizeWebContentForPrompt(text: string, maxLength = 3000): string {
  if (!text) return '';
  return text
    .replace(/\b(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi, '[filtered]')
    .replace(/\b(you are now|act as|pretend to be|new instructions?:|system prompt:?)/gi, '[filtered]')
    .replace(/```[\s\S]*?```/g, '[code-block-removed]')
    .replace(/<script[\s\S]*?<\/script>/gi, '[script-removed]')
    .replace(/<style[\s\S]*?<\/style>/gi, '[style-removed]')
    .substring(0, maxLength);
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// Maximum response size: 5 MB
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/**
 * SSRF protection: validate that a URL is safe to fetch.
 * Rejects private/internal IPs, non-HTTP(S) protocols, and known metadata endpoints.
 */
function validateUrlForSSRF(urlString: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  // Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Protocol not allowed: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { safe: false, reason: 'Cloud metadata endpoint blocked' };
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '[::1]') {
    return { safe: false, reason: 'Localhost not allowed' };
  }

  // Check if hostname is an IP address and block private/internal ranges
  // IPv4 pattern
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [parseInt(ipv4Match[1]), parseInt(ipv4Match[2]), parseInt(ipv4Match[3]), parseInt(ipv4Match[4])];
    const [a, b] = octets;

    // 127.0.0.0/8 — loopback
    if (a === 127) return { safe: false, reason: 'Loopback address blocked' };
    // 10.0.0.0/8 — private
    if (a === 10) return { safe: false, reason: 'Private IP (10.x) blocked' };
    // 172.16.0.0/12 — private
    if (a === 172 && b >= 16 && b <= 31) return { safe: false, reason: 'Private IP (172.16-31.x) blocked' };
    // 192.168.0.0/16 — private
    if (a === 192 && b === 168) return { safe: false, reason: 'Private IP (192.168.x) blocked' };
    // 169.254.0.0/16 — link-local
    if (a === 169 && b === 254) return { safe: false, reason: 'Link-local address blocked' };
    // 0.0.0.0/8
    if (a === 0) return { safe: false, reason: 'Zero network blocked' };
  }

  return { safe: true };
}

async function fetchDirectHtml(url: string): Promise<string> {
  // SSRF protection: validate URL before fetching
  const validation = validateUrlForSSRF(url);
  if (!validation.safe) {
    console.warn(`[deep-dive] SSRF blocked: ${validation.reason} for URL: ${url}`);
    return '';
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[attempt % USER_AGENTS.length],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!resp.ok) {
        console.log(`[deep-dive] Direct fetch attempt ${attempt + 1} failed: HTTP ${resp.status}`);
        clearTimeout(timeout);
        if (resp.status === 403 && attempt === 0) continue; // Retry with different UA
        return '';
      }

      // Check Content-Length header before reading body
      const contentLength = resp.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        console.warn(`[deep-dive] Response too large (${contentLength} bytes), skipping`);
        clearTimeout(timeout);
        return '';
      }

      // Read body with size limit
      const reader = resp.body?.getReader();
      if (!reader) {
        clearTimeout(timeout);
        return '';
      }

      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.byteLength;
        if (totalSize > MAX_RESPONSE_SIZE) {
          console.warn(`[deep-dive] Response exceeded ${MAX_RESPONSE_SIZE} bytes, truncating`);
          reader.cancel();
          break;
        }
        chunks.push(value);
      }

      const decoder = new TextDecoder();
      const text = chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
      return text;
    } catch (err: any) {
      console.log(`[deep-dive] Direct fetch attempt ${attempt + 1} error: ${err.message}`);
      clearTimeout(timeout);
      return '';
    } finally {
      clearTimeout(timeout);
    }
  }
  return '';
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
Título: ${sanitizeWebContentForPrompt(result.page_meta.title || 'No detectado', 200)}
Descripción: ${sanitizeWebContentForPrompt(result.page_meta.description || 'No detectada', 500)}
H1: ${sanitizeWebContentForPrompt(result.irresistible_offer.h1 || 'No detectado', 200)}
Descuento: ${sanitizeWebContentForPrompt(result.irresistible_offer.discount_messaging || 'No detectado', 200)}
Productos: ${result.irresistible_offer.featured_products.length}

Contenido de la página (primeros 3000 chars):
${sanitizeWebContentForPrompt(markdown, 3000)}
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
          content: `Eres Steve, un estratega de marketing digital experto. Analizas la tienda online de un COMPETIDOR de nuestro cliente para encontrar oportunidades que NOSOTROS podamos aprovechar. Todo lo que escribas debe ser accionable para nuestro equipo, no para el competidor.

${analysisContext}

Responde SOLO con JSON válido (sin markdown, sin backticks), con esta estructura exacta:
{
  "summary": "Resumen ejecutivo de 1-2 oraciones sobre qué hace este competidor y qué podemos aprender",
  "strengths": ["Qué hace bien el competidor que deberíamos igualar o superar 1", "2", "3"],
  "weaknesses": ["Punto débil del competidor que podemos explotar a nuestro favor 1", "2"],
  "recommendations": ["Acción concreta que NOSOTROS debemos implementar para ganarle a este competidor 1", "Acción 2"],
  "digital_sophistication": "Evaluación breve del nivel digital del competidor vs lo que nosotros podríamos hacer mejor"
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
    const rawText = aiData.content?.[0]?.text || '';

    // Strip markdown code fences (```json ... ```) that Claude sometimes returns
    const cleanText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleanText);
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
    const client = await safeQuerySingleOrDefault<any>(
      supabase
        .from('clients')
        .select('id, user_id, client_user_id')
        .eq('id', client_id)
        .single(),
      null,
      'deepDiveCompetitor.getClient',
    );

    if (!client || (client.user_id !== user.id && client.client_user_id !== user.id)) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Format URL
    let url = store_url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // SSRF protection: validate URL before any fetching
    const urlValidation = validateUrlForSSRF(url);
    if (!urlValidation.safe) {
      return c.json({ error: `Invalid URL: ${urlValidation.reason}` }, 400);
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

    const apifyController = new AbortController();
    const apifyTimeout = setTimeout(() => apifyController.abort(), 60000);
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
          signal: apifyController.signal,
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
    } finally {
      clearTimeout(apifyTimeout);
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
    const trackingScripts = detectTrackingScripts(html, markdown);
    const offer = extractOffer(html, markdown);
    const pageMeta = extractPageMeta(html, markdown);

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
