/**
 * Tech Stack Detector — shared platform + tracking detection.
 *
 * Extracted from `cloud-run-api/src/routes/analytics/deep-dive-competitor.ts`
 * (sesión 29/04/2026, Sofía W14) for reuse across the Competitor Intelligence
 * pipeline (web-crawl endpoint, deep-dive, scorecard generation).
 *
 * Bug fixes vs original detector (flagged by Ignacio W17):
 *   - + Bootic / OnBolder (`bolder.run`, `<meta name="author" content="Bootic">`)
 *   - + Universal Analytics legacy IDs (UA-XXXXXX) and GA4 IDs (G-XXXXXXXX)
 *
 * Returns shapes match the WebIntelligence.TechStack contract from
 * `cloud-run-api/src/lib/competitor/types.ts` while remaining backwards
 * compatible with the legacy `DeepDiveResult` shape used by deep-dive-competitor.
 *
 * Owner: Sofía W14 (Integraciones)
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface DetectedPlatform {
  platform: string | null;        // 'shopify', 'magento', 'vtex', 'woocommerce', 'bootic', 'custom', etc.
  platform_evidence: string | null;
  cms_detected: string | null;
}

export interface DetectedTrackingScripts {
  meta_pixel: boolean;
  /** Numeric pixel ID extracted from `fbq('init', NNN)` if present in HTML.   */
  meta_pixel_id?: string | null;
  google_tag_manager: boolean;
  /** GTM container ID (`GTM-XXXXXX`) — used to expand the public container.   */
  google_tag_manager_id?: string | null;
  google_analytics: boolean;
  /** First UA-* / G-* ID found.                                               */
  google_analytics_id?: string | null;
  tiktok_pixel: boolean;
  klaviyo: boolean;
  hotjar: boolean;
  other: string[];
  marketing_sophistication: 'basic' | 'intermediate' | 'advanced';
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export function detectPlatform(html: string, markdown: string): DetectedPlatform {
  const htmlLower = (html || '').toLowerCase();

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

  // Bootic / OnBolder (Chilean platform). Original detector caught `bootic.io`
  // but missed `bolder.run` (the OnBolder CDN) and the explicit author meta tag.
  if (
    htmlLower.includes('bootic.io') ||
    htmlLower.includes('bolder.run') ||
    htmlLower.includes('name="author" content="bootic"') ||
    htmlLower.includes("name='author' content='bootic'") ||
    htmlLower.includes('onbolder')
  ) {
    return {
      platform: 'bootic',
      platform_evidence: 'Bootic / OnBolder asset or author meta detected',
      cms_detected: 'Bootic',
    };
  }

  // Markdown fallback (when HTML is empty/blocked)
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
    if (mdLower.includes('bootic') || mdLower.includes('onbolder')) {
      return { platform: 'bootic', platform_evidence: 'Bootic reference in content', cms_detected: 'Bootic' };
    }
  }

  return { platform: 'custom', platform_evidence: 'No known platform signature found', cms_detected: null };
}

// ---------------------------------------------------------------------------
// Tracking scripts detection
// ---------------------------------------------------------------------------

const UA_REGEX = /UA-\d{6,10}(?:-\d{1,4})?/i;
const GA4_REGEX = /G-[A-Z0-9]{6,12}/;

