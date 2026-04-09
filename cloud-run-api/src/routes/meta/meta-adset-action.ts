import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getTokenForConnection } from '../../lib/resolve-meta-token.js';
import { safeQuerySingleOrDefault } from '../../lib/safe-supabase.js';

const META_API_BASE = 'https://graph.facebook.com/v21.0';

type AdSetAction = 'pause' | 'resume';

interface RequestBody {
  action: AdSetAction;
  connection_id: string;
  adset_id: string;
}

export async function metaAdsetAction(c: Context) {
  try {
    const supabase = getSupabaseAdmin();

    const authHeader = c.req.header('Authorization');
    if (!authHeader) return c.json({ error: 'Missing authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Invalid token' }, 401);

    const body: RequestBody = await c.req.json();
    const { action, connection_id, adset_id } = body;

    if (!action || !['pause', 'resume'].includes(action)) {
      return c.json({ error: 'action must be "pause" or "resume"' }, 400);
    }
    if (!connection_id) return c.json({ error: 'connection_id required' }, 400);
    if (!adset_id) return c.json({ error: 'adset_id required' }, 400);

    // Fetch connection and verify ownership
    const { data: connection, error: connError } = await supabase
      .from('platform_connections')
      .select('id, platform, access_token_encrypted, connection_type, client_id, clients!inner(user_id, client_user_id)')
      .eq('id', connection_id)
      .eq('platform', 'meta')
      .single();

    if (connError || !connection) return c.json({ error: 'Connection not found' }, 404);

    const clientData = connection.clients as unknown as { user_id: string; client_user_id: string | null };
    // Check ownership — allow both client owner and admin
    const profile = await safeQuerySingleOrDefault<any>(
      supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
      null,
      'metaAdsetAction.getProfile',
    );
    const isAdmin = profile?.is_super_admin === true;
    if (!isAdmin && clientData.user_id !== user.id && clientData.client_user_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const decryptedToken = await getTokenForConnection(supabase, connection);
    if (!decryptedToken) {
      console.error('[meta-adset-action] Failed to resolve token for connection', connection_id);
      return c.json({ error: 'Failed to resolve Meta token' }, 500);
    }

    // Call Meta API to update ad set status
    const newStatus = action === 'pause' ? 'PAUSED' : 'ACTIVE';
    console.log(`[meta-adset-action] ${action} adset ${adset_id}`);

    const response = await fetch(`${META_API_BASE}/${adset_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${decryptedToken}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[meta-adset-action] Meta API error:`, response.status, errText.slice(0, 300));
      return c.json({ error: 'Failed to update ad set status', details: errText.slice(0, 200) }, 502);
    }

    return c.json({ success: true, adset_id, status: newStatus });
  } catch (err: any) {
    console.error('[meta-adset-action] Error:', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
}
