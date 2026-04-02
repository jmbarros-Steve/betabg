import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { propagateKnowledge } from '../../lib/knowledge-propagator.js';

export async function approveKnowledge(c: Context) {
  const supabase = getSupabaseAdmin();
  const { action, ids } = await c.req.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array required' }, 400);
  }

  switch (action) {
    case 'approve': {
      await supabase.from('steve_knowledge').update({ approval_status: 'approved', orden: 90 }).in('id', ids);
      // Also approve siblings sharing the same insight_group_id
      const { data: rows } = await supabase.from('steve_knowledge').select('insight_group_id').in('id', ids);
      const groupIds = (rows || []).map((r: any) => r.insight_group_id).filter(Boolean);
      if (groupIds.length > 0) {
        await supabase.from('steve_knowledge')
          .update({ approval_status: 'approved', orden: 90 })
          .in('insight_group_id', groupIds)
          .eq('approval_status', 'pending');
      }
      const allIds = [...ids];
      if (groupIds.length > 0) {
        const { data: siblingRows } = await supabase.from('steve_knowledge').select('id').in('insight_group_id', groupIds);
        if (siblingRows) allIds.push(...siblingRows.map((r: any) => r.id));
      }
      propagateKnowledge([...new Set(allIds)]).catch(err => console.error('[approve] Propagation error:', err));
      return c.json({ success: true, approved: ids.length });
    }
    case 'reject': {
      await supabase.from('steve_knowledge').update({ approval_status: 'rejected', activo: false }).in('id', ids);
      // Also reject siblings sharing the same insight_group_id
      const { data: rejRows } = await supabase.from('steve_knowledge').select('insight_group_id').in('id', ids);
      const rejGroupIds = (rejRows || []).map((r: any) => r.insight_group_id).filter(Boolean);
      if (rejGroupIds.length > 0) {
        await supabase.from('steve_knowledge')
          .update({ approval_status: 'rejected', activo: false })
          .in('insight_group_id', rejGroupIds)
          .eq('approval_status', 'pending');
      }
      return c.json({ success: true, rejected: ids.length });
    }
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
