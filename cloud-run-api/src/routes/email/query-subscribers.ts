import { Context } from 'hono';
import { getSupabaseAdmin } from '../../lib/supabase.js';

/**
 * Query subscribers with filters and segmentation.
 * POST /api/query-email-subscribers
 */
export async function queryEmailSubscribers(c: Context) {
  const body = await c.req.json();
  const { action, client_id } = body;

  if (!client_id) return c.json({ error: 'client_id is required' }, 400);

  const supabase = getSupabaseAdmin();

  switch (action) {
    case 'list': {
      const {
        limit = 50,
        offset = 0,
        search,
        status,
        source,
        tags,
        sort_by = 'created_at',
        sort_order = 'desc',
      } = body;

      let query = supabase
        .from('email_subscribers')
        .select('*', { count: 'exact' })
        .eq('client_id', client_id)
        .order(sort_by, { ascending: sort_order === 'asc' })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);
      if (source) query = query.eq('source', source);
      if (search) {
        query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
      }
      if (tags && tags.length > 0) query = query.overlaps('tags', tags);

      const { data, error, count } = await query;
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ subscribers: data, total: count });
    }

    case 'segment': {
      // Advanced segmentation query
      const { filters, count_only = false } = body;

      let query = supabase
        .from('email_subscribers')
        .select(count_only ? '*' : 'id, email, first_name, last_name, status, tags, total_orders, total_spent, last_order_at, source, created_at',
          { count: 'exact', ...(count_only ? { head: true } : {}) })
        .eq('client_id', client_id)
        .eq('status', 'subscribed');

      // Apply segment filters
      if (filters && Array.isArray(filters)) {
        for (const filter of filters) {
          query = applyFilter(query, filter);
        }
      }

      if (!count_only) {
        query = query.order('created_at', { ascending: false }).limit(1000);
      }

      const { data, error, count } = await query;
      if (error) return c.json({ error: error.message }, 500);

      return c.json({
        subscribers: count_only ? [] : data,
        total: count,
      });
    }

    case 'get': {
      const { subscriber_id } = body;
      if (!subscriber_id) return c.json({ error: 'subscriber_id is required' }, 400);

      const { data: subscriber, error } = await supabase
        .from('email_subscribers')
        .select('*')
        .eq('id', subscriber_id)
        .eq('client_id', client_id)
        .single();

      if (error) return c.json({ error: error.message }, 500);

      // Get recent events for this subscriber
      const { data: events } = await supabase
        .from('email_events')
        .select('event_type, campaign_id, flow_id, metadata, created_at')
        .eq('subscriber_id', subscriber_id)
        .order('created_at', { ascending: false })
        .limit(50);

      return c.json({ subscriber, events: events || [] });
    }

    case 'export': {
      // Export subscribers as JSON (CSV can be built client-side)
      const { filters } = body;

      let query = supabase
        .from('email_subscribers')
        .select('email, first_name, last_name, status, source, tags, total_orders, total_spent, last_order_at, subscribed_at')
        .eq('client_id', client_id)
        .order('email', { ascending: true });

      if (filters && Array.isArray(filters)) {
        for (const filter of filters) {
          query = applyFilter(query, filter);
        }
      }

      const { data, error } = await query;
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ subscribers: data, count: data?.length || 0 });
    }

    default:
      return c.json({ error: `Unknown action: ${action}` }, 400);
  }
}

/**
 * Resolve relative date values like "relative:30d" or "90_days_ago" to ISO strings.
 */
function resolveValue(value: any): any {
  if (typeof value !== 'string') return value;
  const relMatch = value.match(/^relative:(\d+)d$/);
  if (relMatch) {
    const days = parseInt(relMatch[1], 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  const legacyMatch = value.match(/^(\d+)_days_ago$/);
  if (legacyMatch) {
    const days = parseInt(legacyMatch[1], 10);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }
  return value;
}

/**
 * Apply a single filter condition to a Supabase query.
 */
function applyFilter(query: any, filter: { field: string; operator: string; value: any }) {
  const { field, operator } = filter;
  let value = resolveValue(filter.value);

  // Validate field names to prevent injection
  const allowedFields = [
    'email', 'first_name', 'last_name', 'status', 'source',
    'total_orders', 'total_spent', 'last_order_at', 'subscribed_at',
    'created_at', 'tags', 'shopify_customer_id',
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
    case 'in': return query.in(field, Array.isArray(value) ? value : [value]);
    case 'contains': return query.contains(field, Array.isArray(value) ? value : [value]);
    case 'overlaps': return query.overlaps(field, Array.isArray(value) ? value : [value]);
    case 'is_null': return query.is(field, null);
    case 'not_null': return query.not(field, 'is', null);
    default: return query;
  }
}
