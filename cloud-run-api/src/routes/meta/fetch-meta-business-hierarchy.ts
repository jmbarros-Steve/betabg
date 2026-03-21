import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { canRequest, recordSuccess, recordFailure } from '../../lib/circuit-breaker.js';

const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const CIRCUIT_SERVICE = 'meta-graph-api';

// ---------------------------------------------------------------------------
// In-memory cache (5 min TTL) — avoids hammering Meta Graph API on every
// dashboard load. Cache is per connection_id.
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000;
const hierarchyCache = new Map<string, { data: any; ts: number }>();

function getCached(connectionId: string): any | null {
  const entry = hierarchyCache.get(connectionId);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data;
  }
  if (entry) hierarchyCache.delete(connectionId);
  return null;
}

function setCache(connectionId: string, data: any): void {
  hierarchyCache.set(connectionId, { data, ts: Date.now() });
  // Evict old entries to prevent memory leak (keep max 100)
  if (hierarchyCache.size > 100) {
    const oldest = hierarchyCache.keys().next().value;
    if (oldest) hierarchyCache.delete(oldest);
  }
}

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

interface PageSummary {
  id: string;
  name: string;
  ig_account_id: string | null;
  ig_account_name: string | null;
}

interface BusinessGroup {
  business_id: string;
  business_name: string;
  portfolios: Portfolio[];
  pages: PageSummary[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function metaGet(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any> {
  if (!canRequest(CIRCUIT_SERVICE)) {
    console.warn(`[hierarchy] Circuit open, skipping ${endpoint}`);
    return null;
  }
  const url = new URL(`${META_BASE}${endpoint}`);

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    const errCode = err?.error?.code;
    if (errCode === 4 || errCode === 80004 || errCode === 32 || res.status === 429 || res.status >= 500) {
      recordFailure(CIRCUIT_SERVICE, `${endpoint}: code ${errCode}, HTTP ${res.status}`);
    }
    console.error(`Meta API error on ${endpoint}:`, err);
    return null;
  }
  recordSuccess(CIRCUIT_SERVICE);
  return res.json();
}

/** Paginate through all results for a list endpoint */
async function metaGetAll(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any[]> {
  if (!canRequest(CIRCUIT_SERVICE)) {
    console.warn(`[hierarchy] Circuit open, skipping ${endpoint}`);
    return [];
  }
  const results: any[] = [];
  let url: string | null = null;

  // First request
  const firstUrl = new URL(`${META_BASE}${endpoint}`);

  firstUrl.searchParams.set('limit', '200');
  for (const [k, v] of Object.entries(params)) {
    firstUrl.searchParams.set(k, v);
  }
  url = firstUrl.toString();

  while (url) {
    if (!canRequest(CIRCUIT_SERVICE)) break;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      const errCode = err?.error?.code;
      if (errCode === 4 || errCode === 80004 || errCode === 32 || res.status === 429 || res.status >= 500) {
        recordFailure(CIRCUIT_SERVICE, `${endpoint}: code ${errCode}, HTTP ${res.status}`);
      }
      break;
    }
    recordSuccess(CIRCUIT_SERVICE);
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

  // SIMPLE CASE: If there's only 1 page, assign it to ALL ad accounts.
  // Most small businesses (e.g. Jardín de Eva) have 1 page + 1 ad account.
  // Name matching is unreliable because ad account names can be IDs or random strings.
  if (pages.length === 1) {
    const thePage = pages[0];
    console.log(`[hierarchy] Only 1 page found ("${thePage.name}") — assigning to all ${activeAccounts.length} ad accounts`);

    let bestPixel: PixelInfo | undefined = pixels[0];

    return activeAccounts.map(acc => ({
      name: acc.name,
      business_id: businessId,
      business_name: businessName,
      ad_account_id: acc.account_id,
      ad_account_name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone_name,
      page_id: thePage.id,
      page_name: thePage.name,
      ig_account_id: thePage.instagram_business_account?.id || null,
      ig_account_name: thePage.instagram_business_account?.username || thePage.instagram_business_account?.name || null,
      pixel_id: bestPixel?.id || null,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // MULTI-PAGE: Try name matching, then fallback for unmatched accounts
  const pagesUsed = new Set<string>();

  const portfolios = activeAccounts.map(acc => {
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
  });

  // FALLBACK: Assign remaining pages to accounts that have no page
  // This catches cases where name matching completely failed
  const unusedPages = pages.filter(p => !pagesUsed.has(p.id));
  if (unusedPages.length > 0) {
    const accountsWithoutPage = portfolios.filter(p => !p.page_id);
    if (accountsWithoutPage.length > 0) {
      console.log(`[hierarchy] ${accountsWithoutPage.length} accounts without page, ${unusedPages.length} unused pages — assigning fallback`);
      for (let i = 0; i < accountsWithoutPage.length && i < unusedPages.length; i++) {
        const page = unusedPages[i];
        accountsWithoutPage[i].page_id = page.id;
        accountsWithoutPage[i].page_name = page.name;
        accountsWithoutPage[i].ig_account_id = page.instagram_business_account?.id || null;
        accountsWithoutPage[i].ig_account_name = page.instagram_business_account?.username || page.instagram_business_account?.name || null;
        console.log(`[hierarchy] Fallback: "${accountsWithoutPage[i].ad_account_name}" → page "${page.name}"`);
      }
    }
  }

  return portfolios.sort((a, b) => a.name.localeCompare(b.name));
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

    const { connection_id, force_refresh } = await c.req.json();
    if (!connection_id) {
      return c.json({ error: 'Missing connection_id' }, 400);
    }

    // Return cached data if available (< 5 min old)
    if (!force_refresh) {
      const cached = getCached(connection_id);
      if (cached) {
        console.log(`[hierarchy] Cache hit for ${connection_id}`);
        return c.json(cached);
      }
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

    // Verify ownership (admin can access any connection)
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin'])
      .limit(1)
      .maybeSingle();
    const isAdmin = !!roleData;
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    if (!isAdmin && !isOwner) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    // Decrypt token
    if (!connection.access_token_encrypted) {
      console.error('[fetch-meta-business-hierarchy] No encrypted token for connection:', connection.id);
      return c.json({ error: 'No encrypted token found for this connection' }, 500);
    }
    const { data: token, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !token) {
      console.error('[fetch-meta-business-hierarchy] decrypt_platform_token failed:', decryptError?.message, decryptError?.code);
      return c.json({ error: 'Failed to decrypt token' }, 500);
    }

    // Circuit breaker check — don't call Meta if circuit is open
    if (!canRequest(CIRCUIT_SERVICE)) {
      return c.json({ error: 'Meta API temporarily unavailable (rate limited). Try again in 1 minute.' }, 503);
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
            const px = await metaGetAll(`/${acc.id}/adspixels`, token, { fields: 'id,name' }).catch(e => { console.warn(`[hierarchy] Pixel fetch failed for ${acc.id}:`, e.message); return []; });
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

      const personalPages: PageSummary[] = directPages.map(p => ({
        id: p.id,
        name: p.name,
        ig_account_id: p.instagram_business_account?.id || null,
        ig_account_name: p.instagram_business_account?.username || p.instagram_business_account?.name || null,
      }));

      const personalResult = {
        success: true,
        businesses: [],
        groups: personalPortfolios.length > 0
          ? [{ business_id: 'personal', business_name: 'Cuenta Personal', portfolios: personalPortfolios, pages: personalPages }]
          : [],
        all_portfolios: personalPortfolios,
      };
      setCache(connection_id, personalResult);
      return c.json(personalResult);
    }

    // 2. For each business, fetch ad accounts, pages, IG accounts, pixels
    const groups: BusinessGroup[] = [];
    const allPortfolios: Portfolio[] = [];

    for (const biz of businesses) {
      console.log(`Fetching assets for business: ${biz.name} (${biz.id})`);

      // Fetch in parallel — owned assets + client (agency-managed) assets
      const [ownedAdAccounts, clientAdAccounts, ownedPages, clientPages, pixels] = await Promise.all([
        metaGetAll(`/${biz.id}/owned_ad_accounts`, token, {
          fields: 'id,account_id,name,account_status,currency,timezone_name',
        }),
        metaGetAll(`/${biz.id}/client_ad_accounts`, token, {
          fields: 'id,account_id,name,account_status,currency,timezone_name',
        }).catch(e => { console.warn(`[hierarchy] Client ad accounts fetch failed for ${biz.id}:`, e.message); return []; }),
        metaGetAll(`/${biz.id}/owned_pages`, token, {
          fields: 'id,name,category,instagram_business_account{id,name,username}',
        }),
        metaGetAll(`/${biz.id}/client_pages`, token, {
          fields: 'id,name,category,instagram_business_account{id,name,username}',
        }).catch(e => { console.warn(`[hierarchy] Client pages fetch failed for ${biz.id}:`, e.message); return []; }),
        metaGetAll(`/${biz.id}/owned_pixels`, token, {
          fields: 'id,name',
        }),
      ]);

      // Merge ad accounts (deduplicate by account_id)
      const adAccountMap = new Map<string, AdAccount>();
      for (const acc of [...ownedAdAccounts, ...clientAdAccounts]) {
        if (!adAccountMap.has(acc.account_id)) adAccountMap.set(acc.account_id, acc);
      }
      const adAccounts = Array.from(adAccountMap.values());

      console.log(`  Ad accounts: ${adAccounts.length} (${ownedAdAccounts.length} owned + ${clientAdAccounts.length} client), Pages: ${ownedPages.length}+${clientPages.length}, Pixels: ${pixels.length}`);

      // Merge pages (deduplicate)
      const pageMap = new Map<string, PageInfo>();
      for (const p of [...ownedPages, ...clientPages]) {
        if (!pageMap.has(p.id)) pageMap.set(p.id, p);
      }
      const allPages = Array.from(pageMap.values());

      const portfolios = buildPortfolios(biz.id, biz.name, adAccounts, allPages, pixels);

      const groupPages: PageSummary[] = allPages.map(p => ({
        id: p.id,
        name: p.name,
        ig_account_id: p.instagram_business_account?.id || null,
        ig_account_name: p.instagram_business_account?.username || p.instagram_business_account?.name || null,
      }));

      if (portfolios.length > 0) {
        groups.push({
          business_id: biz.id,
          business_name: biz.name,
          portfolios,
          pages: groupPages,
        });
        allPortfolios.push(...portfolios);
      }
    }

    console.log(`Total portfolios: ${allPortfolios.length} across ${groups.length} businesses`);

    const result = {
      success: true,
      businesses: businesses.map((b: any) => ({ id: b.id, name: b.name })),
      groups,
      all_portfolios: allPortfolios,
    };
    setCache(connection_id, result);
    return c.json(result);
  } catch (error) {
    console.error('Hierarchy error:', error);
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
