/**
 * Steve Investigator — Background research for prospect intelligence.
 *
 * Runs fire & forget AFTER the response is sent.
 * Enriches investigation_data for the NEXT conversation turn.
 *
 * Investigations:
 * 1. Store scraping (if URL available but no store data)
 * 2. Competitor ads lookup (if industry mentioned)
 * 3. Instagram check (if IG handle detected)
 */

import { getSupabaseAdmin } from './supabase.js';
import { safeQueryOrDefault, safeQuerySingleOrDefault } from './safe-supabase.js';
import type { ProspectRecord } from './steve-wa-brain.js';

/** Escape SQL wildcards to prevent injection via ilike */
function escapeSqlWildcards(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Investigate prospect background — fire & forget.
 * Only investigates what's missing to avoid redundant API calls.
 */
export async function investigateProspectBackground(
  prospect: ProspectRecord,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  lastMessage: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!prospect.id) return;

  // Load current investigation data
  const freshProspect = await safeQuerySingleOrDefault<{ investigation_data: any; audit_data: any }>(
    supabase
      .from('wa_prospects')
      .select('investigation_data, audit_data')
      .eq('id', prospect.id)
      .maybeSingle(),
    null,
    'steveInvestigator.loadFreshProspect',
  );

  const currentInv = freshProspect?.investigation_data || {};
  const updates: Record<string, any> = { ...currentInv };
  let changed = false;

  try {
    // ============================================================
    // 1. STORE SCRAPING — if has URL but no store products
    // ============================================================
    if (!currentInv.store?.product_images?.length) {
      // Check if we have a URL from audit_data or from conversation
      const storeUrl = freshProspect?.audit_data?.url || extractUrl(lastMessage) || extractUrlFromHistory(history);

      if (storeUrl && APIFY_TOKEN) {
        try {
          // Fix R6-#29: normalizar URL antes de scrapear (evita double-protocol)
          const storeData = await scrapeStoreProducts(normalizeUrl(storeUrl), APIFY_TOKEN);
          if (storeData) {
            updates.store = {
              ...currentInv.store,
              ...storeData,
              scraped_at: new Date().toISOString(),
            };
            changed = true;
            console.log(`[steve-investigator] Store scraped for ${prospect.phone}: ${storeData.product_images?.length || 0} products`);
          }
        } catch (err) {
          console.error('[steve-investigator] Store scrape error:', err);
        }
      }
    }

    // ============================================================
    // 2. COMPETITOR ADS — if industry known but no competitor data
    // ============================================================
    if (!currentInv.competitor_ads?.length && prospect.what_they_sell) {
      try {
        const competitorAds = await findCompetitorAds(prospect.what_they_sell);
        if (competitorAds.length > 0) {
          updates.competitor_ads = competitorAds;
          changed = true;
          console.log(`[steve-investigator] Found ${competitorAds.length} competitor ads for ${prospect.phone}`);
        }
      } catch (err) {
        console.error('[steve-investigator] Competitor ads error:', err);
      }
    }

    // ============================================================
    // 3. INSTAGRAM CHECK — if IG handle detected in conversation
    // ============================================================
    if (!currentInv.social && APIFY_TOKEN) {
      const igHandle = extractInstagramHandle(lastMessage) || extractIgFromHistory(history);
      if (igHandle) {
        try {
          const socialData = await scrapeInstagram(igHandle, APIFY_TOKEN);
          if (socialData) {
            updates.social = {
              handle: igHandle,
              ...socialData,
              scraped_at: new Date().toISOString(),
            };
            changed = true;
            console.log(`[steve-investigator] IG scraped for ${prospect.phone}: @${igHandle}`);
          }
        } catch (err) {
          console.error('[steve-investigator] IG scrape error:', err);
        }
      }
    }

    // ============================================================
    // 4. EXTRACT COMPETITOR NAMES from recent messages (Haiku)
    // ============================================================
    if (!currentInv.competitor_ads?.length && ANTHROPIC_API_KEY && !prospect.what_they_sell) {
      // Try to extract industry/competitors from conversation
      const recentMsgs = history.filter(m => m.role === 'user').slice(-3).map(m => m.content).join('\n');
      if (recentMsgs.length > 20) {
        try {
          const extracted = await extractIndustryFromConversation(recentMsgs, ANTHROPIC_API_KEY);
          if (extracted) {
            // Don't save to prospect fields (that's extractProspectInfo's job)
            // But use it to find competitor ads
            const ads = await findCompetitorAds(extracted);
            if (ads.length > 0) {
              updates.competitor_ads = ads;
              updates.detected_industry = extracted;
              changed = true;
            }
          }
        } catch (err) {
          console.error('[steve-investigator] Industry extraction error:', err);
        }
      }
    }

    // Save updates
    if (changed) {
      await supabase
        .from('wa_prospects')
        .update({
          investigation_data: updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);
    }
  } catch (err) {
    console.error('[steve-investigator] Fatal error:', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers — URL normalization
// ---------------------------------------------------------------------------

/**
 * Fix R6-#29: eliminar double-protocol si existe y asegurar https:// prefix
 */
function normalizeUrl(url: string): string {
  if (!url) return url;
  // Fix R6-#29: eliminar double-protocol si existe
  url = url.replace(/^https?:\/\/https?:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.trim().replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Store scraping with Apify
// ---------------------------------------------------------------------------

async function scrapeStoreProducts(
  url: string,
  apifyToken: string,
): Promise<{
  product_images: string[];
  brand_colors: string;
  price_range: string;
  top_products: Array<{ name: string; price?: string; description?: string }>;
  brand_style: string;
  category_summary: string;
} | null> {
  // Launch Apify website-content-crawler (lightweight)
  const runRes = await fetch('https://api.apify.com/v2/acts/apify~website-content-crawler/runs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apifyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startUrls: [{ url }],
      maxCrawlPages: 5,
      maxCrawlDepth: 1,
      crawlerType: 'cheerio',
    }),
  });

  if (!runRes.ok) return null;

  const runData: any = await runRes.json();
  const runId = runData.data?.id;
  if (!runId) return null;

  // Wait for completion (max 45s)
  let attempts = 0;
  let status = 'RUNNING';
  while (status === 'RUNNING' && attempts < 9) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${apifyToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const statusData: any = await statusRes.json();
    status = statusData.data?.status || 'FAILED';
    attempts++;
  }

  if (status !== 'SUCCEEDED') return null;

  // Get results
  const datasetId = runData.data?.defaultDatasetId;
  const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?limit=5`, {
    headers: { 'Authorization': `Bearer ${apifyToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const items = (await itemsRes.json()) as any[];
  if (!items?.length) return null;

  // Extract product data from HTML/text
  const allText = items.map((i: any) => (i.text || '')).join('\n');
  const allHtml = items.map((i: any) => (i.html || '')).join('\n');

  // Extract images (product image patterns)
  const imgRegex = /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"']*)?/gi;
  const images = [...new Set(allHtml.match(imgRegex) || [])].slice(0, 10);

  // Extract prices with their context (product name + price pairs)
  const priceRegex = /\$[\d.,]+/g;
  const allPrices = (allText.match(priceRegex) || []).map(p => parseInt(p.replace(/[$.,]/g, ''), 10)).filter(p => p > 0);
  const priceRange = allPrices.length >= 2
    ? `$${Math.min(...allPrices).toLocaleString()} - $${Math.max(...allPrices).toLocaleString()}`
    : allPrices.length === 1 ? `~$${allPrices[0].toLocaleString()}` : '';

  // Extract product names with prices (Cambio 5: rich product data)
  const topProducts: Array<{ name: string; price?: string; description?: string }> = [];
  for (const item of items) {
    if (!item.title) continue;
    // Try to find a price near the title in the text
    const titleLower = (item.title || '').toLowerCase();
    const itemText = (item.text || '');
    const priceMatch = itemText.match(/\$[\d.,]+/);
    const descMatch = itemText.slice(0, 200).replace(item.title || '', '').trim();

    topProducts.push({
      name: item.title,
      price: priceMatch?.[0] || undefined,
      description: descMatch.length > 10 ? descMatch.slice(0, 100) : undefined,
    });

    if (topProducts.length >= 5) break;
  }

  // Extract brand colors (basic heuristic from CSS)
  const colorRegex = /#[0-9a-fA-F]{6}/g;
  const colors = [...new Set(allHtml.match(colorRegex) || [])].slice(0, 3);

  // Infer brand style from colors and layout (Cambio 5)
  let brandStyle = '';
  if (colors.length > 0) {
    const darkColors = colors.filter(c => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return (r + g + b) / 3 < 128;
    });
    brandStyle = darkColors.length > colors.length / 2 ? 'oscuro, minimalista' : 'claro, moderno';
  }

  // Infer category from titles and text (Cambio 5)
  const combinedText = (topProducts.map(p => p.name).join(' ') + ' ' + allText.slice(0, 500)).toLowerCase();
  let categorySummary = '';
  const categoryMap: Record<string, string[]> = {
    'tienda de moda/ropa': ['vestido', 'polera', 'camisa', 'pantalón', 'jeans', 'blusa', 'falda', 'ropa'],
    'tienda de zapatos/calzado': ['zapato', 'zapatilla', 'botín', 'sandalia', 'bota', 'calzado'],
    'tienda de cosmética/belleza': ['crema', 'sérum', 'maquillaje', 'labial', 'skincare', 'belleza'],
    'tienda de alimentos/gourmet': ['café', 'chocolate', 'vino', 'aceite', 'gourmet', 'orgánico'],
    'tienda de deportes': ['fitness', 'gym', 'deporte', 'running', 'yoga', 'entrenamiento'],
    'tienda de joyería/accesorios': ['anillo', 'collar', 'pulsera', 'aros', 'joya', 'plata'],
    'tienda de hogar/decoración': ['cojín', 'lámpara', 'decoración', 'mueble', 'hogar'],
    'tienda de mascotas': ['perro', 'gato', 'mascota', 'alimento', 'correa'],
    'tienda de tecnología': ['auricular', 'cargador', 'case', 'funda', 'tech'],
  };
  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => combinedText.includes(k))) {
      categorySummary = category;
      break;
    }
  }
  if (!categorySummary) categorySummary = 'tienda de e-commerce';

  return {
    product_images: images,
    brand_colors: colors.join(', ') || '',
    price_range: priceRange,
    top_products: topProducts,
    brand_style: brandStyle,
    category_summary: categorySummary,
  };
}

