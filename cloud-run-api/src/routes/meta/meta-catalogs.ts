import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v23.0';

export async function metaCatalogs(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // User already validated by authMiddleware
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
        id, platform, account_id, access_token_encrypted, connection_type, client_id,
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

    const catalogsUrl = new URL(`${META_API_BASE}/act_${accountId}/product_catalogs`);
    catalogsUrl.searchParams.set('fields', 'id,name,product_count');
    catalogsUrl.searchParams.set('limit', '50');

    const catalogsRes = await fetch(catalogsUrl.toString(), {
      headers: { Authorization: `Bearer ${decryptedToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    let catalogsData: any;
    try { catalogsData = await catalogsRes.json(); }
    catch { return c.json({ error: `Non-JSON response from Meta (HTTP ${catalogsRes.status})` }, 502); }

    if (!catalogsRes.ok) {
      const errCode = catalogsData?.error?.code;
      const msg = catalogsData?.error?.message || 'Failed to fetch catalogs';
      // If the account doesn't support catalogs, return empty array instead of error
      if (errCode === 100 || errCode === 200 || msg.includes('does not exist') || msg.includes('not supported')) {
        return c.json({ catalogs: [] });
      }
      console.error('[meta-catalogs] Error fetching catalogs:', msg);
      return c.json({ error: msg }, 502);
    }

    const catalogs = catalogsData?.data || [];

    const catalogsWithSets = await Promise.all(
      catalogs.map(async (catalog: any) => {
        try {
          const setsUrl = new URL(`${META_API_BASE}/${catalog.id}/product_sets`);
          setsUrl.searchParams.set('fields', 'id,name,product_count');
          setsUrl.searchParams.set('limit', '100');

          const setsRes = await fetch(setsUrl.toString(), {
            headers: { Authorization: `Bearer ${decryptedToken}` },
            signal: AbortSignal.timeout(15_000),
          });
          let setsData: any;
          try { setsData = await setsRes.json(); } catch { setsData = {}; }

          return {
            ...catalog,
            product_sets: setsRes.ok ? (setsData?.data || []) : [],
          };
        } catch {
          return { ...catalog, product_sets: [] };
        }
      })
    );

    return c.json({ catalogs: catalogsWithSets });
  } catch (err: any) {
    console.error('[meta-catalogs] Unexpected error:', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
}
