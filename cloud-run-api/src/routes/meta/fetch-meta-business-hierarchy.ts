import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

interface PageInfo {
  id: string;
  name: string;
  category: string | null;
  instagram_business_account?: { id: string; name?: string; username?: string };
}

interface PixelInfo {
  id: string;
  name: string;
}

interface Portfolio {
  name: string;
  business_id: string;
  business_name: string;
  ad_account_id: string;
  ad_account_name: string;
  currency: string;
  timezone: string;
  page_id: string | null;
  page_name: string | null;
  ig_account_id: string | null;
  ig_account_name: string | null;
  pixel_id: string | null;
}

interface BusinessGroup {
  business_id: string;
  business_name: string;
  portfolios: Portfolio[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function metaGet(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${META_BASE}${endpoint}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    console.error(`Meta API error on ${endpoint}:`, err);
    return null;
  }
  return res.json();
}

/** Paginate through all results for a list endpoint */
async function metaGetAll(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any[]> {
  const results: any[] = [];
  let url: string | null = null;

  // First request
  const firstUrl = new URL(`${META_BASE}${endpoint}`);
  firstUrl.searchParams.set('access_token', token);
  firstUrl.searchParams.set('limit', '200');
  for (const [k, v] of Object.entries(params)) {
    firstUrl.searchParams.set(k, v);
  }
  url = firstUrl.toString();

  while (url) {
    const res = await fetch(url);
    if (!res.ok) break;
    const data: any = await res.json();
    if (data.data) results.push(...data.data);
    url = data.paging?.next || null;
  }

  return results;
}

/**
 * Try to match ad accounts to pages by name similarity.
 * Business Manager organizes assets (ad accounts, pages, IG, pixels) at the BM level.
 * We use name matching + page-linked IG accounts to build "portfolios".
 */
function buildPortfolios(
  businessId: string,
  businessName: string,
  adAccounts: AdAccount[],
  pages: PageInfo[],
  pixels: PixelInfo[],
): Portfolio[] {
  // Only active ad accounts
  const activeAccounts = adAccounts.filter(a => a.account_status === 1);

  if (activeAccounts.length === 0) return [];

  // Build a lookup of pages by normalized name for matching
  const pagesUsed = new Set<string>();

  return activeAccounts.map(acc => {
    // Try to find a matching page by name similarity
    const accNameLower = acc.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let bestPage: PageInfo | null = null;
    let bestScore = 0;

    for (const page of pages) {
      if (pagesUsed.has(page.id)) continue;
      const pageNameLower = page.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Check various matching strategies
      let score = 0;
      if (accNameLower === pageNameLower) {
        score = 100; // Exact match
      } else if (accNameLower.includes(pageNameLower) || pageNameLower.includes(accNameLower)) {
        score = 70; // Substring match
      } else {
        // Word overlap
        const accWords = acc.name.toLowerCase().split(/\s+/);
        const pageWords = page.name.toLowerCase().split(/\s+/);
        const overlap = accWords.filter(w => pageWords.includes(w) && w.length > 2).length;
        if (overlap > 0) score = overlap * 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPage = page;
      }
    }

    // Only use the match if score is decent (>= 20)
    if (bestPage && bestScore >= 20) {
      pagesUsed.add(bestPage.id);
    } else {
      bestPage = null;
    }

    // Try to find a matching pixel by name.
    // If there's only one pixel in the business, assign it to all portfolios (most common case).
    let bestPixel: PixelInfo | undefined;
    if (pixels.length === 1) {
      bestPixel = pixels[0];
    } else if (pixels.length > 1) {
      bestPixel = pixels.find(p => {
        const pixelNameLower = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return pixelNameLower.includes(accNameLower) || accNameLower.includes(pixelNameLower);
      });
      // Fallback: if no name match, use the first pixel
      if (!bestPixel) bestPixel = pixels[0];
    }

    return {
      name: acc.name,
      business_id: businessId,
      business_name: businessName,
      ad_account_id: acc.account_id,
      ad_account_name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone_name,
      page_id: bestPage?.id || null,
      page_name: bestPage?.name || null,
      ig_account_id: bestPage?.instagram_business_account?.id || null,
      ig_account_name: bestPage?.instagram_business_account?.username || bestPage?.instagram_business_account?.name || null,
      pixel_id: bestPixel?.id || null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function fetchMetaBusinessHierarchy(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Auth
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { connection_id } = await c.req.json();
    if (!connection_id) {
      return c.json({ error: 'Missing connection_id' }, 400);
    }

    // Fetch connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`id, platform, access_token_encrypted, client_id, clients!inner(user_id, client_user_id)`)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    if (clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Decrypt token
    const { data: token, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !token) {
      return c.json({ error: 'Failed to decrypt token' }, 500);
    }

    console.log('Fetching business hierarchy...');

    // 1. Fetch all businesses (Business Managers)
    const businesses = await metaGetAll('/me/businesses', token, {
      fields: 'id,name',
    });
    console.log(`Found ${businesses.length} businesses`);

    if (businesses.length === 0) {
      // Fallback: user might have ad accounts without a BM
      const [directAccounts, directPages, directPixels] = await Promise.all([
        metaGetAll('/me/adaccounts', token, {
          fields: 'id,account_id,name,account_status,currency,timezone_name',
        }),
        metaGetAll('/me/accounts', token, {
          fields: 'id,name,category,instagram_business_account{id,name,username}',
        }),
        // Also fetch pixels for each ad account
        (async () => {
          const accs = await metaGetAll('/me/adaccounts', token, { fields: 'id' });
          const allPixels: PixelInfo[] = [];
          for (const acc of accs.slice(0, 5)) {
            const px = await metaGetAll(`/${acc.id}/adspixels`, token, { fields: 'id,name' }).catch(() => []);
            allPixels.push(...px);
          }
          // Deduplicate by id
          const seen = new Set<string>();
          return allPixels.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
        })(),
      ]);

      const personalPortfolios = buildPortfolios(
        'personal',
        'Cuenta Personal',
        directAccounts,
        directPages,
        directPixels,
      );

      return c.json({
        success: true,
        businesses: [],
        groups: personalPortfolios.length > 0
          ? [{ business_id: 'personal', business_name: 'Cuenta Personal', portfolios: personalPortfolios }]
          : [],
        all_portfolios: personalPortfolios,
      });
    }

    // 2. For each business, fetch ad accounts, pages, IG accounts, pixels
    const groups: BusinessGroup[] = [];
    const allPortfolios: Portfolio[] = [];

    for (const biz of businesses) {
      console.log(`Fetching assets for business: ${biz.name} (${biz.id})`);

      // Fetch in parallel
      const [adAccounts, pages, pixels] = await Promise.all([
        metaGetAll(`/${biz.id}/owned_ad_accounts`, token, {
          fields: 'id,account_id,name,account_status,currency,timezone_name',
        }),
        metaGetAll(`/${biz.id}/owned_pages`, token, {
          fields: 'id,name,category,instagram_business_account{id,name,username}',
        }),
        metaGetAll(`/${biz.id}/owned_pixels`, token, {
          fields: 'id,name',
        }),
      ]);

      console.log(`  Ad accounts: ${adAccounts.length}, Pages: ${pages.length}, Pixels: ${pixels.length}`);

      // Also try to fetch pages the user manages (some pages may not be "owned" but "assigned")
      const clientPages = await metaGetAll(`/${biz.id}/client_pages`, token, {
        fields: 'id,name,category,instagram_business_account{id,name,username}',
      }).catch(() => []);

      // Merge pages (deduplicate)
      const pageMap = new Map<string, PageInfo>();
      for (const p of [...pages, ...clientPages]) {
        if (!pageMap.has(p.id)) pageMap.set(p.id, p);
      }
      const allPages = Array.from(pageMap.values());

      const portfolios = buildPortfolios(biz.id, biz.name, adAccounts, allPages, pixels);

      if (portfolios.length > 0) {
        groups.push({
          business_id: biz.id,
          business_name: biz.name,
          portfolios,
        });
        allPortfolios.push(...portfolios);
      }
    }

    console.log(`Total portfolios: ${allPortfolios.length} across ${groups.length} businesses`);

    return c.json({
      success: true,
      businesses: businesses.map((b: any) => ({ id: b.id, name: b.name })),
      groups,
      all_portfolios: allPortfolios,
    });
  } catch (error) {
    console.error('Hierarchy error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