// ---------------------------------------------------------------------------
// Competitor ads from DB
// ---------------------------------------------------------------------------

async function findCompetitorAds(industry: string): Promise<Array<{ headline: string; ad_text: string; impressions: number }>> {
  const supabase = getSupabaseAdmin();
  const keywords = industry.toLowerCase().split(/[\s,;]+/).filter(w => w.length >= 3);
  if (keywords.length === 0) return [];

  // Search competitor_ads by industry keyword in ad_text
  const ads = await safeQueryOrDefault<{ ad_headline: string | null; ad_text: string | null; impressions_lower: number | null }>(
    supabase
      .from('competitor_ads')
      .select('ad_headline, ad_text, impressions_lower')
      .ilike('ad_text', `%${escapeSqlWildcards(keywords[0])}%`)
      .order('impressions_lower', { ascending: false })
      .limit(5),
    [],
    'steveInvestigator.findCompetitorAds',
  );

  if (!ads.length) return [];

  return ads.map((ad: any) => ({
    headline: ad.ad_headline || '',
    ad_text: (ad.ad_text || '').slice(0, 100),
    impressions: ad.impressions_lower || 0,
  }));
}

// ---------------------------------------------------------------------------
// Instagram scraping with Apify
// ---------------------------------------------------------------------------

async function scrapeInstagram(
  handle: string,
  apifyToken: string,
): Promise<{ followers: number; posts: number; engagement_rate: string } | null> {
  try {
    const runRes = await fetch('https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernames: [handle.replace('@', '')],
      }),
    });

    if (!runRes.ok) return null;

    const runData: any = await runRes.json();
    const runId = runData.data?.id;
    if (!runId) return null;

    // Wait (max 30s)
    let attempts = 0;
    let status = 'RUNNING';
    while (status === 'RUNNING' && attempts < 6) {
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: { 'Authorization': `Bearer ${apifyToken}` },
        signal: AbortSignal.timeout(10000),
      });
      const statusData: any = await statusRes.json();
      status = statusData.data?.status || 'FAILED';
      attempts++;
    }

    if (status !== 'SUCCEEDED') return null;

    const datasetId = runData.data?.defaultDatasetId;
    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?limit=1`, {
      headers: { 'Authorization': `Bearer ${apifyToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const items = (await itemsRes.json()) as any[];

    if (!items?.length) return null;

    const profile = items[0];
    const followers = profile.followersCount || profile.followers || 0;
    const posts = profile.postsCount || profile.posts || 0;
    const engagement = followers > 0 && profile.avgLikes
      ? `${((profile.avgLikes / followers) * 100).toFixed(1)}%`
      : 'N/A';

    return { followers, posts, engagement_rate: engagement };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function extractUrlFromHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>): string | null {
  for (const msg of [...history].reverse()) {
    if (msg.role === 'user') {
      const url = extractUrl(msg.content);
      if (url) return url;
    }
  }
  return null;
}

