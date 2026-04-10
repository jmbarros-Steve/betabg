import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * POST /api/check-client-connections
 * Returns active platform connections for a client.
 * Uses service role (bypasses RLS) so it works regardless of who is logged in.
 * Body: { client_id: string }
 */
export async function checkClientConnections(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const { client_id } = await c.req.json();

    if (!client_id) {
      return c.json({ error: 'client_id required' }, 400);
    }

    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const { data: ownerCheck } = await supabase
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
      .maybeSingle();
    if (!ownerCheck) return c.json({ error: 'No tienes acceso a este cliente' }, 403);

    const { data: connections, error } = await supabase
      .from('platform_connections')
      .select('id, platform, is_active')
      .eq('client_id', client_id)
      .eq('is_active', true);

    if (error) {
      console.error('[check-client-connections] Error:', error);
      return c.json({ error: 'Failed to check connections' }, 500);
    }

    const platforms = (connections || []).map((c: any) => c.platform);

    return c.json({
      connected: platforms.length > 0,
      platforms,
      count: platforms.length,
    });
  } catch (error: any) {
    console.error('[check-client-connections] Error:', error);
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