export function detectTrackingScripts(html: string, markdown: string): DetectedTrackingScripts {
  const combined = ((html || '') + ' ' + (markdown || '')).toLowerCase();
  // Keep an un-lowered copy for ID extraction (G-/UA- IDs are case-sensitive in
  // the regex above). Lowercase combined is fine for substring checks.
  const combinedRaw = (html || '') + ' ' + (markdown || '');
  const other: string[] = [];

  const metaPixel =
    combined.includes('fbq(') ||
    combined.includes('facebook.com/tr') ||
    combined.includes('connect.facebook.net');
  const gtm = combined.includes('googletagmanager.com') || combined.includes('gtm.js');
  const ga =
    combined.includes('google-analytics.com') ||
    combined.includes('gtag(') ||
    combined.includes('analytics.js');

  // GA tracking ID extraction (UA legacy + GA4)
  let gaId: string | null = null;
  const ua = combinedRaw.match(UA_REGEX);
  if (ua) {
    gaId = ua[0];
  } else {
    const ga4 = combinedRaw.match(GA4_REGEX);
    if (ga4) gaId = ga4[0];
  }
  // Treat the presence of UA/GA4 IDs as positive GA detection (some sites
  // ship the ID inline without `gtag(` — common in legacy Bootic stores).
  const gaDetected = ga || !!gaId;

  // GTM container ID — used by the orchestrator to expand the public GTM JS
  // and enumerate every tag wired up inside it.
  const gtmIdMatch = combinedRaw.match(/GTM-[A-Z0-9]{4,12}/);
  const gtmId = gtmIdMatch ? gtmIdMatch[0] : null;

  // Meta pixel ID extraction — only meaningful when we observe an `fbq('init', NUM)`
  // in the page itself; otherwise GTM lookup is the canonical source.
  let metaPixelId: string | null = null;
  const fbqInitMatch = combinedRaw.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{14,17})['"]/);
  if (fbqInitMatch) metaPixelId = fbqInitMatch[1];

  const tiktok = combined.includes('analytics.tiktok.com') || combined.includes('ttq.load');
  const klaviyo = combined.includes('klaviyo.com') || combined.includes('_learnq');
  const hotjar = combined.includes('hotjar.com') || combined.includes('hj(');

  if (combined.includes('snap.licdn.com') || combined.includes('linkedin.com/px')) other.push('LinkedIn Pixel');
  if (combined.includes('ads.pinterest.com') || combined.includes('pintrk(')) other.push('Pinterest Tag');
  if (combined.includes('twitter.com/i/adsct') || combined.includes('twq(')) other.push('Twitter/X Pixel');
  if (combined.includes('criteo.com') || combined.includes('criteo.net')) other.push('Criteo');
  if (combined.includes('clarity.ms')) other.push('Microsoft Clarity');
  if (combined.includes('segment.com')) other.push('Segment');
  if (combined.includes('intercom.com') || combined.includes('intercomsettings')) other.push('Intercom');
  if (combined.includes('zendesk.com')) other.push('Zendesk');

  const trackerCount =
    [metaPixel, gtm, gaDetected, tiktok, klaviyo, hotjar].filter(Boolean).length + other.length;
  let sophistication: 'basic' | 'intermediate' | 'advanced' = 'basic';
  if (trackerCount >= 5 || (gtm && klaviyo)) sophistication = 'advanced';
  else if (trackerCount >= 3) sophistication = 'intermediate';

  return {
    meta_pixel: metaPixel,
    meta_pixel_id: metaPixelId,
    google_tag_manager: gtm,
    google_tag_manager_id: gtmId,
    google_analytics: gaDetected,
    google_analytics_id: gaId,
    tiktok_pixel: tiktok,
    klaviyo,
    hotjar,
    other,
    marketing_sophistication: sophistication,
  };
}

// ---------------------------------------------------------------------------
// Convenience: build the full TechStack shape from types.ts
// ---------------------------------------------------------------------------

export interface MappedTechStack {
  ecommerce_platform?: string;
  cms?: string;
  cdn?: string;
  reviews_provider?: string;
  email_provider?: string;
  chat_tool?: string;
  ab_testing_tool?: string;
  personalization_tool?: string;
  analytics_stack: string[];
  tracking_pixels: {
    meta_pixel: boolean;
    meta_pixel_id?: string;
    google_tag_manager: boolean;
    google_tag_manager_id?: string;
    google_analytics: boolean;
    google_analytics_id?: string;
    tiktok_pixel: boolean;
    klaviyo: boolean;
    hotjar: boolean;
    other: string[];
  };
  marketing_sophistication: 'basic' | 'intermediate' | 'advanced';
  evidence: Record<string, string>;
}

/**
 * Map raw detector outputs to the WebIntelligence.TechStack contract.
 * Exposes a single object the orchestrator can persist directly.
 */
