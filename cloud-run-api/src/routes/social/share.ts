// POST /api/social/share — Track a share event and increment share_count
import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function socialShare(c: Context) {
  try {
    const body = await c.req.json();
    const { post_id } = body;

    if (!post_id || !UUID_REGEX.test(post_id)) {
      return c.json({ error: 'post_id inválido' }, 400);
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.rpc('increment_share_count', { post_uuid: post_id });

    if (error) {
      console.error('[social-share] Error:', error);
      return c.json({ error: 'Error al registrar share' }, 500);
    }

    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[social-share] Error:', err);
    return c.json({ error: message }, 500);
  }
}
