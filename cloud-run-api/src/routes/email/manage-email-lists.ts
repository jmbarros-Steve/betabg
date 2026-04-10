import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Manage email lists and segments.
 * POST /api/manage-email-lists
 * Auth: protected by authMiddleware at the router level (routes/index.ts).
 */
export async function manageEmailLists(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  const user = c.get('user');
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { data: ownerCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', client_id)
    .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
    .maybeSingle();
  if (!ownerCheck) return c.json({ error: 'No tienes acceso a este cliente' }, 403);

  switch (action) {
    case 'list': {
      const { data, error } = await supabase
        .from('email_lists')
        .select('*')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false });

      if (error) return c.json({ error: error.message }, 500);

      // For each list, get member count
      const listsWithCounts = await Promise.all(
        (data || []).map(async (list: any) => {
          if (list.type === 'static') {
            const { count } = await supabase
              .from('email_list_members')
              .select('*', { count: 'exact', head: true })
              .eq('list_id', list.id);
            return { ...list, subscriber_count: count || 0 };
          } else {
            // Segment: count matching subscribers dynamically
            let query = supabase
              .from('email_subscribers')
              .select('*', { count: 'exact', head: true })
              .eq('client_id', client_id)
              .eq('status', 'subscribed');

            const filters = list.filters || [];
            for (const filter of filters) {
              query = applyFilter(query, filter);
            }

            const { count } = await query;
            return { ...list, subscriber_count: count || 0 };
          }
        })
      );

      return c.json({ lists: listsWithCounts });
    }

    case 'create': {
      const { name, description, type = 'static', filters = [] } = body;
      if (!name) return c.json({ error: 'name is required' }, 400);

      const { data, error } = await supabase
        .from('email_lists')
        .insert({
          client_id,
          name,
          description: description || null,
          type,
          filters: type === 'segment' ? filters : [],
        })
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ list: data });
    }

    case 'update': {
      const { list_id, name, description, filters } = body;
      if (!list_id) return c.json({ error: 'list_id is required' }, 400);

      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (filters !== undefined) updates.filters = filters;

      const { data, error } = await supabase
        .from('email_lists')
        .update(updates)
        .eq('id', list_id)
        .eq('client_id', client_id)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ list: data });
    }

    case 'delete': {
      const { list_id } = body;
      if (!list_id) return c.json({ error: 'list_id is required' }, 400);

      const { error } = await supabase
        .from('email_lists')
        .delete()
        .eq('id', list_id)
        .eq('client_id', client_id);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    case 'add_members': {
      const { list_id, subscriber_ids } = body;
      if (!list_id || !subscriber_ids?.length) {
        return c.json({ error: 'list_id and subscriber_ids are required' }, 400);
      }

      const { data: listCheck } = await supabase
        .from('email_lists')
        .select('id')
        .eq('id', list_id)
        .eq('client_id', client_id)
        .maybeSingle();
      if (!listCheck) return c.json({ error: 'List not found or does not belong to this client' }, 403);

      const { count: validCount } = await supabase
        .from('email_subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .in('id', subscriber_ids);
      if (validCount !== subscriber_ids.length) {
        return c.json({ error: 'Some subscriber_ids do not belong to this client' }, 403);
      }

      const rows = subscriber_ids.map((sid: string) => ({
        list_id,
        subscriber_id: sid,
      }));

      const { error } = await supabase
        .from('email_list_members')
        .upsert(rows, { onConflict: 'list_id,subscriber_id', ignoreDuplicates: true });

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true, added: subscriber_ids.length });
    }

    case 'remove_members': {
      const { list_id, subscriber_ids } = body;
      if (!list_id || !subscriber_ids?.length) {
        return c.json({ error: 'list_id and subscriber_ids are required' }, 400);
      }

      const { error } = await supabase
        .from('email_list_members')
        .delete()
        .eq('list_id', list_id)
        .in('subscriber_id', subscriber_ids);

      if (error) return c.json({ error: error.message }, 500);
      return c.json({ success: true });
    }

    case 'get_members': {
      const { list_id, limit = 50, offset = 0 } = body;
      if (!list_id) return c.json({ error: 'list_id is required' }, 400);

      const { data, error, count } = await supabase
        .from('email_list_members')
        .select(`
          id, added_at,
          email_subscribers!inner(id, email, first_name, last_name, status, source)
        `, { count: 'exact' })
        .eq('list_id', list_id)
        .order('added_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return c.json({ error: error.message }, 500);

      const members = (data || []).map((m: any) => ({
        member_id: m.id,
        added_at: m.added_at,
        ...m.email_subscribers,
      }));

      return c.json({ members, total: count });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

function resolveValue(value: any): any {
  if (typeof value !== 'string') return value;
  // Handle relative dates like "relative:30d", "relative:90d"
  const relMatch = value.match(/^relative:(\d+)d$/);
  if (relMatch) {
    const days = parseInt(relMatch[1], 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  // Legacy format: "30_days_ago", "90_days_ago"
  const legacyMatch = value.match(/^(\d+)_days_ago$/);
  if (legacyMatch) {
    const days = parseInt(legacyMatch[1], 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  return value;
}

function applyFilter(query: any, filter: { field: string; operator: string; value: any }) {
  const { field, operator } = filter;
  let value = resolveValue(filter.value);
  const allowedFields = [
    'email', 'first_name', 'last_name', 'status', 'source',
    'total_orders', 'total_spent', 'last_order_at', 'subscribed_at',
    'created_at', 'tags',
  ];
  if (!allowedFields.includes(field)) return query;

  // Numeric conversion for integer/numeric columns
  const numericFields = ['total_orders', 'total_spent'];
  if (numericFields.includes(field) && value != null && operator !== 'is_null' && operator !== 'not_null') {
    value = Number(value);
  }

  switch (operator) {
    case 'eq': case '=': case '==': return query.eq(field, value);
    case 'neq': case '!=': return query.neq(field, value);
    case 'gt': case '>': return query.gt(field, value);
    case 'gte': case '>=': return query.gte(field, value);
    case 'lt': case '<': return query.lt(field, value);
    case 'lte': case '<=': return query.lte(field, value);
    case 'like': return query.ilike(field, `%${value}%`);
    case 'is_null': return query.is(field, null);
    case 'not_null': return query.not(field, 'is', null);
    default: return query;
  }
}