export function buildTechStack(html: string, markdown: string): MappedTechStack {
  const platform = detectPlatform(html, markdown);
  const tracking = detectTrackingScripts(html, markdown);

  const analyticsStack: string[] = [];
  if (tracking.google_tag_manager) analyticsStack.push('Google Tag Manager');
  if (tracking.google_analytics) {
    analyticsStack.push(tracking.google_analytics_id ? `Google Analytics (${tracking.google_analytics_id})` : 'Google Analytics');
  }
  if (tracking.meta_pixel) analyticsStack.push('Meta Pixel');
  if (tracking.tiktok_pixel) analyticsStack.push('TikTok Pixel');
  if (tracking.hotjar) analyticsStack.push('Hotjar');
  if (tracking.klaviyo) analyticsStack.push('Klaviyo');

  const evidence: Record<string, string> = {};
  if (platform.platform_evidence) evidence.platform = platform.platform_evidence;
  if (tracking.google_analytics_id) evidence.google_analytics_id = tracking.google_analytics_id;

  const ecommerce_platform = platform.platform && platform.platform !== 'custom' ? platform.platform : undefined;

  return {
    ecommerce_platform,
    cms: platform.cms_detected ?? undefined,
    analytics_stack: analyticsStack,
    tracking_pixels: {
      meta_pixel: tracking.meta_pixel,
      meta_pixel_id: tracking.meta_pixel_id ?? undefined,
      google_tag_manager: tracking.google_tag_manager,
      google_tag_manager_id: tracking.google_tag_manager_id ?? undefined,
      google_analytics: tracking.google_analytics,
      google_analytics_id: tracking.google_analytics_id ?? undefined,
      tiktok_pixel: tracking.tiktok_pixel,
      klaviyo: tracking.klaviyo,
      hotjar: tracking.hotjar,
      other: tracking.other,
    },
    email_provider: tracking.klaviyo ? 'Klaviyo' : undefined,
    marketing_sophistication: tracking.marketing_sophistication,
    evidence,
  };
}

/**
 * Async enrichment: when `buildTechStack` detects a GTM container ID, fetch
 * the public GTM container body and merge any pixel IDs / tags discovered
 * inside it. This recovers pixels that GTM injects dynamically (and thus
 * never appear in the page HTML).
 *
 * Returns the original stack with `tracking_pixels.*_id` fields filled in
 * when applicable, plus extra entries appended to `other`.
 */
export async function enrichTechStackFromGtm(
  stack: MappedTechStack,
): Promise<MappedTechStack> {
  const gtmId = stack.tracking_pixels.google_tag_manager_id;
  if (!gtmId) return stack;

  // Imported lazily to avoid a circular dep with direct-fetch.ts.
  const { gtmContainerLookup, extractPixelsFromGtm } = await import('./direct-fetch.js');
  const lookup = await gtmContainerLookup(gtmId);
  if (!lookup.ok || !lookup.body) return stack;

  const ids = extractPixelsFromGtm(lookup.body);

  const enriched: MappedTechStack = {
    ...stack,
    tracking_pixels: {
      ...stack.tracking_pixels,
      meta_pixel:
        stack.tracking_pixels.meta_pixel || ids.meta_pixel.length > 0,
      meta_pixel_id:
        stack.tracking_pixels.meta_pixel_id ?? ids.meta_pixel[0] ?? undefined,
      google_analytics:
        stack.tracking_pixels.google_analytics ||
        ids.ga4.length > 0 ||
        ids.ga_universal.length > 0,
      google_analytics_id:
        stack.tracking_pixels.google_analytics_id ??
        ids.ga4[0] ??
        ids.ga_universal[0] ??
        undefined,
      tiktok_pixel:
        stack.tracking_pixels.tiktok_pixel || ids.tiktok_pixel.length > 0,
      other: [
        ...stack.tracking_pixels.other,
        ...(ids.google_ads.length > 0 ? [`Google Ads (${ids.google_ads[0]})`] : []),
      ],
    },
    evidence: {
      ...stack.evidence,
      gtm_container_size_bytes: String(lookup.bytes),
      ...(ids.meta_pixel[0] ? { gtm_meta_pixel_id: ids.meta_pixel[0] } : {}),
      ...(ids.ga4[0] ? { gtm_ga4_id: ids.ga4[0] } : {}),
      ...(ids.tiktok_pixel[0] ? { gtm_tiktok_pixel_id: ids.tiktok_pixel[0] } : {}),
      ...(ids.google_ads[0] ? { gtm_google_ads_id: ids.google_ads[0] } : {}),
    },
  };

  // Sophistication may bump up if GTM revealed extra pixels.
  if (
    enriched.tracking_pixels.meta_pixel &&
    enriched.tracking_pixels.google_analytics &&
    enriched.tracking_pixels.tiktok_pixel
  ) {
    enriched.marketing_sophistication = 'advanced';
  }

  return enriched;
}
