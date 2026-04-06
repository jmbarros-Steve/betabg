import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';

export async function checkMetaScopes(c: Context) {
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

    const body = await c.req.json();
    const { connection_id } = body;

    if (!connection_id) {
      return c.json({ error: 'Missing connection_id' }, 400);
    }

    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, client_id, connection_type,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

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

    // BM Partner: SUAT has fixed permissions, skip API check
    if ((connection as any).connection_type === 'bm_partner') {
      const bmPartnerScopes = [
        'ads_management', 'ads_read', 'business_management',
        'pages_read_engagement', 'pages_manage_ads', 'pages_manage_posts',
        'pages_show_list', 'instagram_basic', 'instagram_content_publish',
        'instagram_manage_insights', 'read_insights', 'public_profile',
      ];
      return c.json({ success: true, granted: bmPartnerScopes, declined: [] }, 200);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      return c.json({ error: 'Failed to resolve token', granted: [], missing_all: true }, 200);
    }

    // Check permissions via Meta Graph API (token in header, not URL)
    const permResponse = await fetch('https://graph.facebook.com/v21.0/me/permissions', {
      headers: { Authorization: `Bearer ${decryptedToken}` },
    });
    const permData: any = await permResponse.json();

    if (!permResponse.ok || !permData.data) {
      return c.json({
        error: 'Failed to check permissions',
        details: permData?.error?.message || 'Token may be expired',
        granted: [],
        token_expired: true,
      }, 200);
    }

    const granted = (permData.data as Array<{ permission: string; status: string }>)
      .filter((p) => p.status === 'granted')
      .map((p) => p.permission);

    const declined = (permData.data as Array<{ permission: string; status: string }>)
      .filter((p) => p.status === 'declined')
      .map((p) => p.permission);

    return c.json({ success: true, granted, declined }, 200);
  } catch (error) {
    console.error('[check-meta-scopes] Error:', error);
    return c.json(
      { error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' },
      500
    );
  }
}
