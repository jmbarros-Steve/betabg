import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { safeQueryOrDefault } from '../../lib/safe-supabase.js';

export async function manageSources(c: Context) {
  const supabase = getSupabaseAdmin();
  const { action, ...data } = await c.req.json();

  switch (action) {
    case 'add': {
      const { name, source_type, url, check_interval_min } = data;
      if (!name || !source_type || !url) return c.json({ error: 'name, source_type, url required' }, 400);
      const { data: source, error } = await supabase.from('steve_sources').insert({
        name, source_type, url, check_interval_min: check_interval_min || 60,
      }).select().single();
      if (error) return c.json({ error: error.message }, 400);
      return c.json({ success: true, source });
    }
    case 'list': {
      const sources = await safeQueryOrDefault<any>(
        supabase.from('steve_sources').select('*').order('created_at', { ascending: false }),
        [],
        'manageSources.listSources',
      );
      return c.json({ sources });
    }
    case 'toggle': {
      const { id, enabled } = data;
      await supabase.from('steve_sources').update({ enabled }).eq('id', id);
      return c.json({ success: true });
    }
    case 'delete': {
      await supabase.from('steve_sources').delete().eq('id', data.id);
      return c.json({ success: true });
    }
    default:
      return c.json({ error: 'Unknown action' }, 400);
  }
}
