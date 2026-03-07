import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function checkMetaScopes(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    // Verify JWT
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

    // Fetch connection
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select(`
        id, platform, account_id, access_token_encrypted, client_id,
        clients!inner(user_id, client_user_id)
      `)
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) {
      return c.json({ error: 'Connection not found' }, 404);
    }

    // Verify ownership
    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    const isOwner = clientData.user_id === user.id || clientData.client_user_id === user.id;

    if (!isOwner) {
      return c.json({ error: 'Unauthorized' }, 403);
    }

    if (!connection.access_token_encrypted) {
      return c.json({ error: 'No access token', granted: [], missing_all: true }, 200);
    }

    // Decrypt token
    const { data: decryptedToken, error: decryptError } = await supabase
      .rpc('decrypt_platform_token', { encrypted_token: connection.access_token_encrypted });

    if (decryptError || !decryptedToken) {
      return c.json({ error: 'Failed to decrypt token', granted: [] }, 200);
    }

    // Check permissions via Meta Graph API
    const permUrl = `https://graph.facebook.com/v18.0/me/permissions?access_token=${encodeURIComponent(decryptedToken)}`;
    const permResponse = await fetch(permUrl);
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
