import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

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

async function metaGet(endpoint: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${META_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    console.error(`[discover-assets] Meta API error on ${endpoint}:`, err);
    return null;
  }
  return res.json();
}

/**
 * Discover assets shared with Steve's BM via BM Partner.
 * Uses SUAT (META_SYSTEM_TOKEN) to enumerate client_ad_accounts, client_pages, owned_pixels.
 *
 * POST /api/discover-client-assets
 * Body: { client_id? } (optional filter)
 * Auth: JWT (admin only)
 */
export async function discoverClientAssets(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Auth — admin only
    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Missing authorization' }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return c.json({ error: 'Invalid token' }, 401);

    const adminRole = await safeQuerySingleOrDefault<any>(
      supabase
        .from('user_roles').select('role').eq('user_id', user.id)
        .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
      null,
      'discoverClientAssets.getAdminRole',
    );
    if (!adminRole) return c.json({ error: 'Admin only' }, 403);

    const suat = process.env.META_SYSTEM_TOKEN;
    const steveBmId = process.env.STEVE_BM_ID;

    if (!suat || !steveBmId) {
      return c.json({ error: 'META_SYSTEM_TOKEN or STEVE_BM_ID not configured' }, 500);
    }

    // Fetch client ad accounts shared with Steve's BM
    const adAccountsRes = await metaGet(
      `/${steveBmId}/client_ad_accounts`,
      suat,
      { fields: 'id,account_id,name,account_status,currency,timezone_name', limit: '200' },
    );

    // Fetch client pages shared with Steve's BM
    const pagesRes = await metaGet(
      `/${steveBmId}/client_pages`,
      suat,
      { fields: 'id,name,category,instagram_business_account{id,name,username}', limit: '200' },
    );

    // Fetch pixels owned by Steve's BM
    const pixelsRes = await metaGet(
      `/${steveBmId}/owned_pixels`,
      suat,
      { fields: 'id,name', limit: '200' },
    );

    const adAccounts = adAccountsRes?.data || [];
    const pages = pagesRes?.data || [];
    const pixels = pixelsRes?.data || [];

    console.log(`[discover-assets] Found: ${adAccounts.length} ad accounts, ${pages.length} pages, ${pixels.length} pixels`);

    // Build portfolios in same format as fetch-meta-business-hierarchy
    const activeAccounts = adAccounts.filter((a: any) => a.account_status === 1);

    const portfolios: Portfolio[] = activeAccounts.map((acc: any) => {
      // Simple assignment: if 1 page, assign to all; otherwise try name matching
      let bestPage: any = null;
      if (pages.length === 1) {
        bestPage = pages[0];
      } else if (pages.length > 1) {
        const accNameLower = (acc.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const page of pages) {
          const pageNameLower = (page.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (accNameLower.includes(pageNameLower) || pageNameLower.includes(accNameLower)) {
            bestPage = page;
            break;
          }
        }
        if (!bestPage) bestPage = pages[0]; // fallback to first
      }

      const bestPixel = pixels.length > 0 ? pixels[0] : null;

      return {
        name: acc.name,
        business_id: steveBmId,
        business_name: 'Steve Ads BM',
        ad_account_id: acc.account_id,
        ad_account_name: acc.name,
        currency: acc.currency || 'USD',
        timezone: acc.timezone_name || 'America/Santiago',
        page_id: bestPage?.id || null,
        page_name: bestPage?.name || null,
        ig_account_id: bestPage?.instagram_business_account?.id || null,
        ig_account_name: bestPage?.instagram_business_account?.username || bestPage?.instagram_business_account?.name || null,
        pixel_id: bestPixel?.id || null,
      };
    });

    return c.json({
      success: true,
      ad_accounts: adAccounts,
      pages,
      pixels,
      portfolios,
    });
  } catch (error) {
    console.error('[discover-assets] Error:', error);
    return c.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      500,
    );
  }
}

/**
 * Internal function (no HTTP) to discover assets for a specific client.
 * Used by leadsie-webhook to auto-create connections.
 */
export async function discoverAssetsInternal(suat: string, steveBmId: string) {
  const adAccountsRes = await metaGet(
    `/${steveBmId}/client_ad_accounts`,
    suat,
    { fields: 'id,account_id,name,account_status,currency,timezone_name', limit: '200' },
  );

  const pagesRes = await metaGet(
    `/${steveBmId}/client_pages`,
    suat,
    { fields: 'id,name,category,instagram_business_account{id,name,username}', limit: '200' },
  );

  const pixelsRes = await metaGet(
    `/${steveBmId}/owned_pixels`,
    suat,
    { fields: 'id,name', limit: '200' },
  );

  return {
    adAccounts: (adAccountsRes?.data || []).filter((a: any) => a.account_status === 1),
    pages: pagesRes?.data || [],
    pixels: pixelsRes?.data || [],
  };
}
