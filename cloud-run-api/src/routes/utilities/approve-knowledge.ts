import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

export async function approveKnowledge(c: Context) {
  const supabase = getSupabaseAdmin();
  const { action, ids } = await c.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array required' }, 400);
  }

  switch (action) {
    case 'approve':
      await supabase.from('steve_knowledge').update({ approval_status: 'approved', orden: 90 }).in('id', ids);
      return c.json({ success: true, approved: ids.length });
    case 'reject':
      await supabase.from('steve_knowledge').update({ approval_status: 'rejected', activo: false }).in('id', ids);
      return c.json({ success: true, rejected: ids.length });
    case 'list_pending': {
      const { data: pending } = await supabase
        .from('steve_knowledge')
        .select('id, titulo, contenido, categoria, source_url, created_at')
        .eq('approval_status', 'pending')
        .eq('activo', true)
        .order('created_at', { ascending: false })
        .limit(50);
      return c.json({ pending });
    }
    default:
      return c.json({ error: 'Unknown action' }, 400);
  }
}
