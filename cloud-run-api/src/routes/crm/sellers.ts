import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { getUserClientIds } from '../../lib/user-scoping.js';

/** List connected seller calendars */
export async function sellersList(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Multi-tenant scoping
    const { isSuperAdmin } = await getUserClientIds(supabase, user.id);

    let query = supabase
      .from('seller_calendars')
      .select('id, user_id, seller_name, seller_email, is_active, working_hours_start, working_hours_end, slot_duration_minutes, created_at, updated_at')
      .order('created_at', { ascending: false });

    // Non-admin users only see their own seller calendars
    if (!isSuperAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ sellers: data || [] });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
