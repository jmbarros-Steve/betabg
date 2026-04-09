import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

/**
 * POST /api/whatsapp/mark-read
 * Bug #98 fix: Mark a conversation as read via backend (bypasses missing UPDATE RLS).
 * Auth: JWT (authMiddleware)
 *
 * Body: { conversation_id, client_id }
 */
export async function waMarkRead(c: Context) {
  try {
    const { conversation_id, client_id } = await c.req.json();

    if (!conversation_id || !client_id) {
      return c.json({ error: 'Missing conversation_id or client_id' }, 400);
    }

    const supabase = getSupabaseAdmin();

    // Verify authenticated user owns client_id (IDOR prevention)
    const user = c.get('user');
    if (user?.id) {
      const { isSuperAdmin, clientIds } = await getUserClientIds(supabase, user.id);
      if (!isSuperAdmin && !clientIds.includes(client_id)) {
        return c.json({ error: 'Forbidden: you do not own this client' }, 403);
      }
    }

    const { error } = await supabase
      .from('wa_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation_id)
      .eq('client_id', client_id); // Double-check ownership at DB level

    if (error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true });
  } catch (err: any) {
    console.error('[wa-mark-read] Error:', err);
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
}
