import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/** List connected seller calendars */
export async function sellersList(c: Context) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('seller_calendars')
      .select('id, user_id, seller_name, seller_email, is_active, working_hours_start, working_hours_end, slot_duration_minutes, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ sellers: data || [] });
  } catch (error: any) {
    return c.json({ error: error.message || 'Internal server error' }, 500);
  }
}