const IG_BLOCKLIST = new Set([
  'gmail', 'hotmail', 'yahoo', 'outlook', 'support', 'help', 'admin',
  'info', 'contacto', 'ventas', 'soporte', 'correo', 'mail', 'email',
]);

function extractInstagramHandle(text: string): string | null {
  // Match instagram.com/handle or @handle not preceded by a dot (email pattern)
  const urlMatch = text.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/);
  const atMatch = text.match(/(?<!\.)@([a-zA-Z0-9._]{2,30})/);
  const handle = urlMatch?.[1] || atMatch?.[1] || null;
  if (!handle) return null;
  // Reject handles that look like email prefixes or common non-IG @mentions
  if (IG_BLOCKLIST.has(handle.toLowerCase())) return null;
  return handle;
}

function extractIgFromHistory(history: Array<{ role: 'user' | 'assistant'; content: string }>): string | null {
  for (const msg of [...history].reverse()) {
    if (msg.role === 'user') {
      const handle = extractInstagramHandle(msg.content);
      if (handle) return handle;
    }
  }
  return null;
}

async function extractIndustryFromConversation(recentMessages: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `De estos mensajes de un prospecto, extrae qué industria/producto vende. Responde SOLO con la industria en 1-3 palabras (ej: "ropa deportiva", "cosmética", "zapatos"). Si no se puede determinar, responde "unknown".\n\nMensajes:\n${recentMessages}`,
        }],
      }),
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    const text = (data.content?.[0]?.text || '').trim().toLowerCase();
    return text !== 'unknown' && text.length > 2 ? text : null;
  } catch {
    return null;
  }
}
