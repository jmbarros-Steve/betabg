import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

type CatalogRow = {
  id: string;
  name: string;
  product_count?: number;
  source: 'ad_account' | 'owned' | 'client';
  product_sets?: any[];
};

async function fetchJson(url: string, token: string, timeoutMs = 15_000) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data };
}

async function fetchProductSets(catalogId: string, token: string): Promise<any[]> {
  const url = new URL(`${META_API_BASE}/${catalogId}/product_sets`);
  url.searchParams.set('fields', 'id,name,product_count');
  url.searchParams.set('limit', '100');
  const { ok, data } = await fetchJson(url.toString(), token);
  return ok ? (data?.data || []) : [];
}

async function dedupeAndHydrate(catalogs: CatalogRow[], token: string): Promise<CatalogRow[]> {
  const byId = new Map<string, CatalogRow>();
  for (const c of catalogs) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  return Promise.all(
    Array.from(byId.values()).map(async (c) => ({
      ...c,
      product_sets: await fetchProductSets(c.id, token),
    })),
  );
}

export async function metaCatalogs(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { connection_id } = body;

    if (!connection_id) {
      return c.json({ error: 'Missing connection_id' }, 400);
    }

    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, connection_type, client_id, business_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .maybeSingle();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      const adminRole = await safeQuerySingleOrDefault<any>(
        supabase
          .from('user_roles').select('role').eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']).limit(1).maybeSingle(),
        null,
        'metaCatalogs.getAdminRole',
      );
      if (!adminRole) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.account_id) {
      return c.json({ error: 'Missing Meta account ID' }, 400);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      return c.json({ error: 'Failed to resolve access token' }, 500);
    }

    const accountId = connection.account_id.replace(/^act_/, '');

    // Step 1: resolve the ad account's owning business. We need this to fall
    // back to BM-level catalogs when nothing is assigned directly to the
    // account. Stored business_id may be stale / "personal" — trust Meta.
    let bmId: string | null = null;
    try {
      const acctRes = await fetchJson(
        `${META_API_BASE}/act_${accountId}?fields=business`,
        decryptedToken,
      );
      if (acctRes.ok) {
        bmId = acctRes.data?.business?.id || null;
      }
    } catch { /* non-fatal */ }

    // Step 2: catalogs directly assigned to this ad account.
    const adAccountUrl = new URL(`${META_API_BASE}/act_${accountId}/product_catalogs`);
    adAccountUrl.searchParams.set('fields', 'id,name,product_count');
    adAccountUrl.searchParams.set('limit', '50');

    const adAccountRes = await fetchJson(adAccountUrl.toString(), decryptedToken);

    const collected: CatalogRow[] = [];
    const diagnostics: any = {
      ad_account_catalogs: 0,
      owned_catalogs: 0,
      client_catalogs: 0,
      bm_id: bmId,
      errors: [] as string[],
    };

    if (adAccountRes.ok) {
      const items = adAccountRes.data?.data || [];
      diagnostics.ad_account_catalogs = items.length;
      for (const it of items) {
        collected.push({ id: it.id, name: it.name, product_count: it.product_count, source: 'ad_account' });
      }
    } else {
      const errMsg = adAccountRes.data?.error?.message || `HTTP ${adAccountRes.status}`;
      diagnostics.errors.push(`ad_account: ${errMsg}`);
      console.warn('[meta-catalogs] ad_account catalogs failed:', errMsg);
    }

    // Step 3: fallback to BM-level catalogs (owned + client-shared). Only call
    // if we have a business_id — SUAT connections where `business_id` is
    // "personal" or null cannot list BM-level catalogs safely.
    if (bmId) {
      const ownedUrl = new URL(`${META_API_BASE}/${bmId}/owned_product_catalogs`);
      ownedUrl.searchParams.set('fields', 'id,name,product_count');
      ownedUrl.searchParams.set('limit', '50');
      const ownedRes = await fetchJson(ownedUrl.toString(), decryptedToken);
      if (ownedRes.ok) {
        const items = ownedRes.data?.data || [];
        diagnostics.owned_catalogs = items.length;
        for (const it of items) {
          collected.push({ id: it.id, name: it.name, product_count: it.product_count, source: 'owned' });
        }
      } else {
        const errMsg = ownedRes.data?.error?.message || `HTTP ${ownedRes.status}`;
        diagnostics.errors.push(`owned: ${errMsg}`);
      }

      const clientUrl = new URL(`${META_API_BASE}/${bmId}/client_product_catalogs`);
      clientUrl.searchParams.set('fields', 'id,name,product_count');
      clientUrl.searchParams.set('limit', '50');
      const clientRes = await fetchJson(clientUrl.toString(), decryptedToken);
      if (clientRes.ok) {
        const items = clientRes.data?.data || [];
        diagnostics.client_catalogs = items.length;
        for (const it of items) {
          collected.push({ id: it.id, name: it.name, product_count: it.product_count, source: 'client' });
        }
      } else {
        const errMsg = clientRes.data?.error?.message || `HTTP ${clientRes.status}`;
        diagnostics.errors.push(`client: ${errMsg}`);
      }
    }

    const hydrated = await dedupeAndHydrate(collected, decryptedToken);

    // Helpful diagnostic message when we found catalogs at the BM level but
    // none are assigned to the ad account — that's a Business Settings
    // problem the user needs to fix manually, not a bug in our side.
    let hint: string | null = null;
    if (diagnostics.ad_account_catalogs === 0 && hydrated.length > 0) {
      hint = 'Encontramos catálogos en el Business Manager pero ninguno está asignado a esta cuenta publicitaria. Asígnalo desde Business Settings → Cuentas publicitarias → Catálogos.';
    } else if (hydrated.length === 0 && diagnostics.errors.length > 0) {
      const hasPermError = diagnostics.errors.some((e: string) =>
        /permission|access|scope|catalog_management/i.test(e)
      );
      hint = hasPermError
        ? 'Falta el permiso catalog_management en la conexión de Meta. Contacta a soporte para reautorizar.'
        : 'No encontramos catálogos accesibles con esta conexión.';
    }

    return c.json({ catalogs: hydrated, diagnostics, hint });
  } catch (err: any) {
    console.error('[meta-catalogs] Unexpected error:', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
}
