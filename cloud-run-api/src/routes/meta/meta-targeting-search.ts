import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

type SearchType = 'interests' | 'locations' | 'locales';

interface RequestBody {
  connection_id: string;
  search_type: SearchType;
  query: string;
  location_types?: string[]; // for locations: country, region, city, zip, geo_market, electoral_district
}

/**
 * Search Meta's targeting options: interests, behaviors, demographics, and geo locations.
 * Used by the campaign creation wizard for detailed targeting.
 */
export async function metaTargetingSearch(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    const body: RequestBody = await c.req.json();
    const { connection_id, search_type, query, location_types } = body;

    if (!connection_id || !search_type || !query) {
      return c.json({ error: 'Missing required fields: connection_id, search_type, query' }, 400);
    }

    const validSearchTypes: SearchType[] = ['interests', 'locations', 'locales'];
    if (!validSearchTypes.includes(search_type as SearchType)) {
      return c.json({ error: `Invalid search_type: "${search_type}". Valid types: ${validSearchTypes.join(', ')}` }, 400);
    }

    if (query.length < 2) {
      return c.json({ success: true, results: [] });
    }

    // Fetch connection details
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id,
        platform,
        account_id,
        access_token_encrypted,
        client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify user owns this connection OR is admin
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;
    if (!isOwner) {
      const { data: adminRole } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id)
        .in('role', ['admin', 'super_admin']).limit(1).maybeSingle();
      if (!adminRole) {
        return c.json({ error: 'Unauthorized' }, 403);
      }
    }

    if (!connection.access_token_encrypted || !connection.account_id) {
      return c.json({ error: 'Missing Meta credentials' }, 400);
    }

    // Decrypt access token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      console.error('[meta-targeting-search] Token decryption error:', decryptError);
      return c.json({ error: 'Failed to decrypt access token' }, 500);
    }

    const accountId = connection.account_id.replace(/^act_/, '');

    let results: any[] = [];

    if (search_type === 'interests') {
      // Search for interests, behaviors, and demographics
      const url = new URL(`${META_API_BASE}/act_${accountId}/targetingsearch`);
      
      url.searchParams.set('q', query);
      url.searchParams.set('type', 'adinterest');
      url.searchParams.set('limit', '15');

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${decryptedToken}` },
      });
      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        console.error('[meta-targeting-search] interests error:', response.status, errData);
        return c.json({ error: errData?.error?.message || 'Meta API error', results: [] }, 502);
      }
      const data: any = await response.json();

      if (data?.data) {
        results = data.data.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          audience_size_lower_bound: item.audience_size_lower_bound || item.audience_size || 0,
          audience_size_upper_bound: item.audience_size_upper_bound || item.audience_size || 0,
          path: item.path || [],
          description: item.description || '',
        }));
      }
    } else if (search_type === 'locations') {
      // Search for geo locations (countries, cities, regions)
      const url = new URL(`${META_API_BASE}/search`);
      
      url.searchParams.set('q', query);
      url.searchParams.set('type', 'adgeolocation');
      url.searchParams.set('limit', '15');
      if (location_types && location_types.length > 0) {
        url.searchParams.set('location_types', JSON.stringify(location_types));
      } else {
        url.searchParams.set('location_types', JSON.stringify(['country', 'region', 'city']));
      }

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${decryptedToken}` },
      });
      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        console.error('[meta-targeting-search] locations error:', response.status, errData);
        return c.json({ error: errData?.error?.message || 'Meta API error', results: [] }, 502);
      }
      const data: any = await response.json();

      if (data?.data) {
        results = data.data.map((item: any) => ({
          key: item.key,
          name: item.name,
          type: item.type,
          country_code: item.country_code || '',
          country_name: item.country_name || '',
          region: item.region || '',
          supports_city: item.supports_city || false,
          supports_region: item.supports_region || false,
        }));
      }
    }

    return c.json({ success: true, results });

  } catch (err: any) {
    console.error('[meta-targeting-search] Error:', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
}
