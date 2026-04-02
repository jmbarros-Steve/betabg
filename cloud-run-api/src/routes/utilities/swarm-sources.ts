import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * POST /api/swarm-sources
 * CRUD for swarm preferred sources (authors, channels, blogs, newsletters).
 * Body: { action: 'list' | 'create' | 'update' | 'delete', ...data }
 */
export async function swarmSources(c: Context) {
  const supabase = getSupabaseAdmin();
  const body = await c.req.json();
  const { action } = body;

  switch (action) {
    case 'list': {
      const { data, error } = await supabase
        .from('swarm_sources')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ sources: data });
    }

    case 'create': {
      const { name, url, category } = body;
      if (!name?.trim() || !url?.trim() || !category?.trim()) {
        return c.json({ error: 'name, url, and category are required' }, 400);
      }

      // Basic URL validation
      try {
        new URL(url);
      } catch {
        return c.json({ error: 'Invalid URL format' }, 400);
      }

      const { data, error } = await supabase
        .from('swarm_sources')
        .insert({ name: name.trim(), url: url.trim(), category: category.trim() })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ source: data });
    }

    case 'update': {
      const { id, ...updates } = body;
      if (!id) return c.json({ error: 'id is required' }, 400);

      // Only allow updating specific fields
      const allowed: Record<string, any> = {};
      if (typeof updates.active === 'boolean') allowed.active = updates.active;
      if (updates.category?.trim()) allowed.category = updates.category.trim();
      if (updates.name?.trim()) allowed.name = updates.name.trim();
      if (updates.url?.trim()) {
        try {
          new URL(updates.url);
          allowed.url = updates.url.trim();
        } catch {
          return c.json({ error: 'Invalid URL format' }, 400);
        }
      }

      if (Object.keys(allowed).length === 0) {
        return c.json({ error: 'No valid fields to update' }, 400);
      }

      const { data, error } = await supabase
        .from('swarm_sources')
        .update(allowed)
        .eq('id', id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ source: data });
    }

    case 'delete': {
      const { id } = body;
      if (!id) return c.json({ error: 'id is required' }, 400);

      const { error } = await supabase
        .from('swarm_sources')
        .delete()
        .eq('id', id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    default:
      return c.json({ error: 'Invalid action. Use: list, create, update, delete' }, 400);
  }
}
